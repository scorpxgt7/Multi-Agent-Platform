from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import Agent, AgentSkill, AuditLog, Role, RoleSkill, Team, TeamAgent
from shared.schemas import AgentCreate, RoleCreate, TeamCreate
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

settings = load_settings("agent-service", 8102)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="agent-service", version="1.0.0")


def get_db():
    with SessionLocal() as session:
        yield session


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name}


@app.post("/v1/roles")
def create_role(payload: RoleCreate, db: Session = Depends(get_db)):
    role = Role(name=payload.name, slug=payload.slug, description=payload.description, permissions=payload.permissions, approval_threshold=payload.approval_threshold)
    db.add(role)
    db.flush()
    for skill_id in payload.skill_ids:
        db.add(RoleSkill(role_id=role.id, skill_id=skill_id))
    db.add(AuditLog(event_type="role.created", actor_type="service", actor_id=settings.service_name, resource_type="role", resource_id=role.id, payload={"slug": role.slug}))
    db.commit()
    events.emit("role.created", {"role_id": role.id, "slug": role.slug})
    return {"ok": True, "role": {"id": role.id, "name": role.name, "approval_threshold": role.approval_threshold}}


@app.post("/v1/agents")
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    agent = Agent(
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
    db.add(AuditLog(event_type="agent.created", actor_type="service", actor_id=settings.service_name, resource_type="agent", resource_id=agent.id, payload={"role_id": agent.role_id}))
    db.commit()
    events.emit("agent.created", {"agent_id": agent.id, "role_id": agent.role_id})
    return {"ok": True, "agent": {"id": agent.id, "name": agent.name, "role_id": agent.role_id, "autonomy_level": agent.autonomy_level.value}}


@app.post("/v1/teams")
def create_team(payload: TeamCreate, db: Session = Depends(get_db)):
    team = Team(name=payload.name, description=payload.description, governance_config=payload.governance_config)
    db.add(team)
    db.flush()
    for index, agent_id in enumerate(payload.agent_ids, start=1):
        db.add(TeamAgent(team_id=team.id, agent_id=agent_id, priority=index))
    db.add(AuditLog(event_type="team.created", actor_type="service", actor_id=settings.service_name, resource_type="team", resource_id=team.id, payload={"agent_ids": payload.agent_ids}))
    db.commit()
    events.emit("team.created", {"team_id": team.id, "agent_ids": payload.agent_ids})
    return {"ok": True, "team": {"id": team.id, "name": team.name, "agent_count": len(payload.agent_ids)}}


@app.get("/v1/teams/{team_id}")
def get_team(team_id: str, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        return {"ok": False, "error": "team_not_found"}
    team_agents = db.scalars(select(TeamAgent).where(TeamAgent.team_id == team_id).order_by(TeamAgent.priority.asc())).all()
    return {"ok": True, "team": {"id": team.id, "name": team.name, "agent_ids": [item.agent_id for item in team_agents], "governance_config": team.governance_config}}
