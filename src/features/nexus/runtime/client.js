import { fetchBackendDiagnosticsSummary, fetchBackendHealth, fetchBackendMaintenanceReviews, fetchBackendMaintenanceStatus, fetchBackendRunDetail, fetchBackendRuns, runBackendMaintenanceReview, runBackendPipeline } from "./backendRuntime.js";
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

export async function fetchRunsForRuntime(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendRuns(options.baseUrl, options.apiKey);
  }

  return [];
}

export async function fetchRunDetailForRuntime(runtimeMode, runId, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendRunDetail(runId, options.baseUrl, options.apiKey);
  }

  return null;
}

export async function fetchRuntimeHealth(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendHealth(options.baseUrl, options.apiKey);
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

export async function probeBackendRuntime(baseUrl = "") {
  try {
    return await fetchBackendHealth(baseUrl);
  } catch {
    return null;
  }
}

export async function fetchDiagnosticsForRuntime(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendDiagnosticsSummary(options.baseUrl, options.apiKey);
  }

  return null;
}

export async function fetchMaintenanceForRuntime(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendMaintenanceStatus(options.baseUrl, options.apiKey);
  }

  return null;
}

export async function runMaintenanceForRuntime(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return runBackendMaintenanceReview(options.baseUrl, options.apiKey);
  }

  return null;
}

export async function fetchMaintenanceReviewsForRuntime(runtimeMode, options = {}) {
  if (runtimeMode === "backend") {
    return fetchBackendMaintenanceReviews(options.baseUrl, options.limit, options.apiKey);
  }

  return [];
}
