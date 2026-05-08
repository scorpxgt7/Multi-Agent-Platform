from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request


ROLE_PERMISSIONS = {
    "admin": {
        "policy:manage",
        "policy:view",
        "execution:view",
        "execution:run",
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
