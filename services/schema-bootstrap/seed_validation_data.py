from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import Agent, AgentSkill, Policy, PolicyEffect, Role, RoleSkill, Skill, Team, TeamAgent


def seed_validation_data(session: Session):
    skill = session.scalar(select(Skill).where(Skill.slug == "finance-approval-skill"))
    if skill is None:
        skill = Skill(
            name="Finance Approval Skill",
            slug="finance-approval-skill",
            description="Validation skill used by the finance agent during orchestration checks.",
            version="1.0.0",
            execution_type="hybrid",
            input_schema={"type": "object", "properties": {"task": {"type": "string"}}},
            output_schema={"type": "object", "properties": {"summary": {"type": "string"}}},
            config={
                "prompt": "Assess the task and produce a finance-oriented recommendation.",
                "tools": ["budget-analyzer", "risk-scorer"],
            },
        )
        session.add(skill)
        session.flush()

    role = session.scalar(select(Role).where(Role.slug == "finance-role"))
    if role is None:
        role = Role(
            name="Finance Role",
            slug="finance-role",
            description="Finance specialist role for orchestration validation.",
            permissions={"restricted_skill_ids": []},
            approval_threshold=0.95,
        )
        session.add(role)
        session.flush()
        session.add(RoleSkill(role_id=role.id, skill_id=skill.id))

    agent = session.scalar(select(Agent).where(Agent.name == "Finance Agent"))
    if agent is None:
        agent = Agent(
            name="Finance Agent",
            role_id=role.id,
            autonomy_level="supervised",
            memory_config={"scope": "team"},
            skill_overrides={},
            config={"specialty": "finance"},
        )
        session.add(agent)
        session.flush()
        session.add(AgentSkill(agent_id=agent.id, skill_id=skill.id, override_config={}))

    team = session.scalar(select(Team).where(Team.name == "Head Admin Team"))
    if team is None:
        team = Team(
            name="Head Admin Team",
            description="Validation team for end-to-end orchestration checks.",
            governance_config={"risk_score": 0.25},
        )
        session.add(team)
        session.flush()
        session.add(TeamAgent(team_id=team.id, agent_id=agent.id, priority=1, approval_required=False))

    policy = session.scalar(select(Policy).where(Policy.name == "Validation Approval Policy"))
    if policy is None:
        policy = Policy(
            name="Validation Approval Policy",
            scope="validation",
            effect=PolicyEffect.review,
            approval_threshold=0.9,
            conditions={"environment": "validation"},
            restrictions={"skill_ids": []},
        )
        session.add(policy)

    session.commit()
