import { localEngine } from "./localEngine.js";
import { rulesEngine } from "./rulesEngine.js";

const ENGINE_REGISTRY = {
  [localEngine.id]: localEngine,
  [rulesEngine.id]: rulesEngine,
};

export function listEngines() {
  return Object.values(ENGINE_REGISTRY).map((engine) => ({
    id: engine.id,
    label: engine.label,
    description: engine.description,
  }));
}

export function getEngine(engineId) {
  return ENGINE_REGISTRY[engineId] || localEngine;
}

export function getDefaultEngineId() {
  return process.env.NEXUS_ENGINE || localEngine.id;
}
