/* eslint-disable */
import { useEffect, useState } from "react";

export default function InlineTip({ id, title, text, actionLabel, onAction }) {
  const storageKey = `intlyst_tip_${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey) === "1";
    setVisible(!dismissed);
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        border: "1px solid var(--c-border)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-3) var(--s-4)",
        background: "var(--c-surface)",
        display: "grid",
        gap: "var(--s-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--s-2)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{title}</div>
        <button
          onClick={dismiss}
          style={{ border: "none", background: "transparent", color: "var(--c-text-3)", fontSize: 12, cursor: "pointer" }}
        >
          Ausblenden
        </button>
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>{text}</div>
      {actionLabel && (
        <button className="btn btn-secondary btn-sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
