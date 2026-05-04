function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeTask(task, fallback = "the requested workflow") {
  const summary = compactText(task);
  if (!summary) return fallback;
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

export function buildDirectiveMap(task, agents) {
  const summary = summarizeTask(task);
  const directives = {};

  agents.forEach((agent, index) => {
    const handoff = index === 0
      ? "Start the chain with a strong factual baseline."
      : "Use previous agent output as working context and improve it with your specialty.";
    directives[agent.name] = `For ${summary}, focus on ${agent.specialty.toLowerCase()}. ${agent.description} ${handoff}`;
  });

  return directives;
}

function buildManagerPlan(task, agents) {
  const summary = summarizeTask(task);
  const teamFocus = agents.map((agent, index) => `${index + 1}. ${agent.name}: ${agent.specialty} - ${agent.description}`).join("\n");

  return [
    `Objective: deliver a complete result for ${summary}.`,
    "Operating plan:",
    "1. Clarify the scope, desired outcome, and constraints that can be inferred from the task.",
    "2. Split the work into focused specialist contributions so the team does not overlap unnecessarily.",
    "3. Build the output progressively, allowing later agents to strengthen and refine prior work.",
    "4. Close with a quality pass that surfaces risks, assumptions, and next actions.",
    "Team focus:",
    teamFocus,
  ].join("\n");
}

function buildSupervisorBrief(task, agents, directiveMap) {
  const summary = summarizeTask(task);
  return [
    `Supervisor brief for ${summary}:`,
    ...agents.map((agent) => `${agent.name}: ${directiveMap[agent.name]}`),
  ].join("\n");
}

function buildAgentContribution(task, agent, directive, previousOutputs) {
  const summary = summarizeTask(task);
  const previousNames = previousOutputs.map((entry) => entry.name);

  return [
    `Focus area: ${agent.specialty}`,
    `Directive: ${directive}`,
    `Context used: ${previousNames.length ? previousNames.join(", ") : "No prior agent context yet."}`,
    `Contribution: For ${summary}, ${agent.name} should produce a practical ${agent.specialty.toLowerCase()} output that directly helps the team move toward a final deliverable.`,
    `Execution notes: ${agent.description} Keep the contribution actionable, compact, and easy for the next handoff to reuse.`,
    "Handoff guidance: Preserve the strongest points, remove duplication, and elevate anything that reduces execution risk or improves clarity.",
  ].join("\n\n");
}

function buildSynthesis(task, agents, collected) {
  const summary = summarizeTask(task);
  return [
    `Synthesis for ${summary}:`,
    "The team completed a full pass across discovery, analysis, planning, packaging, and review.",
    ...agents.map((agent) => `- ${agent.name}: ${compactText(collected[agent.name] || "No contribution recorded.")}`),
    "Integrated view: combine the validated findings, sharpen them into an execution-ready plan, and only move forward once the reviewer notes are addressed.",
  ].join("\n");
}

function buildFinalReport(task, agents, collected, synthesis) {
  const summary = summarizeTask(task);
  const specialistSections = agents.map((agent) => `${agent.name}: ${compactText(collected[agent.name] || "No contribution recorded.")}`).join("\n");

  return [
    "Executive Summary",
    `This run addressed ${summary} through a manager-led multi-agent workflow with specialist handoffs and a final quality pass.`,
    "",
    "Specialist Outputs",
    specialistSections,
    "",
    "Supervisor Synthesis",
    synthesis,
    "",
    "Recommended Next Steps",
    "1. Confirm the synthesized output matches the business goal and required level of detail.",
    "2. Turn the strongest parts into a reusable workflow or domain-specific preset.",
    "3. Add approval checkpoints before any external execution, customer delivery, or irreversible action.",
  ].join("\n");
}

export async function runLocalPipelineStage(stage, payload) {
  await wait(320);

  switch (stage) {
    case "manager-plan":
      return buildManagerPlan(payload.task, payload.agents);
    case "supervisor-brief":
      return buildSupervisorBrief(payload.task, payload.agents, payload.directiveMap);
    case "agent-contribution":
      return buildAgentContribution(payload.task, payload.agent, payload.directive, payload.previousOutputs);
    case "supervisor-synthesis":
      return buildSynthesis(payload.task, payload.agents, payload.collected);
    case "manager-final":
      return buildFinalReport(payload.task, payload.agents, payload.collected, payload.synthesis);
    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}
