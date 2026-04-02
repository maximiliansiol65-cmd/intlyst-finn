import { useState, useEffect } from "react";

const SEGMENT_CONFIG = {
  champions:          { color: "#10b981", bg: "#10b98115", border: "#10b98130", label: "Champions" },
  loyal:              { color: "#6366f1", bg: "#6366f115", border: "#6366f130", label: "Treue Kunden" },
  potential_loyalist: { color: "#06b6d4", bg: "#06b6d415", border: "#06b6d430", label: "Potenzial-Kunden" },
  at_risk:            { color: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b30", label: "Abwanderungsgefahr" },
  lost:               { color: "#ef4444", bg: "#ef444415", border: "#ef444430", label: "Verloren" },
};

function ScoreBar({ score, max = 5, color }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 5,
            borderRadius: 2,
            background: i < score ? color : "#1e1e2e",
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  );
}

function SegmentCard({ seg, onAction }) {
  const config = SEGMENT_CONFIG[seg.segment] || SEGMENT_CONFIG.lost;
  return (
    <div
      style={{
        background: "#13131f",
        border: `1px solid ${config.border}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 4,
              background: config.bg,
              color: config.color,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {config.label}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{seg.count}</div>
          <div style={{ fontSize: 10, color: "#475569" }}>Kunden</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Umsatz-Anteil", value: `${seg.pct_of_revenue}%` },
          { label: "Kunden-Anteil", value: `${seg.pct_of_customers}%` },
          { label: "Ø Umsatz", value: `€${Math.round(seg.avg_revenue)}` },
          { label: "Ø Recency", value: `${Math.round(seg.avg_recency_days)}T` },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#0d0d1a",
              borderRadius: 7,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Umsatz-Anteil</div>
        <div style={{ background: "#1e1e2e", borderRadius: 3, height: 5 }}>
          <div
            style={{
              width: `${seg.pct_of_revenue}%`,
              height: "100%",
              background: config.color,
              borderRadius: 3,
              transition: "width 0.6s ease",
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: "#0d0d1a",
          borderRadius: 7,
          padding: "8px 10px",
          borderLeft: `2px solid ${config.color}`,
          fontSize: 11,
          color: "#94a3b8",
          lineHeight: 1.5,
        }}
      >
        → {seg.ai_action}
      </div>

      <button
        onClick={() => onAction(seg)}
        style={{
          marginTop: 10,
          width: "100%",
          background: "transparent",
          border: `1px solid ${config.color}40`,
          borderRadius: 7,
          padding: "7px 0",
          fontSize: 11,
          fontWeight: 600,
          color: config.color,
          cursor: "pointer",
        }}
      >
        Task erstellen
      </button>
    </div>
  );
}

function CustomerRow({ customer }) {
  const config = SEGMENT_CONFIG[customer.segment] || SEGMENT_CONFIG.lost;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 60px 80px 90px 90px 60px 60px 60px",
        gap: 12,
        padding: "9px 16px",
        borderBottom: "1px solid #1e1e2e",
        fontSize: 12,
        alignItems: "center",
      }}
    >
      <div style={{ fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {customer.name || customer.customer_id}
      </div>
      <div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 3,
            background: config.bg,
            color: config.color,
          }}
        >
          {config.label.split(" ")[0]}
        </span>
      </div>
      <div style={{ color: "#94a3b8" }}>{customer.recency_days}T</div>
      <div><ScoreBar score={customer.r_score} color={config.color} /></div>
      <div><ScoreBar score={customer.f_score} color={config.color} /></div>
      <div><ScoreBar score={customer.m_score} color={config.color} /></div>
      <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{customer.rfm_score}</div>
      <div style={{ color: "#10b981" }}>€{Math.round(customer.monetary)}</div>
    </div>
  );
}

export default function Customers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState("segments");
  const [taskMsg, setTaskMsg] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/rfm");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Status ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function seedDemo() {
    setSeeding(true);
    try {
      await fetch("/api/customers/seed-demo", { method: "POST" });
      await load();
    } catch {
      // Intentionally silent; load() exposes API issues.
    }
    setSeeding(false);
  }

  async function createTaskForSegment(seg) {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${seg.segment_label}: ${seg.ai_action.slice(0, 60)}`,
          description: `Segment: ${seg.segment_label} · ${seg.count} Kunden · ${seg.pct_of_revenue}% Umsatz`,
          priority: seg.segment === "champions" || seg.segment === "at_risk" ? "high" : "medium",
        }),
      });
      setTaskMsg(`Task für "${seg.segment_label}" erstellt!`);
      setTimeout(() => setTaskMsg(""), 3000);
    } catch {
      // Intentionally silent to keep the flow compact.
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e2e8f0",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Kundenanalyse</h1>
          <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
            RFM-Segmentierung · KI-Empfehlungen pro Gruppe
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={seedDemo}
            disabled={seeding}
            style={{
              background: "transparent",
              border: "1px solid #1e1e2e",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: seeding ? "#334155" : "#475569",
              cursor: seeding ? "not-allowed" : "pointer",
            }}
          >
            {seeding ? "Lädt..." : "Demo-Daten"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: loading ? "#1e1e2e" : "#6366f1",
              color: loading ? "#475569" : "#fff",
              border: "none",
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analysiere..." : "↻ Neu analysieren"}
          </button>
        </div>
      </div>

      {taskMsg && (
        <div
          style={{
            background: "#10b98115",
            border: "1px solid #10b98130",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            color: "#10b981",
            marginBottom: 12,
          }}
        >
          ✓ {taskMsg}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#ef444415",
            border: "1px solid #ef444430",
            borderRadius: 10,
            padding: "16px",
            fontSize: 13,
            color: "#ef4444",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <button
            onClick={seedDemo}
            style={{
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Demo-Daten laden
          </button>
        </div>
      )}

      {loading && (
        <div
          style={{
            background: "#13131f",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: "32px",
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
          <span style={{ fontSize: 13, color: "#475569" }}>Claude segmentiert Kunden...</span>
        </div>
      )}

      {data && !loading && (
        <>
          {data.ai_summary && (
            <div
              style={{
                background: "#13131f",
                border: "1px solid #6366f130",
                borderRadius: 10,
                padding: "13px 16px",
                fontSize: 13,
                color: "#94a3b8",
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              <span style={{ color: "#818cf8", fontWeight: 600 }}>KI: </span>
              {data.ai_summary}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Kunden gesamt", value: data.total_customers },
              { label: "Champions", value: data.segments.find((segment) => segment.segment === "champions")?.count || 0, color: "#10b981" },
              { label: "Abwanderungsgef.", value: data.segments.find((segment) => segment.segment === "at_risk")?.count || 0, color: "#f59e0b" },
              { label: "Verloren", value: data.segments.find((segment) => segment.segment === "lost")?.count || 0, color: "#ef4444" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: "#13131f",
                  border: "1px solid #1e1e2e",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}
              >
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color || "#f1f5f9" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 3, background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 8, padding: 3, marginBottom: 20, alignSelf: "flex-start", width: "fit-content" }}>
            {[
              { key: "segments", label: "Segmente" },
              { key: "customers", label: "Alle Kunden" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "5px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: activeTab === tab.key ? "#6366f1" : "transparent",
                  color: activeTab === tab.key ? "#fff" : "#64748b",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "segments" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
              {data.segments.map((segment) => (
                <SegmentCard key={segment.segment} seg={segment} onAction={createTaskForSegment} />
              ))}
            </div>
          )}

          {activeTab === "customers" && (
            <div
              style={{
                background: "#13131f",
                border: "1px solid #1e1e2e",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 60px 80px 90px 90px 60px 60px 60px",
                  gap: 12,
                  padding: "8px 16px",
                  background: "#0d0d1a",
                  borderBottom: "1px solid #1e1e2e",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <div>Kunde</div>
                <div>Segment</div>
                <div>Recency</div>
                <div>R-Score</div>
                <div>F-Score</div>
                <div>M-Score</div>
                <div>RFM</div>
                <div>Umsatz</div>
              </div>
              {data.customers.map((customer) => (
                <CustomerRow key={customer.customer_id} customer={customer} />
              ))}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}