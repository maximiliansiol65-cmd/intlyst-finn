import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

const TODAY_MONTH = new Date().getMonth() + 1;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
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
      <div style={{ color: "#f1f5f9", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#94a3b8" }}>Index: {d?.index?.toFixed(2)}</div>
      <div style={{ color: getColor(d?.index), fontWeight: 600, marginTop: 2 }}>{d?.label}</div>
    </div>
  );
};

function getColor(index) {
  if (!index) return "#6366f1";
  if (index >= 1.2) return "#10b981";
  if (index >= 1.05) return "#6366f1";
  if (index < 0.85) return "#ef4444";
  return "#94a3b8";
}

export default function SeasonalityChart({ seasonality }) {
  if (!seasonality?.length) return null;

  const chartData = seasonality.map((s) => ({
    name: s.month_label.slice(0, 3),
    index: s.index,
    label: s.label,
    month: s.month,
    isCurrent: s.month === TODAY_MONTH,
  }));

  return (
    <div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#475569" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 2]}
              tick={{ fontSize: 10, fill: "#475569" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={1}
              stroke="#334155"
              strokeDasharray="4 4"
              label={{ value: "normal", fill: "#475569", fontSize: 10, position: "right" }}
            />
            <Bar dataKey="index" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={getColor(entry.index)}
                  opacity={entry.isCurrent ? 1 : 0.65}
                  stroke={entry.isCurrent ? "#fff" : "none"}
                  strokeWidth={entry.isCurrent ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#475569" }}>
        {[
          { color: "#10b981", label: "Hochsaison (>1.20)" },
          { color: "#6366f1", label: "Gut (1.05-1.20)" },
          { color: "#94a3b8", label: "Normal (0.85-1.05)" },
          { color: "#ef4444", label: "Nebensaison (<0.85)" },
        ].map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block" }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
