import React, { useEffect, useMemo, useState } from "react";

import { createPolicy, loadPolicyDashboard, updatePolicy } from "./api.js";

const EMPTY_POLICY_FORM = {
  id: "",
  name: "",
  scope: "global",
  effect: "review",
  approval_threshold: "0.75",
  role_id: "",
  execution_modes: ["delegation"],
  context_tag: "",
  provider_names: [],
  allowed_skill_ids: [],
  blocked_skill_ids: [],
  allowed_delegation_targets: [],
  blocked_delegation_targets: [],
  requires_approval: true,
  max_delegations: "",
  max_skill_executions: "",
};

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function hydratePolicyForm(policy) {
  if (!policy) {
    return EMPTY_POLICY_FORM;
  }
  return {
    id: policy.id,
    name: policy.name || "",
    scope: policy.scope || "global",
    effect: policy.effect || "review",
    approval_threshold: `${policy.approval_threshold ?? "0.75"}`,
    role_id: policy.conditions?.role_ids?.[0] || "",
    execution_modes: policy.conditions?.execution_modes || ["delegation"],
    context_tag: policy.conditions?.context_tags?.[0] || "",
    provider_names: policy.restrictions?.provider_names || [],
    allowed_skill_ids: policy.restrictions?.allowed_skill_ids || [],
    blocked_skill_ids: policy.restrictions?.skill_ids || [],
    allowed_delegation_targets: policy.restrictions?.allowed_delegation_targets || [],
    blocked_delegation_targets: policy.restrictions?.delegation_targets || [],
    requires_approval: Boolean(policy.restrictions?.requires_approval || policy.effect === "review"),
    max_delegations: policy.restrictions?.max_delegations?.toString() || "",
    max_skill_executions: policy.restrictions?.max_skill_executions?.toString() || "",
  };
}

function toPolicyPayload(form, subsystem) {
  return {
    name: form.name.trim(),
    scope: form.scope,
    effect: form.effect,
    approval_threshold: Number.parseFloat(form.approval_threshold || "0.75"),
    conditions: {
      role_ids: form.role_id ? [form.role_id] : [],
      execution_modes: form.execution_modes,
      context_tags: form.context_tag.trim() ? [form.context_tag.trim()] : [],
      subsystems: subsystem ? [subsystem] : [],
    },
    restrictions: {
      allowed_skill_ids: form.allowed_skill_ids,
      skill_ids: form.blocked_skill_ids,
      allowed_delegation_targets: form.allowed_delegation_targets,
      delegation_targets: form.blocked_delegation_targets,
      provider_names: form.provider_names,
      requires_approval: form.requires_approval,
      max_delegations: form.max_delegations ? Number.parseInt(form.max_delegations, 10) : null,
      max_skill_executions: form.max_skill_executions ? Number.parseInt(form.max_skill_executions, 10) : null,
    },
  };
}

function inferSubsystem(teams) {
  const firstAdmin = teams.find((team) => (team.governance_config?.head_admin_agent_id ? true : false));
  return firstAdmin ? "admin" : "mission";
}

export default function PolicyManagementDashboard() {
  const [dashboard, setDashboard] = useState({
    roles: [],
    skills: [],
    agents: [],
    teams: [],
    policies: [],
  });
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refreshDashboard() {
    setLoading(true);
    setError("");
    try {
      const payload = await loadPolicyDashboard();
      setDashboard(payload);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, []);

  useEffect(() => {
    const policy = dashboard.policies.find((item) => item.id === selectedPolicyId);
    if (selectedPolicyId && !policy) {
      setSelectedPolicyId("");
      setPolicyForm(EMPTY_POLICY_FORM);
      return;
    }
    if (policy) {
      setPolicyForm(hydratePolicyForm(policy));
    }
  }, [dashboard.policies, selectedPolicyId]);

  const skillLookup = useMemo(
    () => Object.fromEntries(dashboard.skills.map((skill) => [skill.id, skill])),
    [dashboard.skills],
  );
  const agentLookup = useMemo(
    () => Object.fromEntries(dashboard.agents.map((agent) => [agent.id, agent])),
    [dashboard.agents],
  );
  const subsystem = inferSubsystem(dashboard.teams);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = toPolicyPayload(policyForm, subsystem);
      if (policyForm.id) {
        await updatePolicy(policyForm.id, payload);
        setSuccess("Policy updated.");
      } else {
        await createPolicy(payload);
        setSuccess("Policy created.");
      }
      setSelectedPolicyId("");
      setPolicyForm(EMPTY_POLICY_FORM);
      await refreshDashboard();
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
          <p className="builder-kicker">Phase 8</p>
          <h1>Policy And Permission Enforcement</h1>
          <p className="builder-subtitle">
            Manage governance rules for delegation targets, skill access, provider restrictions, approval triggers, and execution limits.
          </p>
        </div>
        <button className="builder-button builder-button-secondary" type="button" onClick={refreshDashboard} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh policies"}
        </button>
      </section>

      {error ? <div className="builder-alert builder-alert-error">{error}</div> : null}
      {success ? <div className="builder-alert builder-alert-success">{success}</div> : null}

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Policy Management</h2>
              <p>Create or update enforcement rules without changing the orchestration graph.</p>
            </div>
            <select value={selectedPolicyId} onChange={(event) => setSelectedPolicyId(event.target.value)}>
              <option value="">New policy</option>
              {dashboard.policies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name}
                </option>
              ))}
            </select>
          </div>

          <form className="builder-form" onSubmit={handleSubmit}>
            <div className="builder-form-grid">
              <label>
                <span>Name</span>
                <input value={policyForm.name} onChange={(event) => setPolicyForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>Effect</span>
                <select value={policyForm.effect} onChange={(event) => setPolicyForm((current) => ({ ...current, effect: event.target.value }))}>
                  <option value="allow">allow</option>
                  <option value="review">review</option>
                  <option value="deny">deny</option>
                </select>
              </label>
              <label>
                <span>Scope</span>
                <input value={policyForm.scope} onChange={(event) => setPolicyForm((current) => ({ ...current, scope: event.target.value }))} />
              </label>
              <label>
                <span>Approval Threshold</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={policyForm.approval_threshold}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, approval_threshold: event.target.value }))}
                />
              </label>
            </div>

            <div className="builder-form-grid">
              <label>
                <span>Role Scope</span>
                <select value={policyForm.role_id} onChange={(event) => setPolicyForm((current) => ({ ...current, role_id: event.target.value }))}>
                  <option value="">Global</option>
                  {dashboard.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Context Tag</span>
                <input
                  value={policyForm.context_tag}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, context_tag: event.target.value }))}
                  placeholder="block-delegation"
                />
              </label>
            </div>

            <div>
              <span className="builder-field-label">Execution modes</span>
              <div className="builder-checkbox-grid">
                {["delegation", "skill_execution", "approval"].map((mode) => (
                  <label className="builder-check" key={mode}>
                    <input
                      type="checkbox"
                      checked={policyForm.execution_modes.includes(mode)}
                      onChange={() =>
                        setPolicyForm((current) => ({
                          ...current,
                          execution_modes: toggleValue(current.execution_modes, mode),
                        }))
                      }
                    />
                    <span>{mode}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="builder-team-panels">
              <div>
                <span className="builder-field-label">Allowed skills</span>
                <div className="builder-checkbox-grid">
                  {dashboard.skills.map((skill) => (
                    <label className="builder-check" key={`allow-${skill.id}`}>
                      <input
                        type="checkbox"
                        checked={policyForm.allowed_skill_ids.includes(skill.id)}
                        onChange={() =>
                          setPolicyForm((current) => ({
                            ...current,
                            allowed_skill_ids: toggleValue(current.allowed_skill_ids, skill.id),
                          }))
                        }
                      />
                      <span>{skill.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="builder-field-label">Blocked skills</span>
                <div className="builder-checkbox-grid">
                  {dashboard.skills.map((skill) => (
                    <label className="builder-check" key={`block-${skill.id}`}>
                      <input
                        type="checkbox"
                        checked={policyForm.blocked_skill_ids.includes(skill.id)}
                        onChange={() =>
                          setPolicyForm((current) => ({
                            ...current,
                            blocked_skill_ids: toggleValue(current.blocked_skill_ids, skill.id),
                          }))
                        }
                      />
                      <span>{skill.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="builder-team-panels">
              <div>
                <span className="builder-field-label">Allowed delegation targets</span>
                <div className="builder-checkbox-grid">
                  {dashboard.agents.map((agent) => (
                    <label className="builder-check" key={`allow-agent-${agent.id}`}>
                      <input
                        type="checkbox"
                        checked={policyForm.allowed_delegation_targets.includes(agent.id)}
                        onChange={() =>
                          setPolicyForm((current) => ({
                            ...current,
                            allowed_delegation_targets: toggleValue(current.allowed_delegation_targets, agent.id),
                          }))
                        }
                      />
                      <span>{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="builder-field-label">Blocked delegation targets</span>
                <div className="builder-checkbox-grid">
                  {dashboard.agents.map((agent) => (
                    <label className="builder-check" key={`block-agent-${agent.id}`}>
                      <input
                        type="checkbox"
                        checked={policyForm.blocked_delegation_targets.includes(agent.id)}
                        onChange={() =>
                          setPolicyForm((current) => ({
                            ...current,
                            blocked_delegation_targets: toggleValue(current.blocked_delegation_targets, agent.id),
                          }))
                        }
                      />
                      <span>{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="builder-form-grid">
              <label>
                <span>Max Delegations</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={policyForm.max_delegations}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, max_delegations: event.target.value }))}
                />
              </label>
              <label>
                <span>Max Skill Executions</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={policyForm.max_skill_executions}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, max_skill_executions: event.target.value }))}
                />
              </label>
            </div>

            <div>
              <span className="builder-field-label">Blocked providers</span>
              <div className="builder-checkbox-grid">
                {["mock", "openai", "ollama"].map((provider) => (
                  <label className="builder-check" key={provider}>
                    <input
                      type="checkbox"
                      checked={policyForm.provider_names.includes(provider)}
                      onChange={() =>
                        setPolicyForm((current) => ({
                          ...current,
                          provider_names: toggleValue(current.provider_names, provider),
                        }))
                      }
                    />
                    <span>{provider}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="builder-check">
              <input
                type="checkbox"
                checked={policyForm.requires_approval}
                onChange={(event) => setPolicyForm((current) => ({ ...current, requires_approval: event.target.checked }))}
              />
              <span>Require approval when this policy matches</span>
            </label>

            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving}>
                {policyForm.id ? "Update policy" : "Create policy"}
              </button>
              {policyForm.id ? (
                <button
                  className="builder-button builder-button-secondary"
                  type="button"
                  onClick={() => {
                    setSelectedPolicyId("");
                    setPolicyForm(EMPTY_POLICY_FORM);
                  }}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Role To Skill Permission Matrix</h2>
              <p>Visibility into baseline role skill bindings and role-scoped policy allowances.</p>
            </div>
          </div>
          <div className="policy-matrix">
            {dashboard.roles.map((role) => (
              <div className="policy-matrix-row" key={role.id}>
                <strong>{role.name}</strong>
                <div className="policy-matrix-cells">
                  {dashboard.skills.map((skill) => {
                    const allowedByRole = role.skill_ids?.includes(skill.id) || role.permissions?.allowed_skill_ids?.includes(skill.id);
                    const allowedByPolicy = dashboard.policies.some(
                      (policy) =>
                        policy.conditions?.role_ids?.includes(role.id) &&
                        policy.restrictions?.allowed_skill_ids?.includes(skill.id),
                    );
                    const blockedByPolicy = dashboard.policies.some(
                      (policy) =>
                        policy.conditions?.role_ids?.includes(role.id) &&
                        policy.restrictions?.skill_ids?.includes(skill.id),
                    );
                    return (
                      <span
                        className={`policy-matrix-cell${blockedByPolicy ? " policy-matrix-cell-blocked" : allowedByRole || allowedByPolicy ? " policy-matrix-cell-allowed" : ""}`}
                        key={`${role.id}-${skill.id}`}
                      >
                        {skillLookup[skill.id]?.slug || skill.slug}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="builder-card builder-card-full">
          <div className="builder-section-heading">
            <div>
              <h2>Delegation Permission Editor</h2>
              <p>Review which policies currently allow or block delegation targets for each managed team.</p>
            </div>
          </div>
          <div className="builder-list">
            {dashboard.teams.map((team) => (
              <div className="builder-list-item" key={team.id}>
                <div>
                  <strong>{team.name}</strong>
                  <p>Configured team delegates: {(team.governance_config?.delegation_targets || []).map((agentId) => agentLookup[agentId]?.name || agentId).join(", ") || "None"}</p>
                  <p>
                    Policy-allowed delegates:{" "}
                    {dashboard.policies
                      .flatMap((policy) => policy.restrictions?.allowed_delegation_targets || [])
                      .map((agentId) => agentLookup[agentId]?.name || agentId)
                      .join(", ") || "None"}
                  </p>
                </div>
                <span className="builder-badge">team</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
