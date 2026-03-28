import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import InlineTip from "../components/onboarding/InlineTip";

// ── Severity config — zero hardcoded colors ───────────────────────────────
const SEV_MAP = {
  kritisch: {
    badgeClass: "badge badge-danger",
    borderColor: "var(--c-danger)",
    accentColor: "var(--c-danger)",
    label: "Kritisch",
  },
  mittel: {
    badgeClass: "badge badge-warning",
    borderColor: "var(--c-warning)",
    accentColor: "var(--c-warning)",
    label: "Mittel",
  },
  info: {
    badgeClass: "badge badge-info",
    borderColor: "var(--c-primary)",
    accentColor: "var(--c-primary)",
    label: "Info",
  },
};

function mapSeverity(raw) {
  if (!raw) return "info";
  const s = String(raw).toLowerCase();
  if (s === "high" || s === "kritisch" || s === "critical" || s === "dringend") return "kritisch";
  if (s === "medium" || s === "mittel" || s === "warning") return "mittel";
  return "info";
}

// ── Timestamp helper ──────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return "gerade eben";
  if (diff < 3600)  return `vor ${Math.floor(diff / 60)} Minuten`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Stunden`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

// ── Skeleton card ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderLeft: "4px solid var(--c-border-2)",
        borderRadius: "0 var(--r-md) var(--r-md) 0",
        padding: "var(--s-4) var(--s-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
        <div className="skeleton" style={{ width: 64, height: 22, borderRadius: "var(--r-full)" }} />
        <div className="skeleton skeleton-text" style={{ flex: 1, height: 18 }} />
        <div className="skeleton skeleton-text" style={{ width: 80, height: 14 }} />
      </div>
      <div className="skeleton skeleton-text" style={{ width: "88%" }} />
      <div className="skeleton skeleton-text" style={{ width: "65%" }} />
      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-1)" }}>
        <div className="skeleton" style={{ width: 140, height: 30, borderRadius: "var(--r-sm)" }} />
        <div className="skeleton" style={{ width: 110, height: 30, borderRadius: "var(--r-sm)" }} />
      </div>
    </div>
  );
}

// ── KPI Mini-card ─────────────────────────────────────────────────────────
function KpiMini({ label, value, accentColor }) {
  return (
    <div
      className="card card-sm"
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-1)",
      }}
    >
      <span
        className="tabular"
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 700,
          color: accentColor || "var(--c-text)",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span className="label">{label}</span>
    </div>
  );
}

// ── Alert Card ────────────────────────────────────────────────────────────
function AlertCard({ alert, onMarkRead, onCreateTask }) {
  const sevKey = mapSeverity(alert.severity);
  const sev    = SEV_MAP[sevKey];
  const [readBusy, setReadBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);

  async function handleRead() {
    setReadBusy(true);
    await onMarkRead(alert.id);
    setReadBusy(false);
  }

  async function handleTask() {
    setTaskBusy(true);
    await onCreateTask(alert);
    setTaskBusy(false);
  }

  return (
    <div
      style={{
        background: alert.is_read ? "var(--c-surface-2)" : "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderLeft: `4px solid ${sev.borderColor}`,
        borderRadius: "0 var(--r-md) var(--r-md) 0",
        padding: "var(--s-4) var(--s-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-2)",
        opacity: alert.is_read ? 0.8 : 1,
        transition:
          "opacity var(--dur-base) ease, background var(--dur-base) ease, box-shadow var(--dur-base) ease",
      }}
    >
      {/* Header row: badge + title + timestamp */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          flexWrap: "wrap",
        }}
      >
        <span className={sev.badgeClass}>{sev.label}</span>
        <span
          style={{
            fontSize: "var(--text-md)",
            fontWeight: 600,
            color: "var(--c-text)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {alert.title}
        </span>
        <span
          className="text-sm"
          style={{ color: "var(--c-text-3)", flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {timeAgo(alert.created_at)}
        </span>
      </div>

      {/* Description */}
      {alert.message && (
        <p
          className="text-md"
          style={{
            margin: 0,
            color: "var(--c-text-2)",
            lineHeight: "var(--lh-base)",
          }}
        >
          {alert.message}
        </p>
      )}

      {/* KI-Erklärung */}
      {alert.ai_explanation && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            fontStyle: "italic",
            color: "var(--c-text-3)",
            lineHeight: "var(--lh-base)",
          }}
        >
          ✦ {alert.ai_explanation}
        </p>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          marginTop: "var(--s-1)",
          flexWrap: "wrap",
        }}
      >
        {!alert.is_read && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRead}
            disabled={readBusy}
          >
            {readBusy ? "…" : "Als gelesen markieren"}
          </button>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleTask}
          disabled={taskBusy}
        >
          {taskBusy ? "…" : "Task erstellen"}
        </button>
      </div>
    </div>
  );
}

// ── Filter pill group ─────────────────────────────────────────────────────
function PillGroup({ options, active, onChange }) {
  return (
    <div className="tabs-pill">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`tab-pill${active === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Filter definitions ────────────────────────────────────────────────────
const SEV_FILTERS = [
  { value: null,       label: "Alle"     },
  { value: "kritisch", label: "Kritisch" },
  { value: "mittel",   label: "Mittel"   },
  { value: "info",     label: "Info"     },
];

const TYPE_FILTERS = [
  { value: null,         label: "Alle"       },
  { value: "umsatz",     label: "Umsatz"     },
  { value: "traffic",    label: "Traffic"    },
  { value: "conversion", label: "Conversion" },
  { value: "system",     label: "System"     },
];

// ── Page ──────────────────────────────────────────────────────────────────
export default function Alerts() {
  const { authHeader } = useAuth();

  const [alerts,    setAlerts]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [retryKey,  setRetryKey]  = useState(0);
  const [mounted,   setMounted]   = useState(false);

  // Local filters — no API re-call on change
  const [sevFilter,  setSevFilter]  = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load all alerts once (+ on retry)
  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/alerts?limit=100", {
          headers: authHeader(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setAlerts(Array.isArray(data) ? data : (data.alerts ?? []));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Fehler beim Laden der Alerts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAlerts();
    return () => { cancelled = true; };
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Optimistic mark-read ────────────────────────────────────────────────
  async function handleMarkRead(id) {
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
    );
    try {
      await fetch(`/api/alerts/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ is_read: true }),
      });
    } catch {
      // On failure the optimistic state stays; UI remains consistent
    }
  }

  // ── Mark all read ───────────────────────────────────────────────────────
  async function handleMarkAllRead() {
    const ids = alerts.filter((a) => !a.is_read).map((a) => a.id);
    // Optimistic
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/alerts/${id}/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ is_read: true }),
        })
      )
    );
  }

  // ── Create task from alert ──────────────────────────────────────────────
  async function handleCreateTask(alert) {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          title: alert.title,
          description: alert.message || "",
          source_alert_id: alert.id,
          priority:
            mapSeverity(alert.severity) === "kritisch" ? "high" : "medium",
        }),
      });
    } catch {
      // Fire-and-forget; no UI feedback needed here
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────
  const totalCount    = alerts.length;
  const kritischCount = alerts.filter((a) => mapSeverity(a.severity) === "kritisch").length;
  const mittelCount   = alerts.filter((a) => mapSeverity(a.severity) === "mittel").length;
  const unreadCount   = alerts.filter((a) => !a.is_read).length;

  // ── Client-side filtering ───────────────────────────────────────────────
  const visible = alerts.filter((a) => {
    if (sevFilter  && mapSeverity(a.severity) !== sevFilter) return false;
    if (typeFilter && (a.type || "").toLowerCase() !== typeFilter) return false;
    if (unreadOnly && a.is_read) return false;
    return true;
  });

  const hasActiveFilter = sevFilter !== null || typeFilter !== null || unreadOnly;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className={mounted ? "page-content page-enter" : "page-content"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--s-4)",
        }}
      >
        <div>
          <h1 className="page-title">Alerts</h1>
          {!loading && (
            <p className="page-subtitle">
              {unreadCount > 0 ? `${unreadCount} ungelesen` : "Alle gelesen"}
            </p>
          )}
        </div>
        {!loading && unreadCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleMarkAllRead}
          >
            Alle als gelesen markieren
          </button>
        )}
      </div>

      <InlineTip
        id="alerts_basics"
        title="Alerts richtig lesen"
        text="Kritisch bedeutet akuter Handlungsbedarf. Mittel heißt beobachten und priorisieren. Klicke auf eine Alert-Karte, um eine Task zu erzeugen oder die Ursachen nachzuverfolgen."
      />

      {/* Summary strip — 4 KPI mini-cards */}
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <KpiMini
          label="Gesamt"
          value={loading ? "–" : totalCount}
        />
        <KpiMini
          label="Kritisch"
          value={loading ? "–" : kritischCount}
          accentColor="var(--c-danger)"
        />
        <KpiMini
          label="Mittel"
          value={loading ? "–" : mittelCount}
          accentColor="var(--c-warning)"
        />
        <KpiMini
          label="Ungelesen"
          value={loading ? "–" : unreadCount}
          accentColor="var(--c-primary)"
        />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        <PillGroup
          options={SEV_FILTERS}
          active={sevFilter}
          onChange={setSevFilter}
        />
        <PillGroup
          options={TYPE_FILTERS}
          active={typeFilter}
          onChange={setTypeFilter}
        />

        {/* Nur ungelesene toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            cursor: "pointer",
            userSelect: "none",
            fontSize: "var(--text-sm)",
            color: "var(--c-text-2)",
            marginLeft: "auto",
          }}
        >
          <span className="toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </span>
          Nur ungelesene
        </label>
      </div>

      {/* Content area */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="card" style={{ padding: "var(--s-8)" }}>
          <div className="error-state">
            <div className="error-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <circle cx="12" cy="16" r="0.5" fill="currentColor" />
              </svg>
            </div>
            <p className="empty-title">Fehler beim Laden</p>
            <p className="empty-text">{error}</p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">
              {hasActiveFilter
                ? "Keine Alerts für diese Filter"
                : "Keine Alerts — alles im grünen Bereich ✓"}
            </p>
            {hasActiveFilter && (
              <p className="empty-text">
                Passe die Filter an, um weitere Alerts zu sehen.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
          {visible.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onMarkRead={handleMarkRead}
              onCreateTask={handleCreateTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
