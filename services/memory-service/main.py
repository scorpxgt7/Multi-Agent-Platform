import math
from collections import defaultdict

from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import AuditLog, MemoryRecord
from shared.schemas import MemorySearch, MemoryWrite
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus

settings = load_settings("memory-service", 8104)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="memory-service", version="1.0.0")
SHORT_TERM_MEMORY: dict[str, list[dict]] = defaultdict(list)


def get_db():
    with SessionLocal() as session:
        yield session


def embed_text(value: str) -> list[float]:
    buckets = [0.0] * 16
    for token in value.lower().split():
        buckets[hash(token) % len(buckets)] += 1.0
    magnitude = math.sqrt(sum(bucket * bucket for bucket in buckets)) or 1.0
    return [bucket / magnitude for bucket in buckets]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    return sum(a * b for a, b in zip(left, right))


@app.get("/health")
def health():
    return {"ok": True, "service": settings.service_name, "vector_backend": settings.vector_backend}


@app.post("/v1/memory/write")
def write_memory(payload: MemoryWrite, db: Session = Depends(get_db)):
    if payload.scope == "short_term":
        SHORT_TERM_MEMORY[payload.namespace].append({"content": payload.content, "metadata": payload.metadata})
        events.emit("memory.updated", {"scope": "short_term", "namespace": payload.namespace})
        return {"ok": True, "scope": "short_term", "namespace": payload.namespace}

    record = MemoryRecord(
        namespace=payload.namespace,
        scope=payload.scope,
        content=payload.content,
        metadata_payload=payload.metadata,
        embedding=embed_text(payload.content),
    )
    db.add(record)
    db.flush()
    db.add(AuditLog(event_type="memory.written", actor_type="service", actor_id=settings.service_name, resource_type="memory", resource_id=record.id, payload={"namespace": payload.namespace, "scope": payload.scope}))
    db.commit()
    return {"ok": True, "memory_id": record.id}


@app.post("/v1/memory/search")
def search_memory(payload: MemorySearch, db: Session = Depends(get_db)):
    query_embedding = embed_text(payload.query)
    short_term = SHORT_TERM_MEMORY.get(payload.namespace, [])[: payload.top_k]
    rows = db.scalars(select(MemoryRecord).where(MemoryRecord.namespace == payload.namespace)).all()
    ranked = sorted(
        [
            {
                "id": row.id,
                "content": row.content,
                "metadata": row.metadata_payload,
                "score": cosine_similarity(query_embedding, row.embedding or []),
            }
            for row in rows
        ],
        key=lambda item: item["score"],
        reverse=True,
    )[: payload.top_k]
    return {"ok": True, "short_term": short_term, "long_term": ranked}
