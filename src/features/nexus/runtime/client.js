import { runBackendPipeline } from "./backendRuntime.js";
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
