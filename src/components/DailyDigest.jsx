import { useEffect, useState } from "react";

const MOOD = {
  great: { color: "#10b981", bg: "#10b98118", label: "Sehr gut" },
  good: { color: "#22c55e", bg: "#22c55e18", label: "Gut" },
  neutral: { color: "#6366f1", bg: "#6366f118", label: "Neutral" },
  concerning: { color: "#f59e0b", bg: "#f59e0b18", label: "Achtung" },
  critical: { color: "#ef4444", bg: "#ef444418", label: "Kritisch" },
};

export default function DailyDigest() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadDigest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/digest");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setDigest(data);
    } catch (err) {
      setError(err.message || "Digest konnte nicht geladen werden.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDigest();
  }, []);

  const mood = MOOD[digest?.mood] || MOOD.neutral;

  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Tages-Zusammenfassung
        </div>
        <button
          onClick={loadDigest}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid #1e1e2e",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 600,
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: "#64748b" }}>Lade Daily Digest...</div>}

      {error && !loading && <div style={{ fontSize: 12, color: "#64748b" }}>Digest aktuell nicht verfuegbar.</div>}

      {!loading && !error && digest && (
        <div>
          <div style={{ display: "inline-flex", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: mood.bg, color: mood.color, marginBottom: 8, textTransform: "uppercase" }}>
            {mood.label}
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.7, marginBottom: 10 }}>{digest.summary}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#0d0d1a", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", fontWeight: 600, marginBottom: 3 }}>
                Top Insight
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{digest.top_insight || "-"}</div>
            </div>
            <div style={{ background: "#0d0d1a", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", fontWeight: 600, marginBottom: 3 }}>
                Top Action
              </div>
              <div style={{ fontSize: 11, color: "#10b981", lineHeight: 1.5 }}>{digest.top_action || "-"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
