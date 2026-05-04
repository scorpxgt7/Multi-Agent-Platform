import { runLocalPipeline } from "../../src/features/nexus/runtime/localRuntime.js";

function withRulesPrefix(task) {
  return `Rules-first execution mode: apply deterministic operating structure, explicit checkpoints, and constrained specialist outputs.\n\nTask: ${task}`;
}

export const rulesEngine = {
  id: "rules-first",
  label: "Rules-First Engine",
  description: "Structured backend engine that biases the orchestration toward deterministic guardrails and explicit operating rules.",
  async run({ task, agents }) {
    return runLocalPipeline({
      task: withRulesPrefix(task),
      agents,
    });
  },
};
