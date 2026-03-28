import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

// ── Segment configuration ────────────────────────────────────────────────────
const SEGMENT_CONFIG = {
  champions: {
    label: "Champions",
    accent: "var(--c-success)",
    accentLight: "var(--c-success-light)",
    badge: "badge-success",
    priority: "high",
  },
  loyal: {
    label: "Treue Kunden",
    accent: "var(--c-primary)",
    accentLight: "var(--c-primary-light)",
    badge: "badge-info",
    priority: "medium",
  },
  potential_loyalist: {
    label: "Potenzial",
    accent: "var(--c-teal)",
    accentLight: "var(--c-teal-light)",
    badge: "badge-teal",
    priority: "medium",
  },
  at_risk: {
    label: "Abwanderung",
    accent: "var(--c-warning)",
    accentLight: "var(--c-warning-light)",
    badge: "badge-warning",
    priority: "high",
  },
  lost: {
    label: "Verloren",
    accent: "var(--c-danger)",
    accentLight: "var(--c-danger-light)",
    badge: "badge-danger",
    priority: "high",
  },
};

const SEGMENT_ORDER = [
  "champions",
  "loyal",
  "potential_loyalist",
  "at_risk",
  "lost",
];

// ── Toast system ─────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}${t.exiting ? " exiting" : ""}`}
        >
          <div className="toast-icon">
            {t.type === "success" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ color: "var(--c-success)", width: 18, height: 18 }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ color: "var(--c-danger)", width: 18, height: 18 }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          </div>
          <div className="toast-content">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button className="toast-close" onClick={() => onRemove(t.id)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ width: 18, height: 18 }}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── RFM mini progress bars ───────────────────────────────────────────────────
function RFMBars({ r, f, m, accent }) {
  return (
    <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
      {[
        { label: "R", val: r ?? 0 },
        { label: "F", val: f ?? 0 },
        { label: "M", val: m ?? 0 },
      ].map(({ label, val }) => (
        <div
          key={label}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "center",
          }}
        >
          <div className="progress-track" style={{ width: 28, height: 4 }}>
            <div
              className="progress-fill"
              style={{
                width: `${Math.max(0, Math.min(100, (val / 5) * 100))}%`,
                background: accent,
              }}
            />
          </div>
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--c-text-4)",
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton: segment card ───────────────────────────────────────────────────
function SegmentCardSkeleton() {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
        borderLeft: "4px solid var(--c-border-2)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          className="skeleton"
          style={{ height: 20, width: "55%", borderRadius: "var(--r-xs)" }}
        />
        <div
          className="skeleton"
          style={{
            height: 20,
            width: 68,
            borderRadius: "var(--r-full)",
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--s-2)",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: "var(--s-2) var(--s-3)",
              background: "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
            }}
          >
            <div
              className="skeleton"
              style={{ height: 9, width: "60%", marginBottom: "var(--s-1)" }}
            />
            <div className="skeleton" style={{ height: 14, width: "40%" }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 6, borderRadius: "var(--r-full)" }} />
      <div className="skeleton" style={{ height: 52, borderRadius: "var(--r-sm)" }} />
      <div className="skeleton" style={{ height: 32, borderRadius: "var(--r-sm)" }} />
    </div>
  );
}

// ── Segment card ─────────────────────────────────────────────────────────────
function SegmentCard({ seg, config, onCreateTask, creating }) {
  const { label, accent, badge } = config;

  return (
    <div
      className="card card-lift"
      style={{
        borderLeft: `4px solid ${accent}`,
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "var(--r-full)",
              background: accent,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "var(--c-text)",
              lineHeight: "var(--lh-tight)",
            }}
          >
            {label}
          </span>
        </div>
        <span className={`badge ${badge}`}>
          {(seg.count ?? 0).toLocaleString("de")} Kunden
        </span>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--s-2)",
        }}
      >
        {[
          {
            label: "Umsatz-Anteil",
            value: `${(seg.pct_of_revenue ?? 0).toFixed(1)}%`,
          },
          {
            label: "Ø Umsatz",
            value: `€${Math.round(seg.avg_revenue ?? 0).toLocaleString("de")}`,
          },
          {
            label: "Recency",
            value: `${Math.round(seg.avg_recency_days ?? 0)} Tage`,
          },
          {
            label: "Frequency",
            value: `${(seg.avg_frequency ?? 0).toFixed(1)}x`,
          },
        ].map(({ label: statLabel, value }) => (
          <div
            key={statLabel}
            style={{
              padding: "var(--s-2) var(--s-3)",
              background: "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
            }}
          >
            <div className="label" style={{ marginBottom: 2 }}>
              {statLabel}
            </div>
            <div
              className="tabular"
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--c-text)",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue progress bar */}
      <div>
        <div className="label" style={{ marginBottom: "var(--s-1)" }}>
          Umsatz-Anteil
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(seg.pct_of_revenue ?? 0, 100)}%`,
              background: accent,
            }}
          />
        </div>
      </div>

      {/* KI recommendation */}
      {seg.ai_action && (
        <div
          style={{
            background: "var(--c-surface-2)",
            borderLeft: `3px solid ${accent}`,
            borderRadius: `0 var(--r-sm) var(--r-sm) 0`,
            padding: "var(--s-2) var(--s-3)",
            fontSize: "var(--text-sm)",
            color: "var(--c-text-2)",
            fontStyle: "italic",
            lineHeight: "var(--lh-loose)",
          }}
        >
          {seg.ai_action}
        </div>
      )}

      {/* CTA */}
      <button
        className="btn btn-ghost btn-sm"
        style={{
          width: "100%",
          justifyContent: "center",
          color: accent,
          marginTop: "auto",
        }}
        onClick={() => onCreateTask(seg, config)}
        disabled={creating}
      >
        {creating ? (
          <>
            <span className="spinner spinner-sm" />
            Wird erstellt…
          </>
        ) : (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Task erstellen
          </>
        )}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Kunden() {
  const { authHeader } = useAuth();

  // ── RFM state ───────────────────────────────────────────────────
  const [rfmData, setRfmData] = useState(null);
  const [rfmLoading, setRfmLoading] = useState(true);
  const [rfmError, setRfmError] = useState(null);

  // ── Customers state ─────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState(null);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  // ── UI ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("segmente");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("rfm_score");
  const [sortDir, setSortDir] = useState("desc");
  const [creatingTask, setCreatingTask] = useState(null);

  // ── Import state ────────────────────────────────────────────────
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Toasts ──────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastCounter = useRef(0);

  function pushToast(type, title, message) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, title, message, exiting: false }]);
    const dismissAt = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        320
      );
    }, 3500);
    return dismissAt;
  }

  function removeToast(id) {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      320
    );
  }

  // ── Load RFM ────────────────────────────────────────────────────
  async function loadRfm() {
    setRfmLoading(true);
    setRfmError(null);
    try {
      const res = await fetch("/api/customers/rfm", {
        headers: authHeader(),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || `HTTP ${res.status}`);
      }
      setRfmData(await res.json());
    } catch (e) {
      setRfmError(e.message);
    } finally {
      setRfmLoading(false);
    }
  }

  // ── Load customers ───────────────────────────────────────────────
  async function loadCustomers() {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const res = await fetch("/api/customers?limit=100", {
        headers: authHeader(),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCustomers(
        Array.isArray(data) ? data : (data.customers ?? [])
      );
      setCustomersLoaded(true);
    } catch (e) {
      setCustomersError(e.message);
    } finally {
      setCustomersLoading(false);
    }
  }

  useEffect(() => {
    loadRfm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "alle" && !customersLoaded) {
      loadCustomers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Create task for segment ──────────────────────────────────────
  async function handleCreateTask(seg, config) {
    setCreatingTask(seg.segment);
    try {
      const title = `${config.label}: ${(seg.ai_action ?? "Maßnahme ergreifen").slice(0, 80)}`;
      const description = `Segment ${config.label} · ${seg.count ?? 0} Kunden · ${(seg.pct_of_revenue ?? 0).toFixed(1)}% Umsatz-Anteil`;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority: config.priority }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || "Fehler beim Erstellen");
      }
      pushToast(
        "success",
        "Task erstellt",
        `Task für "${config.label}" wurde erfolgreich angelegt.`
      );
    } catch (e) {
      pushToast("error", "Fehler", e.message);
    } finally {
      setCreatingTask(null);
    }
  }

  // ── CSV handling ─────────────────────────────────────────────────
  function parseCsvPreview(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    const splitLine = (line) =>
      line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const headers = splitLine(lines[0]);
    const rows = lines.slice(1, 6).map(splitLine);
    return { headers, rows };
  }

  function handleFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      pushToast("error", "Ungültiges Format", "Bitte eine .csv-Datei auswählen.");
      return;
    }
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = parseCsvPreview(e.target.result ?? "");
      setCsvPreview(preview);
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || "Import fehlgeschlagen");
      }
      const result = await res.json();
      pushToast(
        "success",
        "Import erfolgreich",
        `${result.imported ?? "?"} Kunden importiert.`
      );
      setCsvFile(null);
      setCsvPreview(null);
      setCustomersLoaded(false);
      loadRfm();
    } catch (e) {
      pushToast("error", "Import fehlgeschlagen", e.message);
    } finally {
      setImporting(false);
    }
  }

  // ── Sort & filter ────────────────────────────────────────────────
  const filteredCustomers = customers
    .filter((c) => {
      if (!search.trim()) return true;
      const name = (c.name || c.customer_id || "").toLowerCase();
      return name.includes(search.toLowerCase());
    })
    .sort((a, b) => {
      const mul = sortDir === "desc" ? -1 : 1;
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return mul * String(av).localeCompare(String(bv));
      return mul * (Number(av) - Number(bv));
    });

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortArrow({ column }) {
    if (sortKey !== column)
      return (
        <span style={{ color: "var(--c-text-4)", marginLeft: 3, fontSize: 10 }}>
          ↕
        </span>
      );
    return (
      <span style={{ color: "var(--c-primary)", marginLeft: 3, fontSize: 10 }}>
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  // ── Ordered segments ─────────────────────────────────────────────
  const orderedSegments = rfmData?.segments
    ? SEGMENT_ORDER.reduce((acc, key) => {
        const seg = rfmData.segments.find((s) => s.segment === key);
        if (seg && SEGMENT_CONFIG[key]) acc.push({ seg, config: SEGMENT_CONFIG[key] });
        return acc;
      }, [])
    : [];

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--s-4)",
          }}
        >
          <div>
            <h1 className="page-title">Kunden</h1>
            <p className="page-subtitle">
              RFM-Segmentierung · KI-Empfehlungen · Kundendaten
            </p>
          </div>
          {activeTab === "segmente" && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadRfm}
              disabled={rfmLoading}
            >
              {rfmLoading ? (
                <span className="spinner spinner-sm" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-.44-4.4" />
                </svg>
              )}
              Aktualisieren
            </button>
          )}
          {activeTab === "alle" && customersLoaded && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCustomersLoaded(false);
                loadCustomers();
              }}
              disabled={customersLoading}
            >
              {customersLoading ? (
                <span className="spinner spinner-sm" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-.44-4.4" />
                </svg>
              )}
              Aktualisieren
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div
        style={{
          padding: "0 var(--s-8)",
          borderBottom: "1px solid var(--c-border)",
        }}
      >
        <div
          className="tabs-underline"
          style={{ borderBottom: "none" }}
        >
          {[
            { key: "segmente", label: "Segmente" },
            { key: "alle", label: "Alle Kunden" },
            { key: "import", label: "Import" },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`tab-underline${activeTab === key ? " active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">

        {/* ══════════════════════════════════════════════════════════
            TAB: Segmente
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "segmente" && (
          <>
            {/* Error state */}
            {rfmError && !rfmLoading && (
              <div className="error-state">
                <div className="error-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--c-text)",
                  }}
                >
                  Fehler beim Laden
                </div>
                <div
                  style={{
                    fontSize: "var(--text-md)",
                    color: "var(--c-text-2)",
                  }}
                >
                  {rfmError}
                </div>
                <button className="btn btn-primary" onClick={loadRfm}>
                  Erneut versuchen
                </button>
              </div>
            )}

            {/* Skeleton loading */}
            {rfmLoading && (
              <>
                <div
                  className="skeleton"
                  style={{
                    height: 84,
                    borderRadius: "var(--r-lg)",
                    marginBottom: "var(--s-6)",
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "var(--s-4)",
                  }}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <SegmentCardSkeleton key={i} />
                  ))}
                </div>
              </>
            )}

            {/* Loaded data */}
            {!rfmLoading && !rfmError && rfmData && (
              <>
                {/* KI Summary card */}
                {rfmData.ai_summary && (
                  <div
                    style={{
                      background: "var(--c-primary-light)",
                      border: "1px solid var(--c-primary)",
                      borderRadius: "var(--r-lg)",
                      padding: "var(--s-5) var(--s-6)",
                      marginBottom: "var(--s-6)",
                      display: "flex",
                      gap: "var(--s-4)",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "var(--r-sm)",
                        background: "var(--c-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--c-surface)"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          color: "var(--c-primary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: "var(--s-1)",
                        }}
                      >
                        KI-Analyse
                      </div>
                      <p
                        style={{
                          fontSize: "var(--text-md)",
                          color: "var(--c-text)",
                          lineHeight: "var(--lh-loose)",
                          margin: 0,
                        }}
                      >
                        {rfmData.ai_summary}
                      </p>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {orderedSegments.length === 0 && (
                  <div className="empty-state">
                    <svg
                      className="empty-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <div className="empty-title">Keine Segmente vorhanden</div>
                    <div className="empty-text">
                      Importiere Kundendaten, damit die RFM-Segmentierung
                      durchgeführt werden kann.
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => setActiveTab("import")}
                    >
                      Daten importieren
                    </button>
                  </div>
                )}

                {/* Segment grid */}
                {orderedSegments.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "var(--s-4)",
                    }}
                  >
                    {orderedSegments.map(({ seg, config }) => (
                      <SegmentCard
                        key={seg.segment}
                        seg={seg}
                        config={config}
                        onCreateTask={handleCreateTask}
                        creating={creatingTask === seg.segment}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB: Alle Kunden
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "alle" && (
          <>
            {/* Search bar */}
            <div
              style={{
                marginBottom: "var(--s-4)",
                position: "relative",
                maxWidth: 380,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--c-text-3)",
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="input input-sm"
                style={{ paddingLeft: 34 }}
                placeholder="Kunden suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Error */}
            {customersError && !customersLoading && (
              <div className="error-state">
                <div className="error-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--c-text)",
                  }}
                >
                  Fehler beim Laden
                </div>
                <div style={{ color: "var(--c-text-2)" }}>
                  {customersError}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={loadCustomers}
                >
                  Erneut versuchen
                </button>
              </div>
            )}

            {/* Skeleton rows */}
            {customersLoading && (
              <div
                className="card"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "var(--s-2) var(--s-4)",
                    background: "var(--c-surface-2)",
                    borderBottom: "1px solid var(--c-border)",
                  }}
                >
                  <div
                    className="skeleton"
                    style={{ height: 10, width: 320 }}
                  />
                </div>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "var(--s-4)",
                      padding: "var(--s-3) var(--s-4)",
                      borderBottom: "1px solid var(--c-border)",
                      alignItems: "center",
                    }}
                  >
                    <div className="skeleton" style={{ height: 14, width: 140, flexShrink: 0 }} />
                    <div className="skeleton" style={{ height: 20, width: 80, borderRadius: "var(--r-full)", flexShrink: 0 }} />
                    <div className="skeleton" style={{ height: 12, width: 60, flexShrink: 0 }} />
                    <div className="skeleton" style={{ height: 12, width: 100, flexShrink: 0 }} />
                    <div className="skeleton" style={{ height: 14, width: 36, flexShrink: 0 }} />
                    <div className="skeleton" style={{ height: 14, width: 72, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            {!customersLoading && !customersError && (
              <>
                {filteredCustomers.length === 0 ? (
                  <div className="empty-state">
                    <svg
                      className="empty-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <div className="empty-title">
                      {search ? "Keine Ergebnisse" : "Keine Kunden vorhanden"}
                    </div>
                    <div className="empty-text">
                      {search
                        ? `Keine Kunden gefunden für "${search}".`
                        : "Importiere Kundendaten, um sie hier zu sehen."}
                    </div>
                    {!search && (
                      <button
                        className="btn btn-primary"
                        onClick={() => setActiveTab("import")}
                      >
                        Daten importieren
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="card"
                    style={{ padding: 0, overflow: "hidden" }}
                  >
                    {/* Header row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 140px 90px 130px 64px 110px",
                        gap: "var(--s-3)",
                        padding: "var(--s-2) var(--s-4)",
                        background: "var(--c-surface-2)",
                        borderBottom: "1px solid var(--c-border)",
                      }}
                    >
                      {[
                        { key: "name", label: "Name" },
                        { key: "segment", label: "Segment" },
                        { key: "recency_days", label: "Recency" },
                        { key: null, label: "RFM Bars" },
                        { key: "rfm_score", label: "Score" },
                        { key: "monetary", label: "Umsatz (€)" },
                      ].map(({ key, label }) => (
                        <div
                          key={label}
                          className="label"
                          style={{
                            cursor: key ? "pointer" : "default",
                            userSelect: "none",
                            display: "flex",
                            alignItems: "center",
                          }}
                          onClick={() => key && toggleSort(key)}
                        >
                          {label}
                          {key && <SortArrow column={key} />}
                        </div>
                      ))}
                    </div>

                    {/* Data rows */}
                    {filteredCustomers.map((customer, idx) => {
                      const cfg =
                        SEGMENT_CONFIG[customer.segment] ??
                        SEGMENT_CONFIG.lost;
                      return (
                        <div
                          key={customer.customer_id ?? idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "2fr 140px 90px 130px 64px 110px",
                            gap: "var(--s-3)",
                            padding: "var(--s-3) var(--s-4)",
                            borderBottom: "1px solid var(--c-border)",
                            alignItems: "center",
                            transition: "background var(--dur-fast) ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--c-surface-2)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "";
                          }}
                        >
                          {/* Name */}
                          <div
                            className="truncate"
                            style={{
                              fontWeight: 500,
                              color: "var(--c-text)",
                              fontSize: "var(--text-sm)",
                            }}
                          >
                            {customer.name || customer.customer_id || "–"}
                          </div>

                          {/* Segment badge */}
                          <div>
                            <span className={`badge ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </div>

                          {/* Recency */}
                          <div
                            className="tabular text-sm"
                            style={{ color: "var(--c-text-2)" }}
                          >
                            {customer.recency_days != null
                              ? `${customer.recency_days} T`
                              : "–"}
                          </div>

                          {/* RFM bars */}
                          <div>
                            <RFMBars
                              r={customer.r_score}
                              f={customer.f_score}
                              m={customer.m_score}
                              accent={cfg.accent}
                            />
                          </div>

                          {/* Score */}
                          <div
                            className="tabular text-sm"
                            style={{
                              fontWeight: 600,
                              color: "var(--c-text)",
                            }}
                          >
                            {customer.rfm_score ?? "–"}
                          </div>

                          {/* Revenue */}
                          <div
                            className="tabular text-sm"
                            style={{
                              fontWeight: 600,
                              color: "var(--c-success)",
                            }}
                          >
                            {customer.monetary != null
                              ? `€${Math.round(customer.monetary).toLocaleString("de")}`
                              : "–"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB: Import
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "import" && (
          <div style={{ maxWidth: 580 }}>
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              style={{
                border: `2px dashed ${
                  dragOver ? "var(--c-primary)" : "var(--c-border-2)"
                }`,
                borderRadius: "var(--r-lg)",
                padding: "var(--s-12) var(--s-8)",
                textAlign: "center",
                background: dragOver
                  ? "var(--c-primary-light)"
                  : "var(--c-surface)",
                transition: "all var(--dur-base) ease",
                cursor: "pointer",
                outline: "none",
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              {/* Upload icon */}
              <div
                style={{
                  marginBottom: "var(--s-4)",
                  color: dragOver
                    ? "var(--c-primary)"
                    : "var(--c-text-3)",
                }}
              >
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  style={{ margin: "0 auto" }}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>

              <div
                style={{
                  fontSize: "var(--text-md)",
                  fontWeight: 600,
                  color: "var(--c-text)",
                  marginBottom: "var(--s-1)",
                }}
              >
                {csvFile ? csvFile.name : "CSV-Datei hier ablegen"}
              </div>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--c-text-3)",
                }}
              >
                {csvFile
                  ? `${(csvFile.size / 1024).toFixed(1)} KB · Klicken zum Ändern`
                  : "oder klicken zum Auswählen · Akzeptiert .csv"}
              </div>
            </div>

            {/* CSV preview */}
            {csvPreview && (
              <div
                className="card"
                style={{ marginTop: "var(--s-4)", padding: 0, overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "var(--s-3) var(--s-4)",
                    background: "var(--c-surface-2)",
                    borderBottom: "1px solid var(--c-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      color: "var(--c-text)",
                    }}
                  >
                    Vorschau – erste 5 Zeilen
                  </span>
                  <span className="badge badge-neutral">
                    {csvPreview.headers.length} Spalten
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    <thead>
                      <tr>
                        {csvPreview.headers.map((h, i) => (
                          <th
                            key={i}
                            style={{
                              padding: "var(--s-2) var(--s-3)",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "var(--c-text-2)",
                              borderBottom: "1px solid var(--c-border)",
                              background: "var(--c-surface-2)",
                              whiteSpace: "nowrap",
                              fontSize: "var(--text-xs)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              style={{
                                padding: "var(--s-2) var(--s-3)",
                                color: "var(--c-text)",
                                borderBottom: "1px solid var(--c-border)",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cell || (
                                <span style={{ color: "var(--c-text-4)" }}>
                                  –
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import actions */}
            {csvFile && (
              <div
                style={{
                  marginTop: "var(--s-4)",
                  display: "flex",
                  gap: "var(--s-3)",
                }}
              >
                <button
                  className="btn btn-primary btn-full"
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? (
                    <>
                      <span
                        className="spinner spinner-sm"
                        style={{ borderTopColor: "rgba(255,255,255,0.8)" }}
                      />
                      Wird importiert…
                    </>
                  ) : (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Import starten
                    </>
                  )}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCsvFile(null);
                    setCsvPreview(null);
                  }}
                  disabled={importing}
                >
                  Verwerfen
                </button>
              </div>
            )}

            {/* Format hint */}
            <div
              style={{
                marginTop: "var(--s-6)",
                padding: "var(--s-4)",
                background: "var(--c-surface-2)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--c-border)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--c-text)",
                  marginBottom: "var(--s-2)",
                }}
              >
                Erwartetes CSV-Format
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--s-1)",
                }}
              >
                {[
                  "customer_id",
                  "name",
                  "email",
                  "purchase_date",
                  "revenue",
                ].map((col) => (
                  <span key={col} className="badge badge-neutral">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
