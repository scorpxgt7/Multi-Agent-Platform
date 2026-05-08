import http from "node:http";
import crypto from "node:crypto";
import { createCorsHeaders, getConfigAdvisories, isOriginAllowed, loadConfig, validateConfig } from "./config.js";
import { getDiagnosticSummary, listDiagnosticEvents, recordDiagnosticEvent } from "./diagnosticsStorage.js";
import { ApiError, sendApiError, sendApiSuccess } from "./errors.js";
import { getDefaultEngineId, getEngine, hasEngine, listEngines } from "./engines/index.js";
import { getMaintenanceReviews, getMaintenanceStatus, initializeMaintenanceScheduler, runMaintenanceReview } from "./maintenanceRunner.js";
import { getPersistenceHealth, getRunDetail, listRunSummaries, saveRunRecord, validatePersistenceReadiness } from "./storage.js";
import { validateRunPayload } from "./validators.js";

const CONFIG = loadConfig();
const SERVER_STARTED_AT = Date.now();
let lastPersistenceErrorMessage = "";
const VALIDATE_ONLY = process.argv.includes("--validate");
const STARTUP_VALIDATION = validateConfig(CONFIG);
const PERSISTENCE_VALIDATION = await validatePersistenceReadiness();

if (!hasEngine(CONFIG.defaultEngine)) {
  STARTUP_VALIDATION.ok = false;
  STARTUP_VALIDATION.errors.push(`NEXUS_ENGINE "${CONFIG.defaultEngine}" is not registered.`);
}

if (!PERSISTENCE_VALIDATION.ok) {
  STARTUP_VALIDATION.ok = false;
  STARTUP_VALIDATION.errors.push(...PERSISTENCE_VALIDATION.errors);
}

STARTUP_VALIDATION.warnings.push(...PERSISTENCE_VALIDATION.warnings);

if (!STARTUP_VALIDATION.ok) {
  console.error("Backend startup validation failed:");
  STARTUP_VALIDATION.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

if (STARTUP_VALIDATION.warnings.length > 0) {
  console.warn("Backend startup warnings:");
  STARTUP_VALIDATION.warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (VALIDATE_ONLY) {
  console.log(JSON.stringify({
    ok: true,
    config: {
      host: CONFIG.host,
      port: CONFIG.port,
      publicAppUrl: CONFIG.publicAppUrl || null,
      authEnabled: CONFIG.authEnabled,
      defaultEngine: CONFIG.defaultEngine,
      persistenceMode: CONFIG.persistenceMode,
    },
    persistence: PERSISTENCE_VALIDATION.health,
    warnings: STARTUP_VALIDATION.warnings,
  }));
  process.exit(0);
}

function extractApiKey(request) {
  const headerToken = request.headers["x-nexus-api-key"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function isAuthenticated(request) {
  if (!CONFIG.authEnabled) {
    return true;
  }

  return extractApiKey(request) === CONFIG.apiKey;
}

function collectJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  const corsHeaders = createCorsHeaders(
    requestOrigin,
    CONFIG.allowedOrigins,
    request.headers["access-control-request-headers"],
  );

  if (!request.url) {
    sendApiError(response, new ApiError(400, "missing_url", "Missing request URL."), corsHeaders);
    return;
  }

  if (!isOriginAllowed(requestOrigin, CONFIG.allowedOrigins)) {
    sendApiError(response, new ApiError(403, "origin_not_allowed", "Origin is not allowed to access this backend."), corsHeaders);
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    try {
      const authenticated = isAuthenticated(request);
      const engines = await listEngines();
      const persistence = await getPersistenceHealth();
      const configAdvisories = getConfigAdvisories(CONFIG);
      if (persistence.error && persistence.error !== lastPersistenceErrorMessage) {
        lastPersistenceErrorMessage = persistence.error;
        await recordDiagnosticEvent({
          id: crypto.randomUUID(),
          type: "persistence_degraded",
          level: "warning",
          message: "Persistence bridge degraded. Backend is running on fallback storage.",
          details: {
            mode: persistence.mode,
            location: persistence.location,
            error: persistence.error,
          },
        });
      }
      const diagnostics = await getDiagnosticSummary();
      if (!authenticated && CONFIG.authEnabled) {
        sendApiSuccess(response, 200, {
          service: "nexus-backend",
          authRequired: true,
          authenticated: false,
          defaultEngine: getDefaultEngineId(),
          engines,
          timestamp: new Date().toISOString(),
        }, corsHeaders);
        return;
      }
      sendApiSuccess(response, 200, {
        service: "nexus-backend",
        authRequired: CONFIG.authEnabled,
        authenticated,
        host: CONFIG.host,
        port: CONFIG.port,
        defaultEngine: getDefaultEngineId(),
        engines,
        persistence,
        uptimeMs: Date.now() - SERVER_STARTED_AT,
        timestamp: new Date().toISOString(),
        deployment: {
          nodeEnv: CONFIG.nodeEnv,
          publicAppUrl: CONFIG.publicAppUrl || null,
          allowedOrigins: CONFIG.allowedOrigins,
          corsMode: CONFIG.allowedOrigins.includes("*") ? "wildcard" : "allowlist",
          configAdvisories,
          startupValidation: {
            ok: STARTUP_VALIDATION.ok,
            warnings: STARTUP_VALIDATION.warnings,
          },
          persistenceMode: CONFIG.persistenceMode,
        },
        diagnostics,
      }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (!isAuthenticated(request)) {
    sendApiError(response, new ApiError(401, "unauthorized", "Valid backend API credentials are required for this operation."), corsHeaders);
    return;
  }

  if (request.method === "GET" && request.url === "/api/nexus/runs") {
    try {
      const runs = await listRunSummaries();
      sendApiSuccess(response, 200, { runs }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "GET" && request.url === "/api/diagnostics/summary") {
    try {
      const diagnostics = await getDiagnosticSummary();
      sendApiSuccess(response, 200, { diagnostics }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/diagnostics/events")) {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
      const limit = Number(requestUrl.searchParams.get("limit") || 20);
      const events = await listDiagnosticEvents(limit);
      sendApiSuccess(response, 200, { events }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "GET" && request.url === "/api/maintenance/status") {
    try {
      const maintenance = await getMaintenanceStatus();
      sendApiSuccess(response, 200, { maintenance }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/maintenance/reviews")) {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
      const limit = Number(requestUrl.searchParams.get("limit") || 10);
      const reviews = await getMaintenanceReviews(limit);
      sendApiSuccess(response, 200, { reviews }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "POST" && request.url === "/api/maintenance/run") {
    try {
      const review = await runMaintenanceReview({ source: "manual" });
      sendApiSuccess(response, 200, { review }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/nexus/runs/")) {
    try {
      const runId = request.url.split("/").pop();
      const run = await getRunDetail(runId);

      if (!run) {
        sendApiError(response, new ApiError(404, "run_not_found", "Run not found."), corsHeaders);
        return;
      }

      sendApiSuccess(response, 200, { run }, corsHeaders);
      return;
    } catch (error) {
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  if (request.method === "POST" && request.url === "/api/nexus/run") {
    let task = "";
    let subsystemId = "mission";
    let presetId = null;
    let requestedEngineId = getDefaultEngineId();
    let startedAt = new Date().toISOString();

    try {
      const payload = await collectJson(request);
      const availableEngines = await listEngines();
      const validated = validateRunPayload(payload, availableEngines);
      task = validated.task;
      subsystemId = validated.subsystemId || "mission";
      presetId = validated.presetId || null;
      const agents = validated.agents;
      requestedEngineId = validated.requestedEngineId || getDefaultEngineId();
      const engine = getEngine(requestedEngineId);

      startedAt = new Date().toISOString();
      const result = await engine.run({ task, agents });
      const artifacts = agents.map((agent) => ({
        agentId: agent.id,
        name: agent.name,
        specialty: agent.specialty,
        deliverable: agent.deliverable || "specialist output",
        skills: agent.advancedSkills || [],
        output: result.collected?.[agent.name] || "",
      }));
      const completedAt = new Date().toISOString();
      const runRecord = {
        id: crypto.randomUUID(),
        subsystemId,
        presetId,
        runtimeMode: "backend",
        engine: engine.id,
        engineLabel: engine.label,
        task,
        time: new Date().toLocaleString("en-US"),
        status: "completed",
        startedAt,
        completedAt,
        durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
        finalOutput: result.finalOutput,
        entries: result.entries,
        statuses: result.statuses,
        managerPlan: result.managerPlan,
        supervisorBrief: result.supervisorBrief,
        synthesis: result.synthesis,
        artifacts,
        errorMessage: null,
      };
      await saveRunRecord(runRecord);
      await recordDiagnosticEvent({
        id: crypto.randomUUID(),
        type: "run_completed",
        level: "info",
        message: `Backend run completed with engine ${engine.id}.`,
        details: {
          runId: runRecord.id,
          engine: engine.id,
          durationMs: runRecord.durationMs,
          status: runRecord.status,
        },
      });
      sendApiSuccess(response, 200, {
        ...result,
        id: runRecord.id,
        subsystemId,
        presetId,
        engine: engine.id,
        engineLabel: engine.label,
      }, corsHeaders);
      return;
    } catch (error) {
      if (!(error instanceof ApiError)) {
        try {
          const completedAt = new Date().toISOString();
          const failedRunId = crypto.randomUUID();
          await saveRunRecord({
            id: failedRunId,
            subsystemId,
            presetId,
            runtimeMode: "backend",
            engine: requestedEngineId,
            engineLabel: null,
            task,
            time: new Date().toLocaleString("en-US"),
            status: "failed",
            startedAt,
            completedAt,
            durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
            finalOutput: "",
            entries: [],
            statuses: [],
            managerPlan: "",
            supervisorBrief: "",
            synthesis: "",
            artifacts: [],
            errorMessage: error.message || "Backend pipeline failed.",
          });
          await recordDiagnosticEvent({
            id: crypto.randomUUID(),
            type: "run_failed",
            level: "error",
            message: `Backend run failed with engine ${requestedEngineId}.`,
            details: {
              runId: failedRunId,
              engine: requestedEngineId,
              error: error.message || "Backend pipeline failed.",
            },
          });
        } catch {
          // Preserve the primary error response even if failure logging fails.
        }
      }
      sendApiError(response, error, corsHeaders);
      return;
    }
  }

  sendApiError(response, new ApiError(404, "not_found", "Not found."), corsHeaders);
});

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`Nexus backend listening on http://${CONFIG.host}:${CONFIG.port}`);
});

void initializeMaintenanceScheduler();
void recordDiagnosticEvent({
  id: crypto.randomUUID(),
  type: "server_started",
  level: "info",
  message: "Backend server started.",
  details: {
    host: CONFIG.host,
    port: CONFIG.port,
    nodeEnv: CONFIG.nodeEnv,
    defaultEngine: CONFIG.defaultEngine,
  },
});
