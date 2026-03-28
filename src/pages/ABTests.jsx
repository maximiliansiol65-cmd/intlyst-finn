import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_CONFIG = {
  running: { color: "#000000", bg: "#00000012", label: "Laeuft" },
  completed: { color: "#333333", bg: "#33333312", label: "Abgeschlossen" },
  paused: { color: "#888888", bg: "#88888812", label: "Pausiert" },
};

const CATEGORY_CONFIG = {
  marketing: { color: "#000000", label: "Marketing" },
  ux: { color: "#555555", label: "UX/Design" },
  conversion: { color: "#333333", label: "Conversion" },
  pricing: { color: "#888888", label: "Pricing" },
  product: { color: "#ec4899", label: "Produkt" },
};

const WINNER_CONFIG = {
  a: { color: "#94a3b8", label: "Kontrolle gewinnt" },
  b: { color: "#333333", label: "Variante gewinnt" },
};

function TestCard({ test, onClick }) {
  const status = STATUS_CONFIG[test.status] || STATUS_CONFIG.running;
  const category = CATEGORY_CONFIG[test.category] || CATEGORY_CONFIG.marketing;
  const hasWinner = test.winner && test.significant;
  const winner = hasWinner ? WINNER_CONFIG[test.winner] : null;
  const liftPositive = test.lift_pct > 0;

  return (
    <div
      onClick={() => onClick(test.id)}
      style={{
        background: "#f5f5f7",
        border: `1px solid ${hasWinner ? (test.winner === "b" ? "#33333320" : "#94a3b830") : "#e8e8ed"}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: status.bg, color: status.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {status.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: category.color + "18", color: category.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {category.label}
            </span>
            {winner && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: winner.color + "18", color: winner.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {winner.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{test.name}</div>
        </div>

        <div
          style={{
            background: liftPositive ? "#33333318" : "#11111118",
            border: `1px solid ${liftPositive ? "#33333320" : "#11111120"}`,
            borderRadius: 8,
            padding: "6px 10px",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: liftPositive ? "#333333" : "#111111" }}>
            {liftPositive ? "+" : ""}
            {test.lift_pct}%
          </div>
          <div style={{ fontSize: 9, color: "#6e6e73", textTransform: "uppercase" }}>Lift B vs A</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { variant: test.variant_a, key: "a" },
          { variant: test.variant_b, key: "b" },
        ].map(({ variant, key }) => {
          const isWinner = hasWinner && test.winner === key;
          return (
            <div
              key={key}
              style={{
                background: isWinner ? "#33333310" : "#ffffff",
                border: `1px solid ${isWinner ? "#33333320" : "#e8e8ed"}`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 10, color: "#6e6e73", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                {variant.name}
                {isWinner && <span style={{ color: "#333333", fontSize: 9, fontWeight: 700 }}>✓ GEWINNER</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: isWinner ? "#333333" : "#1d1d1f" }}>{variant.conversion_rate}%</div>
              <div style={{ fontSize: 10, color: "#6e6e73" }}>{variant.visitors.toLocaleString("de-DE")} Besucher</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "#6e6e73", display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: test.significant ? "#333333" : "#888888",
            flexShrink: 0,
          }}
        />
        {test.significant ? `Signifikant - ${test.confidence}% Konfidenz` : `Nicht signifikant - ${test.confidence}% Konfidenz`}
      </div>
    </div>
  );
}

function TestDetail({ testId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/abtests/${testId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.variant_a || !payload?.variant_b || !payload?.significance) {
          throw new Error(payload?.detail || "A/B-Test konnte nicht geladen werden.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "A/B-Test konnte nicht geladen werden.");
        setData(null);
        setLoading(false);
      });
  }, [testId]);

  if (loading) {
    return (
      <div style={{ padding: "32px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #000000", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13, color: "#6e6e73" }}>Claude analysiert den Test...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: "#f5f5f7", border: "1px solid #11111120", borderRadius: 12, padding: "18px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#000000", fontSize: 13, cursor: "pointer", marginBottom: 12, padding: 0 }}>
          ← Zurueck zur Uebersicht
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: 4 }}>Test kann nicht geoeffnet werden</div>
        <div style={{ fontSize: 12, color: "#6e6e73" }}>{error || "Die API hat keine gueltigen Testdaten geliefert."}</div>
      </div>
    );
  }

  const status = STATUS_CONFIG[data.status] || STATUS_CONFIG.running;
  const variantA = data.variant_a;
  const variantB = data.variant_b;

  const chartData = [
    { name: "Conv.-Rate %", a: variantA.conversion_rate, b: variantB.conversion_rate },
    { name: "O Bestellwert", a: variantA.avg_order_value, b: variantB.avg_order_value },
    { name: "Umsatz/Besuch", a: variantA.revenue_per_visitor, b: variantB.revenue_per_visitor },
  ];

  const isWinnerB = data.winner === "b";
  const isWinnerA = data.winner === "a";

  return (
    <div>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#000000", fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0 }}>
        ← Zurueck zur Uebersicht
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: status.bg, color: status.color, textTransform: "uppercase" }}>
              {status.label}
            </span>
            {data.start_date && (
              <span style={{ fontSize: 10, color: "#6e6e73" }}>Seit {new Date(data.start_date).toLocaleDateString("de-DE")}</span>
            )}
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>{data.name}</h2>
          {data.hypothesis && (
            <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 4, fontStyle: "italic" }}>Hypothese: {data.hypothesis}</div>
          )}
        </div>

        {data.winner && data.significance.significant && (
          <div style={{ background: "#33333318", border: "1px solid #33333320", borderRadius: 10, padding: "10px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#333333", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>GEWINNER</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f" }}>{data.winner_name}</div>
            <div style={{ fontSize: 11, color: "#6e6e73" }}>
              {data.lift_pct > 0 ? "+" : ""}
              {data.lift_pct}% Lift
            </div>
          </div>
        )}
      </div>

      {data.ai_verdict && (
        <div style={{ background: "#f5f5f7", border: "1px solid #00000020", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>KI-Analyse</div>
          <div style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.6, marginBottom: 8 }}>{data.ai_verdict}</div>
          {data.ai_recommendation && (
            <div style={{ fontSize: 12, color: "#1d1d1f", background: "#ffffff", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid #000000" }}>
              → {data.ai_recommendation}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { variant: variantA, key: "a", isWinner: isWinnerA },
          { variant: variantB, key: "b", isWinner: isWinnerB },
        ].map(({ variant, key, isWinner }) => (
          <div
            key={key}
            style={{
              background: isWinner ? "#33333310" : "#f5f5f7",
              border: `1px solid ${isWinner ? "#33333320" : "#e8e8ed"}`,
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{variant.name}</span>
              {isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#33333318", color: "#333333" }}>✓ GEWINNER</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Besucher", value: variant.visitors.toLocaleString("de-DE") },
                { label: "Conversions", value: variant.conversions.toLocaleString("de-DE") },
                { label: "Conv.-Rate", value: `${variant.conversion_rate}%` },
                { label: "Umsatz", value: `EUR ${Math.round(variant.revenue).toLocaleString("de-DE")}` },
                { label: "O Bestellwert", value: `EUR ${variant.avg_order_value}` },
                { label: "Umsatz/Besuch", value: `EUR ${variant.revenue_per_visitor}` },
              ].map((item) => (
                <div key={item.label} style={{ background: "#ffffff", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#6e6e73", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isWinner ? "#333333" : "#1d1d1f" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "18px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Vergleich</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#e8e8ed", border: "1px solid #2d2d3f", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} />
              <Bar dataKey="a" name={variantA.name} fill="#6e6e73" radius={[4, 4, 0, 0]} />
              <Bar dataKey="b" name={variantB.name} fill="#333333" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#6e6e73", display: "inline-block" }} />
            <span style={{ color: "#86868b" }}>{variantA.name}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#333333", display: "inline-block" }} />
            <span style={{ color: "#86868b" }}>{variantB.name}</span>
          </span>
        </div>
      </div>

      <div
        style={{
          background: data.significance.significant ? "#33333312" : "#88888812",
          border: `1px solid ${data.significance.significant ? "#33333320" : "#88888820"}`,
          borderRadius: 10,
          padding: "13px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: data.significance.significant ? "#333333" : "#888888", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>
            {data.significance.significant ? "Statistisch signifikant" : "Noch nicht signifikant"} - {data.significance.confidence}% Konfidenz
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#86868b", paddingLeft: 18 }}>{data.significance.verdict}</div>
        {!data.significance.significant && (
          <div style={{ fontSize: 11, color: "#6e6e73", paddingLeft: 18, marginTop: 4 }}>
            Aktuell {data.significance.current_sample} / {data.significance.min_sample_size} Besucher pro Variante
          </div>
        )}
      </div>

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

function NewTestForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    hypothesis: "",
    category: "marketing",
    variant_a_name: "Kontrolle",
    variant_b_name: "Variante B",
  });
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!form.name.trim()) {
      return;
    }
    setSaving(true);
    const response = await fetch("/api/abtests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      onCreated();
    }
    setSaving(false);
  }

  const inputStyle = {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e8e8ed",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#1d1d1f",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "20px", marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: 16 }}>Neuer A/B-Test</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6e6e73", marginBottom: 4 }}>Test-Name *</div>
          <input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="z.B. CTA Button Farbe" style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6e6e73", marginBottom: 4 }}>Kategorie</div>
          <select value={form.category} onChange={(event) => setField("category", event.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {Object.entries(CATEGORY_CONFIG).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6e6e73", marginBottom: 4 }}>Variante A (Kontrolle)</div>
          <input value={form.variant_a_name} onChange={(event) => setField("variant_a_name", event.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6e6e73", marginBottom: 4 }}>Variante B</div>
          <input value={form.variant_b_name} onChange={(event) => setField("variant_b_name", event.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#6e6e73", marginBottom: 4 }}>Hypothese</div>
        <input value={form.hypothesis} onChange={(event) => setField("hypothesis", event.target.value)} placeholder="Was erwartest du? z.B. Gruener Button erhoeht Conv.-Rate um 15%" style={inputStyle} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={!form.name.trim() || saving}
          style={{ background: form.name.trim() ? "#000000" : "#e8e8ed", color: form.name.trim() ? "#fff" : "#6e6e73", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: form.name.trim() ? "pointer" : "not-allowed" }}
        >
          {saving ? "Erstelle..." : "Test erstellen"}
        </button>
        <button onClick={onCancel} style={{ background: "transparent", border: "1px solid #e8e8ed", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#6e6e73", cursor: "pointer" }}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

const FILTERS = [
  { value: null, label: "Alle" },
  { value: "running", label: "Laufend" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "paused", label: "Pausiert" },
];

export default function ABTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const url = filter ? `/api/abtests?status=${filter}` : "/api/abtests";
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || "A/B-Tests konnten nicht geladen werden.");
      }
      if (!Array.isArray(payload)) {
        throw new Error("Die API hat kein gueltiges Test-Array geliefert.");
      }
      setTests(payload);
    } catch (err) {
      setTests([]);
      setError(err.message || "A/B-Tests konnten nicht geladen werden.");
    }
    setLoading(false);
  }

  async function seedDemo() {
    setSeeding(true);
    try {
      const response = await fetch("/api/abtests/seed-demo", { method: "POST" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.detail || "Demo-Daten konnten nicht geladen werden.");
      }
    } catch (err) {
      setError(err.message || "Demo-Daten konnten nicht geladen werden.");
    }
    await load();
    setSeeding(false);
  }

  useEffect(() => {
    load();
  }, [filter]);

  const winners = tests.filter((test) => test.winner && test.significant).length;
  const running = tests.filter((test) => test.status === "running").length;
  const positiveLifts = tests.filter((test) => test.lift_pct > 0);
  const avgLift = tests.length > 0 ? Math.round(positiveLifts.reduce((sum, test) => sum + test.lift_pct, 0) / Math.max(positiveLifts.length, 1)) : 0;

  if (activeId) {
    return (
      <div style={{ minHeight: "100vh", background: "#ffffff", color: "#1d1d1f", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "28px 32px" }}>
        <TestDetail testId={activeId} onBack={() => setActiveId(null)} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#1d1d1f", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>A/B Tests</h1>
          <p style={{ fontSize: 13, color: "#6e6e73", margin: "4px 0 0" }}>Kampagnen vergleichen · Gewinner automatisch erkennen · KI-Analyse</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={seedDemo} disabled={seeding} style={{ background: "transparent", border: "1px solid #e8e8ed", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#6e6e73", cursor: "pointer" }}>
            {seeding ? "Laedt..." : "Demo-Daten"}
          </button>
          <button onClick={() => setShowForm((state) => !state)} style={{ background: "#000000", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            + Neuer Test
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Tests gesamt", value: tests.length, color: "#1d1d1f" },
          { label: "Laufend", value: running, color: "#000000" },
          { label: "Gewinner ermittelt", value: winners, color: "#333333" },
          { label: "O Lift (positiv)", value: `+${avgLift}%`, color: "#888888" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 10, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {showForm && <NewTestForm onCreated={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {error && (
        <div style={{ background: "#11111112", border: "1px solid #11111120", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 4 }}>A/B-Tests API nicht verfuegbar</div>
          <div style={{ fontSize: 12, color: "#6e6e73" }}>{error}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 3, background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 8, padding: 3, marginBottom: 16, width: "fit-content" }}>
        {FILTERS.map((entry) => (
          <button
            key={String(entry.value)}
            onClick={() => setFilter(entry.value)}
            style={{ padding: "4px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: filter === entry.value ? "#000000" : "transparent", color: filter === entry.value ? "#fff" : "#86868b" }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#6e6e73", fontSize: 13, padding: "16px 0" }}>Laden...</div>
      ) : tests.length === 0 ? (
        <div style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", borderRadius: 12, padding: "36px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#6e6e73", marginBottom: 8 }}>Noch keine Tests vorhanden</div>
          <button onClick={seedDemo} style={{ background: "#000000", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Demo-Tests laden
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))", gap: 12 }}>
          {tests.map((test) => (
            <TestCard key={test.id} test={test} onClick={setActiveId} />
          ))}
        </div>
      )}

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
