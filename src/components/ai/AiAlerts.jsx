import { useState, useEffect } from "react";

const SEVERITY = {
  high: { color: "#ef4444", bg: "#ef444415", label: "Dringend" },
  medium: { color: "#f59e0b", bg: "#f59e0b15", label: "Mittel" },
  low: { color: "#6366f1", bg: "#6366f115", label: "Niedrig" },
};

export default function AiAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/alert-analysis");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (!loading && alerts.length === 0 && !error) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#ef4444",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {alerts.length > 0 ? `KI-Analyse: ${alerts.length} Anomalie${alerts.length > 1 ? "n" : ""}` : "KI-Alert-Analyse"}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid #1e1e2e",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 600,
            color: "#ef4444",
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: "#475569", padding: "8px 0" }}>Claude analysiert Anomalien...</div>}

      {error && !loading && (
        <div style={{ fontSize: 12, color: "#475569" }}>Keine Anomalien oder API Key fehlt.</div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a, i) => {
            const s = SEVERITY[a.severity] || SEVERITY.low;
            return (
              <div
                key={i}
                style={{
                  background: "#f5f5f7",
                  border: `1px solid ${s.color}20`,
                  borderLeft: `3px solid ${s.color}`,
                  borderRadius: "0 10px 10px 0",
                  padding: "13px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: s.bg,
                      color: s.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{a.metric_label}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 700,
                      color: a.urgency_score >= 8 ? "#ef4444" : a.urgency_score >= 5 ? "#f59e0b" : "#6366f1",
                    }}
                  >
                    Dringlichkeit {a.urgency_score}/10
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>{a.explanation}</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#ffffff", borderRadius: 7, padding: "8px 10px" }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#475569",
                        fontWeight: 600,
                        marginBottom: 3,
                        textTransform: "uppercase",
                      }}
                    >
                      Ursache
                    </div>
                    <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{a.root_cause}</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: 7, padding: "8px 10px" }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#475569",
                        fontWeight: 600,
                        marginBottom: 3,
                        textTransform: "uppercase",
                      }}
                    >
                      Sofortmassnahme
                    </div>
                    <div style={{ fontSize: 11, color: "#10b981", lineHeight: 1.5 }}>{a.recommended_action}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
