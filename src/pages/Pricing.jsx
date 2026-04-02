import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const PLAN_COLORS = {
  standard:      { color: "#6366f1", bg: "#6366f115", border: "#6366f130" },
  team_standard: { color: "#10b981", bg: "#10b98115", border: "#10b98130" },
  team_pro:      { color: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b30" },
};

export default function Pricing() {
  const [plans, setPlans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [checkingOut, setCheckingOut] = useState("");
  const [error, setError]         = useState("");

  const { user } = useAuth();
  const navigate = useNavigate();

  useState(() => {
    fetch("/api/billing/plans")
      .then(r => r.json())
      .then(d => { setPlans(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleCheckout(plan) {
    if (!plan.available) {
      setError(`STRIPE_PRICE_${plan.key.toUpperCase()} fehlt in .env`);
      return;
    }
    setCheckingOut(plan.key);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          plan: plan.key,
          customer_email: user?.email,
        }),
      });
      const d = await res.json();
      if (res.ok && d.checkout_url) {
        window.location.href = d.checkout_url;
      } else {
        setError(d.detail || "Fehler beim Checkout.");
      }
    } catch (e) {
      setError("Verbindungsfehler.");
    }
    setCheckingOut("");
  }

  async function devActivate(planKey) {
    const res = await fetch(`/api/billing/dev/activate?plan=${planKey}`, { method: "POST" });
    if (res.ok) navigate("/settings?checkout=success");
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a14", color: "#e2e8f0",
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      padding: "48px 32px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
          Wähle deinen Plan
        </div>
        <div style={{ fontSize: 14, color: "#475569" }}>
          Starte kostenlos — upgrade jederzeit
        </div>
      </div>

      {error && (
        <div style={{
          background: "#ef444415", border: "1px solid #ef444430",
          borderRadius: 10, padding: "12px 16px",
          fontSize: 13, color: "#ef4444",
          maxWidth: 600, margin: "0 auto 24px",
          textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "#475569" }}>Laden...</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          maxWidth: 1000,
          margin: "0 auto",
        }}>
          {plans.map(plan => {
            const c = PLAN_COLORS[plan.key] || PLAN_COLORS.standard;
            return (
              <div
                key={plan.key}
                style={{
                  background: "#13131f",
                  border: plan.highlight
                    ? `2px solid ${c.color}`
                    : `1px solid ${c.border}`,
                  borderRadius: 14,
                  padding: "28px 24px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Empfohlen Badge */}
                {plan.highlight && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%",
                    transform: "translateX(-50%)",
                    background: c.color, color: "#fff",
                    fontSize: 11, fontWeight: 700,
                    padding: "3px 14px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Empfohlen
                  </div>
                )}

                {/* Plan Name */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 9px",
                    borderRadius: 5, background: c.bg, color: c.color,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {plan.name}
                  </span>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
                    {plan.description}
                  </div>
                </div>

                {/* Preis */}
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: "#f1f5f9" }}>
                    €{plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: "#475569" }}>/Monat</span>
                </div>

                {/* Features */}
                <div style={{ flex: 1, marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div
                      key={f}
                      style={{
                        display: "flex", alignItems: "center",
                        gap: 8, marginBottom: 8, fontSize: 13,
                      }}
                    >
                      <span style={{ color: c.color, flexShrink: 0, fontSize: 12 }}>✓</span>
                      <span style={{ color: "#94a3b8" }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleCheckout(plan)}
                  disabled={checkingOut !== ""}
                  style={{
                    width: "100%", padding: "12px 0",
                    background: plan.highlight ? c.color : "transparent",
                    border: `1px solid ${c.color}`,
                    borderRadius: 9,
                    fontSize: 13, fontWeight: 600,
                    color: plan.highlight ? "#fff" : c.color,
                    cursor: checkingOut ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {checkingOut === plan.key
                    ? "Weiterleitung..."
                    : plan.available
                      ? "Jetzt starten"
                      : "Demnächst verfügbar"}
                </button>

                {/* Dev Aktivierung */}
                {!plan.available && (
                  <button
                    onClick={() => devActivate(plan.key)}
                    style={{
                      marginTop: 8, width: "100%", padding: "7px 0",
                      background: "transparent",
                      border: "1px dashed #334155",
                      borderRadius: 7, fontSize: 11,
                      color: "#475569", cursor: "pointer",
                    }}
                  >
                    Dev: Aktivieren ohne Stripe
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hinweis */}
      <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, color: "#334155" }}>
        Jederzeit kündbar · Keine versteckten Kosten · SSL-verschlüsselt
      </div>
    </div>
  );
}
