import React, { useEffect, useMemo, useState } from "react";

import { getExecution, getExecutionStatus, listExecutions } from "./api.js";

function statusClass(status) {
  return `execution-status execution-status-${status || "unknown"}`;
}

export default function ExecutionObservabilityDashboard() {
  const [executions, setExecutions] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  async function refreshList() {
    setLoadingList(true);
    setError("");
    try {
      const items = await listExecutions();
      setExecutions(items);
      if (!selectedRequestId && items[0]?.request_id) {
        setSelectedRequestId(items[0].request_id);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingList(false);
    }
  }

  async function refreshDetail(requestId) {
    if (!requestId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      const payload = await getExecution(requestId);
      setDetail(payload);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

  useEffect(() => {
    refreshDetail(selectedRequestId);
  }, [selectedRequestId]);

  useEffect(() => {
    if (!detail?.execution?.request_id) {
      return undefined;
    }
    const currentStatus = detail.execution.latest_status;
    if (!["queued", "running"].includes(currentStatus)) {
      return undefined;
    }
    const timer = window.setInterval(async () => {
      try {
        const liveStatus = await getExecutionStatus(detail.execution.request_id);
        setDetail((current) =>
          current
            ? {
                ...current,
                execution: {
                  ...current.execution,
                  latest_status: liveStatus.latest_status,
                  current_step: liveStatus.current_step,
                  delegation_chain: liveStatus.delegation_chain,
                  provider_usage: liveStatus.provider_usage,
                  started_at: liveStatus.started_at,
                  completed_at: liveStatus.completed_at,
                },
              }
            : current,
        );
        if (!["queued", "running"].includes(liveStatus.latest_status)) {
          refreshList();
          refreshDetail(detail.execution.request_id);
        }
      } catch {
        // Keep the latest successful state on screen.
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [detail]);

  const metrics = useMemo(() => {
    return executions.reduce(
      (summary, execution) => {
        summary.total += 1;
        if (execution.latest_status === "completed") summary.completed += 1;
        if (execution.latest_status === "failed") summary.failed += 1;
        if (execution.latest_status === "awaiting_approval") summary.awaitingApproval += 1;
        if (execution.latest_status === "queued" || execution.latest_status === "running") summary.active += 1;
        if ((execution.current_step || "").includes("policy") || (execution.error_message || "").includes("policy")) summary.policyBlocked += 1;
        return summary;
      },
      { total: 0, completed: 0, failed: 0, awaitingApproval: 0, active: 0, policyBlocked: 0 },
    );
  }, [executions]);

  return (
    <div className="builder-shell">
      <section className="builder-hero">
        <div>
          <p className="builder-kicker">Phase 7</p>
          <h1>Execution Observability</h1>
          <p className="builder-subtitle">
            Inspect request history, delegation chain, skill events, provider usage, and final state without changing the orchestrator flow.
          </p>
        </div>
        <button className="builder-button builder-button-secondary" type="button" onClick={refreshList} disabled={loadingList}>
          {loadingList ? "Refreshing..." : "Refresh executions"}
        </button>
      </section>

      {error ? <div className="builder-alert builder-alert-error">{error}</div> : null}

      <section className="builder-grid builder-grid-overview">
        <article className="builder-card">
          <span className="builder-metric-label">Tracked Runs</span>
          <strong className="builder-metric-value">{metrics.total}</strong>
          <p className="builder-card-note">Append-only execution records persisted by the orchestrator.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Active</span>
          <strong className="builder-metric-value">{metrics.active}</strong>
          <p className="builder-card-note">Queued or running executions with live status polling.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Completed</span>
          <strong className="builder-metric-value">{metrics.completed}</strong>
          <p className="builder-card-note">Finished runs with state snapshot, provider trail, and task result.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Awaiting Approval</span>
          <strong className="builder-metric-value">{metrics.awaitingApproval}</strong>
          <p className="builder-card-note">Runs halted at the approval gate but still fully auditable.</p>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Policy Blocked</span>
          <strong className="builder-metric-value">{metrics.policyBlocked}</strong>
          <p className="builder-card-note">Executions blocked before delegation or skill execution by governance rules.</p>
        </article>
      </section>

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Execution History</h2>
              <p>Recent request history with final status, team, and current orchestration step.</p>
            </div>
          </div>

          <div className="builder-list">
            {executions.map((execution) => (
              <button
                className="builder-list-item builder-list-item-button"
                key={execution.request_id}
                type="button"
                onClick={() => setSelectedRequestId(execution.request_id)}
              >
                <div>
                  <strong>{execution.task}</strong>
                  <p>{execution.team_id} - {execution.current_step}</p>
                  <p>Request: {execution.request_id}</p>
                </div>
                <span className={statusClass(execution.latest_status)}>{execution.latest_status}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Execution Detail</h2>
              <p>Timeline, delegation flow, provider usage, and final result for the selected request.</p>
            </div>
          </div>

          {loadingDetail ? <p className="builder-card-note">Loading execution detail...</p> : null}
          {!loadingDetail && !detail ? <p className="builder-card-note">Select an execution to inspect the timeline.</p> : null}

          {detail ? (
            <div className="builder-list">
              <div className="builder-list-item">
                <div>
                  <strong>{detail.execution.task}</strong>
                  <p>Team: {detail.execution.team_id}</p>
                  <p>Request: {detail.execution.request_id}</p>
                </div>
                <span className={statusClass(detail.execution.latest_status)}>{detail.execution.latest_status}</span>
              </div>

              <div className="builder-list-item">
                <div>
                  <strong>Delegation Flow</strong>
                  <p>
                    {(detail.execution.delegation_chain || [])
                      .map((link) => `${link.from} -> ${link.to}`)
                      .join(" | ") || "No delegation recorded"}
                  </p>
                </div>
                <span className="builder-badge">{detail.execution.current_step}</span>
              </div>

              <div className="builder-list-item">
                <div>
                  <strong>Provider Usage</strong>
                  <p>
                    {(detail.execution.provider_usage || [])
                      .map((provider) => `${provider.active || provider.selected} (${provider.model || "unknown"})`)
                      .join(" | ") || "No provider usage recorded"}
                  </p>
                </div>
                <span className="builder-badge">providers</span>
              </div>

              {detail.events?.some((event) => event.event_type === "policy.violation") ? (
                <div className="builder-list-item builder-alert-error">
                  <div>
                    <strong>Policy Violations</strong>
                    <p>
                      {detail.events
                        .filter((event) => event.event_type === "policy.violation")
                        .map((event) => event.payload?.stage || "violation")
                        .join(", ")}
                    </p>
                  </div>
                  <span className="execution-status execution-status-failed">blocked</span>
                </div>
              ) : null}

              <div className="execution-timeline">
                {(detail.events || []).map((event) => (
                  <div className="execution-event" key={event.id}>
                    <div className="execution-event-meta">
                      <span className={statusClass(event.status)}>{event.status}</span>
                      <strong>{event.event_type}</strong>
                      <span>{event.agent_name || "system"}</span>
                    </div>
                    <p>{event.created_at}</p>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
