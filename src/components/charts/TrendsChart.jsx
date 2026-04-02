import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const TREND_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

const TREND_CONFIG = {
  up: { color: "#10b981", icon: "^", label: "Steigend" },
  down: { color: "#ef4444", icon: "v", label: "Fallend" },
  stable: { color: "#6366f1", icon: "->", label: "Stabil" },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1e1e2e",
        border: "1px solid #2d2d3f",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}/100
        </div>
      ))}
    </div>
  );
};

export default function TrendsChart({ industry }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeKw, setActiveKw] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/trends?industry=${industry}&weeks=12`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (d.keywords?.length) setActiveKw(d.keywords[0].keyword);
      }
    } catch {
      // Intentionally silent for compact dashboard UX.
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [industry]);

  const chartData =
    data?.keywords?.[0]?.data?.map((point, i) => {
      const obj = { date: point.date.slice(5) };
      data.keywords.forEach((kw) => {
        obj[kw.keyword] = kw.data[i]?.value ?? 0;
      });
      return obj;
    }) ?? [];

  return (
    <div>
      {loading && (
        <div style={{ fontSize: 13, color: "#475569", padding: "16px 0" }}>
          Lade Trend-Daten...
        </div>
      )}

      {data && !loading && (
        <>
          {data.summary && (
            <div
              style={{
                background: "#13131f",
                border: "1px solid #1e1e2e",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 12,
                color: "#94a3b8",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {data.summary}
            </div>
          )}

          {(data.best_months?.length > 0 || data.worst_months?.length > 0) && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {data.best_months?.length > 0 && (
                <div
                  style={{
                    background: "#10b98115",
                    border: "1px solid #10b98130",
                    borderRadius: 8,
                    padding: "8px 12px",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#10b981",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4,
                    }}
                  >
                    Beste Monate
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0" }}>{data.best_months.join(" - ")}</div>
                </div>
              )}
              {data.worst_months?.length > 0 && (
                <div
                  style={{
                    background: "#ef444415",
                    border: "1px solid #ef444430",
                    borderRadius: 8,
                    padding: "8px 12px",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#ef4444",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4,
                    }}
                  >
                    Schwaechste Monate
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0" }}>{data.worst_months.join(" - ")}</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {data.keywords.map((kw, i) => {
              const t = TREND_CONFIG[kw.trend] || TREND_CONFIG.stable;
              return (
                <div
                  key={kw.keyword}
                  style={{
                    background: "#13131f",
                    border: `1px solid ${activeKw === kw.keyword ? TREND_COLORS[i] + "60" : "#1e1e2e"}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onClick={() => setActiveKw(kw.keyword)}
                >
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", background: TREND_COLORS[i], flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>{kw.keyword}</span>
                  <span style={{ fontSize: 10, color: t.color }}>
                    {t.icon} {Math.abs(kw.change_pct)}%
                  </span>
                  <span style={{ fontSize: 10, color: "#475569" }}>{kw.current_value}/100</span>
                </div>
              );
            })}
          </div>

          <div style={{ height: 200, marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(chartData.length / 5)}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
                {data.keywords.map((kw, i) => (
                  <Line
                    key={kw.keyword}
                    type="monotone"
                    dataKey={kw.keyword}
                    stroke={TREND_COLORS[i]}
                    strokeWidth={activeKw === kw.keyword ? 2.5 : 1}
                    dot={false}
                    opacity={activeKw === kw.keyword ? 1 : 0.3}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
