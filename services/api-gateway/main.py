import logging
import os
import secrets
from typing import Any
import time
from collections import defaultdict, deque

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from shared.utils.security import build_operator_context, sign_internal_headers

app = FastAPI(title="api-gateway", version="1.0.0")
LOGGER = logging.getLogger("api-gateway")

# Production-safe CORS handling (configure via CORS_ALLOWED_ORIGINS env var)
origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
_origins = [o.strip() for o in origins_env.split(",") if o.strip()] if origins_env else []
if _origins:
    app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# Rate limiting configuration:
# - Production/multi-instance deployments should set REDIS_URL so all gateway replicas
#   share counters through Redis.
# - Without REDIS_URL, the limiter uses an in-process fallback for local development
#   and single-process smoke tests only; counters are not shared across processes.
class SimpleRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 120, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = int(os.getenv("RATE_LIMIT_REQUESTS", max_requests))
        self.window = int(os.getenv("RATE_LIMIT_WINDOW", window_seconds))
        self.cleanup_interval = int(os.getenv("RATE_LIMIT_CLEANUP_INTERVAL", str(max(60, self.window))))
        self.trusted_proxies = _parse_trusted_proxies(os.getenv("TRUSTED_PROXY_CIDRS", ""))
        self.redis_url = os.getenv("REDIS_URL", "").strip()
        self._redis = None
        self._clients = defaultdict(lambda: {"count": 0, "ts": time.time(), "last_seen": time.time()})
        self._last_cleanup = time.time()

    async def dispatch(self, request, call_next):
        # Don't rate limit health checks
        if request.url.path.startswith("/health"):
            return await call_next(request)

        client_ip = self._client_ip(request)
        now = time.time()
        if self.redis_url:
            count, reset_at = await self._increment_redis(client_ip, now)
        else:
            count, reset_at = self._increment_memory(client_ip, now)

        if count > self.max_requests:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=429, content={"detail": "rate_limit_exceeded"}, headers=self._headers(count, reset_at))

        response = await call_next(request)
        response.headers.update(self._headers(count, reset_at))
        return response

    def _client_ip(self, request: Request) -> str:
        peer_host = request.client.host if request.client else "unknown"
        if self._is_trusted_proxy(peer_host):
            forwarded_for = request.headers.get("x-forwarded-for", "")
            first_forwarded = forwarded_for.split(",", 1)[0].strip()
            if first_forwarded:
                return first_forwarded
            real_ip = request.headers.get("x-real-ip", "").strip()
            if real_ip:
                return real_ip
        return peer_host

    def _is_trusted_proxy(self, peer_host: str) -> bool:
        try:
            import ipaddress
            peer_ip = ipaddress.ip_address(peer_host)
        except ValueError:
            return False
        return any(peer_ip in network for network in self.trusted_proxies)

    async def _increment_redis(self, client_ip: str, now: float) -> tuple[int, int]:
        redis_client = await self._redis_client()
        bucket = int(now // self.window)
        key = f"api-gateway:rate-limit:{client_ip}:{bucket}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, self.window * 2)
        reset_at = (bucket + 1) * self.window
        return int(count), int(reset_at)

    async def _redis_client(self):
        if self._redis is None:
            import redis.asyncio as redis
            self._redis = redis.from_url(self.redis_url, encoding="utf-8", decode_responses=True)
        return self._redis

    def _increment_memory(self, client_ip: str, now: float) -> tuple[int, int]:
        self._cleanup_stale_clients(now)
        entry = self._clients[client_ip]
        if now - entry["ts"] > self.window:
            entry["ts"] = now
            entry["count"] = 0
        entry["count"] += 1
        entry["last_seen"] = now
        return int(entry["count"]), int(entry["ts"] + self.window)

    def _cleanup_stale_clients(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        if now - self._last_cleanup < self.cleanup_interval:
            return 0
        stale_after = self.window + self.cleanup_interval
        stale_keys = [key for key, entry in self._clients.items() if now - entry.get("last_seen", entry["ts"]) > stale_after]
        for key in stale_keys:
            self._clients.pop(key, None)
        self._last_cleanup = now
        return len(stale_keys)

    def _headers(self, count: int, reset_at: int) -> dict[str, str]:
        return {
            "X-RateLimit-Limit": str(self.max_requests),
            "X-RateLimit-Remaining": str(max(0, self.max_requests - count)),
            "X-RateLimit-Reset": str(reset_at),
        }


def _parse_trusted_proxies(value: str):
    import ipaddress
    networks = []
    for raw_proxy in value.split(","):
        proxy = raw_proxy.strip()
        if not proxy:
            continue
        networks.append(ipaddress.ip_network(proxy, strict=False))
    return tuple(networks)


# Attach rate limiter (scaffold)
app.add_middleware(SimpleRateLimiter)

# Timeouts and request controls (configurable)
IDENTITY_TIMEOUT = float(os.getenv("IDENTITY_REQUEST_TIMEOUT", "10.0"))
FORWARD_TIMEOUT = float(os.getenv("API_GATEWAY_REQUEST_TIMEOUT", "30.0"))

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
    "workflows": ORCHESTRATOR_SERVICE_BASE + "/v1/workflows",
    "workflow_queue": ORCHESTRATOR_SERVICE_BASE + "/v1/workflows/queue/status",
    "workflow_enqueue": ORCHESTRATOR_SERVICE_BASE + "/v1/workflows/enqueue",
}


async def resolve_identity(request: Request, *, required_permission: str | None = None, allow_anonymous: bool = False):
    api_key = request.headers.get("x-api-key", "").strip()
    if not api_key:
        if allow_anonymous:
            return None
        raise HTTPException(status_code=401, detail="api_key_required")

    async with httpx.AsyncClient(timeout=IDENTITY_TIMEOUT) as client:
        response = await client.get(
            f"{AGENT_SERVICE_BASE}/internal/operators/resolve",
            params={"api_key": api_key},
            headers={**sign_internal_headers(method="GET", path="/internal/operators/resolve", organization_id="gateway", operator_id="gateway", operator_role="service")},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="invalid_api_key")
    payload = response.json()
    operator = payload.get("operator", {})
    context = build_operator_context(operator, operator.get("organization_id"))
    if required_permission and required_permission not in set(context["permissions"]):
        raise HTTPException(status_code=403, detail="permission_denied")
    return context


def forward_headers(identity: dict[str, Any] | None, *, method: str = "GET", path: str = "/"):
    headers = {"Content-Type": "application/json"}
    if identity:
        headers.update(
            {
                "x-organization-id": identity["organization_id"],
                "x-operator-id": identity["operator_id"],
                "x-operator-role": identity["operator_role"],
            }
        )
        headers.update(
            sign_internal_headers(
                method=method,
                path=path,
                organization_id=identity["organization_id"] or "",
                operator_id=identity["operator_id"] or "",
                operator_role=identity["operator_role"] or "",
            )
        )
    return headers


async def forward(
    method: str,
    target: str,
    *,
    identity: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    extra_headers: dict[str, str] | None = None,
):
    target_path = httpx.URL(target).path
    headers = forward_headers(identity, method=method, path=target_path)
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT) as client:
        response = await client.request(method, target, json=payload, headers=headers)
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
async def bootstrap_organization(payload: dict[str, Any], request: Request):
    expected_token = os.getenv("BOOTSTRAP_TOKEN", "").strip()
    provided_token = request.headers.get("x-bootstrap-token", "").strip()
    if not expected_token or not secrets.compare_digest(provided_token, expected_token):
        LOGGER.warning(
            "bootstrap rejected at gateway client=%s configured=%s",
            request.client.host if request.client else "unknown",
            bool(expected_token),
        )
        raise HTTPException(status_code=401, detail="bootstrap_token_required")
    return await forward(
        "POST",
        f"{ROUTES['organizations']}/bootstrap",
        payload=payload,
        identity={"organization_id": "bootstrap", "operator_id": "bootstrap", "operator_role": "admin"},
        extra_headers={"x-bootstrap-token": provided_token},
    )


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


@app.post("/v1/workflows/enqueue")
async def enqueue_workflow(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="execution:run")
    return await forward("POST", ROUTES["workflow_enqueue"], identity=identity, payload=payload)


@app.post("/v1/workflows/{request_id}/cancel")
async def cancel_workflow(request_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="execution:run")
    return await forward("POST", f"{ROUTES['workflows']}/{request_id}/cancel", identity=identity, payload=payload)


@app.post("/v1/workflows/{request_id}/retry")
async def retry_workflow(request_id: str, payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="execution:run")
    return await forward("POST", f"{ROUTES['workflows']}/{request_id}/retry", identity=identity, payload=payload)


@app.get("/v1/workflows/queue/status")
async def workflow_queue_status(request: Request):
    identity = await resolve_identity(request, required_permission="execution:view")
    return await forward("GET", ROUTES["workflow_queue"], identity=identity)


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


@app.get("/v1/workflows/active")
async def get_active_workflow(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", f"{ROUTES['workflows']}/active", identity=identity)


@app.post("/v1/workflows/validate")
async def validate_workflow(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", f"{ROUTES['workflows']}/validate", identity=identity, payload=payload)


@app.post("/v1/workflows/deploy")
async def deploy_workflow(payload: dict[str, Any], request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", f"{ROUTES['workflows']}/deploy", identity=identity, payload=payload)


@app.get("/v1/workflows/versions")
async def list_workflow_versions(request: Request):
    identity = await resolve_identity(request, required_permission="registry:view")
    return await forward("GET", f"{ROUTES['workflows']}/versions", identity=identity)


@app.post("/v1/workflows/{deployment_id}/rollback")
async def rollback_workflow(deployment_id: str, request: Request):
    identity = await resolve_identity(request, required_permission="registry:manage")
    return await forward("POST", f"{ROUTES['workflows']}/{deployment_id}/rollback", identity=identity)


@app.get("/v1/diagnostics")
async def diagnostics():
    """Lightweight diagnostics aggregator for core internal services."""
    services = {
        "skill": os.getenv("SKILL_SERVICE_URL", "http://skill-service:8101"),
        "agent": os.getenv("AGENT_SERVICE_URL", "http://agent-service:8102"),
        "policy": os.getenv("POLICY_SERVICE_URL", "http://policy-service:8103"),
        "memory": os.getenv("MEMORY_SERVICE_URL", "http://memory-service:8104"),
        "orchestrator": os.getenv("ORCHESTRATOR_SERVICE_URL", "http://orchestrator-service:8105"),
    }
    results: dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT) as client:
        for name, base in services.items():
            try:
                resp = await client.get(f"{base}/health")
                payload = None
                try:
                    payload = resp.json()
                except Exception:
                    payload = resp.text
                results[name] = {"ok": resp.status_code == 200, "status_code": resp.status_code, "payload": payload}
            except Exception as exc:
                results[name] = {"ok": False, "error": str(exc)}
    return {"ok": True, "service": "api-gateway", "diagnostics": results}


@app.get("/v1/deployment/report")
async def deployment_report(verbose: bool = False):
    """A convenience report combining diagnostics and basic readiness checks."""
    diag = await diagnostics()
    report = {"ok": True, "service": "api-gateway", "diagnostics": diag.get("diagnostics", {})}
    if verbose:
        # attempt to surface queue status from orchestrator if available
        try:
            async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT) as client:
                q = await client.get(f"{ORCHESTRATOR_SERVICE_BASE}/v1/workflows/queue/status")
                try:
                    report["queue"] = q.json()
                except Exception:
                    report["queue"] = {"status_code": q.status_code, "text": q.text}
        except Exception as _:
            report["queue"] = {"ok": False}
    return report


@app.get("/v1/deployment/audit")
async def deployment_audit(limit: int = 200):
    """Return the most recent deployment audit events from a host-level audit file.
    Path is configured with DEPLOY_AUDIT_LOG_FILE environment variable. This is a lightweight
    scaffold for deployment audit visibility; in production use centralized logging.
    """
    log_path = os.getenv("DEPLOY_AUDIT_LOG_FILE", "/var/deploy/multi-agent/audit.log")
    if not os.path.exists(log_path):
        return {"ok": True, "events": []}
    try:
        with open(log_path, "r") as fh:
            lines = list(deque(fh, maxlen=limit))
        # return newest first
        events = [l.strip() for l in lines[::-1]]
        return {"ok": True, "events": events}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc)}
