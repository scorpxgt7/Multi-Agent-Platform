const STORAGE_KEYS = {
  runtimeMode: "nexus.runtimeMode",
  sessionHistory: "nexus.sessionHistory",
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

export function loadSessionHistory() {
  return readJson(STORAGE_KEYS.sessionHistory, []);
}

export function saveSessionHistory(history) {
  window.localStorage.setItem(STORAGE_KEYS.sessionHistory, JSON.stringify(history.slice(0, 8)));
}
