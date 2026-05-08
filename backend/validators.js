import { ApiError } from "./errors.js";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value) {
  return value == null || typeof value === "string";
}

function validateOptionalIdentifier(value, field, issues) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: "Value must be a string when provided." });
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    issues.push({ field, message: "Value cannot be empty when provided." });
    return null;
  }

  if (trimmed.length > 80) {
    issues.push({ field, message: "Value is too long." });
    return null;
  }

  return trimmed;
}

function validateAgent(agent, index) {
  const prefix = `agents[${index}]`;
  const issues = [];

  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    issues.push({ field: prefix, message: "Agent must be an object." });
    return issues;
  }

  if (!isNonEmptyString(agent.id)) {
    issues.push({ field: `${prefix}.id`, message: "Agent id is required." });
  }
  if (!isNonEmptyString(agent.name)) {
    issues.push({ field: `${prefix}.name`, message: "Agent name is required." });
  }
  if (!isNonEmptyString(agent.specialty)) {
    issues.push({ field: `${prefix}.specialty`, message: "Agent specialty is required." });
  }
  if (!isOptionalString(agent.description)) {
    issues.push({ field: `${prefix}.description`, message: "Agent description must be a string when provided." });
  }
  if (!isOptionalString(agent.deliverable)) {
    issues.push({ field: `${prefix}.deliverable`, message: "Agent deliverable must be a string when provided." });
  }
  if (agent.advancedSkills != null && (!Array.isArray(agent.advancedSkills) || agent.advancedSkills.some((skill) => !isNonEmptyString(skill)))) {
    issues.push({ field: `${prefix}.advancedSkills`, message: "Advanced skills must be an array of non-empty strings." });
  }

  return issues;
}

export function validateRunPayload(payload, availableEngines) {
  const issues = [];
  const task = typeof payload?.task === "string" ? payload.task.trim() : "";
  const agents = Array.isArray(payload?.agents) ? payload.agents : [];
  const requestedEngineId = typeof payload?.engine === "string" && payload.engine.trim()
    ? payload.engine.trim()
    : null;
  const subsystemId = validateOptionalIdentifier(payload?.subsystemId, "subsystemId", issues);
  const presetId = validateOptionalIdentifier(payload?.presetId, "presetId", issues);

  if (!task) {
    issues.push({ field: "task", message: "Task is required." });
  } else if (task.length > 8000) {
    issues.push({ field: "task", message: "Task is too long." });
  }

  if (!agents.length) {
    issues.push({ field: "agents", message: "At least one agent is required." });
  } else if (agents.length > 12) {
    issues.push({ field: "agents", message: "Too many agents supplied." });
  }

  agents.forEach((agent, index) => {
    issues.push(...validateAgent(agent, index));
  });

  if (requestedEngineId) {
    const engineMeta = availableEngines.find((engine) => engine.id === requestedEngineId);
    if (!engineMeta) {
      issues.push({ field: "engine", message: `Unknown engine: ${requestedEngineId}` });
    } else if (engineMeta.available === false) {
      issues.push({ field: "engine", message: `Engine is unavailable: ${requestedEngineId}` });
    }
  }

  if (issues.length) {
    throw new ApiError(400, "validation_error", "Invalid run request.", issues);
  }

  return {
    task,
    agents,
    requestedEngineId,
    subsystemId,
    presetId,
  };
}
