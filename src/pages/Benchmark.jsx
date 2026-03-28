import { useEffect, useState } from "react";

const STATUS_CONFIG = {
  above_top25: { color: "#10b981", bg: "#10b98115", label: "Top 25%" },
  above_avg: { color: "#6366f1", bg: "#6366f115", label: "Über Ø" },
  below_avg: { color: "#f59e0b", bg: "#f59e0b15", label: "Unter Ø" },
  far_below: { color: "#ef4444", bg: "#ef444415", label: "Deutlich darunter" },
};

function MetricCard({ item }) {
  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.below_avg;
  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{item.metric_label}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: config.bg,
            color: config.color,
          }}
        >
          {config.label}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Dein Wert", value: `${item.your_value}${item.unit}` },
          { label: "Branche Ø", value: `${item.industry_avg}${item.unit}` },
          { label: "Top 25%", value: `${item.industry_top25}${item.unit}` },
          { label: "Perzentile", value: `${item.percentile}` },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#0d0d1a", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{stat.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Performance vs. Top 25%</div>
        <div style={{ height: 6, borderRadius: 999, background: "#1e1e2e", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(5, Math.min(item.percentile, 100))}%`,
              height: "100%",
              background: config.color,
            }}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.55, marginBottom: 8 }}>
        {item.ai_comment || "Keine KI-Einordnung verfügbar."}
      </div>
      <div style={{ fontSize: 11, color: "#e2e8f0", lineHeight: 1.55 }}>
        <span style={{ color: "#818cf8", fontWeight: 600 }}>Maßnahme: </span>
        {item.ai_action || "Keine konkrete Maßnahme verfügbar."}
      </div>
    </div>
  );
}

export default function Benchmark() {
  const [industries, setIndustries] = useState([]);
  const [industry, setIndustry] = useState("ecommerce");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/benchmark/industries")
      .then((response) => response.json())
      .then(setIndustries)
      .catch(() => setIndustries([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/benchmark/analyze?industry=${industry}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || `Status ${response.status}`);
        }
        return payload;
      })
      .then(setData)
      .catch((err) => setError(err.message || "Benchmark konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [industry]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Branchenvergleich</h1>
          <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
            Eigene KPIs vs. Branchendurchschnitt mit priorisierten Maßnahmen
          </p>
        </div>
        <select
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
          style={{
            background: "#13131f",
            color: "#f1f5f9",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            minWidth: 180,
          }}
        >
          {(industries.length ? industries : [{ value: "ecommerce", label: "E-Commerce" }]).map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ background: "#ef444415", border: "1px solid #ef444430", borderRadius: 10, padding: "14px 16px", color: "#ef4444", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "32px", color: "#475569" }}>
          Benchmark wird geladen...
        </div>
      )}

      {data && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Branche", value: data.industry_label, color: "#f1f5f9" },
              { label: "Gesamt-Perzentile", value: data.overall_percentile, color: "#818cf8" },
              { label: "Status", value: data.overall_status, color: "#10b981" },
            ].map((item) => (
              <div key={item.label} style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>
              <span style={{ color: "#818cf8", fontWeight: 600 }}>KI Summary: </span>
              {data.ai_summary || "Keine Zusammenfassung verfügbar."}
            </div>
            <div style={{ fontSize: 12, color: "#e2e8f0" }}>
              <span style={{ color: "#10b981", fontWeight: 600 }}>Top Priority: </span>
              {data.top_priority || "Keine Priorität verfügbar."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {data.benchmarks.map((item) => (
              <MetricCard key={item.metric_key} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}