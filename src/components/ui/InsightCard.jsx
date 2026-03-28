import { useState } from "react";

const TYPE_CONFIG = {
  strength: { label: "Stärke",   variant: "success", accentColor: "var(--c-success)" },
  weakness: { label: "Schwäche", variant: "danger",  accentColor: "var(--c-danger)"  },
  chance:   { label: "Chance",   variant: "info",    accentColor: "var(--c-primary)" },
  risk:     { label: "Risiko",   variant: "warning", accentColor: "var(--c-warning)" },
  // fallback
  info:     { label: "Insight",  variant: "neutral", accentColor: "var(--c-text-3)"  },
};

/**
 * InsightCard — expandable insight with type badge
 *
 * type:        "strength" | "weakness" | "chance" | "risk"
 * title:       string
 * description: string
 * evidence:    string  (shown in monospace box)
 * action:      string  (shown when expanded)
 * impact_pct:  number  (e.g. 12 for "+12%")
 * defaultOpen: boolean
 */
export function InsightCard({
  type = "info",
  title,
  description,
  evidence,
  action,
  impact_pct,
  defaultOpen = false,
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;

  return (
    <div
      className={`insight-card ${open ? "expanded" : ""} ${className}`}
      style={{ borderLeft: `3px solid ${cfg.accentColor}` }}
    >
      <div
        className="insight-card-header"
        onClick={() => setOpen(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(v => !v); }}
        aria-expanded={open}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
            <span className={`badge badge-${cfg.variant} badge-sm`}>{cfg.label}</span>
            {impact_pct != null && (
              <span className="badge badge-success badge-sm">+{impact_pct}% Impact</span>
            )}
          </div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", lineHeight: 1.4 }}>
            {title}
          </div>
          {description && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", marginTop: "var(--s-2)", lineHeight: 1.5 }}>
              {description}
            </div>
          )}
          {evidence && (
            <div className="insight-evidence">
              {evidence}
            </div>
          )}
        </div>
        <svg
          className="insight-card-arrow"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 10l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="insight-card-body">
        {action && (
          <div className="insight-card-expand">
            <div style={{
              fontSize: "var(--text-sm)",
              color: "var(--c-text-2)",
              lineHeight: 1.6,
              padding: "var(--s-3) var(--s-4)",
              background: "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
              borderLeft: `3px solid ${cfg.accentColor}`,
            }}>
              <strong style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--c-text-3)", display: "block", marginBottom: "var(--s-2)" }}>
                Empfohlene Maßnahme
              </strong>
              {action}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InsightCard;
