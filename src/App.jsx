import React from "react";
import AgentBuilderDashboard from "./features/builder/AgentBuilderDashboard.jsx";
import NexusAgentPlatform from "./features/nexus/NexusAgentPlatform.jsx";
import ExecutionObservabilityDashboard from "./features/observability/ExecutionObservabilityDashboard.jsx";
import PolicyManagementDashboard from "./features/policies/PolicyManagementDashboard.jsx";

export default function App() {
  const [activeView, setActiveView] = React.useState("operations");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-kicker">Multi-Agent Platform</p>
          <h1>Operational Console</h1>
        </div>
        <div className="app-nav">
          <button
            className={`app-nav-button${activeView === "operations" ? " app-nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView("operations")}
          >
            Orchestration
          </button>
          <button
            className={`app-nav-button${activeView === "builder" ? " app-nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView("builder")}
          >
            Agent Builder
          </button>
          <button
            className={`app-nav-button${activeView === "observability" ? " app-nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView("observability")}
          >
            Observability
          </button>
          <button
            className={`app-nav-button${activeView === "policies" ? " app-nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView("policies")}
          >
            Policies
          </button>
        </div>
      </header>
      <main className="app-main">
        {activeView === "operations" ? <NexusAgentPlatform /> : null}
        {activeView === "builder" ? <AgentBuilderDashboard /> : null}
        {activeView === "observability" ? <ExecutionObservabilityDashboard /> : null}
        {activeView === "policies" ? <PolicyManagementDashboard /> : null}
      </main>
    </div>
  );
}
