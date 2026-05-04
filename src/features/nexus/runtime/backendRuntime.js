export async function runBackendPipeline({ task, agents, engine = "local-simulation" }) {
  const response = await fetch("/api/nexus/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, agents, engine }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend runtime failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !payload.finalOutput || !Array.isArray(payload.entries)) {
    throw new Error("Backend runtime returned an invalid response shape.");
  }

  return payload;
}

export async function fetchBackendHealth() {
  const response = await fetch("/api/health");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend health request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.engines) || !payload.defaultEngine) {
    throw new Error("Backend health response is invalid.");
  }

  return payload;
}

export async function fetchBackendRuns() {
  const response = await fetch("/api/nexus/runs");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend runs request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.runs)) {
    throw new Error("Backend runs response is invalid.");
  }

  return payload.runs;
}

export async function fetchBackendRunDetail(runId) {
  const response = await fetch(`/api/nexus/runs/${runId}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend run detail request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.run) {
    throw new Error("Backend run detail response is invalid.");
  }

  return payload.run;
}
