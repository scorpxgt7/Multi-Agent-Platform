import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Application render failure:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#06080c", color: "#dce8f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Arial,sans-serif" }}>
          <div style={{ maxWidth: 760, width: "100%", background: "#0c1018", border: "1px solid #1a2530", borderRadius: 12, padding: 24, lineHeight: 1.6 }}>
            <div style={{ color: "#ef4444", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>Render Error</div>
            <h1 style={{ margin: "0 0 12px 0", fontSize: 24 }}>Multi-Agent Platform failed to render</h1>
            <p style={{ margin: "0 0 12px 0" }}>
              The app hit a runtime error instead of showing a blank page.
            </p>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#8fa0b0", fontSize: 13 }}>
              {this.state.error?.stack || this.state.error?.message || "Unknown render error"}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
