import { localEngine } from "./localEngine.js";
import { ollamaEngine } from "./ollamaEngine.js";
import { rulesEngine } from "./rulesEngine.js";

const ENGINE_REGISTRY = {
  [localEngine.id]: localEngine,
  [ollamaEngine.id]: ollamaEngine,
  [rulesEngine.id]: rulesEngine,
};

export async function listEngines() {
  const engineEntries = await Promise.all(Object.values(ENGINE_REGISTRY).map(async (engine) => ({
    id: engine.id,
    label: engine.label,
    description: engine.description,
    available: typeof engine.isAvailable === "function" ? await engine.isAvailable() : true,
  })));
  return engineEntries;
}

export function getEngine(engineId) {
  return ENGINE_REGISTRY[engineId] || localEngine;
}

export function getDefaultEngineId() {
  return process.env.NEXUS_ENGINE || localEngine.id;
}
