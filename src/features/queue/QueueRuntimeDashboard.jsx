import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, RefreshCcw, RotateCcw, Square, Send } from "lucide-react";

import { loadRegistry } from "../builder/api.js";
import { getExecution } from "../observability/api.js";
import { cancelWorkflow, enqueueWorkflow, loadQueueStatus, retryWorkflow } from "./api.js";

function statusClass(status) {
  return `execution-status execution-status-${status || "unknown"}`;
}

function QueueRuntimeDashboard() {
  const [registry, setRegistry] = useState({ teams: [] });
  const [queue, setQueue] = useState({ summary: {}, items: [], workers: [], dead_letters: [] });
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskDraft, setTaskDraft] = useState("Review queued workflow execution and prepare summary.");
  const [teamDraft, setTeamDraft] = useState("");
  const [subsystemDraft, setSubsystemDraft] = useState("admin");
  const [priorityDraft, setPriorityDraft] = useState("10");
  const [retryDraft, setRetryDraft] = useState("2");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [registryPayload, queuePayload] = await Promise.all([loadRegistry(), loadQueueStatus()]);
      setRegistry(registryPayload);
      setQueue(queuePayload);
      const firstTeam = registryPayload.teams?.[0]?.id || "";
      if (!teamDraft && firstTeam) {
        setTeamDraft(firstTeam);
      }
      if (!selectedRequestId && queuePayload.items?.[0]?.request_id) {
        setSelectedRequestId(queuePayload.items[0].request_id);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadExecution(requestId) {
    if (!requestId) {
      setSelectedExecution(null);
      return;
    }
    try {
      const payload = await getExecution(requestId);
      setSelectedExecution(payload);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    loadExecution(selectedRequestId);
  }, [selectedRequestId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh();
      if (selectedRequestId) {
        loadExecution(selectedRequestId);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedRequestId, teamDraft]);

  const metrics = useMemo(
    () => ({
      queued: queue.summary?.queued || 0,
      running: queue.summary?.running || 0,
      retrying: queue.summary?.retrying || 0,
      completed: queue.summary?.completed || 0,
      failed: queue.summary?.failed || 0,
      cancelled: queue.summary?.cancelled || 0,
      workers: queue.workers?.length || 0,
      recoveries: queue.recovery_events?.length || 0,
    }),
    [queue],
  );

  async function handleEnqueue() {
    if (!teamDraft) {
      setError("Select a team before queueing a workflow.");
      return;
    }
    setError("");
    try {
      const payload = await enqueueWorkflow({
        team_id: teamDraft,
        task: taskDraft,
        actor_id: "head-admin",
        subsystem: subsystemDraft,
        context: {
          source: "queue-dashboard",
        },
        short_term_memory: [],
        priority: Number(priorityDraft) || 10,
        max_retries: Number(retryDraft) || 2,
      });
      setSelectedRequestId(payload.request_id);
      await refresh();
      await loadExecution(payload.request_id);
    } catch (enqueueError) {
      setError(enqueueError.message);
    }
  }

  async function handleCancel(requestId) {
    setError("");
    try {
      await cancelWorkflow(requestId, { reason: "cancelled_from_queue_dashboard" });
      await refresh();
      if (selectedRequestId === requestId) {
        await loadExecution(requestId);
      }
    } catch (cancelError) {
      setError(cancelError.message);
    }
  }

  async function handleRetry(requestId) {
    setError("");
    try {
      await retryWorkflow(requestId, { reason: "retried_from_queue_dashboard" });
      await refresh();
      if (selectedRequestId === requestId) {
        await loadExecution(requestId);
      }
    } catch (retryError) {
      setError(retryError.message);
    }
  }

  const selectedItem = queue.items?.find((item) => item.request_id === selectedRequestId) || null;

  return (
    <div className="builder-shell">
      <section className="builder-hero">
        <div>
          <p className="builder-kicker">Phase 12</p>
          <h1>Execution Queue</h1>
          <p className="builder-subtitle">
            Queue, retry, cancel, and monitor durable workflow executions without coupling the request lifecycle to the runtime lifecycle.
          </p>
        </div>
        <button className="builder-button builder-button-secondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh queue"}
        </button>
      </section>

      {error ? (
        <div className="builder-alert builder-alert-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="builder-grid builder-grid-overview">
        <article className="builder-card">
          <span className="builder-metric-label">Queued</span>
          <strong className="builder-metric-value">{metrics.queued}</strong>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Running</span>
          <strong className="builder-metric-value">{metrics.running}</strong>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Retrying</span>
          <strong className="builder-metric-value">{metrics.retrying}</strong>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Workers</span>
          <strong className="builder-metric-value">{metrics.workers}</strong>
        </article>
        <article className="builder-card">
          <span className="builder-metric-label">Recoveries</span>
          <strong className="builder-metric-value">{metrics.recoveries}</strong>
        </article>
      </section>

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Queue a Workflow</h2>
              <p>Create a durable execution request against the active runtime deployment.</p>
            </div>
          </div>

          <div className="builder-form">
            <label>
              <span>Team</span>
              <select value={teamDraft} onChange={(event) => setTeamDraft(event.target.value)}>
                <option value="">Select a team</option>
                {(registry.teams || []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subsystem</span>
              <input value={subsystemDraft} onChange={(event) => setSubsystemDraft(event.target.value)} />
            </label>
            <label>
              <span>Task</span>
              <textarea rows="4" value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} />
            </label>
            <div className="builder-grid" style={{ gap: "0.85rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <label>
                <span>Priority</span>
                <input value={priorityDraft} onChange={(event) => setPriorityDraft(event.target.value)} />
              </label>
              <label>
                <span>Max retries</span>
                <input value={retryDraft} onChange={(event) => setRetryDraft(event.target.value)} />
              </label>
            </div>
            <button className="builder-button" type="button" onClick={handleEnqueue}>
              <Send size={15} />
              Enqueue workflow
            </button>
          </div>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Queue Status</h2>
              <p>Queued, running, completed, failed, and cancelled executions with runtime indicators.</p>
            </div>
          </div>

          <div className="builder-list">
            {(queue.items || []).map((item) => (
              <div className={`builder-list-item ${selectedRequestId === item.request_id ? "builder-list-item-active" : ""}`} key={item.request_id}>
                <button className="builder-list-item-button" type="button" onClick={() => setSelectedRequestId(item.request_id)}>
                  <div>
                    <strong>{item.request_id}</strong>
                    <p>{item.status} • attempts {item.attempts}/{item.max_retries}</p>
                    <p>{item.last_error || item.current_step || item.workflow_deployment_id || "queued execution"}</p>
                  </div>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </button>
                <div className="workflow-actionrow" style={{ marginTop: "0.75rem" }}>
                  {["queued", "running", "retrying"].includes(item.status) ? (
                    <button className="workflow-button workflow-button-muted" type="button" onClick={() => handleCancel(item.request_id)}>
                      <Square size={15} />
                      Cancel
                    </button>
                  ) : null}
                  {["failed", "dead_letter", "cancelled"].includes(item.status) ? (
                    <button className="workflow-button" type="button" onClick={() => handleRetry(item.request_id)}>
                      <RotateCcw size={15} />
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {(queue.items || []).length === 0 ? <p className="workflow-empty">No queue items yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="builder-grid builder-grid-main">
        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Workers & Health</h2>
              <p>Live worker heartbeats and queue runtime visibility.</p>
            </div>
          </div>

          <div className="builder-list">
            {(queue.workers || []).map((worker) => (
              <div className="builder-list-item" key={worker.worker_id}>
                <div>
                  <strong>{worker.worker_id}</strong>
                  <p>{worker.status} - {worker.worker_type}</p>
                  <p>{worker.current_request_id || "idle"}</p>
                </div>
                <span className={statusClass(worker.status)}>{worker.status}</span>
              </div>
            ))}
            {(queue.workers || []).length === 0 ? <p className="workflow-empty">No workers reported yet.</p> : null}
          </div>

          <div className="builder-section-heading" style={{ marginTop: "1rem" }}>
            <div>
              <h3>Recovery Events</h3>
              <p>Retry, cancel, and dead-letter markers from the queue runtime.</p>
            </div>
          </div>
          <div className="builder-list">
            {(queue.recovery_events || []).slice(0, 6).map((event) => (
              <div className="builder-list-item" key={event.id}>
                <div>
                  <strong>{event.event_type}</strong>
                  <p>{event.request_id}</p>
                  <p>{event.created_at}</p>
                </div>
                <span className={statusClass(event.status)}>{event.status}</span>
              </div>
            ))}
            {(queue.recovery_events || []).length === 0 ? <p className="workflow-empty">No recovery events yet.</p> : null}
          </div>
        </article>

        <article className="builder-card">
          <div className="builder-section-heading">
            <div>
              <h2>Execution Debug</h2>
              <p>Replay and checkpoint details for the selected request.</p>
            </div>
          </div>

          {selectedItem ? (
            <div className="builder-list">
              <div className="builder-list-item">
                <div>
                  <strong>{selectedItem.request_id}</strong>
                  <p>Queue status: {selectedItem.status}</p>
                  <p>Worker: {selectedItem.worker_id || "unclaimed"}</p>
                </div>
                <span className={statusClass(selectedItem.status)}>{selectedItem.status}</span>
              </div>
              <div className="builder-list-item">
                <div>
                  <strong>Checkpoint State</strong>
                  <pre>{JSON.stringify(selectedItem.checkpoint_state || {}, null, 2)}</pre>
                </div>
              </div>
              <div className="builder-list-item">
                <div>
                  <strong>Retry History</strong>
                  <pre>{JSON.stringify(selectedItem.retry_history || [], null, 2)}</pre>
                </div>
              </div>
              <div className="builder-list-item">
                <div>
                  <strong>Execution Timeline</strong>
                  <p>Loaded from the observability API for replay and audit visibility.</p>
                </div>
                <span className="builder-badge">
                  <Clock3 size={14} />
                  {selectedExecution?.execution?.latest_status || "unknown"}
                </span>
              </div>
              {selectedExecution ? (
                <div className="execution-timeline">
                  {(selectedExecution.events || []).map((event) => (
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
              ) : null}
            </div>
          ) : (
            <p className="workflow-empty">Select a queue item to inspect checkpoints, retries, and execution replay data.</p>
          )}
        </article>
      </section>
    </div>
  );
}

export default QueueRuntimeDashboard;
