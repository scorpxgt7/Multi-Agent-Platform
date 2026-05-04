import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { getJsonPersistenceHealth, getRunDetailFromJson, listRunSummariesFromJson, saveRunRecordToJson } from "./jsonStorage.js";

const PYTHON_BRIDGE_PATH = path.resolve("backend/sqlite_bridge.py");

function callPythonBridge(command, payload = null) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [PYTHON_BRIDGE_PATH, command], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `SQLite bridge exited with code ${code}.`));
        return;
      }

      try {
        resolve(stdout ? JSON.parse(stdout) : {});
      } catch (error) {
        reject(new Error(`SQLite bridge returned invalid JSON. ${error.message}`));
      }
    });

    if (payload !== null) {
      child.stdin.write(JSON.stringify(payload));
    }
    child.stdin.end();
  });
}

function getPersistenceMode() {
  return loadConfig().persistenceMode;
}

async function trySqlite(command, payload = null) {
  const response = await callPythonBridge(command, payload);
  return {
    mode: "sqlite",
    payload: response,
  };
}

function buildJsonHealth() {
  return {
    ...getJsonPersistenceHealth(),
    configuredMode: getPersistenceMode(),
  };
}

async function resolvePersistenceHealth() {
  const mode = getPersistenceMode();

  if (mode === "json") {
    return buildJsonHealth();
  }

  try {
    const sqlite = await trySqlite("health");
    return {
      mode: "sqlite",
      configuredMode: mode,
      available: true,
      degraded: false,
      location: sqlite.payload.dbPath,
      migratedLegacyJson: sqlite.payload.migratedLegacyJson || false,
    };
  } catch (error) {
    if (mode === "sqlite") {
      return {
        mode: "sqlite",
        configuredMode: mode,
        available: false,
        degraded: false,
        location: null,
        error: error.message,
      };
    }

    return {
      ...buildJsonHealth(),
      error: error.message,
    };
  }
}

export async function getPersistenceHealth() {
  return resolvePersistenceHealth();
}

export async function listRunSummaries() {
  const mode = getPersistenceMode();

  if (mode === "json") {
    return listRunSummariesFromJson();
  }

  try {
    const payload = await callPythonBridge("list_runs");
    return Array.isArray(payload.runs) ? payload.runs : [];
  } catch (error) {
    if (mode === "sqlite") {
      throw error;
    }
    return listRunSummariesFromJson();
  }
}

export async function getRunDetail(runId) {
  const mode = getPersistenceMode();

  if (mode === "json") {
    return getRunDetailFromJson(runId);
  }

  try {
    const payload = await callPythonBridge("get_run", { id: runId });
    return payload.run || null;
  } catch (error) {
    if (mode === "sqlite") {
      throw error;
    }
    return getRunDetailFromJson(runId);
  }
}

export async function saveRunRecord(runRecord) {
  const mode = getPersistenceMode();

  if (mode === "json") {
    await saveRunRecordToJson(runRecord);
    return;
  }

  try {
    await callPythonBridge("save_run", { run: runRecord });
  } catch (error) {
    if (mode === "sqlite") {
      throw error;
    }
    await saveRunRecordToJson(runRecord);
  }
}

export async function validatePersistenceReadiness() {
  const health = await resolvePersistenceHealth();
  const mode = getPersistenceMode();
  const errors = [];
  const warnings = [];

  if (mode === "sqlite" && !health.available) {
    errors.push(`SQLite persistence is required but unavailable: ${health.error || "unknown error"}`);
  }

  if (mode === "auto" && health.mode === "json") {
    warnings.push("Persistence is running in JSON fallback mode under auto configuration.");
  }

  if (mode === "json") {
    warnings.push("Persistence mode is explicitly set to JSON.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    health,
  };
}
