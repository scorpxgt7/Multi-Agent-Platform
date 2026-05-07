const POLICY_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${POLICY_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || response.statusText || "Policy request failed.";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return payload;
}

export function loadPolicyDashboard() {
  return Promise.all([
    request("/v1/roles"),
    request("/v1/skills"),
    request("/v1/agents"),
    request("/v1/teams"),
    request("/v1/policies"),
  ]).then(([roles, skills, agents, teams, policies]) => ({
    roles: roles.roles || [],
    skills: skills.skills || [],
    agents: agents.agents || [],
    teams: teams.teams || [],
    policies: policies.policies || [],
  }));
}

export function createPolicy(payload) {
  return request("/v1/policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePolicy(policyId, payload) {
  return request(`/v1/policies/${policyId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
