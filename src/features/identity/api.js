import { buildIdentityHeaders } from "./session.js";

const IDENTITY_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${IDENTITY_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...buildIdentityHeaders(options.headers || {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || response.statusText || "Identity request failed.";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return payload;
}

export function listOrganizations() {
  return request("/v1/organizations").then((payload) => payload.organizations || []);
}

export function bootstrapOrganization(payload) {
  return request("/v1/organizations/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listOperators() {
  return request("/v1/operators").then((payload) => payload.operators || []);
}

export function createOperator(payload) {
  return request("/v1/operators", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOperator(operatorId, payload) {
  return request(`/v1/operators/${operatorId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
