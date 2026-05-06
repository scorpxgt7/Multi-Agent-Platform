import os
from dataclasses import dataclass


@dataclass
class ServiceSettings:
    service_name: str
    database_url: str
    redis_url: str
    service_port: int
    service_host: str
    vector_backend: str
    event_channel: str


def load_settings(service_name: str, default_port: int) -> ServiceSettings:
    normalized = service_name.upper().replace("-", "_")
    return ServiceSettings(
        service_name=service_name,
        database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@postgres:5432/multi_agent"),
        redis_url=os.getenv("REDIS_URL", "redis://redis:6379/0"),
        service_port=int(os.getenv(f"{normalized}_PORT", default_port)),
        service_host=os.getenv(f"{normalized}_HOST", "0.0.0.0"),
        vector_backend=os.getenv("VECTOR_BACKEND", "memory"),
        event_channel=os.getenv("EVENT_CHANNEL", "multi-agent-events"),
    )
