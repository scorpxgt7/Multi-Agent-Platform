import React from "react";

export default function DeploymentDiagnostics({ open, onClose }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/diagnostics", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setData({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  return (
    <div className="diagnostics-panel" role="dialog">
      <div className="diagnostics-head">
        <h3>Deployment Diagnostics</h3>
        <div>
          <button className="workflow-button" onClick={refresh} disabled={loading}>
            {loading ? "Checking..." : "Refresh"}
          </button>
          <button className="workflow-button" onClick={onClose} style={{ marginLeft: 8 }}>
            Close
          </button>
        </div>
      </div>
      <div className="diagnostics-body">
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{JSON.stringify(data, null, 2)}</pre>
        <div style={{ marginTop: 12 }}>
          <a href={import.meta.env.VITE_MONITORING_URL || 'http://localhost:3000'} target="_blank" rel="noreferrer">
            Open Grafana dashboards
          </a>
          <span style={{ marginLeft: 12 }}>
            <a href="/docs/OPERATIONAL.md" target="_blank" rel="noreferrer">Operational docs</a>
          </span>
        </div>
      </div>
    </div>
  );
}
