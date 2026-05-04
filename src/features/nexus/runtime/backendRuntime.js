function normalizeBackendBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string") {
    return "";
  }

  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function createApiUrl(path, baseUrl = "") {
  const normalizedBaseUrl = normalizeBackendBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : `/api${path}`;
}

function createApiHeaders(apiKey = "", baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (trimmedApiKey) {
    headers["X-Nexus-Api-Key"] = trimmedApiKey;
  }
  return headers;
}

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

export async function runBackendPipeline({ task, agents, engine = "local-simulation", baseUrl = "", apiKey = "" }) {
  const response = await fetch(createApiUrl("/nexus/run", baseUrl), {
    method: "POST",
    headers: createApiHeaders(apiKey, {
      "Content-Type": "application/json",
    }),
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

export async function fetchBackendHealth(baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl("/health", baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend health request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload || !payload.ok || !Array.isArray(payload.engines) || !payload.defaultEngine) {
    throw new Error("Backend health response is invalid.");
  }

  return payload;
}

export async function fetchBackendRuns(baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl("/nexus/runs", baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend runs request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.runs)) {
    throw new Error("Backend runs response is invalid.");
  }

  return payload.runs;
}

export async function fetchBackendRunDetail(runId, baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl(`/nexus/runs/${runId}`, baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend run detail request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !payload.run) {
    throw new Error("Backend run detail response is invalid.");
  }

  return payload.run;
}

export async function fetchBackendDiagnosticsSummary(baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl("/diagnostics/summary", baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend diagnostics request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !payload.diagnostics) {
    throw new Error("Backend diagnostics response is invalid.");
  }

  return payload.diagnostics;
}

export async function fetchBackendMaintenanceStatus(baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl("/maintenance/status", baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend maintenance status request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !payload.maintenance) {
    throw new Error("Backend maintenance status response is invalid.");
  }

  return payload.maintenance;
}

export async function fetchBackendMaintenanceReviews(baseUrl = "", limit = 5, apiKey = "") {
  const response = await fetch(createApiUrl(`/maintenance/reviews?limit=${limit}`, baseUrl), {
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend maintenance reviews request failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.reviews)) {
    throw new Error("Backend maintenance reviews response is invalid.");
  }

  return payload.reviews;
}

export async function runBackendMaintenanceReview(baseUrl = "", apiKey = "") {
  const response = await fetch(createApiUrl("/maintenance/run", baseUrl), {
    method: "POST",
    headers: createApiHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Backend maintenance review failed with status ${response.status}`));
  }

  const payload = await response.json();
  if (!payload.ok || !payload.review) {
    throw new Error("Backend maintenance review response is invalid.");
  }

  return payload.review;
}
