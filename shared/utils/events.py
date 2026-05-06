import json
import logging
from datetime import datetime, timezone


try:
    import redis
except Exception:  # pragma: no cover - optional dependency fallback
    redis = None


LOGGER = logging.getLogger("event-bus")


class EventBus:
    def __init__(self, redis_url: str, channel: str = "multi-agent-events"):
        self.redis_url = redis_url
        self.channel = channel
        self.client = None
        if redis is not None:
            try:
                self.client = redis.from_url(redis_url, decode_responses=True)
            except Exception:
                self.client = None

    def emit(self, event_type: str, payload: dict):
        envelope = {
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        if self.client is not None:
            try:
                self.client.publish(self.channel, json.dumps(envelope))
                return envelope
            except Exception:
                pass
        LOGGER.info("event=%s payload=%s", event_type, json.dumps(payload, default=str))
        return envelope
