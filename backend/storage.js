import path from "node:path";
import { spawn } from "node:child_process";
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

export async function getPersistenceHealth() {
  try {
    const payload = await callPythonBridge("health");
    return {
      mode: "sqlite",
      available: true,
      degraded: false,
      location: payload.dbPath,
      migratedLegacyJson: payload.migratedLegacyJson || false,
    };
  } catch (error) {
    return {
      ...getJsonPersistenceHealth(),
      error: error.message,
    };
  }
}

export async function listRunSummaries() {
  try {
    const payload = await callPythonBridge("list_runs");
    return Array.isArray(payload.runs) ? payload.runs : [];
  } catch {
    return listRunSummariesFromJson();
  }
}

export async function getRunDetail(runId) {
  try {
    const payload = await callPythonBridge("get_run", { id: runId });
    return payload.run || null;
  } catch {
    return getRunDetailFromJson(runId);
  }
}

export async function saveRunRecord(runRecord) {
  try {
    await callPythonBridge("save_run", { run: runRecord });
  } catch {
    await saveRunRecordToJson(runRecord);
  }
}
