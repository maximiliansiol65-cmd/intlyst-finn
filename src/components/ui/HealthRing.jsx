import { useEffect, useRef, useState } from "react";

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score) {
  if (score >= 80) return "var(--c-success)";
  if (score >= 60) return "var(--c-warning)";
  return "var(--c-danger)";
}

function scoreLabel(score) {
  if (score >= 80) return "Sehr gut";
  if (score >= 60) return "Gut";
  if (score >= 40) return "Verbesserungsbedarf";
  return "Kritisch";
}

/**
 * HealthRing — animated SVG donut ring
 *
 * score:     0–100
 * size:      px (default 120)
 * showLabel: boolean (default true)
 * statusText: string override for status label
 */
export function HealthRing({ score = 0, size = 120, showLabel = true, statusText }) {
  const [animated, setAnimated] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimated(score);
      return;
    }
    let start = null;
    const duration = 1200;
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimated(score * ease);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      else setAnimated(score);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score]);

  const offset = CIRCUMFERENCE - (animated / 100) * CIRCUMFERENCE;
  const color = scoreColor(score);
  const label = statusText ?? scoreLabel(score);

  return (
    <div className="health-ring-wrap" style={{ width: size }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          className="health-ring-svg"
          width={size}
          height={size}
          viewBox="0 0 100 100"
          aria-label={`Business-Gesundheit: ${Math.round(score)} von 100`}
          role="img"
        >
          <circle
            cx="50" cy="50"
            r={RADIUS}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth="2"
          />
        </svg>
        <div
          className="health-ring-score tabular"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size > 100 ? 20 : 15,
            fontWeight: 700,
            color: "#000000",
          }}
        >
          {Math.round(animated)}
        </div>
      </div>
      {showLabel && (
        <div className="health-ring-label">
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
            Business-Gesundheit
          </div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color }}>
            {label}
          </div>
        </div>
      )}
    </div>
  );
}

export default HealthRing;
