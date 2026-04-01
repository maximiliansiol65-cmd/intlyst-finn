import { useMemo } from "react";
import { Link } from "react-router-dom";
import { getDashboardRoleCopy } from "../../config/dashboardRoles";

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.goals)) return payload.goals;
  if (Array.isArray(payload?.recommendations)) return payload.recommendations;
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

function formatDelta(value) {
  const numeric = parseNumber(value);
  if (numeric == null) return "0%";
  return `${numeric > 0 ? "+" : ""}${Math.round(numeric)}%`;
}

function scoreGoal(goal) {
  const progress = parseNumber(goal.progress_pct ?? goal.progress) ?? 0;
  const delta = parseNumber(goal.delta_pct ?? goal.change_pct) ?? 0;
  const priority = String(goal.priority || "").toLowerCase();
  const priorityScore = priority.includes("krit") ? 4 : priority.includes("hoch") || priority === "high" ? 3 : priority.includes("mittel") || priority === "medium" ? 2 : 1;
  return priorityScore * 10 + Math.abs(delta) + (100 - progress) / 5;
}

function scoreTask(task) {
  const priority = String(task.priority || "").toLowerCase();
  const priorityScore = priority === "high" || priority === "hoch" ? 4 : priority === "medium" || priority === "mittel" ? 2 : 1;
  const overdue = task.due_date && new Date(`${task.due_date}T00:00:00`) < new Date() ? 4 : 0;
  const open = task.status !== "done" ? 3 : 0;
  return priorityScore * 10 + overdue + open;
}

export default function ManagementTeamPanel({
  profile,
  goals = [],
  tasks = [],
  analysis = null,
  briefing = null,
  compact = false,
}) {
  const roleCopy = getDashboardRoleCopy(profile);
  const summary = useMemo(() => {
    const goalList = toArray(goals).sort((a, b) => scoreGoal(b) - scoreGoal(a));
    const taskList = toArray(tasks).sort((a, b) => scoreTask(b) - scoreTask(a));
    const recommendations = toArray(briefing?.recommendations ?? analysis?.recommendations);
    const topGoal = goalList[0] || null;
    const topTask = taskList[0] || null;
    const topRecommendation = recommendations[0] || null;
    const topRisk = toArray(briefing?.events).find((item) => Number(item.delta_pct) < 0) || null;
    const topOpportunity = toArray(briefing?.events).find((item) => Number(item.delta_pct) > 0) || null;

    return {
      analyze: analysis?.summary || briefing?.summary || "Keine zusammengefasste Management-Analyse verfügbar.",
      prioritize: topGoal
        ? `${topGoal.title || topGoal.metric_label || "Top-Ziel"} zuerst steuern, danach ${topTask?.title || "die wichtigste offene Aufgabe"} abarbeiten.`
        : topTask
          ? `${topTask.title} zuerst bearbeiten, weil sie aktuell die höchste Wirkung auf die Zielerreichung hat.`
          : "Noch keine priorisierten Ziele oder Aufgaben vorhanden.",
      evaluate: topRisk
        ? `${topRisk.metric_label} liegt bei ${formatDelta(topRisk.delta_pct)} zur Vorperiode. Risiko: ${topRisk.summary || "negative KPI-Abweichung"}`
        : topGoal
          ? `${topGoal.metric_label || topGoal.metric || "KPI"} zeigt ${formatDelta(topGoal.delta_pct ?? topGoal.change_pct)} Abweichung bei ${Math.round(parseNumber(topGoal.progress_pct ?? topGoal.progress) ?? 0)}% Fortschritt.`
          : "Noch keine KPI-Bewertung vorhanden.",
      recommend: topRecommendation?.description || topRecommendation?.title || profile?.dashboard?.action?.detail || "Nächsten Hebel priorisieren und mit klarer Verantwortung hinterlegen.",
      structure: [
        topGoal ? `Ziel: ${topGoal.title || topGoal.metric_label}` : null,
        topTask ? `Aufgabe: ${topTask.title}` : null,
        topOpportunity ? `Chance: ${topOpportunity.metric_label} ${formatDelta(topOpportunity.delta_pct)}` : null,
      ].filter(Boolean),
    };
  }, [analysis, briefing, goals, tasks, profile]);

  return (
    <section className="ceo-section" style={{ marginBottom: compact ? 0 : 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--s-3)", marginBottom: "var(--s-4)", flexWrap: "wrap" }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>{roleCopy.teamLabel}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            {roleCopy.teamDescription}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link to="/analyse" className="btn btn-secondary btn-sm">Analyse</Link>
          <Link to="/command" className="btn btn-secondary btn-sm">Priorisierung</Link>
          <Link to="/ceo" className="btn btn-secondary btn-sm">Empfehlungen</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-3)" }}>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Analysieren</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{summary.analyze}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Priorisieren</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{summary.prioritize}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Bewerten</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{summary.evaluate}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Empfehlen</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{summary.recommend}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Strukturieren</div>
          <div style={{ display: "grid", gap: 6 }}>
            {summary.structure.length > 0 ? summary.structure.map((item) => (
              <div key={item} style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--c-text)" }}>{item}</div>
            )) : (
              <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--c-text)" }}>Noch keine verknüpften Ziele, Aufgaben oder Chancen vorhanden.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
