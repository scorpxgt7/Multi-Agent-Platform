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
}


async def forward(target: str, payload: dict[str, Any]):
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(target, json=payload)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@app.get("/health")
def health():
    return {"ok": True, "service": "api-gateway"}


@app.post("/v1/skills")
async def create_skill(payload: dict[str, Any]):
    return await forward(ROUTES["skills"], payload)


@app.post("/v1/roles")
async def create_role(payload: dict[str, Any]):
    return await forward(ROUTES["roles"], payload)


@app.post("/v1/agents")
async def create_agent(payload: dict[str, Any]):
    return await forward(ROUTES["agents"], payload)


@app.post("/v1/teams")
async def create_team(payload: dict[str, Any]):
    return await forward(ROUTES["teams"], payload)


@app.post("/v1/policies")
async def create_policy(payload: dict[str, Any]):
    return await forward(ROUTES["policies"], payload)


@app.post("/v1/tasks")
async def create_task(payload: dict[str, Any]):
    return await forward(ROUTES["tasks"], payload)
