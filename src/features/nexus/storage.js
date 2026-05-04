const STORAGE_KEYS = {
  runtimeMode: "nexus.runtimeMode",
  selectedEngine: "nexus.selectedEngine",
  sessionHistory: "nexus.sessionHistory",
  approvalGate: "nexus.approvalGate",
  backendBaseUrl: "nexus.backendBaseUrl",
  backendApiKey: "nexus.backendApiKey",
};

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures so the UI can still render in locked-down browsers.
  }
}

export function loadRuntimeMode() {
  return readJson(STORAGE_KEYS.runtimeMode, "local");
}

export function saveRuntimeMode(runtimeMode) {
  writeJson(STORAGE_KEYS.runtimeMode, runtimeMode);
}

export function loadSelectedEngine() {
  return readJson(STORAGE_KEYS.selectedEngine, "local-simulation");
}

export function saveSelectedEngine(engineId) {
  writeJson(STORAGE_KEYS.selectedEngine, engineId);
}

export function loadSessionHistory() {
  return readJson(STORAGE_KEYS.sessionHistory, []);
}

export function saveSessionHistory(history) {
  writeJson(STORAGE_KEYS.sessionHistory, history.slice(0, 8));
}

export function loadApprovalGate() {
  return readJson(STORAGE_KEYS.approvalGate, true);
}

export function saveApprovalGate(enabled) {
  writeJson(STORAGE_KEYS.approvalGate, Boolean(enabled));
}

export function loadBackendBaseUrl() {
  return readJson(STORAGE_KEYS.backendBaseUrl, "");
}

export function saveBackendBaseUrl(value) {
  writeJson(STORAGE_KEYS.backendBaseUrl, value);
}

export function loadBackendApiKey() {
  return readJson(STORAGE_KEYS.backendApiKey, "");
}

export function saveBackendApiKey(value) {
  writeJson(STORAGE_KEYS.backendApiKey, value);
}
