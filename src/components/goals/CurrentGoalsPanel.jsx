import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const PERIOD_ORDER = ["week", "month", "year"];
const PERIOD_LABELS = {
  week: "Wochenziele",
  month: "Monatsziele",
  year: "Jahresziele",
};

const PRIORITY_CONFIG = {
  kritisch: { label: "Kritisch", color: "#b91c1c", background: "#fef2f2" },
  hoch: { label: "Hoch", color: "#c2410c", background: "#fff7ed" },
  mittel: { label: "Mittel", color: "#1d4ed8", background: "#eff6ff" },
  niedrig: { label: "Niedrig", color: "#475569", background: "#f8fafc" },
};

const ROLE_KEYWORDS = {
  small_business: ["umsatz", "kunden", "auslastung", "conversion"],
  startup: ["wachstum", "activation", "retention", "kunden", "conversion"],
  agency: ["marge", "auslastung", "lead", "kundenzufriedenheit", "deadline"],
  sales_team: ["lead", "deal", "pipeline", "abschluss", "kunden", "umsatz"],
  marketing_team: ["traffic", "roi", "lead", "reach", "kampagne", "conversion"],
  content_team: ["engagement", "reach", "traffic", "content", "social"],
  service_provider: ["anfragen", "auslastung", "kundenzufriedenheit", "umsatz"],
  midsize: ["effizienz", "umsatz", "wachstum", "zufriedenheit", "conversion"],
  finance_cfo: ["cashflow", "liquiditaet", "umsatz", "kosten", "marge", "roi", "budget", "profit", "ebitda"],
  management_ceo: ["umsatz", "wachstum", "kunden", "conversion", "effizienz", "marge"],
};

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.goals)) return payload.goals;
  return [];
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fmt(value) {
  const numeric = parseNumber(value);
  if (numeric == null) return String(value ?? "—");
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Math.abs(numeric) >= 100 ? 0 : 1,
  }).format(numeric);
}

function trendSymbol(delta) {
  const numeric = parseNumber(delta);
  if (numeric == null || numeric === 0) return "→";
  return numeric > 0 ? "↑" : "↓";
}

function normalizePeriod(period) {
  const value = String(period || "").toLowerCase();
  if (value.includes("week") || value.includes("woche")) return "week";
  if (value.includes("month") || value.includes("monat") || value.includes("quart")) return "month";
  if (value.includes("year") || value.includes("jahr") || value.includes("annual")) return "year";
  return "month";
}

function deriveProgress(goal) {
  const explicit = parseNumber(goal.progress_pct ?? goal.progress);
  if (explicit != null) return Math.max(0, Math.min(100, explicit));
  const current = parseNumber(goal.current_value);
  const target = parseNumber(goal.target_value);
  if (current != null && target != null && target !== 0) {
    return Math.max(0, Math.min(100, (current / target) * 100));
  }
  return 0;
}

function deriveDelta(goal) {
  const explicit = parseNumber(goal.delta_pct ?? goal.change_pct);
  if (explicit != null) return explicit;
  const current = parseNumber(goal.current_value);
  const previous = parseNumber(goal.previous_value ?? goal.baseline_value);
  if (current != null && previous != null && previous !== 0) {
    return ((current - previous) / previous) * 100;
  }
  return 0;
}

function deriveAbsoluteDelta(goal) {
  const current = parseNumber(goal.current_value);
  const previous = parseNumber(goal.previous_value ?? goal.baseline_value);
  if (current == null || previous == null) return "—";
  const diff = current - previous;
  return `${diff > 0 ? "+" : ""}${fmt(diff)}`;
}

function derivePriority(goal) {
  const raw = String(goal.priority || "").toLowerCase();
  if (raw.includes("krit")) return "kritisch";
  if (raw.includes("hoch") || raw === "high") return "hoch";
  if (raw.includes("nied") || raw === "low") return "niedrig";
  if (raw.includes("mittel") || raw === "medium") return "mittel";

  const progress = deriveProgress(goal);
  const delta = deriveDelta(goal);
  if (progress < 40 || delta <= -15) return "kritisch";
  if (progress < 65 || delta <= -8) return "hoch";
  if (progress < 85 || delta < 5) return "mittel";
  return "niedrig";
}

function deriveRecommendation(goal, profile) {
  if (goal.recommendation || goal.action_recommendation) {
    return goal.recommendation || goal.action_recommendation;
  }
  const metric = goal.metric_label || goal.metric || "die Kern-KPI";
  const fallback = profile?.analysis?.actions?.[0] || "Nächsten operativen Hebel priorisieren.";
  return `${metric} enger steuern und den stärksten Hebel aus ${fallback.toLowerCase()}`;
}

function goalMatchesProfile(goal, profile) {
  const keywords = ROLE_KEYWORDS[profile?.id] || ROLE_KEYWORDS.management_ceo;
  const haystack = [
    goal.title,
    goal.description,
    goal.metric_label,
    goal.metric,
    goal.owner_role,
    goal.department,
    goal.role,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) return true;
  const explicitRoles = toArray(goal.roles || goal.audience || goal.visible_for).map((item) => String(item).toLowerCase());
  if (explicitRoles.length > 0) {
    return explicitRoles.includes(String(profile?.id).toLowerCase()) || explicitRoles.includes(String(profile?.shortLabel).toLowerCase());
  }
  return keywords.some((keyword) => haystack.includes(keyword)) || profile?.id === "management_ceo" || profile?.id === "finance_cfo";
}

function normalizeGoal(goal, profile, index) {
  const progress = deriveProgress(goal);
  const delta = deriveDelta(goal);
  const priority = derivePriority(goal);
  const trend = trendSymbol(delta);
  const metricLabel = goal.metric_label || goal.metric || goal.kpi || "KPI";
  return {
    id: goal.id ?? `${metricLabel}-${index}`,
    title: goal.title || goal.description || `${metricLabel} verbessern`,
    description: goal.description || `Ziel auf ${PERIOD_LABELS[normalizePeriod(goal.period)]?.toLowerCase() || "Zeitebene"} halten.`,
    period: normalizePeriod(goal.period),
    metricLabel,
    currentValue: goal.current_value,
    targetValue: goal.target_value,
    previousValue: goal.previous_value ?? goal.baseline_value,
    progress,
    delta,
    absoluteDelta: deriveAbsoluteDelta(goal),
    trend,
    priority,
    recommendation: deriveRecommendation(goal, profile),
    ownerRole: goal.owner_role || goal.department || profile?.shortLabel || "Team",
    status: goal.status || "Offen",
    cause: goal.cause || goal.root_cause || goal.reason || "Keine Ursache hinterlegt.",
    impact: goal.impact || goal.expected_impact || `Direkter Einfluss auf ${metricLabel}.`,
  };
}

function priorityScore(goal) {
  const priorityWeight = { kritisch: 4, hoch: 3, mittel: 2, niedrig: 1 }[goal.priority] || 1;
  const deviationWeight = Math.abs(goal.delta || 0) / 10;
  const progressWeight = (100 - goal.progress) / 25;
  return priorityWeight * 10 + deviationWeight + progressWeight;
}

function GoalCard({ goal, open, onToggle }) {
  const priority = PRIORITY_CONFIG[goal.priority] || PRIORITY_CONFIG.mittel;
  return (
    <div
      style={{
        border: "1px solid var(--c-border)",
        borderLeft: `4px solid ${priority.color}`,
        borderRadius: "var(--r-md)",
        background: "var(--c-surface)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          padding: "var(--s-4)",
          display: "grid",
          gap: "var(--s-3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--c-text)" }}>{goal.title}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>{goal.description}</div>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: priority.background,
              color: priority.color,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {priority.label}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(4, minmax(0, 1fr))", gap: "var(--s-3)", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>KPI</div>
            <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{goal.metricLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aktuell</div>
            <div style={{ fontWeight: 700 }}>{fmt(goal.currentValue)}</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ziel</div>
            <div style={{ fontWeight: 700 }}>{fmt(goal.targetValue)}</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Abweichung</div>
            <div style={{ fontWeight: 700, color: goal.delta < 0 ? "#b91c1c" : "#15803d" }}>
              {goal.trend} {goal.delta > 0 ? "+" : ""}{goal.delta.toFixed(1)}% ({goal.absoluteDelta})
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fortschritt</div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ height: 8, background: "var(--c-surface-3)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, Math.min(goal.progress, 100))}%`, height: "100%", background: priority.color }} />
              </div>
              <div style={{ fontWeight: 700 }}>{Math.round(goal.progress)}%</div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>
          Handlungsempfehlung: {goal.recommendation}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--c-border)", padding: "var(--s-4)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-3)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)" }}>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase" }}>Ursache</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{goal.cause}</div>
            </div>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase" }}>Verantwortung</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{goal.ownerRole}</div>
            </div>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase" }}>Wirkung</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{goal.impact}</div>
            </div>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase" }}>Status</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.6 }}>{goal.status}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <Link to="/analyse" className="btn btn-secondary btn-sm">Analyse</Link>
            <Link to="/tasks" className="btn btn-secondary btn-sm">Aufgaben</Link>
            <Link to="/ceo" className="btn btn-secondary btn-sm">Empfehlung</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CurrentGoalsPanel({
  goals = [],
  profile,
  loading = false,
  error = null,
  onRetry,
  onAddGoal,
  emptyText = "Noch keine aktuellen Ziele vorhanden.",
}) {
  const [openId, setOpenId] = useState(null);

  const groupedGoals = useMemo(() => {
    const sourceGoals = toArray(goals);
    const roleScoped = sourceGoals.filter((goal) => goalMatchesProfile(goal, profile));
    const baseList = (roleScoped.length > 0 ? roleScoped : sourceGoals)
      .map((goal, index) => normalizeGoal(goal, profile, index))
      .sort((a, b) => priorityScore(b) - priorityScore(a));

    return PERIOD_ORDER.map((period) => ({
      period,
      label: PERIOD_LABELS[period],
      items: baseList.filter((goal) => goal.period === period),
    })).filter((group) => group.items.length > 0);
  }, [goals, profile]);

  if (loading) {
    return <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Ziele werden geladen...</div>;
  }

  if (error) {
    return (
      <div style={{ color: "var(--c-danger)", fontSize: "var(--text-sm)" }}>
        {error}{" "}
        {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Neu laden</button>}
      </div>
    );
  }

  if (groupedGoals.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "var(--s-4) 0" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: "var(--s-3)" }}>{emptyText}</div>
        {onAddGoal && <button className="btn btn-secondary btn-sm" onClick={onAddGoal}>Ziel hinzufügen</button>}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--s-4)" }}>
      {onAddGoal && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-sm" onClick={onAddGoal}>+ Ziel hinzufügen</button>
        </div>
      )}

      {groupedGoals.map((group) => (
        <div key={group.period} style={{ display: "grid", gap: "var(--s-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--s-3)" }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {group.label}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              Automatisch nach Dringlichkeit und Wirkung sortiert
            </div>
          </div>
          {group.items.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              open={openId === goal.id}
              onToggle={() => setOpenId((current) => (current === goal.id ? null : goal.id))}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
