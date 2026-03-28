import { useState, useEffect, useRef } from "react";

const INTEGRATIONS = [
  {
    key: "stripe",
    name: "Stripe",
    description: "Zahlungen, Umsatz, neue Kunden",
    letter: "S",
    color: "#6366f1",
    envKey: "STRIPE_SECRET_KEY",
    syncUrl: "/api/integrations/stripe/sync",
    docsUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    key: "google_analytics",
    name: "Google Analytics",
    description: "Traffic, Sessions, Bounce Rate",
    letter: "G",
    color: "#ef4444",
    syncUrl: "/api/integrations/connect/google-analytics",
    docsUrl: "https://analytics.google.com",
  },
  {
    key: "hubspot",
    name: "HubSpot CRM",
    description: "Kontakte, Deals, Pipeline",
    letter: "H",
    color: "#f59e0b",
    syncUrl: "/api/integrations/connect/hubspot",
    docsUrl: "https://developers.hubspot.com",
  },
  {
    key: "csv",
    name: "CSV Upload",
    description: "Manuelle Daten importieren",
    letter: "C",
    color: "#10b981",
    always_connected: true,
  },
];

const LIFECYCLE_COLORS = {
  customer: { color: "#10b981", label: "Kunde" },
  lead: { color: "#6366f1", label: "Lead" },
  opportunity: { color: "#f59e0b", label: "Opportunity" },
  subscriber: { color: "#06b6d4", label: "Abonnent" },
};

function normalizeStatusName(name) {
  const normalized = String(name || "").toLowerCase().replace(/\s+/g, "_");
  if (normalized === "hubspot_crm") return "hubspot";
  if (normalized === "csv_upload") return "csv";
  return normalized;
}

function IntegrationCard({ integration, status, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [data, setData] = useState(null);

  const connected = integration.always_connected || status?.connected;

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    setData(null);
    try {
      const res = await fetch(integration.syncUrl, {
        method: integration.key === "stripe" ? "POST" : "GET",
      });
      const payload = await res.json();
      if (res.ok) {
        setData(payload);
        setResult("success");
        onSync?.(integration.key, payload);
      } else {
        setResult(payload.detail || "Fehler");
      }
    } catch (e) {
      setResult(e.message);
    }
    setSyncing(false);
  }

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: `1px solid ${connected ? integration.color + "30" : "#e8e8ed"}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: connected ? integration.color + "20" : "#e8e8ed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            color: connected ? integration.color : "#334155",
            flexShrink: 0,
          }}
        >
          {integration.letter}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{integration.name}</div>
          <div style={{ fontSize: 11, color: "#475569" }}>{integration.description}</div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: connected ? "#10b98118" : "#ef444418",
            color: connected ? "#10b981" : "#ef4444",
          }}
        >
          {connected ? "Verbunden" : "Nicht verbunden"}
        </span>
      </div>

      {result === "success" && data && (
        <div
          style={{
            background: "#10b98115",
            border: "1px solid #10b98130",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          {integration.key === "stripe" && (
            <div style={{ color: "#10b981" }}>
              ✓ EUR {Math.round(data.revenue)} Umsatz · {data.transactions} Transaktionen · {data.new_customers} neue Kunden
            </div>
          )}
          {integration.key === "google_analytics" && (
            <div style={{ color: "#10b981" }}>
              ✓ {data.sessions.toLocaleString("de-DE")} Sessions · {data.users.toLocaleString("de-DE")} Nutzer · {data.bounce_rate}% Bounce
              {data.source === "demo_data" && <span style={{ color: "#f59e0b", marginLeft: 6 }}>(Demo-Daten)</span>}
            </div>
          )}
          {integration.key === "hubspot" && (
            <div style={{ color: "#10b981" }}>
              ✓ {data.total_contacts} Kontakte · {data.total_deals} Deals · EUR {Math.round(data.total_deal_value).toLocaleString("de-DE")} Pipeline
            </div>
          )}
        </div>
      )}

      {typeof result === "string" && result !== "success" && (
        <div
          style={{
            background: "#ef444415",
            border: "1px solid #ef444430",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 11,
            color: "#ef4444",
          }}
        >
          {result}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {connected ? (
          <button
            onClick={handleSync}
            disabled={syncing || !integration.syncUrl}
            style={{
              flex: 1,
              padding: "7px 0",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: "none",
              cursor: syncing ? "not-allowed" : "pointer",
              background: syncing ? "#e8e8ed" : integration.color,
              color: syncing ? "#475569" : "#fff",
            }}
          >
            {syncing ? "Synchronisiere..." : "Daten laden"}
          </button>
        ) : (
          <button
            onClick={() => integration.docsUrl && window.open(integration.docsUrl, "_blank")}
            style={{
              flex: 1,
              padding: "7px 0",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: "1px solid #1e1e2e",
              background: "transparent",
              color: "#475569",
              cursor: "pointer",
            }}
          >
            API Key holen ↗
          </button>
        )}
      </div>
    </div>
  );
}

function HubSpotTable({ data }) {
  if (!data) return null;
  return (
    <div
      style={{
        background: "#f5f5f7",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        overflow: "hidden",
        marginTop: 12,
      }}
    >
      <div style={{ padding: "10px 16px", background: "#ffffff", borderBottom: "1px solid #1e1e2e", fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
        HubSpot CRM — {data.total_contacts} Kontakte · {data.total_deals} Deals · EUR {Math.round(data.total_deal_value).toLocaleString("de-DE")} Pipeline
      </div>
      {data.contacts.map((contact, index) => {
        const lifecycle = LIFECYCLE_COLORS[contact.lifecycle_stage] || { color: "#475569", label: contact.lifecycle_stage };
        return (
          <div
            key={contact.id}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 160px 100px 80px",
              gap: 12,
              padding: "9px 16px",
              borderBottom: index < data.contacts.length - 1 ? "1px solid #1e1e2e" : "none",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: "#374151" }}>{contact.name}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>{contact.company}</div>
            </div>
            <div style={{ color: "#64748b", fontSize: 11 }}>{contact.email}</div>
            <div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: lifecycle.color + "18",
                  color: lifecycle.color,
                }}
              >
                {lifecycle.label}
              </span>
            </div>
            <div style={{ color: "#10b981", fontWeight: 600 }}>
              {contact.deal_value ? `EUR ${contact.deal_value.toLocaleString("de-DE")}` : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CsvImporter({ onImport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = vals[index]?.trim();
      });
      return obj;
    });
  }

  function handleFile(e) {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(parseCSV(ev.target.result).slice(0, 3));
    reader.readAsText(selectedFile);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = parseCSV(ev.target.result).map((row) => ({
        date: row.date,
        revenue: parseFloat(row.revenue || 0),
        traffic: parseInt(row.traffic || 0, 10),
        conversions: parseInt(row.conversions || 0, 10),
        new_customers: parseInt(row.new_customers || 0, 10),
      }));
      try {
        const res = await fetch("/api/integrations/csv/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        setResult(await res.json());
        onImport?.();
      } catch (e) {
        setResult({ imported: 0, skipped: 0, errors: [e.message] });
      }
      setImporting(false);
    };
    reader.readAsText(file);
  }

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "18px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 10 }}>CSV Import</div>
      <div
        style={{
          background: "#ffffff",
          borderRadius: 8,
          padding: "9px 12px",
          fontFamily: "monospace",
          fontSize: 11,
          color: "#475569",
          marginBottom: 12,
        }}
      >
        Format: date,revenue,traffic,conversions,new_customers
        <br />
        Beispiel: 2024-01-15,1250.00,45,12,3
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: "1px dashed #334155",
          borderRadius: 10,
          padding: "18px",
          textAlign: "center",
          cursor: "pointer",
          background: file ? "#10b98108" : "transparent",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: file ? "#10b981" : "#475569" }}>{file ? `✓ ${file.name}` : "CSV-Datei auswählen"}</div>
        <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
      </div>

      {preview.length > 0 && <div style={{ marginBottom: 12, fontSize: 11, color: "#475569" }}>Vorschau: {preview.map((row) => row.date).join(", ")} ...</div>}

      {file && (
        <button
          onClick={handleImport}
          disabled={importing}
          style={{
            background: importing ? "#e8e8ed" : "#6366f1",
            color: importing ? "#475569" : "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 12,
            fontWeight: 600,
            cursor: importing ? "not-allowed" : "pointer",
          }}
        >
          {importing ? "Importiere..." : "Importieren"}
        </button>
      )}

      {result && (
        <div
          style={{
            marginTop: 10,
            background: result.errors?.length ? "#ef444415" : "#10b98115",
            border: `1px solid ${result.errors?.length ? "#ef444430" : "#10b98130"}`,
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 12,
          }}
        >
          <div style={{ color: "#10b981" }}>✓ {result.imported} importiert, {result.skipped} aktualisiert</div>
          {result.errors?.map((err, index) => (
            <div key={index} style={{ color: "#ef4444" }}>{err}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportSection() {
  const [exporting, setExporting] = useState(null);

  async function handleExport(format, days) {
    setExporting(format);
    try {
      const res = await fetch(`/api/integrations/connect/export/${format}?days=${days}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `intlyst_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
    setExporting(null);
  }

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: "1px solid #1e1e2e",
        borderRadius: 12,
        padding: "18px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 12 }}>Daten exportieren</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { format: "csv", days: 30, label: "CSV — letzte 30 Tage" },
          { format: "csv", days: 90, label: "CSV — letzte 90 Tage" },
          { format: "json", days: 30, label: "JSON — letzte 30 Tage" },
          { format: "json", days: 90, label: "JSON — letzte 90 Tage" },
        ].map((entry) => (
          <button
            key={`${entry.format}-${entry.days}`}
            onClick={() => handleExport(entry.format, entry.days)}
            disabled={exporting !== null}
            style={{
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #1e1e2e",
              background: "transparent",
              color: "#374151",
              cursor: exporting ? "not-allowed" : "pointer",
              textAlign: "left",
            }}
          >
            ↓ {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Data() {
  const [status, setStatus] = useState({});
  const [hubspotData, setHubspotData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    try {
      const res = await fetch("/api/integrations/status");
      const payload = await res.json();
      const map = {};
      if (Array.isArray(payload)) {
        payload.forEach((item) => {
          map[normalizeStatusName(item.name)] = item;
        });
      }
      setStatus(map);
    } catch {
      setStatus({});
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  function handleSync(key, data) {
    if (key === "hubspot") {
      setHubspotData(data);
    }
    loadStatus();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#374151",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>Data & Integrations</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>Stripe · Google Analytics · HubSpot · CSV Import · Export</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Verbindungen
        </div>
        {loading ? (
          <div style={{ color: "#475569", fontSize: 13 }}>Laden...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
            {INTEGRATIONS.map((integration) => (
              <IntegrationCard
                key={integration.key}
                integration={integration}
                status={status[integration.key]}
                onSync={handleSync}
              />
            ))}
          </div>
        )}
      </div>

      {hubspotData && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            HubSpot CRM Daten
          </div>
          <HubSpotTable data={hubspotData} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <CsvImporter onImport={loadStatus} />
        <ExportSection />
      </div>

      <div
        style={{
          background: "#f5f5f7",
          border: "1px solid #1e1e2e",
          borderRadius: 12,
          padding: "18px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 8 }}>Webhook Endpunkt</div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#818cf8", background: "#ffffff", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
          POST http://localhost:8000/api/integrations/webhook
        </div>
        <div style={{ fontSize: 11, color: "#334155" }}>
          Header: X-Webhook-Secret · Body: {`{"source":"stripe","event":"payment.success","data":{}}`}
        </div>
      </div>
    </div>
  );
}
