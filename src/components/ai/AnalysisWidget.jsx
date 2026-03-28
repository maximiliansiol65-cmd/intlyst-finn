import { useEffect, useState } from "react";

const TYPE_CONFIG = {
  strength: { color: "#10b981", bg: "#10b98112", bar: "#10b981", label: "Starke" },
  weakness: { color: "#ef4444", bg: "#ef444412", bar: "#ef4444", label: "Schwache" },
  opportunity: { color: "#6366f1", bg: "#6366f112", bar: "#818cf8", label: "Chance" },
  risk: { color: "#f59e0b", bg: "#f59e0b12", bar: "#f59e0b", label: "Risiko" },
};

const HEALTH_CONFIG = [
  { min: 80, color: "#10b981", label: "Sehr gut" },
  { min: 60, color: "#6366f1", label: "Gut" },
  { min: 40, color: "#f59e0b", label: "Mittel" },
  { min: 20, color: "#ef4444", label: "Schwach" },
  { min: 0, color: "#dc2626", label: "Kritisch" },
];

const RISK_CONFIG = {
  low: { color: "#10b981", label: "Niedrig" },
  medium: { color: "#f59e0b", label: "Mittel" },
  high: { color: "#ef4444", label: "Hoch" },
  critical: { color: "#dc2626", label: "Kritisch" },
};

function HealthMeter({ score, label }) {
  const cfg = HEALTH_CONFIG.find((c) => score >= c.min) || HEALTH_CONFIG[4];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r="40" fill="none" stroke="#e8e8ed" strokeWidth="8" />
          <circle
            cx="45"
            cy="45"
            r="40"
            fill="none"
            stroke={cfg.color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color }}>{score}</span>
          <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>Score</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f" }}>{label}</div>
        <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
      </div>
    </div>
  );
}

function SourceBadge({ source }) {
  const map = {
    claude: { bg: "#10b9811f", fg: "#10b981", label: "Live KI" },
    fallback: { bg: "#f59e0b1f", fg: "#f59e0b", label: "Fallback" },
    local: { bg: "#64748b2a", fg: "#94a3b8", label: "Lokal" },
  };
  const cfg = map[source] || map.local;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.fg,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {cfg.label}
    </span>
  );
}

function InsightCard({ insight }) {
  const t = TYPE_CONFIG[insight.type] || TYPE_CONFIG.opportunity;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        background: t.bg,
        border: `1px solid ${t.color}25`,
        borderLeft: `3px solid ${t.color}`,
        borderRadius: "0 10px 10px 0",
        padding: "12px 16px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: expanded ? 10 : 0 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: `${t.color}20`,
            color: t.color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          {t.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", flex: 1 }}>{insight.title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>+{insight.impact_pct}%</span>
          <span style={{ fontSize: 10, color: "#334155" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{insight.description}</p>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 7,
              padding: "8px 12px",
              fontSize: 12,
              color: "#64748b",
              fontFamily: "monospace",
            }}
          >
            Datenbeweis: {insight.evidence}
          </div>

          <div
            style={{
              background: "#ffffff",
              borderLeft: `2px solid ${t.color}`,
              borderRadius: "0 7px 7px 0",
              padding: "8px 12px",
              fontSize: 12,
              color: "#374151",
            }}
          >
            Massnahme: {insight.action}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#334155" }}>Konfidenz:</span>
            <div style={{ flex: 1, height: 4, background: "#e8e8ed", borderRadius: 2 }}>
              <div
                style={{
                  width: `${insight.confidence}%`,
                  height: "100%",
                  background: t.bar,
                  borderRadius: 2,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 10, color: "#475569" }}>{insight.confidence}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalysisWidget({ days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/analysis?days=${days}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Status ${res.status}`);
      }
      const d = await res.json();
      setData(d);
      setLastUpdate(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [days]);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 900);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const riskCfg = data ? RISK_CONFIG[data.risk_level] || RISK_CONFIG.medium : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 10 : 0,
          marginBottom: 16,
        }}
      >
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
            Business-Analyse
          </div>
          {data?.data_period && (
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{data.data_period}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data?.source && <SourceBadge source={data.source} />}
          {lastUpdate && <span style={{ fontSize: 10, color: "#334155" }}>Aktualisiert {lastUpdate}</span>}
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
              color: loading ? "#334155" : "#818cf8",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analysiere..." : "Neu laden"}
          </button>
        </div>
      </div>

      {loading && (
        <div
          style={{
            background: "#f5f5f7",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: "28px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid #6366f1",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 3 }}>Analysiere Geschaftsdaten...</div>
            <div style={{ fontSize: 11, color: "#334155" }}>Echtzeitdaten werden ausgewertet</div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: "#ef444412",
            border: "1px solid #ef444430",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "#f5f5f7",
              border: "1px solid #1e1e2e",
              borderRadius: 12,
              padding: isMobile ? "14px" : "18px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "auto 1fr",
                gap: isMobile ? 12 : 18,
                alignItems: isMobile ? "start" : "center",
                marginBottom: 14,
              }}
            >
              <HealthMeter score={data.health_score} label={data.health_label} />
              <div>
                <p
                  style={{
                    fontSize: isMobile ? 12 : 13,
                    color: "#94a3b8",
                    lineHeight: 1.7,
                    margin: "0 0 10px",
                  }}
                >
                  {data.summary}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {riskCfg && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 9px",
                        borderRadius: 5,
                        background: `${riskCfg.color}18`,
                        color: riskCfg.color,
                      }}
                    >
                      Risiko: {riskCfg.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {data.top_action && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #6366f130",
                  borderLeft: "3px solid #6366f1",
                  borderRadius: "0 8px 8px 0",
                  padding: isMobile ? "9px 11px" : "10px 14px",
                  fontSize: isMobile ? 11 : 12,
                  color: "#374151",
                }}
              >
                <span style={{ color: "#818cf8", fontWeight: 600 }}>Prioritat heute: </span>
                {data.top_action}
              </div>
            )}
          </div>

          {data.insights?.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                Erkenntnisse ({data.insights.length}) - klicken zum Aufklappen
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.insights.map((ins, i) => (
                  <InsightCard key={ins.id || i} insight={ins} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
