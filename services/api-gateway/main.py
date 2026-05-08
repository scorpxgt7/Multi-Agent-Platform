import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request

from shared.utils.security import build_operator_context

app = FastAPI(title="api-gateway", version="1.0.0")

AGENT_SERVICE_BASE = os.getenv("AGENT_SERVICE_URL", "http://agent-service:8102")
POLICY_SERVICE_BASE = os.getenv("POLICY_SERVICE_URL", "http://policy-service:8103")
ORCHESTRATOR_SERVICE_BASE = os.getenv("ORCHESTRATOR_SERVICE_URL", "http://orchestrator-service:8105")

ROUTES = {
    "skills": os.getenv("SKILL_SERVICE_URL", "http://skill-service:8101") + "/v1/skills",
    "roles": AGENT_SERVICE_BASE + "/v1/roles",
    "agents": AGENT_SERVICE_BASE + "/v1/agents",
    "teams": AGENT_SERVICE_BASE + "/v1/teams",
    "organizations": AGENT_SERVICE_BASE + "/v1/organizations",
    "operators": AGENT_SERVICE_BASE + "/v1/operators",
    "policies": POLICY_SERVICE_BASE + "/v1/policies",
    "tasks": ORCHESTRATOR_SERVICE_BASE + "/v1/tasks",
    "executions": ORCHESTRATOR_SERVICE_BASE + "/v1/executions",
}


async def resolve_identity(request: Request, *, required_permission: str | None = None, allow_anonymous: bool = False):
    api_key = request.headers.get("x-api-key", "").strip()
    if not api_key:
        if allow_anonymous:
            return None
        raise HTTPException(status_code=401, detail="api_key_required")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{AGENT_SERVICE_BASE}/internal/operators/resolve", params={"api_key": api_key})
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="invalid_api_key")
    payload = response.json()
    operator = payload.get("operator", {})
    context = build_operator_context(operator, operator.get("organization_id"))
    if required_permission and required_permission not in set(context["permissions"]):
        raise HTTPException(status_code=403, detail="permission_denied")
    return context


def forward_headers(identity: dict[str, Any] | None):
    headers = {"Content-Type": "application/json"}
    if identity:
        headers.update(
            {
                "x-organization-id": identity["organization_id"],
                "x-operator-id": identity["operator_id"],
                "x-operator-role": identity["operator_role"],
            }
        )
    return headers


async def forward(method: str, target: str, *, identity: dict[str, Any] | None = None, payload: dict[str, Any] | None = None):
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, target, json=payload, headers=forward_headers(identity))
    detail = None
    try:
        detail = response.json()
    except Exception:
        detail = response.text
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=detail)
    return detail


@app.get("/health")
def health():
    return {"ok": True, "service": "api-gateway"}


@app.post("/v1/organizations/bootstrap")
async def bootstrap_organization(payload: dict[str, Any]):
    return await forward("POST", f"{ROUTES['organizations']}/bootstrap", payload=payload)


@app.get("/v1/organizations")
async def list_organizations():
    return await forward("GET", ROUTES["organizations"])


@app.post("/v1/operators")
async def create_operator(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="operator:manage")
    return await forward("POST", ROUTES["operators"], identity=identity, payload=payload)


@app.get("/v1/operators")
async def list_operators(request: Request):
    identity = await resolve_identity(request, required_permission="operator:manage")
    return await forward("GET", ROUTES["operators"], identity=identity)


@app.put("/v1/operators/{operator_id}")
async def update_operator(operator_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="operator:manage")
    return await forward("PUT", f"{ROUTES['operators']}/{operator_id}", identity=identity, payload=payload)


@app.post("/v1/skills")
async def create_skill(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", ROUTES["skills"], identity=identity, payload=payload)


@app.get("/v1/skills")
async def list_skills(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", ROUTES["skills"], identity=identity)


@app.post("/v1/roles")
async def create_role(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", ROUTES["roles"], identity=identity, payload=payload)


@app.get("/v1/roles")
async def list_roles(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", ROUTES["roles"], identity=identity)


@app.post("/v1/agents")
async def create_agent(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", ROUTES["agents"], identity=identity, payload=payload)


@app.get("/v1/agents")
async def list_agents(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", ROUTES["agents"], identity=identity)


@app.put("/v1/agents/{agent_id}")
async def update_agent(agent_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("PUT", f"{ROUTES['agents']}/{agent_id}", identity=identity, payload=payload)


@app.post("/v1/teams")
async def create_team(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", ROUTES["teams"], identity=identity, payload=payload)


@app.get("/v1/teams")
async def list_teams(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", ROUTES["teams"], identity=identity)


@app.get("/v1/teams/{team_id}")
async def get_team(team_id: str, request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", f"{ROUTES['teams']}/{team_id}", identity=identity)


@app.put("/v1/teams/{team_id}")
async def update_team(team_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("PUT", f"{ROUTES['teams']}/{team_id}", identity=identity, payload=payload)


@app.post("/v1/policies")
async def create_policy(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="policy:manage")
    return await forward("POST", ROUTES["policies"], identity=identity, payload=payload)


@app.get("/v1/policies")
async def list_policies(request: Request):
    identity = await resolve_identity(request, required_permission="policy:view")
    return await forward("GET", ROUTES["policies"], identity=identity)


@app.put("/v1/policies/{policy_id}")
async def update_policy(policy_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="policy:manage")
    return await forward("PUT", f"{ROUTES['policies']}/{policy_id}", identity=identity, payload=payload)


@app.post("/v1/policies/evaluate")
async def evaluate_policy(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="policy:manage")
    return await forward("POST", f"{ROUTES['policies']}/evaluate", identity=identity, payload=payload)


@app.post("/v1/tasks")
async def create_task(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="execution:run")
    return await forward("POST", ROUTES["tasks"], identity=identity, payload=payload)


@app.get("/v1/executions")
async def list_executions(request: Request):
    identity = await resolve_identity(request, required_permission="execution:view")
    return await forward("GET", ROUTES["executions"], identity=identity)


@app.get("/v1/executions/{request_id}")
async def get_execution(request_id: str, request: Request):
    identity = await resolve_identity(request, required_permission="execution:view")
    return await forward("GET", f"{ROUTES['executions']}/{request_id}", identity=identity)


@app.get("/v1/executions/{request_id}/status")
async def get_execution_status(request_id: str, request: Request):
    identity = await resolve_identity(request, required_permission="execution:view")
    return await forward("GET", f"{ROUTES['executions']}/{request_id}/status", identity=identity)
