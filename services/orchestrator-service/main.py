from typing import Any, TypedDict

import httpx
from fastapi import FastAPI, HTTPException

from execution_store import ExecutionStore
from shared.schemas import TaskCreate
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover
    END = "END"
    StateGraph = None

settings = load_settings("orchestrator-service", 8105)
events = EventBus(settings.redis_url, settings.event_channel)
SessionLocal = create_session_factory(settings.database_url)
execution_store = ExecutionStore(SessionLocal)
app = FastAPI(title="orchestrator-service", version="1.0.0")

AGENT_SERVICE_URL = "http://agent-service:8102"
POLICY_SERVICE_URL = "http://policy-service:8103"
SKILL_SERVICE_URL = "http://skill-service:8101"
MEMORY_SERVICE_URL = "http://memory-service:8104"


class WorkflowState(TypedDict, total=False):
    request_id: str
    execution_id: str
    task: str
    team_id: str
    actor_id: str
    subsystem: str
    context: dict[str, Any]
    short_term_memory: list[dict[str, Any]]
    team: dict[str, Any]
    finance_result: dict[str, Any]
    approval: dict[str, Any]
    final_result: dict[str, Any]
    current_step: str
    delegation_chain: list[dict[str, Any]]
    provider_usage: list[dict[str, Any]]
    skill_execution_count: int
    policy_violation: dict[str, Any]


def transition(state: WorkflowState, *, status: str, step: str, event_type: str, agent_name: str = "", payload: dict[str, Any] | None = None):
    state["current_step"] = step
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status=status,
        current_step=step,
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
        result_payload=state.get("final_result", {}),
    )
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type=event_type,
        status=status,
        agent_name=agent_name,
        payload=payload or {},
    )


def add_delegation(state: WorkflowState, from_agent: str, to_agent: str, reason: str):
    chain = state.get("delegation_chain", [])
    chain.append({"from": from_agent, "to": to_agent, "reason": reason})
    state["delegation_chain"] = chain


def add_provider_usage(state: WorkflowState, provider_info: dict[str, Any]):
    usage = state.get("provider_usage", [])
    candidate = {
        "selected": provider_info.get("selected"),
        "active": provider_info.get("active"),
        "model": provider_info.get("model"),
        "fallback": provider_info.get("fallback", False),
    }
    if candidate not in usage:
        usage.append(candidate)
    state["provider_usage"] = usage


async def evaluate_policy(client: httpx.AsyncClient, state: WorkflowState, payload: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(f"{POLICY_SERVICE_URL}/v1/policies/evaluate", json=payload)
    if response.is_success:
      return response.json().get("decision", {})
    return {"approved": True, "requires_approval": False, "violations": []}


def set_policy_violation(state: WorkflowState, *, stage: str, decision: dict[str, Any], payload: dict[str, Any]):
    violation = {
        "stage": stage,
        "decision": decision,
        "payload": payload,
    }
    state["policy_violation"] = violation
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="policy.violation",
        status="failed",
        agent_name="policy-service",
        payload=violation,
    )
    events.emit("policy.violation", {"request_id": state["request_id"], "team_id": state["team_id"], **violation})


def head_admin_route(state: WorkflowState):
    return "policy_blocked" if state.get("policy_violation") else "finance_agent"


def finance_route(state: WorkflowState):
    return "policy_blocked" if state.get("policy_violation") else "approval_gate"


async def head_admin(state: WorkflowState):
    events.emit("task.started", {"request_id": state["request_id"], "team_id": state["team_id"], "subsystem": state["subsystem"], "task": state["task"]})
    state["short_term_memory"] = state.get("short_term_memory", []) + [{"from": "head-admin", "task": state["task"]}]
    transition(
        state,
        status="running",
        step="head_admin",
        event_type="state.transition",
        agent_name="head-admin",
        payload={"message": "Head Admin accepted task and is loading team context."},
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            team_response = await client.get(f"{AGENT_SERVICE_URL}/v1/teams/{state['team_id']}")
            if team_response.is_success:
                state["team"] = team_response.json().get("team", {})
        except Exception:
            state["team"] = {}
        try:
            await client.post(
                f"{MEMORY_SERVICE_URL}/v1/memory/write",
                json={
                    "namespace": state["team_id"],
                    "scope": "short_term",
                    "content": state["task"],
                    "metadata": {"actor": state["actor_id"], "subsystem": state["subsystem"], "request_id": state["request_id"]},
                },
            )
        except Exception:
            pass

        target_agent_name = state.get("context", {}).get("delegation_target_name", "finance-agent")
        target_agent_id = state.get("context", {}).get("delegation_target_id")
        if not target_agent_id:
            target_agent_ids = list((state.get("team", {}) or {}).get("agent_ids", []))
            target_agent_id = target_agent_ids[0] if target_agent_ids else None
        policy_decision = await evaluate_policy(
            client,
            state,
            {
                "role_id": state.get("context", {}).get("role_id"),
                "team_id": state["team_id"],
                "target_agent_id": target_agent_id,
                "target_agent_name": target_agent_name,
                "execution_mode": "delegation",
                "risk_score": (state.get("team", {}) or {}).get("governance_config", {}).get("risk_score", 0.82),
                "delegation_count": len(state.get("delegation_chain", [])) + 1,
                "request_id": state["request_id"],
                "context": {
                    **state.get("context", {}),
                    "subsystem": state["subsystem"],
                },
            },
        )
        if not policy_decision.get("approved", True):
            set_policy_violation(
                state,
                stage="delegation",
                decision=policy_decision,
                payload={"target_agent_name": target_agent_name, "target_agent_id": target_agent_id},
            )
            return state

    add_delegation(state, "head-admin", "finance-agent", "Finance review required for current workflow.")
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="agent.delegated",
        status="running",
        agent_name="head-admin",
        payload={"to": "finance-agent", "delegation_chain": state.get("delegation_chain", [])},
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="running",
        current_step="head_admin",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
    )
    return state


async def finance_agent(state: WorkflowState):
    transition(
        state,
        status="running",
        step="finance_agent",
        event_type="state.transition",
        agent_name="finance-agent",
        payload={"message": "Finance agent is evaluating the task."},
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        skill_id = state.get("context", {}).get("skill_id")
        if not skill_id:
            skill_id = state.get("context", {}).get("default_skill_id", "demo-skill")

        pre_skill_decision = await evaluate_policy(
            client,
            state,
            {
                "role_id": state.get("context", {}).get("role_id"),
                "team_id": state["team_id"],
                "skill_ids": [skill_id],
                "provider_name": settings.model_provider,
                "execution_mode": "skill_execution",
                "risk_score": (state.get("team", {}) or {}).get("governance_config", {}).get("risk_score", 0.82),
                "skill_execution_count": state.get("skill_execution_count", 0) + 1,
                "request_id": state["request_id"],
                "context": {
                    **state.get("context", {}),
                    "subsystem": state["subsystem"],
                },
            },
        )
        if not pre_skill_decision.get("approved", True):
            set_policy_violation(
                state,
                stage="skill_execution",
                decision=pre_skill_decision,
                payload={"skill_id": skill_id, "provider_name": settings.model_provider},
            )
            return state

        skill_payload = {
            "input": {"task": state["task"], "subsystem": state["subsystem"]},
            "context": {
                **state.get("context", {}),
                "team_id": state["team_id"],
                "request_id": state["request_id"],
                "subsystem": state["subsystem"],
                "skill_execution_count": state.get("skill_execution_count", 0) + 1,
            },
            "actor_id": "finance-agent",
        }
        finance_result = {
            "decision": f"Finance agent reviewed task: {state['task']}",
            "recommendation": "Proceed with supervised execution and operator approval.",
            "skill_result": skill_payload,
        }
        response = await client.post(f"{SKILL_SERVICE_URL}/skills/{skill_id}/execute", json=skill_payload)
        if response.status_code == 403:
            detail = response.json().get("detail", {})
            decision = detail.get("decision", {}) if isinstance(detail, dict) else {}
            set_policy_violation(
                state,
                stage="skill_execution",
                decision=decision or {"approved": False, "violations": [{"type": "policy_violation", "message": "Skill execution was blocked."}]},
                payload={"skill_id": skill_id, "provider_name": settings.model_provider},
            )
            return state
        if response.is_success:
            finance_result["skill_result"] = response.json()
            provider_info = finance_result["skill_result"].get("result", {}).get("provider", {})
            add_provider_usage(state, provider_info)
            state["skill_execution_count"] = state.get("skill_execution_count", 0) + 1
            execution_store.append_event(
                execution_id=state["execution_id"],
                request_id=state["request_id"],
                team_id=state["team_id"],
                event_type="skill.executed",
                status="running",
                agent_name="finance-agent",
                skill_id=skill_id,
                provider_name=provider_info.get("active", ""),
                payload=finance_result["skill_result"].get("result", {}),
            )

    state["finance_result"] = finance_result
    events.emit("agent.decision", {"request_id": state["request_id"], "agent": "finance-agent", "team_id": state["team_id"], "decision": finance_result["recommendation"]})
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="agent.decision",
        status="running",
        agent_name="finance-agent",
        payload=finance_result,
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="running",
        current_step="finance_agent",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
    )
    return state


async def approval_gate(state: WorkflowState):
    transition(
        state,
        status="running",
        step="approval_gate",
        event_type="state.transition",
        agent_name="policy-service",
        payload={"message": "Approval gate is evaluating restrictions and thresholds."},
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            governance = state.get("team", {}).get("governance_config", {})
            response = await client.post(
                f"{POLICY_SERVICE_URL}/v1/policies/evaluate",
                json={
                    "role_id": state.get("context", {}).get("role_id"),
                    "team_id": state["team_id"],
                    "skill_ids": [state.get("context", {}).get("skill_id")] if state.get("context", {}).get("skill_id") else [],
                    "execution_mode": "approval",
                    "risk_score": governance.get("risk_score", 0.82),
                    "request_id": state["request_id"],
                    "context": {
                        **state.get("context", {}),
                        "subsystem": state["subsystem"],
                    },
                },
            )
            approval = response.json().get("decision", {})
        except Exception:
            approval = {"approved": True, "requires_approval": True, "restricted_skills": []}
    state["approval"] = approval
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="approval.evaluated",
        status="running",
        agent_name="policy-service",
        payload=approval,
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="running",
        current_step="approval_gate",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
    )
    return state


def approval_route(state: WorkflowState):
    return "awaiting_approval" if state.get("approval", {}).get("requires_approval") else "finalize"


async def awaiting_approval(state: WorkflowState):
    state["final_result"] = {
        "status": "awaiting_approval",
        "summary": "Head Admin delegated to Finance Agent. Approval is required before completion.",
        "finance_result": state.get("finance_result", {}),
        "approval": state.get("approval", {}),
        "request_id": state["request_id"],
    }
    events.emit("task.completed", state["final_result"])
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="task.completed",
        status="awaiting_approval",
        agent_name="head-admin",
        payload=state["final_result"],
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="awaiting_approval",
        current_step="awaiting_approval",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
        result_payload=state["final_result"],
        completed=True,
    )
    return state


async def finalize(state: WorkflowState):
    transition(
        state,
        status="running",
        step="finalize",
        event_type="state.transition",
        agent_name="head-admin",
        payload={"message": "Persisting final long-term memory and closing execution."},
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            await client.post(
                f"{MEMORY_SERVICE_URL}/v1/memory/write",
                json={
                    "namespace": state["team_id"],
                    "scope": "long_term",
                    "content": state.get("finance_result", {}).get("decision", ""),
                    "metadata": {"approval": state.get("approval", {}), "task": state["task"], "request_id": state["request_id"]},
                },
            )
        except Exception:
            pass
    state["final_result"] = {
        "status": "completed",
        "summary": "Head Admin delegated to Finance Agent and the workflow completed without a blocking approval.",
        "finance_result": state.get("finance_result", {}),
        "approval": state.get("approval", {}),
        "request_id": state["request_id"],
    }
    events.emit("task.completed", state["final_result"])
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="task.completed",
        status="completed",
        agent_name="head-admin",
        payload=state["final_result"],
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="completed",
        current_step="completed",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
        result_payload=state["final_result"],
        completed=True,
    )
    return state


async def policy_blocked(state: WorkflowState):
    violation = state.get("policy_violation", {})
    state["final_result"] = {
        "status": "failed",
        "summary": "Execution was blocked by policy enforcement before completion.",
        "policy_violation": violation,
        "request_id": state["request_id"],
    }
    execution_store.append_event(
        execution_id=state["execution_id"],
        request_id=state["request_id"],
        team_id=state["team_id"],
        event_type="task.failed",
        status="failed",
        agent_name="policy-service",
        payload=state["final_result"],
    )
    execution_store.update_run(
        execution_id=state["execution_id"],
        latest_status="failed",
        current_step="policy_blocked",
        delegation_chain=state.get("delegation_chain", []),
        provider_usage=state.get("provider_usage", []),
        state_snapshot=dict(state),
        result_payload=state["final_result"],
        error_message="policy_violation",
        completed=True,
    )
    return state


def build_graph():
    if StateGraph is None:
        return None
    graph = StateGraph(WorkflowState)
    graph.add_node("head_admin", head_admin)
    graph.add_node("finance_agent", finance_agent)
    graph.add_node("approval_gate", approval_gate)
    graph.add_node("awaiting_approval", awaiting_approval)
    graph.add_node("finalize", finalize)
    graph.add_node("policy_blocked", policy_blocked)
    graph.set_entry_point("head_admin")
    graph.add_conditional_edges("head_admin", head_admin_route, {"policy_blocked": "policy_blocked", "finance_agent": "finance_agent"})
    graph.add_conditional_edges("finance_agent", finance_route, {"policy_blocked": "policy_blocked", "approval_gate": "approval_gate"})
    graph.add_conditional_edges("approval_gate", approval_route, {"awaiting_approval": "awaiting_approval", "finalize": "finalize"})
    graph.add_edge("awaiting_approval", END)
    graph.add_edge("finalize", END)
    graph.add_edge("policy_blocked", END)
    return graph.compile()


GRAPH = build_graph()


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name, "langgraph_enabled": GRAPH is not None}


@app.get("/v1/executions")
def list_executions():
    return {"ok": True, "executions": execution_store.list_runs()}


@app.get("/v1/executions/{request_id}")
def get_execution(request_id: str):
    detail = execution_store.get_run_detail(request_id)
    if not detail:
        raise HTTPException(status_code=404, detail="execution_not_found")
    return {"ok": True, **detail}


@app.get("/v1/executions/{request_id}/status")
def get_execution_status(request_id: str):
    status = execution_store.get_status(request_id)
    if not status:
        raise HTTPException(status_code=404, detail="execution_not_found")
    return {"ok": True, "status": status}


@app.post("/v1/tasks")
async def create_task(payload: TaskCreate):
    if GRAPH is None:
        raise HTTPException(status_code=503, detail="LangGraph dependency is unavailable for orchestrator-service.")

    execution_identifiers = execution_store.create_run(
        team_id=payload.team_id,
        actor_id=payload.actor_id,
        subsystem=payload.subsystem,
        task=payload.task,
        context=payload.context,
    )
    initial_state: WorkflowState = {
        "request_id": execution_identifiers["request_id"],
        "execution_id": execution_identifiers["execution_id"],
        "task": payload.task,
        "team_id": payload.team_id,
        "actor_id": payload.actor_id,
        "subsystem": payload.subsystem,
        "context": payload.context,
        "short_term_memory": payload.short_term_memory,
        "delegation_chain": [],
        "provider_usage": [],
        "skill_execution_count": 0,
        "current_step": "queued",
    }

    try:
        result = await GRAPH.ainvoke(initial_state)
    except Exception as error:
        execution_store.append_event(
            execution_id=execution_identifiers["execution_id"],
            request_id=execution_identifiers["request_id"],
            team_id=payload.team_id,
            event_type="task.failed",
            status="failed",
            agent_name="orchestrator-service",
            payload={"error": str(error)},
        )
        execution_store.update_run(
            execution_id=execution_identifiers["execution_id"],
            latest_status="failed",
            current_step="failed",
            delegation_chain=initial_state.get("delegation_chain", []),
            provider_usage=initial_state.get("provider_usage", []),
            state_snapshot=initial_state,
            result_payload={},
            error_message=str(error),
            completed=True,
        )
        raise

    final_result = result.get("final_result", {})
    final_result["request_id"] = execution_identifiers["request_id"]
    return {"ok": True, "request_id": execution_identifiers["request_id"], "result": final_result, "state": result}
