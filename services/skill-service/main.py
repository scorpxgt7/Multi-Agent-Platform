import os

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.llm import get_provider
from shared.llm.mock_provider import MockProvider
from shared.models import AuditLog, Skill, SkillDependency
from shared.schemas import SkillCreate, SkillExecuteRequest
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus
from shared.utils.security import redact_sensitive, sign_internal_headers, verify_internal_request

settings = load_settings("skill-service", 8101)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
provider, provider_status = get_provider(settings)
app = FastAPI(title="skill-service", version="1.0.0")
POLICY_SERVICE_URL = os.getenv("POLICY_SERVICE_URL", "http://policy-service:8103")


@app.middleware("http")
async def enforce_internal_auth(request: Request, call_next):
    if request.url.path != "/health":
        try:
            verify_internal_request(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


def get_db():
    with SessionLocal() as session:
        yield session


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name, "provider": provider_status}


@app.post("/v1/skills")
def create_skill(payload: SkillCreate, db: Session = Depends(get_db)):
    skill = Skill(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        version=payload.version,
        execution_type=payload.execution_type,
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
        config=payload.config,
    )
    db.add(skill)
    db.flush()
    for dependency_id in payload.dependency_ids:
        db.add(SkillDependency(skill_id=skill.id, depends_on_skill_id=dependency_id))
    db.add(AuditLog(event_type="skill.created", actor_type="service", actor_id=settings.service_name, resource_type="skill", resource_id=skill.id, payload={"slug": skill.slug}))
    db.commit()
    db.refresh(skill)
    events.emit("skill.created", {"skill_id": skill.id, "slug": skill.slug})
    return {"ok": True, "skill": {"id": skill.id, "name": skill.name, "slug": skill.slug, "version": skill.version}}


@app.get("/v1/skills")
def list_skills(db: Session = Depends(get_db)):
    skills = db.scalars(select(Skill).order_by(Skill.created_at.desc())).all()
    return {"ok": True, "skills": [{"id": skill.id, "name": skill.name, "slug": skill.slug, "version": skill.version, "execution_type": skill.execution_type.value} for skill in skills]}


@app.post("/skills/{skill_id}/execute")
def execute_skill(skill_id: str, payload: SkillExecuteRequest, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    policy_payload = {
        "role_id": payload.context.get("role_id"),
        "team_id": payload.context.get("team_id"),
        "skill_ids": [skill.id],
        "provider_name": provider_status.get("selected"),
        "execution_mode": "skill_execution",
        "risk_score": payload.context.get("risk_score", 0.0),
        "skill_execution_count": payload.context.get("skill_execution_count", 1),
        "request_id": payload.context.get("request_id"),
        "context": payload.context,
    }
    try:
        organization_id = payload.context.get("organization_id", "")
        operator_id = payload.context.get("operator_id", payload.actor_id)
        operator_role = payload.context.get("operator_role", "operator")
        headers = {"x-organization-id": organization_id, "x-operator-id": operator_id, "x-operator-role": operator_role}
        headers.update(sign_internal_headers(method="POST", path="/v1/policies/evaluate", organization_id=organization_id, operator_id=operator_id, operator_role=operator_role))
        response = httpx.post(f"{POLICY_SERVICE_URL}/v1/policies/evaluate", json=policy_payload, headers=headers, timeout=20.0)
        response.raise_for_status()
        decision = response.json().get("decision", {})
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Policy validation failed: {type(error).__name__}") from error

    if not decision.get("approved", True):
        violation_payload = {
            "request_id": payload.context.get("request_id"),
            "skill_id": skill.id,
            "provider_name": provider_status.get("selected"),
            "violations": decision.get("violations", []),
        }
        db.add(
            AuditLog(
                event_type="policy.violation",
                actor_type="agent",
                actor_id=payload.actor_id,
                resource_type="skill",
                resource_id=skill.id,
                payload=violation_payload,
            )
        )
        db.commit()
        events.emit("policy.violation", violation_payload)
        raise HTTPException(status_code=403, detail={"code": "policy_violation", "decision": decision})

    execution_payload = {
        "input": payload.input,
        "context": redact_sensitive(payload.context),
        "tools": redact_sensitive(skill.config.get("tools", [])),
    }
    active_provider_status = dict(provider_status)
    try:
        provider_response = provider.generate(skill.config.get("prompt", ""), execution_payload)
    except Exception as error:
        fallback_provider = MockProvider()
        provider_response = fallback_provider.generate(skill.config.get("prompt", ""), execution_payload)
        active_provider_status["fallback"] = True
        active_provider_status["reason"] = f"provider_error:{type(error).__name__}"
    result = {
        "skill_id": skill.id,
        "version": skill.version,
        "execution_type": skill.execution_type.value,
        "input": payload.input,
        "output": {
            "summary": f"Executed {skill.name} with {skill.execution_type.value} mode.",
            "prompt": redact_sensitive({"prompt": skill.config.get("prompt", "")})["prompt"],
            "tools": redact_sensitive(skill.config.get("tools", [])),
            "context": redact_sensitive(payload.context),
            "provider_text": redact_sensitive({"provider_text": provider_response.output_text})["provider_text"],
        },
        "provider": {
            "selected": active_provider_status["selected"],
            "active": provider_response.provider,
            "model": provider_response.model,
            "metadata": provider_response.metadata,
            "fallback": active_provider_status.get("fallback", False),
            "reason": active_provider_status.get("reason"),
        },
    }
    audit_result = {
        "request_id": payload.context.get("request_id"),
        "skill_id": skill.id,
        "version": skill.version,
        "execution_type": skill.execution_type.value,
        "provider": result["provider"],
        "status": "completed",
    }
    db.add(AuditLog(event_type="skill.executed", actor_type="agent", actor_id=payload.actor_id, resource_type="skill", resource_id=skill.id, payload=redact_sensitive(audit_result)))
    db.commit()
    events.emit("skill.executed", redact_sensitive(audit_result))
    return {"ok": True, "result": result}
