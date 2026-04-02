import { useEffect, useState } from "react";

import { useCompanyProfile } from "../../contexts/CompanyProfileContext";
import { getDashboardRoleCopy } from "../../config/dashboardRoles";
import { buildRecommendationAgenda, getPriorityPalette } from "../../utils/advisorLens";
import { PriorityLegend } from "../ui";

function SourceBadge({ source }) {
  const sourceConfig = {
    claude: { bg: "#dcfce7", fg: "#15803d", label: "Live KI" },
    fallback: { bg: "#fef3c7", fg: "#a16207", label: "Fallback" },
    local: { bg: "#e2e8f0", fg: "#475569", label: "Lokal" },
  };
  const cfg = sourceConfig[source] || sourceConfig.local;
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

function AdvisoryBlock({ label, text, tone = "#334155", background = "#ffffff", border = "#e2e8f0" }) {
  return (
    <div style={{ background, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function SectionList({ title, items, tone = "#334155", background = "#ffffff", border = "#e2e8f0" }) {
  if (!items?.length) return null;
  return (
    <div style={{ background, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={`${title}-${item}`} style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({ item, original, onCreateTask, state }) {
  const priority = getPriorityPalette(item.priorityKey);

  return (
    <article style={{ background: "#ffffff", border: `1px solid ${priority.tone}26`, borderRadius: 18, padding: 18, display: "grid", gap: 12, boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: priority.bg, color: priority.tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {priority.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {item.category}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#f8fafc", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {item.timeframe}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Verantwortung: {item.ownerLabel} • KPI: {item.kpiLink}
          </div>
        </div>
        <div style={{ maxWidth: 260, fontSize: 12, color: "#475569", lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Priorisierung</div>
          <div>{item.prioritization}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <AdvisoryBlock label="Analyse" text={item.analysis} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
        <AdvisoryBlock label="Einordnung" text={item.assessment} />
        <AdvisoryBlock label="Strategische Perspektive" text={item.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <AdvisoryBlock label="Sofortmassnahme" text={item.recommendation.immediate} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
        <AdvisoryBlock label="Mittelfristige Massnahme" text={item.recommendation.midTerm} tone="#a16207" background="#fefce8" border="#fde68a" />
        <AdvisoryBlock label="Strategische Massnahme" text={item.recommendation.strategic} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <AdvisoryBlock label="Erwarteter Effekt" text={item.expectedResult} />
        <AdvisoryBlock label="Risiko-Level" text={item.riskLevel} />
      </div>

      <button
        onClick={() => onCreateTask(original)}
        disabled={state === "loading" || state === "done"}
        style={{
          justifySelf: "start",
          padding: "9px 16px",
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 10,
          border: "none",
          cursor: state ? "default" : "pointer",
          background: state === "done" ? "#dcfce7" : "#1d4ed8",
          color: state === "done" ? "#15803d" : "#ffffff",
        }}
      >
        {state === "done" ? "Task erstellt" : state === "loading" ? "Erstelle..." : original.action_label}
      </button>
    </article>
  );
}

export default function RecommendationsWidget({ onTaskCreated }) {
  const { profile } = useCompanyProfile();
  const roleCopy = getDashboardRoleCopy(profile);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState({});
  const [showAllPriorities, setShowAllPriorities] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/recommendations");
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

  async function createTask(rec) {
    setCreated((prev) => ({ ...prev, [rec.id]: "loading" }));
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.action_label,
          description: `${rec.description}\n\nErwartetes Ergebnis: ${rec.expected_result}`,
          priority: rec.priority,
          assigned_to: rec.owner_role || "Management",
          goal: rec.strategic_context || rec.title,
          expected_result: rec.expected_result,
          kpis: rec.kpi_link ? [rec.kpi_link] : [],
          impact: rec.priority,
        }),
      });
      setCreated((prev) => ({ ...prev, [rec.id]: "done" }));
      onTaskCreated?.();
    } catch {
      setCreated((prev) => ({ ...prev, [rec.id]: null }));
    }
  }

  const rawRecommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
  const focusedRecommendations = rawRecommendations.filter((rec) => ["critical", "high"].includes(rec.priority));
  const sourceRecommendations = (showAllPriorities ? rawRecommendations : focusedRecommendations).slice(0, 5);
  const agenda = buildRecommendationAgenda(data ? { ...data, recommendations: sourceRecommendations } : data);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {roleCopy.recommendationsLabel}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Die App zeigt nur die wenigen Massnahmen, die heute wirklich entscheidungsreif sind.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data?.source && <SourceBadge source={data.source} />}
          <button
            onClick={() => setShowAllPriorities((v) => !v)}
            style={{
              background: showAllPriorities ? "#e2e8f0" : "#0f172a",
              border: "1px solid #0f172a",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 700,
              color: showAllPriorities ? "#334155" : "#fff",
              cursor: "pointer",
            }}
          >
            {showAllPriorities ? "Fokus anzeigen" : "Mittel/Niedrig einblenden"}
          </button>
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
            {loading ? "Lade..." : "Neu priorisieren"}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <PriorityLegend />
      </div>

      {loading && <div style={{ fontSize: 13, color: "#64748b", padding: "12px 0" }}>Empfehlungen werden in eine Management-Agenda uebersetzt...</div>}

      {error && !loading && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <AdvisoryBlock label="Analyse" text={agenda.analysis} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
            <AdvisoryBlock label="Einordnung" text={agenda.assessment} />
            <AdvisoryBlock label="Priorisierung" text={agenda.prioritization} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
            <AdvisoryBlock label="Strategische Perspektive" text={agenda.strategicPerspective} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <AdvisoryBlock label="Sofortmassnahme" text={agenda.recommendation.immediate} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
            <AdvisoryBlock label="Mittelfristige Massnahme" text={agenda.recommendation.midTerm} tone="#a16207" background="#fefce8" border="#fde68a" />
            <AdvisoryBlock label="Strategische Massnahme" text={agenda.recommendation.strategic} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
          </div>

          {data?.quick_wins?.length > 0 && (
            <SectionList title="Sofort realisierbare Hebel" items={data.quick_wins.slice(0, 3)} tone="#15803d" background="#f0fdf4" border="#bbf7d0" />
          )}

          {sourceRecommendations.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {agenda.items.map((item, index) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  original={sourceRecommendations[index]}
                  onCreateTask={createTask}
                  state={created[sourceRecommendations[index]?.id]}
                />
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <SectionList title="Strategische Prioritaeten" items={data?.strategic?.slice(0, 3)} tone="#1d4ed8" background="#eff6ff" border="#bfdbfe" />
            <SectionList title="Top-Chancen" items={data?.opportunities?.slice(0, 3)} tone="#15803d" background="#f0fdf4" border="#bbf7d0" />
            <SectionList title="Top-Risiken" items={data?.risks?.slice(0, 3)} tone="#b91c1c" background="#fef2f2" border="#fecaca" />
          </div>

          {data?.role_priorities?.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                AI-Team Priorisierung
              </div>
              {data.role_priorities.map((entry) => (
                <div key={entry.role} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                    {entry.role === "CEO" ? "AI CEO" : entry.role === "COO" ? "AI COO" : entry.role === "CMO" ? "AI CMO" : entry.role === "CFO" ? "AI CFO" : `AI ${entry.role}`}
                  </div>
                  <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                    <strong>Sofort:</strong> {(entry.immediate || []).join(" • ") || "Keine Angabe"}
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
                    <strong>Mittelfristig:</strong> {(entry.mid_term || []).join(" • ") || "Keine Angabe"}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                    <strong>Langfristig:</strong> {(entry.long_term || []).join(" • ") || "Keine Angabe"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
