/* eslint-disable */
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

const TIERS = [
  { min: 1,  max: 2,  label: "2 Wochen gratis",  emoji: "🎁", color: "#185FA5", bg: "#E8F4FD" },
  { min: 3,  max: 4,  label: "1 Monat gratis",   emoji: "⭐", color: "#0F6E56", bg: "#E1F5EE" },
  { min: 5,  max: 9,  label: "2 Monate gratis",  emoji: "🔥", color: "#854F0B", bg: "#FAEEDA" },
  { min: 10, max: 19, label: "6 Monate gratis",  emoji: "💎", color: "#534AB7", bg: "#EEEDFE" },
  { min: 20, max: 49, label: "1 Jahr gratis",    emoji: "👑", color: "#A32D2D", bg: "#FCEBEB" },
  { min: 50, max: 999,label: "Lifetime gratis",  emoji: "🏆", color: "#fff",   bg: "#1D1D1F" },
];

export default function ReferralTab() {
  const { user, authHeader } = useAuth();
  const toast = useToast();
  const [data, setData]       = useState(null);
  const [history, setHistory] = useState({ events: [], rewards: [] });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [codeRes, histRes] = await Promise.all([
        fetch("/api/referral/my-code", { headers: authHeader() }),
        fetch("/api/referral/history",  { headers: authHeader() }),
      ]);
      if (codeRes.ok) setData(await codeRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch {}
    setLoading(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.referral_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link kopiert!");
    } catch {
      toast.error("Kopieren fehlgeschlagen.");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "var(--s-8)", textAlign: "center", color: "var(--c-text-3)" }}>
        Laden…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "var(--s-8)", textAlign: "center", color: "var(--c-text-3)" }}>
        Referral-System nicht verfügbar.
      </div>
    );
  }

  const active   = data.total_active ?? 0;
  const next     = data.next_tier;
  const curr     = data.current_tier;
  const pct      = data.progress_pct ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", maxWidth: 560 }}>

      {/* ── Einladungslink ── */}
      <div className="card" style={{ padding: "var(--s-5)" }}>
        <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--s-2)" }}>
          Dein persönlicher Einladungslink
        </h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: "0 0 var(--s-4)" }}>
          Teile diesen Link — wer sich darüber anmeldet, bekommt <strong>2 Wochen gratis</strong> und du bekommst gratis Monate gutgeschrieben.
        </p>

        {/* Link-Box */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--s-2)",
          background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-md)", padding: "var(--s-3) var(--s-4)",
          marginBottom: "var(--s-4)",
        }}>
          <span style={{
            flex: 1, fontSize: "var(--text-sm)", color: "var(--c-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {data.referral_url}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={copyLink}
            style={{ flexShrink: 0 }}
          >
            {copied ? "✓ Kopiert" : "Kopieren"}
          </button>
        </div>

        {/* Teilen-Buttons */}
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
          <a
            href={data.share?.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            WhatsApp
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(data.share?.email_subject ?? "")}&body=${encodeURIComponent(data.share?.email_body ?? "")}`}
            className="btn btn-secondary btn-sm"
          >
            E-Mail
          </a>
          <a
            href={data.share?.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            Twitter / X
          </a>
          <a
            href={data.share?.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            LinkedIn
          </a>
        </div>
      </div>

      {/* ── Statistik ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--s-3)" }}>
        {[
          { label: "Klicks",         value: data.total_clicks   ?? 0 },
          { label: "Anmeldungen",    value: data.total_signups  ?? 0 },
          { label: "Aktive Nutzer",  value: active },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: "var(--s-4)", textAlign: "center" }}>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)" }}>{value}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Fortschritt ── */}
      <div className="card" style={{ padding: "var(--s-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-3)" }}>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0 }}>
            {curr?.emoji} Aktuelle Stufe: {curr?.label ?? "—"}
          </h3>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            {active} aktive Einladung{active !== 1 ? "en" : ""}
          </span>
        </div>

        {next && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
              <span>Nächste Stufe: {next.emoji} {next.label}</span>
              <span>Noch {next.min - active} Einladung{(next.min - active) !== 1 ? "en" : ""}</span>
            </div>
            <div style={{ background: "var(--c-surface-2)", borderRadius: "var(--r-full)", height: 8 }}>
              <div style={{
                width: `${pct}%`, height: 8,
                background: "var(--c-primary)",
                borderRadius: "var(--r-full)",
                transition: "width 0.5s ease",
              }} />
            </div>
          </>
        )}

        {/* Alle Stufen */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginTop: "var(--s-5)" }}>
          {TIERS.map(tier => {
            const reached = active >= tier.min;
            return (
              <div key={tier.label} style={{
                display: "flex", alignItems: "center", gap: "var(--s-3)",
                padding: "var(--s-2) var(--s-3)",
                borderRadius: "var(--r-sm)",
                background: reached ? tier.bg : "transparent",
                opacity: reached ? 1 : 0.45,
                transition: "all 0.2s",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{tier.emoji}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: reached ? tier.color : "var(--c-text-3)" }}>
                    {tier.label}
                  </span>
                </div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", flexShrink: 0 }}>
                  ab {tier.min} Einladung{tier.min !== 1 ? "en" : ""}
                </span>
                {reached && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" fill={tier.color === "#fff" ? "#1D1D1F" : tier.color} />
                    <path d="M4 7l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Historie ── */}
      {history.events.length > 0 && (
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--s-4)" }}>
            Eingeladene Nutzer
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {history.events.map((ev, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "var(--s-3) 0",
                borderTop: i > 0 ? "1px solid var(--c-border)" : "none",
              }}>
                <div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--c-text)" }}>{ev.name}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{ev.date}</div>
                </div>
                {ev.reward_days > 0 && (
                  <span style={{
                    fontSize: "var(--text-xs)", fontWeight: 600,
                    background: "#E1F5EE", color: "#0F6E56",
                    padding: "3px 8px", borderRadius: "var(--r-full)",
                  }}>
                    +{ev.reward_days} Tage
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
