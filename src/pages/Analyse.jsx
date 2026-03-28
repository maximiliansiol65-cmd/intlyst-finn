import { useState, useEffect } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import {
  HealthRing,
  SkeletonCard,
  Badge,
  Card,
} from "../components/ui";

// ── Constants ──────────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: "analyse",   label: "Analyse" },
  { id: "prognose",  label: "Prognose" },
  { id: "markt",     label: "Markt" },
  { id: "benchmark", label: "Benchmark" },
];

const FORECAST_METRICS = [
  { id: "revenue",    label: "Umsatz" },
  { id: "traffic",    label: "Traffic" },
  { id: "conversion", label: "Conversion" },
  { id: "customers",  label: "Kunden" },
];

const INDUSTRIES = [
  { value: "ecommerce", label: "E-Commerce" },
  { value: "saas",      label: "SaaS / Software" },
  { value: "retail",    label: "Einzelhandel" },
  { value: "gastro",    label: "Gastronomie" },
  { value: "health",    label: "Gesundheit & Beauty" },
  { value: "services",  label: "Dienstleistungen" },
];

const INSIGHT_TYPE_CONFIG = {
  strength:    { label: "Stärke",   badgeVariant: "success", borderColor: "var(--c-success)" },
  weakness:    { label: "Schwäche", badgeVariant: "danger",  borderColor: "var(--c-danger)"  },
  opportunity: { label: "Chance",   badgeVariant: "info",    borderColor: "var(--c-primary)" },
  risk:        { label: "Risiko",   badgeVariant: "warning", borderColor: "var(--c-warning)" },
};

const SEASON_CONFIG = {
  high:   { label: "Hochsaison",  badgeVariant: "success" },
  normal: { label: "Normal",      badgeVariant: "neutral" },
  low:    { label: "Nebensaison", badgeVariant: "warning" },
};

const TREND_ICON = { up: "↑", down: "↓", stable: "→" };
const TREND_COLOR = {
  up:     "var(--c-success)",
  down:   "var(--c-danger)",
  stable: "var(--c-text-3)",
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtAxisDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch {
    return String(dateStr);
  }
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <div className="error-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="empty-title">Fehler beim Laden</div>
      <p className="empty-text">{message || "Ein unbekannter Fehler ist aufgetreten. Bitte versuche es erneut."}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

// ── Tab 1 — Analyse ────────────────────────────────────────────────────────────

function AnalyseInsightCard({ insight }) {
  const [open, setOpen] = useState(false);
  const cfg = INSIGHT_TYPE_CONFIG[insight.type] ?? INSIGHT_TYPE_CONFIG.opportunity;

  function toggle() {
    setOpen((v) => !v);
  }

  return (
    <div
      className="card"
      style={{
        borderLeft: `3px solid ${cfg.borderColor}`,
        padding: "var(--s-4) var(--s-5)",
      }}
    >
      {/* Header row — always visible, acts as toggle */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--s-3)",
          outline: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
            <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "var(--text-md)",
              fontWeight: 600,
              color: "var(--c-text)",
              lineHeight: 1.4,
              marginBottom: "var(--s-2)",
            }}
          >
            {insight.title}
          </div>

          {/* Description */}
          {insight.description && (
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--c-text-2)",
                lineHeight: 1.6,
              }}
            >
              {insight.description}
            </div>
          )}

          {/* Evidence box */}
          {insight.evidence && (
            <div
              style={{
                marginTop: "var(--s-3)",
                padding: "var(--s-2) var(--s-3)",
                background: "var(--c-surface-3)",
                borderRadius: "var(--r-xs)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--c-text-2)",
                lineHeight: 1.65,
              }}
            >
              {insight.evidence}
            </div>
          )}
        </div>

        {/* Chevron */}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: "var(--c-text-3)",
            marginTop: 3,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--dur-base) var(--ease-out)",
          }}
        >
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Expandable action section */}
      <div
        style={{
          maxHeight: open ? "400px" : "0px",
          overflow: "hidden",
          transition: "max-height var(--dur-slow) var(--ease-out)",
        }}
      >
        {insight.action && (
          <div
            style={{
              marginTop: "var(--s-3)",
              padding: "var(--s-3) var(--s-4)",
              background: "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
              borderLeft: `3px solid ${cfg.borderColor}`,
            }}
          >
            <div className="label" style={{ marginBottom: "var(--s-2)" }}>
              Empfohlene Maßnahme
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.65 }}>
              {insight.action}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyseTab() {
  const { authHeader } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/ai/analysis", {
      headers: authHeader(),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message || "Analyse konnte nicht geladen werden.");
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => setRetryCount((c) => c + 1);

  if (loading) {
    return (
      <div>
        {/* Health ring skeleton */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--s-4)",
            padding: "var(--s-8) var(--s-4)",
          }}
        >
          <div
            className="skeleton"
            style={{ width: 140, height: 140, borderRadius: "50%" }}
          />
          <div className="skeleton" style={{ width: 360, height: 14, borderRadius: "var(--r-xs)" }} />
          <div className="skeleton" style={{ width: 280, height: 14, borderRadius: "var(--r-xs)" }} />
        </div>

        {/* Insight card skeletons */}
        <div className="grid-2" style={{ marginTop: "var(--s-4)" }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard
              key={i}
              className="card"
              lines={5}
              style={{ minHeight: 180 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;

  const insights = data.insights ?? data.analysis ?? [];
  const score = data.score ?? data.health_score ?? 0;

  return (
    <div>
      {/* Health ring + summary */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--s-4)",
          padding: "var(--s-8) var(--s-4)",
        }}
      >
        <HealthRing score={score} size={140} />
        {data.summary && (
          <p
            style={{
              fontSize: "var(--text-md)",
              color: "var(--c-text-2)",
              maxWidth: 560,
              textAlign: "center",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {data.summary}
          </p>
        )}
      </div>

      {/* Insight grid */}
      {insights.length > 0 ? (
        <div className="grid-2">
          {insights.map((insight, i) => (
            <AnalyseInsightCard key={insight.id ?? i} insight={insight} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-title">Noch keine Erkenntnisse</div>
          <p className="empty-text">
            Sobald genügend Daten vorhanden sind, erscheinen hier KI-Erkenntnisse.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab 2 — Prognose ───────────────────────────────────────────────────────────

function PrognoseTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const filtered = payload.filter(
    (p) => p.value != null && p.name !== "bandBase" && p.name !== "band"
  );
  if (!filtered.length) return null;

  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-border-2)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-3) var(--s-4)",
        boxShadow: "var(--shadow-md)",
        fontSize: "var(--text-sm)",
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-2)" }}>{label}</div>
      {filtered.map((entry, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            color: "var(--c-text-2)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: entry.stroke ?? entry.fill ?? "var(--c-primary)",
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span>
            {entry.name}:{" "}
            <strong style={{ color: "var(--c-text)" }}>
              {typeof entry.value === "number"
                ? entry.value.toLocaleString("de-DE")
                : entry.value}
            </strong>
          </span>
        </div>
      ))}
    </div>
  );
}

function PrognoseTab() {
  const { authHeader } = useAuth();
  const [metric, setMetric] = useState("revenue");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/ai/forecast/${metric}?horizon=30`, {
      headers: authHeader(),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message || "Prognose konnte nicht geladen werden.");
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [metric, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => setRetryCount((c) => c + 1);

  // Build chart data array
  const chartData = (() => {
    if (!data) return [];

    const historical = (data.historical ?? []).map((p) => ({
      label: p.date ? fmtAxisDate(p.date) : (p.label ?? ""),
      historical: p.value ?? p.y ?? null,
      forecast: null,
      bandBase: null,
      band: null,
    }));

    const forecast = (data.forecast ?? []).map((p) => {
      const val = p.value ?? p.y ?? null;
      const lower = p.lower_bound ?? p.lower ?? (val != null ? val * 0.9 : null);
      const upper = p.upper_bound ?? p.upper ?? (val != null ? val * 1.1 : null);
      return {
        label: p.date ? fmtAxisDate(p.date) : (p.label ?? ""),
        historical: null,
        forecast: val,
        bandBase: lower,
        band: upper != null && lower != null ? upper - lower : null,
      };
    });

    return [...historical, ...forecast];
  })();

  // Label for "Heute" reference line — last historical point
  const todayLabel = (() => {
    if (!data) return null;
    const hist = data.historical ?? [];
    if (!hist.length) return null;
    const last = hist[hist.length - 1];
    return last.date ? fmtAxisDate(last.date) : (last.label ?? null);
  })();

  const confidence = data?.confidence ?? data?.confidence_pct ?? null;
  const keyDrivers = data?.key_drivers ?? data?.drivers ?? [];
  const scenarios = data?.scenarios ?? {};

  return (
    <div>
      {/* Metric pill tabs */}
      <div
        className="tabs-pill"
        style={{ width: "fit-content", marginBottom: "var(--s-6)" }}
        role="tablist"
        aria-label="Prognose-Metrik"
      >
        {FORECAST_METRICS.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={metric === m.id}
            className={`tab-pill${metric === m.id ? " active" : ""}`}
            onClick={() => setMetric(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div>
          <SkeletonCard
            className="card"
            lines={1}
            style={{ height: 300, marginBottom: "var(--s-4)" }}
          />
          <div style={{ display: "flex", gap: "var(--s-4)" }}>
            <SkeletonCard className="card" lines={3} style={{ flex: "1 1 0" }} />
            <SkeletonCard className="card" lines={5} style={{ width: "30%", flexShrink: 0 }} />
          </div>
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && data && (
        <div style={{ display: "flex", gap: "var(--s-6)", alignItems: "flex-start" }}>
          {/* Chart (70%) */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <Card style={{ padding: "var(--s-5)" }}>
              {/* Legend row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "var(--s-4)",
                  gap: "var(--s-4)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>
                  {FORECAST_METRICS.find((m) => m.id === metric)?.label}-Prognose
                </span>
                <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
                    <div
                      style={{
                        width: 20,
                        height: 2,
                        background: "var(--c-primary)",
                        borderRadius: 1,
                      }}
                    />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Historisch</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
                    <svg width="20" height="2" viewBox="0 0 20 2" aria-hidden="true">
                      <line x1="0" y1="1" x2="20" y2="1" stroke="var(--c-primary)" strokeWidth="2" strokeDasharray="4 2" strokeOpacity="0.6" />
                    </svg>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Prognose</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
                    <div
                      style={{
                        width: 20,
                        height: 10,
                        background: "var(--c-primary)",
                        opacity: 0.08,
                        borderRadius: 2,
                      }}
                    />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Konfidenz</span>
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    stroke="var(--c-border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--c-text-3)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "var(--c-text-3)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v) =>
                      v >= 1000000
                        ? `${(v / 1000000).toFixed(1)}M`
                        : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                    }
                  />
                  <Tooltip content={<PrognoseTooltip />} />

                  {todayLabel && (
                    <ReferenceLine
                      x={todayLabel}
                      stroke="var(--c-text-3)"
                      strokeDasharray="4 3"
                      label={{
                        value: "Heute",
                        position: "insideTopRight",
                        fill: "var(--c-text-3)",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Confidence band: stacked invisible base + visible band */}
                  <Area
                    type="monotone"
                    dataKey="bandBase"
                    stroke="none"
                    fill="transparent"
                    stackId="conf"
                    legendType="none"
                    name="bandBase"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="band"
                    stroke="none"
                    fill="var(--c-primary)"
                    fillOpacity={0.08}
                    stackId="conf"
                    legendType="none"
                    name="band"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />

                  {/* Historical solid line */}
                  <Line
                    type="monotone"
                    dataKey="historical"
                    stroke="var(--c-primary)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    name="Historisch"
                    legendType="line"
                  />

                  {/* Forecast dashed line */}
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="var(--c-primary)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    strokeOpacity={0.6}
                    dot={false}
                    connectNulls={false}
                    name="Prognose"
                    legendType="line"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Right panel (30%) */}
          <div
            style={{
              width: "clamp(200px, 30%, 280px)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            {/* Confidence */}
            {confidence != null && (
              <Card style={{ padding: "var(--s-4)" }}>
                <div className="label" style={{ marginBottom: "var(--s-2)" }}>Konfidenz</div>
                <div
                  style={{
                    fontSize: "var(--text-xl)",
                    fontWeight: 700,
                    color: "var(--c-text)",
                    marginBottom: "var(--s-3)",
                  }}
                  className="tabular"
                >
                  {confidence}%
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(confidence, 100)}%` }}
                  />
                </div>
              </Card>
            )}

            {/* Key drivers */}
            {keyDrivers.length > 0 && (
              <Card style={{ padding: "var(--s-4)" }}>
                <div className="label" style={{ marginBottom: "var(--s-3)" }}>Treiber</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                  {keyDrivers.map((driver, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)" }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--c-primary)",
                          flexShrink: 0,
                          marginTop: 5,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--c-text-2)",
                          lineHeight: 1.5,
                        }}
                      >
                        {typeof driver === "string" ? driver : (driver.label ?? driver.name ?? "")}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Scenarios */}
            {(scenarios.optimistic || scenarios.base || scenarios.pessimistic) && (
              <Card style={{ padding: "var(--s-4)" }}>
                <div className="label" style={{ marginBottom: "var(--s-3)" }}>Szenarien</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                  {[
                    { key: "optimistic",  label: "Optimistisch", variant: "success" },
                    { key: "base",        label: "Basis",        variant: "info" },
                    { key: "pessimistic", label: "Pessimistisch", variant: "danger" },
                  ].map(({ key, label, variant }) => {
                    const s = scenarios[key];
                    if (s == null) return null;
                    const displayVal =
                      typeof s === "number"
                        ? s.toLocaleString("de-DE")
                        : s.value != null
                        ? Number(s.value).toLocaleString("de-DE")
                        : String(s.label ?? s);
                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "var(--s-2)",
                        }}
                      >
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{label}</span>
                        <Badge variant={variant} size="md">{displayVal}</Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3 — Markt ──────────────────────────────────────────────────────────────

function MarktTab() {
  const { authHeader } = useAuth();
  const [industry, setIndustry] = useState("ecommerce");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/market/overview?industry=${industry}`, {
      headers: authHeader(),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message || "Marktdaten konnten nicht geladen werden.");
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [industry, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => setRetryCount((c) => c + 1);
  const season = data ? (SEASON_CONFIG[data.season] ?? SEASON_CONFIG.normal) : null;

  return (
    <div>
      {/* Industry selector + season badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-4)",
          marginBottom: "var(--s-6)",
          flexWrap: "wrap",
        }}
      >
        <label
          htmlFor="markt-industry-select"
          className="label"
          style={{ whiteSpace: "nowrap" }}
        >
          Branche
        </label>
        <select
          id="markt-industry-select"
          className="select"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          style={{ width: "auto", minWidth: 200 }}
        >
          {INDUSTRIES.map((ind) => (
            <option key={ind.value} value={ind.value}>
              {ind.label}
            </option>
          ))}
        </select>
        {data && season && (
          <Badge variant={season.badgeVariant}>{season.label}</Badge>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          <SkeletonCard className="card" lines={3} style={{ minHeight: 88 }} />
          <div className="grid-2">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} className="card" lines={4} style={{ minHeight: 100 }} />
            ))}
          </div>
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && !data && (
        <div className="empty-state">
          <div className="empty-title">Keine Daten verfügbar</div>
          <p className="empty-text">
            Für diese Branche sind noch keine Marktdaten vorhanden.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={retry}>
            Laden
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          {/* Summary card */}
          {data.summary && (
            <div
              className="card"
              style={{
                background: "var(--c-primary-light)",
                borderColor: "transparent",
                padding: "var(--s-5)",
              }}
            >
              <div className="label" style={{ marginBottom: "var(--s-2)", color: "var(--c-primary)" }}>
                Marktüberblick
              </div>
              <p
                style={{
                  fontSize: "var(--text-md)",
                  color: "var(--c-text)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {data.summary}
              </p>
            </div>
          )}

          {/* Market trend cards */}
          {(data.trends ?? []).length > 0 && (
            <section>
              <div className="section-header" style={{ marginBottom: "var(--s-3)" }}>
                <span className="label">Markttrends</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                {(data.trends ?? []).map((trend, i) => {
                  const trendKey = trend.trend ?? "stable";
                  const icon = TREND_ICON[trendKey] ?? TREND_ICON.stable;
                  const color = TREND_COLOR[trendKey] ?? TREND_COLOR.stable;
                  return (
                    <div
                      key={i}
                      className="card"
                      style={{
                        padding: "var(--s-3) var(--s-4)",
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--s-4)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: "var(--text-xl)",
                          color,
                          fontWeight: 700,
                          lineHeight: 1,
                          flexShrink: 0,
                          width: "var(--s-6)",
                          textAlign: "center",
                        }}
                      >
                        {icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--c-text)",
                          }}
                        >
                          {trend.keyword ?? trend.title ?? trend.name ?? ""}
                        </div>
                        {trend.description && (
                          <div
                            style={{
                              fontSize: "var(--text-xs)",
                              color: "var(--c-text-3)",
                              marginTop: 2,
                            }}
                          >
                            {trend.description}
                          </div>
                        )}
                      </div>
                      {trend.change_pct != null && (
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 700,
                            color,
                            flexShrink: 0,
                          }}
                          className="tabular"
                        >
                          {trend.change_pct > 0 ? "+" : ""}
                          {trend.change_pct}%
                        </span>
                      )}
                      {trend.relevance && (
                        <Badge
                          variant={
                            trend.relevance === "high"
                              ? "danger"
                              : trend.relevance === "medium"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {trend.relevance === "high"
                            ? "Hoch"
                            : trend.relevance === "medium"
                            ? "Mittel"
                            : "Niedrig"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Insights */}
          {(data.insights ?? []).length > 0 && (
            <section>
              <div className="section-header" style={{ marginBottom: "var(--s-3)" }}>
                <span className="label">KI-Insights</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                {(data.insights ?? []).map((ins, i) => {
                  const cfg =
                    INSIGHT_TYPE_CONFIG[ins.type] ?? INSIGHT_TYPE_CONFIG.opportunity;
                  return (
                    <div
                      key={i}
                      className="card"
                      style={{
                        borderLeft: `3px solid ${cfg.borderColor}`,
                        padding: "var(--s-3) var(--s-4)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "var(--s-3)",
                          flexWrap: "wrap",
                          marginBottom: ins.description ? "var(--s-2)" : 0,
                        }}
                      >
                        <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--c-text)",
                          }}
                        >
                          {ins.title}
                        </span>
                      </div>
                      {ins.description && (
                        <p
                          style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--c-text-2)",
                            lineHeight: 1.6,
                            margin: 0,
                          }}
                        >
                          {ins.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 4 — Benchmark ──────────────────────────────────────────────────────────

function BenchmarkMetricCard({ item }) {
  const yourVal  = item.your_value   ?? 0;
  const avgVal   = item.industry_avg ?? item.avg ?? 0;
  const topVal   = item.industry_top25 ?? item.top25 ?? item.industry_top ?? 0;
  const percentile = item.percentile ?? 0;
  const unit     = item.unit ?? "";

  // Normalise to a percentage bar
  const barMax = Math.max(yourVal, avgVal, topVal) * 1.15 || 1;
  const yourPct = Math.min((yourVal / barMax) * 100, 100);
  const avgPct  = Math.min((avgVal  / barMax) * 100, 100);
  const topPct  = Math.min((topVal  / barMax) * 100, 100);

  const percentileVariant =
    percentile >= 75 ? "success" :
    percentile >= 50 ? "info"    :
    percentile >= 25 ? "warning" :
    "danger";

  return (
    <Card style={{ padding: "var(--s-4) var(--s-5)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--s-3)",
          marginBottom: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--c-text)",
          }}
        >
          {item.metric_label ?? item.metric_key ?? "Metrik"}
        </span>
        <Badge variant={percentileVariant}>
          Du: {percentile}te Perzentile
        </Badge>
      </div>

      {/* Visual bar with markers */}
      <div
        style={{ position: "relative", marginBottom: "var(--s-2)" }}
        aria-label={`Dein Wert: ${yourVal}${unit}, Branchenschnitt: ${avgVal}${unit}, Top 25%: ${topVal}${unit}`}
      >
        {/* Track */}
        <div
          style={{
            height: 28,
            background: "var(--c-surface-3)",
            borderRadius: "var(--r-xs)",
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* Your value fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${yourPct}%`,
              background: "var(--c-primary)",
              opacity: 0.8,
              borderRadius: "var(--r-xs)",
              transition: "width 0.8s var(--ease-out)",
            }}
          />

          {/* Industry avg marker */}
          {avgPct > 0 && (
            <div
              title={`Branche Ø: ${avgVal}${unit}`}
              style={{
                position: "absolute",
                left: `${avgPct}%`,
                top: -5,
                bottom: -5,
                width: 2,
                background: "var(--c-warning)",
                borderRadius: 1,
                zIndex: 2,
              }}
            />
          )}

          {/* Top 25% marker */}
          {topPct > 0 && (
            <div
              title={`Top 25%: ${topVal}${unit}`}
              style={{
                position: "absolute",
                left: `${topPct}%`,
                top: -5,
                bottom: -5,
                width: 2,
                background: "var(--c-success)",
                borderRadius: 1,
                zIndex: 2,
              }}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "var(--s-4)",
          marginBottom: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        {[
          { color: "var(--c-primary)", label: `Du: ${yourVal}${unit}` },
          { color: "var(--c-warning)", label: `Ø: ${avgVal}${unit}` },
          { color: "var(--c-success)", label: `Top 25%: ${topVal}${unit}` },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* AI comment */}
      {item.ai_comment && (
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--c-text-2)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {item.ai_comment}
        </p>
      )}
    </Card>
  );
}

function BenchmarkTab() {
  const { authHeader } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetch("/api/benchmark/analyze", {
      headers: authHeader(),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message || "Benchmark konnte nicht geladen werden.");
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => setRetryCount((c) => c + 1);
  const benchmarks = data?.benchmarks ?? data?.metrics ?? (Array.isArray(data) ? data : []);

  return (
    <div>
      {/* Loading */}
      {loading && (
        <div className="grid-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard
              key={i}
              className="card"
              lines={5}
              style={{ minHeight: 200 }}
            />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && benchmarks.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">Keine Benchmark-Daten</div>
          <p className="empty-text">
            Benchmark-Daten stehen bereit, sobald genügend historische Daten vorhanden sind.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={retry}>
            Erneut laden
          </button>
        </div>
      )}

      {!loading && !error && benchmarks.length > 0 && (
        <div>
          {/* Summary banner */}
          {(data?.ai_summary ?? data?.summary) && (
            <div
              className="card"
              style={{
                marginBottom: "var(--s-5)",
                padding: "var(--s-4) var(--s-5)",
                background: "var(--c-surface-2)",
              }}
            >
              <div className="label" style={{ marginBottom: "var(--s-2)" }}>
                KI-Zusammenfassung
              </div>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--c-text-2)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {data.ai_summary ?? data.summary}
              </p>
            </div>
          )}

          <div className="grid-2">
            {benchmarks.map((item, i) => (
              <BenchmarkMetricCard key={item.metric_key ?? i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Analyse() {
  const [activeTab, setActiveTab] = useState("analyse");

  return (
    <div
      style={{
        minHeight: "calc(100dvh - var(--nav-height))",
        background: "var(--c-bg)",
      }}
    >
      {/* Page header */}
      <div
        style={{
          background: "var(--c-surface)",
          borderBottom: "1px solid var(--c-border)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "var(--s-8) var(--content-pad) 0",
          }}
        >
          <h1 className="page-title">Analyse</h1>
          <p className="page-subtitle" style={{ marginTop: "var(--s-1)" }}>
            KI-Einblicke &middot; Prognosen &middot; Markt &middot; Benchmark
          </p>

          {/* Tab bar */}
          <div
            className="tabs-underline"
            style={{ marginTop: "var(--s-5)" }}
            role="tablist"
            aria-label="Analyse-Bereiche"
          >
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`tab-underline${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content — key forces remount + page-enter animation on tab change */}
      <div
        key={activeTab}
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="page-enter"
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "var(--s-8) var(--content-pad)",
        }}
      >
        {activeTab === "analyse"   && <AnalyseTab />}
        {activeTab === "prognose"  && <PrognoseTab />}
        {activeTab === "markt"     && <MarktTab />}
        {activeTab === "benchmark" && <BenchmarkTab />}
      </div>
    </div>
  );
}
