import http from "node:http";
import crypto from "node:crypto";
import { ApiError, sendApiError, sendApiSuccess } from "./errors.js";
import { getDefaultEngineId, getEngine, listEngines } from "./engines/index.js";
import { getPersistenceHealth, getRunDetail, listRunSummaries, saveRunRecord } from "./storage.js";
import { validateRunPayload } from "./validators.js";

const PORT = Number(process.env.PORT || 8787);

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
  if (!request.url) {
    sendApiError(response, new ApiError(400, "missing_url", "Missing request URL."));
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    try {
      const engines = await listEngines();
      const persistence = await getPersistenceHealth();
      sendApiSuccess(response, 200, {
        service: "nexus-backend",
        port: PORT,
        defaultEngine: getDefaultEngineId(),
        engines,
        persistence,
      });
      return;
    } catch (error) {
      sendApiError(response, error);
      return;
    }
  }

  if (request.method === "GET" && request.url === "/api/nexus/runs") {
    try {
      const runs = await listRunSummaries();
      sendApiSuccess(response, 200, { runs });
      return;
    } catch (error) {
      sendApiError(response, error);
      return;
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/nexus/runs/")) {
    try {
      const runId = request.url.split("/").pop();
      const run = await getRunDetail(runId);

      if (!run) {
        sendApiError(response, new ApiError(404, "run_not_found", "Run not found."));
        return;
      }

      sendApiSuccess(response, 200, { run });
      return;
    } catch (error) {
      sendApiError(response, error);
      return;
    }
  }

  if (request.method === "POST" && request.url === "/api/nexus/run") {
    let task = "";
    let requestedEngineId = getDefaultEngineId();
    let startedAt = new Date().toISOString();

    try {
      const payload = await collectJson(request);
      const availableEngines = await listEngines();
      const validated = validateRunPayload(payload, availableEngines);
      task = validated.task;
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
      sendApiSuccess(response, 200, {
        ...result,
        id: runRecord.id,
        engine: engine.id,
        engineLabel: engine.label,
      });
      return;
    } catch (error) {
      if (!(error instanceof ApiError)) {
        try {
          const completedAt = new Date().toISOString();
          await saveRunRecord({
            id: crypto.randomUUID(),
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
        } catch {
          // Preserve the primary error response even if failure logging fails.
        }
      }
      sendApiError(response, error);
      return;
    }
  }

  sendApiError(response, new ApiError(404, "not_found", "Not found."));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nexus backend listening on http://127.0.0.1:${PORT}`);
});
