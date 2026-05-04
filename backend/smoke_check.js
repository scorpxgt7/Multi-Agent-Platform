const resolvedDefaultBaseUrl = `http://127.0.0.1:${process.env.PORT || "8787"}`;
const baseUrl = (process.env.BACKEND_BASE_URL || resolvedDefaultBaseUrl).replace(/\/+$/, "");
const apiKey = (process.env.NEXUS_API_KEY || "").trim();

function buildHeaders(includeJson = false) {
  const headers = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  if (apiKey) {
    headers["X-Nexus-Api-Key"] = apiKey;
  }
  return headers;
}

async function readJson(response) {
  const payload = await response.json();
  return payload;
}

async function main() {
  const healthResponse = await fetch(`${baseUrl}/api/health`, {
    headers: buildHeaders(),
  });

  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}.`);
  }

  const health = await readJson(healthResponse);
  if (!health.ok || !health.service) {
    throw new Error("Health check returned an invalid payload.");
  }

  const maintenanceResponse = await fetch(`${baseUrl}/api/maintenance/status`, {
    headers: buildHeaders(),
  });

  if (!maintenanceResponse.ok) {
    throw new Error(`Maintenance status check failed with status ${maintenanceResponse.status}.`);
  }

  const maintenance = await readJson(maintenanceResponse);
  if (!maintenance.ok || !maintenance.maintenance) {
    throw new Error("Maintenance status returned an invalid payload.");
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    authRequired: health.authRequired || false,
    authenticated: health.authenticated ?? true,
    defaultEngine: health.defaultEngine,
    maintenanceScheduler: maintenance.maintenance.scheduler?.mode || "unknown",
  }));
}

main().catch((error) => {
  console.error(error.message || "Backend smoke check failed.");
  process.exit(1);
});
