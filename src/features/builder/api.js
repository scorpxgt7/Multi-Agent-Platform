const REGISTRY_API_BASE = (import.meta.env.VITE_REGISTRY_API_BASE || "/registry-api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${REGISTRY_API_BASE}${path}`, {
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
    const message = payload?.detail || payload?.error || response.statusText || "Registry request failed.";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return payload;
}

export function loadRegistry() {
  return Promise.all([
    request("/v1/roles"),
    request("/v1/skills"),
    request("/v1/agents"),
    request("/v1/teams"),
  ]).then(([roles, skills, agents, teams]) => ({
    roles: roles.roles || [],
    skills: skills.skills || [],
    agents: agents.agents || [],
    teams: teams.teams || [],
  }));
}

export function createSkill(payload) {
  return request("/v1/skills", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createAgent(payload) {
  return request("/v1/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgent(agentId, payload) {
  return request(`/v1/agents/${agentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createTeam(payload) {
  return request("/v1/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTeam(teamId, payload) {
  return request(`/v1/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
