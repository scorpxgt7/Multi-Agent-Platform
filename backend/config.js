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

export function createCorsHeaders(origin, allowedOrigins) {
  const allowOrigin = allowedOrigins.includes("*") ? "*" : (origin && allowedOrigins.includes(origin) ? origin : "null");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
}
