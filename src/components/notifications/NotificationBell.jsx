import { useEffect, useRef, useState } from "react";

const TYPE_COLORS = {
  alert: { color: "#ef4444" },
  recommendation: { color: "#6366f1" },
  goal: { color: "#10b981" },
};

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  async function load() {
    try {
      const [notifRes, countRes] = await Promise.all([
        fetch("/api/notifications"),
        fetch("/api/notifications/unread-count"),
      ]);
      const notifs = await notifRes.json();
      const { count } = await countRes.json();
      setNotifications(Array.isArray(notifs) ? notifs : []);
      setUnread(Number.isFinite(count) ? count : 0);
    } catch {
      setNotifications([]);
      setUnread(0);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markRead(id) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }

  async function deleteNotif(id, e) {
    e.stopPropagation();
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    load();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: open ? "#1e1e2e" : "transparent",
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.15s",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            zIndex: 100,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "#13131f",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid #1e1e2e",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Benachrichtigungen</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6366f1",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Alle gelesen
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "#475569", fontSize: 13 }}>
              Keine Benachrichtigungen
            </div>
          ) : (
            notifications.map((n) => {
              const c = TYPE_COLORS[n.type] || TYPE_COLORS.alert;
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  style={{
                    padding: "11px 14px",
                    borderBottom: "1px solid #1e1e2e",
                    background: n.is_read ? "transparent" : "#ffffff06",
                    cursor: n.is_read ? "default" : "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    transition: "background 0.15s",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: n.is_read ? "#2d2d3f" : c.color,
                      flexShrink: 0,
                      marginTop: 5,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{n.message}</div>
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  <button
                    onClick={(e) => deleteNotif(n.id, e)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#334155",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                  >
                    x
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
