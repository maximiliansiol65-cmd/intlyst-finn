import { useEffect, useState } from "react";
import { useCompanyProfile } from "../../contexts/CompanyProfileContext";
import { getDashboardRoleCopy } from "../../config/dashboardRoles";

const PRIORITY_CONFIG = {
  high: { color: "#ef4444", bg: "#ef444412", label: "Hoher Impact" },
  medium: { color: "#f59e0b", bg: "#f59e0b12", label: "Mittlerer Impact" },
  low: { color: "#6366f1", bg: "#6366f112", label: "Niedriger Impact" },
};

const EFFORT_CONFIG = {
  low: { color: "#10b981", label: "Geringer Aufwand" },
  medium: { color: "#f59e0b", label: "Mittlerer Aufwand" },
  high: { color: "#ef4444", label: "Hoher Aufwand" },
};

const TIMEFRAME_CONFIG = {
  immediate: { color: "#ef4444", label: "Sofort" },
  this_week: { color: "#f59e0b", label: "Diese Woche" },
  this_month: { color: "#6366f1", label: "Diesen Monat" },
};

const CATEGORY_LABELS = {
  marketing: "Marketing",
  product: "Produkt",
  sales: "Sales",
  operations: "Operations",
  finance: "Finanzen",
};

const CATEGORY_OWNER = {
  marketing: "CMO",
  product: "Strategist",
  sales: "COO",
  operations: "Assistant",
  finance: "CFO",
};

const ROLE_COLORS = {
  CEO: { bg: "#ecfeff", fg: "#0f766e" },
  COO: { bg: "#eff6ff", fg: "#1d4ed8" },
  CMO: { bg: "#fff7ed", fg: "#c2410c" },
  CFO: { bg: "#f5f3ff", fg: "#6d28d9" },
  Strategist: { bg: "#f0fdf4", fg: "#15803d" },
};

function SourceBadge({ source }) {
  const sourceConfig = {
    claude: { bg: "#10b9811f", fg: "#10b981", label: "Live KI" },
    fallback: { bg: "#f59e0b1f", fg: "#f59e0b", label: "Fallback" },
    local: { bg: "#64748b2a", fg: "#94a3b8", label: "Lokal" },
  };
  const cfg = sourceConfig[source] || sourceConfig.local;
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

function SectionList({ title, color, background, border, items }) {
  if (!items?.length) return null;
  return (
    <div
      style={{
        background,
        border: `1px solid ${border}`,
        borderRadius: 9,
        padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {title}
      </div>
      {items.map((item, i) => (
        <div key={`${title}-${i}`} style={{ fontSize: 12, color: "#64748b", marginBottom: 4, display: "flex", gap: 6 }}>
          <span style={{ color, flexShrink: 0 }}>-</span>
          {item}
        </div>
      ))}
    </div>
  );
}

export default function RecommendationsWidget({ onTaskCreated }) {
  const { profile } = useCompanyProfile();
  const roleCopy = getDashboardRoleCopy(profile);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState({});
  const [filter, setFilter] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/recommendations");
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

  async function createTask(rec) {
    setCreated((p) => ({ ...p, [rec.id]: "loading" }));
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.action_label,
          description: `${rec.description}\n\nErwartetes Ergebnis: ${rec.expected_result}`,
          priority: rec.priority,
          assigned_to: rec.owner_role || CATEGORY_OWNER[rec.category] || "COO",
          goal: rec.strategic_context || rec.title,
          expected_result: rec.expected_result,
          kpis: rec.kpi_link ? [rec.kpi_link] : [],
          impact: rec.priority,
        }),
      });
      setCreated((p) => ({ ...p, [rec.id]: "done" }));
      onTaskCreated?.();
    } catch {
      setCreated((p) => ({ ...p, [rec.id]: null }));
    }
  }

  const recs = data?.recommendations || [];
  const filtered = filter ? recs.filter((r) => r.priority === filter) : recs;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {roleCopy.recommendationsLabel}
          </div>
          {data?.source && <SourceBadge source={data.source} />}
          {typeof data?.processing_ms === "number" && (
            <span style={{ fontSize: 10, color: "#475569" }}>{Math.round(data.processing_ms)} ms</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[null, "high", "medium", "low"].map((f) => (
            <button
              key={String(f)}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 10px",
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                background: filter === f ? "#6366f1" : "#e8e8ed",
                color: filter === f ? "#fff" : "#475569",
              }}
            >
              {f ? { high: "Hoch", medium: "Mittel", low: "Niedrig" }[f] : "Alle"}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "transparent",
              border: "1px solid #1e1e2e",
              borderRadius: 5,
              padding: "3px 8px",
              fontSize: 10,
              color: "#475569",
              cursor: "pointer",
            }}
          >
            {loading ? "..." : "Neu"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#475569", fontSize: 12, padding: "12px 0" }}>
          <div className="spinner spinner-sm" />
          Empfehlungen werden berechnet...
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
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {data?.quick_wins?.length > 0 && !loading && (
        <div
          style={{
            background: "#10b98112",
            border: "1px solid #10b98120",
            borderRadius: 9,
            padding: "10px 14px",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Quick Wins - sofort umsetzbar
          </div>
          {data.quick_wins.map((qw, i) => (
            <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, display: "flex", gap: 6 }}>
              <span style={{ color: "#10b981", flexShrink: 0 }}>+</span>
              {qw}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((rec) => {
            const p = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.medium;
            const ef = EFFORT_CONFIG[rec.effort] || EFFORT_CONFIG.medium;
            const tf = TIMEFRAME_CONFIG[rec.timeframe] || TIMEFRAME_CONFIG.this_week;
            const state = created[rec.id];

            return (
              <div
                key={rec.id}
                style={{
                  background: "#f5f5f7",
                  border: `1px solid ${p.color}20`,
                  borderRadius: 11,
                  padding: "15px 17px",
                }}
              >
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: p.bg, color: p.color, textTransform: "uppercase" }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#e8e8ed", color: tf.color }}>
                    {tf.label}
                  </span>
                  <span style={{ fontSize: 10, color: "#475569", padding: "2px 8px", borderRadius: 4, background: "#e8e8ed" }}>
                    {CATEGORY_LABELS[rec.category] || rec.category}
                  </span>
                  {rec.owner_role && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: (ROLE_COLORS[rec.owner_role] || ROLE_COLORS.Strategist).bg,
                        color: (ROLE_COLORS[rec.owner_role] || ROLE_COLORS.Strategist).fg,
                      }}
                    >
                      {rec.owner_role}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: ef.color, marginLeft: "auto", display: "flex", alignItems: "center" }}>
                    Aufwand: {ef.label}
                  </span>
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
                    marginBottom: 10,
                  }}
                >
                  Datenbezug: {rec.rationale}
                </div>

                {rec.kpi_link && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#334155",
                      background: "#eef2ff",
                      borderRadius: 6,
                      padding: "6px 10px",
                      marginBottom: 10,
                    }}
                  >
                    KPI-Bezug: {rec.kpi_link}
                  </div>
                )}

                {rec.priority_reason && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#7c2d12",
                      background: "#fff7ed",
                      borderRadius: 6,
                      padding: "6px 10px",
                      marginBottom: 10,
                    }}
                  >
                    Priorisierung: {rec.priority_reason}
                  </div>
                )}

                {rec.risk_level && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#991b1b",
                      background: "#fef2f2",
                      borderRadius: 6,
                      padding: "6px 10px",
                      marginBottom: 10,
                    }}
                  >
                    Risiko-Level: {rec.risk_level}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 11,
                    color: "#374151",
                    background: "#ffffff",
                    borderLeft: `2px solid ${p.color}`,
                    borderRadius: "0 6px 6px 0",
                    padding: "6px 10px",
                    marginBottom: 12,
                  }}
                >
                  Ergebnis: {rec.expected_result}
                </div>

                {rec.strategic_context && (
                  <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, marginBottom: 12 }}>
                    Strategische Einordnung: {rec.strategic_context}
                  </div>
                )}

                <button
                  onClick={() => createTask(rec)}
                  disabled={state === "loading" || state === "done"}
                  style={{
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 7,
                    border: "none",
                    cursor: state ? "default" : "pointer",
                    background: state === "done" ? "#10b98118" : "#6366f1",
                    color: state === "done" ? "#10b981" : "#fff",
                    transition: "all 0.2s",
                  }}
                >
                  {state === "done" ? "Task erstellt" : state === "loading" ? "..." : rec.action_label}
                </button>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div style={{ color: "#334155", fontSize: 13, padding: "12px 0" }}>Keine Empfehlungen für diesen Filter.</div>
          )}
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <SectionList
            title="Strategische Prioritäten"
            color="#818cf8"
            background="#6366f112"
            border="#6366f120"
            items={data?.strategic}
          />
          <SectionList
            title="Top-Chancen"
            color="#15803d"
            background="#10b98112"
            border="#10b98120"
            items={data?.opportunities}
          />
          <SectionList
            title="Top-Risiken"
            color="#dc2626"
            background="#ef444412"
            border="#ef444430"
            items={data?.risks}
          />

          {data?.scenarios?.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Strategische Szenarien
              </div>
              {data.scenarios.map((scenario) => (
                <div key={scenario.name} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{scenario.name}</div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, marginBottom: 6 }}>{scenario.strategy}</div>
                  <div style={{ fontSize: 11, color: "#334155", marginBottom: 4 }}>KPI-Folge: {scenario.kpi_effect}</div>
                  <div style={{ fontSize: 11, color: "#991b1b", marginBottom: 4 }}>Hauptrisiko: {scenario.main_risk}</div>
                  <div style={{ fontSize: 11, color: "#0f172a" }}>Empfehlung: {scenario.recommendation}</div>
                </div>
              ))}
            </div>
          )}

          {data?.role_priorities?.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Management-Priorisierung
              </div>
              {data.role_priorities.map((entry) => {
                const tone = ROLE_COLORS[entry.role] || ROLE_COLORS.Strategist;
                return (
                  <div key={entry.role} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "inline-flex", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: tone.bg, color: tone.fg, marginBottom: 10 }}>
                      {entry.role}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, color: "#334155" }}>
                        Sofort: {(entry.immediate || []).join(" • ") || "Keine Angabe"}
                      </div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        Mittelfristig: {(entry.mid_term || []).join(" • ") || "Keine Angabe"}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Langfristig: {(entry.long_term || []).join(" • ") || "Keine Angabe"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
