/* eslint-disable */
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "var(--s-8)",
        textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: "var(--r-full)",
          background: "var(--c-danger-light)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>
          ⚠
        </div>
        <div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--c-text)", marginBottom: 8 }}>
            Etwas ist schiefgelaufen
          </div>
          <div style={{ fontSize: "var(--text-md)", color: "var(--c-text-2)", maxWidth: 360 }}>
            {this.state.error?.message || "Ein unbekannter Fehler ist aufgetreten."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Seite neu laden
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Erneut versuchen
          </button>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details style={{
            marginTop: 16, maxWidth: 600, width: "100%",
            background: "var(--c-surface-2)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-sm)",
            padding: "var(--s-4)",
            textAlign: "left",
          }}>
            <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--c-text-2)", fontSize: "var(--text-sm)" }}>
              Fehlerdetails (nur in Dev)
            </summary>
            <pre style={{ marginTop: 8, fontSize: 11, overflow: "auto", color: "var(--c-danger)" }}>
              {this.state.error?.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
