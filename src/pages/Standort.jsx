import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import LocationMap from "../components/LocationMap";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const INDUSTRIES = [
  { value: "", label: "Alle Branchen" },
  { value: "retail", label: "Einzelhandel" },
  { value: "gastro", label: "Gastronomie" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "saas", label: "SaaS" },
  { value: "dienstleistung", label: "Dienstleistung" },
  { value: "gesundheit", label: "Gesundheit & Medizin" },
  { value: "bildung", label: "Bildung" },
  { value: "handwerk", label: "Handwerk" },
  { value: "fitness", label: "Fitness & Sport" },
  { value: "beauty", label: "Beauty & Wellness" },
];

/* ── Distance helpers ─────────────────────────────────────────────────────── */
function distanceBadgeClass(km) {
  if (km < 1) return "badge badge-danger";
  if (km < 3) return "badge badge-warning";
  return "badge badge-neutral";
}

function formatDist(km) {
  if (km == null) return "";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/* ── Skeletons ────────────────────────────────────────────────────────────── */
function CompetitorSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-3)",
            padding: "var(--s-4) var(--s-2)",
            borderBottom: i < 4 ? "1px solid var(--c-border)" : "none",
          }}
        >
          <div
            className="skeleton"
            style={{ width: 26, height: 26, borderRadius: "var(--r-full)", flexShrink: 0 }}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            <div className="skeleton skeleton-text" style={{ width: "55%" }} />
            <div className="skeleton skeleton-text" style={{ width: "35%" }} />
          </div>
          <div
            className="skeleton"
            style={{ width: 52, height: 20, borderRadius: "var(--r-full)" }}
          />
        </div>
      ))}
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          className="skeleton"
          style={{ width: 80, height: 80, borderRadius: "var(--r-full)" }}
        />
      </div>
      <div>
        <div
          className="skeleton skeleton-text"
          style={{ width: "40%", marginBottom: "var(--s-3)" }}
        />
        {[80, 68, 55].map((w, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: `${w}%`, marginBottom: "var(--s-2)" }}
          />
        ))}
      </div>
      <div>
        <div
          className="skeleton skeleton-text"
          style={{ width: "40%", marginBottom: "var(--s-3)" }}
        />
        {[72, 60].map((w, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: `${w}%`, marginBottom: "var(--s-2)" }}
          />
        ))}
      </div>
      <div className="skeleton" style={{ height: 72, borderRadius: "var(--r-md)" }} />
    </div>
  );
}

/* ── Competition Score Ring ───────────────────────────────────────────────── */
function CompetitionRing({ score }) {
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  let stroke = "#555555";
  if (score > 65) stroke = "#111111";
  else if (score > 35) stroke = "#888888";

  return (
    <div className="health-ring-wrap">
      <svg
        width={size}
        height={size}
        className="health-ring-svg"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </svg>
      <span className="health-ring-score" style={{ fontSize: "var(--text-lg)" }}>
        {score}
      </span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Wettbewerb</span>
    </div>
  );
}

/* ── Competitor Row ───────────────────────────────────────────────────────── */
function CompetitorRow({ comp, idx, isLast }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--s-3)",
        padding: "var(--s-3) var(--s-2)",
        borderRadius: "var(--r-sm)",
        borderBottom: isLast ? "none" : "1px solid var(--c-border)",
        background: hovered ? "var(--c-surface-2)" : "transparent",
        transition: "background var(--dur-fast) ease",
        cursor: "default",
      }}
    >
      {/* Number badge */}
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "var(--r-full)",
          background: "#f0f0f0",
          color: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {idx + 1}
      </div>

      {/* Name + address */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            flexWrap: "wrap",
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "var(--text-md)",
              color: "var(--c-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {comp.name}
          </span>
          {comp.rating != null && (
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--c-text-2)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              ⭐ {Number(comp.rating).toFixed(1)}
            </span>
          )}
        </div>
        {comp.address && (
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--c-text-3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {comp.address}
          </div>
        )}
      </div>

      {/* Distance badge */}
      {comp.distance_km != null && (
        <span className={distanceBadgeClass(comp.distance_km)} style={{ flexShrink: 0 }}>
          {formatDist(comp.distance_km)}
        </span>
      )}
    </div>
  );
}

/* ── Analysis Panel ───────────────────────────────────────────────────────── */
function AnalysisPanel({ analysis }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      {/* Competition score ring */}
      {analysis.competition_score != null && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: "var(--s-2)",
          }}
        >
          <CompetitionRing score={Number(analysis.competition_score)} />
        </div>
      )}

      {/* Stärken */}
      {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: "var(--s-2)" }}>
            Stärken
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {analysis.strengths.map((item, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)" }}
              >
                <span
                  style={{
                    color: "#555555",
                    flexShrink: 0,
                    fontWeight: 700,
                    lineHeight: 1.5,
                    fontSize: "var(--text-md)",
                  }}
                >
                  ✓
                </span>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--c-text-2)",
                    lineHeight: 1.55,
                  }}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnungen */}
      {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: "var(--s-2)" }}>
            Warnungen
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {analysis.warnings.map((item, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)" }}
              >
                <span
                  style={{
                    color: "var(--c-warning)",
                    flexShrink: 0,
                    lineHeight: 1.5,
                    fontSize: "var(--text-md)",
                  }}
                >
                  ⚠
                </span>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--c-text-2)",
                    lineHeight: 1.55,
                  }}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KI-Empfehlung */}
      {analysis.recommendation && (
        <div
          style={{
            background: "#f0f0f0",
            borderLeft: "3px solid #000000",
            borderRadius: "var(--r-md)",
            padding: "var(--s-4)",
            fontSize: "var(--text-sm)",
            color: "var(--c-text)",
            fontStyle: "italic",
            lineHeight: "var(--lh-loose)",
          }}
        >
          {analysis.recommendation}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function Standort() {
  const { authHeader } = useAuth();

  const [address, setAddress]   = useState("");
  const [industry, setIndustry] = useState("");
  const [radius, setRadius]     = useState(3);
  const [sortBy, setSortBy]     = useState("distance");
  const [searched, setSearched] = useState(false);

  const [competitors, setCompetitors]               = useState(null);
  const [analysis, setAnalysis]                     = useState(null);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading]       = useState(false);
  const [competitorsError, setCompetitorsError]     = useState(null);
  const [analysisError, setAnalysisError]           = useState(null);

  /* Load saved address from API on mount */
  useEffect(() => {
    fetch("/api/location/address", { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.address) setAddress(d.address); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Trigger analysis */
  function handleAnalyse() {
    if (!address.trim()) return;

    setSearched(true);
    setCompetitorsLoading(true);
    setAnalysisLoading(true);
    setCompetitorsError(null);
    setAnalysisError(null);
    setCompetitors(null);
    setAnalysis(null);

    const qs = `address=${encodeURIComponent(address.trim())}&industry=${encodeURIComponent(industry)}&radius=${radius}`;

    fetch(`/api/location/competitors?${qs}`, { headers: authHeader() })
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((e) => Promise.reject(new Error(e.detail || `Status ${r.status}`)))
      )
      .then(setCompetitors)
      .catch((e) => setCompetitorsError(e.message))
      .finally(() => setCompetitorsLoading(false));

    fetch("/api/location/analysis", { headers: authHeader() })
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((e) => Promise.reject(new Error(e.detail || `Status ${r.status}`)))
      )
      .then(setAnalysis)
      .catch((e) => setAnalysisError(e.message))
      .finally(() => setAnalysisLoading(false));
  }

  /* Sorted competitor list */
  const sorted = competitors
    ? [...competitors].sort((a, b) =>
        sortBy === "rating"
          ? (b.rating ?? 0) - (a.rating ?? 0)
          : (a.distance_km ?? 0) - (b.distance_km ?? 0)
      )
    : [];

  return (
    <>
      {/* Responsive two-column grid */}
      <style>{`
        .standort-results-grid {
          display: grid;
          grid-template-columns: 3fr 2fr;
          gap: var(--s-6);
          align-items: start;
        }
        @media (max-width: 768px) {
          .standort-results-grid { grid-template-columns: 1fr; }
        }
        .standort-search-bar {
          display: flex;
          flex-wrap: wrap;
          gap: var(--s-3);
          align-items: center;
        }
      `}</style>

      <div
        className="page-enter"
        style={{ minHeight: "calc(100dvh - var(--nav-height))" }}
      >
        <div className="page-content">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "var(--s-6)" }}>
            <h1 className="page-title">Standort & Wettbewerber</h1>
            <p className="page-subtitle">
              Analysiere dein lokales Marktumfeld und entdecke Chancen
            </p>
          </div>

          {/* ── Search Bar ──────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: "var(--s-6)" }}>
            <div className="standort-search-bar">

              {/* Address input */}
              <input
                className="input"
                type="text"
                placeholder="Adresse eingeben, z. B. Marienplatz 1, München"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyse()}
                style={{ flex: "1 1 240px" }}
              />

              {/* Branche select */}
              <select
                className="select"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                style={{ flex: "0 0 180px" }}
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>

              {/* Radius slider */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-2)",
                  flex: "0 0 auto",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--c-text-2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Radius
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{
                    width: 90,
                    accentColor: "#000000",
                    cursor: "pointer",
                  }}
                />
                <span
                  className="badge badge-info"
                  style={{ minWidth: 46, justifyContent: "center" }}
                >
                  {radius} km
                </span>
              </div>

              {/* Analysieren button */}
              <button
                className="btn btn-primary"
                onClick={handleAnalyse}
                disabled={!address.trim()}
                style={{ flex: "0 0 auto" }}
              >
                Analysieren
              </button>
            </div>
          </div>

          {/* ── Google Maps Section ─────────────────────────────────────── */}
          <div
            style={{
              height: 400,
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
              border: "1px solid var(--c-border)",
              background: "var(--c-surface)",
              marginBottom: "var(--s-6)",
            }}
          >
            {MAPS_KEY ? (
              <LocationMap apiKey={MAPS_KEY} />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--s-3)",
                }}
              >
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--c-text-4)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                <span
                  style={{
                    fontSize: "var(--text-md)",
                    fontWeight: 600,
                    color: "var(--c-text-3)",
                  }}
                >
                  Karte nicht verfügbar
                </span>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--c-text-4)",
                    textAlign: "center",
                    maxWidth: 260,
                  }}
                >
                  VITE_GOOGLE_MAPS_API_KEY ist nicht konfiguriert
                </span>
              </div>
            )}
          </div>

          {/* ── Results / Prompt ────────────────────────────────────────── */}
          {!searched ? (
            /* Pre-search prompt */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--s-12) var(--s-8)",
                gap: "var(--s-3)",
                textAlign: "center",
                background: "var(--c-surface-2)",
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--c-border)",
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--c-text-4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p
                style={{
                  fontSize: "var(--text-md)",
                  fontWeight: 600,
                  color: "var(--c-text-3)",
                }}
              >
                Adresse eingeben und auf „Analysieren" klicken
              </p>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-4)" }}>
                Wettbewerber und KI-Standortanalyse erscheinen hier
              </p>
            </div>
          ) : (
            /* Two-column results grid */
            <div className="standort-results-grid">

              {/* ── Left: Wettbewerber-Liste (60%) ──────────────────── */}
              <div className="card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "var(--s-4)",
                  }}
                >
                  <h2 className="section-title">
                    Wettbewerber
                    {competitors !== null && (
                      <span
                        className="badge badge-neutral"
                        style={{ marginLeft: "var(--s-2)", fontWeight: 500 }}
                      >
                        {competitors.length}
                      </span>
                    )}
                  </h2>

                  {/* Sort pills */}
                  <div className="tabs-pill">
                    <button
                      className={`tab-pill ${sortBy === "distance" ? "active" : ""}`}
                      onClick={() => setSortBy("distance")}
                    >
                      Distanz
                    </button>
                    <button
                      className={`tab-pill ${sortBy === "rating" ? "active" : ""}`}
                      onClick={() => setSortBy("rating")}
                    >
                      Bewertung
                    </button>
                  </div>
                </div>

                {/* Skeleton */}
                {competitorsLoading && <CompetitorSkeleton />}

                {/* Error */}
                {!competitorsLoading && competitorsError && (
                  <div className="error-state" style={{ padding: "var(--s-8)" }}>
                    <div className="error-icon">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                      {competitorsError}
                    </p>
                  </div>
                )}

                {/* Empty */}
                {!competitorsLoading &&
                  !competitorsError &&
                  competitors !== null &&
                  sorted.length === 0 && (
                    <div className="empty-state">
                      <svg
                        className="empty-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <p className="empty-title">Keine Wettbewerber gefunden</p>
                      <p className="empty-text">
                        Im gewählten Radius wurden keine Wettbewerber ermittelt.
                        Versuche einen größeren Radius.
                      </p>
                    </div>
                  )}

                {/* Results */}
                {!competitorsLoading && !competitorsError && sorted.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {sorted.map((comp, idx) => (
                      <CompetitorRow
                        key={comp.place_id || idx}
                        comp={comp}
                        idx={idx}
                        isLast={idx === sorted.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Right: KI-Standort-Analyse (40%) ────────────────── */}
              <div className="card">
                <h2 className="section-title" style={{ marginBottom: "var(--s-5)" }}>
                  KI-Standort-Analyse
                </h2>

                {/* Skeleton */}
                {analysisLoading && <AnalysisSkeleton />}

                {/* Error */}
                {!analysisLoading && analysisError && (
                  <div className="error-state" style={{ padding: "var(--s-8)" }}>
                    <div className="error-icon">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                      {analysisError}
                    </p>
                  </div>
                )}

                {/* Results */}
                {!analysisLoading && !analysisError && analysis !== null && (
                  <AnalysisPanel analysis={analysis} />
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  );
}
