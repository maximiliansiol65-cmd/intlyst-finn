/* eslint-disable */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function StrategyBanner() {
  const { authHeader } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/growth/profile", { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setProfile(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []); // eslint-disable-line

  if (!loaded) return null;

  const goal = profile?.growth_goal_label || profile?.growth_goal || null;
  const industry = profile?.industry || null;
  const phase = profile?.phase || null;

  if (!goal) {
    return (
      <div
        onClick={() => navigate("/settings?tab=strategie")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", marginBottom: 20, cursor: "pointer",
          background: "rgba(255,159,10,0.06)",
          border: "1px solid rgba(255,159,10,0.20)",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚡</span>
          <span style={{ fontSize: 13, color: "var(--c-text-2)" }}>
            Kein Wachstumsziel gesetzt — alle Empfehlungen sind generisch
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--c-warning)",
          whiteSpace: "nowrap", marginLeft: 12,
        }}>
          Ziel setzen →
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate("/settings?tab=strategie")}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", marginBottom: 20, cursor: "pointer",
        background: "rgba(0,113,227,0.06)",
        border: "1px solid rgba(0,113,227,0.15)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14 }}>🎯</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-primary)" }}>
          {goal}
        </span>
        {industry && (
          <>
            <span style={{ color: "var(--c-text-4)", fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: "var(--c-text-3)" }}>{industry}</span>
          </>
        )}
        {phase && (
          <>
            <span style={{ color: "var(--c-text-4)", fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: "var(--c-text-3)" }}>{phase}</span>
          </>
        )}
        <span style={{ fontSize: 12, color: "var(--c-text-4)", marginLeft: 4 }}>
          Alle Analysen und Empfehlungen sind darauf ausgerichtet
        </span>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: "var(--c-primary)",
        whiteSpace: "nowrap", marginLeft: 12,
      }}>
        Ändern →
      </span>
    </div>
  );
}
