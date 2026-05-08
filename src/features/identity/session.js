const STORAGE_KEY = "nexus.identity.session";

const EMPTY_STATE = {
  organizations: [],
  activeOrganizationId: "",
  apiKey: "",
  operator: null,
};

export function readIdentityState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_STATE };
    }
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function writeIdentityState(nextState) {
  const merged = { ...EMPTY_STATE, ...nextState };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function buildIdentityHeaders(extraHeaders = {}) {
  const identity = readIdentityState();
  const headers = { ...extraHeaders };
  if (identity.apiKey) {
    headers["X-Api-Key"] = identity.apiKey;
  }
  return headers;
}
