import React from "react";
import AgentBuilderDashboard from "./features/builder/AgentBuilderDashboard.jsx";
import IdentityManagementDashboard from "./features/identity/IdentityManagementDashboard.jsx";
import { readIdentityState, writeIdentityState } from "./features/identity/session.js";
import NexusAgentPlatform from "./features/nexus/NexusAgentPlatform.jsx";
import ExecutionObservabilityDashboard from "./features/observability/ExecutionObservabilityDashboard.jsx";
import PolicyManagementDashboard from "./features/policies/PolicyManagementDashboard.jsx";

const ROLE_UI_PERMISSIONS = {
  admin: new Set(["identity", "operations", "builder", "observability", "policies"]),
  operator: new Set(["operations", "builder", "observability", "policies"]),
  viewer: new Set(["observability"]),
};

export default function App() {
  const [activeView, setActiveView] = React.useState("operations");
  const [identityState, setIdentityState] = React.useState(() => readIdentityState());
  const [apiKeyDraft, setApiKeyDraft] = React.useState(() => readIdentityState().apiKey || "");

  const operatorRole = identityState.operator?.role || "";
  const allowedViews = operatorRole ? ROLE_UI_PERMISSIONS[operatorRole] || ROLE_UI_PERMISSIONS.viewer : new Set(["identity"]);

  React.useEffect(() => {
    if (!allowedViews.has(activeView)) {
      setActiveView(allowedViews.has("identity") ? "identity" : "observability");
    }
  }, [activeView, allowedViews]);

  function handleIdentityChange(nextState) {
    setIdentityState(nextState);
    setApiKeyDraft(nextState.apiKey || "");
  }

  function handleSaveApiKey() {
    const nextState = writeIdentityState({
      ...identityState,
      apiKey: apiKeyDraft.trim(),
    });
    handleIdentityChange(nextState);
  }

  function handleSwitchOrganization(event) {
    const nextState = writeIdentityState({
      ...identityState,
      activeOrganizationId: event.target.value,
    });
    handleIdentityChange(nextState);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">Multi-Agent Platform</p>
          <h1>Operational Console</h1>
        </div>
        <div className="app-nav">
          {allowedViews.has("identity") ? (
            <button
              className={`app-nav-button${activeView === "identity" ? " app-nav-button-active" : ""}`}
              type="button"
              onClick={() => setActiveView("identity")}
            >
              Identity
            </button>
          ) : null}
          {allowedViews.has("operations") ? (
            <button
              className={`app-nav-button${activeView === "operations" ? " app-nav-button-active" : ""}`}
              type="button"
              onClick={() => setActiveView("operations")}
            >
              Orchestration
            </button>
          ) : null}
          {allowedViews.has("builder") ? (
            <button
              className={`app-nav-button${activeView === "builder" ? " app-nav-button-active" : ""}`}
              type="button"
              onClick={() => setActiveView("builder")}
            >
              Agent Builder
            </button>
          ) : null}
          {allowedViews.has("observability") ? (
            <button
              className={`app-nav-button${activeView === "observability" ? " app-nav-button-active" : ""}`}
              type="button"
              onClick={() => setActiveView("observability")}
            >
              Observability
            </button>
          ) : null}
          {allowedViews.has("policies") ? (
            <button
              className={`app-nav-button${activeView === "policies" ? " app-nav-button-active" : ""}`}
              type="button"
              onClick={() => setActiveView("policies")}
            >
              Policies
            </button>
          ) : null}
        </div>
        <div className="identity-header">
          <select value={identityState.activeOrganizationId || ""} onChange={handleSwitchOrganization}>
            <option value="">No organization selected</option>
            {(identityState.organizations || []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <input
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
            placeholder="Operator API key"
            type="password"
          />
          <button className="app-nav-button" type="button" onClick={handleSaveApiKey}>
            Save Key
          </button>
        </div>
      </header>
      <main className="app-main">
        {activeView === "identity" ? <IdentityManagementDashboard identityState={identityState} onIdentityChange={handleIdentityChange} /> : null}
        {activeView === "operations" ? <NexusAgentPlatform /> : null}
        {activeView === "builder" ? <AgentBuilderDashboard /> : null}
        {activeView === "observability" ? <ExecutionObservabilityDashboard /> : null}
        {activeView === "policies" ? <PolicyManagementDashboard /> : null}
      </main>
    </div>
  );
}
