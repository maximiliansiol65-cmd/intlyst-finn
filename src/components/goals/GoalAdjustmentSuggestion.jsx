import { useState } from "react";

/**
 * GoalAdjustmentSuggestion Component
 * 
 * Shows intelligent goal difficulty suggestions
 * - Detects if goal is "too easy", "perfect", or "too hard"
 * - Suggests new target based on current pace
 * - User can accept/dismiss/snooze suggestion
 */
export function GoalAdjustmentSuggestion({
  goalLabel = "Umsatz",
  currentValue = 15000,
  targetValue = 20000,
  previousValue = 14000,
  unit = "€",
  daysInPeriod = 30,
  daysPassed = 15,
  onAccept = null,
  onDismiss = null,
  onClose = null,
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Calculate metrics
  const remainingDays = daysInPeriod - daysPassed;
  const dailyProgress = (currentValue - previousValue) / daysPassed;
  const projectedValue = currentValue + (dailyProgress * remainingDays);
  const progressPercent = Math.round((currentValue / targetValue) * 100);
  const pacePercent = Math.round((projectedValue / targetValue) * 100);

  // Determine difficulty
  let difficulty = "perfect";
  let suggestedTarget = targetValue;
  let message = "";
  let emoji = "👍";
  let action = "";

  if (pacePercent > 120) {
    // On track to exceed by 20%+
    difficulty = "too-easy";
    suggestedTarget = Math.round(targetValue * 1.25);
    message = `Du erreichst dein Ziel wahrscheinlich zu früh. 
      Mit deinem aktuellen Tempo wirst du ${Math.round(pacePercent)}% deines Ziels erreichen.`;
    emoji = "🎯";
    action = "Ziel erhöhen";
  } else if (pacePercent < 80) {
    // On track to miss by 20%+
    difficulty = "too-hard";
    suggestedTarget = Math.round(targetValue * 0.8);
    message = `Dein aktuelles Ziel ist zu ehrgeizig. 
      Mit deinem Tempo wirst du nur ${Math.round(pacePercent)}% erreichen. 
      Lass uns dein Ziel realistischer machen.`;
    emoji = "⚠️";
    action = "Ziel senken";
  } else if (pacePercent >= 95 && pacePercent <= 105) {
    difficulty = "perfect";
    message = `Großartig! Du bist genau auf Kurs. 
      Mit deinem aktuellen Tempo wirst du genau dein Ziel erreichen.`;
    emoji = "✨";
    action = null;
  } else {
    difficulty = "slightly-off";
    if (pacePercent > 105) {
      suggestedTarget = Math.round(targetValue * 1.1);
      message = `Du machst bessere Fortschritte als erwartet! 
        Sollen wir dein Ziel um 10% erhöhen?`;
      emoji = "🚀";
      action = "Ziel erhöhen";
    } else {
      suggestedTarget = Math.round(targetValue * 0.9);
      message = `Du läufst ein bisschen hinter dem Plan zurück. 
        Sollen wir dein Ziel leicht senken?`;
      emoji = "📉";
      action = "Ziel anpassen";
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "2px solid var(--c-primary)",
        borderRadius: "var(--r-lg)",
        padding: "var(--s-5)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background gradient accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "200px",
          height: "200px",
          background: "radial-gradient(circle, var(--c-primary) 0%, transparent 70%)",
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />

      {/* Close button */}
      <button
        onClick={() => {
          setIsOpen(false);
          if (onClose) onClose();
        }}
        style={{
          position: "absolute",
          top: "var(--s-4)",
          right: "var(--s-4)",
          background: "none",
          border: "none",
          fontSize: "var(--text-lg)",
          cursor: "pointer",
          color: "var(--c-text-3)",
          zIndex: 1,
        }}
      >
        ✕
      </button>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        marginBottom: "var(--s-4)",
      }}>
        <div style={{ fontSize: "var(--text-2xl)" }}>
          {emoji}
        </div>
        <div>
          <div style={{
            fontSize: "var(--text-lg)",
            fontWeight: 700,
            color: "var(--c-text)",
          }}>
            Ziel-Anpassungsvorschlag
          </div>
          <div style={{
            fontSize: "var(--text-xs)",
            color: "var(--c-text-3)",
            textTransform: "uppercase",
          }}>
            Basierend auf deinem Fortschritt
          </div>
        </div>
      </div>

      {/* Message */}
      <div style={{
        fontSize: "var(--text-md)",
        color: "var(--c-text)",
        lineHeight: 1.6,
        marginBottom: "var(--s-5)",
        whiteSpace: "pre-line",
      }}>
        {message}
      </div>

      {/* Progress visualization */}
      <div style={{
        background: "var(--c-bg-2)",
        padding: "var(--s-4)",
        borderRadius: "var(--r-md)",
        marginBottom: "var(--s-5)",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--s-4)",
        }}>
          {/* Current Progress */}
          <div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              textTransform: "uppercase",
              marginBottom: "var(--s-2)",
            }}>
              Aktueller Fortschritt
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: "var(--s-2)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {progressPercent}%
            </div>
            <div className="progress-track" style={{ height: 4, marginBottom: "var(--s-2)" }}>
              <div
                className="progress-fill progress-info"
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
            }}>
              {unit === "€"
                ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(currentValue)
                : currentValue} / {unit === "€"
                ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(targetValue)
                : targetValue}
            </div>
          </div>

          {/* Projected Progress */}
          <div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
              textTransform: "uppercase",
              marginBottom: "var(--s-2)",
            }}>
              Projizierter Fortschritt
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: pacePercent > 110 ? "var(--c-success)" : pacePercent < 90 ? "var(--c-warning)" : "var(--c-text)",
              marginBottom: "var(--s-2)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {Math.min(pacePercent, 200)}%
            </div>
            <div className="progress-track" style={{ height: 4, marginBottom: "var(--s-2)" }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(pacePercent, 100)}%`,
                  background: pacePercent > 110 ? "var(--c-success)" : pacePercent < 90 ? "var(--c-warning)" : "var(--c-info)",
                }}
              />
            </div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-3)",
            }}>
              Bei aktuellem Tempo
            </div>
          </div>
        </div>
      </div>

      {/* Suggested target */}
      {action && suggestedTarget !== targetValue && (
        <div style={{
          background: "rgba(59, 130, 246, 0.1)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          padding: "var(--s-4)",
          borderRadius: "var(--r-md)",
          marginBottom: "var(--s-5)",
        }}>
          <div style={{
            fontSize: "var(--text-xs)",
            color: "var(--c-text-3)",
            textTransform: "uppercase",
            marginBottom: "var(--s-2)",
          }}>
            Empfohlenes neues Ziel
          </div>
          <div style={{
            fontSize: "var(--text-lg)",
            fontWeight: 700,
            color: "var(--c-primary)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {unit === "€"
              ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(suggestedTarget)
              : suggestedTarget}
          </div>
          <div style={{
            fontSize: "var(--text-sm)",
            color: "var(--c-text-2)",
            marginTop: "var(--s-2)",
          }}>
            {suggestedTarget > targetValue
              ? `+${unit === "€"
                ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(suggestedTarget - targetValue)
                : suggestedTarget - targetValue} mehr`
              : `-${unit === "€"
                ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(targetValue - suggestedTarget)
                : targetValue - suggestedTarget} weniger`}
            {" "}als aktuelles Ziel
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        display: "flex",
        gap: "var(--s-3)",
      }}>
        {action && suggestedTarget !== targetValue ? (
          <>
            <button
              className="btn btn-primary btn-md"
              onClick={() => {
                setIsOpen(false);
                if (onAccept) onAccept(suggestedTarget);
              }}
              style={{ flex: 1 }}
            >
              {action} ✓
            </button>
            <button
              className="btn btn-secondary btn-md"
              onClick={() => {
                setIsOpen(false);
                if (onDismiss) onDismiss();
              }}
              style={{ flex: 1 }}
            >
              Jetzt nicht
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-md"
            onClick={() => setIsOpen(false)}
            style={{ flex: 1 }}
          >
            Danke! ✓
          </button>
        )}
      </div>
    </div>
  );
}

export default GoalAdjustmentSuggestion;
