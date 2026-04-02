/**
 * SkeletonCard — shimmer loading placeholder
 *
 * lines: number of text skeleton lines (default 3)
 * height: fixed card height (optional)
 */
export function SkeletonCard({ lines = 3, height, className = "", style }) {
  return (
    <div
      className={`skeleton-card ${className}`}
      style={{ height, ...style }}
      aria-hidden="true"
    >
      <div className="skeleton" style={{ width: "40%", height: 12, marginBottom: 12, borderRadius: "var(--r-xs)" }} />
      <div className="skeleton" style={{ width: "70%", height: 28, marginBottom: 16, borderRadius: "var(--r-xs)" }} />
      {Array.from({ length: lines - 2 > 0 ? lines - 2 : 1 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            width: i % 2 === 0 ? "90%" : "65%",
            height: 12,
            marginBottom: 8,
            borderRadius: "var(--r-xs)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonLine — inline text placeholder
 */
export function SkeletonLine({ width = "100%", height = 14, className = "" }) {
  return (
    <div
      className={`skeleton-text ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export default SkeletonCard;
