import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from shared.db import Base
from shared.models import AuditLog


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_PAYLOAD = {
    "organization_name": "Acme",
    "organization_slug": "acme",
    "workspace_name": "Acme Workspace",
    "workspace_slug": "acme-workspace",
    "operator_name": "Root Admin",
    "operator_email": "root@example.com",
}


def load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def agent_module(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_TOKEN", "test-bootstrap-secret")
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite://")
    module = load_module("agent_service_main_test", "services/agent-service/main.py")
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    module.SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)
    monkeypatch.setattr(module.events, "emit", lambda *args, **kwargs: None)
    return module


def test_gateway_rejects_unauthenticated_bootstrap(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_TOKEN", "test-bootstrap-secret")
    module = load_module("api_gateway_main_test", "services/api-gateway/main.py")
    client = TestClient(module.app)

    response = client.post("/v1/organizations/bootstrap", json=BOOTSTRAP_PAYLOAD)

    assert response.status_code == 401
    assert response.json()["detail"] == "bootstrap_token_required"


def test_agent_bootstrap_first_run_success_returns_api_key_only_when_authorized(agent_module):
    client = TestClient(agent_module.app)

    response = client.post(
        "/v1/organizations/bootstrap",
        json=BOOTSTRAP_PAYLOAD,
        headers={"x-bootstrap-token": "test-bootstrap-secret"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["organization"]["slug"] == "acme"
    assert body["operator"]["email"] == "root@example.com"
    assert "api_key" in body
    assert "api_key" not in body["operator"]


def test_agent_bootstrap_denies_after_first_run_and_audits_failure(agent_module):
    client = TestClient(agent_module.app)
    first = client.post(
        "/v1/organizations/bootstrap",
        json=BOOTSTRAP_PAYLOAD,
        headers={"x-bootstrap-token": "test-bootstrap-secret"},
    )
    assert first.status_code == 200

    second_payload = {**BOOTSTRAP_PAYLOAD, "organization_slug": "second", "operator_email": "second@example.com"}
    second = client.post(
        "/v1/organizations/bootstrap",
        json=second_payload,
        headers={"x-bootstrap-token": "test-bootstrap-secret"},
    )

    assert second.status_code == 403
    assert second.json()["detail"] == "bootstrap_closed"
    with agent_module.SessionLocal() as db:
        audit = db.scalar(
            select(AuditLog).where(AuditLog.event_type == "organization.bootstrap_failed").order_by(AuditLog.created_at.desc())
        )
    assert audit is not None
    assert audit.payload["reason"] == "organizations_already_exist"
    assert audit.payload["organization_slug"] == "second"


def test_gateway_forward_headers_include_signed_identity(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-internal-secret")
    module = load_module("api_gateway_internal_auth_test", "services/api-gateway/main.py")

    headers = module.forward_headers(
        {"organization_id": "org-1", "operator_id": "op-1", "operator_role": "admin"},
        method="POST",
        path="/v1/agents",
    )

    assert headers["x-organization-id"] == "org-1"
    assert headers["x-operator-id"] == "op-1"
    assert headers["x-operator-role"] == "admin"
    assert headers["x-internal-auth-signature"]
    assert headers["x-internal-auth-timestamp"]
    assert headers["x-internal-auth-request-id"]


def test_gateway_forward_headers_sign_anonymous_internal_requests(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-internal-secret")
    module = load_module("api_gateway_anonymous_internal_auth_test", "services/api-gateway/main.py")

    headers = module.forward_headers(None, method="GET", path="/v1/organizations")

    assert headers["x-organization-id"] == "gateway"
    assert headers["x-operator-id"] == "gateway"
    assert headers["x-operator-role"] == "service"
    assert headers["x-internal-auth-signature"]
