import { useState, useEffect } from "react";
import LocationMap from "../components/LocationMap";
import TrendsChart from "../components/TrendsChart";
import SeasonalityChart from "../components/SeasonalityChart";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const INDUSTRIES = [
  { value: "ecommerce", label: "E-Commerce" },
  { value: "saas", label: "SaaS / Software" },
  { value: "retail", label: "Einzelhandel" },
  { value: "gastro", label: "Gastronomie" },
  { value: "manufacturing", label: "Fertigung / Operations" },
  { value: "finance", label: "Finanzen / Banking" },
  { value: "healthcare", label: "Healthcare" },
  { value: "public", label: "Public Sector / Smart City" },
];

const STATUS_CONFIG = {
  above: { color: "#333333", bg: "#33333312", label: "Ueber O" },
  average: { color: "#888888", bg: "#88888812", label: "Im O" },
  below: { color: "#111111", bg: "#11111112", label: "Unter O" },
};

const TREND_CONFIG = {
  up: { color: "#333333", icon: "^" },
  down: { color: "#111111", icon: "v" },
  stable: { color: "#000000", icon: "->" },
};

const SEASON_CONFIG = {
  high: { color: "#333333", bg: "#33333312", label: "Hochsaison" },
  normal: { color: "#000000", bg: "#00000012", label: "Normalsaison" },
  low: { color: "#888888", bg: "#88888812", label: "Nebensaison" },
};

const INSIGHT_CONFIG = {
  opportunity: { color: "#333333", bg: "#33333312", label: "Chance" },
  warning: { color: "#111111", bg: "#11111112", label: "Warnung" },
  info: { color: "#000000", bg: "#00000012", label: "Info" },
};

const TABS = [
  { value: "market", label: "Marktanalyse" },
  { value: "trends", label: "Trends" },
  { value: "location", label: "Standortkarte" },
];

function BenchmarkCard({ b }) {
  const s = STATUS_CONFIG[b.status] || STATUS_CONFIG.average;
  const pct = Math.min(b.percentile, 100);
  return (
    <div
      style={{
        background: "#f5f5f7",
        border: `1px solid ${s.color}20`,
        borderRadius: 10,
        padding: "13px 15px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f" }}>{b.metric_label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 4,
            background: s.bg,
            color: s.color,
          }}
        >
          {b.percentile}. Perzentile
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f" }}>
          {b.your_value}
          {b.metric.includes("rate") || b.metric.includes("growth") ? "%" : ""}
        </span>
        <span style={{ fontSize: 11, color: "#6e6e73" }}>dein Wert</span>
      </div>
      <div style={{ position: "relative", height: 6, background: "#e8e8ed", borderRadius: 3, marginBottom: 6 }}>
        <div
          style={{
            position: "absolute",
            left: `${Math.min((b.industry_avg / b.industry_top) * 100, 100)}%`,
            top: -3,
            bottom: -3,
            width: 2,
            background: "#6e6e73",
            borderRadius: 1,
          }}
        />
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: s.color,
            borderRadius: 3,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6e6e73" }}>
        <span>
          O {b.industry_avg}
          {b.metric.includes("rate") || b.metric.includes("growth") ? "%" : ""}
        </span>
        <span>
          Top {b.industry_top}
          {b.metric.includes("rate") || b.metric.includes("growth") ? "%" : ""}
        </span>
      </div>
    </div>
  );
}

function InsightCard({ insight }) {
  const c = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.info;
  return (
    <div
      style={{
        background: "#f5f5f7",
        border: `1px solid ${c.color}20`,
        borderLeft: `3px solid ${c.color}`,
        borderRadius: "0 10px 10px 0",
        padding: "12px 15px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 4,
            background: c.bg,
            color: c.color,
            textTransform: "uppercase",
          }}
        >
          {c.label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f" }}>{insight.title}</span>
      </div>
      <div style={{ fontSize: 12, color: "#86868b", lineHeight: 1.6, marginBottom: 6 }}>{insight.description}</div>
      <div
        style={{
          fontSize: 11,
          color: "#1d1d1f",
          background: "#ffffff",
          borderRadius: 6,
          padding: "6px 10px",
          borderLeft: `2px solid ${c.color}`,
        }}
      >
        -&gt; {insight.action}
      </div>
    </div>
  );
}

export default function Market() {
  const [tab, setTab] = useState("market");
  const [industry, setIndustry] = useState("ecommerce");
  const [city, setCity] = useState("Muenchen");
  const [data, setData] = useState(null);
  const [revenueSeries, setRevenueSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  async function loadMarket() {
    setLoading(true);
    setError(null);
    try {
      const [marketRes, tsRes] = await Promise.all([
        fetch(`/api/market/overview?industry=${industry}`),
        fetch("/api/timeseries?metric=revenue&days=30&period=daily"),
      ]);
      if (!marketRes.ok) throw new Error(`Status ${marketRes.status}`);

      const marketData = await marketRes.json();
      const tsPayload = tsRes.ok ? await tsRes.json() : { data: [] };

      setData(marketData);
      setRevenueSeries(
        (tsPayload.data || []).map((point) => ({
          day: new Date(point.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
          revenue: Math.round(point.value || 0),
        }))
      );
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    void city;
  }, [city]);

  const season = data ? SEASON_CONFIG[data.season] || SEASON_CONFIG.normal : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#1d1d1f",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>Markt & Standort</h1>
          <p style={{ fontSize: 13, color: "#6e6e73", margin: "4px 0 0" }}>
            Branchenvergleich · Google Trends · Saisonalitaet · Standortkarte
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setData(null);
            }}
            style={{
              background: "#ffffff",
              border: "1px solid #e8e8ed",
              borderRadius: 8,
              padding: "7px 12px",
              color: "#1d1d1f",
              fontSize: 12,
            }}
          >
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 3,
          background: "#f5f5f7",
          border: "1px solid #e8e8ed",
          borderRadius: 9,
          padding: 3,
          marginBottom: 20,
          width: "fit-content",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              padding: "6px 18px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              background: tab === t.value ? "#000000" : "transparent",
              color: tab === t.value ? "#fff" : "#86868b",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "market" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={loadMarket}
              disabled={loading}
              style={{
                background: loading ? "#e8e8ed" : "#000000",
                color: loading ? "#6e6e73" : "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Analysiere..." : "Markt analysieren"}
            </button>
          </div>

          {error && (
            <div
              style={{
                background: "#11111112",
                border: "1px solid #11111120",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "#111111",
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {!data && !loading && (
            <div
              style={{
                background: "#f5f5f7",
                border: "1px solid #e8e8ed",
                borderRadius: 12,
                padding: "32px",
                textAlign: "center",
                color: "#6e6e73",
                fontSize: 13,
              }}
            >
              Branche waehlen und "Markt analysieren" klicken
            </div>
          )}

          {loading && (
            <div
              style={{
                background: "#f5f5f7",
                border: "1px solid #e8e8ed",
                borderRadius: 12,
                padding: "28px",
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
                  border: "2px solid #000000",
                  borderTopColor: "transparent",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 13, color: "#6e6e73" }}>Claude analysiert Marktlage...</span>
            </div>
          )}

          {data && !loading && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div style={{ background: season?.bg, border: `1px solid ${season?.color}30`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: season?.color, textTransform: "uppercase" }}>{season?.label}</div>
                  <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>{data.season_label}</div>
                </div>
                <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#6e6e73", lineHeight: 1.6 }}>
                  {data.summary}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Branchenvergleich
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 10 }}>
                  {data.benchmarks.map((b) => (
                    <BenchmarkCard key={b.metric} b={b} />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Umsatzverlauf (30 Tage)
                </div>
                <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueSeries}>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fill: "#86868b", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#86868b", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#f5f5f7", border: "1px solid #6e6e73", borderRadius: 8 }} />
                        <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Markttrends
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.trends.map((t, i) => {
                      const tc = TREND_CONFIG[t.trend] || TREND_CONFIG.stable;
                      return (
                        <div key={i} style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 8, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14, color: tc.color }}>{tc.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f" }}>{t.keyword}</div>
                            <div style={{ fontSize: 10, color: "#6e6e73" }}>{t.relevance === "high" ? "Hohe" : t.relevance === "medium" ? "Mittlere" : "Niedrige"} Relevanz</div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: tc.color }}>
                            {t.change_pct > 0 ? "+" : ""}
                            {t.change_pct}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    KI-Insights
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.insights.map((ins, i) => (
                      <InsightCard key={i} insight={ins} />
                    ))}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {tab === "trends" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Google Trends - Suchvolumen-Verlauf (12 Wochen)
            </div>
            <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "18px" }}>
              <TrendsChart industry={industry} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Saisonalitaet - Monatsindex fuer {INDUSTRIES.find((i) => i.value === industry)?.label}
            </div>
            <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "18px" }}>
              <SeasonalityFetcher industry={industry} />
            </div>
          </div>
        </div>
      )}

      {tab === "location" && <LocationMap apiKey={MAPS_KEY} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SeasonalityFetcher({ industry }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/trends?industry=${industry}&weeks=12`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, [industry]);

  if (!data) return <div style={{ fontSize: 13, color: "#6e6e73" }}>Laden...</div>;
  return <SeasonalityChart seasonality={data.seasonality} />;
}
