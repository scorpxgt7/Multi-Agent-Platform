const STORAGE_KEYS = {
  runtimeMode: "nexus.runtimeMode",
  selectedEngine: "nexus.selectedEngine",
  sessionHistory: "nexus.sessionHistory",
  approvalGate: "nexus.approvalGate",
};

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadRuntimeMode() {
  return readJson(STORAGE_KEYS.runtimeMode, "local");
}

export function saveRuntimeMode(runtimeMode) {
  window.localStorage.setItem(STORAGE_KEYS.runtimeMode, JSON.stringify(runtimeMode));
}

export function loadSelectedEngine() {
  return readJson(STORAGE_KEYS.selectedEngine, "local-simulation");
}

export function saveSelectedEngine(engineId) {
  window.localStorage.setItem(STORAGE_KEYS.selectedEngine, JSON.stringify(engineId));
}

export function loadSessionHistory() {
  return readJson(STORAGE_KEYS.sessionHistory, []);
}

export function saveSessionHistory(history) {
  window.localStorage.setItem(STORAGE_KEYS.sessionHistory, JSON.stringify(history.slice(0, 8)));
}

export function loadApprovalGate() {
  return readJson(STORAGE_KEYS.approvalGate, true);
}

export function saveApprovalGate(enabled) {
  window.localStorage.setItem(STORAGE_KEYS.approvalGate, JSON.stringify(Boolean(enabled)));
}
