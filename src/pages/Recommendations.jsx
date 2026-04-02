import AiRecommendations from "../components/ai/AiRecommendations";

export default function Recommendations() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        color: "#0f172a",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: 0 }}>Entscheidungsagenda</h1>
        <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 0", maxWidth: 820, lineHeight: 1.6 }}>
          Keine Liste allgemeiner Tipps, sondern priorisierte Management-Empfehlungen mit Analyse, Einordnung, klarer Massnahme und strategischer Perspektive.
        </p>
      </div>

      <AiRecommendations />
    </div>
  );
}
