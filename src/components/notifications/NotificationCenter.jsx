/* eslint-disable */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const PRIORITY = {
  critical: { label: "Kritisch", color: "var(--c-danger)",  bg: "var(--c-danger-light)",  icon: "⚠" },
  high:     { label: "Wichtig",  color: "var(--c-warning)", bg: "var(--c-warning-light)", icon: "!" },
  medium:   { label: "Info",     color: "var(--c-primary)", bg: "var(--c-primary-light)", icon: "i" },
  low:      { label: "Info",     color: "var(--c-primary)", bg: "var(--c-primary-light)", icon: "i" },
};

function getPriority(alert) {
  const t = (alert.alert_type || alert.severity || "").toLowerCase();
  if (t.includes("critical") || t.includes("error"))   return "critical";
  if (t.includes("warning") || t.includes("high"))     return "high";
  return "medium";
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "gerade eben";
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d !== 1 ? "en" : ""}`;
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { authHeader } = useAuth();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [read, setRead] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("notif_read") || "[]")); }
    catch { return new Set(); }
  });
  const panelRef = useRef(null);
  const btnRef   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?limit=30", { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.alerts ?? []);
      setAlerts(list);
    } catch { }
    finally { setLoading(false); }
  }, [authHeader]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function keyHandler(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  function markRead(id) {
    setRead(prev => {
      const next = new Set([...prev, id]);
      localStorage.setItem("notif_read", JSON.stringify([...next]));
      return next;
    });
  }

  function markAllRead() {
    const ids = alerts.map(a => a.id);
    setRead(prev => {
      const next = new Set([...prev, ...ids]);
      localStorage.setItem("notif_read", JSON.stringify([...next]));
      return next;
    });
  }

  function handleClick(alert) {
    markRead(alert.id);
    setOpen(false);
    navigate("/settings?tab=benachrichtigungen");
  }

  const unread = alerts.filter(a => !read.has(a.id) && !a.is_read);

  // Group by priority
  const grouped = {
    critical: alerts.filter(a => getPriority(a) === "critical"),
    high:     alerts.filter(a => getPriority(a) === "high"),
    medium:   alerts.filter(a => getPriority(a) === "medium" || getPriority(a) === "low"),
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        className="topnav-icon-btn"
        onClick={() => setOpen(v => !v)}
        aria-label={unread.length > 0 ? `${unread.length} ungelesene Benachrichtigungen` : "Benachrichtigungen"}
        aria-expanded={open}
        title="Benachrichtigungen"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 1.5A5 5 0 004 6.5v3l-1.5 2.5h13L14 9.5v-3A5 5 0 009 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M7 15.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        {unread.length > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div ref={panelRef} className="notif-panel" role="dialog" aria-label="Benachrichtigungen">
          <div className="notif-panel-header">
            <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>Benachrichtigungen</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unread.length > 0 && (
                <button
                  style={{ fontSize: "var(--text-xs)", color: "var(--c-primary)", background: "none", cursor: "pointer" }}
                  onClick={markAllRead}
                >
                  Alle gelesen
                </button>
              )}
              <button
                style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", background: "none", cursor: "pointer" }}
                onClick={() => { setOpen(false); navigate("/settings?tab=benachrichtigungen"); }}
              >
                Alle anzeigen →
              </button>
            </div>
          </div>

          <div className="notif-panel-body">
            {loading && (
              <div style={{ padding: "var(--s-8)", textAlign: "center" }}>
                <span className="spinner" aria-label="Lädt" />
              </div>
            )}

            {!loading && alerts.length === 0 && (
              <div style={{ padding: "var(--s-8)", textAlign: "center", color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                Alles erledigt — keine Benachrichtigungen
              </div>
            )}

            {!loading && (
              <>
                {grouped.critical.length > 0 && (
                  <NotifGroup
                    label="Kritisch"
                    items={grouped.critical}
                    read={read}
                    onMark={markRead}
                    onClick={handleClick}
                  />
                )}
                {grouped.high.length > 0 && (
                  <NotifGroup
                    label="Wichtig"
                    items={grouped.high}
                    read={read}
                    onMark={markRead}
                    onClick={handleClick}
                  />
                )}
                {grouped.medium.length > 0 && (
                  <NotifGroup
                    label="Info"
                    items={grouped.medium}
                    read={read}
                    onMark={markRead}
                    onClick={handleClick}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifGroup({ label, items, read, onMark, onClick }) {
  const meta = PRIORITY[label === "Kritisch" ? "critical" : label === "Wichtig" ? "high" : "medium"];
  return (
    <div>
      <div className="notif-group-label" style={{ color: meta.color }}>
        {label} ({items.length})
      </div>
      {items.slice(0, 5).map(a => {
        const isRead = read.has(a.id) || a.is_read;
        return (
          <button
            key={a.id}
            className={`notif-item${isRead ? " read" : ""}`}
            onClick={() => onClick(a)}
          >
            <span
              className="notif-dot"
              style={{ background: isRead ? "var(--c-text-4)" : meta.color }}
              aria-hidden="true"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="notif-item-title">{a.title || a.message || "Benachrichtigung"}</div>
              {a.message && a.title && (
                <div className="notif-item-desc">{a.message}</div>
              )}
              <div className="notif-item-time">{relTime(a.created_at)}</div>
            </div>
            {!isRead && (
              <button
                className="notif-mark-btn"
                onClick={e => { e.stopPropagation(); onMark(a.id); }}
                title="Als gelesen markieren"
              >
                ✓
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
}
