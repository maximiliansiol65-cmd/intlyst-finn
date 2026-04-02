import { useState, useEffect } from "react";

export default function ReferralNudge({ trigger = null, userId = 1 }) {
  const [show, setShow]   = useState(false);
  const [data, setData]   = useState(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!trigger || closed) return;
    // 2 Sekunden nach Erfolgs-Event zeigen
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/referral/my-code?user_id=${userId}`);
        const d = await r.json();
        setData(d);
        setShow(true);
      } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [trigger]);

  function close() {
    setShow(false);
    setClosed(true);
  }

  function openSettings() {
    window.location.href = "/settings?tab=referral";
    close();
  }

  if (!show || !data) return null;

  const next = data.next_tier;
  const msg  = next
    ? `Noch ${next.min - data.total_active} Einladung${next.min - data.total_active === 1 ? "" : "en"} bis ${next.label}!`
    : "Danke dass du Intlyst magst!";

  return (
    <div style={{
      position:     "fixed",
      bottom:       24,
      right:        24,
      zIndex:       500,
      background:   "#FFFFFF",
      border:       "1px solid rgba(0,0,0,0.10)",
      borderRadius: 16,
      padding:      "16px 20px",
      maxWidth:     320,
      boxShadow:    "0 8px 32px rgba(0,0,0,0.12)",
      animation:    "slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      display:      "flex",
      flexDirection:"column",
      gap:          10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1D1D1F", marginBottom: 3 }}>
            🎉 Magst du Intlyst?
          </div>
          <div style={{ fontSize: 12, color: "#6E6E73", lineHeight: 1.5 }}>
            Empfehle es weiter und erhalte gratis Monate. {msg}
          </div>
        </div>
        <button onClick={close} style={{
          background: "transparent", border: "none",
          color: "#86868B", cursor: "pointer", fontSize: 16,
          padding: "0 0 0 8px", flexShrink: 0,
        }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={openSettings} style={{
          flex:         1,
          background:   "#1D1D1F",
          color:        "#FFFFFF",
          border:       "none",
          borderRadius: 10,
          padding:      "9px 14px",
          fontSize:     12,
          fontWeight:   600,
          cursor:       "pointer",
        }}>
          Freunde einladen →
        </button>
        <button onClick={close} style={{
          background:   "rgba(0,0,0,0.05)",
          color:        "#6E6E73",
          border:       "none",
          borderRadius: 10,
          padding:      "9px 14px",
          fontSize:     12,
          cursor:       "pointer",
        }}>
          Später
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateY(20px) }
          to   { opacity:1; transform:translateY(0) }
        }
      `}</style>
    </div>
  );
}
