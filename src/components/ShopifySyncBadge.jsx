import { useState, useEffect } from "react";

export default function ShopifySyncBadge({ showLabel = true }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch("/api/shopify/status")
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {});
  }, []);

  if (!status?.connected) return null;

  function timeAgo(dt) {
    if (!dt) return "noch nie";
    const diff = Math.floor((Date.now() - new Date(dt)) / 60000);
    if (diff < 1)    return "gerade eben";
    if (diff < 60)   return `vor ${diff}m`;
    if (diff < 1440) return `vor ${Math.floor(diff / 60)}h`;
    return `vor ${Math.floor(diff / 1440)} Tagen`;
  }

  const configs = {
    done:    { color: "#34C759", label: "Shopify sync" },
    syncing: { color: "#FF9F0A", label: "Synchronisiert..." },
    error:   { color: "#FF3B30", label: "Sync-Fehler" },
    never:   { color: "#86868B", label: "Noch kein Sync" },
  };
  const c = configs[status.sync_status] || configs.never;

  return (
    <div style={{
      display:    "inline-flex",
      alignItems: "center",
      gap:        5,
      fontSize:   11,
      color:      c.color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: c.color, display: "inline-block",
        animation: status.sync_status === "syncing" ? "pulse 1s infinite" : "none",
      }} />
      {showLabel && (
        <span>{c.label} — {timeAgo(status.last_sync)}</span>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
