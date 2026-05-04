export async function runBackendPipeline({ task, agents }) {
  const response = await fetch("/api/nexus/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, agents }),
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
