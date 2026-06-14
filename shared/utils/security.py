from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi import HTTPException, Request


ROLE_PERMISSIONS = {
    "admin": {
        "policy:manage",
        "policy:view",
        "execution:view",
        "execution:run",
        "execution:debug",
        "registry:manage",
        "registry:view",
        "operator:manage",
        "organization:view",
    },
    "operator": {
        "policy:view",
        "execution:view",
        "execution:run",
        "registry:manage",
        "registry:view",
        "organization:view",
    },
    "viewer": {
        "policy:view",
        "execution:view",
        "registry:view",
        "organization:view",
    },
}

SENSITIVE_KEY_PARTS = (
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "password",
    "private_key",
    "provider_text",
    "raw_input",
    "secret",
    "token",
)
REDACTED = "[REDACTED]"
INTERNAL_AUTH_TOLERANCE_SECONDS = 300


def operator_role_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def role_permissions(role: str, extra_permissions: dict[str, Any] | None = None) -> set[str]:
    permissions = set(ROLE_PERMISSIONS.get(role, set()))
    if isinstance(extra_permissions, list):
        permissions.update(extra_permissions)
        return permissions
    if extra_permissions:
        permissions.update(extra_permissions.get("allow", []))
        permissions.difference_update(extra_permissions.get("deny", []))
    return permissions


def build_operator_context(operator: dict[str, Any], organization_id: str | None = None) -> dict[str, Any]:
    role = operator_role_value(operator.get("role", "viewer"))
    resolved_org = organization_id or operator.get("organization_id")
    return {
        "operator_id": operator.get("id"),
        "organization_id": resolved_org,
        "operator_role": role,
        "permissions": sorted(role_permissions(role, operator.get("permissions"))),
        "name": operator.get("name", ""),
        "email": operator.get("email", ""),
    }


def request_scope(request: Request) -> dict[str, str]:
    return {
        "organization_id": request.headers.get("x-organization-id", ""),
        "operator_id": request.headers.get("x-operator-id", ""),
        "operator_role": request.headers.get("x-operator-role", ""),
    }


def require_request_organization(request: Request) -> str:
    organization_id = request.headers.get("x-organization-id")
    if not organization_id:
        raise HTTPException(status_code=401, detail="organization_scope_required")
    return organization_id


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[Any, Any] = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if any(part in key_text for part in SENSITIVE_KEY_PARTS):
                redacted[key] = REDACTED
            else:
                redacted[key] = redact_sensitive(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def _internal_secret() -> str:
    return os.getenv("INTERNAL_AUTH_SECRET", "").strip()


def _canonical_internal_message(*, method: str, path: str, timestamp: str, request_id: str, organization_id: str, operator_id: str, operator_role: str) -> str:
    return "\n".join([method.upper(), path, timestamp, request_id, organization_id, operator_id, operator_role])


def sign_internal_headers(*, method: str, path: str, organization_id: str, operator_id: str, operator_role: str, request_id: str | None = None, timestamp: int | None = None) -> dict[str, str]:
    secret = _internal_secret()
    if not secret:
        return {}
    timestamp_text = str(int(time.time() if timestamp is None else timestamp))
    request_id_text = request_id or hashlib.sha256(f"{timestamp_text}:{organization_id}:{operator_id}".encode()).hexdigest()[:32]
    message = _canonical_internal_message(
        method=method,
        path=path,
        timestamp=timestamp_text,
        request_id=request_id_text,
        organization_id=organization_id,
        operator_id=operator_id,
        operator_role=operator_role,
    )
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return {
        "x-internal-auth-timestamp": timestamp_text,
        "x-internal-auth-request-id": request_id_text,
        "x-internal-auth-signature": signature,
    }


def verify_internal_request(request: Request) -> None:
    secret = _internal_secret()
    if not secret:
        return
    timestamp = request.headers.get("x-internal-auth-timestamp", "")
    request_id = request.headers.get("x-internal-auth-request-id", "")
    signature = request.headers.get("x-internal-auth-signature", "")
    if not timestamp or not request_id or not signature:
        raise HTTPException(status_code=401, detail="internal_auth_required")
    try:
        timestamp_int = int(timestamp)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="internal_auth_invalid") from error
    if abs(time.time() - timestamp_int) > INTERNAL_AUTH_TOLERANCE_SECONDS:
        raise HTTPException(status_code=401, detail="internal_auth_stale")
    scope = request_scope(request)
    message = _canonical_internal_message(
        method=request.method,
        path=request.url.path,
        timestamp=timestamp,
        request_id=request_id,
        organization_id=scope["organization_id"],
        operator_id=scope["operator_id"],
        operator_role=scope["operator_role"],
    )
    expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="internal_auth_invalid")


def require_internal_request(request: Request) -> None:
    verify_internal_request(request)


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left or "", right or "")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
