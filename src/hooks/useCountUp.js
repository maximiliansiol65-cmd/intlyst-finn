/* eslint-disable */
import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 (or previous value) to `end` over `duration` ms.
 * Returns the current animated value as a number.
 *
 * @param {number} end       Target value
 * @param {number} duration  Animation duration in ms (default 800)
 * @param {boolean} enabled  Set false to skip animation
 */
export function useCountUp(end, duration = 800, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : end);
  const rafRef   = useRef(null);
  const startRef = useRef(null);
  const fromRef  = useRef(0);

  useEffect(() => {
    if (!enabled || typeof end !== "number" || isNaN(end)) {
      setValue(end ?? 0);
      return;
    }
    // Prefer reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(end);
      return;
    }

    const from = fromRef.current;
    const diff = end - from;
    startRef.current = null;

    function step(timestamp) {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + diff * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(end);
        fromRef.current = end;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration, enabled]);

  return value;
}

/**
 * Format a number for display (abbreviates large numbers, adds € prefix)
 * Examples: 1234 → "1.234", 1234567 → "1,2M", with euro: "€1.234"
 */
export function formatKPI(value, { prefix = "", suffix = "", decimals = 0 } = {}) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const n = Number(value);
  let formatted;
  if (Math.abs(n) >= 1_000_000) {
    formatted = (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  } else if (Math.abs(n) >= 10_000) {
    formatted = (n / 1_000).toFixed(1).replace(".", ",") + "K";
  } else {
    formatted = n.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return `${prefix}${formatted}${suffix}`;
}
