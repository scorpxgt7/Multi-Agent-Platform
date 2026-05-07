import json
import time
import uuid

import httpx

from shared.utils.config import load_settings


def require_ok(response, message):
    if response.status_code >= 400:
        raise RuntimeError(f"{message}: {response.status_code} {response.text}")
    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError(f"{message}: invalid payload {payload}")
    return payload


def wait_for_json(client: httpx.Client, url: str, message: str, attempts: int = 20, delay: float = 2.0):
    last_error = None
    for _ in range(attempts):
        try:
            response = client.get(url)
            return require_ok(response, message)
        except Exception as error:  # pragma: no cover - integration-only retry path
            last_error = error
            time.sleep(delay)
    raise RuntimeError(str(last_error) if last_error else message)


def main():
    settings = load_settings("validation-runner", 0)
    gateway_url = settings.__dict__.get("gateway_url") or "http://api-gateway:8080"
    with httpx.Client(timeout=20.0) as client:
        wait_for_json(client, "http://skill-service:8101/health", "skill-service health failed")
        wait_for_json(client, "http://agent-service:8102/health", "agent-service health failed")
        wait_for_json(client, "http://policy-service:8103/health", "policy-service health failed")
        wait_for_json(client, "http://memory-service:8104/health", "memory-service health failed")
        wait_for_json(client, "http://orchestrator-service:8105/health", "orchestrator-service health failed")
        skills = wait_for_json(client, "http://skill-service:8101/v1/skills", "skill-service list failed")
        skill = next((item for item in skills["skills"] if item["slug"] == "finance-approval-skill"), None)
        if skill is None:
            raise RuntimeError("finance validation skill not found")

        teams = wait_for_json(client, "http://agent-service:8102/v1/teams", "team listing failed")
        team = next((item for item in teams["teams"] if item["name"] == "Head Admin Team"), None)
        if team is None:
            raise RuntimeError("validation team not found")

        policy_name_prefix = f"phase8-validation-{uuid.uuid4().hex[:8]}"

        delegation_policy_payload = {
            "name": f"{policy_name_prefix}-delegation",
            "scope": "global",
            "effect": "deny",
            "approval_threshold": 0.75,
            "conditions": {
                "execution_modes": ["delegation"],
                "context_tags": ["block-delegation"],
                "subsystems": ["admin"],
            },
            "restrictions": {
                "delegation_targets": ["finance-agent"],
                "requires_approval": False,
            },
        }
        delegation_policy = require_ok(client.post(f"{gateway_url}/v1/policies", json=delegation_policy_payload), "delegation policy creation failed")

        updated_delegation_policy_payload = dict(delegation_policy_payload)
        updated_delegation_policy_payload["approval_threshold"] = 0.66
        require_ok(
            client.put(
                f"{gateway_url}/v1/policies/{delegation_policy['policy']['id']}",
                json=updated_delegation_policy_payload,
            ),
            "delegation policy update failed",
        )

        skill_policy_payload = {
            "name": f"{policy_name_prefix}-skill",
            "scope": "global",
            "effect": "deny",
            "approval_threshold": 0.75,
            "conditions": {
                "execution_modes": ["skill_execution"],
                "context_tags": ["block-skill"],
                "subsystems": ["admin"],
            },
            "restrictions": {
                "skill_ids": [skill["id"]],
                "requires_approval": False,
            },
        }
        skill_policy = require_ok(client.post(f"{gateway_url}/v1/policies", json=skill_policy_payload), "skill policy creation failed")
        policy_list = require_ok(client.get(f"{gateway_url}/v1/policies"), "policy list failed")
        if not any(item["id"] == delegation_policy["policy"]["id"] for item in policy_list["policies"]):
            raise RuntimeError("delegation policy did not appear in list endpoint")
        if not any(item["id"] == skill_policy["policy"]["id"] for item in policy_list["policies"]):
            raise RuntimeError("skill policy did not appear in list endpoint")

        task_payload = {
            "team_id": team["id"],
            "task": "Review Q3 operating budget variance and recommend approval status.",
            "actor_id": "head-admin",
            "subsystem": "admin",
            "context": {
                "skill_id": skill["id"],
                "role_id": team.get("role_id"),
                "default_skill_id": skill["id"],
            },
        }

        result = require_ok(client.post(f"{gateway_url}/v1/tasks", json=task_payload), "orchestration flow failed")
        request_id = result.get("request_id")
        state = result.get("state", {})
        final_result = result.get("result", {})
        finance_result = state.get("finance_result", {})
        skill_result = finance_result.get("skill_result", {})

        if state.get("short_term_memory", [{}])[0].get("from") != "head-admin":
            raise RuntimeError("head-admin memory state was not propagated")
        if skill_result.get("ok") is not True:
            raise RuntimeError("finance agent did not receive a successful skill execution response")
        if final_result.get("finance_result", {}).get("skill_result", {}).get("result", {}).get("skill_id") != skill["id"]:
            raise RuntimeError("final state did not carry the executed skill result")
        if not request_id:
            raise RuntimeError("orchestration response did not include request_id")

        execution_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{request_id}"), "execution detail lookup failed")
        execution_status = require_ok(client.get(f"{gateway_url}/v1/executions/{request_id}/status"), "execution status lookup failed")
        execution_history = require_ok(client.get(f"{gateway_url}/v1/executions"), "execution history lookup failed")
        if not execution_detail.get("execution", {}).get("delegation_chain"):
            raise RuntimeError("delegation chain was not recorded in execution detail")
        if execution_status.get("status", {}).get("latest_status") not in {"completed", "awaiting_approval"}:
            raise RuntimeError("live execution status did not reflect final orchestration state")
        if not any(item.get("request_id") == request_id for item in execution_history.get("executions", [])):
            raise RuntimeError("execution history did not include the latest request")
        if not any(event.get("event_type") == "skill.executed" for event in execution_detail.get("events", [])):
            raise RuntimeError("execution events did not capture skill execution")

        blocked_delegation_payload = {
            "team_id": team["id"],
            "task": "Blocked delegation validation.",
            "actor_id": "head-admin",
            "subsystem": "admin",
            "context": {
                "skill_id": skill["id"],
                "role_id": team.get("role_id"),
                "default_skill_id": skill["id"],
                "validation_case": "block-delegation",
            },
        }
        blocked_delegation_result = require_ok(client.post(f"{gateway_url}/v1/tasks", json=blocked_delegation_payload), "blocked delegation flow failed")
        blocked_delegation_request_id = blocked_delegation_result.get("request_id")
        blocked_delegation_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{blocked_delegation_request_id}"), "blocked delegation execution detail failed")
        if blocked_delegation_result.get("result", {}).get("status") != "failed":
            raise RuntimeError("unauthorized delegation was not blocked")
        if not any(event.get("event_type") == "policy.violation" for event in blocked_delegation_detail.get("events", [])):
            raise RuntimeError("blocked delegation did not emit a policy violation event")

        blocked_skill_payload = {
            "team_id": team["id"],
            "task": "Blocked skill validation.",
            "actor_id": "head-admin",
            "subsystem": "admin",
            "context": {
                "skill_id": skill["id"],
                "role_id": team.get("role_id"),
                "default_skill_id": skill["id"],
                "validation_case": "block-skill",
            },
        }
        blocked_skill_result = require_ok(client.post(f"{gateway_url}/v1/tasks", json=blocked_skill_payload), "blocked skill flow failed")
        blocked_skill_request_id = blocked_skill_result.get("request_id")
        blocked_skill_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{blocked_skill_request_id}"), "blocked skill execution detail failed")
        if blocked_skill_result.get("result", {}).get("status") != "failed":
            raise RuntimeError("unauthorized skill execution was not blocked")
        if not any(event.get("event_type") == "policy.violation" for event in blocked_skill_detail.get("events", [])):
            raise RuntimeError("blocked skill execution did not emit a policy violation event")

        print(json.dumps({
            "ok": True,
            "request_id": request_id,
            "team_id": team["id"],
            "skill_id": skill["id"],
            "final_status": final_result.get("status"),
            "delegation": finance_result.get("decision"),
            "skill_summary": skill_result.get("result", {}).get("output", {}).get("summary"),
            "blocked_delegation_request_id": blocked_delegation_request_id,
            "blocked_skill_request_id": blocked_skill_request_id,
        }))


if __name__ == "__main__":
    main()
