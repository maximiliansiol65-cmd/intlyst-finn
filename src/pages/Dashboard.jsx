/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/premium-dashboard.css";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";

// ─── Fallback Data ────────────────────────────────────────────────────────────
const FALLBACK_STATUS = {
  summary: "Die Geschäftslage zeigt ein kritisches Effizienzsignal und gleichzeitig eine kurzfristig nutzbare Wachstumschance.",
  risk: {
    metric_label: "Conversion Rate",
    summary: "Die Abschlusswahrscheinlichkeit sinkt und belastet direkt den Umsatz.",
    current_value: 2.8, baseline_value: 3.3, delta_pct: -15, direction: "down", confidence: 68,
    top_causes: [{ label: "Follow-up-Prozess zu langsam", probability: 74, evidence: "Leads bleiben zu lange ohne nächsten Schritt." }],
  },
  opportunity: {
    metric_label: "Organischer Traffic",
    summary: "Die Nachfrage steigt und kann kurzfristig in neue Abschlüsse übersetzt werden.",
    current_value: 16368, baseline_value: 12400, delta_pct: 32, direction: "up", confidence: 71,
    top_causes: [{ label: "Content mit hoher Reichweite", probability: 67, evidence: "Neue Inhalte treiben zusätzliche qualifizierte Besuche." }],
  },
};

const METRIC_KEY_MAP = {
  Umsatz: "revenue", "Wachstum (MoM)": "customers", "Neue Kunden": "customers",
  "Conversion Rate": "conversion", Traffic: "traffic", Conversion: "conversion",
  Kunden: "customers", MRR: "revenue",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.recommendations)) return payload.recommendations;
  return [];
}
function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function formatNumber(value) {
  const n = parseNumeric(value);
  if (n == null) return String(value ?? "—");
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}
function formatMetricValue(metric, fallback) {
  if (metric?.current_value != null) return formatNumber(metric.current_value);
  if (fallback?.current_value != null) return formatNumber(fallback.current_value);
  return "—";
}
function formatDelta(value) {
  const n = parseNumeric(value);
  if (n == null) return "0%";
  return `${n > 0 ? "+" : ""}${n}%`;
}
function trendArrow(value) {
  const n = parseNumeric(value);
  if (n == null || n === 0) return "→";
  return n > 0 ? "↑" : "↓";
}
function absoluteDelta(item) {
  const c = parseNumeric(item?.current_value), p = parseNumeric(item?.baseline_value);
  if (c == null || p == null) return "—";
  const d = c - p;
  return `${d > 0 ? "+" : ""}${formatNumber(d)}`;
}
function sparkline(values = []) {
  if (!values.length) return "▁▂▃▄";
  const blocks = ["▁","▂","▃","▄","▅","▆","▇"];
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return values.map(() => "▄").join("");
  return values.map(v => blocks[Math.max(0, Math.min(blocks.length-1, Math.round(((v-min)/(max-min))*(blocks.length-1))))]).join("");
}
function buildTrendWindows(deltaPct = 0) {
  const base = parseNumeric(deltaPct) ?? 0;
  return [
    { label: "7T",  value: Math.round(base * 0.45) },
    { label: "14T", value: Math.round(base) },
    { label: "30T", value: Math.round(base * 1.18) },
    { label: "90T", value: Math.round(base * 0.82) },
  ];
}
function scoreTask(task) {
  const s = task.status === "open" ? 4 : task.status === "in_progress" ? 3 : task.status === "review" ? 2 : 0;
  const p = task.priority === "high" ? 4 : task.priority === "medium" ? 2 : 1;
  const d = task.due_date && new Date(`${task.due_date}T00:00:00`) < new Date() ? 4 : 0;
  return s + p + d;
}
function normalizeTaskStatus(status) {
  if (status === "in_progress") return "In Arbeit";
  if (status === "review") return "Review";
  if (status === "done") return "Erledigt";
  return "Offen";
}
function buildDashboardState({ briefing, causes, analysis, tasks, profile, forecast }) {
  const causeItems = causes.length ? causes : [FALLBACK_STATUS.risk, FALLBACK_STATUS.opportunity];
  const negative = causeItems.filter(i => i.direction === "down" || Number(i.delta_pct) < 0)
    .sort((a, b) => Math.abs(Number(b.delta_pct||0)) - Math.abs(Number(a.delta_pct||0)));
  const positive = causeItems.filter(i => i.direction === "up" || Number(i.delta_pct) > 0)
    .sort((a, b) => Math.abs(Number(b.delta_pct||0)) - Math.abs(Number(a.delta_pct||0)));
  const recommendations = toArray(briefing?.recommendations).sort((a, b) => {
    const l = Number(a.expected_impact_pct ?? a.impact_score ?? 0) - Number(a.risk_score ?? 0);
    const r = Number(b.expected_impact_pct ?? b.impact_score ?? 0) - Number(b.risk_score ?? 0);
    return r - l;
  });
  const topCritical    = negative[0] || FALLBACK_STATUS.risk;
  const topChange      = [...causeItems].sort((a,b) => Math.abs(Number(b.delta_pct||0)) - Math.abs(Number(a.delta_pct||0)))[0] || topCritical;
  const topOpportunity = positive[1] || recommendations[0] || positive[0] || FALLBACK_STATUS.opportunity;
  const topProblem     = negative[0] || FALLBACK_STATUS.risk;
  const topTask        = [...tasks].sort((a,b) => scoreTask(b) - scoreTask(a))[0];
  const topRecommendation = recommendations[0] || null;
  const topCause       = topProblem?.top_causes?.[0] || FALLBACK_STATUS.risk.top_causes[0];
  const forecastPoints = toArray(forecast?.forecast);
  const lastForecast   = forecastPoints[forecastPoints.length - 1];
  const trendWindows   = buildTrendWindows(topChange?.delta_pct);
  const spark          = sparkline(trendWindows.map(i => i.value));
  return {
    topCritical, topChange, topOpportunity, topProblem, topTask,
    topRecommendation, topCause, trendWindows, spark,
    forecastValue: lastForecast?.value != null ? formatNumber(lastForecast.value) : "—",
    statusText: briefing?.summary || analysis?.summary || "Die wichtigste Ziel-KPI steht unter Druck, während in einem Wachstumshebel positives Momentum entsteht.",
    whyText: topCause?.evidence || "Das stärkste Negativsignal deutet auf einen operativen Engpass im Kernprozess hin.",
    priorities: [
      `${topCritical.metric_label || profile.dashboard.kpis[0]} sofort stabilisieren`,
      topTask?.title || "Höchste Management-Aufgabe direkt eskalieren",
      topRecommendation?.title || profile.dashboard.action.title,
    ],
    nextStepText: topTask
      ? `${topTask.assigned_to || "Owner"} übernimmt heute den nächsten Schritt an ${topTask.title}.`
      : `${profile.dashboard.action.owner} priorisiert heute den kritischsten KPI-Hebel.`,
  };
}

// ─── KPI-Connections für Drilldown ────────────────────────────────────────────
const KPI_CHAINS = {
  "Conversion Rate":     ["Conversion Rate → Umsatz (direkt)", "Traffic → Conversion Rate → Abschlüsse"],
  "Organischer Traffic": ["Traffic → Leads → Conversion → Umsatz"],
  "Umsatz":              ["Conversion Rate → Umsatz", "Neue Kunden → Umsatz"],
  "Neue Kunden":         ["Traffic → Leads → Neue Kunden", "Neue Kunden → LTV → Umsatz"],
  "MRR":                 ["MRR → ARR", "Churn → MRR (negativ)"],
  default:               ["KPI → Umsatz (direkt)", "KPI → Ziele (operativ)"],
};

// ─── Drilldown Content Builder ────────────────────────────────────────────────
function buildDrilldownContent(type, d, profile) {
  const reco     = d.topRecommendation;
  const trendStr = d.trendWindows.map(w => `${w.label}: ${w.value > 0 ? "+" : ""}${w.value}%`).join("  ·  ");
  const immediate = reco?.title || profile.dashboard?.action?.title || "Engpass im kritischsten Prozess sofort beheben";
  const mid       = profile.analysis?.actions?.[0] || "Systematisches Testing in betroffenen Bereichen einleiten";
  const strategic = profile.analysis?.actions?.[1] || "Strukturelle Kernprozesse langfristig optimieren";

  const commonActions = (kpi) => [
    { type: "Sofort",       text: immediate, kpi, priority: "high"   },
    { type: "Mittelfristig", text: mid,      kpi: "Conversion", priority: "medium" },
    { type: "Strategisch",  text: strategic, kpi: "Umsatz",     priority: "low"    },
  ];

  if (type === "kpi") return {
    headline: d.topCritical.metric_label || "Wichtigste KPI",
    statusValue: formatMetricValue(d.topCritical, FALLBACK_STATUS.risk),
    statusDelta: formatDelta(d.topCritical.delta_pct),
    statusUp:    Number(d.topCritical.delta_pct) >= 0,
    statusText:  `${d.topCritical.metric_label} liegt bei ${formatMetricValue(d.topCritical, FALLBACK_STATUS.risk)} — ${formatDelta(d.topCritical.delta_pct)} ggü. Vorperiode. ${d.topCritical.summary || "Direkter Einfluss auf Umsatz und Zielerreichung."}`,
    causes:      d.topCritical.top_causes?.length ? d.topCritical.top_causes : [FALLBACK_STATUS.risk.top_causes[0]],
    kpiLinks:    KPI_CHAINS[d.topCritical.metric_label] || KPI_CHAINS.default,
    trendStr, trendWindows: d.trendWindows,
    actions:     commonActions(d.topCritical.metric_label),
    forecast:    `Nach Umsetzung der Sofortmaßnahme könnte ${d.topCritical.metric_label} um ${reco?.expected_impact_pct ?? "10–15"}% steigen und den Umsatz direkt positiv beeinflussen.`,
    taskLink: "/tasks", ceoLink: "/ceo",
  };

  if (type === "change") return {
    headline: `Größte Veränderung: ${d.topChange.metric_label}`,
    statusValue: formatMetricValue(d.topChange),
    statusDelta: formatDelta(d.topChange.delta_pct),
    statusUp:    Number(d.topChange.delta_pct) >= 0,
    statusText:  `${d.topChange.metric_label} hat sich um ${formatDelta(d.topChange.delta_pct)} verändert (Vorperiode → Jetzt: ${absoluteDelta(d.topChange)}). ${d.topChange.summary || "Diese Bewegung beeinflusst mehrere abhängige KPIs."}`,
    causes:      d.topChange.top_causes?.length ? d.topChange.top_causes : [{ label: "Externe Marktveränderung oder interner Prozesswandel", probability: 65, evidence: "Muster deutet auf eine graduelle Verschiebung hin." }],
    kpiLinks:    KPI_CHAINS[d.topChange.metric_label] || KPI_CHAINS.default,
    trendStr, trendWindows: d.trendWindows,
    actions: [
      { type: "Sofort", text: Number(d.topChange.delta_pct) >= 0 ? "Positiven Trend durch Ressourcenverstärkung ausbauen" : "Ursache der negativen Veränderung sofort lokalisieren", kpi: d.topChange.metric_label, priority: Number(d.topChange.delta_pct) >= 0 ? "medium" : "high" },
      { type: "Mittelfristig", text: "Veränderungsmuster dokumentieren und Gegenmaßnahmen testen", kpi: d.topChange.metric_label, priority: "medium" },
      { type: "Strategisch",  text: "Strukturelle Prozessverbesserung auf Basis der Erkenntnisse", kpi: "Umsatz", priority: "low" },
    ],
    forecast: `Bei unverändertem Verlauf wird ${d.topChange.metric_label} sich weiter ${Number(d.topChange.delta_pct) >= 0 ? "positiv" : "negativ"} entwickeln. Aktive Steuerung ist empfohlen.`,
    taskLink: "/tasks", ceoLink: "/ceo",
  };

  if (type === "opportunity") return {
    headline: `Größte Chance: ${d.topOpportunity.metric_label || d.topOpportunity.title || "Wachstumspotenzial"}`,
    statusValue: formatMetricValue(d.topOpportunity, FALLBACK_STATUS.opportunity),
    statusDelta: formatDelta(d.topOpportunity.delta_pct),
    statusUp:    true,
    statusText:  d.topOpportunity.summary || d.topOpportunity.description || "Ein starkes positives Signal mit kurzfristiger Skalierbarkeit ist erkennbar.",
    causes:      d.topOpportunity.top_causes?.length ? d.topOpportunity.top_causes : [{ label: "Hohe Nachfrage oder gestiegene Sichtbarkeit", probability: 70, evidence: "Positives Signal mit erkennbarer Wachstumsdynamik." }],
    kpiLinks:    ["Chance → Umsatz (kurzfristig)", "Skalierung → Marktanteil (mittelfristig)"],
    trendStr, trendWindows: d.trendWindows,
    actions: [
      { type: "Sofort",       text: reco?.title || "Momentum nutzen — Ressourcen in wachstumsstärkstes Segment", kpi: d.topOpportunity.metric_label || "Umsatz", priority: "high" },
      { type: "Mittelfristig", text: "Skalierbare Prozesse für die Chance aufbauen", kpi: "Conversion", priority: "medium" },
      { type: "Strategisch",  text: "Nachhaltige Positionierung im identifizierten Wachstumssegment", kpi: "MRR", priority: "low" },
    ],
    forecast: `Bei gezielter Nutzung dieser Chance ist ein Wachstum von ${reco?.expected_impact_pct ?? "15–25"}% in den nächsten 30 Tagen realistisch.`,
    taskLink: "/tasks", ceoLink: "/ceo",
  };

  if (type === "problem") return {
    headline: `Größtes Problem: ${d.topProblem.metric_label}`,
    statusValue: formatMetricValue(d.topProblem, FALLBACK_STATUS.risk),
    statusDelta: formatDelta(d.topProblem.delta_pct),
    statusUp:    false,
    statusText:  `${d.topProblem.metric_label} zeigt eine Verschlechterung von ${formatDelta(d.topProblem.delta_pct)}. ${d.topProblem.summary || "Ohne Eingriff droht ein weiterer Rückgang."}`,
    causes:      d.topProblem.top_causes?.length ? d.topProblem.top_causes : [FALLBACK_STATUS.risk.top_causes[0]],
    kpiLinks:    KPI_CHAINS[d.topProblem.metric_label] || KPI_CHAINS.default,
    trendStr, trendWindows: d.trendWindows,
    actions: [
      { type: "Sofort",       text: `${d.topCause.label} — direkte Gegenmaßnahme einleiten`, kpi: d.topProblem.metric_label, priority: "high" },
      { type: "Mittelfristig", text: "Schwachstelle systematisch analysieren und beheben", kpi: d.topProblem.metric_label, priority: "medium" },
      { type: "Strategisch",  text: "Strukturelle Ursache langfristig beseitigen", kpi: "Umsatz", priority: "low" },
    ],
    forecast: `Ohne Eingriff könnte ${d.topProblem.metric_label} weitere ${Math.abs(Number(d.topProblem.delta_pct) || 5)}% zurückgehen. Mit sofortiger Maßnahme ist Stabilisierung in 2–3 Wochen möglich.`,
    taskLink: "/tasks", ceoLink: "/alerts",
  };

  if (type === "task") return {
    headline: d.topTask?.title || "Wichtigste Aufgabe",
    statusValue: normalizeTaskStatus(d.topTask?.status),
    statusDelta: null,
    statusUp: d.topTask?.status === "done",
    statusText: `Status: ${normalizeTaskStatus(d.topTask?.status)}. Verantwortlich: ${d.topTask?.assigned_to || "Nicht zugewiesen"}. Priorität: ${d.topTask?.priority === "high" ? "Hoch" : d.topTask?.priority === "medium" ? "Mittel" : "Niedrig"}. Diese Aufgabe adressiert den kritischsten KPI-Rückgang direkt.`,
    causes: [
      { label: `${d.topCritical.metric_label} steht unter Druck`, probability: 85, evidence: "Diese Aufgabe ist der direkteste operative Hebel." },
      { label: "Operative Lücke im Kernprozess", probability: 70, evidence: "Fehlende Maßnahme verursacht anhaltende KPI-Verschlechterung." },
    ],
    kpiLinks: [`Aufgabe → ${d.topCritical.metric_label} (direkt)`, `Umsetzung → Ziel: ${d.topCritical.metric_label} stabilisieren`],
    trendStr, trendWindows: d.trendWindows,
    actions: [
      { type: "Sofort",       text: `${d.topTask?.title || "Aufgabe"} jetzt starten oder eskalieren`, kpi: d.topCritical.metric_label, priority: "high" },
      { type: "Mittelfristig", text: "Folgemaßnahmen nach Abschluss definieren und einplanen", kpi: "Umsatz", priority: "medium" },
      { type: "Strategisch",  text: "Prozess optimieren, damit solche Aufgaben präventiv entstehen", kpi: "Effizienz", priority: "low" },
    ],
    forecast: `Nach Abschluss dieser Aufgabe ist ein KPI-Uplift von ${reco?.expected_impact_pct ?? "8–15"}% bei ${d.topCritical.metric_label} realistisch.`,
    taskLink: "/tasks", ceoLink: "/command",
  };

  // recommendation
  return {
    headline: reco?.title || "Wichtigste Empfehlung",
    statusValue: `${reco?.expected_impact_pct ?? "10–18"}% Uplift`,
    statusDelta: null,
    statusUp: true,
    statusText: reco?.description || profile.dashboard?.action?.detail || "Diese Empfehlung adressiert den kritischsten Hebel im System.",
    causes: [
      { label: reco?.title || "Direkte Maßnahme zur KPI-Verbesserung", probability: reco?.expected_impact_pct || 75, evidence: reco?.description || "Basiert auf der stärksten identifizierten Ursache." },
      { label: `Risikolevel: ${reco?.risk_score != null ? reco.risk_score : "mittel"}`, probability: 60, evidence: "Umsetzungsrisiko ist bei klarer Planung beherrschbar." },
    ],
    kpiLinks: [`Empfehlung → ${d.topCritical.metric_label}`, "Umsetzung → Umsatz (direkt)"],
    trendStr, trendWindows: d.trendWindows,
    actions: [
      { type: "Sofort",       text: `${reco?.title || immediate} — direkt starten`, kpi: d.topCritical.metric_label, priority: "high" },
      { type: "Mittelfristig", text: "Ergebnis nach 14 Tagen messen und Kurs anpassen", kpi: "Conversion", priority: "medium" },
      { type: "Strategisch",  text: "Lerneffekte in Prozess übertragen, nächste Empfehlung priorisieren", kpi: "Umsatz", priority: "low" },
    ],
    forecast: `Erwarteter Effekt: ${reco?.expected_impact_pct ?? "10–18"}% Verbesserung bei ${reco?.kpi_labels?.[0] || d.topCritical.metric_label} in den nächsten 30 Tagen.`,
    taskLink: "/tasks", ceoLink: "/ceo",
  };
}

// ─── DrillSection ─────────────────────────────────────────────────────────────
function DrillSection({ emoji, title, children, last }) {
  return (
    <div style={{ padding: "20px 24px", borderBottom: last ? "none" : "1px solid var(--c-border)" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}

const PRIO_COL = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
const ACTION_ICON = { Sofort: "⚡", Mittelfristig: "📅", Strategisch: "🎯" };

// ─── DrilldownPanel ────────────────────────────────────────────────────────────
function DrilldownPanel({ type, dashboard, profile, onClose }) {
  const navigate = useNavigate();
  const c = buildDrilldownContent(type, dashboard, profile);
  if (!c) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, backdropFilter: "blur(3px)" }} />
      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)", background: "var(--c-bg, #fff)", overflowY: "auto", zIndex: 201, boxShadow: "-8px 0 48px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, padding: "20px 24px 16px", background: "#0f172a", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 10 }}>
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Detailanalyse · 7 Ebenen</div>
            <div style={{ fontSize: "clamp(16px,2.5vw,21px)", fontWeight: 700, lineHeight: 1.3 }}>{c.headline}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12 }}>×</button>
        </div>

        {/* 1 — Status & Zahlen */}
        <DrillSection emoji="📊" title="1 · Status & Zahlen">
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: "var(--c-text)", fontVariantNumeric: "tabular-nums" }}>{c.statusValue}</span>
            {c.statusDelta && (
              <span style={{ fontSize: 20, fontWeight: 700, color: c.statusUp ? "#16a34a" : "#dc2626" }}>{c.statusDelta}</span>
            )}
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.7, margin: 0 }}>{c.statusText}</p>
        </DrillSection>

        {/* 2 — Ursachenanalyse */}
        <DrillSection emoji="🔍" title="2 · Ursachenanalyse">
          <div style={{ display: "grid", gap: 10 }}>
            {c.causes.map((cause, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: i === 0 ? "#fef2f2" : "var(--c-surface-2)", border: `1px solid ${i === 0 ? "#fecaca" : "var(--c-border)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: cause.evidence ? 6 : 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>
                    {i === 0 ? "Hauptursache: " : `Faktor ${i + 1}: `}{cause.label}
                  </span>
                  <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, flexShrink: 0, background: i === 0 ? "#fee2e2" : "var(--c-surface-3)", color: i === 0 ? "#dc2626" : "var(--c-text-3)" }}>
                    {cause.probability ?? cause.confidence ?? "—"}% Konfidenz
                  </span>
                </div>
                {cause.evidence && <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{cause.evidence}</div>}
              </div>
            ))}
          </div>
        </DrillSection>

        {/* 3 — KPI-Zusammenhänge */}
        <DrillSection emoji="🔗" title="3 · KPI-Zusammenhänge">
          <div style={{ display: "grid", gap: 8 }}>
            {c.kpiLinks.map((link, i) => (
              <div key={i} style={{ padding: "8px 12px", background: "var(--c-surface-2)", borderRadius: "var(--r-sm)", fontSize: "var(--text-sm)", color: "var(--c-text-2)", fontFamily: "monospace" }}>
                {link}
              </div>
            ))}
          </div>
        </DrillSection>

        {/* 4 — Zeitliche Entwicklung */}
        <DrillSection emoji="📈" title="4 · Zeitliche Entwicklung">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {c.trendWindows.map(w => (
              <div key={w.label} style={{ flex: "1 1 60px", padding: "10px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--c-text-3)", marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontWeight: 700, fontSize: "16px", color: w.value >= 0 ? "#16a34a" : "#dc2626" }}>{w.value > 0 ? "+" : ""}{w.value}%</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", fontFamily: "monospace" }}>{c.trendStr}</div>
        </DrillSection>

        {/* 5 — Maßnahmen */}
        <DrillSection emoji="⚡" title="5 · Maßnahmen (priorisiert)">
          <div style={{ display: "grid", gap: 10 }}>
            {c.actions.map((a, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{ACTION_ICON[a.type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: PRIO_COL[a.priority] + "18", color: PRIO_COL[a.priority] }}>{a.type}</span>
                    <span style={{ fontSize: "11px", color: "var(--c-text-3)" }}>KPI: {a.kpi}</span>
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.55 }}>{a.text}</div>
                </div>
              </div>
            ))}
          </div>
        </DrillSection>

        {/* 6 — Aufgaben-Verknüpfung */}
        <DrillSection emoji="✅" title="6 · Aufgaben & Verantwortung">
          <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.7, marginBottom: 14 }}>
            Die wichtigste Sofortmaßnahme kann direkt als Aufgabe angelegt und einer Rolle zugewiesen werden. Verknüpfe sie mit dem betroffenen KPI und dem übergeordneten Ziel.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => { onClose(); navigate(c.taskLink); }} style={{ padding: "10px 18px", borderRadius: "var(--r-md)", background: "#0f172a", border: "1px solid #0f172a", color: "#fff", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" }}>
              Aufgabe anlegen →
            </button>
            <button onClick={() => { onClose(); navigate(c.ceoLink); }} style={{ padding: "10px 18px", borderRadius: "var(--r-md)", background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" }}>
              Analyse öffnen →
            </button>
          </div>
        </DrillSection>

        {/* 7 — Erwartetes Ergebnis */}
        <DrillSection emoji="🎯" title="7 · Erwartetes Ergebnis" last>
          <div style={{ padding: "16px 18px", borderRadius: "var(--r-md)", background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "#15803d", marginBottom: 6 }}>Prognose nach Umsetzung</div>
            <p style={{ fontSize: "var(--text-sm)", color: "#166534", lineHeight: 1.7, margin: 0 }}>{c.forecast}</p>
          </div>
          <button onClick={() => { onClose(); navigate("/forecast"); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: "var(--r-md)", background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" }}>
            Vollständige Prognose öffnen →
          </button>
        </DrillSection>
      </div>
    </>
  );
}

// ─── ExecTile ─────────────────────────────────────────────────────────────────
function ExecTile({ rank, title, metricName, value, trend, trendUp, period, summary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", padding: "var(--s-5)", display: "grid", gap: 6, transition: "box-shadow 0.15s, border-color 0.15s", position: "relative", fontFamily: "inherit" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = "#3b82f6"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--c-border)"; }}
    >
      <div style={{ fontSize: "11px", color: "var(--c-text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{rank}. {title}</div>
      <div style={{ fontWeight: 700, fontSize: "clamp(14px,1.8vw,16px)", color: "var(--c-text-2)" }}>{metricName}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, color: "var(--c-text)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
        {trend && <span style={{ fontSize: "14px", fontWeight: 700, color: trendUp ? "#16a34a" : "#dc2626" }}>{trend}</span>}
      </div>
      <div style={{ fontSize: "11px", color: "var(--c-text-4)" }}>{period}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.5, marginTop: 2 }}>{summary}</div>
      <div style={{ position: "absolute", bottom: 12, right: 14, fontSize: "11px", color: "#3b82f6", fontWeight: 700 }}>Analyse →</div>
    </button>
  );
}

// ─── RightPreviewCard ─────────────────────────────────────────────────────────
function RightPreviewCard({ title, children, to }) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <div style={{ padding: "var(--s-4)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", cursor: "pointer", transition: "border-color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#3b82f6"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--c-border)"}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          {title} <span style={{ color: "#3b82f6" }}>→</span>
        </div>
        {children}
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { authHeader }  = useAuth();
  const { profile }     = useCompanyProfile();
  const [loading, setLoading] = useState(true);
  const [activeDrilldown, setActiveDrilldown] = useState(null);
  const [snapshot, setSnapshot] = useState({ briefing: null, causes: [], analysis: null, tasks: [], forecast: null });

  useEffect(() => {
    let alive = true;
    async function parseRes(entry, fallback) {
      if (entry.status !== "fulfilled" || !entry.value.ok) return fallback;
      try { return await entry.value.json(); } catch { return fallback; }
    }
    async function load() {
      setLoading(true);
      const metricId = profile.analysis?.forecastMetric || METRIC_KEY_MAP[profile.dashboard?.kpis?.[0]] || "revenue";
      const reqs = await Promise.allSettled([
        fetch("/api/decision/briefing", { headers: authHeader() }),
        fetch("/api/decision/causes",   { headers: authHeader() }),
        fetch("/api/ai/analysis",       { headers: authHeader() }),
        fetch("/api/tasks",             { headers: authHeader() }),
        fetch(`/api/ai/forecast/${metricId}?horizon=30`, { headers: authHeader() }),
      ]);
      const [bR, cR, aR, tR, fR] = reqs;
      const next = {
        briefing:  await parseRes(bR, null),
        causes:    toArray(await parseRes(cR, { items: [] })),
        analysis:  await parseRes(aR, null),
        tasks:     toArray(await parseRes(tR, [])),
        forecast:  await parseRes(fR, null),
      };
      if (alive) { setSnapshot(next); setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [authHeader, profile]);

  const dashboard = useMemo(() => buildDashboardState({ ...snapshot, profile }), [snapshot, profile]);

  // Close drilldown on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setActiveDrilldown(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Shorthand tile values
  const kpiValue    = formatMetricValue(dashboard.topCritical, FALLBACK_STATUS.risk);
  const kpiDelta    = formatDelta(dashboard.topCritical.delta_pct);
  const kpiUp       = Number(dashboard.topCritical.delta_pct) >= 0;
  const changeUp    = Number(dashboard.topChange.delta_pct) >= 0;
  const oppDelta    = formatDelta(dashboard.topOpportunity.delta_pct);
  const probDelta   = formatDelta(dashboard.topProblem.delta_pct);

  // Right-side forecast preview items
  const forecastItems = [
    { label: "Umsatz",     trend: dashboard.trendWindows[1].value >= 0 ? "↑" : "↓", pct: `${dashboard.trendWindows[1].value > 0 ? "+" : ""}${dashboard.trendWindows[1].value}%`, up: dashboard.trendWindows[1].value >= 0 },
    { label: "Leads",      trend: dashboard.trendWindows[0].value >= 0 ? "↑" : "↓", pct: `${dashboard.trendWindows[0].value > 0 ? "+" : ""}${dashboard.trendWindows[0].value}%`, up: dashboard.trendWindows[0].value >= 0 },
    { label: "Conversion", trend: Number(dashboard.topCritical.delta_pct) >= 0 ? "↑" : "↓", pct: kpiDelta, up: kpiUp },
  ];
  const marketStatus = kpiUp ? "Über Durchschnitt" : Number(dashboard.topCritical.delta_pct) > -10 ? "Im Durchschnitt" : "Unter Durchschnitt";
  const marketColor  = kpiUp ? "#16a34a" : Number(dashboard.topCritical.delta_pct) > -10 ? "#f59e0b" : "#dc2626";

  return (
    <div className="ceo-shell">
      <header className="ceo-hero dashboard-hero-minimal">
        <div>
          <p className="eyebrow">CEO-Dashboard</p>
          <h1>Entscheidungsüberblick</h1>
          <p className="sub">{loading ? "Daten werden geladen..." : dashboard.statusText}</p>
        </div>
        {!loading && (
          <div className="hero-note">
            <span className="dot" />
            <span>Klick auf jede Kachel → Tiefenanalyse in 7 Ebenen</span>
          </div>
        )}
      </header>

      <div className="dashboard-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: "var(--s-6)", alignItems: "start" }}>
        {/* ── Left: 6 ExecTiles ── */}
        <section className="executive-grid">
          <ExecTile
            rank={1} title="Wichtigste KPI"
            metricName={dashboard.topCritical.metric_label || profile.dashboard.kpis[0]}
            value={kpiValue} trend={`${trendArrow(dashboard.topCritical.delta_pct)} ${kpiDelta}`} trendUp={kpiUp}
            period="Letzte 30 Tage"
            summary={dashboard.topCritical.summary || "Direkter Einfluss auf Umsatz und Zielerreichung."}
            onClick={() => setActiveDrilldown("kpi")}
          />
          <ExecTile
            rank={2} title="Größte Veränderung"
            metricName={dashboard.topChange.metric_label || "—"}
            value={formatMetricValue(dashboard.topChange)} trend={`${trendArrow(dashboard.topChange.delta_pct)} ${formatDelta(dashboard.topChange.delta_pct)}`} trendUp={changeUp}
            period="Letzte 14 Tage"
            summary={dashboard.topChange.summary || "Stärkste Bewegung in der aktuellen Periode."}
            onClick={() => setActiveDrilldown("change")}
          />
          <ExecTile
            rank={3} title="Größte Chance"
            metricName={dashboard.topOpportunity.metric_label || dashboard.topOpportunity.title || "Wachstumschance"}
            value={formatMetricValue(dashboard.topOpportunity, FALLBACK_STATUS.opportunity)} trend={`↑ ${oppDelta}`} trendUp={true}
            period="Kurzfristiges Potenzial"
            summary={dashboard.topOpportunity.summary || dashboard.topOpportunity.description || "Positives Signal mit kurzfristiger Skalierbarkeit."}
            onClick={() => setActiveDrilldown("opportunity")}
          />
          <ExecTile
            rank={4} title="Größtes Problem"
            metricName={dashboard.topProblem.metric_label || "Kritische KPI"}
            value={formatMetricValue(dashboard.topProblem, FALLBACK_STATUS.risk)} trend={`↓ ${probDelta}`} trendUp={false}
            period="Sofortige Aufmerksamkeit"
            summary={dashboard.topProblem.summary || "Direkter Umsatzdruck, sofortiger Handlungsbedarf."}
            onClick={() => setActiveDrilldown("problem")}
          />
          <ExecTile
            rank={5} title="Wichtigste Aufgabe"
            metricName={dashboard.topTask?.title || profile.tasks.suggestions?.[0]?.title || "Sofortmaßnahme definieren"}
            value={normalizeTaskStatus(dashboard.topTask?.status)} trend={null} trendUp={false}
            period={`Verantwortlich: ${dashboard.topTask?.assigned_to || profile.dashboard.action.owner || "Management"}`}
            summary={`Wirkt direkt auf ${dashboard.topCritical.metric_label || "Kern-KPI"} — Priorität: ${dashboard.topTask?.priority === "high" ? "Hoch" : "Mittel"}.`}
            onClick={() => setActiveDrilldown("task")}
          />
          <ExecTile
            rank={6} title="Wichtigste Empfehlung"
            metricName={dashboard.topRecommendation?.title || profile.dashboard.action.title || "Strategische Empfehlung"}
            value={`+${dashboard.topRecommendation?.expected_impact_pct ?? "10–18"}%`} trend={null} trendUp={true}
            period="Nächste 30 Tage"
            summary={dashboard.topRecommendation?.description || profile.dashboard.action.detail || "Höchster erwarteter KPI-Einfluss bei vertretbarem Risiko."}
            onClick={() => setActiveDrilldown("recommendation")}
          />
        </section>

        {/* ── Right: Compact Previews ── */}
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          {/* Prognose */}
          <RightPreviewCard title="Prognose · 30 Tage" to="/forecast">
            <div style={{ display: "grid", gap: 8 }}>
              {forecastItems.map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", fontWeight: 500 }}>{item.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18, color: item.up ? "#16a34a" : "#dc2626" }}>{item.trend}</span>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: item.up ? "#16a34a" : "#dc2626" }}>{item.pct}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: "11px", color: "var(--c-text-4)" }}>Vollständige Prognose mit Szenarien →</div>
          </RightPreviewCard>

          {/* Marktvergleich */}
          <RightPreviewCard title="Marktvergleich" to="/forecast">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: marketColor, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--text-md)", fontWeight: 700, color: marketColor }}>{marketStatus}</span>
            </div>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "10px 0 0", lineHeight: 1.5 }}>
              {kpiUp ? `${dashboard.topChange.metric_label} entwickelt sich besser als der Branchendurchschnitt.` : `${dashboard.topCritical.metric_label} liegt unter dem Branchendurchschnitt — Aufholpotenzial erkennbar.`}
            </p>
            <div style={{ marginTop: 10, fontSize: "11px", color: "var(--c-text-4)" }}>Benchmark & Wettbewerb →</div>
          </RightPreviewCard>

          {/* Benchmark */}
          <RightPreviewCard title="Benchmark" to="/forecast">
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { label: "vs. Vormonat", value: `${kpiDelta}`, up: kpiUp },
                { label: "vs. Vorjahr",  value: `${dashboard.trendWindows[3].value > 0 ? "+" : ""}${dashboard.trendWindows[3].value}%`, up: dashboard.trendWindows[3].value >= 0 },
                { label: "vs. Ziel",     value: dashboard.topTask ? "In Arbeit" : "Offen", up: !!dashboard.topTask },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{row.label}</span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: row.up ? "#16a34a" : "#dc2626" }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: "11px", color: "var(--c-text-4)" }}>Vollständige Analyse →</div>
          </RightPreviewCard>

          {/* Analyse-Briefing (compact) */}
          <div style={{ padding: "var(--s-4)", background: "var(--c-surface-2)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Analyse-Briefing</div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { label: "Lage",     text: dashboard.statusText },
                { label: "Ursache",  text: dashboard.whyText },
                { label: "Nächster Schritt", text: dashboard.nextStepText },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.55 }}>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Drilldown Panel ── */}
      {activeDrilldown && (
        <DrilldownPanel
          type={activeDrilldown}
          dashboard={dashboard}
          profile={profile}
          onClose={() => setActiveDrilldown(null)}
        />
      )}
    </div>
  );
}
