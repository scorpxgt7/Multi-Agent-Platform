import math
from collections import defaultdict

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import AuditLog, MemoryRecord
from shared.schemas import MemorySearch, MemoryWrite
from shared.utils.config import load_settings
from shared.utils.database import create_session_factory
from shared.utils.events import EventBus
from shared.utils.security import redact_sensitive, require_request_organization, verify_internal_request

settings = load_settings("memory-service", 8104)
SessionLocal = create_session_factory(settings.database_url)
events = EventBus(settings.redis_url, settings.event_channel)
app = FastAPI(title="memory-service", version="1.0.0")
SHORT_TERM_MEMORY: dict[tuple[str, str], list[dict]] = defaultdict(list)
MAX_MEMORY_CONTENT_LENGTH = int(__import__("os").getenv("MAX_MEMORY_CONTENT_LENGTH", "20000"))
MAX_MEMORY_METADATA_BYTES = int(__import__("os").getenv("MAX_MEMORY_METADATA_BYTES", "12000"))
MAX_MEMORY_TOP_K = int(__import__("os").getenv("MAX_MEMORY_TOP_K", "25"))
MAX_SHORT_TERM_RECORDS = int(__import__("os").getenv("MAX_SHORT_TERM_RECORDS", "200"))


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
def write_memory(payload: MemoryWrite, request: Request, db: Session = Depends(get_db)):
    organization_id = require_request_organization(request)
    if len(payload.content) > MAX_MEMORY_CONTENT_LENGTH:
        raise HTTPException(status_code=413, detail="memory_content_too_large")
    import json
    if len(json.dumps(payload.metadata)) > MAX_MEMORY_METADATA_BYTES:
        raise HTTPException(status_code=413, detail="memory_metadata_too_large")
    safe_metadata = redact_sensitive(payload.metadata)
    if payload.scope == "short_term":
        key = (organization_id, payload.namespace)
        SHORT_TERM_MEMORY[key].append({"content": payload.content, "metadata": safe_metadata})
        if len(SHORT_TERM_MEMORY[key]) > MAX_SHORT_TERM_RECORDS:
            del SHORT_TERM_MEMORY[key][0 : len(SHORT_TERM_MEMORY[key]) - MAX_SHORT_TERM_RECORDS]
        events.emit("memory.updated", {"scope": "short_term", "organization_id": organization_id, "namespace": payload.namespace})
        return {"ok": True, "scope": "short_term", "namespace": payload.namespace}

    record = MemoryRecord(
        organization_id=organization_id,
        namespace=payload.namespace,
        scope=payload.scope,
        content=payload.content,
        metadata_payload=safe_metadata,
        embedding=embed_text(payload.content),
    )
    db.add(record)
    db.flush()
    db.add(AuditLog(event_type="memory.written", actor_type="service", actor_id=settings.service_name, resource_type="memory", resource_id=record.id, payload={"organization_id": organization_id, "namespace": payload.namespace, "scope": payload.scope}))
    db.commit()
    return {"ok": True, "memory_id": record.id}


@app.post("/v1/memory/search")
def search_memory(payload: MemorySearch, request: Request, db: Session = Depends(get_db)):
    organization_id = require_request_organization(request)
    top_k = min(max(payload.top_k, 1), MAX_MEMORY_TOP_K)
    query_embedding = embed_text(payload.query)
    short_term = SHORT_TERM_MEMORY.get((organization_id, payload.namespace), [])[:top_k]
    rows = db.scalars(select(MemoryRecord).where(MemoryRecord.organization_id == organization_id, MemoryRecord.namespace == payload.namespace)).all()
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
    )[:top_k]
    return {"ok": True, "short_term": short_term, "long_term": ranked}
