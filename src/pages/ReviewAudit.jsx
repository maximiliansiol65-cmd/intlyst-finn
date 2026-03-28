import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../contexts/AuthContext";

function AuditCard({ item }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{item.title}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4 }}>
            {item.execution_type} · {item.status} · {item.progress_stage}
          </div>
        </div>
        <div style={{ fontWeight: 700 }}>{item.progress_pct || 0}%</div>
      </div>

      <div style={{ height: 8, background: "var(--c-surface-2)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${item.progress_pct || 0}%`, height: "100%", background: "#111827" }} />
      </div>

      {item.review_history?.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Reviews</div>
          <div style={{ display: "grid", gap: 4 }}>
            {item.review_history.map((review) => (
              <div key={review.id} style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                {review.reviewer_role} · {review.reviewer_email} · {review.decision}
              </div>
            ))}
          </div>
        </div>
      )}

      {item.artifact_payload && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Artifacts</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.7 }}>
            {item.artifact_payload.type && <div>Type: {item.artifact_payload.type}</div>}
            {item.artifact_payload.report?.report_id && <div>Report: {item.artifact_payload.report.report_id}</div>}
            {item.artifact_payload.mailchimp?.campaign_id && <div>Mailchimp: {item.artifact_payload.mailchimp.campaign_id}</div>}
            {item.artifact_payload.hubspot?.task_id && <div>HubSpot: {item.artifact_payload.hubspot.task_id}</div>}
            {item.artifact_payload.trello?.card_id && <div>Trello: {item.artifact_payload.trello.card_id}</div>}
            {item.artifact_payload.notion?.page_id && <div>Notion: {item.artifact_payload.notion.page_id}</div>}
            {item.artifact_payload.slack?.status_code && <div>Slack: {item.artifact_payload.slack.status_code}</div>}
            {item.artifact_payload.social_execution?.count != null && <div>Social Drafts: {item.artifact_payload.social_execution.count}</div>}
          </div>
        </div>
      )}

      {item.live_feedback?.aggregate && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Live Feedback</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.7 }}>
            <div>Quelle: {item.live_feedback.aggregate.last_source || "extern"}</div>
            {item.live_feedback.aggregate.open_rate != null && <div>Open Rate: {item.live_feedback.aggregate.open_rate}%</div>}
            {item.live_feedback.aggregate.click_rate != null && <div>Click Rate: {item.live_feedback.aggregate.click_rate}%</div>}
            {item.live_feedback.aggregate.revenue_uplift_pct != null && <div>Revenue Uplift: {item.live_feedback.aggregate.revenue_uplift_pct}%</div>}
            {item.last_live_sync_at && <div>Zuletzt synchronisiert: {new Date(item.last_live_sync_at).toLocaleString()}</div>}
          </div>
        </div>
      )}

      {item.next_action_text && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Nächster Schritt: {item.next_action_text}
        </div>
      )}
    </div>
  );
}

export default function ReviewAudit() {
  const { authHeader } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/action-requests", { headers: authHeader() })
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [authHeader]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.status === filter || item.progress_stage === filter);
  }, [items, filter]);

  return (
    <div style={{ padding: "var(--s-6)", maxWidth: 920, margin: "0 auto", display: "grid", gap: "var(--s-5)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>Review & Audit</h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 6 }}>
          Freigaben, Review-Historie, Artefakte und Fortschritt aller strategischen Umsetzungen.
        </p>
      </div>

      <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
        {["all", "pending_approval", "approved", "executed", "awaiting_second_approval", "rejected"].map((entry) => (
          <button
            key={entry}
            className="btn btn-secondary btn-sm"
            onClick={() => setFilter(entry)}
            style={{ background: filter === entry ? "#111827" : undefined, color: filter === entry ? "#fff" : undefined }}
          >
            {entry}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--c-text-3)" }}>Audit lädt…</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {filtered.map((item) => <AuditCard key={item.id} item={item} />)}
          {filtered.length === 0 && <div style={{ color: "var(--c-text-3)" }}>Keine Einträge für diesen Filter.</div>}
        </div>
      )}
    </div>
  );
}
