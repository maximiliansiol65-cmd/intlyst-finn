import { useState } from "react";

/**
 * WeeklyReview Component
 * 
 * Shows last week's achievements and next recommendations
 * - Completion rate: "2 von 3 Empfehlungen umgesetzt"
 * - Key metric change: "Umsatz +€840"
 * - Next recommendations: List of 3 actionable items
 */
export function WeeklyReview({ 
  completedRecommendations = 2,
  totalRecommendations = 3,
  metricName = "Umsatz",
  metricChange = 840,
  metricUnit = "€",
  nextRecommendations = [],
  onRecommendationClick = null,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const completionPercent = Math.round((completedRecommendations / totalRecommendations) * 100);
  const isPositive = metricChange >= 0;

  // Default recommendations if none provided
  const defaultRecommendations = [
    {
      id: 1,
      title: "Email-Kampagne optimieren",
      description: "Erhöhe Email-Open-Rates durch Subject-Line Tests",
      impact: "Potential +5% Traffic",
      icon: "📧",
    },
    {
      id: 2,
      title: "Landing Page A/B Test",
      description: "Teste neue CTA Button Farbe und Copy",
      impact: "Could increase conversion by 2%",
      icon: "🎨",
    },
    {
      id: 3,
      title: "Kundenbindungs-Programm",
      description: "Implementiere Loyalty Rewards für Wiederholungskäufer",
      impact: "Potential +€500/month revenue",
      icon: "🎁",
    },
  ];

  const recommendations = nextRecommendations.length > 0 ? nextRecommendations : defaultRecommendations;

  return (
    <div
      className="card"
      style={{
        padding: "var(--s-6)",
        background: "linear-gradient(135deg, var(--c-surface) 0%, var(--c-bg-2) 100%)",
        border: "1px solid var(--c-border-2)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "var(--s-6)" }}>
        <div style={{
          fontSize: "var(--text-lg)",
          fontWeight: 700,
          color: "var(--c-text)",
          marginBottom: "var(--s-4)",
        }}>
          📊 Wöchentliches Review
        </div>

        {/* ── Completion Progress ─────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--s-4)",
          marginBottom: "var(--s-5)",
        }}>
          {/* Last Week Completion */}
          <div style={{
            background: "var(--c-surface)",
            padding: "var(--s-4)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--c-border)",
          }}>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              textTransform: "uppercase",
              marginBottom: "var(--s-2)",
            }}>
              Letzte Woche
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: "var(--s-3)",
            }}>
              {completedRecommendations} von {totalRecommendations}
            </div>
            <div style={{
              fontSize: "var(--text-sm)",
              color: "var(--c-text-2)",
            }}>
              Empfehlungen umgesetzt
            </div>

            {/* Progress Bar */}
            <div className="progress-track" style={{ marginTop: "var(--s-3)", height: 6 }}>
              <div
                className="progress-fill progress-success"
                style={{
                  width: `${completionPercent}%`,
                  transition: "width 1s ease-out",
                }}
              />
            </div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              marginTop: "var(--s-2)",
              textAlign: "right",
            }}>
              {completionPercent}%
            </div>
          </div>

          {/* Metric Change */}
          <div style={{
            background: isPositive
              ? "rgba(16, 185, 129, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            padding: "var(--s-4)",
            borderRadius: "var(--r-md)",
            border: `1px solid ${isPositive
              ? "rgba(16, 185, 129, 0.3)"
              : "rgba(239, 68, 68, 0.3)"}`,
          }}>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              textTransform: "uppercase",
              marginBottom: "var(--s-2)",
            }}>
              Diese Woche
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: isPositive ? "var(--c-success)" : "var(--c-danger)",
              marginBottom: "var(--s-3)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {isPositive ? "+" : ""}{metricUnit === "€"
                ? new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                }).format(metricChange)
                : metricChange}
            </div>
            <div style={{
              fontSize: "var(--text-sm)",
              color: "var(--c-text-2)",
            }}>
              {metricName} gewachsen
            </div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              marginTop: "var(--s-2)",
            }}>
              {isPositive ? "↑" : "↓"} Positive Richtung
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: "var(--c-border)",
        marginBottom: "var(--s-6)",
      }} />

      {/* ── Next Recommendations ────────────────────────────────────── */}
      <div>
        <div style={{
          fontSize: "var(--text-md)",
          fontWeight: 700,
          color: "var(--c-text)",
          marginBottom: "var(--s-4)",
        }}>
          ✨ Hier sind die nächsten 3 Empfehlungen
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-3)",
        }}>
          {recommendations.map((rec, idx) => (
            <div
              key={rec.id || idx}
              onClick={() => {
                setExpandedIndex(expandedIndex === idx ? null : idx);
                if (onRecommendationClick) onRecommendationClick(rec);
              }}
              style={{
                background: "var(--c-surface)",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--r-md)",
                padding: "var(--s-4)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                transform: expandedIndex === idx ? "scale(1.02)" : "scale(1)",
                boxShadow: expandedIndex === idx ? "var(--shadow-md)" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--c-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--c-border)";
              }}
            >
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--s-3)",
              }}>
                <div style={{
                  fontSize: "var(--text-lg)",
                  flexShrink: 0,
                }}>
                  {rec.icon || "💡"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "var(--text-md)",
                    fontWeight: 600,
                    color: "var(--c-text)",
                    marginBottom: "var(--s-1)",
                  }}>
                    {rec.title}
                  </div>
                  {expandedIndex === idx && (
                    <>
                      <div style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--c-text-2)",
                        lineHeight: 1.5,
                        marginBottom: "var(--s-3)",
                      }}>
                        {rec.description}
                      </div>
                      <div style={{
                        fontSize: "var(--text-sm)",
                        background: "var(--c-bg-2)",
                        padding: "var(--s-2) var(--s-3)",
                        borderRadius: "var(--r-sm)",
                        color: "var(--c-text-3)",
                      }}>
                        <strong>Potenzielle Auswirkung:</strong> {rec.impact}
                      </div>
                    </>
                  )}
                </div>
                <div style={{
                  fontSize: "var(--text-lg)",
                  color: "var(--c-text-3)",
                  flexShrink: 0,
                  transition: "transform 0.2s ease",
                  transform: expandedIndex === idx ? "rotate(180deg)" : "rotate(0deg)",
                }}>
                  ▼
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA Button ──────────────────────────────────────────────── */}
      <div style={{
        marginTop: "var(--s-6)",
        display: "flex",
        gap: "var(--s-3)",
      }}>
        <button
          className="btn btn-primary btn-md"
          style={{ flex: 1 }}
          onClick={() => {
            // Navigate to recommendations or analysis page
            window.location.href = "/analyse";
          }}
        >
          Alle Empfehlungen ansehen →
        </button>
      </div>
    </div>
  );
}

export default WeeklyReview;
