import LocationMap from "../components/LocationMap";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function Location() {
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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
          Standortanalyse
        </h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
          Karte, Wettbewerb und Standortpotenzial in einer separaten Ansicht
        </p>
      </div>

      <LocationMap apiKey={MAPS_KEY} />
    </div>
  );
}