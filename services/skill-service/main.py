from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import AuditLog, Skill, SkillDependency
from shared.schemas import SkillCreate, SkillExecuteRequest
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

settings = load_settings("skill-service", 8101)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="skill-service", version="1.0.0")


def get_db():
    with SessionLocal() as session:
        yield session


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name}


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

    result = {
        "skill_id": skill.id,
        "version": skill.version,
        "execution_type": skill.execution_type.value,
        "input": payload.input,
        "output": {
            "summary": f"Executed {skill.name} with {skill.execution_type.value} mode.",
            "prompt": skill.config.get("prompt", ""),
            "tools": skill.config.get("tools", []),
            "context": payload.context,
        },
    }
    db.add(AuditLog(event_type="skill.executed", actor_type="agent", actor_id=payload.actor_id, resource_type="skill", resource_id=skill.id, payload=result))
    db.commit()
    events.emit("skill.executed", result)
    return {"ok": True, "result": result}
