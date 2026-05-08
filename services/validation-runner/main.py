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
        except Exception as error:  # pragma: no cover
            last_error = error
            time.sleep(delay)
    raise RuntimeError(str(last_error) if last_error else message)


def auth_headers(api_key: str):
    return {"X-Api-Key": api_key}


def main():
    settings = load_settings("validation-runner", 0)
    gateway_url = settings.__dict__.get("gateway_url") or "http://api-gateway:8080"
    suffix = uuid.uuid4().hex[:8]

    with httpx.Client(timeout=25.0) as client:
        wait_for_json(client, "http://skill-service:8101/health", "skill-service health failed")
        wait_for_json(client, "http://agent-service:8102/health", "agent-service health failed")
        wait_for_json(client, "http://policy-service:8103/health", "policy-service health failed")
        wait_for_json(client, "http://memory-service:8104/health", "memory-service health failed")
        wait_for_json(client, "http://orchestrator-service:8105/health", "orchestrator-service health failed")

        org_a = require_ok(
            client.post(
                f"{gateway_url}/v1/organizations/bootstrap",
                json={
                    "organization_name": f"Org A {suffix}",
                    "organization_slug": f"org-a-{suffix}",
                    "workspace_name": f"Workspace A {suffix}",
                    "workspace_slug": f"workspace-a-{suffix}",
                    "operator_name": "Admin A",
                    "operator_email": f"admin-a-{suffix}@example.com",
                },
            ),
            "organization A bootstrap failed",
        )
        org_b = require_ok(
            client.post(
                f"{gateway_url}/v1/organizations/bootstrap",
                json={
                    "organization_name": f"Org B {suffix}",
                    "organization_slug": f"org-b-{suffix}",
                    "workspace_name": f"Workspace B {suffix}",
                    "workspace_slug": f"workspace-b-{suffix}",
                    "operator_name": "Admin B",
                    "operator_email": f"admin-b-{suffix}@example.com",
                },
            ),
            "organization B bootstrap failed",
        )

        admin_a_key = org_a["api_key"]
        admin_b_key = org_b["api_key"]

        require_ok(client.get(f"{gateway_url}/v1/organizations"), "organization listing failed")

        roles_payload = require_ok(client.get(f"{gateway_url}/v1/roles", headers=auth_headers(admin_a_key)), "role listing failed")
        skills_payload = require_ok(client.get(f"{gateway_url}/v1/skills", headers=auth_headers(admin_a_key)), "skill listing failed")
        role = next((item for item in roles_payload["roles"] if item["slug"] == "finance-role"), None)
        skill = next((item for item in skills_payload["skills"] if item["slug"] == "finance-approval-skill"), None)
        if role is None or skill is None:
            raise RuntimeError("seeded role/skill not found")

        viewer_a = require_ok(
            client.post(
                f"{gateway_url}/v1/operators",
                headers=auth_headers(admin_a_key),
                json={"name": "Viewer A", "email": f"viewer-a-{suffix}@example.com", "role": "viewer", "permissions": {}},
            ),
            "viewer creation failed",
        )
        viewer_a_key = viewer_a["api_key"]

        agent_a = require_ok(
            client.post(
                f"{gateway_url}/v1/agents",
                headers=auth_headers(admin_a_key),
                json={
                    "name": f"Finance Agent A {suffix}",
                    "role_id": role["id"],
                    "autonomy_level": "supervised",
                    "memory_config": {"scope": "team"},
                    "skill_overrides": {},
                    "config": {"specialty": "finance"},
                    "skill_ids": [skill["id"]],
                },
            ),
            "org A agent creation failed",
        )
        team_a = require_ok(
            client.post(
                f"{gateway_url}/v1/teams",
                headers=auth_headers(admin_a_key),
                json={
                    "name": f"Head Admin Team A {suffix}",
                    "description": "Org A validation team",
                    "governance_config": {
                        "risk_score": 0.25,
                        "head_admin_agent_id": agent_a["agent"]["id"],
                        "delegation_targets": [agent_a["agent"]["id"]],
                    },
                    "agent_ids": [agent_a["agent"]["id"]],
                },
            ),
            "org A team creation failed",
        )

        agent_b = require_ok(
            client.post(
                f"{gateway_url}/v1/agents",
                headers=auth_headers(admin_b_key),
                json={
                    "name": f"Finance Agent B {suffix}",
                    "role_id": role["id"],
                    "autonomy_level": "supervised",
                    "memory_config": {"scope": "team"},
                    "skill_overrides": {},
                    "config": {"specialty": "finance"},
                    "skill_ids": [skill["id"]],
                },
            ),
            "org B agent creation failed",
        )
        team_b = require_ok(
            client.post(
                f"{gateway_url}/v1/teams",
                headers=auth_headers(admin_b_key),
                json={
                    "name": f"Head Admin Team B {suffix}",
                    "description": "Org B validation team",
                    "governance_config": {
                        "risk_score": 0.22,
                        "head_admin_agent_id": agent_b["agent"]["id"],
                        "delegation_targets": [agent_b["agent"]["id"]],
                    },
                    "agent_ids": [agent_b["agent"]["id"]],
                },
            ),
            "org B team creation failed",
        )

        teams_a = require_ok(client.get(f"{gateway_url}/v1/teams", headers=auth_headers(admin_a_key)), "org A team list failed")
        teams_b = require_ok(client.get(f"{gateway_url}/v1/teams", headers=auth_headers(admin_b_key)), "org B team list failed")
        if any(item["id"] == team_b["team"]["id"] for item in teams_a["teams"]):
            raise RuntimeError("organization A can see organization B teams")
        if any(item["id"] == team_a["team"]["id"] for item in teams_b["teams"]):
            raise RuntimeError("organization B can see organization A teams")

        viewer_team_create = client.post(
            f"{gateway_url}/v1/teams",
            headers=auth_headers(viewer_a_key),
            json={
                "name": f"Viewer Blocked Team {suffix}",
                "description": "should fail",
                "governance_config": {},
                "agent_ids": [],
            },
        )
        if viewer_team_create.status_code != 403:
            raise RuntimeError("viewer was allowed to create a team")

        policy_name_prefix = f"phase9-validation-{suffix}"
        delegation_policy = require_ok(
            client.post(
                f"{gateway_url}/v1/policies",
                headers=auth_headers(admin_a_key),
                json={
                    "name": f"{policy_name_prefix}-delegation",
                    "scope": "organization",
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
                },
            ),
            "delegation policy creation failed",
        )

        skill_policy = require_ok(
            client.post(
                f"{gateway_url}/v1/policies",
                headers=auth_headers(admin_a_key),
                json={
                    "name": f"{policy_name_prefix}-skill",
                    "scope": "organization",
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
                },
            ),
            "skill policy creation failed",
        )

        policies_a = require_ok(client.get(f"{gateway_url}/v1/policies", headers=auth_headers(admin_a_key)), "org A policy list failed")
        policies_b = require_ok(client.get(f"{gateway_url}/v1/policies", headers=auth_headers(admin_b_key)), "org B policy list failed")
        if not any(item["id"] == delegation_policy["policy"]["id"] for item in policies_a["policies"]):
            raise RuntimeError("org A policy did not appear in org A list")
        if any(item["id"] == delegation_policy["policy"]["id"] for item in policies_b["policies"]):
            raise RuntimeError("organization B can see organization A policies")

        viewer_policy_create = client.post(
            f"{gateway_url}/v1/policies",
            headers=auth_headers(viewer_a_key),
            json={
                "name": f"viewer-denied-{suffix}",
                "scope": "organization",
                "effect": "deny",
                "approval_threshold": 0.5,
                "conditions": {},
                "restrictions": {},
            },
        )
        if viewer_policy_create.status_code != 403:
            raise RuntimeError("viewer was allowed to create a policy")

        head_admin_node_id = "agent-head-admin"
        finance_agent_node_id = f"agent-{agent_a['agent']['id']}"
        skill_node_id = f"skill-{skill['id']}"
        policy_node_id = f"policy-{delegation_policy['policy']['id']}"
        approval_node_id = f"approval-{team_a['team']['id']}"
        provider_node_id = "provider-openai"

        workflow_graph = {
            "workflow": {
                "name": f"Validation Workflow {suffix}",
                "version": 1,
                "status": "draft",
                "subsystem": "admin",
                "team_id": team_a["team"]["id"],
            },
            "nodes": [
                {"id": head_admin_node_id, "type": "agent", "position": {"x": 80, "y": 120}, "data": {"label": "Head Admin", "role": "Head Admin", "provider": "policy-driven", "memoryProfile": "organization", "skills": [], "runtimeStatus": "ready"}},
                {"id": finance_agent_node_id, "type": "agent", "position": {"x": 300, "y": 120}, "data": {"label": agent_a["agent"]["name"], "role": "Finance Role", "provider": "openai", "memoryProfile": "team", "skills": [skill["slug"]], "runtimeStatus": "ready"}},
                {"id": skill_node_id, "type": "skill", "position": {"x": 560, "y": 120}, "data": {"label": skill["name"], "executionType": "hybrid", "provider": "openai", "inputSchema": {}, "outputSchema": {}, "permissions": [], "retryPolicy": "standard", "timeout": "60s", "runtimeStatus": "ready"}},
                {"id": policy_node_id, "type": "policy", "position": {"x": 40, "y": 320}, "data": {"label": delegation_policy["policy"]["name"], "effect": "deny", "scope": "organization", "approvalThreshold": 0.75, "restrictions": {"delegation_targets": [agent_a["agent"]["id"]], "skill_ids": [skill["id"]]}}},
                {"id": approval_node_id, "type": "approval", "position": {"x": 300, "y": 320}, "data": {"label": f"{team_a['team']['name']} Approval", "status": "required", "agentIds": [agent_a["agent"]["id"]], "delegationTargets": [agent_a["agent"]["id"]], "riskScore": 0.25}},
                {"id": provider_node_id, "type": "provider", "position": {"x": 760, "y": 80}, "data": {"label": "OpenAI", "provider": "openai", "model": "gpt-4.1-mini", "status": "available"}},
            ],
            "edges": [
                {"id": f"{head_admin_node_id}->{finance_agent_node_id}", "source": head_admin_node_id, "target": finance_agent_node_id, "type": "delegation", "data": {"edgeType": "delegation"}},
                {"id": f"{finance_agent_node_id}->{skill_node_id}", "source": finance_agent_node_id, "target": skill_node_id, "type": "execution", "data": {"edgeType": "execution"}},
                {"id": f"{head_admin_node_id}->{approval_node_id}", "source": head_admin_node_id, "target": approval_node_id, "type": "approval", "data": {"edgeType": "approval"}},
                {"id": f"{policy_node_id}->{finance_agent_node_id}", "source": policy_node_id, "target": finance_agent_node_id, "type": "policy", "data": {"edgeType": "policy"}},
                {"id": f"{policy_node_id}->{skill_node_id}", "source": policy_node_id, "target": skill_node_id, "type": "policy", "data": {"edgeType": "policy"}},
                {"id": f"{provider_node_id}->{finance_agent_node_id}", "source": provider_node_id, "target": finance_agent_node_id, "type": "fallback", "data": {"edgeType": "fallback"}},
            ],
            "validation": [],
            "runtime": {},
        }

        invalid_graph = json.loads(json.dumps(workflow_graph))
        invalid_graph["edges"] = [edge for edge in invalid_graph["edges"] if edge["type"] != "delegation"]
        invalid_validation = require_ok(
            client.post(f"{gateway_url}/v1/workflows/validate", headers=auth_headers(admin_a_key), json={"workflow": invalid_graph}),
            "invalid workflow validation failed",
        )
        if invalid_validation.get("validation_status") != "invalid":
            raise RuntimeError("invalid graph was not flagged during validation")
        invalid_deploy = client.post(f"{gateway_url}/v1/workflows/deploy", headers=auth_headers(admin_a_key), json={"workflow": invalid_graph})
        if invalid_deploy.status_code != 422:
            raise RuntimeError("invalid graph was not rejected during deployment")

        workflow_validation = require_ok(
            client.post(f"{gateway_url}/v1/workflows/validate", headers=auth_headers(admin_a_key), json={"workflow": workflow_graph}),
            "workflow validation failed",
        )
        if workflow_validation.get("validation_status") != "valid":
            raise RuntimeError("valid workflow was not marked valid")

        deploy_v1 = require_ok(
            client.post(f"{gateway_url}/v1/workflows/deploy", headers=auth_headers(admin_a_key), json={"workflow": workflow_graph}),
            "workflow deployment v1 failed",
        )
        deploy_v1_id = deploy_v1["deployment"]["id"]
        workflow_graph_v2 = json.loads(json.dumps(workflow_graph))
        workflow_graph_v2["workflow"]["name"] = f"Validation Workflow {suffix} v2"
        deploy_v2 = require_ok(
            client.post(f"{gateway_url}/v1/workflows/deploy", headers=auth_headers(admin_a_key), json={"workflow": workflow_graph_v2}),
            "workflow deployment v2 failed",
        )
        deploy_v2_id = deploy_v2["deployment"]["id"]

        versions_payload = require_ok(client.get(f"{gateway_url}/v1/workflows/versions", headers=auth_headers(admin_a_key)), "workflow versions failed")
        active_versions = [item for item in versions_payload["versions"] if item["status"] == "active"]
        if len(active_versions) != 1 or active_versions[0]["id"] != deploy_v2_id:
            raise RuntimeError("workflow deployment did not activate the latest version")

        rollback_payload = require_ok(
            client.post(f"{gateway_url}/v1/workflows/{deploy_v1_id}/rollback", headers=auth_headers(admin_a_key)),
            "workflow rollback failed",
        )
        if rollback_payload["deployment"]["id"] != deploy_v1_id:
            raise RuntimeError("workflow rollback did not restore the previous deployment")
        active_workflow = require_ok(client.get(f"{gateway_url}/v1/workflows/active", headers=auth_headers(admin_a_key)), "active workflow lookup failed")
        if active_workflow["deployment"]["id"] != deploy_v1_id:
            raise RuntimeError("active workflow did not match rolled back deployment")

        task_payload = {
            "team_id": team_a["team"]["id"],
            "task": "Review Q3 operating budget variance and recommend approval status.",
            "actor_id": "head-admin",
            "subsystem": "admin",
            "context": {
                "role_id": role["id"],
            },
        }
        valid_result = require_ok(client.post(f"{gateway_url}/v1/tasks", headers=auth_headers(admin_a_key), json=task_payload), "valid orchestration flow failed")
        request_id = valid_result["request_id"]
        if valid_result.get("result", {}).get("status") not in {"completed", "awaiting_approval"}:
            raise RuntimeError("valid orchestration flow did not complete successfully")

        execution_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{request_id}", headers=auth_headers(admin_a_key)), "execution detail failed")
        execution_status = require_ok(client.get(f"{gateway_url}/v1/executions/{request_id}/status", headers=auth_headers(admin_a_key)), "execution status failed")
        if execution_detail["execution"]["organization_id"] != org_a["organization"]["id"]:
            raise RuntimeError("execution detail lost organization scope")
        if not execution_detail["execution"].get("delegation_chain"):
            raise RuntimeError("delegation chain missing from valid execution")
        if execution_status["status"]["latest_status"] not in {"completed", "awaiting_approval"}:
            raise RuntimeError("execution status did not preserve valid final state")

        viewer_execution_list = require_ok(client.get(f"{gateway_url}/v1/executions", headers=auth_headers(viewer_a_key)), "viewer execution list failed")
        if not any(item["request_id"] == request_id for item in viewer_execution_list["executions"]):
            raise RuntimeError("viewer could not see organization execution history")

        org_b_detail_attempt = client.get(f"{gateway_url}/v1/executions/{request_id}", headers=auth_headers(admin_b_key))
        if org_b_detail_attempt.status_code != 404:
            raise RuntimeError("organization B accessed organization A execution detail")

        blocked_delegation_result = require_ok(
            client.post(
                f"{gateway_url}/v1/tasks",
                headers=auth_headers(admin_a_key),
                json={
                    "team_id": team_a["team"]["id"],
                    "task": "Blocked delegation validation.",
                    "actor_id": "head-admin",
                    "subsystem": "admin",
                    "context": {
                        "skill_id": skill["id"],
                        "role_id": role["id"],
                        "default_skill_id": skill["id"],
                        "validation_case": "block-delegation",
                    },
                },
            ),
            "blocked delegation flow failed",
        )
        blocked_delegation_request_id = blocked_delegation_result["request_id"]
        blocked_delegation_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{blocked_delegation_request_id}", headers=auth_headers(admin_a_key)), "blocked delegation detail failed")
        if blocked_delegation_result.get("result", {}).get("status") != "failed":
            raise RuntimeError("unauthorized delegation was not blocked")
        if not any(event.get("event_type") == "policy.violation" for event in blocked_delegation_detail.get("events", [])):
            raise RuntimeError("blocked delegation did not record a policy violation")

        blocked_skill_result = require_ok(
            client.post(
                f"{gateway_url}/v1/tasks",
                headers=auth_headers(admin_a_key),
                json={
                    "team_id": team_a["team"]["id"],
                    "task": "Blocked skill validation.",
                    "actor_id": "head-admin",
                    "subsystem": "admin",
                    "context": {
                        "skill_id": skill["id"],
                        "role_id": role["id"],
                        "default_skill_id": skill["id"],
                        "validation_case": "block-skill",
                    },
                },
            ),
            "blocked skill flow failed",
        )
        blocked_skill_request_id = blocked_skill_result["request_id"]
        blocked_skill_detail = require_ok(client.get(f"{gateway_url}/v1/executions/{blocked_skill_request_id}", headers=auth_headers(admin_a_key)), "blocked skill detail failed")
        if blocked_skill_result.get("result", {}).get("status") != "failed":
            raise RuntimeError("unauthorized skill execution was not blocked")
        if not any(event.get("event_type") == "policy.violation" for event in blocked_skill_detail.get("events", [])):
            raise RuntimeError("blocked skill execution did not record a policy violation")

        print(
            json.dumps(
                {
                    "ok": True,
                    "organization_a": org_a["organization"]["id"],
                    "organization_b": org_b["organization"]["id"],
                    "team_a": team_a["team"]["id"],
                    "team_b": team_b["team"]["id"],
                    "request_id": request_id,
                    "blocked_delegation_request_id": blocked_delegation_request_id,
                    "blocked_skill_request_id": blocked_skill_request_id,
                    "viewer_operator_id": viewer_a["operator"]["id"],
                }
            )
        )


if __name__ == "__main__":
    main()
