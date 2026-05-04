import { localEngine } from "./localEngine.js";
import { ollamaEngine } from "./ollamaEngine.js";
import { rulesEngine } from "./rulesEngine.js";
import { loadConfig } from "../config.js";

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

export function hasEngine(engineId) {
  return Boolean(ENGINE_REGISTRY[engineId]);
}

export function getDefaultEngineId() {
  return loadConfig().defaultEngine || localEngine.id;
}
