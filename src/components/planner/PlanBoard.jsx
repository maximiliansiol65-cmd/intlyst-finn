/* eslint-disable */
const PRIORITY = {
  high: { label: "Hoch", color: "var(--c-danger)" },
  medium: { label: "Mittel", color: "var(--c-warning)" },
  low: { label: "Niedrig", color: "var(--c-success)" },
};

function PriorityBadge({ value }) {
  const key = (value || "medium").toLowerCase();
  const meta = PRIORITY[key] || PRIORITY.medium;
  return (
    <span
      style={{
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        background: meta.color + "18",
        color: meta.color,
      }}
    >
      {meta.label}
    </span>
  );
}

function PlanCard({ item }) {
  return (
    <div
      className="card"
      style={{
        padding: "var(--s-4)",
        display: "grid",
        gap: "var(--s-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)" }}>
        <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
        <PriorityBadge value={item.priority} />
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{item.reason}</div>
      {item.kpis.length > 0 ? (
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          {item.kpis.map((k) => (
            <span
              key={k}
              style={{
                fontSize: "var(--text-xs)",
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--c-surface-2)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text-3)",
              }}
            >
              {k}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyCol({ label }) {
  return (
    <div
      style={{
        padding: "var(--s-6)",
        borderRadius: "var(--r-md)",
        border: "1px dashed var(--c-border)",
        background: "var(--c-surface-2)",
        color: "var(--c-text-3)",
        fontSize: "var(--text-sm)",
        textAlign: "center",
      }}
    >
      Kein Eintrag für {label}.
    </div>
  );
}

export default function PlanBoard({ plan, loading }) {
  const columns = [
    { key: "yearly", title: "Jahresziele" },
    { key: "monthly", title: "Monatsziele" },
    { key: "weekly", title: "Wochenfokus" },
  ];

  return (
    <div className="card" style={{ padding: "var(--s-5)" }}>
      <div style={{ fontWeight: 700, marginBottom: "var(--s-4)" }}>Strategie-Board</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--s-4)",
        }}
      >
        {columns.map((col) => (
          <div key={col.key} style={{ display: "grid", gap: "var(--s-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-text-3)", fontWeight: 600 }}>
              {col.title}
            </div>
            {loading ? (
              <div className="card" style={{ padding: "var(--s-4)", color: "var(--c-text-3)" }}>Lädt...</div>
            ) : (plan[col.key] || []).length ? (
              plan[col.key].map((item, idx) => <PlanCard key={`${col.key}-${idx}`} item={item} />)
            ) : (
              <EmptyCol label={col.title} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
