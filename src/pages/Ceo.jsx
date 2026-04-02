/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";
import { PriorityLegend } from "../components/ui";
import "../styles/premium-dashboard.css";

// ─── Industry Benchmarks (Punkt 8: Benchmarking & Vergleich) ──────────────────
const INDUSTRY_BENCHMARKS = {
  finance_cfo: [
    { kpi: "Cash Conversion",      avg: 82,   top: 108, unit: "%",      lower_is_better: false },
    { kpi: "Gross Margin",         avg: 38,   top: 56,  unit: "%",      lower_is_better: false },
    { kpi: "Opex Quote",           avg: 29,   top: 18,  unit: "%",      lower_is_better: true  },
    { kpi: "ROI",                  avg: 2.6,  top: 5.4, unit: "x",      lower_is_better: false },
    { kpi: "Liquiditätsreserve",  avg: 2.1,  top: 5.0, unit: "Monate", lower_is_better: false },
  ],
  management_ceo: [
    { kpi: "Conversion Rate",      avg: 2.8,  top: 4.5,  unit: "%",       lower_is_better: false },
    { kpi: "Umsatzwachstum",        avg: 8,    top: 18,   unit: "%/Jahr",  lower_is_better: false },
    { kpi: "Team-Effizienz",        avg: 71,   top: 88,   unit: "%",       lower_is_better: false },
    { kpi: "NPS",                   avg: 32,   top: 58,   unit: "Pkt.",    lower_is_better: false },
    { kpi: "EBITDA Marge",          avg: 14,   top: 26,   unit: "%",       lower_is_better: false },
  ],
  startup: [
    { kpi: "MoM Wachstum",         avg: 7,    top: 20,   unit: "%",       lower_is_better: false },
    { kpi: "Retention (M1)",        avg: 40,   top: 65,   unit: "%",       lower_is_better: false },
    { kpi: "Activation Rate",       avg: 35,   top: 60,   unit: "%",       lower_is_better: false },
    { kpi: "CAC",                   avg: 95,   top: 38,   unit: "€",       lower_is_better: true  },
    { kpi: "LTV/CAC",               avg: 3.1,  top: 6.5,  unit: "x",       lower_is_better: false },
  ],
  agency: [
    { kpi: "Auslastung",            avg: 72,   top: 86,   unit: "%",       lower_is_better: false },
    { kpi: "Projektmarge",          avg: 28,   top: 44,   unit: "%",       lower_is_better: false },
    { kpi: "Kundenbindung",         avg: 68,   top: 85,   unit: "%",       lower_is_better: false },
    { kpi: "Ø Projektlaufzeit",     avg: 42,   top: 28,   unit: "Tage",    lower_is_better: true  },
  ],
  marketing_team: [
    { kpi: "Marketing ROI",         avg: 4.2,  top: 7.8,  unit: "x",       lower_is_better: false },
    { kpi: "CPL",                   avg: 58,   top: 28,   unit: "€",       lower_is_better: true  },
    { kpi: "Engagement Rate",       avg: 3.1,  top: 6.4,  unit: "%",       lower_is_better: false },
    { kpi: "Reichweite",            avg: 118,  top: 185,  unit: "Idx",     lower_is_better: false },
    { kpi: "Lead-zu-Kunde",         avg: 12,   top: 22,   unit: "%",       lower_is_better: false },
  ],
  sales_team: [
    { kpi: "Abschlussquote",        avg: 22,   top: 38,   unit: "%",       lower_is_better: false },
    { kpi: "Sales Cycle",           avg: 28,   top: 15,   unit: "Tage",    lower_is_better: true  },
    { kpi: "Lead-Qualität",         avg: 3.2,  top: 4.8,  unit: "/5",      lower_is_better: false },
    { kpi: "Follow-up Rate",        avg: 58,   top: 82,   unit: "%",       lower_is_better: false },
  ],
  midsize: [
    { kpi: "Team-Effizienz",        avg: 68,   top: 84,   unit: "%",       lower_is_better: false },
    { kpi: "EBITDA Marge",          avg: 12,   top: 22,   unit: "%",       lower_is_better: false },
    { kpi: "Kundenzufriedenheit",   avg: 3.8,  top: 4.6,  unit: "/5",      lower_is_better: false },
    { kpi: "Prozesseffizienz",      avg: 65,   top: 82,   unit: "%",       lower_is_better: false },
  ],
  small_business: [
    { kpi: "Conversion Rate",       avg: 2.1,  top: 3.8,  unit: "%",       lower_is_better: false },
    { kpi: "Wiederkaufrate",         avg: 28,   top: 48,   unit: "%",       lower_is_better: false },
    { kpi: "Kundenzufriedenheit",   avg: 3.7,  top: 4.5,  unit: "/5",      lower_is_better: false },
    { kpi: "Umsatzwachstum",        avg: 5,    top: 12,   unit: "%/Jahr",  lower_is_better: false },
  ],
  content_team: [
    { kpi: "Engagement Rate",       avg: 3.2,  top: 6.8,  unit: "%",       lower_is_better: false },
    { kpi: "Reichweite/Post",        avg: 1200, top: 4500, unit: "Pers.",   lower_is_better: false },
    { kpi: "Video-Completion",      avg: 42,   top: 65,   unit: "%",       lower_is_better: false },
    { kpi: "Social CTR",            avg: 1.1,  top: 2.6,  unit: "%",       lower_is_better: false },
  ],
  service_provider: [
    { kpi: "Anfrage-Abschlussquote",avg: 35,   top: 58,   unit: "%",       lower_is_better: false },
    { kpi: "Auslastung",            avg: 68,   top: 85,   unit: "%",       lower_is_better: false },
    { kpi: "Kundenzufriedenheit",   avg: 4.0,  top: 4.7,  unit: "/5",      lower_is_better: false },
    { kpi: "Reaktionszeit",         avg: 6,    top: 2,    unit: "h",       lower_is_better: true  },
  ],
};

// ─── Rollen-Framing (Punkt 2 & 3: Rolle & Branche) ────────────────────────────
const ROLE_FRAMING = {
  finance_cfo: {
    greeting:      "Finanzlage und Steuerung",
    subtitle:      "Cashflow, Budgetdisziplin, Margen und wirtschaftliche Risiken auf einen Blick",
    priority_q:    "Welche Entscheidung verbessert Liquidität, Rentabilität oder Kapitalallokation am stärksten?",
    lens:          "Cashflow · Umsatz · Kosten · Marge · ROI · Liquidität",
    advisory_note: "Als CFO priorisierst du finanzielle Stabilität und Kapitalrendite. Entscheidungen sollten auf KPI-Wirkung, Risiko und Liquiditätseffekt abgestimmt sein.",
  },
  management_ceo: {
    greeting:      "Strategische Lageeinschätzung",
    subtitle:      "Risiken, Chancen und Handlungsempfehlungen auf Unternehmensebene",
    priority_q:    "Was hat heute die größte Hebelwirkung auf Wachstum und Effizienz?",
    lens:          "Umsatz · Wachstum · Team-Performance · strategische Risiken",
    advisory_note: "Als CEO brauchst du Signale, die Entscheidungen auf Unternehmensebene ermöglichen. Fokus auf die 1–2 Hebel mit der größten Wirkung auf Wachstum und Stabilität.",
  },
  startup: {
    greeting:      "Wachstumslage deines Startups",
    subtitle:      "Momentum, Traktion und Skalierungsengpässe im Fokus",
    priority_q:    "Wo verlierst du gerade Wachstumspotenzial und was bremst Traktion?",
    lens:          "Activation · Retention · Conversion · Burn Rate",
    advisory_note: "Startups haben begrenzte Ressourcen — jede Maßnahme sollte auf Wachstumsmetriken einzahlen. Priorisiere Experimente mit hohem Learning-Wert.",
  },
  agency: {
    greeting:      "Agentur-Lagebericht",
    subtitle:      "Auslastung, Delivery-Qualität und Kundenprofitabilität",
    priority_q:    "Welches Risiko im Kundenportfolio braucht sofortige Aufmerksamkeit?",
    lens:          "Kapazität · Projektmarge · Kundenbindung · Ressourcen",
    advisory_note: "Agenturen profitieren am meisten davon, Auslastungsrisiken früh zu erkennen und profitable Kundenbeziehungen aktiv zu pflegen.",
  },
  marketing_team: {
    greeting:      "CMO-Strategie- und Performance-Review",
    subtitle:      "Marketingstrategie, Kampagnen, Content und Budget-Allokation mit KPI-Fokus",
    priority_q:    "Welche Kampagne, welches Content-Thema und welcher Kanal liefern jetzt den höchsten Marketing-ROI?",
    lens:          "ROI · Traffic · Leads · Conversion · Engagement · Reichweite",
    advisory_note: "Als CMO steuerst du nicht nur Kanäle, sondern Wirkung. Priorisiere Massnahmen nach ROI, Unternehmenszielen und der Frage, welcher Mix aus Content, Budget und Timing den stärksten Business-Impact erzeugt.",
  },
  sales_team: {
    greeting:      "Vertriebs-Pipeline-Analyse",
    subtitle:      "Leads, Abschlüsse und Pipeline-Gesundheit",
    priority_q:    "Welche Deals können diese Woche oder im nächsten Monat abgeschlossen werden?",
    lens:          "Lead-Qualität · Abschlussquote · Sales Cycle · Pipeline-Wert",
    advisory_note: "Vertriebseffizienz entsteht durch Fokus auf die richtige Pipeline. Identifiziere stagnierende Deals frühzeitig und reaktiviere warme Kontakte systematisch.",
  },
  midsize: {
    greeting:      "Management-Lageüberblick",
    subtitle:      "Bereichsübergreifende Effizienz, Engpässe und Chancen",
    priority_q:    "Wo entstehen aktuell die größten Reibungsverluste zwischen Teams?",
    lens:          "Effizienz · Prozesse · Cross-Team-KPIs · Profitabilität",
    advisory_note: "Im Mittelstand entstehen die meisten Verluste in Team-Übergaben und Prozessbrüchen. Systematische Transparenz über Bereiche hinweg ist der wichtigste Hebel.",
  },
  small_business: {
    greeting:      "Unternehmenslage kompakt",
    subtitle:      "Direkte Umsatz- und Kundenhebel für schnelle Entscheidungen",
    priority_q:    "Was bringt heute direkt Ertrag oder mehr Kunden?",
    lens:          "Umsatz · Kunden · Auslastung · Cashflow",
    advisory_note: "Kleine Unternehmen gewinnen durch konsequenten Fokus auf das Wesentliche: Kundenkontakt, Stammkunden und den einen umsatzstärksten Kanal.",
  },
  content_team: {
    greeting:      "Content-Performance-Analyse",
    subtitle:      "Reichweite, Engagement und Formate mit der größten Wirkung",
    priority_q:    "Welche Inhalte sollen verdoppelt werden — welche gestoppt?",
    lens:          "Engagement · Reichweite · Distribution · Content-ROI",
    advisory_note: "Content-Erfolg folgt dem Pareto-Prinzip: 20% der Inhalte erzeugen 80% der Wirkung. Identifiziere diese und repliziere systematisch.",
  },
};

// ─── Prioritäts-Konfiguration (Punkt 4: Priorisierung) ────────────────────────
const PRIO = {
  critical: { label: "Kritisch",  color: "#b91c1c", bg: "#fff1f2", order: 1 },
  high:     { label: "Hoch",      color: "#c2410c", bg: "#fff7ed", order: 2 },
  medium:   { label: "Mittel",    color: "#0369a1", bg: "#f0f9ff", order: 3 },
  low:      { label: "Niedrig",   color: "#475569", bg: "#f8fafc", order: 4 },
};

// ─── Tabs ──────────────────────────────────────────────────────────────────────
const MAIN_TABS = [
  { id: "beratung",     label: "Handlungsempfehlungen", emoji: "🎯" },
  { id: "ursachen",     label: "Ursachenbäume",          emoji: "🌳" },
  { id: "benchmarks",   label: "Benchmarking",            emoji: "📊" },
  { id: "lernhistorie", label: "Lernhistorie",            emoji: "🧠" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function sortedRecos(recs) {
  return [...(recs || [])].sort((a, b) => {
    const oa = PRIO[a.priority]?.order ?? 9;
    const ob = PRIO[b.priority]?.order ?? 9;
    if (oa !== ob) return oa - ob;
    return (b.impact_score || 0) - (a.impact_score || 0);
  });
}

// ─── Benchmark-Balken (Punkt 8) ───────────────────────────────────────────────
function BenchmarkBar({ label, avg, top, unit, lower_is_better }) {
  const maxVal = lower_is_better ? avg * 1.6 : top * 1.2;
  const pctAvg = Math.min(100, (avg / maxVal) * 100);
  const pctTop = Math.min(100, (top / maxVal) * 100);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{label}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>
            ∅ {avg} {unit}
          </span>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
            Top: {top} {unit}
          </span>
        </div>
      </div>
      <div style={{ position: "relative", height: 10, background: "#f1f5f9", borderRadius: 5 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pctAvg}%`, background: "#94a3b8", borderRadius: 5 }} />
        <div style={{ position: "absolute", top: -2, bottom: -2, left: `${pctAvg}%`, width: 2, background: "#475569" }} />
        <div style={{ position: "absolute", top: -2, bottom: -2, left: `${pctTop}%`, width: 2, background: "#15803d" }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#94a3b8" }}>
        <span>Branche ∅: {avg} {unit}</span>
        <span style={{ color: "#15803d" }}>Top 20%: {top} {unit}</span>
        {lower_is_better && <span>· Niedrigerer Wert = besser</span>}
      </div>
    </div>
  );
}

// ─── Advisory-Empfehlungskarte (Punkte 2, 4, 5, 7) ────────────────────────────
function RecommendationAdvisoryCard({ item, profileId, profile }) {
  const [expanded, setExpanded] = useState(false);
  const prio    = PRIO[item.priority] || PRIO.medium;
  const framing = ROLE_FRAMING[profileId] || ROLE_FRAMING.management_ceo;
  const topLens = framing.lens.split(" · ")[0];

  return (
    <div style={{
      border:       `1px solid ${prio.color}33`,
      borderLeft:   `4px solid ${prio.color}`,
      borderRadius: 12,
      overflow:     "hidden",
      background:   "#fff",
    }}>
      {/* Klappbarer Header */}
      <div style={{ padding: "16px 20px", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: prio.bg, color: prio.color, fontWeight: 700 }}>
                {prio.label}
              </span>
              {item.category && (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>
                  {item.category}
                </span>
              )}
              {item.owner_role && (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                  Owner: {item.owner_role}
                </span>
              )}
              {item.roi_label && (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>
                  ROI {item.roi_label}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{item.title}</div>
            <div style={{ marginTop: 5, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{item.description}</div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              {item.expected_impact_pct != null && (
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#0f172a" }}>+{item.expected_impact_pct}%</strong> erwarteter Impact
                </span>
              )}
              {item.estimated_hours != null && (
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#0f172a" }}>{item.estimated_hours}h</strong> Aufwand
                </span>
              )}
              {item.risk_score != null && (
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Risiko:{" "}
                  <strong style={{ color: item.risk_score > 6 ? "#dc2626" : item.risk_score > 3 ? "#d97706" : "#15803d" }}>
                    {item.risk_score}/10
                  </strong>
                </span>
              )}
            </div>
          </div>
          <span style={{ color: "#94a3b8", fontSize: 13, flexShrink: 0, marginTop: 2 }}>
            {expanded ? "↑" : "↓"}
          </span>
        </div>
      </div>

      {/* Ausgeklappte Detailanalyse */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 20px", background: "#fafafa", display: "grid", gap: 16 }}>

          {/* Begründung (Punkt 7) */}
          {item.rationale && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>
                Warum diese Maßnahme?
              </div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, padding: "12px 14px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                {item.rationale}
              </div>
            </div>
          )}

          {/* Betroffene KPIs (Punkt 1) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>
              Betroffene KPIs
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[item.category, ...(item.related_kpis || [])].filter(Boolean).map((kpi) => (
                <span key={kpi} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6", fontWeight: 600 }}>
                  {kpi}
                </span>
              ))}
            </div>
          </div>

          {/* Umsetzungsschritte */}
          {item.execution_plan?.rollout_steps?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>
                Schritte zur Umsetzung
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {item.execution_plan.rollout_steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#334155" }}>
                    <span style={{
                      flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                      background: "#f1f5f9", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 11, fontWeight: 700,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ lineHeight: 1.6 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projektionswerte */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            {[
              { label: "Erwarteter Impact", value: item.expected_impact_pct != null ? `+${item.expected_impact_pct}%` : null },
              { label: "Neue Kunden",       value: item.expected_new_customers || null },
              { label: "Reichweite +",      value: item.expected_reach_uplift_pct != null ? `+${item.expected_reach_uplift_pct}%` : null },
              { label: "Aufwand",           value: item.estimated_hours != null ? `${item.estimated_hours}h` : null },
              { label: "Risiko",            value: item.risk_score != null ? `${item.risk_score}/10` : null },
            ].filter(m => m.value != null).map((m) => (
              <div key={m.label} style={{ padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Rollenspezifischer Beratungshinweis (Punkte 2 & 3) */}
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "#eff6ff", border: "1px solid #dbeafe" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 5 }}>
              Beratungshinweis für {profile.label}
            </div>
            <div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.7 }}>
              Diese Maßnahme ist besonders relevant für deinen Fokus auf <em>{topLens}</em>.{" "}
              {item.expected_impact_pct > 10
                ? "Der erwartete Impact ist überdurchschnittlich hoch — frühzeitige Umsetzung wird empfohlen."
                : "Plane die Umsetzung in deiner nächsten Planungsrunde ein und weise einen klaren Owner zu."}
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/command" style={{
              padding: "8px 16px", borderRadius: 8, background: "#0f172a", color: "#fff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}>
              Maßnahme planen →
            </Link>
            <Link to="/tasks" style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0",
              background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}>
              Als Aufgabe erfassen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hauptkomponente ───────────────────────────────────────────────────────────
export default function Ceo() {
  const { authHeader }          = useAuth();
  const { profile, profileId }  = useCompanyProfile();

  const [tab, setTab]                   = useState("beratung");
  const [briefing, setBriefing]         = useState(null);
  const [causeOverview, setCauseOverview] = useState(null);
  const [learning, setLearning]         = useState(null);
  const [outcomes, setOutcomes]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  const [showAllRecos, setShowAllRecos] = useState(false);

  const framing    = ROLE_FRAMING[profileId]        || ROLE_FRAMING.management_ceo;
  const benchmarks = INDUSTRY_BENCHMARKS[profileId] || INDUSTRY_BENCHMARKS.management_ceo;

  // Daten laden
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/decision/briefing", { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch("/api/decision/causes",   { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch("/api/learning/outcomes", { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch("/api/learning/summary",  { headers: authHeader() }).then(r => r.ok ? r.json() : null),
    ])
      .then(([briefingData, causesData, outcomesData, learningData]) => {
        if (!alive) return;
        setBriefing(briefingData);
        setCauseOverview(causesData);
        setOutcomes(outcomesData?.items || []);
        setLearning(learningData);
      })
      .catch(() => { if (alive) setError("Daten konnten nicht geladen werden."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // Priorisiert sortierte Empfehlungen (Punkt 4)
  const sortedRecommendations = useMemo(() => sortedRecos(briefing?.recommendations), [briefing]);
  const focusedRecommendations = useMemo(
    () => sortedRecommendations.filter((rec) => ["critical", "high"].includes(rec.priority)).slice(0, 5),
    [sortedRecommendations],
  );
  const visibleRecommendations = showAllRecos ? sortedRecommendations.slice(0, 5) : focusedRecommendations;

  // Ursachenbäume (Punkt 5)
  const causeItems = useMemo(() => causeOverview?.items || [], [causeOverview]);
  const downCauses = useMemo(() => causeItems.filter(i => i.direction === "down"), [causeItems]);
  const upCauses   = useMemo(() => causeItems.filter(i => i.direction === "up"),   [causeItems]);

  const today = useMemo(() =>
    new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);

  if (loading) return (
    <div style={{ padding: "var(--s-6)", display: "grid", gap: 16 }}>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
    </div>
  );

  if (error) return (
    <div style={{ padding: "var(--s-6)" }}>
      <div style={{ fontWeight: 700, color: "var(--c-danger)", marginBottom: 8 }}>Fehler beim Laden</div>
      <div style={{ fontSize: 14, color: "var(--c-text-2)" }}>{error}</div>
    </div>
  );

  return (
    <div style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-5)", maxWidth: 960, margin: "0 auto" }}>

      {/* ── Header — Rolle & Branche (Punkte 2 & 3) ── */}
      <header style={{ borderBottom: "1px solid var(--c-border)", paddingBottom: "var(--s-4)" }}>
        <div style={{ fontSize: 11, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          {today} · {profile.label}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
          {framing.greeting}
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 6, lineHeight: 1.6, marginBottom: 0 }}>
          {framing.subtitle}
        </p>

        {/* Strategische Schlüsselfrage */}
        <div style={{ marginTop: 14, padding: "12px 16px", background: "#0f172a", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Schlüsselfrage heute
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#f8fafc", lineHeight: 1.5 }}>
            {framing.priority_q}
          </div>
        </div>

        {/* Advisory-Fokushinweis (Punkt 7) */}
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
            <strong>Advisory-Fokus ({profile.label}):</strong> {framing.advisory_note}
          </div>
        </div>

        {/* KPI-Signal-Zusammenfassung (Punkt 1) */}
        {briefing && (
          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Signale",        value: briefing.counts?.events           ?? 0, alert: false },
              { label: "Kritisch",       value: briefing.counts?.critical         ?? 0, alert: (briefing.counts?.critical ?? 0) > 0 },
              { label: "Empfehlungen",   value: briefing.counts?.recommendations  ?? 0, alert: false },
              { label: "Frühwarnungen",  value: briefing.counts?.early_warnings   ?? 0, alert: (briefing.counts?.early_warnings ?? 0) > 0 },
            ].map((s) => (
              <div key={s.label} style={{
                textAlign: "center", padding: "10px 18px", borderRadius: 10,
                background: s.alert ? "#fff1f2" : "var(--c-surface-2)",
                border: s.alert ? "1px solid #fecaca" : "1px solid var(--c-border)",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.alert ? "#dc2626" : "#0f172a" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: s.alert ? "#dc2626" : "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* ── Tab-Navigation ── */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--c-border)" }}>
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px", border: "none", cursor: "pointer", background: "transparent",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color:        tab === t.id ? "#0f172a" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #0f172a" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: Handlungsempfehlungen (Punkte 1, 2, 3, 4, 7)
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "beratung" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>

          {/* Fokus-Banner */}
          <div style={{ padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10, border: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
              Fokus-Linse: {framing.lens}
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Fokus: Kritisch + Hoch (max. 5) · {sortedRecommendations.length} Empfehlung{sortedRecommendations.length !== 1 ? "en" : ""} gesamt
            </div>
            <button
              onClick={() => setShowAllRecos((v) => !v)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#334155",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {showAllRecos ? "Fokus anzeigen" : "Mittel/Niedrig einblenden"}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <PriorityLegend />
          </div>

          {/* Empfehlungsliste */}
          {visibleRecommendations.length === 0 ? (
            <div style={{ padding: "var(--s-6)", borderRadius: 12, background: "var(--c-surface-2)", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>Noch keine Empfehlungen vorhanden</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
                Verbinde deine Datenquellen, damit das System personalisierte Empfehlungen für <strong>{profile.label}</strong> erstellen kann.
              </div>
              <Link to="/settings" style={{
                display: "inline-block", marginTop: 14, padding: "8px 18px",
                borderRadius: 8, background: "#0f172a", color: "#fff",
                fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}>
                Integrationen einrichten →
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {visibleRecommendations.map((item) => (
                <RecommendationAdvisoryCard key={item.id} item={item} profileId={profileId} profile={profile} />
              ))}
            </div>
          )}

          {/* Branchenspezifische Sofortmaßnahmen (Punkt 3) */}
          {profile.analysis?.actions?.length > 0 && (
            <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>
                Empfohlene Sofortmaßnahmen · {profile.label}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {profile.analysis.actions.map((action, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                    <span style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                      background: "#eff6ff", color: "#1d4ed8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ lineHeight: 1.6 }}>{action}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, fontSize: 13, color: "#64748b", padding: "10px 12px", background: "#f8fafc", borderRadius: 8, lineHeight: 1.6 }}>
                {profile.analysis.explanation}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2: Ursachenbäume (Punkt 5: Ursache → Wirkung → Maßnahmen)
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "ursachen" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10 }}>
            <strong style={{ color: "#0f172a" }}>Ursache-Wirkungs-Analyse:</strong>{" "}
            Klicke auf ein Signal, um die vollständige Ursachenkette zu sehen — von der Hauptursache bis zu den empfohlenen Maßnahmen.
          </div>

          {causeItems.length === 0 ? (
            <div style={{ padding: "var(--s-6)", borderRadius: 12, background: "var(--c-surface-2)", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🌳</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>Keine Ursachendaten verfügbar</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                Verbinde Datenquellen für automatische Ursachenanalyse.
              </div>
            </div>
          ) : (
            <>
              {/* Negative Signale ↓ */}
              {downCauses.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#dc2626", marginBottom: 10 }}>
                    ↓ Negative Signale — Handlungsbedarf ({downCauses.length})
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {downCauses.map((item) => {
                      const isOpen = expandedId === item.event_id;
                      const causes = item.top_causes || [];
                      return (
                        <div key={item.event_id} style={{
                          border: "1px solid #fecaca", borderLeft: "4px solid #dc2626",
                          borderRadius: 12, overflow: "hidden",
                        }}>
                          {/* Kopfzeile */}
                          <div
                            style={{ padding: "14px 18px", cursor: "pointer", background: "#fff" }}
                            onClick={() => setExpandedId(isOpen ? null : item.event_id)}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, fontSize: 15 }}>📉 {item.metric_label}</span>
                                  <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#fff1f2", color: "#dc2626", fontWeight: 700 }}>
                                    {item.delta_pct}%
                                  </span>
                                  <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>
                                    Konfidenz: {item.confidence}%
                                  </span>
                                  {item.early_warning && (
                                    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#fff7ed", color: "#c2410c", fontWeight: 600 }}>
                                      ⚠ Frühwarnung
                                    </span>
                                  )}
                                </div>
                                <div style={{ marginTop: 6, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{item.summary}</div>
                              </div>
                              <span style={{ color: "#94a3b8", fontSize: 13, flexShrink: 0 }}>
                                {isOpen ? "↑ Schließen" : "↓ Ursachen"}
                              </span>
                            </div>
                          </div>

                          {/* Ursachenkette (Punkt 5) */}
                          {isOpen && (
                            <div style={{ borderTop: "1px solid #fecaca", padding: "16px 18px", background: "#fff9f9" }}>
                              {causes.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>
                                    Ursachenkette (nach Wahrscheinlichkeit)
                                  </div>
                                  <div style={{ display: "grid", gap: 0 }}>
                                    {causes.map((cause, i) => (
                                      <div key={i}>
                                        <div style={{
                                          display: "flex", gap: 12, alignItems: "flex-start",
                                          padding: "12px 14px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0",
                                        }}>
                                          <div style={{ flexShrink: 0, fontSize: 16 }}>
                                            {i === 0 ? "🔴" : i === 1 ? "🟠" : "🟡"}
                                          </div>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                              <span style={{ fontWeight: 700, fontSize: 13 }}>{cause.label}</span>
                                              {cause.probability != null && (
                                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f8fafc", color: "#64748b" }}>
                                                  {cause.probability}% Wahrsch.
                                                </span>
                                              )}
                                              {cause.factor_type && (
                                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                                                  {cause.factor_type}
                                                </span>
                                              )}
                                              {cause.impact_level && (
                                                <span style={{
                                                  fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                                                  background: cause.impact_level === "high" || cause.impact_level === "critical" ? "#fff7ed" : "#f8fafc",
                                                  color: cause.impact_level === "critical" ? "#b91c1c" : cause.impact_level === "high" ? "#c2410c" : "#64748b",
                                                }}>
                                                  Impact: {cause.impact_level}
                                                </span>
                                              )}
                                            </div>
                                            {cause.evidence && (
                                              <div style={{ marginTop: 5, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>{cause.evidence}</div>
                                            )}
                                            {cause.data_gaps?.length > 0 && (
                                              <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
                                                Datenlücken: {cause.data_gaps.join(", ")}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        {i < causes.length - 1 && (
                                          <div style={{ padding: "4px 0 4px 26px", fontSize: 11, color: "#94a3b8", display: "flex", gap: 6, alignItems: "center" }}>
                                            <div style={{ width: 1, height: 12, background: "#e2e8f0" }} />
                                            <span>führt zu ↓</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Direkte Maßnahmen */}
                              {item.recommendations?.length > 0 && (
                                <div style={{ marginTop: 14, padding: "12px 16px", background: "#eff6ff", borderRadius: 8, border: "1px solid #dbeafe" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                                    Direkt empfohlene Maßnahmen
                                  </div>
                                  <div style={{ display: "grid", gap: 6 }}>
                                    {item.recommendations.slice(0, 3).map((rec, i) => (
                                      <div key={i} style={{ fontSize: 13, color: "#1e40af", display: "flex", gap: 8 }}>
                                        <span style={{ flexShrink: 0 }}>→</span>
                                        <span style={{ lineHeight: 1.5 }}>{typeof rec === "string" ? rec : rec.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                                <Link to="/command" style={{
                                  padding: "7px 14px", borderRadius: 7, background: "#0f172a", color: "#fff",
                                  fontSize: 12, fontWeight: 600, textDecoration: "none",
                                }}>
                                  Maßnahme planen
                                </Link>
                                <Link to="/analyse" style={{
                                  padding: "7px 14px", borderRadius: 7, border: "1px solid #e2e8f0",
                                  background: "#fff", color: "#334155", fontSize: 12, fontWeight: 600, textDecoration: "none",
                                }}>
                                  Zur Analyse
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Positive Signale ↑ */}
              {upCauses.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#15803d", marginBottom: 10, marginTop: downCauses.length > 0 ? 8 : 0 }}>
                    ↑ Positive Signale — Momentum nutzen ({upCauses.length})
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {upCauses.map((item) => (
                      <div key={item.event_id} style={{
                        padding: "14px 18px", border: "1px solid #bbf7d0",
                        borderLeft: "4px solid #15803d", borderRadius: 12, background: "#fff",
                      }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>📈 {item.metric_label}</span>
                          <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
                            +{item.delta_pct}%
                          </span>
                          <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>
                            Konfidenz: {item.confidence}%
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{item.summary}</div>
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "#f0fdf4", borderRadius: 7, fontSize: 13, color: "#166534", fontWeight: 600 }}>
                          → Momentum verstärken: Analysiere, welche Faktoren diesen Anstieg treiben — und übertrage sie auf andere Bereiche.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3: Benchmarking (Punkt 8: KPI-Vergleich mit Branchenstandards)
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "benchmarks" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10, border: "1px solid var(--c-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
              Benchmark-Vergleich · {profile.label}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              Vergleich wichtiger KPIs mit Branchenstandards und Top-Performer-Werten.
              <strong> Grüne Linie</strong> = Top 20% · <strong>Graue Linie</strong> = Branchen-∅
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {benchmarks.map((b) => (
              <div key={b.kpi} style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
                <BenchmarkBar label={b.kpi} avg={b.avg} top={b.top} unit={b.unit} lower_is_better={b.lower_is_better} />
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                  <strong>Was bedeutet das?</strong>{" "}
                  {b.lower_is_better
                    ? `Ziel: deinen Wert unter ${b.top} ${b.unit} bringen (Top 20%). Branche ∅: ${b.avg} ${b.unit}.`
                    : `Ziel: deinen Wert über ${b.top} ${b.unit} bringen (Top 20%). Branche ∅: ${b.avg} ${b.unit}.`
                  }{" "}
                  Verbinde deine Daten in{" "}
                  <Link to="/integrations" style={{ color: "#0369a1", textDecoration: "none", fontWeight: 600 }}>Integrationen</Link>{" "}
                  um deinen Istwert zu vergleichen.
                </div>
              </div>
            ))}
          </div>

          {/* Strategische Fokus-KPIs aus Profil */}
          {profile.analysis?.focusAreas?.length > 0 && (
            <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>
                Strategische Fokus-KPIs · {profile.label}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {profile.analysis.focusAreas.map((area) => (
                  <span key={area} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}>
                    {area}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{profile.analysis.explanation}</div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: Lernhistorie (Punkt 6: Selbstlernendes System)
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "lernhistorie" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10, border: "1px solid var(--c-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
              Lernhistorie & Systemverbesserung
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              Was haben vergangene Maßnahmen bewirkt? Das System lernt aus Ergebnissen und verbessert zukünftige Empfehlungen automatisch.
            </div>
          </div>

          {/* Lern-Zusammenfassung */}
          {learning && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                { label: "Analysierte Maßnahmen",  value: learning.total_outcomes       ?? 0 },
                { label: "Erfolgreiche Maßnahmen", value: learning.successful_outcomes  ?? 0 },
                { label: "Ø Trefferquote",          value: learning.avg_accuracy_pct != null ? `${learning.avg_accuracy_pct}%` : "–" },
                { label: "Modell-Version",           value: learning.model_version       ?? "v1" },
              ].map((s) => (
                <div key={s.label} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--c-border)", background: "#fff" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* System-Lerninsights */}
          {learning?.top_insights?.length > 0 && (
            <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>
                System-Lerninsights
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {learning.top_insights.map((insight, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                    <span style={{ flexShrink: 0, fontSize: 16 }}>💡</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maßnahmen-Outcomes */}
          {outcomes.length === 0 ? (
            <div style={{ padding: "var(--s-6)", borderRadius: 12, background: "var(--c-surface-2)", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🧠</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>Noch keine Lernhistorie vorhanden</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
                Wenn Maßnahmen umgesetzt und bewertet werden, lernt das System daraus und verbessert zukünftige Empfehlungen automatisch.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {outcomes.map((outcome) => {
                const expected       = outcome.expected_impact_pct;
                const actual         = outcome.actual_impact_pct;
                const overperformed  = actual != null && expected != null && actual > expected * 1.1;
                const wasSuccessful  = actual != null && expected != null && actual >= expected * 0.8;

                return (
                  <div key={outcome.id} style={{
                    padding: "18px 20px", borderRadius: 12, background: "#fff",
                    border:     `1px solid ${overperformed ? "#bbf7d0" : wasSuccessful ? "#bfdbfe" : "#fecaca"}`,
                    borderLeft: `4px solid ${overperformed ? "#15803d" : wasSuccessful ? "#0369a1" : "#dc2626"}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                          {outcome.title || outcome.recommendation_title}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
                          {outcome.category}{outcome.owner_role ? ` · Owner: ${outcome.owner_role}` : ""}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 12, padding: "4px 12px", borderRadius: 999, fontWeight: 700, flexShrink: 0,
                        background: overperformed ? "#f0fdf4" : wasSuccessful ? "#eff6ff" : "#fff1f2",
                        color:      overperformed ? "#15803d" : wasSuccessful ? "#0369a1" : "#dc2626",
                      }}>
                        {overperformed ? "Übertroffen" : wasSuccessful ? "Erfolgreich" : "Unter Erwartung"}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 14 }}>
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>Erwartet</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{expected != null ? `+${expected}%` : "–"}</div>
                      </div>
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>Tatsächlich</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: wasSuccessful ? "#15803d" : "#dc2626" }}>
                          {actual != null ? `+${actual}%` : "–"}
                        </div>
                      </div>
                      {outcome.actual_roi_score != null && (
                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc" }}>
                          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>ROI-Score</div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{outcome.actual_roi_score}</div>
                        </div>
                      )}
                    </div>

                    {outcome.learning_note && (
                      <div style={{ marginTop: 10, fontSize: 13, color: "#334155", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, lineHeight: 1.6 }}>
                        <strong>Notiz:</strong> {outcome.learning_note}
                      </div>
                    )}

                    {/* Systemlernempfehlung (Punkt 6) */}
                    <div style={{
                      marginTop: 10, padding: "10px 12px", borderRadius: 8,
                      background: overperformed ? "#f0fdf4" : wasSuccessful ? "#eff6ff" : "#fff1f2",
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, lineHeight: 1.6,
                        color: overperformed ? "#15803d" : wasSuccessful ? "#0369a1" : "#dc2626",
                      }}>
                        {overperformed
                          ? "✓ Diesen Ansatz bei ähnlichen Signalen erneut einsetzen und weiter skalieren."
                          : wasSuccessful
                            ? "✓ Ansatz war wirksam — für vergleichbare KPI-Rückgänge wieder empfohlen."
                            : "→ Ansatz überprüfen: Bedingungen oder Umsetzungstiefe anpassen, bevor erneuter Einsatz."}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Footer-Navigation ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: "var(--s-3)", borderTop: "1px solid var(--c-border)" }}>
        {[
          { label: "Analyse vertiefen",   href: "/analyse",      emoji: "📊" },
          { label: "Maßnahmen planen",    href: "/command",      emoji: "🎯" },
          { label: "Aufgaben delegieren", href: "/tasks",        emoji: "✅" },
          { label: "Review & Ergebnisse", href: "/review-audit", emoji: "🔍" },
        ].map(({ label, href, emoji }) => (
          <Link key={href} to={href} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--c-border)",
            background: "var(--c-surface)", color: "var(--c-text)",
            textDecoration: "none", fontSize: 13, fontWeight: 500,
          }}>
            {emoji} {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
