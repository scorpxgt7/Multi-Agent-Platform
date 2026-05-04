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

export function loadConfig() {
  const host = normalizeHost(process.env.HOST);
  const port = normalizePort(process.env.PORT);
  const allowedOrigins = normalizeAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const publicAppUrl = typeof process.env.PUBLIC_APP_URL === "string" ? process.env.PUBLIC_APP_URL.trim() : "";
  const defaultEngine = typeof process.env.NEXUS_ENGINE === "string" && process.env.NEXUS_ENGINE.trim()
    ? process.env.NEXUS_ENGINE.trim()
    : "local-simulation";

  return {
    host,
    port,
    allowedOrigins,
    publicAppUrl,
    defaultEngine,
    nodeEnv: process.env.NODE_ENV || "development",
  };
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
