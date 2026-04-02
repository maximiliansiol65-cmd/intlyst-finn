import { useEffect, useState } from "react";

import { buildAdvisoryAgendaFromAnalysis, getPriorityPalette } from "../../utils/advisorLens";

const TYPE_CONFIG = {
  strength: { color: "#15803d", bg: "#f0fdf4", label: "Staerke" },
  weakness: { color: "#b91c1c", bg: "#fef2f2", label: "Schwaeche" },
  opportunity: { color: "#1d4ed8", bg: "#eff6ff", label: "Chance" },
  risk: { color: "#c2410c", bg: "#fff7ed", label: "Risiko" },
  warning: { color: "#c2410c", bg: "#fff7ed", label: "Warnsignal" },
};

const HEALTH_CONFIG = [
  { min: 80, color: "#15803d", label: "Sehr gut" },
  { min: 60, color: "#1d4ed8", label: "Gut" },
  { min: 40, color: "#a16207", label: "Mittel" },
  { min: 20, color: "#c2410c", label: "Schwach" },
  { min: 0, color: "#b91c1c", label: "Kritisch" },
];

function HealthMeter({ score, label }) {
  const cfg = HEALTH_CONFIG.find((item) => score >= item.min) || HEALTH_CONFIG[HEALTH_CONFIG.length - 1];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="45"
            cy="45"
            r="40"
            fill="none"
            stroke={cfg.color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color }}>{score}</span>
          <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Health</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{label}</div>
        <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
      </div>
    </div>
  );
}

function SourceBadge({ source }) {
  const map = {
    claude: { bg: "#dcfce7", fg: "#15803d", label: "Live KI" },
    fallback: { bg: "#fef3c7", fg: "#a16207", label: "Fallback" },
    local: { bg: "#e2e8f0", fg: "#475569", label: "Lokal" },
  };
  const cfg = map[source] || map.local;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.fg,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {cfg.label}
    </span>
  );
}

function AdvisorySection({ label, text, tone = "#334155", background = "#ffffff", border = "#e2e8f0" }) {
  return (
    <div
      style={{
        background,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.65 }}>{text}</div>
    </div>
  );
}

function RecommendationBlock({ recommendation }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <AdvisorySection label="Sofortmassnahme" text={recommendation.immediate} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
      <AdvisorySection label="Mittelfristige Massnahme" text={recommendation.midTerm} tone="#a16207" background="#fefce8" border="#fde68a" />
      <AdvisorySection label="Strategische Massnahme" text={recommendation.strategic} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
    </div>
  );
}

function InsightCard({ item }) {
  const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.opportunity;
  const priority = getPriorityPalette(item.priorityKey);

  return (
    <article
      style={{
        background: "#ffffff",
        border: `1px solid ${typeCfg.color}26`,
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 12,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: typeCfg.bg, color: typeCfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {typeCfg.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: priority.bg, color: priority.tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {priority.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {item.ownerLabel}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
        </div>
        <div style={{ minWidth: 180, fontSize: 12, color: "#475569", lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Priorisierung</div>
          <div>{item.prioritization}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <AdvisorySection label="Analyse" text={item.analysis} tone={typeCfg.color} background={typeCfg.bg} border={`${typeCfg.color}30`} />
        <AdvisorySection label="Einordnung" text={item.assessment} />
        <AdvisorySection label="Strategische Perspektive" text={item.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
      </div>

      <RecommendationBlock recommendation={item.recommendation} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <AdvisorySection label="Datenbezug" text={item.evidence} />
        <AdvisorySection label="Betroffene KPI" text={`${item.primaryMetric} • ${item.kpiLink}`} />
        <AdvisorySection label="Benchmark" text={item.benchmarkNote} />
        <AdvisorySection label="Forecast" text={item.forecastNote} />
      </div>

      {item.causes?.length > 0 && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Ursachenbild
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {item.causes.map((cause) => (
              <div key={cause} style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                {cause}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <AdvisorySection label="7 Tage" text={item.periods.sevenDays} />
        <AdvisorySection label="30 Tage" text={item.periods.thirtyDays} />
        <AdvisorySection label="12 Monate" text={item.periods.twelveMonths} />
      </div>
    </article>
  );
}

export default function AnalysisWidget({ days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/analysis?days=${days}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Status ${res.status}`);
      }
      const payload = await res.json();
      setData(payload);
      setLastUpdate(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [days]);

  const agenda = buildAdvisoryAgendaFromAnalysis(data);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Berater-Analyse
          </div>
          {data?.data_period && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{data.data_period}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data?.source && <SourceBadge source={data.source} />}
          {lastUpdate && <span style={{ fontSize: 11, color: "#64748b" }}>Aktualisiert {lastUpdate}</span>}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: loading ? "#e2e8f0" : "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 11,
              fontWeight: 700,
              color: loading ? "#64748b" : "#1d4ed8",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analysiere..." : "Neu analysieren"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 28, display: "flex", alignItems: "center", gap: 14 }}>
          <div className="spinner" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, color: "#0f172a", marginBottom: 4 }}>Die App bewertet gerade die Geschaeftslage.</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Es werden nicht nur KPIs geladen, sondern priorisierte Entscheidungen vorbereitet.</div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "14px 16px", fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "grid", gap: 18 }}>
          <section style={{ background: "linear-gradient(135deg, #fffdf5 0%, #ffffff 100%)", border: "1px solid #e2e8f0", borderRadius: 20, padding: 20, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
              <HealthMeter score={data.health_score} label={data.health_label} />
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Management-Fazit
                  </div>
                  <div style={{ fontSize: 15, color: "#0f172a", lineHeight: 1.7 }}>{agenda.headline}</div>
                </div>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.65 }}>{agenda.prioritization}</div>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <AdvisorySection label="Analyse" text={agenda.analysis} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
            <AdvisorySection label="Einordnung" text={agenda.assessment} />
            <AdvisorySection label="Priorisierung" text={agenda.prioritization} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
            <AdvisorySection label="Strategische Perspektive" text={agenda.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
          </section>

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Empfehlung
            </div>
            <RecommendationBlock recommendation={agenda.recommendation} />
          </section>

          {agenda.items?.length > 0 && (
            <section style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Priorisierte Themen ({agenda.items.length})
              </div>
              {agenda.items.map((item) => (
                <InsightCard key={`${item.title}-${item.priorityKey}`} item={item} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
