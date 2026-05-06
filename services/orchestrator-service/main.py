from typing import Any, TypedDict

import httpx
from fastapi import FastAPI, HTTPException

from shared.schemas import TaskCreate
from shared.utils.config import load_settings
from shared.utils.events import EventBus

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover
    END = "END"
    StateGraph = None

settings = load_settings("orchestrator-service", 8105)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="orchestrator-service", version="1.0.0")

AGENT_SERVICE_URL = "http://agent-service:8102"
POLICY_SERVICE_URL = "http://policy-service:8103"
SKILL_SERVICE_URL = "http://skill-service:8101"
MEMORY_SERVICE_URL = "http://memory-service:8104"


class WorkflowState(TypedDict, total=False):
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


async def head_admin(state: WorkflowState):
    events.emit("task.started", {"team_id": state["team_id"], "subsystem": state["subsystem"], "task": state["task"]})
    state["short_term_memory"] = state.get("short_term_memory", []) + [{"from": "head-admin", "task": state["task"]}]
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
                    "metadata": {"actor": state["actor_id"], "subsystem": state["subsystem"]},
                },
            )
        except Exception:
            pass
    return state


async def finance_agent(state: WorkflowState):
    async with httpx.AsyncClient(timeout=20.0) as client:
        skill_id = state.get("context", {}).get("skill_id")
        if not skill_id:
            skill_id = state.get("context", {}).get("default_skill_id", "demo-skill")
        skill_payload = {
            "input": {"task": state["task"], "subsystem": state["subsystem"]},
            "context": state.get("context", {}),
            "actor_id": "finance-agent",
        }
        finance_result = {
            "decision": f"Finance agent reviewed task: {state['task']}",
            "recommendation": "Proceed with supervised execution and operator approval.",
            "skill_result": skill_payload,
        }
        try:
            response = await client.post(f"{SKILL_SERVICE_URL}/skills/{skill_id}/execute", json=skill_payload)
            if response.is_success:
                finance_result["skill_result"] = response.json()
        except Exception:
            pass
    state["finance_result"] = finance_result
    events.emit("agent.decision", {"agent": "finance-agent", "team_id": state["team_id"], "decision": finance_result["recommendation"]})
    return state


async def approval_gate(state: WorkflowState):
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            governance = state.get("team", {}).get("governance_config", {})
            response = await client.post(
                f"{POLICY_SERVICE_URL}/v1/policies/evaluate",
                json={
                    "role_id": state.get("context", {}).get("role_id"),
                    "skill_ids": [state.get("context", {}).get("skill_id")] if state.get("context", {}).get("skill_id") else [],
                    "risk_score": governance.get("risk_score", 0.82),
                    "context": state.get("context", {}),
                },
            )
            approval = response.json().get("decision", {})
        except Exception:
            approval = {"approved": True, "requires_approval": True, "restricted_skills": []}
    state["approval"] = approval
    return state


def approval_route(state: WorkflowState):
    return "awaiting_approval" if state.get("approval", {}).get("requires_approval") else "finalize"


async def awaiting_approval(state: WorkflowState):
    state["final_result"] = {
        "status": "awaiting_approval",
        "summary": "Head Admin delegated to Finance Agent. Approval is required before completion.",
        "finance_result": state.get("finance_result", {}),
        "approval": state.get("approval", {}),
    }
    events.emit("task.completed", state["final_result"])
    return state


async def finalize(state: WorkflowState):
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            await client.post(
                f"{MEMORY_SERVICE_URL}/v1/memory/write",
                json={
                    "namespace": state["team_id"],
                    "scope": "long_term",
                    "content": state.get("finance_result", {}).get("decision", ""),
                    "metadata": {"approval": state.get("approval", {}), "task": state["task"]},
                },
            )
        except Exception:
            pass
    state["final_result"] = {
        "status": "completed",
        "summary": "Head Admin delegated to Finance Agent and the workflow completed without a blocking approval.",
        "finance_result": state.get("finance_result", {}),
        "approval": state.get("approval", {}),
    }
    events.emit("task.completed", state["final_result"])
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
    graph.set_entry_point("head_admin")
    graph.add_edge("head_admin", "finance_agent")
    graph.add_edge("finance_agent", "approval_gate")
    graph.add_conditional_edges("approval_gate", approval_route, {"awaiting_approval": "awaiting_approval", "finalize": "finalize"})
    graph.add_edge("awaiting_approval", END)
    graph.add_edge("finalize", END)
    return graph.compile()


GRAPH = build_graph()


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name, "langgraph_enabled": GRAPH is not None}


@app.post("/v1/tasks")
async def create_task(payload: TaskCreate):
    if GRAPH is None:
        raise HTTPException(status_code=503, detail="LangGraph dependency is unavailable for orchestrator-service.")
    result = await GRAPH.ainvoke({
        "task": payload.task,
        "team_id": payload.team_id,
        "actor_id": payload.actor_id,
        "subsystem": payload.subsystem,
        "context": payload.context,
        "short_term_memory": payload.short_term_memory,
    })
    return {"ok": True, "result": result.get("final_result", {}), "state": result}
