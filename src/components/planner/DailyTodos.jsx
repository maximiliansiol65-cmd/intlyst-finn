/* eslint-disable */
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "intlyst_planner_daily_done";

function loadDone() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDone(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export default function DailyTodos({ items = [], loading }) {
  const [doneMap, setDoneMap] = useState(loadDone);

  useEffect(() => {
    saveDone(doneMap);
  }, [doneMap]);

  const computed = useMemo(
    () =>
      items.map((item, idx) => ({
        id: `${idx}-${item.title}`,
        ...item,
      })),
    [items],
  );

  const completed = computed.filter((item) => doneMap[item.id]).length;

  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-3)" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Heute umsetzen</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            {completed}/{computed.length || 0} erledigt
          </div>
        </div>
        <div style={{ minWidth: 120, height: 8, background: "var(--c-surface-2)", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              width: computed.length ? `${Math.round((completed / computed.length) * 100)}%` : "0%",
              height: "100%",
              background: "var(--c-primary)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--c-text-3)" }}>Lädt Tagesaufgaben...</div>
      ) : computed.length === 0 ? (
        <div style={{ color: "var(--c-text-3)" }}>Keine Tagesaufgaben vorhanden.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {computed.map((item) => {
            const checked = !!doneMap[item.id];
            return (
              <button
                key={item.id}
                onClick={() => setDoneMap((prev) => ({ ...prev, [item.id]: !checked }))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-3)",
                  padding: "var(--s-3) var(--s-4)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--c-border)",
                  background: checked ? "var(--c-surface-2)" : "var(--c-surface)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    border: "1.5px solid " + (checked ? "var(--c-primary)" : "var(--c-border)"),
                    background: checked ? "var(--c-primary)" : "transparent",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {checked ? "✓" : ""}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{item.title}</div>
                  {item.reason && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{item.reason}</div>
                  )}
                </div>
                {item.eta_minutes ? (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.eta_minutes} min</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
