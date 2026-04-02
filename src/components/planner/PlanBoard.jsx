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
      {item.owner_role ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Owner: <strong style={{ color: "var(--c-text)" }}>{item.owner_role}</strong>
        </div>
      ) : null}
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
      {item.strategic_goal ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)", lineHeight: 1.6 }}>
          Zielbeitrag: {item.strategic_goal}
        </div>
      ) : null}
      {item.linked_to ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
          Verknüpft mit: {item.linked_to}
        </div>
      ) : null}
      {item.next_action ? (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--c-text)",
            background: "var(--c-surface-2)",
            borderRadius: "var(--r-sm)",
            padding: "8px 10px",
            border: "1px solid var(--c-border)",
          }}
        >
          Nächster Schritt: {item.next_action}
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
      {!loading && plan?.ceo_summary ? (
        <div
          style={{
            marginBottom: "var(--s-4)",
            padding: "var(--s-4)",
            borderRadius: "var(--r-md)",
            background: "var(--c-surface-2)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text)",
            lineHeight: 1.6,
          }}
        >
          {plan.ceo_summary}
        </div>
      ) : null}
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
      {!loading && (plan?.top_decisions?.length || plan?.risks?.length || plan?.opportunities?.length) ? (
        <div style={{ marginTop: "var(--s-4)", display: "grid", gap: "var(--s-3)" }}>
          {plan.top_decisions?.length ? (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
                CEO-Entscheidungen
              </div>
              {plan.top_decisions.map((entry, idx) => (
                <div key={idx} style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{entry}</div>
              ))}
            </div>
          ) : null}
          {plan.risks?.length ? (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-danger)", marginBottom: "var(--s-2)" }}>
                Risiken
              </div>
              {plan.risks.map((entry, idx) => (
                <div key={idx} style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{entry}</div>
              ))}
            </div>
          ) : null}
          {plan.opportunities?.length ? (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-success)", marginBottom: "var(--s-2)" }}>
                Chancen
              </div>
              {plan.opportunities.map((entry, idx) => (
                <div key={idx} style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{entry}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
