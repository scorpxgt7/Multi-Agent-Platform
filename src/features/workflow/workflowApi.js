import { listExecutions } from "../observability/api.js";
import { loadPolicyDashboard } from "../policies/api.js";
import { loadRegistry } from "../builder/api.js";
import { buildIdentityHeaders } from "../identity/session.js";

const WORKFLOW_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${WORKFLOW_API_BASE}${path}`, {
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
    const message = payload?.detail || payload?.error || response.statusText || "Workflow request failed.";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

export async function loadWorkspaceSnapshot() {
  const [registry, policies, executions] = await Promise.all([loadRegistry(), loadPolicyDashboard(), listExecutions()]);
  return {
    ...registry,
    policies: policies.policies || [],
    executions: executions || [],
  };
}

export async function bootstrapOrganization(payload) {
  return request("/v1/organizations/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loadActiveWorkflowDeployment() {
  return request("/v1/workflows/active");
}

export function validateWorkflowDefinition(workflow) {
  return request("/v1/workflows/validate", {
    method: "POST",
    body: JSON.stringify({ workflow }),
  });
}

export function deployWorkflowDefinition(workflow) {
  return request("/v1/workflows/deploy", {
    method: "POST",
    body: JSON.stringify({ workflow }),
  });
}

export function listWorkflowVersions() {
  return request("/v1/workflows/versions");
}

export function rollbackWorkflowDeployment(deploymentId) {
  return request(`/v1/workflows/${deploymentId}/rollback`, {
    method: "POST",
  });
}
