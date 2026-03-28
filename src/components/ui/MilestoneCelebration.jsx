import { useEffect, useState } from "react";

/**
 * MilestoneCelebration Component
 * 
 * Celebrates goal milestones at 50%, 75%, and 100%
 * - Animated confetti/celebration effect
 * - Personalized message per milestone
 * - Suggests next challenge
 * - Can be triggered as modal or toast
 */
export function MilestoneCelebration({
  isOpen = false,
  onClose = null,
  goalLabel = "Umsatz",
  percentage = 50,
  currentValue = 10000,
  targetValue = 20000,
  unit = "€",
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  // Milestone-specific messages and emojis
  const milestoneConfig = {
    50: {
      emoji: "🎯",
      title: "Halbzeitpause!",
      message: "Du hast bereits 50% deines Ziels erreicht!",
      nextChallenge: "Ziel erreicht? Erhöhe dein nächstes um 20%!",
      celebrationColor: "var(--c-warning)",
    },
    75: {
      emoji: "🔥",
      title: "Fast am Ziel!",
      message: "Nur noch 25% bis zum Ziel. Du schaffst das!",
      nextChallenge: "Ein letzter Sprint und du bist am Ziel!",
      celebrationColor: "#ff6b6b",
    },
    100: {
      emoji: "🎉",
      title: "Ziel erreicht!",
      message: `Herzlichen Glückwunsch! Du hast dein ${goalLabel}-Ziel erreicht!`,
      nextChallenge: "Starte ein neues Ziel und werde noch besser!",
      celebrationColor: "var(--c-success)",
    },
  };

  const config = milestoneConfig[percentage] || milestoneConfig[50];

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Confetti animation */}
      {showConfetti && <Confetti />}

      {/* Celebration Modal */}
      <div
        className="modal-backdrop"
        onClick={handleClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          opacity: isVisible ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: isVisible ? "auto" : "none",
        }}
      >
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--c-surface)",
            borderRadius: "var(--r-xl)",
            padding: "var(--s-8)",
            maxWidth: "500px",
            width: "90%",
            textAlign: "center",
            boxShadow: "var(--shadow-xl)",
            animation: "scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            border: `2px solid ${config.celebrationColor}`,
          }}
        >
          {/* Big Emoji */}
          <div style={{
            fontSize: "var(--text-5xl)",
            marginBottom: "var(--s-4)",
            display: "inline-block",
            animation: "bounce 1s ease-in-out infinite",
          }}>
            {config.emoji}
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize: "var(--text-2xl)",
              fontWeight: 700,
              color: config.celebrationColor,
              marginBottom: "var(--s-3)",
              margin: 0,
            }}
          >
            {config.title}
          </h2>

          {/* Message */}
          <p
            style={{
              fontSize: "var(--text-md)",
              color: "var(--c-text)",
              lineHeight: 1.6,
              marginBottom: "var(--s-5)",
              margin: "0 0 var(--s-5) 0",
            }}
          >
            {config.message}
          </p>

          {/* Progress Stats */}
          <div
            style={{
              background: "var(--c-bg-2)",
              padding: "var(--s-4)",
              borderRadius: "var(--r-lg)",
              marginBottom: "var(--s-5)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s-3)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--c-text-3)",
                    textTransform: "uppercase",
                  }}
                >
                  Erreicht
                </div>
                <div
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 700,
                    color: config.celebrationColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {unit === "€"
                    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(currentValue)
                    : currentValue}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--c-text-3)",
                    textTransform: "uppercase",
                  }}
                >
                  Ziel
                </div>
                <div
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 700,
                    color: "var(--c-text-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {unit === "€"
                    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(targetValue)
                    : targetValue}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="progress-track" style={{ marginTop: "var(--s-3)", height: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${percentage}%`,
                  background: config.celebrationColor,
                  transition: "width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            </div>
          </div>

          {/* Next Challenge */}
          <div
            style={{
              background: "rgba(59, 130, 246, 0.1)",
              padding: "var(--s-4)",
              borderRadius: "var(--r-lg)",
              marginBottom: "var(--s-5)",
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--c-text-2)",
                lineHeight: 1.5,
              }}
            >
              <strong>✨ Nächste Herausforderung:</strong>{" "}
              {config.nextChallenge}
            </div>
          </div>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
            }}
          >
            <button
              className="btn btn-secondary btn-md"
              onClick={handleClose}
              style={{ flex: 1 }}
            >
              Weiter
            </button>
            <button
              className="btn btn-primary btn-md"
              onClick={() => {
                // Navigate to goal creation or new goal
                window.location.href = "/dashboard#new-goal";
                handleClose();
              }}
              style={{ flex: 1 }}
            >
              Neues Ziel setzen →
            </button>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes scaleIn {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes fall {
          to {
            transform: translateY(100vh) rotateZ(360deg);
            opacity: 0;
          }
        }

        .confetti {
          position: fixed;
          width: 10px;
          height: 10px;
          background: var(--c-primary);
          animation: fall 3s ease-in forwards;
          pointer-events: none;
          z-index: 1999;
        }
      `}</style>
    </>
  );
}

/**
 * Confetti animation component
 */
function Confetti() {
  const colors = [
    "var(--c-primary)",
    "var(--c-success)",
    "var(--c-warning)",
    "#ff6b6b",
    "#4ecdc4",
  ];

  const confetti = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 1,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  return (
    <>
      {confetti.map((item) => (
        <div
          key={item.id}
          style={{
            position: "fixed",
            left: `${item.left}%`,
            top: 0,
            width: "10px",
            height: "10px",
            backgroundColor: item.color,
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 1999,
            animation: `fall ${item.duration}s ease-in forwards`,
            animationDelay: `${item.delay}s`,
          }}
        />
      ))}

      <style>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotateZ(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

export default MilestoneCelebration;
