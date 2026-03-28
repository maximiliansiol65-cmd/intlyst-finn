import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import InlineTip from "../components/onboarding/InlineTip";

const severityColors = {
  critical: "#b91c1c",
  high: "#ea580c",
  medium: "#2563eb",
  low: "#475569",
};

function SectionCard({ title, subtitle, children }) {
  return (
    <section
      className="card"
      style={{
        padding: "var(--s-5)",
        display: "grid",
        gap: "var(--s-4)",
      }}
    >
      <div>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function StatPill({ label, value }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--r-md)",
        background: "var(--c-surface-2)",
        border: "1px solid var(--c-border)",
      }}
    >
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function EventCard({ event, onInspect }) {
  const color = severityColors[event.severity] || severityColors.low;
  return (
    <div
      style={{
        border: `1px solid ${color}22`,
        borderLeft: `4px solid ${color}`,
        borderRadius: "var(--r-md)",
        padding: "var(--s-4)",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", gap: "var(--s-3)", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge badge-neutral badge-sm">{event.metric_label}</span>
            <span className="badge badge-sm" style={{ background: `${color}14`, color }}>
              {event.severity}
            </span>
            {event.early_warning && <span className="badge badge-warning badge-sm">Frühwarnung</span>}
          </div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", marginTop: "var(--s-2)" }}>
            {event.summary}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => onInspect(event)}>
          Ursachen
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
        <div>
          <div className="label">Aktuell</div>
          <div style={{ fontWeight: 600 }}>{event.current_value}</div>
        </div>
        <div>
          <div className="label">Baseline</div>
          <div style={{ fontWeight: 600 }}>{event.baseline_value}</div>
        </div>
        <div>
          <div className="label">Delta</div>
          <div style={{ fontWeight: 600, color }}>{event.delta_pct > 0 ? "+" : ""}{event.delta_pct}%</div>
        </div>
        <div>
          <div className="label">Confidence</div>
          <div style={{ fontWeight: 600 }}>{event.confidence}%</div>
        </div>
      </div>
    </div>
  );
}

function CausePanel({ item }) {
  if (!item) {
    return (
      <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
        Wähle ein Signal aus, um die Ursachenanalyse zu sehen.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--s-3)" }}>
      {item.causes.map((cause) => (
        <div key={cause.cause} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)" }}>
            <div style={{ fontWeight: 600 }}>{cause.label}</div>
            <div style={{ color: "var(--c-text-2)", fontWeight: 600 }}>{cause.probability}%</div>
          </div>
          <div style={{ marginTop: 6, color: "var(--c-text-2)", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{cause.evidence}</div>
          {cause.data_gaps?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              Datenlücken: {cause.data_gaps.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({ item, onRequest, onSimulate, busy }) {
  return (
    <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: item.is_primary_one_click ? "2px solid #111827" : "1px solid var(--c-border)", background: "#fff", boxShadow: item.is_primary_one_click ? "0 8px 30px rgba(17,24,39,0.08)" : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: "var(--s-2)" }}>
            <span className="badge badge-info badge-sm">{item.category}</span>
            <span className="badge badge-neutral badge-sm">{item.priority}</span>
            <span className="badge badge-success badge-sm">ROI {item.roi_label}</span>
            <span className="badge badge-neutral badge-sm">{item.action_type}</span>
            {item.is_primary_one_click && <span className="badge badge-warning badge-sm">Primary 1-Klick</span>}
          </div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{item.title}</div>
          <div style={{ marginTop: 6, color: "var(--c-text-2)", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{item.description}</div>
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onSimulate(item)}>
            Simulieren
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onRequest(item)}>
            {item.is_primary_one_click ? "Strategie starten" : "Zur Freigabe"}
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
        <div><div className="label">Impact</div><div style={{ fontWeight: 700 }}>{item.expected_impact_pct}%</div></div>
        <div><div className="label">Neue Kunden</div><div style={{ fontWeight: 700 }}>{item.expected_new_customers}</div></div>
        <div><div className="label">Reichweite</div><div style={{ fontWeight: 700 }}>+{item.expected_reach_uplift_pct}%</div></div>
        <div><div className="label">Risiko</div><div style={{ fontWeight: 700 }}>{item.risk_score}</div></div>
        <div><div className="label">Zeit</div><div style={{ fontWeight: 700 }}>{item.estimated_hours}h</div></div>
        <div><div className="label">Owner</div><div style={{ fontWeight: 700 }}>{item.owner_role}</div></div>
      </div>
      <div style={{ marginTop: "var(--s-3)", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
        Grund: {item.rationale}
      </div>
      {item.execution_plan && (
        <div style={{ marginTop: "var(--s-3)", padding: "var(--s-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-sm)" }}>
          <div className="label" style={{ marginBottom: 6 }}>1-Klick-Plan</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>
            Systeme: {(item.execution_plan.systems || []).join(", ")}
          </div>
          <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
            {(item.execution_plan.rollout_steps || []).map((step) => (
              <div key={step} style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>{step}</div>
            ))}
          </div>
        </div>
      )}
      {item.prepared_assets && (
        <div style={{ marginTop: "var(--s-3)", padding: "var(--s-3)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)" }}>
          <div className="label" style={{ marginBottom: 6 }}>Vorbereitet vor dem Klick</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)", marginBottom: 6 }}>
            E-Mail: {item.prepared_assets.email?.subject}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)", marginBottom: 6 }}>
            Social: {(item.prepared_assets.social_posts || []).map((post) => post.channel).join(", ")}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>
            Team-Tasks: {(item.prepared_assets.team_tasks || []).map((task) => task.title).join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ item, onApprove, onReject, onArtifact, onSyncLive, busyId, artifact }) {
  const stageLabels = {
    draft: "Entwurf",
    queued: "Vorbereitet",
    running: "Läuft",
    awaiting_second_approval: "Wartet auf 2. Freigabe",
    rejected: "Abgelehnt",
  };
  return (
    <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: "var(--s-2)" }}>
            <span className="badge badge-neutral badge-sm">{item.status}</span>
            <span className="badge badge-info badge-sm">{item.execution_type}</span>
            <span className="badge badge-sm" style={{ background: "#11182712", color: "#111827" }}>{item.priority}</span>
            <span className="badge badge-neutral badge-sm">{stageLabels[item.progress_stage] || item.progress_stage}</span>
            {item.approval_policy?.required_role && (
              <span className="badge badge-warning badge-sm">Need {item.approval_policy.required_role}</span>
            )}
          </div>
          <div style={{ fontWeight: 700 }}>{item.title}</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>{item.description}</div>
          {item.execution_summary && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              Ausführung: {item.execution_summary} · Fortschritt: {item.progress_pct || 0}%
            </div>
          )}
          {artifact && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.7 }}>
              {artifact.type && <div>Type: {artifact.type}</div>}
              {artifact.report_id && <div>Report ID: {artifact.report_id}</div>}
              {artifact.task_id && <div>Task ID: {artifact.task_id}</div>}
              {artifact.mailchimp?.campaign_id && <div>Mailchimp Campaign: {artifact.mailchimp.campaign_id}</div>}
              {artifact.hubspot?.task_id && <div>HubSpot Task: {artifact.hubspot.task_id}</div>}
              {artifact.trello?.card_id && <div>Trello Card: {artifact.trello.card_id}</div>}
              {artifact.notion?.page_id && <div>Notion Page: {artifact.notion.page_id}</div>}
              {artifact.slack?.status_code && <div>Slack Status: {artifact.slack.status_code}</div>}
              {artifact.webhook?.status_code && <div>Webhook Status: {artifact.webhook.status_code}</div>}
            </div>
          )}
          {item.live_feedback?.aggregate && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.7 }}>
              <div>Live-Sync: {item.last_live_sync_at ? new Date(item.last_live_sync_at).toLocaleString() : "aktiv"}</div>
              {item.live_feedback.aggregate.open_rate != null && <div>Open Rate: {item.live_feedback.aggregate.open_rate}%</div>}
              {item.live_feedback.aggregate.click_rate != null && <div>Click Rate: {item.live_feedback.aggregate.click_rate}%</div>}
              {item.live_feedback.aggregate.revenue_uplift_pct != null && <div>Revenue Uplift: {item.live_feedback.aggregate.revenue_uplift_pct}%</div>}
              {item.live_feedback.aggregate.reach_uplift_pct != null && <div>Reach Uplift: {item.live_feedback.aggregate.reach_uplift_pct}%</div>}
            </div>
          )}
          {item.execution_plan && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.7 }}>
              <div>Systeme: {(item.execution_plan.systems || []).join(", ")}</div>
              <div>Metrics: {(item.execution_plan.success_metrics || []).join(", ")}</div>
              {item.next_action_text && <div>Nächster Schritt: {item.next_action_text}</div>}
            </div>
          )}
          {item.review_history?.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              <div className="label">Review-Historie</div>
              {item.review_history.map((review) => (
                <div key={review.id} style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                  {review.reviewer_role} · {review.reviewer_email} · {review.decision}
                </div>
              ))}
            </div>
          )}
        </div>
        {item.status !== "executed" && item.status !== "rejected" ? (
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <button className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => onReject(item.id)}>Ablehnen</button>
            <button className="btn btn-primary btn-sm" disabled={busyId === item.id} onClick={() => onApprove(item.id)}>Freigeben</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <button className="btn btn-secondary btn-sm" disabled={busyId === `artifact-${item.id}`} onClick={() => onArtifact(item.id)}>
              Artifact
            </button>
            {item.status === "executed" && (
              <button className="btn btn-primary btn-sm" disabled={busyId === `sync-${item.id}`} onClick={() => onSyncLive(item.id)}>
                Live Sync
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Ceo() {
  const { authHeader } = useAuth();
  const navigate = useNavigate();
  const [briefing, setBriefing] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [selectedCause, setSelectedCause] = useState(null);
  const [causeOverview, setCauseOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [learning, setLearning] = useState(null);
  const [outcomes, setOutcomes] = useState([]);
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const [artifacts, setArtifacts] = useState({});
  const [eventFilter, setEventFilter] = useState("all");
  const [eventQuery, setEventQuery] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");

  const causeItems = useMemo(() => causeOverview?.items || [], [causeOverview]);
  const topCauseRows = useMemo(() => causeItems.slice(0, 6), [causeItems]);

  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    return (briefing?.events || []).filter((event) => {
      if (eventFilter === "critical" && event.severity !== "critical") return false;
      if (eventFilter === "high" && event.severity !== "high") return false;
      if (eventFilter === "early" && !event.early_warning) return false;
      if (eventFilter === "positive" && event.delta_pct <= 0) return false;
      if (eventFilter === "negative" && event.delta_pct >= 0) return false;
      if (!query) return true;
      const haystack = `${event.summary} ${event.metric_label}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [briefing, eventFilter, eventQuery]);

  const filteredApprovals = useMemo(() => {
    return approvals.filter((item) => {
      if (approvalFilter === "all") return true;
      if (approvalFilter === "open") return item.status !== "executed" && item.status !== "rejected";
      if (approvalFilter === "running") return item.progress_stage === "running";
      if (approvalFilter === "executed") return item.status === "executed";
      if (approvalFilter === "rejected") return item.status === "rejected";
      return true;
    });
  }, [approvals, approvalFilter]);

  async function fetchBriefing() {
    setLoading(true);
    setError(null);
    try {
      const [briefingRes, approvalsRes, outcomesRes, causesRes] = await Promise.all([
        fetch("/api/decision/briefing", { headers: authHeader() }),
        fetch("/api/action-requests", { headers: authHeader() }),
        fetch("/api/learning/outcomes", { headers: authHeader() }),
        fetch("/api/decision/causes", { headers: authHeader() }),
      ]);
      if (!briefingRes.ok || !approvalsRes.ok || !outcomesRes.ok || !causesRes.ok) {
        throw new Error("CEO-Daten konnten nicht geladen werden.");
      }
      const briefingData = await briefingRes.json();
      const approvalsData = await approvalsRes.json();
      const outcomesData = await outcomesRes.json();
      const causesData = await causesRes.json();
      const learningRes = await fetch("/api/learning/summary", { headers: authHeader() });
      const learningData = learningRes.ok ? await learningRes.json() : null;
      setBriefing(briefingData);
      setApprovals(approvalsData.items || []);
      setLearning(learningData);
      setOutcomes(outcomesData.items || []);
      setCauseOverview(causesData);
    } catch (err) {
      setError(err.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBriefing();
  }, []); // eslint-disable-line

  async function inspectCauses(event) {
    setBusyId(event.id);
    try {
      const res = await fetch(`/api/decision/events/${encodeURIComponent(event.id)}/causes`, {
        headers: authHeader(),
      });
      if (!res.ok) throw new Error();
      setSelectedCause(await res.json());
    } catch {
      setSelectedCause({ event, causes: [] });
    } finally {
      setBusyId(null);
    }
  }

  async function createRequest(item) {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/action-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          event_id: item.event_id,
          recommendation_id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          impact_score: item.impact_score,
          risk_score: item.risk_score,
          estimated_hours: item.estimated_hours,
          execution_type: item.action_type,
          template_name: `${item.category}_${item.action_type}`,
          target_systems: item.execution_plan?.systems || [],
        }),
      });
      if (!res.ok) throw new Error();
      await fetchBriefing();
    } finally {
      setBusyId(null);
    }
  }

  async function simulateRequest(item) {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/action-requests/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          event_id: item.event_id,
          recommendation_id: item.id,
          title: item.title,
          impact_score: item.impact_score,
          risk_score: item.risk_score,
          estimated_hours: item.estimated_hours,
          category: item.category,
        }),
      });
      if (!res.ok) throw new Error();
      setSimulation(await res.json());
    } finally {
      setBusyId(null);
    }
  }

  async function approveRequest(id) {
    setBusyId(id);
    try {
      await fetch(`/api/action-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ execute_now: true }),
      });
      await fetchBriefing();
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRequest(id) {
    setBusyId(id);
    try {
      await fetch(`/api/action-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ note: "Vom Nutzer abgelehnt" }),
      });
      await fetchBriefing();
    } finally {
      setBusyId(null);
    }
  }

  async function loadArtifact(id) {
    setBusyId(`artifact-${id}`);
    try {
      const res = await fetch(`/api/action-requests/${id}/artifact`, { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setArtifacts((prev) => ({ ...prev, [id]: data.artifact }));
    } finally {
      setBusyId(null);
    }
  }

  async function syncLive(id) {
    setBusyId(`sync-${id}`);
    try {
      await fetch(`/api/action-requests/${id}/sync-live`, {
        method: "POST",
        headers: authHeader(),
      });
      await fetchBriefing();
    } finally {
      setBusyId(null);
    }
  }

  async function saveOutcome(outcomeId) {
    const actual = Number(outcomeDrafts[outcomeId]);
    if (!Number.isFinite(actual)) return;
    setBusyId(`outcome-${outcomeId}`);
    try {
      await fetch(`/api/learning/outcomes/${outcomeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          actual_impact_pct: actual,
          actual_roi_score: actual * 1.2,
          learning_note: "Vom Nutzer bestätigt",
          status: "completed",
        }),
      });
      await fetchBriefing();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div style={{ padding: "var(--s-6)" }}>CEO-System lädt...</div>;
  }

  if (error) {
    return <div style={{ padding: "var(--s-6)", color: "var(--c-danger)" }}>{error}</div>;
  }

  return (
    <div style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-5)" }}>
      <SectionCard title="CEO Command Center" subtitle={briefing?.summary}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--s-3)" }}>
          <StatPill label="Signale" value={briefing?.counts?.events ?? 0} />
          <StatPill label="Kritisch" value={briefing?.counts?.critical ?? 0} />
          <StatPill label="Frühwarnungen" value={briefing?.counts?.early_warnings ?? 0} />
          <StatPill label="Empfehlungen" value={briefing?.counts?.recommendations ?? 0} />
          <StatPill label="Externe Signale" value={briefing?.counts?.external_signals ?? 0} />
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchBriefing}>
            Aktualisieren
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/analyse")}>
            Statistiken öffnen
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Warum ist das passiert?" subtitle="Top-Ursachen inkl. Impact-Score und internen/externen Faktoren">
        {topCauseRows.length === 0 ? (
          <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
            Noch keine Ursache gefunden – prüfe deine Metrik-Integration.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--s-3)" }}>
            {topCauseRows.map((item) => (
              <div
                key={item.event_id}
                className="card"
                style={{
                  border: "1px solid var(--c-border)",
                  borderLeft: `4px solid ${item.direction === "down" ? "#dc2626" : "#16a34a"}`,
                  padding: "var(--s-3)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedCause({ event: item, causes: item.top_causes })}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px) scale(1.01)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.metric_label}</div>
                    <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>{item.summary}</div>
                  </div>
                  <span className="badge badge-sm">{item.direction === "down" ? "negativ" : "positiv"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                  <StatPill label="Delta" value={`${item.delta_pct}%`} />
                  <StatPill label="Confidence" value={`${item.confidence}%`} />
                </div>
                <div style={{ marginTop: "var(--s-3)", display: "grid", gap: "var(--s-2)" }}>
                  {(item.top_causes || []).map((cause) => (
                    <div key={cause.cause} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--s-2)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontWeight: 600 }}>{cause.label}</div>
                        <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-xs)" }}>
                          {cause.evidence}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span className="badge badge-neutral badge-sm">{cause.factor_type}</span>
                        <span className="badge badge-success badge-sm">{cause.impact_level}</span>
                        <span className="badge badge-info badge-sm">{cause.impact_score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)", gap: "var(--s-5)" }}>
        <SectionCard title="Decision Events" subtitle="Veränderungen und Anomalien mit Frühwarnung">
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              {[
                { key: "all", label: "Alle" },
                { key: "critical", label: "Kritisch" },
                { key: "high", label: "High" },
                { key: "early", label: "Frühwarnung" },
                { key: "positive", label: "Positiv" },
                { key: "negative", label: "Negativ" },
              ].map((option) => (
                <button
                  key={option.key}
                  className={`btn ${eventFilter === option.key ? "btn-primary" : "btn-secondary"} btn-sm`}
                  onClick={() => setEventFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              value={eventQuery}
              onChange={(e) => setEventQuery(e.target.value)}
              placeholder="Signale durchsuchen"
              style={{
                padding: "10px 12px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--c-border)",
              }}
            />
          </div>
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            {filteredEvents.length === 0 ? (
              <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
                Keine passenden Signale für die aktuelle Filterung.
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} onInspect={inspectCauses} />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Ursachenanalyse" subtitle={selectedCause?.event?.metric_label || "Noch kein Signal ausgewählt"}>
          <CausePanel item={selectedCause} />
        </SectionCard>
      </div>

      <SectionCard title="Strategische Maßnahmen" subtitle="Empfehlungen mit Impact-, Risiko- und Zeitbewertung">
        <InlineTip
          id="recommendations_basics"
          title="Empfehlungen umsetzen"
          text="Jede Empfehlung kann als 1-Klick-Strategie vorbereitet werden. Nutze „Simulieren“ für den Effekt, „Strategie starten“ für die Freigabe."
        />
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {(briefing?.recommendations || []).map((item) => (
            <RecommendationCard
              key={item.id}
              item={{
                ...item,
                execution_plan: item.execution_plan || {
                  systems: item.action_type === "report" ? ["intlyst_reports", "notion", "slack"] : item.action_type === "email_draft" ? ["intlyst_email_draft", "mailchimp", "slack"] : ["intlyst_tasks", "hubspot", "trello", "slack"],
                  rollout_steps: [
                    "1. Empfehlung in ausfuhrbaren Draft übersetzen",
                    "2. Zielsysteme vorbereiten und Artefakt erzeugen",
                    "3. Ergebnis für Learning Loop und Live-Sync protokollieren",
                  ],
                },
              }}
              busy={busyId === item.id}
              onRequest={createRequest}
              onSimulate={simulateRequest}
            />
          ))}
        </div>
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--s-5)" }}>
        <SectionCard title="Szenario-Simulation" subtitle="Vorab prüfen, bevor etwas freigegeben wird">
          {!simulation ? (
            <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
              Wähle bei einer Empfehlung „Simulieren“, um die erwartete KPI-Wirkung und Guardrails zu sehen.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "var(--s-3)" }}>
              <div style={{ fontWeight: 700 }}>{simulation.summary}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--s-3)" }}>
                <StatPill label="Szenario" value={simulation.scenario} />
                <StatPill label="KPI Uplift" value={`${simulation.projected?.kpi_uplift_pct ?? 0}%`} />
                <StatPill label="ROI Score" value={simulation.projected?.roi_score ?? 0} />
                <StatPill label="Confidence" value={`${simulation.projected?.confidence ?? 0}%`} />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Guardrails</div>
                <div style={{ display: "grid", gap: "var(--s-2)" }}>
                  {(simulation.guardrails || []).map((item) => (
                    <div key={item} style={{ color: "var(--c-text-2)", fontSize: "var(--text-sm)" }}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Externe Signale" subtitle="Markt, Wettbewerb und saisonale Frühindikatoren">
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            {(briefing?.external_signals || []).map((signal) => (
              <div key={signal.title} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)" }}>
                  <div style={{ fontWeight: 700 }}>{signal.title}</div>
                  <span className="badge badge-neutral badge-sm">{signal.impact_window_days} Tage</span>
                </div>
                <div style={{ marginTop: 6, color: "var(--c-text-2)", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{signal.description}</div>
                <div style={{ marginTop: 8, color: "var(--c-text-3)", fontSize: "var(--text-xs)" }}>
                  Quelle: {signal.source} · Confidence: {signal.confidence}% · Richtung: {signal.direction}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Freigaben & Ausführung" subtitle="Jede Aktion bleibt bis zur Freigabe kontrolliert">
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          {[
            { key: "all", label: "Alle" },
            { key: "open", label: "Offen" },
            { key: "running", label: "Läuft" },
            { key: "executed", label: "Ausgeführt" },
            { key: "rejected", label: "Abgelehnt" },
          ].map((option) => (
            <button
              key={option.key}
              className={`btn ${approvalFilter === option.key ? "btn-primary" : "btn-secondary"} btn-sm`}
              onClick={() => setApprovalFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {filteredApprovals.length === 0 && (
            <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
              Noch keine Freigaben vorhanden.
            </div>
          )}
          {filteredApprovals.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={approveRequest}
              onReject={rejectRequest}
              onArtifact={loadArtifact}
              onSyncLive={syncLive}
              busyId={busyId}
              artifact={artifacts[item.id]}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Fortschritts-Tracking" subtitle="Nach der Umsetzung läuft das System weiter">
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {approvals.filter((item) => item.status === "executed").length === 0 && (
            <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
              Noch keine laufende Maßnahme vorhanden.
            </div>
          )}
          {approvals.filter((item) => item.status === "executed").map((item) => (
            <div key={`progress-${item.id}`} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)" }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontWeight: 700 }}>{item.progress_pct || 0}%</div>
              </div>
              <div style={{ marginTop: 8, height: 8, background: "var(--c-surface-2)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${item.progress_pct || 0}%`, height: "100%", background: "#111827" }} />
              </div>
              {item.next_action_text && (
                <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                  Nächste Handlung: {item.next_action_text}
                </div>
              )}
              {item.live_feedback?.aggregate && (
                <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                  Live-Signal: {item.live_feedback.aggregate.last_source || "extern"} · zuletzt synchronisiert {item.last_live_sync_at ? new Date(item.last_live_sync_at).toLocaleString() : "gerade eben"}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Learning Loop" subtitle={learning?.message || "Ergebnisbewertung und Modellkalibrierung"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--s-3)" }}>
          <StatPill label="Accuracy" value={`${learning?.overall_accuracy || 0}%`} />
          <StatPill label="Tracked" value={learning?.tracked_recommendations || 0} />
          <StatPill label="Predicted Impact" value={`${learning?.avg_predicted_impact || 0}%`} />
          <StatPill label="Actual Impact" value={`${learning?.avg_actual_impact || 0}%`} />
        </div>
      </SectionCard>

      <SectionCard title="Outcome Tracking" subtitle="Reale Ergebnisse zurück in das System spielen">
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {outcomes.length === 0 && (
            <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
              Sobald freigegebene Aktionen ausgeführt werden, erscheinen sie hier zur Ergebnisrückmeldung.
            </div>
          )}
          {outcomes.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                  <div style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                    Prognose: {item.predicted_impact_pct || 0}% · Status: {item.status}
                  </div>
                  {item.learning_note && (
                    <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                      {item.learning_note}
                    </div>
                  )}
                </div>
                <span className="badge badge-neutral badge-sm">{item.category}</span>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="number"
                  placeholder="Realer Impact %"
                  value={outcomeDrafts[item.id] ?? ""}
                  onChange={(e) => setOutcomeDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--c-border)",
                    minWidth: 180,
                  }}
                />
                <button className="btn btn-primary btn-sm" disabled={busyId === `outcome-${item.id}`} onClick={() => saveOutcome(item.id)}>
                  Outcome speichern
                </button>
                {item.actual_impact_pct != null && (
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
                    Aktuell erfasst: {item.actual_impact_pct}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
