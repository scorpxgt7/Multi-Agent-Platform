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
    gateway_url: str
    model_provider: str
    openai_base_url: str
    openai_api_key: str
    openai_model: str
    ollama_base_url: str
    ollama_model: str


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
        gateway_url=os.getenv("API_GATEWAY_URL", "http://api-gateway:8080"),
        model_provider=os.getenv("MODEL_PROVIDER", "mock"),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        ollama_model=os.getenv("OLLAMA_MODEL", "llama3:8b"),
    )
