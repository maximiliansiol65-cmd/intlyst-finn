import { useMemo } from "react";
import { Link } from "react-router-dom";

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.goals)) return payload.goals;
  return [];
}

function isOverdue(task) {
  return Boolean(task?.due_date) && new Date(`${task.due_date}T00:00:00`) < new Date() && task.status !== "done";
}

function taskScore(task) {
  const priority = String(task.priority || "").toLowerCase();
  const priorityScore = priority === "high" || priority === "hoch" ? 4 : priority === "medium" || priority === "mittel" ? 2 : 1;
  const statusScore = task.status === "open" ? 3 : task.status === "in_progress" ? 2 : 0;
  const overdueScore = isOverdue(task) ? 5 : 0;
  return priorityScore * 10 + statusScore + overdueScore;
}

function formatDate(value) {
  if (!value) return "Kein Termin";
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

export default function AssistantOpsPanel({
  profile,
  tasks = [],
  goals = [],
  analysis = null,
  briefing = null,
  compact = false,
}) {
  const ops = useMemo(() => {
    const taskList = toArray(tasks).sort((a, b) => taskScore(b) - taskScore(a));
    const goalList = toArray(goals);
    const topTask = taskList[0] || null;
    const overdueCount = taskList.filter((task) => isOverdue(task)).length;
    const inProgressCount = taskList.filter((task) => task.status === "in_progress").length;
    const topRisk = toArray(briefing?.events).find((item) => Number(item.delta_pct) < 0) || null;
    const topGoal = goalList[0] || null;
    const recommendation = toArray(briefing?.recommendations)[0] || null;
    const meetingSummary = analysis?.summary || briefing?.summary || "Keine neue Management-Zusammenfassung verfügbar.";

    return {
      taskBlock: topTask
        ? `${topTask.title} ist aktuell das wichtigste operative To-do. Verantwortlich: ${topTask.assigned_to || profile?.shortLabel || "Team"} · Fällig: ${formatDate(topTask.due_date)}.`
        : "Noch keine priorisierte Aufgabe vorhanden.",
      monitorBlock: topRisk
        ? `${topRisk.metric_label} hat sich kritisch verändert. ${topRisk.summary || "Das Management sollte die Entwicklung eng verfolgen."}`
        : `${overdueCount} überfällige und ${inProgressCount} laufende Aufgaben stehen aktuell im Fokus.`,
      communicationBlock: topTask
        ? `Nächster Follow-up: Erinnerung an ${topTask.assigned_to || "den Owner"} senden und Umsetzung bis ${formatDate(topTask.due_date)} absichern.`
        : "Keine Follow-ups offen. Neue Maßnahmen können direkt an Verantwortliche verteilt werden.",
      workflowBlock: overdueCount > 0
        ? `Engpass im Workflow: ${overdueCount} Aufgabe(n) sind überfällig. Empfehlung: Eskalationsregel und Review-Rhythmus verschärfen.`
        : topGoal
          ? `Zielsteuerung läuft, aber ${topGoal.metric_label || topGoal.metric || "die Kern-KPI"} sollte enger mit Aufgaben verknüpft werden.`
          : "Keine klaren Workflow-Engpässe erkannt.",
      overviewBlock: recommendation?.title
        ? `Ziel: ${topGoal?.title || topGoal?.metric_label || "Kein Ziel"} · Hauptaufgabe: ${topTask?.title || "Keine Aufgabe"} · Empfehlung: ${recommendation.title}.`
        : `Meeting-Update: ${meetingSummary}`,
    };
  }, [analysis, briefing, goals, profile, tasks]);

  return (
    <section className="ceo-section" style={{ marginBottom: compact ? 0 : 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--s-3)", marginBottom: "var(--s-4)", flexWrap: "wrap" }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>AI-Assistant</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            Organisiert Aufgaben, überwacht KPIs und hält das Management handlungsfähig.
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link to="/tasks" className="btn btn-secondary btn-sm">Aufgaben</Link>
          <Link to="/review-audit" className="btn btn-secondary btn-sm">Reviews</Link>
          <Link to="/analyse" className="btn btn-secondary btn-sm">KPIs</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-3)" }}>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Aufgabenorganisation</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{ops.taskBlock}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Überwachung & Zusammenfassung</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{ops.monitorBlock}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Kommunikation & Follow-up</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{ops.communicationBlock}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Workflow-Optimierung</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{ops.workflowBlock}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: 8 }}>Unternehmens-Überblick</div>
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--c-text)" }}>{ops.overviewBlock}</div>
        </div>
      </div>
    </section>
  );
}
