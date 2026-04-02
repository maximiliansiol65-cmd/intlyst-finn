const METRIC_CONFIG = {
  revenue: { label: "Umsatz", prefix: "€", suffix: "", decimals: 0 },
  traffic: { label: "Traffic", prefix: "", suffix: "", decimals: 0 },
  conversions: { label: "Conversions", prefix: "", suffix: "", decimals: 0 },
  conversion_rate: { label: "Conversion Rate", prefix: "", suffix: "%", decimals: 1 },
  new_customers: { label: "Neue Kunden", prefix: "", suffix: "", decimals: 0 },
};

function fmt(value, config) {
  if (value === null || value === undefined) return "—";
  const num =
    config.decimals === 0
      ? Math.round(value).toLocaleString("de-DE")
      : Number(value).toFixed(config.decimals);
  return `${config.prefix}${num}${config.suffix}`;
}

export default function GoalCard({ goal }) {
  const cfg = METRIC_CONFIG[goal.metric] || { label: goal.metric, prefix: "", suffix: "", decimals: 0 };
  const pct = Math.min(goal.progress_pct, 100);
  const over = goal.progress_pct > 100;
  const onTrack = goal.on_track;

  const barColor = over ? "#6366f1" : onTrack ? "#10b981" : "#ef4444";
  const [y, m, d] = goal.end_date.split("-");
  const endDate = `${d}.${m}`;

  return (
    <div
      style={{
        background: "#13131f",
        border: `1px solid ${onTrack || over ? "#1e1e2e" : "#ef444430"}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {cfg.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 5,
            background: over ? "#6366f118" : onTrack ? "#10b98118" : "#ef444418",
            color: over ? "#818cf8" : onTrack ? "#10b981" : "#ef4444",
          }}
        >
          {over ? "Übertroffen" : onTrack ? "Auf Kurs" : "Hinter Plan"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>
          {fmt(goal.current_value, cfg)}
        </span>
        <span style={{ fontSize: 12, color: "#475569" }}>
          / {fmt(goal.target_value, cfg)} Ziel
        </span>
      </div>

      <div
        style={{
          background: "#0d0d1a",
          borderRadius: 4,
          height: 6,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            borderRadius: 4,
            transition: "width 0.6s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569" }}>
        <span>
          {over
            ? `+${fmt(Math.abs(goal.remaining), cfg)} über Ziel`
            : `Noch ${fmt(Math.abs(goal.remaining), cfg)} bis Ziel`}
        </span>
        <span>{Math.round(goal.progress_pct)}% · bis {endDate}</span>
      </div>
    </div>
  );
}
