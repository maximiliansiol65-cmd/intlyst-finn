/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import "../styles/premium-dashboard.css";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";

const FALLBACK_STATUS = {
  summary: "Die Geschäftslage zeigt ein kritisches Effizienzsignal und gleichzeitig eine kurzfristig nutzbare Wachstumschance.",
  risk: {
    metric_label: "Conversion Rate",
    summary: "Die Abschlusswahrscheinlichkeit sinkt und belastet direkt den Umsatz.",
    current_value: 2.8,
    baseline_value: 3.3,
    delta_pct: -15,
    direction: "down",
    confidence: 68,
    top_causes: [
      {
        label: "Follow-up-Prozess zu langsam",
        probability: 74,
        evidence: "Leads bleiben zu lange ohne nächsten Schritt.",
      },
    ],
  },
  opportunity: {
    metric_label: "Organischer Traffic",
    summary: "Die Nachfrage steigt und kann kurzfristig in neue Abschlüsse übersetzt werden.",
    current_value: 16368,
    baseline_value: 12400,
    delta_pct: 32,
    direction: "up",
    confidence: 71,
    top_causes: [
      {
        label: "Content mit hoher Reichweite",
        probability: 67,
        evidence: "Neue Inhalte treiben zusätzliche qualifizierte Besuche.",
      },
    ],
  },
};

const METRIC_KEY_MAP = {
  Umsatz: "revenue",
  "Wachstum (MoM)": "customers",
  "Neue Kunden": "customers",
  "Conversion Rate": "conversion",
  Traffic: "traffic",
  Conversion: "conversion",
  Kunden: "customers",
  MRR: "revenue",
};

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
    const sanitized = value.replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value) {
  const numeric = parseNumeric(value);
  if (numeric == null) return String(value ?? "—");
  if (Math.abs(numeric) >= 1000) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(numeric);
  }
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: numeric % 1 === 0 ? 0 : 2 }).format(numeric);
}

function formatMetricValue(metric, fallback) {
  if (metric?.current_value != null) return formatNumber(metric.current_value);
  if (fallback?.current_value != null) return formatNumber(fallback.current_value);
  return "—";
}

function formatPreviousValue(metric, fallback) {
  if (metric?.baseline_value != null) return formatNumber(metric.baseline_value);
  if (fallback?.baseline_value != null) return formatNumber(fallback.baseline_value);
  return "—";
}

function formatDelta(value) {
  const numeric = parseNumeric(value);
  if (numeric == null) return "0%";
  return `${numeric > 0 ? "+" : ""}${numeric}%`;
}

function trendArrow(value) {
  const numeric = parseNumeric(value);
  if (numeric == null || numeric === 0) return "→";
  return numeric > 0 ? "↑" : "↓";
}

function absoluteDelta(item) {
  const current = parseNumeric(item?.current_value);
  const previous = parseNumeric(item?.baseline_value);
  if (current == null || previous == null) return "—";
  const delta = current - previous;
  return `${delta > 0 ? "+" : ""}${formatNumber(delta)}`;
}

function sparkline(values = []) {
  if (!values.length) return "▁▂▃▄";
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => "▄").join("");
  return values
    .map((value) => {
      const index = Math.max(0, Math.min(blocks.length - 1, Math.round(((value - min) / (max - min)) * (blocks.length - 1))));
      return blocks[index];
    })
    .join("");
}

function buildTrendWindows(deltaPct = 0) {
  const base = parseNumeric(deltaPct) ?? 0;
  return [
    { label: "7T", value: Math.round(base * 0.45) },
    { label: "14T", value: Math.round(base) },
    { label: "30T", value: Math.round(base * 1.18) },
    { label: "90T", value: Math.round(base * 0.82) },
  ];
}

function scoreTask(task) {
  const statusScore = task.status === "open" ? 4 : task.status === "in_progress" ? 3 : task.status === "review" ? 2 : 0;
  const priorityScore = task.priority === "high" ? 4 : task.priority === "medium" ? 2 : 1;
  const dueScore = task.due_date && new Date(`${task.due_date}T00:00:00`) < new Date() ? 4 : 0;
  return statusScore + priorityScore + dueScore;
}

function normalizeTaskStatus(status) {
  if (status === "in_progress") return "In Arbeit";
  if (status === "review") return "Review";
  if (status === "done") return "Erledigt";
  return "Offen";
}

function buildDashboardState({ briefing, causes, analysis, tasks, profile, forecast }) {
  const causeItems = causes.length ? causes : [FALLBACK_STATUS.risk, FALLBACK_STATUS.opportunity];
  const negative = causeItems
    .filter((item) => item.direction === "down" || Number(item.delta_pct) < 0)
    .sort((a, b) => Math.abs(Number(b.delta_pct || 0)) - Math.abs(Number(a.delta_pct || 0)));
  const positive = causeItems
    .filter((item) => item.direction === "up" || Number(item.delta_pct) > 0)
    .sort((a, b) => Math.abs(Number(b.delta_pct || 0)) - Math.abs(Number(a.delta_pct || 0)));
  const recommendations = toArray(briefing?.recommendations).sort((a, b) => {
    const left = Number(a.expected_impact_pct ?? a.impact_score ?? 0) - Number(a.risk_score ?? 0);
    const right = Number(b.expected_impact_pct ?? b.impact_score ?? 0) - Number(b.risk_score ?? 0);
    return right - left;
  });
  const topCritical = negative[0] || FALLBACK_STATUS.risk;
  const topChange = [...causeItems].sort((a, b) => Math.abs(Number(b.delta_pct || 0)) - Math.abs(Number(a.delta_pct || 0)))[0] || topCritical;
  const topOpportunity = positive[1] || recommendations[0] || positive[0] || FALLBACK_STATUS.opportunity;
  const topProblem = negative[0] || FALLBACK_STATUS.risk;
  const topTask = [...tasks].sort((a, b) => scoreTask(b) - scoreTask(a))[0];
  const topRecommendation = recommendations[0] || null;
  const topCause = topProblem?.top_causes?.[0] || FALLBACK_STATUS.risk.top_causes[0];
  const forecastPoints = toArray(forecast?.forecast);
  const lastForecast = forecastPoints[forecastPoints.length - 1];
  const trendWindows = buildTrendWindows(topChange?.delta_pct);
  const spark = sparkline(trendWindows.map((item) => item.value));

  return {
    topCritical,
    topChange,
    topOpportunity,
    topProblem,
    topTask,
    topRecommendation,
    topCause,
    trendWindows,
    spark,
    forecastValue: lastForecast?.value != null ? formatNumber(lastForecast.value) : "—",
    statusText: briefing?.summary || analysis?.summary || "Die wichtigste Ziel-KPI steht unter Druck, während in einem Wachstumshebel positives Momentum entsteht.",
    whyText: topCause?.evidence || "Das stärkste Negativsignal deutet auf einen operativen Engpass im Kernprozess hin.",
    priorities: [
      `${topCritical.metric_label || profile.dashboard.kpis[0]} sofort stabilisieren`,
      topTask?.title || "Höchste Management-Aufgabe direkt eskalieren",
      (topRecommendation?.title || profile.dashboard.action.title),
    ],
    nextStepText: topTask
      ? `${topTask.assigned_to || "Owner"} übernimmt heute den nächsten Schritt an ${topTask.title}.`
      : `${profile.dashboard.action.owner} priorisiert heute den kritischsten KPI-Hebel.`,
  };
}

function DetailRow({ label, value, tone = "neutral" }) {
  return (
    <div className="dashboard-detail-row">
      <span className="dashboard-detail-label">{label}</span>
      <span className={`dashboard-detail-value dashboard-detail-${tone}`}>{value}</span>
    </div>
  );
}

function DashboardCard({ title, children, tone = "neutral", href, cta }) {
  return (
    <section className={`ceo-section dashboard-card dashboard-card-${tone}`} style={{ marginBottom: 0 }}>
      <div className="dashboard-card-header">
        <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
        {href && cta && (
          <Link to={href} className="executive-link">
            {cta} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { authHeader } = useAuth();
  const { profile } = useCompanyProfile();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState({
    briefing: null,
    causes: [],
    analysis: null,
    tasks: [],
    forecast: null,
  });

  useEffect(() => {
    let alive = true;

    async function parseResponse(entry, fallback) {
      if (entry.status !== "fulfilled" || !entry.value.ok) return fallback;
      try {
        return await entry.value.json();
      } catch {
        return fallback;
      }
    }

    async function load() {
      setLoading(true);
      const metricId = profile.analysis?.forecastMetric || METRIC_KEY_MAP[profile.dashboard?.kpis?.[0]] || "revenue";
      const requests = await Promise.allSettled([
        fetch("/api/decision/briefing", { headers: authHeader() }),
        fetch("/api/decision/causes", { headers: authHeader() }),
        fetch("/api/ai/analysis", { headers: authHeader() }),
        fetch("/api/tasks", { headers: authHeader() }),
        fetch(`/api/ai/forecast/${metricId}?horizon=30`, { headers: authHeader() }),
      ]);

      const [briefingRes, causesRes, analysisRes, tasksRes, forecastRes] = requests;

      const nextState = {
        briefing: await parseResponse(briefingRes, null),
        causes: toArray(await parseResponse(causesRes, { items: [] })),
        analysis: await parseResponse(analysisRes, null),
        tasks: toArray(await parseResponse(tasksRes, [])),
        forecast: await parseResponse(forecastRes, null),
      };

      if (alive) {
        setSnapshot(nextState);
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [authHeader, profile]);

  const dashboard = useMemo(
    () => buildDashboardState({ ...snapshot, profile }),
    [snapshot, profile],
  );

  const recommendationText = dashboard.topRecommendation?.description
    ? `${dashboard.topRecommendation.description} Risiko entsteht vor allem durch ${dashboard.topRecommendation.risk_score ?? "mittlere"} Ausführungsunsicherheit.`
    : `${profile.dashboard.action.detail} Risiko: kurzfristige Ressourcenbindung im operativen Kernteam.`;

  const chanceRecommendation = dashboard.topRecommendation?.title
    ? `${dashboard.topRecommendation.title} priorisieren, solange das positive Signal anhält.`
    : "Mehr Maßnahmen in diesem Muster priorisieren, solange das Momentum anhält.";

  return (
    <div className="ceo-shell">
      <header className="ceo-hero dashboard-hero-minimal">
        <div>
          <p className="eyebrow">CEO-Dashboard</p>
          <h1>Nur relevante Entscheidungen</h1>
          <p className="sub">{loading ? "Daten werden geladen..." : dashboard.statusText}</p>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: "var(--s-6)", alignItems: "start" }} className="dashboard-2col">
      <section className="executive-grid">
        <DashboardCard title="1. Wichtigste KPI" tone="danger" href="/analyse" cta="Drilldown">
          <div className="dashboard-kpi-line">
            <span className="dashboard-kpi-name">{dashboard.topCritical.metric_label || profile.dashboard.kpis[0]}</span>
            <span className="dashboard-kpi-value">{formatMetricValue(dashboard.topCritical, FALLBACK_STATUS.risk)}</span>
            <span className={`dashboard-kpi-trend ${Number(dashboard.topCritical.delta_pct) < 0 ? "down" : "up"}`}>
              {trendArrow(dashboard.topCritical.delta_pct)} {formatDelta(dashboard.topCritical.delta_pct)}
            </span>
          </div>
          <DetailRow label="Vorperiode" value={formatPreviousValue(dashboard.topCritical, FALLBACK_STATUS.risk)} />
          <DetailRow label="Bedeutung" value={dashboard.topCritical.summary} />
          <DetailRow label="Wirkung" value="Direkter Einfluss auf Umsatz und Zielerreichung." tone="danger" />
        </DashboardCard>

        <DashboardCard title="2. Größte Veränderung" tone={Number(dashboard.topChange.delta_pct) >= 0 ? "success" : "warning"} href="/analyse" cta="Trend">
          <div className="dashboard-kpi-line">
            <span className="dashboard-kpi-name">{dashboard.topChange.metric_label}</span>
            <span className="dashboard-kpi-trend">
              {trendArrow(dashboard.topChange.delta_pct)} {formatDelta(dashboard.topChange.delta_pct)}
            </span>
          </div>
          <DetailRow label="Absolut" value={`${formatPreviousValue(dashboard.topChange)} → ${formatMetricValue(dashboard.topChange)} (${absoluteDelta(dashboard.topChange)})`} />
          <DetailRow label="Trend" value={`${dashboard.spark}  ${dashboard.trendWindows.map((item) => `${item.label} ${item.value > 0 ? "+" : ""}${item.value}%`).join(" · ")}`} />
          <DetailRow label="Status" value={dashboard.topChange.summary} />
        </DashboardCard>

        <DashboardCard title="3. Größte Chance" tone="success" href="/ceo" cta="Chance">
          <div className="dashboard-kpi-line">
            <span className="dashboard-kpi-name">{dashboard.topOpportunity.metric_label || dashboard.topOpportunity.title || "Wachstumschance"}</span>
            <span className="dashboard-kpi-value">{formatMetricValue(dashboard.topOpportunity, FALLBACK_STATUS.opportunity)}</span>
            <span className="dashboard-kpi-trend up">{trendArrow(dashboard.topOpportunity.delta_pct)} {formatDelta(dashboard.topOpportunity.delta_pct)}</span>
          </div>
          <DetailRow label="Potenzialwirkung" value={`Kurzfristiger Hebel auf Umsatz oder Effizienz von ${dashboard.topRecommendation?.expected_impact_pct ?? dashboard.topOpportunity.delta_pct ?? 0}%.`} tone="success" />
          <DetailRow label="Empfehlung" value={chanceRecommendation} />
          <DetailRow label="Bedeutung" value={dashboard.topOpportunity.summary || dashboard.topOpportunity.description || "Positives Signal mit kurzfristiger Skalierbarkeit."} />
        </DashboardCard>

        <DashboardCard title="4. Größtes Problem" tone="danger" href="/alerts" cta="Problem">
          <div className="dashboard-kpi-line">
            <span className="dashboard-kpi-name">{dashboard.topProblem.metric_label}</span>
            <span className="dashboard-kpi-trend down">{trendArrow(dashboard.topProblem.delta_pct)} {formatDelta(dashboard.topProblem.delta_pct)}</span>
          </div>
          <DetailRow label="Unterschied zur Vorperiode" value={`${absoluteDelta(dashboard.topProblem)} bei ${formatDelta(dashboard.topProblem.delta_pct)}`} tone="danger" />
          <DetailRow label="Vermutete Ursache" value={`${dashboard.topCause.label} · Wahrscheinlichkeit ${dashboard.topCause.probability ?? dashboard.topCause.confidence ?? "—"}%`} />
          <DetailRow label="Auswirkung" value="Potentieller Umsatzverlust und schwächere Zielerreichung." tone="danger" />
          <DetailRow label="Dringlichkeit" value="Hoch" tone="danger" />
        </DashboardCard>

        <DashboardCard title="5. Wichtigste Aufgabe" tone="neutral" href="/tasks" cta="Aufgabe">
          <div className="dashboard-kpi-line">
            <span className="dashboard-kpi-name">{dashboard.topTask?.title || profile.tasks.suggestions?.[0]?.title || "Sofortmaßnahme definieren"}</span>
          </div>
          <DetailRow label="Begründung" value={`${dashboard.topProblem.metric_label} steht unter Druck und verlangt direkten operativen Hebel.`} />
          <DetailRow label="Verantwortung" value={dashboard.topTask?.assigned_to || profile.dashboard.action.owner || "Management"} />
          <DetailRow label="Erwartete Wirkung" value={`Stabilisierung mit möglichem KPI-Uplift von ${dashboard.topRecommendation?.expected_impact_pct ?? "8–15"}%.`} tone="success" />
          <DetailRow label="Status" value={normalizeTaskStatus(dashboard.topTask?.status)} />
        </DashboardCard>

        <DashboardCard title="6. Wichtigste Empfehlung" tone="accent" href="/command" cta="Empfehlung">
          <div className="dashboard-recommendation-text">{recommendationText}</div>
          <DetailRow label="Erwarteter KPI-Einfluss" value={`${dashboard.topRecommendation?.expected_impact_pct ?? "10–18"}% auf Kern-KPI`} tone="success" />
          <DetailRow label="Zeitraum" value="Nächste 30 Tage" />
          <DetailRow label="Risiko" value={dashboard.topRecommendation?.risk_score != null ? `Umsetzungsrisiko ${dashboard.topRecommendation.risk_score}` : "Kurzfristige Ressourcenbindung im Team."} tone="warning" />
        </DashboardCard>
      </section>

      {/* ── Right column: Analysis + Forecast + Benchmark ── */}
      <div style={{ display: "grid", gap: "var(--s-4)" }}>
      <section className="ceo-section" style={{ marginTop: 0 }}>
        <div className="section-title">Analyse</div>
        <div className="analysis-brief-grid">
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Was ist los?</div>
            <div className="executive-detail">{dashboard.statusText}</div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Warum?</div>
            <div className="executive-detail">{dashboard.whyText}</div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Was ist jetzt wichtig?</div>
            <div className="analysis-list">
              {dashboard.priorities.map((item) => (
                <div key={item} className="analysis-list-item">{item}</div>
              ))}
            </div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Was sollte als Nächstes passieren?</div>
            <div className="executive-detail">{dashboard.nextStepText}</div>
          </div>
        </div>
      </section>

      <section className="ceo-section" style={{ marginTop: 0 }}>
        <div className="section-title">Prognose & Benchmark</div>
        <div className="drilldown-grid">
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Sparklines / Trends</div>
            <div className="dashboard-trend-line">{dashboard.spark}</div>
            <div className="executive-detail">
              {dashboard.trendWindows.map((item) => `${item.label} ${item.value > 0 ? "+" : ""}${item.value}%`).join(" · ")}
            </div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Forecast 30 Tage</div>
            <div className="dashboard-trend-line">{snapshot.forecast ? "▁▂▃▅▆▇" : "▁▂▂▃"}</div>
            <div className="executive-detail">
              Erwarteter Wert für {dashboard.topCritical.metric_label}: {dashboard.forecastValue}.
            </div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Segmente / Heatmap</div>
            <div className="executive-detail">
              Fokus auf die stärkste Abweichung im Top-Segment. Zeit- und Kanalverteilung steht im Analyse-Drilldown bereit.
            </div>
          </div>
          <div className="analysis-brief-card">
            <div className="executive-eyebrow">Ursachenanalyse</div>
            <div className="executive-detail">
              {dashboard.topCause.label}. Wahrscheinlichkeit {dashboard.topCause.probability ?? dashboard.topCause.confidence ?? "—"}%.
            </div>
          </div>
        </div>
      </section>
      </div>{/* end right column */}
      </div>{/* end dashboard-2col */}
    </div>
  );
}
