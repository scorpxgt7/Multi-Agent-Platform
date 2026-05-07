import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException

app = FastAPI(title="api-gateway", version="1.0.0")

ROUTES = {
    "skills": os.getenv("SKILL_SERVICE_URL", "http://skill-service:8101") + "/v1/skills",
    "roles": os.getenv("AGENT_SERVICE_URL", "http://agent-service:8102") + "/v1/roles",
    "agents": os.getenv("AGENT_SERVICE_URL", "http://agent-service:8102") + "/v1/agents",
    "teams": os.getenv("AGENT_SERVICE_URL", "http://agent-service:8102") + "/v1/teams",
    "policies": os.getenv("POLICY_SERVICE_URL", "http://policy-service:8103") + "/v1/policies",
    "tasks": os.getenv("ORCHESTRATOR_SERVICE_URL", "http://orchestrator-service:8105") + "/v1/tasks",
    "executions": os.getenv("ORCHESTRATOR_SERVICE_URL", "http://orchestrator-service:8105") + "/v1/executions",
}


async def forward(target: str, payload: dict[str, Any]):
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(target, json=payload)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


async def fetch(target: str):
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(target)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


async def replace(target: str, payload: dict[str, Any]):
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.put(target, json=payload)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@app.get("/health")
def health():
    return {"ok": True, "service": "api-gateway"}


@app.post("/v1/skills")
async def create_skill(payload: dict[str, Any]):
    return await forward(ROUTES["skills"], payload)


@app.get("/v1/skills")
async def list_skills():
    return await fetch(ROUTES["skills"])


@app.post("/v1/roles")
async def create_role(payload: dict[str, Any]):
    return await forward(ROUTES["roles"], payload)


@app.get("/v1/roles")
async def list_roles():
    return await fetch(ROUTES["roles"])


@app.post("/v1/agents")
async def create_agent(payload: dict[str, Any]):
    return await forward(ROUTES["agents"], payload)


@app.get("/v1/agents")
async def list_agents():
    return await fetch(ROUTES["agents"])


@app.put("/v1/agents/{agent_id}")
async def update_agent(agent_id: str, payload: dict[str, Any]):
    return await replace(f"{ROUTES['agents']}/{agent_id}", payload)


@app.post("/v1/teams")
async def create_team(payload: dict[str, Any]):
    return await forward(ROUTES["teams"], payload)


@app.get("/v1/teams")
async def list_teams():
    return await fetch(ROUTES["teams"])


@app.get("/v1/teams/{team_id}")
async def get_team(team_id: str):
    return await fetch(f"{ROUTES['teams']}/{team_id}")


@app.put("/v1/teams/{team_id}")
async def update_team(team_id: str, payload: dict[str, Any]):
    return await replace(f"{ROUTES['teams']}/{team_id}", payload)


@app.post("/v1/policies")
async def create_policy(payload: dict[str, Any]):
    return await forward(ROUTES["policies"], payload)


@app.get("/v1/policies")
async def list_policies():
    return await fetch(ROUTES["policies"])


@app.put("/v1/policies/{policy_id}")
async def update_policy(policy_id: str, payload: dict[str, Any]):
    return await replace(f"{ROUTES['policies']}/{policy_id}", payload)


@app.post("/v1/policies/evaluate")
async def evaluate_policy(payload: dict[str, Any]):
    return await forward(f"{ROUTES['policies']}/evaluate", payload)


@app.post("/v1/tasks")
async def create_task(payload: dict[str, Any]):
    return await forward(ROUTES["tasks"], payload)


@app.get("/v1/executions")
async def list_executions():
    return await fetch(ROUTES["executions"])


@app.get("/v1/executions/{request_id}")
async def get_execution(request_id: str):
    return await fetch(f"{ROUTES['executions']}/{request_id}")


@app.get("/v1/executions/{request_id}/status")
async def get_execution_status(request_id: str):
    return await fetch(f"{ROUTES['executions']}/{request_id}/status")
