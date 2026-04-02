export default function PriorityLegend({ items }) {
  const entries = items?.length ? items : [
    { key: "critical", label: "Kritisch", color: "#b91c1c", bg: "#fff1f2" },
    { key: "high", label: "Hoch", color: "#c2410c", bg: "#fff7ed" },
    { key: "medium", label: "Mittel", color: "#0369a1", bg: "#f0f9ff" },
    { key: "low", label: "Niedrig", color: "#475569", bg: "#f8fafc" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {entries.map((item) => (
        <span
          key={item.key}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 999,
            background: item.bg,
            color: item.color,
            border: `1px solid ${item.color}22`,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
