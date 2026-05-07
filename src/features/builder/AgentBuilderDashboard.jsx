import React, { useEffect, useMemo, useState } from "react";

import { createAgent, createSkill, createTeam, loadRegistry, updateAgent, updateTeam } from "./api.js";

const EMPTY_SKILL_FORM = {
  name: "",
  slug: "",
  description: "",
  version: "1.0.0",
  execution_type: "hybrid",
  prompt: "",
  tools: "",
};

const EMPTY_AGENT_FORM = {
  id: "",
  name: "",
  role_id: "",
  autonomy_level: "supervised",
  skill_ids: [],
  memory_namespace: "default",
  notes: "",
};

const EMPTY_TEAM_FORM = {
  id: "",
  name: "",
  description: "",
  agent_ids: [],
  head_admin_agent_id: "",
  delegation_targets: [],
  risk_score: "0.82",
};

function toSkillPayload(form) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim(),
    version: form.version.trim() || "1.0.0",
    execution_type: form.execution_type,
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    config: {
      prompt: form.prompt.trim(),
      tools: form.tools
        .split(",")
        .map((tool) => tool.trim())
        .filter(Boolean),
    },
    dependency_ids: [],
  };
}

function toAgentPayload(form) {
  return {
    name: form.name.trim(),
    role_id: form.role_id,
    autonomy_level: form.autonomy_level,
    memory_config: {
      namespace: form.memory_namespace.trim() || "default",
    },
    skill_overrides: form.notes.trim() ? { notes: form.notes.trim() } : {},
    config: form.notes.trim() ? { profile_notes: form.notes.trim() } : {},
    skill_ids: form.skill_ids,
  };
}

function toTeamPayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    governance_config: {
      head_admin_agent_id: form.head_admin_agent_id || null,
      delegation_targets: form.delegation_targets,
      risk_score: Number.parseFloat(form.risk_score || "0.82"),
    },
    agent_ids: form.agent_ids,
  };
}

function hydrateAgentForm(agent) {
  if (!agent) {
    return EMPTY_AGENT_FORM;
  }
  return {
    id: agent.id,
    name: agent.name || "",
    role_id: agent.role_id || "",
    autonomy_level: agent.autonomy_level || "supervised",
    skill_ids: agent.skill_ids || [],
    memory_namespace: agent.memory_config?.namespace || "default",
    notes: agent.config?.profile_notes || agent.skill_overrides?.notes || "",
  };
}

function hydrateTeamForm(team) {
  if (!team) {
    return EMPTY_TEAM_FORM;
  }
  return {
    id: team.id,
    name: team.name || "",
    description: team.description || "",
    agent_ids: team.agent_ids || [],
    head_admin_agent_id: team.governance_config?.head_admin_agent_id || "",
    delegation_targets: team.governance_config?.delegation_targets || [],
    risk_score: `${team.governance_config?.risk_score ?? "0.82"}`,
  };
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function AgentBuilderDashboard() {
  const [registry, setRegistry] = useState({
    roles: [],
    skills: [],
    agents: [],
    teams: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [skillForm, setSkillForm] = useState(EMPTY_SKILL_FORM);
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT_FORM);
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  async function refreshRegistry() {
    setLoading(true);
    setError("");
    try {
      const payload = await loadRegistry();
      setRegistry(payload);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshRegistry();
  }, []);

  useEffect(() => {
    const agent = registry.agents.find((item) => item.id === selectedAgentId);
    if (selectedAgentId && !agent) {
      setSelectedAgentId("");
      setAgentForm(EMPTY_AGENT_FORM);
      return;
    }
    if (agent) {
      setAgentForm(hydrateAgentForm(agent));
    }
  }, [registry.agents, selectedAgentId]);

  useEffect(() => {
    const team = registry.teams.find((item) => item.id === selectedTeamId);
    if (selectedTeamId && !team) {
      setSelectedTeamId("");
      setTeamForm(EMPTY_TEAM_FORM);
      return;
    }
    if (team) {
      setTeamForm(hydrateTeamForm(team));
    }
  }, [registry.teams, selectedTeamId]);

  const agentLookup = useMemo(
    () => Object.fromEntries(registry.agents.map((agent) => [agent.id, agent])),
    [registry.agents],
  );
  const skillLookup = useMemo(
    () => Object.fromEntries(registry.skills.map((skill) => [skill.id, skill])),
    [registry.skills],
  );

  async function handleCreateSkill(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await createSkill(toSkillPayload(skillForm));
      setSkillForm(EMPTY_SKILL_FORM);
      setSuccess("Skill registered.");
      await refreshRegistry();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitAgent(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = toAgentPayload(agentForm);
      if (agentForm.id) {
        await updateAgent(agentForm.id, payload);
        setSuccess("Agent profile updated.");
      } else {
        await createAgent(payload);
        setSuccess("Agent created.");
      }
      setSelectedAgentId("");
      setAgentForm(EMPTY_AGENT_FORM);
      await refreshRegistry();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitTeam(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = toTeamPayload(teamForm);
      if (teamForm.id) {
        await updateTeam(teamForm.id, payload);
        setSuccess("Team composition updated.");
      } else {
        await createTeam(payload);
        setSuccess("Team created.");
      }
      setSelectedTeamId("");
      setTeamForm(EMPTY_TEAM_FORM);
      await refreshRegistry();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="builder-shell">
      <section className="builder-hero">
        <div>
          <p className="builder-kicker">Phase 6</p>
          <h1>Agent Builder And Skill Registry</h1>
          <p className="builder-subtitle">
            Manage skill inventory, agent profiles, and team delegation without moving orchestration logic into the
            browser.
          </p>
        </div>
        <button className="builder-button builder-button-secondary" type="button" onClick={refreshRegistry} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh registry"}
        </button>
      </section>

      {error ? <div className="builder-alert builder-alert-error">{error}</div> : null}
      {success ? <div className="builder-alert builder-alert-success">{success}</div> : null}

      <section className="builder-grid builder-grid-overview">
        <article className="builder-card">
          <span className="builder-metric-label">Roles</span>
          <strong className="builder-metric-value">{registry.roles.length}</strong>
          <p className="builder-card-note">Role bindings define approval thresholds and default skill coverage.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Skills</span>
          <strong className="builder-metric-value">{registry.skills.length}</strong>
          <p className="builder-card-note">Skills stay service-backed and versioned. This registry only manages metadata.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Agents</span>
          <strong className="builder-metric-value">{registry.agents.length}</strong>
          <p className="builder-card-note">Agent profiles bind role, autonomy, skill assignments, and memory namespace.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Teams</span>
          <strong className="builder-metric-value">{registry.teams.length}</strong>
          <p className="builder-card-note">Team composition stores Head Admin routing and delegation targets for orchestration use.</p>
        </article>
      </section>

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Skill Registry</h2>
              <p>Expose the current skill inventory and register new skills for agent assignment.</p>
            </div>
          </div>

          <form className="builder-form" onSubmit={handleCreateSkill}>
            <div className="builder-form-grid">
              <label>
                <span>Name</span>
                <input
                  value={skillForm.name}
                  onChange={(event) => setSkillForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  value={skillForm.slug}
                  onChange={(event) => setSkillForm((current) => ({ ...current, slug: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Execution Type</span>
                <select
                  value={skillForm.execution_type}
                  onChange={(event) => setSkillForm((current) => ({ ...current, execution_type: event.target.value }))}
                >
                  <option value="tool">tool</option>
                  <option value="reasoning">reasoning</option>
                  <option value="hybrid">hybrid</option>
                </select>
              </label>
              <label>
                <span>Version</span>
                <input
                  value={skillForm.version}
                  onChange={(event) => setSkillForm((current) => ({ ...current, version: event.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                rows="2"
                value={skillForm.description}
                onChange={(event) => setSkillForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label>
              <span>Prompt</span>
              <textarea
                rows="3"
                value={skillForm.prompt}
                onChange={(event) => setSkillForm((current) => ({ ...current, prompt: event.target.value }))}
              />
            </label>
            <label>
              <span>Tools (comma separated)</span>
              <input
                value={skillForm.tools}
                onChange={(event) => setSkillForm((current) => ({ ...current, tools: event.target.value }))}
              />
            </label>
            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving}>
                Register skill
              </button>
            </div>
          </form>

          <div className="builder-list">
            {registry.skills.map((skill) => (
              <div className="builder-list-item" key={skill.id}>
                <div>
                  <strong>{skill.name}</strong>
                  <p>
                    {skill.slug} - {skill.execution_type} - v{skill.version}
                  </p>
                </div>
                <span className="builder-badge">skill</span>
              </div>
            ))}
          </div>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Agent Builder</h2>
              <p>Create or edit role-bound agents and assign available skills.</p>
            </div>
            <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
              <option value="">New agent</option>
              {registry.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <form className="builder-form" onSubmit={handleSubmitAgent}>
            <div className="builder-form-grid">
              <label>
                <span>Name</span>
                <input
                  value={agentForm.name}
                  onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Role</span>
                <select
                  value={agentForm.role_id}
                  onChange={(event) => setAgentForm((current) => ({ ...current, role_id: event.target.value }))}
                  required
                >
                  <option value="">Select role</option>
                  {registry.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Autonomy</span>
                <select
                  value={agentForm.autonomy_level}
                  onChange={(event) => setAgentForm((current) => ({ ...current, autonomy_level: event.target.value }))}
                >
                  <option value="guided">guided</option>
                  <option value="supervised">supervised</option>
                  <option value="autonomous">autonomous</option>
                </select>
              </label>
              <label>
                <span>Memory namespace</span>
                <input
                  value={agentForm.memory_namespace}
                  onChange={(event) => setAgentForm((current) => ({ ...current, memory_namespace: event.target.value }))}
                />
              </label>
            </div>

            <label>
              <span>Profile notes</span>
              <textarea
                rows="2"
                value={agentForm.notes}
                onChange={(event) => setAgentForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div>
              <span className="builder-field-label">Assigned skills</span>
              <div className="builder-checkbox-grid">
                {registry.skills.map((skill) => (
                  <label className="builder-check" key={skill.id}>
                    <input
                      type="checkbox"
                      checked={agentForm.skill_ids.includes(skill.id)}
                      onChange={() =>
                        setAgentForm((current) => ({
                          ...current,
                          skill_ids: toggleValue(current.skill_ids, skill.id),
                        }))
                      }
                    />
                    <span>{skill.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving}>
                {agentForm.id ? "Update agent" : "Create agent"}
              </button>
              {agentForm.id ? (
                <button
                  className="builder-button builder-button-secondary"
                  type="button"
                  onClick={() => {
                    setSelectedAgentId("");
                    setAgentForm(EMPTY_AGENT_FORM);
                  }}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </form>

          <div className="builder-list">
            {registry.agents.map((agent) => (
              <button
                className="builder-list-item builder-list-item-button"
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <div>
                  <strong>{agent.name}</strong>
                  <p>
                    {agent.role_name || "Unbound role"} - {agent.autonomy_level} - {agent.skill_ids.length} skills
                  </p>
                </div>
                <span className="builder-badge">agent</span>
              </button>
            ))}
          </div>
        </article>

        <article className="builder-card builder-card-full">
          <div className="builder-section-heading">
            <div>
              <h2>Team Composition</h2>
              <p>Define Head Admin routing, delegation targets, and active team membership.</p>
            </div>
            <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
              <option value="">New team</option>
              {registry.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <form className="builder-form" onSubmit={handleSubmitTeam}>
            <div className="builder-form-grid">
              <label>
                <span>Name</span>
                <input
                  value={teamForm.name}
                  onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Risk score</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={teamForm.risk_score}
                  onChange={(event) => setTeamForm((current) => ({ ...current, risk_score: event.target.value }))}
                />
              </label>
            </div>

            <label>
              <span>Description</span>
              <textarea
                rows="2"
                value={teamForm.description}
                onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>

            <div className="builder-form-grid">
              <label>
                <span>Head Admin delegate owner</span>
                <select
                  value={teamForm.head_admin_agent_id}
                  onChange={(event) => setTeamForm((current) => ({ ...current, head_admin_agent_id: event.target.value }))}
                >
                  <option value="">Select agent</option>
                  {registry.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="builder-team-panels">
              <div>
                <span className="builder-field-label">Team membership</span>
                <div className="builder-checkbox-grid">
                  {registry.agents.map((agent) => (
                    <label className="builder-check" key={agent.id}>
                      <input
                        type="checkbox"
                        checked={teamForm.agent_ids.includes(agent.id)}
                        onChange={() =>
                          setTeamForm((current) => ({
                            ...current,
                            agent_ids: toggleValue(current.agent_ids, agent.id),
                          }))
                        }
                      />
                      <span>{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="builder-field-label">Delegation targets</span>
                <div className="builder-checkbox-grid">
                  {registry.agents.map((agent) => (
                    <label className="builder-check" key={`delegate-${agent.id}`}>
                      <input
                        type="checkbox"
                        checked={teamForm.delegation_targets.includes(agent.id)}
                        onChange={() =>
                          setTeamForm((current) => ({
                            ...current,
                            delegation_targets: toggleValue(current.delegation_targets, agent.id),
                          }))
                        }
                      />
                      <span>{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving}>
                {teamForm.id ? "Update team" : "Create team"}
              </button>
              {teamForm.id ? (
                <button
                  className="builder-button builder-button-secondary"
                  type="button"
                  onClick={() => {
                    setSelectedTeamId("");
                    setTeamForm(EMPTY_TEAM_FORM);
                  }}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </form>

          <div className="builder-list">
            {registry.teams.map((team) => (
              <button
                className="builder-list-item builder-list-item-button"
                key={team.id}
                type="button"
                onClick={() => setSelectedTeamId(team.id)}
              >
                <div>
                  <strong>{team.name}</strong>
                  <p>
                    {(team.agent_ids || []).map((agentId) => agentLookup[agentId]?.name || agentId).join(", ") || "No agents"}
                  </p>
                  <p>
                    Delegates:{" "}
                    {(team.governance_config?.delegation_targets || [])
                      .map((agentId) => agentLookup[agentId]?.name || agentId)
                      .join(", ") || "None"}
                  </p>
                </div>
                <span className="builder-badge">team</span>
              </button>
            ))}
          </div>
        </article>

        <article className="builder-card builder-card-full">
          <div className="builder-section-heading">
            <div>
              <h2>Registry Snapshot</h2>
              <p>Visual overview of current orchestration entities without duplicating backend logic.</p>
            </div>
          </div>
          <div className="builder-snapshot-grid">
            {registry.agents.map((agent) => (
              <div className="builder-snapshot-card" key={agent.id}>
                <h3>{agent.name}</h3>
                <p>{agent.role_name || "Unbound role"}</p>
                <ul>
                  {agent.skill_ids.map((skillId) => (
                    <li key={`${agent.id}-${skillId}`}>{skillLookup[skillId]?.name || skillId}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
