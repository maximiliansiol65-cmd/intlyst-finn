import { useState } from "react";

/**
 * AITransparencyDashboard Component
 * 
 * Explainable AI insights with:
 * - Confidence badges (High/Mid/Low)
 * - Expandable "Why?" explanations
 * - What-if simulation (price slider)
 * - Scenario comparison grid
 */
export function AITransparencyDashboard() {
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [priceChange, setPriceChange] = useState(20);

  // Calculate derived metrics based on price slider
  const elasticity = -0.45;
  const convChange = Math.round(priceChange * elasticity);
  const revenueEffect = Math.round(priceChange + convChange);
  const breakEven = priceChange > 0
    ? Math.round(-(priceChange / (1 + priceChange / 100)) * 10) / 10
    : Math.round(-(priceChange / (1 - priceChange / 100)) * 10) / 10;

  const togglePanel = (panelId) => {
    setExpandedPanel(expandedPanel === panelId ? null : panelId);
  };

  const ConfidenceBadge = ({ level, dataPoints, source }) => {
    const configs = {
      high: {
        bg: "rgba(59, 109, 17, 0.1)",
        text: "#3B6D11",
        dot: "var(--c-success)",
        label: "Hohe Zuverlässigkeit",
      },
      mid: {
        bg: "rgba(186, 117, 23, 0.1)",
        text: "#BA7517",
        dot: "#BA7517",
        label: "Mittlere Zuverlässigkeit",
      },
      low: {
        bg: "rgba(226, 75, 74, 0.1)",
        text: "#E24B4A",
        dot: "var(--c-danger)",
        label: "Niedrige Zuverlässigkeit",
      },
    };
    const config = configs[level] || configs.mid;

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "var(--text-xs)",
          padding: "3px 9px",
          borderRadius: "99px",
          fontWeight: 500,
          background: config.bg,
          color: config.text,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: config.dot,
          }}
        />
        {config.label}
      </span>
    );
  };

  const ExplainPanel = ({ panelId, data }) => {
    const isOpen = expandedPanel === panelId;

    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            marginTop: "var(--s-3)",
          }}
        >
          <ConfidenceBadge level={data.confidence} />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
            {data.dataPoints} Datenpunkte
          </span>
          <button
            onClick={() => togglePanel(panelId)}
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              background: "var(--c-bg-2)",
              border: "1px solid var(--c-border)",
              borderRadius: "var(--r-md)",
              padding: "3px 10px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => (e.target.style.background = "var(--c-surface)")}
            onMouseLeave={(e) => (e.target.style.background = "var(--c-bg-2)")}
          >
            Warum sagst du das? {isOpen ? "▴" : "▾"}
          </button>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--c-primary)", cursor: "pointer" }}>
            {data.source}
          </span>
        </div>

        {isOpen && (
          <div
            style={{
              background: "var(--c-bg-2)",
              border: "1px solid var(--c-border)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-4)",
              marginTop: "var(--s-4)",
              fontSize: "var(--text-sm)",
            }}
          >
            <div
              style={{
                fontWeight: 500,
                fontSize: "var(--text-md)",
                marginBottom: "var(--s-3)",
                color: "var(--c-text)",
              }}
            >
              Grundlage dieser Aussage
            </div>

            {data.factors.map((factor, idx) => (
              <div key={idx}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <span style={{ color: "var(--c-text-3)", minWidth: "140px" }}>
                    {factor.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: "4px",
                      background: "var(--c-border)",
                      borderRadius: "2px",
                      margin: "0 10px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: "2px",
                        background: factor.color || "var(--c-primary)",
                        width: `${factor.value}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 500, fontSize: "var(--text-xs)", minWidth: "28px", textAlign: "right" }}>
                    {factor.value}%
                  </span>
                </div>
              </div>
            ))}

            <div style={{ height: "1px", background: "var(--c-border)", margin: "var(--s-4) 0" }} />

            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", lineHeight: 1.5 }}>
              {data.explanation}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ padding: "0 var(--s-8) var(--s-8)" }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: "var(--s-6)" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)", marginBottom: "var(--s-2)" }}>
          🤖 KI-Transparenz Dashboard
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
          Erklärbare KI-Aussagen · Konfidenz-Anzeige · Szenario-Simulation
        </p>
      </div>

      {/* ── KI-Erkenntnisse ────────────────────────────────── */}
      <div style={{ marginBottom: "var(--s-8)" }}>
        <div style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: "var(--c-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "var(--s-4)",
        }}>
          KI-Erkenntnisse mit Transparenz
        </div>

        {/* Insight 1: High Confidence */}
        <div
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-lg)",
            padding: "var(--s-4)",
            marginBottom: "var(--s-4)",
          }}
        >
          <div style={{
            fontSize: "var(--text-md)",
            color: "var(--c-text)",
            lineHeight: 1.6,
            marginBottom: "var(--s-3)",
          }}>
            Deine Conversion-Rate ist diese Woche um <strong>18%</strong> gesunken — hauptsächlich auf der mobilen Checkout-Seite.
          </div>
          <ExplainPanel
            panelId="insight1"
            data={{
              confidence: "high",
              dataPoints: 47,
              source: "GA4, 12.–18. März",
              factors: [
                { label: "Mobile Abbruchrate", value: 82, color: "var(--c-danger)" },
                { label: "Checkout-Fehler-Events", value: 65, color: "var(--c-warning)" },
                { label: "Sitzungsdauer", value: 38, color: "var(--c-primary)" },
              ],
              explanation: "Logik: Korrelation zwischen mobilem Traffic (+12%) und gleichzeitigem CR-Rückgang — Desktop stabil → Quelle: mobiles UX-Problem wahrscheinlich.",
            }}
          />
        </div>

        {/* Insight 2: Low Confidence */}
        <div
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-lg)",
            padding: "var(--s-4)",
            marginBottom: "var(--s-4)",
          }}
        >
          <div style={{
            fontSize: "var(--text-md)",
            color: "var(--c-text)",
            lineHeight: 1.6,
            marginBottom: "var(--s-3)",
          }}>
            Basierend auf deinen ersten 3 Tagen könnte TikTok ein guter Kanal sein — aber die Datenlage ist noch dünn.
          </div>
          <ExplainPanel
            panelId="insight2"
            data={{
              confidence: "low",
              dataPoints: 3,
              source: "TikTok, 3 Tage",
              factors: [
                { label: "Reichweite (Tage 1–3)", value: 30, color: "var(--c-danger)" },
                { label: "Engagement-Rate", value: 45, color: "var(--c-warning)" },
              ],
              explanation: "Zu wenig Daten für statistisch signifikante Aussagen. Empfehlung: 14 Tage abwarten.",
            }}
          />
        </div>

        {/* Insight 3: Mid Confidence */}
        <div
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-lg)",
            padding: "var(--s-4)",
          }}
        >
          <div style={{
            fontSize: "var(--text-md)",
            color: "var(--c-text)",
            lineHeight: 1.6,
            marginBottom: "var(--s-3)",
          }}>
            Dein durchschnittlicher Bestellwert könnte durch gezielte Upselling-Strategien um <strong>12–15%</strong> steigen.
          </div>
          <ExplainPanel
            panelId="insight3"
            data={{
              confidence: "mid",
              dataPoints: 23,
              source: "Shopify, letzte 30 Tage",
              factors: [
                { label: "Basket-Size-Potenzial", value: 58, color: "#BA7517" },
                { label: "Kundenbereitschaft", value: 71, color: "#BA7517" },
                { label: "Produktkomplementarität", value: 44, color: "#BA7517" },
              ],
              explanation: "Datenqualität ausreichend für Hypothese. A/B-Test empfohlen: Klassischer Upsell vs. intelligente Bundle-Vorschläge.",
            }}
          />
        </div>
      </div>

      {/* ── Was-wäre-wenn-Simulation ──────────────────────── */}
      <div style={{ marginBottom: "var(--s-8)" }}>
        <div style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: "var(--c-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "var(--s-4)",
        }}>
          Was-wäre-wenn-Simulation — Preis
        </div>

        <div
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-lg)",
            padding: "var(--s-4)",
          }}
        >
          <div style={{ marginBottom: "var(--s-4)" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-4)",
              marginBottom: "var(--s-4)",
            }}>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", minWidth: "100px" }}>
                Preisänderung
              </span>
              <input
                type="range"
                min="-30"
                max="50"
                value={priceChange}
                step="1"
                onChange={(e) => setPriceChange(parseInt(e.target.value))}
                style={{ flex: 1, cursor: "pointer" }}
              />
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, minWidth: "50px", textAlign: "right" }}>
                {priceChange >= 0 ? "+" : ""}{priceChange}%
              </span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--s-3)",
          }}>
            {/* Conversion */}
            <div style={{
              background: "var(--c-bg-2)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-4)",
            }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
                Erwartete Conversion
              </div>
              <div style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 700,
                color: convChange >= 0 ? "var(--c-success)" : "var(--c-danger)",
              }}>
                {convChange >= 0 ? "+" : ""}{convChange}%
              </div>
              <div style={{
                fontSize: "var(--text-xs)",
                marginTop: "var(--s-2)",
                color: convChange >= 0 ? "var(--c-success)" : "var(--c-danger)",
              }}>
                Elastizität {elasticity}
              </div>
            </div>

            {/* Revenue */}
            <div style={{
              background: "var(--c-bg-2)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-4)",
            }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
                Netto-Umsatz-Effekt
              </div>
              <div style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 700,
                color: revenueEffect >= 0 ? "var(--c-success)" : "var(--c-danger)",
              }}>
                {revenueEffect >= 0 ? "+" : ""}{revenueEffect}%
              </div>
              <div style={{
                fontSize: "var(--text-xs)",
                marginTop: "var(--s-2)",
                color: revenueEffect >= 0 ? "var(--c-success)" : "var(--c-danger)",
              }}>
                Umsatz {revenueEffect >= 0 ? "steigt" : "sinkt"}
              </div>
            </div>

            {/* Break-even */}
            <div style={{
              background: "var(--c-bg-2)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-4)",
            }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
                Break-even-Punkt
              </div>
              <div style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 700,
                color: "var(--c-text)",
              }}>
                {breakEven >= 0 ? "+" : ""}{breakEven}%
              </div>
              <div style={{
                fontSize: "var(--text-xs)",
                marginTop: "var(--s-2)",
                color: "var(--c-text-3)",
              }}>
                Max. CR-Verlust tolerierbar
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Szenario-Vergleich ────────────────────────────── */}
      <div>
        <div style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: "var(--c-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "var(--s-4)",
        }}>
          Szenario-Vergleich — TikTok-Strategie
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-4)",
        }}>
          {/* Scenario 1 */}
          <div
            style={{
              background: "var(--c-surface)",
              border: "1px solid var(--c-border)",
              borderRadius: "var(--r-lg)",
              padding: "var(--s-4)",
            }}
          >
            <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-3)" }}>
              Einmal / Woche
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "var(--s-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Reichweite</span>
                <span style={{ fontWeight: 500, color: "var(--c-text)" }}>+8%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Follower / Monat</span>
                <span style={{ fontWeight: 500, color: "var(--c-text)" }}>+120</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Traffic</span>
                <span style={{ fontWeight: 500, color: "var(--c-text)" }}>+3%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Aufwand</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>Gering</span>
              </div>
            </div>
            <button
              style={{
                width: "100%",
                padding: "var(--s-2) 0",
                fontSize: "var(--text-xs)",
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                color: "var(--c-text-3)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--c-bg-2)";
                e.target.style.color = "var(--c-text)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "var(--c-text-3)";
              }}
            >
              Wählen
            </button>
          </div>

          {/* Scenario 2 - Recommended */}
          <div
            style={{
              background: "var(--c-surface)",
              border: "2px solid var(--c-primary)",
              borderRadius: "var(--r-lg)",
              padding: "var(--s-4)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-12px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(59, 130, 246, 0.1)",
                color: "var(--c-primary)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: "99px",
              }}
            >
              Empfohlen
            </div>
            <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-3)", marginTop: "var(--s-2)" }}>
              3× / Woche
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "var(--s-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Reichweite</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+31%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Follower / Monat</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+480</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Traffic</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+14%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Aufwand</span>
                <span style={{ fontWeight: 500, color: "#BA7517" }}>Mittel</span>
              </div>
            </div>
            <button
              style={{
                width: "100%",
                padding: "var(--s-2) 0",
                fontSize: "var(--text-xs)",
                background: "var(--c-primary)",
                color: "white",
                border: "none",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                fontWeight: 600,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => (e.target.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.target.style.opacity = "1")}
            >
              Wählen
            </button>
          </div>

          {/* Scenario 3 */}
          <div
            style={{
              background: "var(--c-surface)",
              border: "1px solid var(--c-border)",
              borderRadius: "var(--r-lg)",
              padding: "var(--s-4)",
            }}
          >
            <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-3)" }}>
              Täglich
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "var(--s-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Reichweite</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+58%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Follower / Monat</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+950</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Traffic</span>
                <span style={{ fontWeight: 500, color: "var(--c-success)" }}>+27%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--c-text-3)" }}>Aufwand</span>
                <span style={{ fontWeight: 500, color: "var(--c-danger)" }}>Sehr hoch</span>
              </div>
            </div>
            <button
              style={{
                width: "100%",
                padding: "var(--s-2) 0",
                fontSize: "var(--text-xs)",
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                color: "var(--c-text-3)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--c-bg-2)";
                e.target.style.color = "var(--c-text)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "var(--c-text-3)";
              }}
            >
              Wählen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AITransparencyDashboard;
