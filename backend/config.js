function normalizeHost(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "127.0.0.1";
}

function normalizePort(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8787;
}

function normalizeAllowedOrigins(value) {
  if (typeof value !== "string" || !value.trim()) {
    return ["*"];
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length ? parsed : ["*"];
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDailyUtc(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value.trim())) {
    return "";
  }

  const [hourText, minuteText] = value.trim().split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }

  return `${hourText}:${minuteText}`;
}

function normalizeApiKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizePersistenceMode(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["auto", "sqlite", "json"].includes(normalized) ? normalized : "auto";
}

const PLACEHOLDER_SECRET_VALUES = new Set([
  "change-me-before-public-deploy",
  "replace-with-a-strong-secret",
  "replace-with-bootstrap-secret",
  "replace-with-internal-auth-secret",
  "replace-with-strong-password",
  "admin",
]);

function isPlaceholderSecret(value) {
  return PLACEHOLDER_SECRET_VALUES.has(String(value || "").trim());
}

function isPublicDeployment(config) {
  return Boolean(config.publicAppUrl) || ["production", "staging"].includes(String(config.nodeEnv || "").toLowerCase());
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function loadConfig() {
  const host = normalizeHost(process.env.HOST);
  const port = normalizePort(process.env.PORT);
  const allowedOrigins = normalizeAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const publicAppUrl = typeof process.env.PUBLIC_APP_URL === "string" ? process.env.PUBLIC_APP_URL.trim() : "";
  const defaultEngine = typeof process.env.NEXUS_ENGINE === "string" && process.env.NEXUS_ENGINE.trim()
    ? process.env.NEXUS_ENGINE.trim()
    : "local-simulation";
  const maintenanceEnabled = normalizeBoolean(process.env.MAINTENANCE_AUTORUN, false);
  const maintenanceIntervalMinutes = normalizePositiveInteger(process.env.MAINTENANCE_INTERVAL_MINUTES, 1440);
  const maintenanceDailyUtc = normalizeDailyUtc(process.env.MAINTENANCE_DAILY_UTC);
  const apiKey = normalizeApiKey(process.env.NEXUS_API_KEY);
  const persistenceMode = normalizePersistenceMode(process.env.NEXUS_PERSISTENCE_MODE);

  return {
    host,
    port,
    allowedOrigins,
    publicAppUrl,
    defaultEngine,
    nodeEnv: process.env.NODE_ENV || "development",
    maintenanceEnabled,
    maintenanceIntervalMinutes,
    maintenanceDailyUtc,
    apiKey,
    authEnabled: Boolean(apiKey),
    persistenceMode,
  };
}

export function getConfigAdvisories(config) {
  const advisories = [];

  if (config.allowedOrigins.includes("*") && config.publicAppUrl) {
    advisories.push({
      level: "warn",
      key: "cors_wildcard_public",
      message: "CORS is configured as wildcard while a public app URL is set.",
    });
  }

  if (config.publicAppUrl && ["127.0.0.1", "localhost"].includes(config.host)) {
    advisories.push({
      level: "warn",
      key: "local_host_public_url",
      message: "Backend host is local-only while a public app URL is configured.",
    });
  }

  if (config.maintenanceEnabled && !config.maintenanceDailyUtc && !config.maintenanceIntervalMinutes) {
    advisories.push({
      level: "warn",
      key: "maintenance_schedule_missing",
      message: "Maintenance auto-run is enabled without a usable schedule.",
    });
  }

  if (!config.authEnabled && config.publicAppUrl) {
    advisories.push({
      level: "warn",
      key: "auth_disabled_public",
      message: "Backend API auth is disabled while a public app URL is configured.",
    });
  }

  if (config.persistenceMode === "json" && config.publicAppUrl) {
    advisories.push({
      level: "warn",
      key: "json_persistence_public",
      message: "JSON persistence mode is selected for a deployment with a public app URL.",
    });
  }

  return advisories;
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function normalizeRequestedHeaders(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((header) => header.trim())
    .filter(Boolean);
}

export function createCorsHeaders(origin, allowedOrigins, requestedHeaders = "") {
  const allowOrigin = allowedOrigins.includes("*") ? "*" : (origin && allowedOrigins.includes(origin) ? origin : "null");
  const defaultHeaders = ["Content-Type", "X-Nexus-Api-Key", "Authorization"];
  const requested = normalizeRequestedHeaders(requestedHeaders);
  const allowHeaders = Array.from(new Set([...defaultHeaders, ...requested]))
    .join(",");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!Number.isInteger(config.port) || config.port <= 0) {
    errors.push("PORT must be a positive integer.");
  }

  if (config.publicAppUrl && !isValidUrl(config.publicAppUrl)) {
    errors.push("PUBLIC_APP_URL must be a valid http or https URL.");
  }

  for (const origin of config.allowedOrigins) {
    if (origin !== "*" && !isValidUrl(origin)) {
      errors.push(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  if (config.authEnabled && config.apiKey.length < 12) {
    warnings.push("NEXUS_API_KEY is set but shorter than 12 characters.");
  }

  if (isPublicDeployment(config) && (!config.apiKey || isPlaceholderSecret(config.apiKey))) {
    errors.push("NEXUS_API_KEY must be a non-placeholder secret for public or production deployments.");
  }

  if (!config.authEnabled && config.publicAppUrl) {
    warnings.push("Backend auth is disabled while PUBLIC_APP_URL is configured.");
  }

  if (config.allowedOrigins.includes("*") && config.publicAppUrl) {
    warnings.push("CORS is configured as wildcard while PUBLIC_APP_URL is configured.");
  }

  if (!["auto", "sqlite", "json"].includes(config.persistenceMode)) {
    errors.push("NEXUS_PERSISTENCE_MODE must be one of auto, sqlite, or json.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
