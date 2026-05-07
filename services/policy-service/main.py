from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import AuditLog, Policy, PolicyEffect, Role
from shared.schemas import PolicyCreate, PolicyEvaluationRequest, PolicyUpdate
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

settings = load_settings("policy-service", 8103)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="policy-service", version="1.0.0")


def get_db():
    with SessionLocal() as session:
        yield session


def policy_effect_value(effect):
    return effect.value if hasattr(effect, "value") else str(effect)


def listify(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def matches_list_condition(expected, actual):
    expected_items = listify(expected)
    if not expected_items:
        return True
    actual_items = listify(actual)
    return any(item in actual_items for item in expected_items)


def matches_context_tag(expected_tags, context):
    tags = set()
    if context.get("validation_case"):
        tags.add(context["validation_case"])
    tags.update(listify(context.get("tags", [])))
    if not expected_tags:
        return True
    return any(tag in tags for tag in listify(expected_tags))


def policy_matches(policy: Policy, payload: PolicyEvaluationRequest):
    conditions = policy.conditions or {}
    if conditions.get("role_ids") and payload.role_id not in conditions.get("role_ids", []):
        return False
    if conditions.get("team_ids") and payload.team_id not in conditions.get("team_ids", []):
        return False
    if conditions.get("execution_modes") and payload.execution_mode not in conditions.get("execution_modes", []):
        return False
    if conditions.get("provider_names") and payload.provider_name not in conditions.get("provider_names", []):
        return False
    if conditions.get("subsystems") and payload.context.get("subsystem") not in conditions.get("subsystems", []):
        return False
    if not matches_context_tag(conditions.get("context_tags"), payload.context):
        return False
    minimum_risk = conditions.get("min_risk_score")
    if minimum_risk is not None and payload.risk_score < float(minimum_risk):
        return False
    return True


def evaluate_limits(restrictions: dict[str, Any], payload: PolicyEvaluationRequest, violations: list[dict[str, Any]]):
    max_delegations = restrictions.get("max_delegations")
    if max_delegations is not None and payload.delegation_count > int(max_delegations):
        violations.append(
            {
                "type": "execution_limit",
                "field": "max_delegations",
                "message": f"Delegation count {payload.delegation_count} exceeds allowed limit {max_delegations}.",
            }
        )
    max_skill_executions = restrictions.get("max_skill_executions")
    if max_skill_executions is not None and payload.skill_execution_count > int(max_skill_executions):
        violations.append(
            {
                "type": "execution_limit",
                "field": "max_skill_executions",
                "message": f"Skill execution count {payload.skill_execution_count} exceeds allowed limit {max_skill_executions}.",
            }
        )


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
    db.flush()
    db.add(
        AuditLog(
            event_type="policy.created",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="policy",
            resource_id=policy.id,
            payload={"scope": policy.scope},
        )
    )
    db.commit()
    return {"ok": True, "policy": {"id": policy.id, "name": policy.name, "effect": policy_effect_value(policy.effect)}}


@app.get("/v1/policies")
def list_policies(db: Session = Depends(get_db)):
    policies = db.scalars(select(Policy).order_by(Policy.created_at.asc())).all()
    return {
        "ok": True,
        "policies": [
            {
                "id": policy.id,
                "name": policy.name,
                "scope": policy.scope,
                "effect": policy_effect_value(policy.effect),
                "approval_threshold": policy.approval_threshold,
                "conditions": policy.conditions,
                "restrictions": policy.restrictions,
            }
            for policy in policies
        ],
    }


@app.put("/v1/policies/{policy_id}")
def update_policy(policy_id: str, payload: PolicyUpdate, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="policy_not_found")
    policy.name = payload.name
    policy.scope = payload.scope
    policy.effect = payload.effect
    policy.approval_threshold = payload.approval_threshold
    policy.conditions = payload.conditions
    policy.restrictions = payload.restrictions
    db.add(
        AuditLog(
            event_type="policy.updated",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="policy",
            resource_id=policy.id,
            payload={"scope": policy.scope},
        )
    )
    db.commit()
    return {"ok": True, "policy": {"id": policy.id, "name": policy.name, "effect": policy_effect_value(policy.effect)}}


@app.post("/v1/policies/evaluate")
def evaluate_policy(payload: PolicyEvaluationRequest, db: Session = Depends(get_db)):
    policies = db.scalars(select(Policy)).all()
    role = db.get(Role, payload.role_id) if payload.role_id else None
    matched_policies = [policy for policy in policies if policy_matches(policy, payload)]

    role_permissions = role.permissions if role else {}
    allowed_skill_ids = set(role_permissions.get("allowed_skill_ids", []))
    restricted_skill_ids = set(role_permissions.get("restricted_skill_ids", []))
    allowed_delegation_targets = set(role_permissions.get("allowed_delegation_targets", []))

    approval_required = False
    violations: list[dict[str, Any]] = []
    matched_policy_names: list[str] = []

    for policy in matched_policies:
        matched_policy_names.append(policy.name)
        restrictions = policy.restrictions or {}
        effect = policy_effect_value(policy.effect)

        allowed_skill_ids.update(restrictions.get("allowed_skill_ids", []))
        allowed_delegation_targets.update(restrictions.get("allowed_delegation_targets", []))
        restricted_skill_ids.update(restrictions.get("skill_ids", []))

        if effect == "review" or restrictions.get("requires_approval"):
            approval_required = True

        evaluate_limits(restrictions, payload, violations)

        if payload.execution_mode == "delegation":
            target_name = payload.target_agent_name or ""
            target_identifier = payload.target_agent_id or ""
            if allowed_delegation_targets and target_name not in allowed_delegation_targets and target_identifier not in allowed_delegation_targets:
                violations.append(
                    {
                        "type": "delegation_forbidden",
                        "policy": policy.name,
                        "message": f"Delegation target {target_name or target_identifier or 'unknown'} is not allowed.",
                    }
                )
            blocked_targets = set(restrictions.get("delegation_targets", []))
            if blocked_targets and (target_name in blocked_targets or target_identifier in blocked_targets):
                violations.append(
                    {
                        "type": "delegation_blocked",
                        "policy": policy.name,
                        "message": f"Delegation target {target_name or target_identifier} is blocked by policy.",
                    }
                )

        if payload.execution_mode == "skill_execution":
            requested_skills = set(payload.skill_ids)
            if allowed_skill_ids and not requested_skills.issubset(allowed_skill_ids):
                violations.append(
                    {
                        "type": "skill_forbidden",
                        "policy": policy.name,
                        "message": "Requested skill is not allowed for the current role.",
                        "blocked_requested_skills": sorted(requested_skills.difference(allowed_skill_ids)),
                    }
                )
            blocked_skills = requested_skills.intersection(restricted_skill_ids)
            if blocked_skills:
                violations.append(
                    {
                        "type": "skill_blocked",
                        "policy": policy.name,
                        "message": "Requested skill is blocked by policy.",
                        "blocked_requested_skills": sorted(blocked_skills),
                    }
                )
            blocked_providers = set(restrictions.get("provider_names", []))
            if blocked_providers and payload.provider_name in blocked_providers:
                violations.append(
                    {
                        "type": "provider_blocked",
                        "policy": policy.name,
                        "message": f"Provider {payload.provider_name} is blocked by policy.",
                    }
                )

    approved = len(violations) == 0
    decision = {
        "approved": approved,
        "requires_approval": approval_required and approved,
        "allowed_skill_ids": sorted(allowed_skill_ids),
        "allowed_delegation_targets": sorted(allowed_delegation_targets),
        "restricted_skill_ids": sorted(restricted_skill_ids),
        "matched_policies": matched_policy_names,
        "violations": violations,
        "role_permissions": role_permissions,
    }
    db.add(
        AuditLog(
            event_type="policy.evaluated",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="policy",
            resource_id=payload.role_id or "global",
            payload=decision,
        )
    )
    db.commit()
    events.emit(
        "agent.decision",
        {
            "source": "policy-service",
            "decision": decision,
            "role_id": payload.role_id,
            "execution_mode": payload.execution_mode,
            "request_id": payload.request_id,
        },
    )
    return {"ok": True, "decision": decision}
