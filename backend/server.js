import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { runLocalPipeline } from "../src/features/nexus/runtime/localRuntime.js";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve("backend/data");
const RUNS_PATH = path.join(DATA_DIR, "nexus-runs.json");

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

async function loadRuns() {
  try {
    const raw = await fs.readFile(RUNS_PATH, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveRuns(runs) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RUNS_PATH, JSON.stringify(runs.slice(0, 20), null, 2));
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
    sendJson(response, 200, { ok: true, service: "nexus-backend", port: PORT });
    return;
  }

  if (request.method === "GET" && request.url === "/api/nexus/runs") {
    try {
      const runs = await loadRuns();
      sendJson(response, 200, { runs });
      return;
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Failed to load runs." });
      return;
    }
  }

  if (request.method === "POST" && request.url === "/api/nexus/run") {
    try {
      const payload = await collectJson(request);
      const task = typeof payload.task === "string" ? payload.task.trim() : "";
      const agents = Array.isArray(payload.agents) ? payload.agents : [];

      if (!task) {
        sendJson(response, 400, { error: "Task is required." });
        return;
      }

      if (!agents.length) {
        sendJson(response, 400, { error: "At least one agent is required." });
        return;
      }

      const result = await runLocalPipeline({ task, agents });
      const runs = await loadRuns();
      runs.unshift({
        id: Date.now(),
        runtimeMode: "backend",
        task,
        time: new Date().toLocaleString("en-US"),
        finalOutput: result.finalOutput,
      });
      await saveRuns(runs);
      sendJson(response, 200, result);
      return;
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Backend pipeline failed." });
      return;
    }
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nexus backend listening on http://127.0.0.1:${PORT}`);
});
