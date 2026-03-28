import { useState, useEffect } from "react";

const TYPE_CONFIG = {
  strength: { color: "#10b981", bg: "#10b98115", label: "Staerke" },
  weakness: { color: "#ef4444", bg: "#ef444415", label: "Schwaeche" },
  opportunity: { color: "#6366f1", bg: "#6366f115", label: "Chance" },
  warning: { color: "#f59e0b", bg: "#f59e0b15", label: "Warnung" },
  risk: { color: "#f59e0b", bg: "#f59e0b15", label: "Risiko" },
};

const IMPACT = {
  high: { color: "#ef4444", label: "Hoher Impact" },
  medium: { color: "#f59e0b", label: "Mittlerer Impact" },
  low: { color: "#6366f1", label: "Niedriger Impact" },
};

function InsightCard({ insight }) {
  const t = TYPE_CONFIG[insight.type] || TYPE_CONFIG.opportunity;
  const imp = IMPACT[insight.impact] || IMPACT.medium;

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: `1px solid ${t.color}20`,
        borderLeft: `3px solid ${t.color}`,
        borderRadius: "0 10px 10px 0",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: t.bg,
            color: t.color,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {t.label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: imp.color }}>{imp.label}</span>
        <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>
          Confidence: {insight.confidence}%
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 6 }}>{insight.title}</div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginBottom: 8 }}>{insight.description}</div>
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          background: "#ffffff",
          borderRadius: 6,
          padding: "7px 10px",
          marginBottom: 8,
          borderLeft: `2px solid ${imp.color}`,
        }}
      >
        Evidence: {insight.evidence}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#374151",
          background: "#ffffff",
          borderRadius: 6,
          padding: "8px 10px",
          borderLeft: `2px solid ${t.color}`,
        }}
      >
        -&gt; {insight.action}
      </div>
      {insight.segment && (
        <div style={{ fontSize: 10, color: "#475569", marginTop: 7 }}>
          Segment: {insight.segment}
        </div>
      )}
    </div>
  );
}

export default function AiInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/insights");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            KI-Insights
          </div>
          {data?.summary && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{data.summary}</div>}
          {!data?.summary && data?.top_action && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{data.top_action}</div>}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: loading ? "#e8e8ed" : "#6366f118",
            border: "1px solid #6366f130",
            borderRadius: 7,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 600,
            color: loading ? "#475569" : "#818cf8",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analysiere..." : "↻ Neu analysieren"}
        </button>
      </div>

      {loading && (
        <div
          style={{
            background: "#f5f5f7",
            border: "1px solid #1e1e2e",
            borderRadius: 10,
            padding: "24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid #6366f1",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 13, color: "#475569" }}>Claude analysiert deine Daten...</span>
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: "#ef444415",
            border: "1px solid #ef444430",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          Fehler: {error}
        </div>
      )}

      {!loading && !error && data?.insights && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              background: "#f5f5f7",
              border: "1px solid #1e1e2e",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                Analyse-Zusammenfassung
              </div>
              <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
                Health Score: {data.health_score} · {data.health_label}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", maxWidth: 340 }}>
              Top Action: {data.top_action}
            </div>
          </div>
          {data.insights.map((ins, i) => (
            <InsightCard key={i} insight={ins} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}