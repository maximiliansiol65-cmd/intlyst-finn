import AiRecommendations from "../components/ai/AiRecommendations";

export default function Recommendations() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Recommendations</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
          KI-basierte Handlungsempfehlungen fuer dein Business
        </p>
      </div>

      <AiRecommendations />
    </div>
  );
}