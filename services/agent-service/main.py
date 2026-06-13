import logging
import os
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shared.models import Agent, AgentSkill, AuditLog, Operator, OperatorRole, Organization, Role, RoleSkill, Team, TeamAgent
from shared.schemas import AgentCreate, AgentUpdate, OperatorCreate, OperatorUpdate, OrganizationBootstrap, RoleCreate, TeamCreate, TeamUpdate
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus
from shared.utils.security import operator_role_value, require_request_organization, request_scope, role_permissions

settings = load_settings("agent-service", 8102)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="agent-service", version="1.0.0")
LOGGER = logging.getLogger("agent-service")


def get_db():
    with SessionLocal() as session:
        yield session


def role_skill_map(db: Session, role_ids: list[str]) -> dict[str, list[str]]:
    links = db.scalars(select(RoleSkill).where(RoleSkill.role_id.in_(role_ids))).all() if role_ids else []
    skills_by_role: dict[str, list[str]] = {}
    for link in links:
        skills_by_role.setdefault(link.role_id, []).append(link.skill_id)
    return skills_by_role


def agent_skill_map(db: Session, agent_ids: list[str]) -> dict[str, list[str]]:
    links = db.scalars(select(AgentSkill).where(AgentSkill.agent_id.in_(agent_ids))).all() if agent_ids else []
    skills_by_agent: dict[str, list[str]] = {}
    for link in links:
        skills_by_agent.setdefault(link.agent_id, []).append(link.skill_id)
    return skills_by_agent


def team_agent_map(db: Session, team_ids: list[str]) -> dict[str, list[str]]:
    links = db.scalars(select(TeamAgent).where(TeamAgent.team_id.in_(team_ids)).order_by(TeamAgent.priority.asc())).all() if team_ids else []
    agents_by_team: dict[str, list[str]] = {}
    for link in links:
        agents_by_team.setdefault(link.team_id, []).append(link.agent_id)
    return agents_by_team


def autonomy_value(value):
    return value.value if hasattr(value, "value") else str(value)


def serialize_organization(organization: Organization):
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "workspace_name": organization.workspace_name,
        "workspace_slug": organization.workspace_slug,
    }


def serialize_operator(operator: Operator):
    role = operator_role_value(operator.role)
    return {
        "id": operator.id,
        "organization_id": operator.organization_id,
        "name": operator.name,
        "email": operator.email,
        "role": role,
        "permissions": sorted(role_permissions(role, operator.permissions)),
        "is_active": operator.is_active,
    }


def create_operator_record(db: Session, *, organization_id: str, name: str, email: str, role: str, permissions: dict):
    operator = Operator(
        organization_id=organization_id,
        name=name,
        email=email,
        role=role,
        api_key=f"nexus_{secrets.token_urlsafe(24)}",
        permissions=permissions,
        is_active=True,
    )
    db.add(operator)
    db.flush()
    return operator


def audit_bootstrap_failure(db: Session, *, reason: str, request: Request, organization_slug: str | None = None):
    db.add(
        AuditLog(
            event_type="organization.bootstrap_failed",
            actor_type="anonymous",
            actor_id=request.client.host if request.client else "unknown",
            resource_type="organization",
            resource_id=organization_slug or "bootstrap",
            payload={"reason": reason, "organization_slug": organization_slug},
        )
    )
    db.commit()
    LOGGER.warning("bootstrap failed reason=%s organization_slug=%s", reason, organization_slug)


def require_bootstrap_token(request: Request, db: Session, organization_slug: str | None = None):
    expected_token = os.getenv("BOOTSTRAP_TOKEN", "").strip()
    provided_token = request.headers.get("x-bootstrap-token", "").strip()
    if not expected_token or not secrets.compare_digest(provided_token, expected_token):
        audit_bootstrap_failure(
            db,
            reason="invalid_bootstrap_token" if expected_token else "bootstrap_token_not_configured",
            request=request,
            organization_slug=organization_slug,
        )
        raise HTTPException(status_code=401, detail="bootstrap_token_required")


def request_organization_id(request: Request) -> str:
    return require_request_organization(request)


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name}


@app.post("/v1/organizations/bootstrap")
def bootstrap_organization(payload: OrganizationBootstrap, request: Request, db: Session = Depends(get_db)):
    require_bootstrap_token(request, db, payload.organization_slug)
    organization_count = db.scalar(select(func.count()).select_from(Organization)) or 0
    if organization_count > 0:
        audit_bootstrap_failure(
            db, reason="organizations_already_exist", request=request, organization_slug=payload.organization_slug
        )
        raise HTTPException(status_code=403, detail="bootstrap_closed")
    existing = db.scalar(select(Organization).where(Organization.slug == payload.organization_slug))
    if existing:
        raise HTTPException(status_code=409, detail="organization_slug_exists")

    organization = Organization(
        name=payload.organization_name,
        slug=payload.organization_slug,
        workspace_name=payload.workspace_name or f"{payload.organization_name} Workspace",
        workspace_slug=payload.workspace_slug or f"{payload.organization_slug}-workspace",
    )
    db.add(organization)
    db.flush()
    operator = create_operator_record(
        db,
        organization_id=organization.id,
        name=payload.operator_name,
        email=payload.operator_email,
        role=OperatorRole.admin.value,
        permissions={},
    )
    db.add(
        AuditLog(
            event_type="organization.bootstrapped",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="organization",
            resource_id=organization.id,
            payload={"operator_id": operator.id},
        )
    )
    db.commit()
    events.emit("organization.bootstrapped", {"organization_id": organization.id, "operator_id": operator.id})
    return {"ok": True, "organization": serialize_organization(organization), "operator": serialize_operator(operator), "api_key": operator.api_key}


@app.get("/v1/organizations")
def list_organizations(db: Session = Depends(get_db)):
    organizations = db.scalars(select(Organization).order_by(Organization.created_at.asc())).all()
    return {"ok": True, "organizations": [serialize_organization(item) for item in organizations]}


@app.get("/internal/operators/resolve")
def resolve_operator(api_key: str, db: Session = Depends(get_db)):
    operator = db.scalar(select(Operator).where(Operator.api_key == api_key))
    if not operator or not operator.is_active:
        raise HTTPException(status_code=401, detail="invalid_api_key")
    organization = db.get(Organization, operator.organization_id)
    return {"ok": True, "operator": serialize_operator(operator), "organization": serialize_organization(organization) if organization else None}


@app.post("/v1/operators")
def create_operator(payload: OperatorCreate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    existing = db.scalar(select(Operator).where(Operator.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="operator_email_exists")
    operator = create_operator_record(
        db,
        organization_id=organization_id,
        name=payload.name,
        email=payload.email,
        role=payload.role,
        permissions=payload.permissions,
    )
    db.add(
        AuditLog(
            event_type="operator.created",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or "system",
            resource_type="operator",
            resource_id=operator.id,
            payload={"organization_id": organization_id, "role": payload.role},
        )
    )
    db.commit()
    events.emit("operator.created", {"organization_id": organization_id, "operator_id": operator.id})
    return {"ok": True, "operator": serialize_operator(operator), "api_key": operator.api_key}


@app.get("/v1/operators")
def list_operators(request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    operators = db.scalars(select(Operator).where(Operator.organization_id == organization_id).order_by(Operator.created_at.asc())).all()
    return {"ok": True, "operators": [serialize_operator(item) for item in operators]}


@app.put("/v1/operators/{operator_id}")
def update_operator(operator_id: str, payload: OperatorUpdate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    operator = db.get(Operator, operator_id)
    if not operator or operator.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="operator_not_found")
    operator.name = payload.name
    operator.email = payload.email
    operator.role = payload.role
    operator.permissions = payload.permissions
    operator.is_active = payload.is_active
    db.add(
        AuditLog(
            event_type="operator.updated",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or "system",
            resource_type="operator",
            resource_id=operator.id,
            payload={"organization_id": organization_id, "role": payload.role, "is_active": payload.is_active},
        )
    )
    db.commit()
    events.emit("operator.updated", {"organization_id": organization_id, "operator_id": operator.id})
    return {"ok": True, "operator": serialize_operator(operator)}


@app.post("/v1/roles")
def create_role(payload: RoleCreate, db: Session = Depends(get_db)):
    role = Role(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        permissions=payload.permissions,
        approval_threshold=payload.approval_threshold,
    )
    db.add(role)
    db.flush()
    for skill_id in payload.skill_ids:
        db.add(RoleSkill(role_id=role.id, skill_id=skill_id))
    db.add(
        AuditLog(
            event_type="role.created",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="role",
            resource_id=role.id,
            payload={"slug": role.slug},
        )
    )
    db.commit()
    events.emit("role.created", {"role_id": role.id, "slug": role.slug})
    return {"ok": True, "role": {"id": role.id, "name": role.name, "approval_threshold": role.approval_threshold}}


@app.get("/v1/roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.scalars(select(Role).order_by(Role.created_at.asc())).all()
    skills_by_role = role_skill_map(db, [role.id for role in roles])
    return {
        "ok": True,
        "roles": [
            {
                "id": role.id,
                "name": role.name,
                "slug": role.slug,
                "description": role.description,
                "permissions": role.permissions,
                "approval_threshold": role.approval_threshold,
                "skill_ids": skills_by_role.get(role.id, []),
            }
            for role in roles
        ],
    }


@app.post("/v1/agents")
def create_agent(payload: AgentCreate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    agent = Agent(
        organization_id=organization_id,
        name=payload.name,
        role_id=payload.role_id,
        autonomy_level=payload.autonomy_level,
        memory_config=payload.memory_config,
        skill_overrides=payload.skill_overrides,
        config=payload.config,
    )
    db.add(agent)
    db.flush()
    for skill_id in payload.skill_ids:
        db.add(AgentSkill(agent_id=agent.id, skill_id=skill_id, override_config=payload.skill_overrides))
    db.add(
        AuditLog(
            event_type="agent.created",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or settings.service_name,
            resource_type="agent",
            resource_id=agent.id,
            payload={"role_id": agent.role_id, "organization_id": organization_id},
        )
    )
    db.commit()
    events.emit("agent.created", {"agent_id": agent.id, "role_id": agent.role_id, "organization_id": organization_id})
    return {
        "ok": True,
        "agent": {
            "id": agent.id,
            "organization_id": organization_id,
            "name": agent.name,
            "role_id": agent.role_id,
            "autonomy_level": autonomy_value(agent.autonomy_level),
        },
    }


@app.get("/v1/agents")
def list_agents(request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    agents = db.scalars(select(Agent).where(Agent.organization_id == organization_id).order_by(Agent.created_at.asc())).all()
    roles = {role.id: role for role in db.scalars(select(Role)).all()}
    skills_by_agent = agent_skill_map(db, [agent.id for agent in agents])
    return {
        "ok": True,
        "agents": [
            {
                "id": agent.id,
                "organization_id": organization_id,
                "name": agent.name,
                "role_id": agent.role_id,
                "role_name": roles.get(agent.role_id).name if roles.get(agent.role_id) else "",
                "autonomy_level": autonomy_value(agent.autonomy_level),
                "memory_config": agent.memory_config,
                "skill_overrides": agent.skill_overrides,
                "config": agent.config,
                "skill_ids": skills_by_agent.get(agent.id, []),
            }
            for agent in agents
        ],
    }


@app.put("/v1/agents/{agent_id}")
def update_agent(agent_id: str, payload: AgentUpdate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    agent = db.get(Agent, agent_id)
    if not agent or agent.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="agent_not_found")

    agent.name = payload.name
    agent.role_id = payload.role_id
    agent.autonomy_level = payload.autonomy_level
    agent.memory_config = payload.memory_config
    agent.skill_overrides = payload.skill_overrides
    agent.config = payload.config

    db.execute(delete(AgentSkill).where(AgentSkill.agent_id == agent_id))
    db.flush()
    for skill_id in payload.skill_ids:
        db.add(AgentSkill(agent_id=agent.id, skill_id=skill_id, override_config=payload.skill_overrides))

    db.add(
        AuditLog(
            event_type="agent.updated",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or settings.service_name,
            resource_type="agent",
            resource_id=agent.id,
            payload={"role_id": agent.role_id, "skill_ids": payload.skill_ids, "organization_id": organization_id},
        )
    )
    db.commit()
    events.emit("agent.updated", {"agent_id": agent.id, "role_id": agent.role_id, "organization_id": organization_id})
    return {
        "ok": True,
        "agent": {
            "id": agent.id,
            "organization_id": organization_id,
            "name": agent.name,
            "role_id": agent.role_id,
            "autonomy_level": autonomy_value(agent.autonomy_level),
        },
    }


@app.post("/v1/teams")
def create_team(payload: TeamCreate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    team = Team(organization_id=organization_id, name=payload.name, description=payload.description, governance_config=payload.governance_config)
    db.add(team)
    db.flush()
    for index, agent_id in enumerate(payload.agent_ids, start=1):
        db.add(TeamAgent(team_id=team.id, agent_id=agent_id, priority=index))
    db.add(
        AuditLog(
            event_type="team.created",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or settings.service_name,
            resource_type="team",
            resource_id=team.id,
            payload={"agent_ids": payload.agent_ids, "organization_id": organization_id},
        )
    )
    db.commit()
    events.emit("team.created", {"team_id": team.id, "agent_ids": payload.agent_ids, "organization_id": organization_id})
    return {"ok": True, "team": {"id": team.id, "organization_id": organization_id, "name": team.name, "agent_count": len(payload.agent_ids)}}


@app.get("/v1/teams/{team_id}")
def get_team(team_id: str, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    team = db.get(Team, team_id)
    if not team or team.organization_id != organization_id:
        return {"ok": False, "error": "team_not_found"}
    team_agents = db.scalars(select(TeamAgent).where(TeamAgent.team_id == team_id).order_by(TeamAgent.priority.asc())).all()
    return {
        "ok": True,
        "team": {
            "id": team.id,
            "organization_id": organization_id,
            "name": team.name,
            "description": team.description,
            "agent_ids": [item.agent_id for item in team_agents],
            "governance_config": team.governance_config,
        },
    }


@app.get("/v1/teams")
def list_teams(request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    teams = db.scalars(select(Team).where(Team.organization_id == organization_id).order_by(Team.created_at.asc())).all()
    agents_by_team = team_agent_map(db, [team.id for team in teams])
    return {
        "ok": True,
        "teams": [
            {
                "id": team.id,
                "organization_id": organization_id,
                "name": team.name,
                "description": team.description,
                "governance_config": team.governance_config,
                "agent_ids": agents_by_team.get(team.id, []),
            }
            for team in teams
        ],
    }


@app.put("/v1/teams/{team_id}")
def update_team(team_id: str, payload: TeamUpdate, request: Request, db: Session = Depends(get_db)):
    organization_id = request_organization_id(request)
    team = db.get(Team, team_id)
    if not team or team.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="team_not_found")

    team.name = payload.name
    team.description = payload.description
    team.governance_config = payload.governance_config

    db.execute(delete(TeamAgent).where(TeamAgent.team_id == team_id))
    db.flush()
    for index, agent_id in enumerate(payload.agent_ids, start=1):
        db.add(TeamAgent(team_id=team.id, agent_id=agent_id, priority=index))

    db.add(
        AuditLog(
            event_type="team.updated",
            actor_type="operator",
            actor_id=request_scope(request)["operator_id"] or settings.service_name,
            resource_type="team",
            resource_id=team.id,
            payload={"agent_ids": payload.agent_ids, "delegation_targets": payload.governance_config.get("delegation_targets", []), "organization_id": organization_id},
        )
    )
    db.commit()
    events.emit("team.updated", {"team_id": team.id, "agent_ids": payload.agent_ids, "organization_id": organization_id})
    return {"ok": True, "team": {"id": team.id, "organization_id": organization_id, "name": team.name, "agent_count": len(payload.agent_ids)}}
