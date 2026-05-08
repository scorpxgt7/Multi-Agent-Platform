import { buildIdentityHeaders } from "../identity/session.js";

const QUEUE_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${QUEUE_API_BASE}${path}`, {
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
    const message = payload?.detail || payload?.error || response.statusText || "Queue request failed.";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

export function loadQueueStatus() {
  return request("/v1/workflows/queue/status").then((payload) => payload.queue || {});
}

export function enqueueWorkflow(payload) {
  return request("/v1/workflows/enqueue", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelWorkflow(requestId, payload = {}) {
  return request(`/v1/workflows/${requestId}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function retryWorkflow(requestId, payload = {}) {
  return request(`/v1/workflows/${requestId}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
