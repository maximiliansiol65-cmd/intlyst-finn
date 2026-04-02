const SEVERITY = {
  high: { color: "#ef4444", bg: "#ef444415", border: "#ef444430", label: "Dringend" },
  medium: { color: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b30", label: "Mittel" },
  low: { color: "#6366f1", bg: "#6366f115", border: "#6366f130", label: "Niedrig" },
};

function AnomalyItem({ anomaly }) {
  const s = SEVERITY[anomaly.severity] || SEVERITY.low;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 14px",
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.color}`,
        borderRadius: "0 8px 8px 0",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 4,
              background: s.bg,
              color: s.color,
              border: `1px solid ${s.border}`,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {s.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
            {anomaly.metric_label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
          {anomaly.description}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>
          {anomaly.deviation_pct}%
        </div>
        <div style={{ fontSize: 10, color: "#475569" }}>vs. O</div>
      </div>
    </div>
  );
}

export default function AnomalyBanner({ anomalies }) {
  if (!anomalies || anomalies.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#ef4444",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#ef4444",
            display: "inline-block",
          }}
        />
        {anomalies.length} Anomalie{anomalies.length > 1 ? "n" : ""} erkannt
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {anomalies.map((a, i) => (
          <AnomalyItem key={`${a.metric}-${i}`} anomaly={a} />
        ))}
      </div>
    </div>
  );
}
