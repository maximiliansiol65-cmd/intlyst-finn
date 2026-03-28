import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const METRIC_CONFIG = {
  revenue: { label: "Umsatz", prefix: "EUR ", decimals: 0, color: "#6366f1" },
  traffic: { label: "Traffic", prefix: "", decimals: 0, color: "#06b6d4" },
  conversions: { label: "Conversions", prefix: "", decimals: 0, color: "#10b981" },
  conversion_rate: { label: "Conv.-Rate", prefix: "", suffix: "%", decimals: 1, color: "#f59e0b" },
  new_customers: { label: "Neue Kunden", prefix: "", decimals: 0, color: "#ec4899" },
};

const PERIODS = [
  { label: "7T", value: 7 },
  { label: "30T", value: 30 },
  { label: "90T", value: 90 },
];

function formatValue(value, config) {
  const prefix = config.prefix || "";
  const suffix = config.suffix || "";
  const num =
    config.decimals === 0
      ? Math.round(value).toLocaleString("de-DE")
      : value.toFixed(config.decimals);
  return `${prefix}${num}${suffix}`;
}

function TrendArrow({ trend, growth }) {
  if (trend === "up") {
    return (
      <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600 }}>
        ▲ +{growth}%
      </span>
    );
  }

  if (trend === "down") {
    return (
      <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
        ▼ {growth}%
      </span>
    );
  }

  return (
    <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>
      → stabil
    </span>
  );
}

const CustomTooltip = ({ active, payload, label, config }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "#1e1e2e",
        border: "1px solid #2d2d3f",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "#e2e8f0",
        minWidth: 140,
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{formatValue(d.value, config)}</div>
      {d.change_pct !== 0 && (
        <div
          style={{
            color: d.change_pct > 0 ? "#10b981" : "#ef4444",
            marginTop: 2,
          }}
        >
          {d.change_pct > 0 ? "+" : ""}
          {d.change_pct}% zum Vortag
        </div>
      )}
    </div>
  );
};

export default function TrendChart({ metric = "revenue", title, initialDays = 30 }) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.revenue;

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/timeseries?metric=${metric}&days=${days}&period=daily`)
      .then((r) => {
        if (!r.ok) throw new Error("Fehler beim Laden");
        return r.json();
      })
      .then((json) => {
        const points = (json.data || []).map((d) => ({
          ...d,
          label: new Date(d.date).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
          }),
        }));
        setData(points);
        setSummary(json.summary);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [metric, days]);

  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "18px 20px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
            {title || config.label}
          </span>
          {summary && <TrendArrow trend={summary.trend} growth={summary.growth_pct} />}
        </div>

        <div
          style={{
            display: "flex",
            gap: 2,
            background: "#0d0d1a",
            borderRadius: 7,
            padding: 2,
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: days === p.value ? config.color : "transparent",
                color: days === p.value ? "#fff" : "#64748b",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>
            {formatValue(summary.avg, config)}
          </span>
          <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>Ø / Tag</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 120 }}>
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#475569",
              fontSize: 13,
            }}
          >
            Laden...
          </div>
        )}

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            Keine Daten verfügbar
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(data.length / 5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  config.prefix
                    ? `${config.prefix}${Math.round(v).toLocaleString("de-DE")}`
                    : Math.round(v)
                }
              />
              <Tooltip content={<CustomTooltip config={config} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={config.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: config.color, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
