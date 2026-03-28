import { useEffect, useState } from "react";

const ALERT_CONFIG = {
  critical: { color: "#dc2626", bg: "#dc262612", label: "Kritisch", icon: "CRIT" },
  warning: { color: "#f59e0b", bg: "#f59e0b12", label: "Warnung", icon: "WARN" },
  opportunity: { color: "#10b981", bg: "#10b98112", label: "Chance", icon: "OPP" },
  info: { color: "#6366f1", bg: "#6366f112", label: "Info", icon: "INFO" },
};

const PRIORITY_COLOR = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6366f1",
};

const TIMEFRAME_LABEL = {
  immediate: "Sofort",
  this_week: "Diese Woche",
  this_month: "Diesen Monat",
  this_quarter: "Dieses Quartal",
};

const PATTERN_CONFIG = {
  trend: { color: "#6366f1", icon: "TR" },
  anomaly: { color: "#ef4444", icon: "AN" },
  correlation: { color: "#10b981", icon: "CO" },
  cycle: { color: "#f59e0b", icon: "CY" },
};

function HealthRing({ score }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const color =
    score >= 80 ? "#10b981" :
    score >= 60 ? "#6366f1" :
    score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", width: 130, height: 130 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="#ffffff" stroke="#000000" strokeWidth="10" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke="#000000"
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
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
        <span style={{ fontSize: 28, fontWeight: 700, color: "#000000" }}>{score}</span>
        <span
          style={{
            fontSize: 10,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Health
        </span>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const c = ALERT_CONFIG[alert.type] || ALERT_CONFIG.info;
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.color}25`,
        borderLeft: `3px solid ${c.color}`,
        borderRadius: "0 10px 10px 0",
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: c.color + "20",
            color: c.color,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {c.icon} {c.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", flex: 1 }}>{alert.title}</span>
        {alert.deviation_pct !== 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: alert.deviation_pct < 0 ? "#ef4444" : "#10b981" }}>
            {alert.deviation_pct > 0 ? "+" : ""}
            {Number(alert.deviation_pct || 0).toFixed(1)}%
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 8px" }}>{alert.description}</p>
      <div
        style={{
          fontSize: 11,
          color: "#374151",
          background: "#ffffff",
          borderRadius: 6,
          padding: "6px 10px",
          borderLeft: `2px solid ${c.color}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: c.color }}>-&gt;</span>
        {alert.action}
        {alert.auto_task && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              color: "#334155",
              background: "#e8e8ed",
              padding: "1px 6px",
              borderRadius: 3,
            }}
          >
            Auto-Task
          </span>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({ rec, onTask }) {
  const [done, setDone] = useState(false);

  async function handleTask() {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: rec.auto_task_title || rec.title,
        description: `${rec.description}\n\nErwarteter Effekt: ${rec.expected_effect}`,
        priority: rec.priority,
      }),
    });
    setDone(true);
    onTask?.();
  }

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: `1px solid ${(PRIORITY_COLOR[rec.priority] || "#e8e8ed")}20`,
        borderRadius: 11,
        padding: "15px 17px",
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: (PRIORITY_COLOR[rec.priority] || "#475569") + "18",
            color: PRIORITY_COLOR[rec.priority] || "#475569",
            textTransform: "uppercase",
          }}
        >
          {rec.priority === "high" ? "Hoher Impact" : rec.priority === "medium" ? "Mittlerer Impact" : "Niedriger Impact"}
        </span>
        <span style={{ fontSize: 10, color: "#475569", padding: "2px 8px", borderRadius: 4, background: "#e8e8ed" }}>
          {TIMEFRAME_LABEL[rec.timeframe] || rec.timeframe}
        </span>
        <span style={{ fontSize: 10, color: "#475569", padding: "2px 8px", borderRadius: 4, background: "#e8e8ed" }}>
          {rec.category}
        </span>
        {rec.kpi_affected?.length > 0 && (
          <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto" }}>
            KPIs: {rec.kpi_affected.join(", ")}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", flex: 1 }}>{rec.title}</div>
        <div
          style={{
            background: "#10b98118",
            border: "1px solid #10b98130",
            borderRadius: 7,
            padding: "5px 10px",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>+{rec.impact_pct}%</div>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>Impact</div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 6px" }}>{rec.description}</p>

      <div
        style={{
          fontSize: 11,
          color: "#475569",
          fontStyle: "italic",
          background: "#ffffff",
          borderRadius: 6,
          padding: "6px 10px",
          marginBottom: 6,
        }}
      >
        DATA: {rec.rationale}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#374151",
          background: "#ffffff",
          borderLeft: `2px solid ${PRIORITY_COLOR[rec.priority] || "#6366f1"}`,
          borderRadius: "0 6px 6px 0",
          padding: "6px 10px",
          marginBottom: 12,
        }}
      >
        -&gt; {rec.expected_effect}
      </div>

      <button
        onClick={handleTask}
        disabled={done}
        style={{
          padding: "8px 16px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 7,
          border: "none",
          background: done ? "#10b98118" : "#6366f1",
          color: done ? "#10b981" : "#fff",
          cursor: done ? "default" : "pointer",
        }}
      >
        {done ? "Task erstellt" : "Task erstellen"}
      </button>
    </div>
  );
}

function PatternCard({ pattern }) {
  const c = PATTERN_CONFIG[pattern.type] || PATTERN_CONFIG.trend;
  return (
    <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: c.color, fontWeight: 700 }}>{c.icon}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 4,
            background: c.color + "18",
            color: c.color,
            textTransform: "uppercase",
          }}
        >
          {pattern.type}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", flex: 1 }}>{pattern.title}</span>
        <span style={{ fontSize: 10, color: "#334155" }}>{pattern.confidence}% Konfidenz</span>
      </div>
      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 6px" }}>{pattern.description}</p>
      <div style={{ fontSize: 11, color: "#94a3b8", background: "#ffffff", borderRadius: 6, padding: "6px 10px" }}>
        Insight: {pattern.implication}
      </div>
      {pattern.metrics?.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {pattern.metrics.map((m) => (
            <span key={m} style={{ fontSize: 10, color: c.color, background: c.color + "12", padding: "1px 7px", borderRadius: 4 }}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationCard({ automation }) {
  const complexityColor =
    { low: "#10b981", medium: "#f59e0b", high: "#ef4444" }[automation.complexity] || "#475569";
  return (
    <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", flex: 1 }}>{automation.title}</span>
        <span style={{ fontSize: 10, color: complexityColor }}>Aufwand: {automation.complexity}</span>
      </div>
      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 8px" }}>{automation.description}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
        <div style={{ background: "#ffffff", borderRadius: 6, padding: "6px 10px" }}>
          <div style={{ color: "#334155", marginBottom: 2 }}>Ausloeser</div>
          <div style={{ color: "#94a3b8" }}>{automation.trigger}</div>
        </div>
        <div style={{ background: "#ffffff", borderRadius: 6, padding: "6px 10px" }}>
          <div style={{ color: "#334155", marginBottom: 2 }}>Aktion</div>
          <div style={{ color: "#94a3b8" }}>{automation.action}</div>
        </div>
      </div>
      {automation.expected_saving && (
        <div style={{ fontSize: 11, color: "#10b981", marginTop: 8 }}>Saving: {automation.expected_saving}</div>
      )}
    </div>
  );
}

export default function IntlystDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoTasks, setAutoTasks] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intlyst/analyze?auto_tasks=${autoTasks}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Status ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { key: "overview", label: "Uebersicht" },
    { key: "alerts", label: `Alerts ${data?.alerts?.length > 0 ? `(${data.alerts.length})` : ""}` },
    { key: "recommendations", label: "Empfehlungen" },
    { key: "patterns", label: "Muster" },
    { key: "automations", label: "Automatisierung" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#374151",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>INTLYST</h1>
          <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>High-Level Business Analyse · Alle Daten · KI-optimiert</p>
          {data?.data_period && (
            <p style={{ fontSize: 11, color: "#334155", margin: "2px 0 0" }}>Datenzeitraum: {data.data_period}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoTasks}
              onChange={(e) => setAutoTasks(e.target.checked)}
              style={{ accentColor: "#6366f1" }}
            />
            Auto-Tasks
          </label>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: loading ? "#e8e8ed" : "#6366f1",
              color: loading ? "#475569" : "#fff",
              border: "none",
              borderRadius: 9,
              padding: "9px 20px",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analysiere alle Daten..." : "Vollanalyse starten"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#ef444412",
            border: "1px solid #ef444430",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "#ef4444",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          style={{
            background: "#f5f5f7",
            border: "1px solid #1e1e2e",
            borderRadius: 14,
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "2px solid #6366f1",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>INTLYST analysiert alle Daten...</div>
            <div style={{ fontSize: 12, color: "#334155" }}>90-Tage-Verlauf · Korrelationen · Muster · Automatisierungen</div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 14, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#1d1d1f", fontWeight: 600, marginBottom: 8 }}>Vollanalyse starten</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>
            INTLYST analysiert alle vorhandenen Daten und generiert priorisierte Erkenntnisse
          </div>
          <button
            onClick={load}
            style={{
              background: "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              padding: "11px 28px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Jetzt analysieren
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 20 }}>
            <HealthRing score={data.health_score} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  background: "#f5f5f7",
                  border: "1px solid #1e1e2e",
                  borderRadius: 10,
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#94a3b8",
                  lineHeight: 1.7,
                  flex: 1,
                }}
              >
                {data.executive_summary}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Alerts", value: data.alerts?.length || 0, color: "#ef4444" },
                  { label: "Empfehlungen", value: data.recommendations?.length || 0, color: "#6366f1" },
                  { label: "Muster", value: data.patterns?.length || 0, color: "#10b981" },
                  { label: "Auto-Tasks", value: data.auto_created_tasks || 0, color: "#f59e0b" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 120, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 2,
              background: "#f5f5f7",
              border: "1px solid #1e1e2e",
              borderRadius: 9,
              padding: 3,
              marginBottom: 18,
              overflowX: "auto",
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  background: activeTab === t.key ? "#6366f1" : "transparent",
                  color: activeTab === t.key ? "#fff" : "#64748b",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.alerts?.slice(0, 2).map((a, i) => <AlertCard key={`ov-a-${i}`} alert={a} />)}
              {data.recommendations?.slice(0, 2).map((r, i) => (
                <RecommendationCard key={`ov-r-${i}`} rec={r} onTask={load} />
              ))}
              {data.dashboard_improvements?.length > 0 && (
                <div style={{ background: "#6366f112", border: "1px solid #6366f120", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Dashboard-Verbesserungen
                  </div>
                  {data.dashboard_improvements.map((d, i) => (
                    <div key={`imp-${i}`} style={{ fontSize: 12, color: "#64748b", marginBottom: 5, display: "flex", gap: 6 }}>
                      <span style={{ color: "#6366f1" }}>-&gt;</span>
                      {d}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "alerts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.alerts?.length === 0
                ? <div style={{ color: "#475569", fontSize: 13 }}>Keine kritischen Alerts.</div>
                : data.alerts.map((a, i) => <AlertCard key={`a-${i}`} alert={a} />)}
            </div>
          )}

          {activeTab === "recommendations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.recommendations?.map((r, i) => <RecommendationCard key={`r-${i}`} rec={r} onTask={load} />)}
            </div>
          )}

          {activeTab === "patterns" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 10 }}>
              {data.patterns?.length === 0
                ? <div style={{ color: "#475569", fontSize: 13 }}>Keine Muster erkannt.</div>
                : data.patterns.map((p, i) => <PatternCard key={`p-${i}`} pattern={p} />)}
            </div>
          )}

          {activeTab === "automations" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: 10 }}>
              {data.automations?.map((a, i) => <AutomationCard key={`au-${i}`} automation={a} />)}
            </div>
          )}
        </>
      )}

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
