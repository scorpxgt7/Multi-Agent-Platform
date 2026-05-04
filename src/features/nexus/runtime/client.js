import { fetchBackendHealth, fetchBackendRunDetail, fetchBackendRuns, runBackendPipeline } from "./backendRuntime.js";
import { runLocalPipeline } from "./localRuntime.js";

export const RUNTIME_OPTIONS = [
  { value: "local", label: "Local Simulation" },
  { value: "backend", label: "Backend Adapter" },
];

export async function runPipelineWithRuntime(runtimeMode, payload) {
  if (runtimeMode === "backend") {
    return runBackendPipeline(payload);
  }

  return runLocalPipeline(payload);
}

export async function fetchRunsForRuntime(runtimeMode) {
  if (runtimeMode === "backend") {
    return fetchBackendRuns();
  }

  return [];
}

export async function fetchRunDetailForRuntime(runtimeMode, runId) {
  if (runtimeMode === "backend") {
    return fetchBackendRunDetail(runId);
  }

  return null;
}

export async function fetchRuntimeHealth(runtimeMode) {
  if (runtimeMode === "backend") {
    return fetchBackendHealth();
  }

  return {
    ok: true,
    service: "local-runtime",
    defaultEngine: "local-simulation",
    engines: [
      {
        id: "local-simulation",
        label: "Local Simulation",
      },
    ],
  };
}
