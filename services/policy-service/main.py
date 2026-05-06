from typing import Any

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import AuditLog, Policy, PolicyEffect, Role
from shared.schemas import PolicyCreate
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

settings = load_settings("policy-service", 8103)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="policy-service", version="1.0.0")


class PolicyEvaluationRequest(BaseModel):
    role_id: str | None = None
    skill_ids: list[str] = Field(default_factory=list)
    risk_score: float = 0.0
    context: dict[str, Any] = Field(default_factory=dict)


def get_db():
    with SessionLocal() as session:
        yield session


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name}


@app.post("/v1/policies")
def create_policy(payload: PolicyCreate, db: Session = Depends(get_db)):
    policy = Policy(
        name=payload.name,
        scope=payload.scope,
        effect=payload.effect,
        approval_threshold=payload.approval_threshold,
        conditions=payload.conditions,
        restrictions=payload.restrictions,
    )
    db.add(policy)
    db.add(AuditLog(event_type="policy.created", actor_type="service", actor_id=settings.service_name, resource_type="policy", resource_id=policy.id, payload={"scope": policy.scope}))
    db.commit()
    return {"ok": True, "policy": {"id": policy.id, "name": policy.name, "effect": policy.effect.value}}


@app.post("/v1/policies/evaluate")
def evaluate_policy(payload: PolicyEvaluationRequest, db: Session = Depends(get_db)):
    policies = db.scalars(select(Policy)).all()
    role = db.get(Role, payload.role_id) if payload.role_id else None
    role_restricted = set(role.permissions.get("restricted_skill_ids", []) if role else [])
    requested_skills = set(payload.skill_ids)
    approval_required = any(
        policy.effect == PolicyEffect.review and payload.risk_score >= policy.approval_threshold
        for policy in policies
    )
    denied = any(policy.effect == PolicyEffect.deny and payload.risk_score >= policy.approval_threshold for policy in policies)
    restricted_skills = {skill_id for policy in policies for skill_id in policy.restrictions.get("skill_ids", [])}
    restricted_skills.update(role_restricted)
    restricted_matches = sorted(requested_skills.intersection(restricted_skills))
    if restricted_matches:
        denied = True

    decision = {
        "approved": not denied,
        "requires_approval": approval_required and not denied,
        "restricted_skills": sorted(restricted_skills),
        "blocked_requested_skills": restricted_matches,
        "role_permissions": role.permissions if role else {},
    }
    db.add(AuditLog(event_type="policy.evaluated", actor_type="service", actor_id=settings.service_name, resource_type="policy", resource_id=payload.role_id or "global", payload=decision))
    db.commit()
    events.emit("agent.decision", {"source": "policy-service", "decision": decision, "role_id": payload.role_id})
    return {"ok": True, "decision": decision}
