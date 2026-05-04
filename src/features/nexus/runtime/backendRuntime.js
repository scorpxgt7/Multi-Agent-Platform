async function readApiError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    const apiMessage = payload?.error?.message;
    const apiDetails = Array.isArray(payload?.error?.details)
      ? payload.error.details.map((detail) => `${detail.field}: ${detail.message}`).join(" | ")
      : "";
    return [apiMessage || fallbackMessage, apiDetails].filter(Boolean).join(" ");
  } catch {
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }
}

export async function runBackendPipeline({ task, agents, engine = "local-simulation" }) {
  const response = await fetch("/api/nexus/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, agents, engine }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend runtime failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload || !payload.ok || !payload.finalOutput || !Array.isArray(payload.entries)) {
    throw new Error("Backend runtime returned an invalid response shape.");
  }

  return payload;
}

export async function fetchBackendHealth() {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend health request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload || !payload.ok || !Array.isArray(payload.engines) || !payload.defaultEngine) {
    throw new Error("Backend health response is invalid.");
  }

  return payload;
}

export async function fetchBackendRuns() {
  const response = await fetch("/api/nexus/runs");

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend runs request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.runs)) {
    throw new Error("Backend runs response is invalid.");
  }

  return payload.runs;
}

export async function fetchBackendRunDetail(runId) {
  const response = await fetch(`/api/nexus/runs/${runId}`);

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend run detail request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !payload.run) {
    throw new Error("Backend run detail response is invalid.");
  }

  return payload.run;
}
