import { runLocalPipeline } from "../../src/features/nexus/runtime/localRuntime.js";

export const localEngine = {
  id: "local-simulation",
  label: "Local Simulation Engine",
  description: "Deterministic backend engine that reuses the local orchestration runtime.",
  async run({ task, agents }) {
    return runLocalPipeline({ task, agents });
  },
};
