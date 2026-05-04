import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("backend/data");
const RUNS_PATH = path.join(DATA_DIR, "nexus-runs.json");

function buildRunSummary(run) {
  return {
    id: run.id,
    runtimeMode: run.runtimeMode,
    engine: run.engine,
    engineLabel: run.engineLabel || run.engine,
    task: run.task,
    time: run.time,
    status: run.status || "completed",
    startedAt: run.startedAt || null,
    completedAt: run.completedAt || null,
    durationMs: run.durationMs ?? null,
    finalOutput: run.finalOutput,
    artifactCount: Array.isArray(run.artifacts) ? run.artifacts.length : 0,
    errorMessage: run.errorMessage || null,
  };
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
  await fs.writeFile(RUNS_PATH, JSON.stringify(runs.slice(0, 50), null, 2));
}

export async function listRunSummariesFromJson() {
  const runs = await loadRuns();
  return runs.map(buildRunSummary);
}

export async function getRunDetailFromJson(runId) {
  const runs = await loadRuns();
  return runs.find((entry) => String(entry.id) === String(runId)) || null;
}

export async function saveRunRecordToJson(runRecord) {
  const runs = await loadRuns();
  runs.unshift(runRecord);
  await saveRuns(runs);
}

export function getJsonPersistenceHealth() {
  return {
    mode: "json",
    available: true,
    degraded: true,
    location: RUNS_PATH,
  };
}
