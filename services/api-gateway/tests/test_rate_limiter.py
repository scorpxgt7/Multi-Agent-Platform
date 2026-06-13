import importlib.util
from pathlib import Path
from starlette.applications import Starlette


def load_gateway():
    module_path = Path(__file__).resolve().parents[1] / "main.py"
    spec = importlib.util.spec_from_file_location("api_gateway_main", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_memory_rate_limit_is_per_client_key(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    gateway = load_gateway()
    limiter = gateway.SimpleRateLimiter(Starlette(), max_requests=2, window_seconds=60)

    assert limiter._increment_memory("203.0.113.10", 1000)[0] == 1
    assert limiter._increment_memory("203.0.113.10", 1001)[0] == 2
    assert limiter._increment_memory("203.0.113.11", 1002)[0] == 1
    assert limiter._increment_memory("203.0.113.10", 1003)[0] == 3

    assert limiter._headers(3, 1060)["X-RateLimit-Remaining"] == "0"


def test_memory_cleanup_evicts_stale_client_entries(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    gateway = load_gateway()
    limiter = gateway.SimpleRateLimiter(Starlette(), max_requests=2, window_seconds=10)
    limiter.cleanup_interval = 5
    limiter._last_cleanup = 100
    limiter._clients["stale"] = {"count": 1, "ts": 100, "last_seen": 100}
    limiter._clients["fresh"] = {"count": 1, "ts": 113, "last_seen": 113}

    removed = limiter._cleanup_stale_clients(now=116)

    assert removed == 1
    assert "stale" not in limiter._clients
    assert "fresh" in limiter._clients


def test_proxy_headers_are_used_only_for_trusted_proxy(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    gateway = load_gateway()
    limiter = gateway.SimpleRateLimiter(Starlette())

    class Client:
        def __init__(self, host):
            self.host = host

    class Request:
        def __init__(self, host):
            self.client = Client(host)
            self.headers = {"x-forwarded-for": "198.51.100.20, 10.0.0.3", "x-real-ip": "198.51.100.21"}

    assert limiter._client_ip(Request("10.1.2.3")) == "198.51.100.20"
    assert limiter._client_ip(Request("192.0.2.5")) == "192.0.2.5"
