import { useEffect, useRef, useState } from "react";

/**
 * useCounter — animates a number from 0 (or previous) to target in 600ms
 */
function useCounter(target, duration = 600) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (target == null || isNaN(Number(target))) {
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    const to = Number(target);
    if (from === to) return;

    // Prefer no animation on reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    startRef.current = null;

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * ease;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

/**
 * KPICard — Enhanced with click-to-expand details
 *
 * value:    number | string
 * label:    string
 * trend:    number (positive = up, negative = down)  e.g. 12.3 or -4.1
 * unit:     string  e.g. "€" | "%" | ""
 * compare:  string  e.g. "vs. letzter Monat"
 * details:  object with extended data {previous, absolute_change, forecast, period_type}
 * animate:  boolean (default true) — counter animation
 * onClick:  () => void
 */
export function KPICard({
  value,
  label,
  trend,
  unit = "",
  compare = "",
  details = null,
  animate = true,
  onClick,
  className = "",
}) {
  const [showDetails, setShowDetails] = useState(false);
  const numericValue = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  const animated = useCounter(animate && !isNaN(numericValue) ? numericValue : null);

  const displayValue = (() => {
    if (!animate || isNaN(numericValue)) return value;
    const v = animated;
    if (unit === "€") {
      return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v) + " €";
    }
    if (unit === "%") return v.toFixed(1) + " %";
    if (Number.isInteger(numericValue)) return Math.round(v).toLocaleString("de-DE");
    return v.toFixed(1);
  })();

  const trendNum = trend != null ? parseFloat(trend) : null;
  const isUp = trendNum != null && trendNum >= 0;
  const hasDetails = details && Object.keys(details).length > 0;

  const handleCardClick = () => {
    if (hasDetails) setShowDetails(true);
    if (onClick) onClick();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <>
      <div
        className={`kpi-card ${hasDetails ? "kpi-card-expandable" : ""} ${className}`}
        onClick={handleCardClick}
        role={hasDetails || onClick ? "button" : undefined}
        tabIndex={hasDetails || onClick ? 0 : undefined}
        onKeyDown={hasDetails || onClick ? handleKeyDown : undefined}
        style={{
          cursor: hasDetails ? "pointer" : "default",
          transition: "all 0.2s ease",
          position: "relative",
        }}
      >
        <div className="kpi-label">{label}</div>
        <div className="kpi-value tabular">{displayValue}</div>
        {(trendNum != null || compare) && (
          <div className="kpi-footer">
            {trendNum != null && (
              <span className={isUp ? "kpi-trend-up" : "kpi-trend-down"}>
                {isUp ? "↑" : "↓"} {Math.abs(trendNum).toFixed(1)}%
              </span>
            )}
            {compare && <span className="kpi-compare">{compare}</span>}
          </div>
        )}
        {hasDetails && (
          <div className="kpi-expand-icon" style={{ position: "absolute", top: "var(--s-3)", right: "var(--s-3)", opacity: 0.5 }}>
            ⤢
          </div>
        )}
      </div>

      {hasDetails && showDetails && (
        <KPIDetailsModal
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          label={label}
          value={numericValue}
          unit={unit}
          details={details}
          trend={trendNum}
        />
      )}
    </>
  );
}

/**
 * KPIDetailsModal — Shows detailed stats for a KPI
 */
function KPIDetailsModal({ isOpen, onClose, label, value, unit, details, trend }) {
  if (!isOpen) return null;

  const formatNumber = (n) => {
    if (n == null) return "—";
    if (unit === "€") {
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
    }
    if (unit === "%") return n.toFixed(2) + " %";
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);
  };

  const absChange = details.absolute_change != null ? details.absolute_change : (value - (details.previous || 0));
  const changePercent = trend || ((details.previous > 0) ? ((absChange / details.previous) * 100) : 0);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-surface)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          padding: "var(--s-5)",
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          animation: "slideUp 0.3s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-5)" }}>
          <h2 style={{ margin: 0, color: "var(--c-text)" }}>{label}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "var(--text-xl)",
              cursor: "pointer",
              color: "var(--c-text-3)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Current Value */}
        <div className="card" style={{ marginBottom: "var(--s-4)", padding: "var(--s-4)" }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>
            Aktueller Wert
          </div>
          <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-primary)", fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(value)}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)", marginBottom: "var(--s-5)" }}>
          {/* Change Absolute */}
          <div className="card" style={{ padding: "var(--s-4)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
              Absolute Änderung
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: absChange >= 0 ? "var(--c-success)" : "var(--c-danger)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {absChange >= 0 ? "+" : ""}{formatNumber(absChange)}
            </div>
          </div>

          {/* Change Percent */}
          <div className="card" style={{ padding: "var(--s-4)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
              % Änderung
            </div>
            <div style={{
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: changePercent >= 0 ? "var(--c-success)" : "var(--c-danger)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {changePercent >= 0 ? "↑" : "↓"} {Math.abs(changePercent).toFixed(1)}%
            </div>
          </div>

          {/* Previous Value */}
          {details.previous != null && (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
                Vorheriger Wert
              </div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(details.previous)}
              </div>
            </div>
          )}

          {/* Period */}
          {details.period_type && (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
                Zeitraum
              </div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
                {details.period_type === "monthly" ? "Monatlich" : details.period_type === "weekly" ? "Wöchentlich" : details.period_type}
              </div>
            </div>
          )}

          {/* Forecast */}
          {details.forecast != null && (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
                Prognose (30d)
              </div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(details.forecast)}
              </div>
            </div>
          )}

          {/* Benchmark */}
          {details.benchmark != null && (
            <div className="card" style={{ padding: "var(--s-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-2)", textTransform: "uppercase" }}>
                Branchen-Ø
              </div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(details.benchmark)}
              </div>
            </div>
          )}
        </div>

        {/* Additional Notes */}
        {details.notes && (
          <div className="card" style={{ padding: "var(--s-4)", background: "var(--c-bg-2)" }}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.5 }}>
              {details.notes}
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default KPICard;
