import { useEffect, useState } from "react";
import TrendChart from "../components/charts/TrendChart";
import ForecastChart from "../components/charts/ForecastChart";
import AnalysisWidget from "../components/ai/AnalysisWidget";

const CATEGORY_COLORS = {
  marketing: { bg: "#6366f118", color: "#818cf8", label: "Marketing" },
  product: { bg: "#06b6d418", color: "#22d3ee", label: "Produkt" },
  sales: { bg: "#10b98118", color: "#34d399", label: "Sales" },
  operations: { bg: "#f59e0b18", color: "#fbbf24", label: "Operations" },
};

function ActionCard({ action }) {
  const c = CATEGORY_COLORS[action.category] || { bg: "#ffffff10", color: "#94a3b8", label: action.category };
  const parts = (action.date || "").split("-");
  const dateStr = parts.length === 3 ? `${parts[2]}.${parts[1]}` : "";

  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      {dateStr && (
        <div style={{ minWidth: 36, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{parts[2]}</div>
          <div style={{ fontSize: 10, color: "#475569" }}>.{parts[1]}</div>
        </div>
      )}
      <div style={{ width: 1, background: "#1e1e2e", alignSelf: "stretch" }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 4,
              background: c.bg,
              color: c.color,
              textTransform: "uppercase",
            }}
          >
            {c.label}
          </span>
          <span style={{ fontSize: 10, color: action.status === "done" ? "#10b981" : "#f59e0b", fontWeight: 600 }}>
            {action.status === "done" ? "Erledigt" : "Ausstehend"}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{action.title}</div>
        {action.description && (
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{action.description}</div>
        )}
      </div>
      {action.impact_pct != null && (
        <div
          style={{
            background: "#10b98118",
            border: "1px solid #10b98130",
            borderRadius: 7,
            padding: "5px 9px",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>+{action.impact_pct}%</div>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>Impact</div>
        </div>
      )}
    </div>
  );
}

const FILTERS = [null, "marketing", "sales", "product", "operations"].map((v) => ({
  value: v,
  label: v ? { marketing: "Marketing", sales: "Sales", product: "Produkt", operations: "Operations" }[v] : "Alle",
}));

const FORECAST_METRICS = [
  { metric: "revenue", label: "Umsatz" },
  { metric: "traffic", label: "Traffic" },
  { metric: "conversions", label: "Conversions" },
];

export default function Insights() {
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState("revenue");
  const [analysisDays, setAnalysisDays] = useState(30);

  useEffect(() => {
    const url = filter ? `/api/actions?category=${filter}` : "/api/actions";
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
        setActions(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e2e8f0",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Insights</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
          Datenbasierte Analyse - KI-Erkenntnisse - Prognosen
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setAnalysisDays(d)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              background: analysisDays === d ? "#6366f1" : "#13131f",
              color: analysisDays === d ? "#fff" : "#475569",
            }}
          >
            {d} Tage
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <AnalysisWidget days={analysisDays} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { metric: "revenue", title: "Umsatz" },
          { metric: "traffic", title: "Traffic" },
          { metric: "conversion_rate", title: "Conv.-Rate" },
          { metric: "new_customers", title: "Neue Kunden" },
        ].map((c) => (
          <div key={c.metric} style={{ height: 180 }}>
            <TrendChart metric={c.metric} title={c.title} initialDays={analysisDays} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Prognose
          </div>
          <div style={{ display: "flex", gap: 3, background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 7, padding: 3 }}>
            {FORECAST_METRICS.map((m) => (
              <button
                key={m.metric}
                onClick={() => setActiveMetric(m.metric)}
                style={{
                  padding: "3px 11px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "none",
                  cursor: "pointer",
                  background: activeMetric === m.metric ? "#6366f1" : "transparent",
                  color: activeMetric === m.metric ? "#fff" : "#64748b",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ForecastChart metric={activeMetric} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Aktions-Historie</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Umgesetzte Massnahmen</div>
          </div>
          <div style={{ display: "flex", gap: 3, background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 8, padding: 3 }}>
            {FILTERS.map((f) => (
              <button
                key={String(f.value)}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: "4px 11px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: filter === f.value ? "#6366f1" : "transparent",
                  color: filter === f.value ? "#fff" : "#64748b",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <div style={{ color: "#475569", fontSize: 13 }}>Laden...</div>}
          {!loading && actions.length === 0 && (
            <div
              style={{
                background: "#13131f",
                border: "1px solid #1e1e2e",
                borderRadius: 10,
                padding: "24px",
                textAlign: "center",
                color: "#475569",
                fontSize: 13,
              }}
            >
              Noch keine Aktionen vorhanden.
            </div>
          )}
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
