import http from "node:http";
import crypto from "node:crypto";
import { getDefaultEngineId, getEngine, listEngines } from "./engines/index.js";
import { getPersistenceHealth, getRunDetail, listRunSummaries, saveRunRecord } from "./storage.js";

const PORT = Number(process.env.PORT || 8787);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(payload));
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
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL." });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    const engines = await listEngines();
    const persistence = await getPersistenceHealth();
    sendJson(response, 200, {
      ok: true,
      service: "nexus-backend",
      port: PORT,
      defaultEngine: getDefaultEngineId(),
      engines,
      persistence,
    });
    return;
  }

  if (request.method === "GET" && request.url === "/api/nexus/runs") {
    try {
      const runs = await listRunSummaries();
      sendJson(response, 200, { runs });
      return;
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Failed to load runs." });
      return;
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/nexus/runs/")) {
    try {
      const runId = request.url.split("/").pop();
      const run = await getRunDetail(runId);

      if (!run) {
        sendJson(response, 404, { error: "Run not found." });
        return;
      }

      sendJson(response, 200, { run });
      return;
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Failed to load run detail." });
      return;
    }
  }

  if (request.method === "POST" && request.url === "/api/nexus/run") {
    let task = "";
    let requestedEngineId = getDefaultEngineId();
    let startedAt = new Date().toISOString();

    try {
      const payload = await collectJson(request);
      task = typeof payload.task === "string" ? payload.task.trim() : "";
      const agents = Array.isArray(payload.agents) ? payload.agents : [];
      requestedEngineId = typeof payload.engine === "string" && payload.engine.trim()
        ? payload.engine.trim()
        : getDefaultEngineId();
      const engine = getEngine(requestedEngineId);

      if (!task) {
        sendJson(response, 400, { error: "Task is required." });
        return;
      }

      if (!agents.length) {
        sendJson(response, 400, { error: "At least one agent is required." });
        return;
      }

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
      sendJson(response, 200, {
        ...result,
        id: runRecord.id,
        engine: engine.id,
        engineLabel: engine.label,
      });
      return;
    } catch (error) {
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
      sendJson(response, 500, { error: error.message || "Backend pipeline failed." });
      return;
    }
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nexus backend listening on http://127.0.0.1:${PORT}`);
});
