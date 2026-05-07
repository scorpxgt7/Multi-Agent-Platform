from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from shared.models import Agent, AgentSkill, AuditLog, Role, RoleSkill, Team, TeamAgent
from shared.schemas import AgentCreate, AgentUpdate, RoleCreate, TeamCreate, TeamUpdate
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


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name}


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
    db.add(
        AuditLog(
            event_type="agent.created",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="agent",
            resource_id=agent.id,
            payload={"role_id": agent.role_id},
        )
    )
    db.commit()
    events.emit("agent.created", {"agent_id": agent.id, "role_id": agent.role_id})
    return {"ok": True, "agent": {"id": agent.id, "name": agent.name, "role_id": agent.role_id, "autonomy_level": autonomy_value(agent.autonomy_level)}}


@app.get("/v1/agents")
def list_agents(db: Session = Depends(get_db)):
    agents = db.scalars(select(Agent).order_by(Agent.created_at.asc())).all()
    roles = {role.id: role for role in db.scalars(select(Role)).all()}
    skills_by_agent = agent_skill_map(db, [agent.id for agent in agents])
    return {
        "ok": True,
        "agents": [
            {
                "id": agent.id,
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
def update_agent(agent_id: str, payload: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
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
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="agent",
            resource_id=agent.id,
            payload={"role_id": agent.role_id, "skill_ids": payload.skill_ids},
        )
    )
    db.commit()
    events.emit("agent.updated", {"agent_id": agent.id, "role_id": agent.role_id})
    return {"ok": True, "agent": {"id": agent.id, "name": agent.name, "role_id": agent.role_id, "autonomy_level": autonomy_value(agent.autonomy_level)}}


@app.post("/v1/teams")
def create_team(payload: TeamCreate, db: Session = Depends(get_db)):
    team = Team(name=payload.name, description=payload.description, governance_config=payload.governance_config)
    db.add(team)
    db.flush()
    for index, agent_id in enumerate(payload.agent_ids, start=1):
        db.add(TeamAgent(team_id=team.id, agent_id=agent_id, priority=index))
    db.add(
        AuditLog(
            event_type="team.created",
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="team",
            resource_id=team.id,
            payload={"agent_ids": payload.agent_ids},
        )
    )
    db.commit()
    events.emit("team.created", {"team_id": team.id, "agent_ids": payload.agent_ids})
    return {"ok": True, "team": {"id": team.id, "name": team.name, "agent_count": len(payload.agent_ids)}}


@app.get("/v1/teams/{team_id}")
def get_team(team_id: str, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        return {"ok": False, "error": "team_not_found"}
    team_agents = db.scalars(select(TeamAgent).where(TeamAgent.team_id == team_id).order_by(TeamAgent.priority.asc())).all()
    return {
        "ok": True,
        "team": {
            "id": team.id,
            "name": team.name,
            "description": team.description,
            "agent_ids": [item.agent_id for item in team_agents],
            "governance_config": team.governance_config,
        },
    }


@app.get("/v1/teams")
def list_teams(db: Session = Depends(get_db)):
    teams = db.scalars(select(Team).order_by(Team.created_at.asc())).all()
    agents_by_team = team_agent_map(db, [team.id for team in teams])
    return {
        "ok": True,
        "teams": [
            {
                "id": team.id,
                "name": team.name,
                "description": team.description,
                "governance_config": team.governance_config,
                "agent_ids": agents_by_team.get(team.id, []),
            }
            for team in teams
        ],
    }


@app.put("/v1/teams/{team_id}")
def update_team(team_id: str, payload: TeamUpdate, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
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
            actor_type="service",
            actor_id=settings.service_name,
            resource_type="team",
            resource_id=team.id,
            payload={"agent_ids": payload.agent_ids, "delegation_targets": payload.governance_config.get("delegation_targets", [])},
        )
    )
    db.commit()
    events.emit("team.updated", {"team_id": team.id, "agent_ids": payload.agent_ids})
    return {"ok": True, "team": {"id": team.id, "name": team.name, "agent_count": len(payload.agent_ids)}}
