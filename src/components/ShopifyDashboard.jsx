import { useState, useEffect } from "react";

const TREND_CONFIG = {
  rising:   { color: "#34C759", bg: "rgba(52,199,89,0.10)",  label: "↑ Wachsend",   icon: "↑" },
  stable:   { color: "#0071E3", bg: "rgba(0,113,227,0.10)",  label: "→ Stabil",      icon: "→" },
  declining:{ color: "#FF3B30", bg: "rgba(255,59,48,0.10)",  label: "↓ Rückläufig", icon: "↓" },
};

function SyncBadge({ status, lastSync }) {
  const configs = {
    done:    { color: "#34C759", bg: "rgba(52,199,89,0.10)",  label: "Synchronisiert", dot: true  },
    syncing: { color: "#FF9F0A", bg: "rgba(255,159,10,0.10)", label: "Synchronisiere...", dot: true },
    error:   { color: "#FF3B30", bg: "rgba(255,59,48,0.10)",  label: "Sync-Fehler",   dot: false },
    never:   { color: "#86868B", bg: "rgba(134,134,139,0.10)",label: "Nie synchronisiert", dot: false },
  };
  const c = configs[status] || configs.never;

  function timeAgo(dt) {
    if (!dt) return "";
    const diff = Math.floor((Date.now() - new Date(dt)) / 60000);
    if (diff < 1)   return "gerade";
    if (diff < 60)  return `vor ${diff}m`;
    if (diff < 1440) return `vor ${Math.floor(diff/60)}h`;
    return `vor ${Math.floor(diff/1440)}T`;
  }

  return (
    <div style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          6,
      background:   c.bg,
      color:        c.color,
      fontSize:     11,
      fontWeight:   500,
      padding:      "4px 10px",
      borderRadius: 20,
    }}>
      {c.dot && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: c.color,
          animation: status === "syncing" ? "pulse 1.5s infinite" : "none",
          display: "inline-block",
        }} />
      )}
      {c.label}
      {lastSync && status === "done" && (
        <span style={{ opacity: 0.7 }}>— {timeAgo(lastSync)}</span>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

function AbandonedCard({ checkout, onRecover }) {
  return (
    <div style={{
      background:   "#FFFFFF",
      border:       "1px solid rgba(0,0,0,0.08)",
      borderLeft:   "3px solid #FF3B30",
      borderRadius: 12,
      padding:      "14px 16px",
      display:      "flex",
      alignItems:   "center",
      gap:          12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", marginBottom: 2 }}>
          {checkout.customer}
        </div>
        <div style={{ fontSize: 11, color: "#86868B" }}>
          {checkout.items} {checkout.items === 1 ? "Artikel" : "Artikel"} ·{" "}
          {new Date(checkout.abandoned_at).toLocaleDateString("de-DE")}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#FF3B30" }}>
          €{checkout.amount.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, color: "#86868B" }}>verloren</div>
      </div>
      {checkout.recovery_url && (
        <a
          href={checkout.recovery_url}
          target="_blank"
          rel="noreferrer"
          style={{
            background:   "#FF3B30",
            color:        "#FFFFFF",
            fontSize:     11,
            fontWeight:   600,
            padding:      "6px 12px",
            borderRadius: 8,
            textDecoration: "none",
            whiteSpace:   "nowrap",
            flexShrink:   0,
          }}
        >
          Reaktivieren →
        </a>
      )}
    </div>
  );
}

function ProductCard({ product }) {
  const t = TREND_CONFIG[product.trend] || TREND_CONFIG.stable;
  const daysAgo = product.last_sale
    ? Math.floor((Date.now() - new Date(product.last_sale)) / 86400000)
    : null;

  return (
    <div style={{
      background:   "#FFFFFF",
      border:       "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding:      "14px 16px",
      display:      "flex",
      gap:          12,
      alignItems:   "center",
    }}>
      {/* Produkt-Bild */}
      <div style={{
        width:        44,
        height:       44,
        borderRadius: 8,
        background:   product.image_url ? "transparent" : "#F5F5F7",
        overflow:     "hidden",
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
      }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 20 }}>📦</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     13,
          fontWeight:   600,
          color:        "#1D1D1F",
          marginBottom: 3,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {product.title}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize:     10,
            fontWeight:   500,
            color:        t.color,
            background:   t.bg,
            padding:      "1px 7px",
            borderRadius: 4,
          }}>
            {t.label}
          </span>
          <span style={{ fontSize: 11, color: "#86868B" }}>
            {product.orders} Bestellungen
          </span>
          {daysAgo !== null && (
            <span style={{ fontSize: 11, color: "#86868B" }}>
              Letzter Kauf vor {daysAgo}T
            </span>
          )}
        </div>
      </div>

      {/* Zahlen */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1D1D1F" }}>
          €{(product.revenue || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 })}
        </div>
        <div style={{ fontSize: 11, color: "#86868B" }}>
          Ø €{(product.avg_value || 0).toFixed(0)}
        </div>
      </div>

      {/* Inventory Warnung */}
      {product.inventory <= 5 && product.inventory > 0 && (
        <div style={{
          background:   "rgba(255,159,10,0.12)",
          color:        "#FF9F0A",
          fontSize:     10,
          fontWeight:   600,
          padding:      "3px 8px",
          borderRadius: 6,
          flexShrink:   0,
        }}>
          ⚠ Nur {product.inventory} übrig
        </div>
      )}
    </div>
  );
}

export default function ShopifyDashboard() {
  return null;
}
