import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const METRIC_CONFIG = {
  revenue: { label: "Umsatz", prefix: "€", decimals: 0, color: "#6366f1" },
  traffic: { label: "Traffic", prefix: "", decimals: 0, color: "#06b6d4" },
  conversions: { label: "Conversions", prefix: "", decimals: 0, color: "#10b981" },
  conversion_rate: {
    label: "Conv.-Rate",
    prefix: "",
    suffix: "%",
    decimals: 1,
    color: "#f59e0b",
  },
  new_customers: { label: "Neue Kunden", prefix: "", decimals: 0, color: "#ec4899" },
};

const HORIZONS = [
  { value: 30, label: "30 Tage" },
  { value: 60, label: "60 Tage" },
  { value: 90, label: "90 Tage" },
];

function fmt(value, cfg) {
  if (value === null || value === undefined) return "-";
  const prefix = cfg.prefix || "";
  const suffix = cfg.suffix || "";
  const num =
    cfg.decimals === 0
      ? Math.round(value).toLocaleString("de-DE")
      : Number(value).toFixed(cfg.decimals);
  return `${prefix}${num}${suffix}`;
}

function CustomTooltip({ active, payload, label, cfg }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const isForecast = point?.is_forecast;

  return (
    <div
      style={{
        background: "#1e1e2e",
        border: "1px solid #2d2d3f",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "#e2e8f0",
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(payload[0]?.value, cfg)}</div>
      <div style={{ fontSize: 10, color: isForecast ? "#818cf8" : "#475569", marginTop: 2 }}>
        {isForecast ? "KI-Prognose" : "Historisch"}
      </div>
    </div>
  );
}

export default function ForecastChart({ metric = "revenue" }) {
  const [horizon, setHorizon] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const cfg = METRIC_CONFIG[metric] || METRIC_CONFIG.revenue;

  async function load(nextHorizon) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/forecast/${metric}?horizon=${nextHorizon}`);
      if (!response.ok) throw new Error(`Status ${response.status}`);
      setData(await response.json());
      setLoaded(true);
    } catch (loadError) {
      setError(loadError.message);
    }

    setLoading(false);
  }

  function handleHorizon(nextHorizon) {
    setHorizon(nextHorizon);
    if (loaded) load(nextHorizon);
  }

  const chartData = data
    ? [
        ...data.historical.map((point) => ({
          date: point.date.slice(5),
          historical: point.value,
          is_forecast: false,
        })),
        ...data.forecast.map((point) => ({
          date: point.date.slice(5),
          forecast: point.value,
          is_forecast: true,
        })),
      ]
    : [];

  const todayLabel = new Date().toISOString().slice(5, 10);

  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
            {cfg.label} - Prognose
          </div>
          {data?.summary && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{data.summary}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              background: "#0d0d1a",
              borderRadius: 7,
              padding: 2,
            }}
          >
            {HORIZONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleHorizon(option.value)}
                style={{
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "none",
                  cursor: "pointer",
                  background: horizon === option.value ? cfg.color : "transparent",
                  color: horizon === option.value ? "#fff" : "#64748b",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {!loaded && (
            <button
              onClick={() => load(horizon)}
              disabled={loading}
              style={{
                background: loading ? "#1e1e2e" : "#6366f1",
                color: loading ? "#475569" : "#fff",
                border: "none",
                borderRadius: 7,
                padding: "5px 14px",
                fontSize: 11,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Berechne..." : "Prognose starten"}
            </button>
          )}

          {loaded && (
            <button
              onClick={() => load(horizon)}
              disabled={loading}
              style={{
                background: "transparent",
                border: "1px solid #1e1e2e",
                borderRadius: 7,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                color: loading ? "#475569" : "#818cf8",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "..." : "↻"}
            </button>
          )}
        </div>
      </div>

      {data && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 9px",
              borderRadius: 5,
              background:
                data.trend === "up"
                  ? "#10b98118"
                  : data.trend === "down"
                    ? "#ef444418"
                    : "#6366f118",
              color:
                data.trend === "up"
                  ? "#10b981"
                  : data.trend === "down"
                    ? "#ef4444"
                    : "#818cf8",
            }}
          >
            {data.trend === "up" ? "▲" : data.trend === "down" ? "▼" : "→"} {Math.abs(data.growth_pct)}%
            {" "}
            Prognose
          </span>
          <span style={{ fontSize: 11, color: "#475569" }}>{data.horizon_days} Tage - KI-generiert</span>
        </div>
      )}

      <div style={{ height: 260 }}>
        {!loaded && !loading && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "#475569" }}>KI-Prognose noch nicht gestartet</div>
            <div style={{ fontSize: 11, color: "#334155" }}>
              Klicke "Prognose starten" - Claude analysiert den Trend
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #6366f1",
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span style={{ fontSize: 13, color: "#475569" }}>Claude berechnet Prognose...</span>
          </div>
        )}

        {error && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && data && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  cfg.prefix ? `${cfg.prefix}${Math.round(value).toLocaleString("de-DE")}` : Math.round(value)
                }
              />
              <Tooltip content={<CustomTooltip cfg={cfg} />} />
              <Legend />
              <ReferenceLine
                x={todayLabel}
                stroke="#334155"
                strokeDasharray="4 4"
                label={{ value: "heute", fill: "#475569", fontSize: 10, position: "top" }}
              />
              <Line
                type="monotone"
                dataKey="historical"
                stroke={cfg.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="Historisch"
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke={cfg.color}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="Prognose (KI)"
                opacity={0.7}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}