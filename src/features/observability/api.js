const OBSERVABILITY_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path) {
  const response = await fetch(`${OBSERVABILITY_API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload?.detail || payload?.error || "Observability request failed.");
  }
  return payload;
}

export function listExecutions() {
  return request("/v1/executions").then((payload) => payload.executions || []);
}

export function getExecution(requestId) {
  return request(`/v1/executions/${requestId}`);
}

export function getExecutionStatus(requestId) {
  return request(`/v1/executions/${requestId}/status`).then((payload) => payload.status);
}
