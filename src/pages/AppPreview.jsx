import { useMemo } from "react";

const METRICS = [
  { label: "Monatsumsatz", value: "EUR 82.400", delta: "+8.2%", tone: "#10b981" },
  { label: "Traffic", value: "124.300", delta: "+5.1%", tone: "#38bdf8" },
  { label: "Conversion", value: "3.47%", delta: "+0.28pp", tone: "#f59e0b" },
  { label: "Neue Kunden", value: "1.024", delta: "+6.0%", tone: "#a78bfa" },
];

const RECOMMENDATIONS = [
  { title: "Checkout-Friction reduzieren", impact: "Hoch", effort: "Mittel", eta: "7 Tage" },
  { title: "Segmente im E-Mail-Funnel trennen", impact: "Mittel", effort: "Niedrig", eta: "3 Tage" },
  { title: "Top-Landingpage mit A/B-Test optimieren", impact: "Hoch", effort: "Mittel", eta: "10 Tage" },
];

const ACTIONS = [
  { text: "Kampagne Spring Push aktiviert", category: "Marketing", when: "vor 2h" },
  { text: "A/B Test Variant B als Gewinner markiert", category: "Produkt", when: "vor 5h" },
  { text: "Retention-Playbook fuer Risk-Segment gestartet", category: "Sales", when: "gestern" },
];

function Sparkline() {
  const points = useMemo(() => {
    const values = [12, 16, 15, 21, 24, 22, 27, 31, 29, 35];
    return values
      .map((value, index) => `${index * 28},${70 - value}`)
      .join(" ");
  }, []);

  return (
    <svg width="100%" height="88" viewBox="0 0 260 88" preserveAspectRatio="none">
      <defs>
        <linearGradient id="previewLine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f7fb8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4f7fb8" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="url(#previewLine)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <line x1="0" y1="76" x2="260" y2="76" stroke="#243652" strokeWidth="1" />
    </svg>
  );
}

function Card({ title, children, subtitle }) {
  return (
    <section
      style={{
        background: "linear-gradient(180deg, rgba(18, 30, 52, 0.92), rgba(12, 20, 36, 0.92))",
        border: "1px solid #233658",
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.25)",
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <div style={{ color: "#e5edff", fontWeight: 700, fontSize: 14 }}>{title}</div>
        {subtitle ? <div style={{ color: "#8fa7cc", fontSize: 12, marginTop: 4 }}>{subtitle}</div> : null}
      </header>
      {children}
    </section>
  );
}

export default function AppPreview() {
  return (
    <div style={{ padding: "24px 24px 40px" }}>
      <div
        style={{
          border: "1px solid #2b4268",
          borderRadius: 16,
          padding: 18,
          marginBottom: 18,
          background: "radial-gradient(circle at 15% 20%, rgba(89, 173, 211, 0.2), rgba(10, 16, 30, 0.92) 52%), #0a0f1f",
        }}
      >
        <h1 style={{ margin: 0, color: "#f2f7ff", fontSize: 24, letterSpacing: "0.02em" }}>Visuelle App-Vorschau</h1>
        <p style={{ margin: "8px 0 0", color: "#9cb3d5", fontSize: 14 }}>
          Diese Seite zeigt eine live Vorschau der Ziel-UI direkt in der App mit KPI-Cards, Trend, Empfehlungen und Aktionen.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {METRICS.map((metric) => (
          <Card key={metric.label} title={metric.label} subtitle="Live-Demo">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <strong style={{ color: "#f3f8ff", fontSize: 22 }}>{metric.value}</strong>
              <span
                style={{
                  color: metric.tone,
                  fontWeight: 700,
                  background: "rgba(15, 23, 42, 0.55)",
                  border: "1px solid #2e456d",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                }}
              >
                {metric.delta}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card title="Revenue Trend" subtitle="Letzte 10 Zeitpunkte">
          <Sparkline />
          <div style={{ display: "flex", justifyContent: "space-between", color: "#8fa7cc", fontSize: 12, marginTop: 6 }}>
            <span>Start</span>
            <span>Heute</span>
          </div>
        </Card>

        <Card title="Health Score" subtitle="KI-Auswertung">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "conic-gradient(#10b981 0 76%, #233658 76% 100%)",
                border: "1px solid #2e456d",
              }}
            >
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "#0f1a2f",
                  display: "grid",
                  placeItems: "center",
                  color: "#f3f8ff",
                  fontWeight: 800,
                }}
              >
                76
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
        <Card title="Priorisierte Empfehlungen" subtitle="Was als naechstes tun?">
          <div style={{ display: "grid", gap: 10 }}>
            {RECOMMENDATIONS.map((item) => (
              <div key={item.title} style={{ border: "1px solid #2e456d", borderRadius: 10, padding: 12, background: "#101a2f" }}>
                <div style={{ color: "#e8efff", fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                <div style={{ marginTop: 7, color: "#9cb3d5", fontSize: 12 }}>
                  Impact: {item.impact} • Aufwand: {item.effort} • ETA: {item.eta}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Action Feed" subtitle="Zuletzt ausgefuehrt">
          <div style={{ display: "grid", gap: 10 }}>
            {ACTIONS.map((action) => (
              <div key={action.text} style={{ borderLeft: "3px solid #4f7fb8", paddingLeft: 10 }}>
                <div style={{ color: "#e8efff", fontSize: 13 }}>{action.text}</div>
                <div style={{ color: "#8fa7cc", fontSize: 12, marginTop: 4 }}>
                  {action.category} • {action.when}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}