import React, { useEffect, useState } from "react";

import { bootstrapOrganization, createOperator, listOperators, listOrganizations, updateOperator } from "./api.js";
import { readIdentityState, writeIdentityState } from "./session.js";

const EMPTY_BOOTSTRAP_FORM = {
  organization_name: "",
  organization_slug: "",
  workspace_name: "",
  workspace_slug: "",
  operator_name: "",
  operator_email: "",
};

const EMPTY_OPERATOR_FORM = {
  id: "",
  name: "",
  email: "",
  role: "viewer",
  is_active: true,
};

export default function IdentityManagementDashboard({ identityState, onIdentityChange }) {
  const [organizations, setOrganizations] = useState([]);
  const [operators, setOperators] = useState([]);
  const [bootstrapForm, setBootstrapForm] = useState(EMPTY_BOOTSTRAP_FORM);
  const [operatorForm, setOperatorForm] = useState(EMPTY_OPERATOR_FORM);
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const orgList = await listOrganizations();
      setOrganizations(orgList);
      const nextState = writeIdentityState({
        ...readIdentityState(),
        ...identityState,
        organizations: orgList,
      });
      onIdentityChange(nextState);
      if (identityState.apiKey) {
        const operatorList = await listOperators();
        setOperators(operatorList);
      } else {
        setOperators([]);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [identityState.apiKey]);

  useEffect(() => {
    const selected = operators.find((item) => item.id === selectedOperatorId);
    if (!selected) {
      setOperatorForm(EMPTY_OPERATOR_FORM);
      return;
    }
    setOperatorForm({
      id: selected.id,
      name: selected.name || "",
      email: selected.email || "",
      role: selected.role || "viewer",
      is_active: selected.is_active ?? true,
    });
  }, [operators, selectedOperatorId]);

  async function handleBootstrap(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = await bootstrapOrganization(bootstrapForm);
      const nextState = writeIdentityState({
        ...readIdentityState(),
        organizations: organizations.concat(payload.organization),
        activeOrganizationId: payload.organization.id,
        apiKey: payload.api_key,
        operator: payload.operator,
      });
      onIdentityChange(nextState);
      setBootstrapForm(EMPTY_BOOTSTRAP_FORM);
      setSuccess("Organization bootstrapped and admin API key stored locally.");
      await refresh();
    } catch (bootstrapError) {
      setError(bootstrapError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleOperatorSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: operatorForm.name.trim(),
        email: operatorForm.email.trim(),
        role: operatorForm.role,
        permissions: {},
        is_active: operatorForm.is_active,
      };
      if (operatorForm.id) {
        await updateOperator(operatorForm.id, payload);
        setSuccess("Operator updated.");
      } else {
        await createOperator(payload);
        setSuccess("Operator created.");
      }
      setSelectedOperatorId("");
      setOperatorForm(EMPTY_OPERATOR_FORM);
      await refresh();
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
          <p className="builder-kicker">Phase 9</p>
          <h1>Identity And Organization</h1>
          <p className="builder-subtitle">
            Bootstrap organizations, manage operators, and inspect RBAC visibility before adding full authentication.
          </p>
        </div>
        <button className="builder-button builder-button-secondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh identity"}
        </button>
      </section>

      {error ? <div className="builder-alert builder-alert-error">{error}</div> : null}
      {success ? <div className="builder-alert builder-alert-success">{success}</div> : null}

      <section className="builder-grid builder-grid-overview">
        <article className="builder-card">
          <span className="builder-metric-label">Organizations</span>
          <strong className="builder-metric-value">{organizations.length}</strong>
          <p className="builder-card-note">Organization boundaries scope teams, policies, operators, and executions.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Active Organization</span>
          <strong className="builder-metric-value">{identityState.activeOrganizationId ? "Scoped" : "Unset"}</strong>
          <p className="builder-card-note">{identityState.activeOrganizationId || "Select or bootstrap an organization to scope the console."}</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Operator Role</span>
          <strong className="builder-metric-value">{identityState.operator?.role || "anonymous"}</strong>
          <p className="builder-card-note">UI controls should follow the active operator permission set.</p>
        </article>
      </section>

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Organization Bootstrap</h2>
              <p>Create a new organization workspace and the initial admin operator.</p>
            </div>
          </div>
          <form className="builder-form" onSubmit={handleBootstrap}>
            <div className="builder-form-grid">
              <label>
                <span>Organization name</span>
                <input value={bootstrapForm.organization_name} onChange={(event) => setBootstrapForm((current) => ({ ...current, organization_name: event.target.value }))} required />
              </label>
              <label>
                <span>Organization slug</span>
                <input value={bootstrapForm.organization_slug} onChange={(event) => setBootstrapForm((current) => ({ ...current, organization_slug: event.target.value }))} required />
              </label>
              <label>
                <span>Workspace name</span>
                <input value={bootstrapForm.workspace_name} onChange={(event) => setBootstrapForm((current) => ({ ...current, workspace_name: event.target.value }))} />
              </label>
              <label>
                <span>Workspace slug</span>
                <input value={bootstrapForm.workspace_slug} onChange={(event) => setBootstrapForm((current) => ({ ...current, workspace_slug: event.target.value }))} />
              </label>
              <label>
                <span>Admin operator</span>
                <input value={bootstrapForm.operator_name} onChange={(event) => setBootstrapForm((current) => ({ ...current, operator_name: event.target.value }))} required />
              </label>
              <label>
                <span>Admin email</span>
                <input value={bootstrapForm.operator_email} onChange={(event) => setBootstrapForm((current) => ({ ...current, operator_email: event.target.value }))} required />
              </label>
            </div>
            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving}>Bootstrap organization</button>
            </div>
          </form>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Operator Management</h2>
              <p>Create or update organization-scoped operators and their RBAC roles.</p>
            </div>
            <select value={selectedOperatorId} onChange={(event) => setSelectedOperatorId(event.target.value)}>
              <option value="">New operator</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </div>

          {!identityState.apiKey ? <p className="builder-card-note">An API key is required to manage operators. Bootstrap an organization or paste an existing key in the header.</p> : null}

          <form className="builder-form" onSubmit={handleOperatorSubmit}>
            <div className="builder-form-grid">
              <label>
                <span>Name</span>
                <input value={operatorForm.name} onChange={(event) => setOperatorForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>Email</span>
                <input value={operatorForm.email} onChange={(event) => setOperatorForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <label>
                <span>Role</span>
                <select value={operatorForm.role} onChange={(event) => setOperatorForm((current) => ({ ...current, role: event.target.value }))}>
                  <option value="admin">admin</option>
                  <option value="operator">operator</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
            </div>

            <label className="builder-check">
              <input type="checkbox" checked={operatorForm.is_active} onChange={(event) => setOperatorForm((current) => ({ ...current, is_active: event.target.checked }))} />
              <span>Operator is active</span>
            </label>

            <div className="builder-form-actions">
              <button className="builder-button" type="submit" disabled={saving || !identityState.apiKey}>
                {operatorForm.id ? "Update operator" : "Create operator"}
              </button>
            </div>
          </form>

          <div className="builder-list">
            {operators.map((operator) => (
              <button className="builder-list-item builder-list-item-button" type="button" key={operator.id} onClick={() => setSelectedOperatorId(operator.id)}>
                <div>
                  <strong>{operator.name}</strong>
                  <p>{operator.email} - {operator.role}</p>
                </div>
                <span className="builder-badge">{operator.is_active ? "active" : "disabled"}</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
