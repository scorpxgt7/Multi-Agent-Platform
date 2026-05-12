import React from "react";
import { Activity, Clock3, Database, Eye, IdCard, Shield, Workflow } from "lucide-react";

import AgentBuilderDashboard from "./features/builder/AgentBuilderDashboard.jsx";
import IdentityManagementDashboard from "./features/identity/IdentityManagementDashboard.jsx";
import { readIdentityState, writeIdentityState } from "./features/identity/session.js";
import NexusAgentPlatform from "./features/nexus/NexusAgentPlatform.jsx";
import ExecutionObservabilityDashboard from "./features/observability/ExecutionObservabilityDashboard.jsx";
import PolicyManagementDashboard from "./features/policies/PolicyManagementDashboard.jsx";
import QueueRuntimeDashboard from "./features/queue/QueueRuntimeDashboard.jsx";
import WorkflowBuilder from "./features/workflow/WorkflowBuilder.jsx";

const ROLE_UI_PERMISSIONS = {
  admin: new Set(["builder", "console", "runtime", "queue", "registry", "governance", "identity"]),
  operator: new Set(["builder", "console", "runtime", "queue", "registry", "governance"]),
  viewer: new Set(["builder", "runtime"]),
};

const TABS = [
  { id: "builder", label: "Builder", icon: Workflow },
  { id: "console", label: "Console", icon: Activity },
  { id: "runtime", label: "Runtime", icon: Eye },
  { id: "queue", label: "Queue", icon: Clock3 },
  { id: "registry", label: "Registry", icon: Database },
  { id: "governance", label: "Governance", icon: Shield },
  { id: "identity", label: "Identity", icon: IdCard },
];

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button className={`app-nav-button${active ? " app-nav-button-active" : ""}`} type="button" onClick={onClick}>
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const [activeView, setActiveView] = React.useState("builder");
  const [identityState, setIdentityState] = React.useState(() => readIdentityState());
  const [apiKeyDraft, setApiKeyDraft] = React.useState(() => readIdentityState().apiKey || "");

  const [deployStatus, setDeployStatus] = React.useState({ checked: false, ok: false });
  React.useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!mounted) return;
        setDeployStatus({ checked: true, ok: res.ok });
      } catch (e) {
        if (!mounted) return;
        setDeployStatus({ checked: true, ok: false });
      }
    }
    check();
    return () => {
      mounted = false;
    };
  }, []);

  const operatorRole = identityState.operator?.role || "";
  const allowedViews = operatorRole ? ROLE_UI_PERMISSIONS[operatorRole] || ROLE_UI_PERMISSIONS.viewer : new Set(["identity"]);

  React.useEffect(() => {
    if (!allowedViews.has(activeView)) {
      setActiveView(allowedViews.has("builder") ? "builder" : "identity");
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
    <div className="app-shell app-shell-builder">
      <header className="app-header app-header-builder">
        <div className="app-brand">
          <p className="app-kicker">Visual AI Workforce Builder</p>
          <h1>Governed orchestration graph designer</h1>
          {deployStatus.checked ? (
            <div className={`deploy-banner ${deployStatus.ok ? "ok" : "down"}`}>
              {deployStatus.ok ? "Deployment: OK" : "Deployment: Issues detected"}
              <span style={{ marginLeft: 8, fontSize: 12, color: "#8fa0b0" }}>
                Env: {import.meta.env.VITE_DEPLOY_ENV || "local"}
              </span>
            </div>
          ) : (
            <div className="deploy-banner checking">Checking deployment...</div>
          )}
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
            Save key
          </button>
        </div>
        <div className="app-nav app-nav-builder">
          {TABS.filter((tab) => allowedViews.has(tab.id)).map((tab) => (
            <TabButton
              key={tab.id}
              active={activeView === tab.id}
              icon={tab.icon}
              label={tab.label}
              onClick={() => setActiveView(tab.id)}
            />
          ))}
        </div>
      </header>

      <main className="app-main app-main-builder">
        {activeView === "builder" ? <WorkflowBuilder identityState={identityState} /> : null}
        {activeView === "console" ? <NexusAgentPlatform /> : null}
        {activeView === "runtime" ? <ExecutionObservabilityDashboard /> : null}
        {activeView === "queue" ? <QueueRuntimeDashboard /> : null}
        {activeView === "registry" ? <AgentBuilderDashboard /> : null}
        {activeView === "governance" ? <PolicyManagementDashboard /> : null}
        {activeView === "identity" ? <IdentityManagementDashboard identityState={identityState} onIdentityChange={handleIdentityChange} /> : null}
      </main>
    </div>
  );
}
