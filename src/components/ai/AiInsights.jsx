import { useEffect, useState } from "react";

import { useCompanyProfile } from "../../contexts/CompanyProfileContext";
import { getDashboardRoleCopy } from "../../config/dashboardRoles";
import { buildAdvisoryAgendaFromAnalysis, getPriorityPalette } from "../../utils/advisorLens";

const TYPE_CONFIG = {
  strength: { color: "#15803d", bg: "#f0fdf4", label: "Staerke" },
  weakness: { color: "#b91c1c", bg: "#fef2f2", label: "Schwaeche" },
  opportunity: { color: "#1d4ed8", bg: "#eff6ff", label: "Chance" },
  warning: { color: "#c2410c", bg: "#fff7ed", label: "Warnung" },
  risk: { color: "#c2410c", bg: "#fff7ed", label: "Risiko" },
};

function BriefCard({ label, text, tone = "#334155", background = "#ffffff", border = "#e2e8f0" }) {
  return (
    <div style={{ background, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function DecisionCard({ item }) {
  const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.opportunity;
  const priority = getPriorityPalette(item.priorityKey);

  return (
    <div style={{ background: "#ffffff", border: `1px solid ${typeCfg.color}26`, borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: typeCfg.bg, color: typeCfg.color, textTransform: "uppercase" }}>
              {typeCfg.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: priority.bg, color: priority.tone, textTransform: "uppercase" }}>
              {priority.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", textTransform: "uppercase" }}>
              {item.ownerLabel}
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
        </div>
        <div style={{ maxWidth: 260, fontSize: 12, color: "#475569", lineHeight: 1.55 }}>{item.prioritization}</div>
      </div>

      <BriefCard label="Analyse" text={item.analysis} tone={typeCfg.color} background={typeCfg.bg} border={`${typeCfg.color}30`} />
      <BriefCard label="Einordnung" text={item.assessment} />
      <BriefCard label="Empfehlung" text={item.recommendation.immediate} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
      <BriefCard label="Strategische Perspektive" text={item.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
    </div>
  );
}

export default function AiInsights() {
  const { profile } = useCompanyProfile();
  const roleCopy = getDashboardRoleCopy(profile);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/insights");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const agenda = buildAdvisoryAgendaFromAnalysis(data);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {roleCopy.insightsLabel}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Die App ordnet Signale jetzt wie ein Berater ein: Was passiert, wie relevant ist es und was ist der naechste Schritt?
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: loading ? "#e2e8f0" : "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 700,
            color: loading ? "#64748b" : "#1d4ed8",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analysiere..." : "Neu analysieren"}
        </button>
      </div>

      {loading && <div style={{ fontSize: 13, color: "#64748b", padding: "12px 0" }}>Beratungslogik wird vorbereitet...</div>}

      {error && !loading && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#b91c1c" }}>
          Fehler: {error}
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <BriefCard label="Analyse" text={agenda.analysis} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
            <BriefCard label="Einordnung" text={agenda.assessment} />
            <BriefCard label="Priorisierung" text={agenda.prioritization} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
            <BriefCard label="Strategische Perspektive" text={agenda.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {agenda.items.map((item) => (
              <DecisionCard key={`${item.title}-${item.priorityKey}`} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
