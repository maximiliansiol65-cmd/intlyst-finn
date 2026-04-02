/* eslint-disable */
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import "../styles/premium-dashboard.css";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";

// ─── Mock Forecast Data ───────────────────────────────────────────────────────
function genMock(base, growth, noise) {
  return Array.from({ length: 30 }, (_, i) => ({
    day: `T+${i + 1}`,
    value:  +(base + i * growth + Math.sin(i * 0.7) * noise).toFixed(2),
    lower:  +(base * 0.88 + i * growth * 0.7).toFixed(2),
    upper:  +(base * 1.12 + i * growth * 1.3).toFixed(2),
  }));
}
const MOCK = {
  revenue:    genMock(48000, 420, 900),
  traffic:    genMock(16000, 130, 420),
  conversion: genMock(2.8, 0.03, 0.12),
};

const METRIC_META = {
  revenue:    { label: "Umsatz",     unit: "€",  color: "#3b82f6", growth: "+12%", period: "30T" },
  traffic:    { label: "Leads",      unit: "",   color: "#10b981", growth: "+8%",  period: "30T" },
  conversion: { label: "Conversion", unit: "%",  color: "#f59e0b", growth: "+5%",  period: "30T" },
};

// ─── Scenarios ────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "base", label: "Basis-Szenario", emoji: "✅",
    desc: "Aktueller Trend setzt sich fort — keine großen Veränderungen.",
    mult: { revenue: 1, traffic: 1, conversion: 1 },
    risks: ["Conversion Rate bleibt unter Druck", "Wettbewerb könnte zunehmen"],
    chances: ["Organischer Traffic wächst weiter", "Kundenbindung stabil"],
  },
  {
    id: "opt", label: "Optimistisch", emoji: "📈",
    desc: "+20% Marketing-Budget, verbesserte Conversion durch A/B-Tests.",
    mult: { revenue: 1.18, traffic: 1.22, conversion: 1.15 },
    risks: ["Höherer Budgetdruck", "Team-Kapazität könnte zum Engpass werden"],
    chances: ["Umsatz +18% realistisch", "Neue Kundensegmente erschließbar"],
  },
  {
    id: "pess", label: "Pessimistisch", emoji: "📉",
    desc: "Aktuelle Probleme verstärken sich — Conversion sinkt weiter.",
    mult: { revenue: 0.85, traffic: 0.9, conversion: 0.82 },
    risks: ["Umsatzverlust bis –15%", "Churn-Rate könnte steigen"],
    chances: ["Frühzeitiges Eingreifen kann Rückgang stoppen", "Krisenplan verfügbar"],
  },
];

// ─── Risks ────────────────────────────────────────────────────────────────────
const RISKS = [
  { name: "Conversion Rate sinkt weiter",      kpi: "Umsatz",       prob: 65, probLabel: "Hoch",   probColor: "#dc2626", bar: 65, impact: "Direkte Umsatzeinbuße von bis zu 12% in 30 Tagen." },
  { name: "Traffic-Rückgang durch Saisonalität", kpi: "Leads",      prob: 45, probLabel: "Mittel", probColor: "#f59e0b", bar: 45, impact: "Weniger Neukunden-Potenzial im nächsten Quartal." },
  { name: "Wettbewerberdruck steigt",           kpi: "Marktanteil",  prob: 55, probLabel: "Mittel", probColor: "#f59e0b", bar: 55, impact: "Marktanteil-Verlust wenn Reaktion ausbleibt." },
  { name: "Kundenbindung verschlechtert sich",  kpi: "LTV",          prob: 40, probLabel: "Niedrig",probColor: "#16a34a", bar: 40, impact: "LTV sinkt mittelfristig, Churn-Kosten steigen." },
];

// ─── Opportunities ────────────────────────────────────────────────────────────
const OPPS = [
  { name: "SEO-Momentum ausbauen",        impact: "+15% Traffic",     timeline: "30 Tage",  effort: "Niedrig",  color: "#16a34a", desc: "Organischer Traffic wächst — Inhalte skalieren jetzt gezielt." },
  { name: "Conversion-Funnel optimieren", impact: "+10–18% Umsatz",   timeline: "45 Tage",  effort: "Mittel",   color: "#3b82f6", desc: "Gezielte A/B-Tests im Checkout erhöhen Abschlussrate signifikant." },
  { name: "Upselling-Kampagne starten",   impact: "+8% MRR",          timeline: "60 Tage",  effort: "Mittel",   color: "#8b5cf6", desc: "Bestehende Kunden haben hohe Bereitschaft für höherwertige Pakete." },
  { name: "Neues Marktsegment erschließen",impact: "+25% Leads",      timeline: "90 Tage",  effort: "Hoch",     color: "#f59e0b", desc: "Identifiziertes Segment mit niedrigem CAC und hohem LTV-Potenzial." },
];

// ─── Influencing Factors ──────────────────────────────────────────────────────
const FACTORS = [
  { name: "Organischer Traffic",  pct: 72, up: true,  desc: "Starker positiver Einfluss auf Leads und Conversions." },
  { name: "Conversion Rate",      pct: 88, up: false, desc: "Kritischer Hebel — aktuell unter Druck, hohe Hebelwirkung." },
  { name: "Marketing Budget",     pct: 55, up: true,  desc: "Moderater Einfluss, Skalierung möglich." },
  { name: "Team-Kapazität",       pct: 60, up: true,  desc: "Operativer Engpass bei mehr als 12 parallelen Aufgaben." },
  { name: "Saisonalität",         pct: 40, up: false, desc: "Saisonaler Rückgang im aktuellen Quartal erwartet." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, unit) {
  if (unit === "€") return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  if (unit === "%") return `${n}%`;
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", padding: "10px 14px", borderRadius: 8, color: "#fff", fontSize: 13 }}>
      <div style={{ marginBottom: 4, color: "#94a3b8" }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color || "#fff" }}>
          {p.name}: <strong>{fmt(p.value, unit)}</strong>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "prognose",    label: "Gesamtprognose",   emoji: "📈" },
  { id: "szenarien",   label: "Szenarien",         emoji: "🔀" },
  { id: "risiken",     label: "Risiken",           emoji: "⚠️" },
  { id: "chancen",     label: "Chancen",           emoji: "🚀" },
  { id: "faktoren",    label: "Einflussfaktoren",  emoji: "🔧" },
];

const TIME_OPTS = ["7T", "30T", "90T"];

// ─── Tab: Gesamtprognose ──────────────────────────────────────────────────────
function TabPrognose({ forecastData, loading }) {
  const [activeMetric, setActiveMetric] = useState("revenue");
  const [timeRange, setTimeRange] = useState("30T");

  const metricKeys = Object.keys(METRIC_META);
  const meta = METRIC_META[activeMetric];
  const raw = forecastData[activeMetric] || MOCK[activeMetric];

  const sliced = useMemo(() => {
    const n = timeRange === "7T" ? 7 : timeRange === "90T" ? raw.length : 30;
    return raw.slice(0, Math.min(n, raw.length));
  }, [raw, timeRange]);

  const last = sliced[sliced.length - 1];
  const first = sliced[0];
  const delta = first ? (((last.value - first.value) / first.value) * 100).toFixed(1) : 0;

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Metric selector */}
      <div className="ceo-section" style={{ paddingBottom: "var(--s-3)" }}>
        <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            {metricKeys.map(k => (
              <button key={k} onClick={() => setActiveMetric(k)} style={{
                padding: "8px 18px", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600, fontSize: "var(--text-sm)", border: "1px solid var(--c-border)",
                background: activeMetric === k ? "#0f172a" : "var(--c-surface)",
                color: activeMetric === k ? "#fff" : "var(--c-text)",
              }}>{METRIC_META[k].label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            {TIME_OPTS.map(t => (
              <button key={t} onClick={() => setTimeRange(t)} style={{
                padding: "6px 14px", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, border: "1px solid var(--c-border)",
                background: timeRange === t ? meta.color : "var(--c-surface)",
                color: timeRange === t ? "#fff" : "var(--c-text)",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--s-3)" }}>
        {[
          { label: "Aktuell",       value: fmt(first?.value ?? 0, meta.unit) },
          { label: `In ${timeRange}`, value: fmt(last?.value ?? 0, meta.unit) },
          { label: "Veränderung",   value: `${Number(delta) >= 0 ? "+" : ""}${delta}%` },
          { label: "Best Case",     value: fmt(last?.upper ?? 0, meta.unit) },
          { label: "Worst Case",    value: fmt(last?.lower ?? 0, meta.unit) },
        ].map(card => (
          <div key={card.label} style={{ padding: "var(--s-4)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)" }}>
            <div style={{ fontSize: "11px", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--c-text)", fontVariantNumeric: "tabular-nums" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="ceo-section">
        <div className="section-title">{meta.label} — Prognose</div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={sliced} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={meta.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={meta.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--c-text-3)" }} interval={Math.floor(sliced.length / 5)} />
            <YAxis tick={{ fontSize: 11, fill: "var(--c-text-3)" }} tickFormatter={v => meta.unit === "€" ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip content={<CustomTooltip unit={meta.unit} />} />
            <Legend />
            <Area type="monotone" dataKey="upper" name="Best Case"  fill="transparent" stroke={meta.color} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
            <Area type="monotone" dataKey="value" name={meta.label} fill={`url(#grad-${activeMetric})`} stroke={meta.color} strokeWidth={2.5} />
            <Area type="monotone" dataKey="lower" name="Worst Case" fill="transparent" stroke={meta.color} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--c-text-4)", marginTop: 8 }}>
          Prognoseband zeigt Best Case / Worst Case basierend auf aktuellen Trends und historischen Mustern.
        </p>
      </div>

      {/* Historische Genauigkeit */}
      <div className="ceo-section">
        <div className="section-title">Historische Genauigkeit</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)" }}>
          {[
            { period: "Letzte Prognose",     accuracy: 87, delta: "+3%"  },
            { period: "Vor 30 Tagen",        accuracy: 82, delta: "–1%"  },
            { period: "Vor 60 Tagen",        accuracy: 79, delta: "+6%"  },
          ].map(h => (
            <div key={h.period} style={{ padding: "var(--s-4)", background: "var(--c-surface-2)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: 6 }}>{h.period}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 20, color: "var(--c-text)" }}>{h.accuracy}%</span>
                <span style={{ fontSize: "var(--text-xs)", color: h.delta.startsWith("+") ? "#16a34a" : "#f59e0b" }}>Abw. {h.delta}</span>
              </div>
              <div style={{ height: 6, background: "var(--c-surface-3)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${h.accuracy}%`, background: h.accuracy >= 85 ? "#16a34a" : "#f59e0b", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Szenarien ───────────────────────────────────────────────────────────
function TabSzenarien({ forecastData }) {
  const [selected, setSelected] = useState("base");
  const scenario = SCENARIOS.find(s => s.id === selected);
  const baseRevLast = (forecastData.revenue?.[29] || MOCK.revenue[29]).value;

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="ceo-section">
        <div className="section-title">Szenario-Auswahl</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelected(s.id)} style={{
              textAlign: "left", padding: "var(--s-4)", borderRadius: "var(--r-lg)", cursor: "pointer", fontFamily: "inherit",
              border: `2px solid ${selected === s.id ? "#3b82f6" : "var(--c-border)"}`,
              background: selected === s.id ? "#eff6ff" : "var(--c-surface)",
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--c-text)", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.5 }}>{s.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: "var(--s-3)", background: "#fefce8", border: "1px solid #fef08a", borderRadius: "var(--r-md)", fontSize: "var(--text-xs)", color: "#92400e" }}>
          Szenarien sind Prognosemodelle — keine Garantien. Nutze sie zur strategischen Orientierung.
        </div>
      </div>

      {/* KPI-Projektion */}
      <div className="ceo-section">
        <div className="section-title">KPI-Projektion: {scenario.label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
          {/* Left: table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr>
                  {["KPI", "Aktuell", "Prognose 30T", "Delta"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", background: "var(--c-surface-2)", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--c-border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(METRIC_META).map(([key, meta], i) => {
                  const baseVal = (forecastData[key]?.[0] || MOCK[key][0]).value;
                  const projVal = +(baseVal * scenario.mult[key]).toFixed(2);
                  const deltaPct = (((projVal - baseVal) / baseVal) * 100).toFixed(1);
                  const up = projVal >= baseVal;
                  return (
                    <tr key={key} style={{ background: i % 2 === 0 ? "var(--c-surface)" : "var(--c-surface-2)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: meta.color }}>{meta.label}</td>
                      <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>{fmt(baseVal, meta.unit)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(projVal, meta.unit)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: up ? "#16a34a" : "#dc2626" }}>{up ? "+" : ""}{deltaPct}%</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--c-surface-2)", borderTop: "2px solid var(--c-border)" }}>
                  <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700, color: "var(--c-text)" }}>ROI-Schätzung (30T)</td>
                  <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 800, fontSize: 16, color: scenario.id === "pess" ? "#dc2626" : "#16a34a" }}>
                    {scenario.id === "base" ? "~1.0x" : scenario.id === "opt" ? "~1.8x" : "~0.75x"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right: risks + chances */}
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "#dc2626", marginBottom: 8 }}>Risiken</div>
              {scenario.risks.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "#dc2626", fontSize: 14, flexShrink: 0, marginTop: 2 }}>▲</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{r}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "#16a34a", marginBottom: 8 }}>Chancen</div>
              {scenario.chances.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "#16a34a", fontSize: 14, flexShrink: 0, marginTop: 2 }}>▶</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Risiken ─────────────────────────────────────────────────────────────
function TabRisiken() {
  return (
    <div style={{ display: "grid", gap: "var(--s-4)" }}>
      <div className="ceo-section">
        <div className="section-title">Risikoanalyse</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "0 0 var(--s-5)" }}>
          Identifizierte Risiken basierend auf aktuellen Trends und historischen Mustern. Eintrittswahrscheinlichkeit in den nächsten 30 Tagen.
        </p>
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {RISKS.map((risk, i) => (
            <div key={i} style={{ padding: "var(--s-4)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", display: "grid", gap: "var(--s-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-3)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--c-text)", marginBottom: 3 }}>{risk.name}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Betroffene KPI: <strong>{risk.kpi}</strong></div>
                </div>
                <span style={{ padding: "4px 12px", borderRadius: "999px", fontSize: "var(--text-xs)", fontWeight: 700, background: risk.probColor + "18", color: risk.probColor, flexShrink: 0 }}>
                  {risk.probLabel} — {risk.prob}%
                </span>
              </div>
              <div style={{ height: 6, background: "var(--c-surface-3)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${risk.bar}%`, background: risk.probColor, borderRadius: 4, transition: "width 0.6s ease" }} />
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: 0, lineHeight: 1.55 }}>{risk.impact}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Chancen ─────────────────────────────────────────────────────────────
function TabChancen() {
  const effortColor = { Niedrig: "#16a34a", Mittel: "#f59e0b", Hoch: "#dc2626" };
  return (
    <div style={{ display: "grid", gap: "var(--s-4)" }}>
      <div className="ceo-section">
        <div className="section-title">Wachstumschancen</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "0 0 var(--s-5)" }}>
          Identifizierte Potenziale mit konkretem Impact. Direkt als Aufgabe übernehmen.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--s-4)" }}>
          {OPPS.map((opp, i) => (
            <div key={i} style={{ padding: "var(--s-5)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", display: "grid", gap: "var(--s-3)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: opp.color }} />
              <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>{opp.name}</div>
                <span style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: opp.color + "18", color: opp.color, flexShrink: 0 }}>{opp.impact}</span>
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: 0, lineHeight: 1.55 }}>{opp.desc}</p>
              <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--c-text-3)" }}>⏱ {opp.timeline}</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: effortColor[opp.effort] }}>Aufwand: {opp.effort}</span>
              </div>
              <Link to="/tasks" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "var(--r-md)", background: "#0f172a", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none", width: "fit-content" }}>
                Aufgabe anlegen →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Einflussfaktoren ────────────────────────────────────────────────────
function TabFaktoren() {
  return (
    <div style={{ display: "grid", gap: "var(--s-4)" }}>
      <div className="ceo-section">
        <div className="section-title">Einflussfaktoren auf die Prognose</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "0 0 var(--s-5)" }}>
          Diese Faktoren beeinflussen die Prognosequalität und KPI-Entwicklung. Je höher der Balken, desto stärker der Einfluss.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--s-4)" }}>
          {FACTORS.map((f, i) => (
            <div key={i} style={{ padding: "var(--s-5)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>{f.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 18, color: f.up ? "#16a34a" : "#dc2626" }}>{f.up ? "↑" : "↓"}</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: "var(--c-text)" }}>{f.pct}%</span>
                </div>
              </div>
              <div style={{ height: 8, background: "var(--c-surface-3)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${f.pct}%`, background: f.up ? "#3b82f6" : "#f59e0b", borderRadius: 4, transition: "width 0.7s ease" }} />
              </div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Maßnahmen → Forecast Verbindung */}
      <div className="ceo-section">
        <div className="section-title">Maßnahmen → Forecast-Wirkung</div>
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {[
            { measure: "Conversion Rate um +2% verbessern", kpi: "Umsatz", effect: "+18% Umsatz in 30 Tagen" },
            { measure: "Traffic um +20% steigern",          kpi: "Leads",  effect: "+15% Leads, +8% Umsatz" },
            { measure: "Follow-up-Prozess beschleunigen",   kpi: "Conversion", effect: "+10% Abschlussrate" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--s-4)", alignItems: "center", padding: "var(--s-3) var(--s-4)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 140 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>{row.measure}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>Ziel-KPI: {row.kpi}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <span style={{ padding: "4px 12px", borderRadius: "999px", fontSize: "var(--text-xs)", fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>{row.effect}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Forecast() {
  const { authHeader } = useAuth();
  const { profile }    = useCompanyProfile();
  const [activeTab, setActiveTab] = useState("prognose");
  const [forecastData, setForecastData] = useState({ revenue: null, traffic: null, conversion: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      const keys = ["revenue", "traffic", "conversion"];
      const results = await Promise.allSettled(
        keys.map(k => fetch(`/api/ai/forecast/${k}?horizon=90`, { headers: authHeader() }))
      );
      const data = {};
      await Promise.all(results.map(async (res, i) => {
        if (res.status === "fulfilled" && res.value.ok) {
          try {
            const json = await res.value.json();
            const pts = Array.isArray(json) ? json : (json.forecast || []);
            if (pts.length) {
              data[keys[i]] = pts.map((p, idx) => ({
                day: `T+${idx+1}`,
                value: p.value ?? p.predicted ?? p,
                lower: p.lower ?? (p.value ?? p) * 0.9,
                upper: p.upper ?? (p.value ?? p) * 1.1,
              }));
            }
          } catch {}
        }
      }));
      if (alive) {
        setForecastData(prev => ({ ...prev, ...data }));
        setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [authHeader]);

  return (
    <div className="ceo-shell">
      <header className="ceo-hero">
        <div>
          <p className="eyebrow">Analyse · 3 Ebenen</p>
          <h1>Forecast & Strategie</h1>
          <p className="sub">Prognosen, Szenarien und strategische Entscheidungsgrundlagen auf einen Blick.</p>
        </div>
        <div className="hero-note">
          <span className="dot" />
          <span>Dashboard → Drilldown → Forecast</span>
        </div>
      </header>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-5)", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 18px", borderRadius: "var(--r-md)", cursor: "pointer",
            border: "1px solid var(--c-border)",
            background: activeTab === tab.id ? "#0f172a" : "var(--c-surface)",
            color: activeTab === tab.id ? "#fff" : "var(--c-text)",
            fontWeight: 600, fontSize: "var(--text-sm)",
            display: "flex", gap: "var(--s-2)", alignItems: "center",
            boxShadow: activeTab === tab.id ? "0 4px 14px rgba(0,0,0,0.15)" : "none",
            transition: "all 0.15s",
          }}>
            <span>{tab.emoji}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "prognose"  && <TabPrognose forecastData={forecastData} loading={loading} />}
      {activeTab === "szenarien" && <TabSzenarien forecastData={forecastData} />}
      {activeTab === "risiken"   && <TabRisiken />}
      {activeTab === "chancen"   && <TabChancen />}
      {activeTab === "faktoren"  && <TabFaktoren />}
    </div>
  );
}
