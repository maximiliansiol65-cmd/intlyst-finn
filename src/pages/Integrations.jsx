/* eslint-disable */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Sheet } from "../components/ui";

// ── Integration catalogue ─────────────────────────────────────────────────────
const INTEGRATIONS = [
  {
    type: "google_analytics",
    name: "Google Analytics 4",
    category: "Analytics",
    description: "Website-Traffic, Nutzerverhalten & Conversion-Daten aus GA4.",
    color: "#F57C00",
    abbr: "GA",
    fields: [
      { key: "property_id", label: "Property ID", placeholder: "z.B. 123456789", type: "text" },
      { key: "api_key", label: "API Key / Access Token", placeholder: "ya29.a0...", type: "password" },
    ],
    docs: "Findest du unter: Google Analytics → Admin → Property Settings",
  },
  {
    type: "shopify",
    name: "Shopify",
    category: "E-Commerce",
    description: "Bestellungen, Produkte, Kunden & Umsatz aus deinem Shopify-Shop.",
    color: "#96BF48",
    abbr: "SH",
    fields: [
      { key: "store_url", label: "Shop-URL", placeholder: "mein-shop.myshopify.com", type: "text" },
      { key: "access_token", label: "Admin API Access Token", placeholder: "shpat_...", type: "password" },
    ],
    docs: "Shopify Admin → Apps → Eigene Apps erstellen → Admin API",
  },
  {
    type: "stripe",
    name: "Stripe",
    category: "Zahlungen",
    description: "Zahlungsumsatz, Abonnements & Rückbuchungen aus Stripe.",
    color: "#635BFF",
    abbr: "ST",
    fields: [
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", type: "password" },
    ],
    docs: "Stripe Dashboard → Entwickler → API-Schlüssel",
  },
  {
    type: "instagram",
    name: "Instagram",
    category: "Social Media",
    description: "Follower, Reichweite, Impressionen & Engagement.",
    color: "#E1306C",
    abbr: "IG",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "EAABs...", type: "password" },
      { key: "account_id", label: "Business Account ID", placeholder: "17841400...", type: "text" },
    ],
    docs: "Meta Business Suite → Einstellungen → Instagram → API-Zugang",
  },
  {
    type: "meta_ads",
    name: "Meta Ads",
    category: "Werbung",
    description: "Facebook & Instagram Werbekampagnen, Ausgaben & ROAS.",
    color: "#1877F2",
    abbr: "FB",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "EAABs...", type: "password" },
      { key: "ad_account_id", label: "Ad Account ID", placeholder: "act_123456...", type: "text" },
    ],
    docs: "Meta Business Suite → Einstellungen → Werbekonten",
  },
  {
    type: "woocommerce",
    name: "WooCommerce",
    category: "E-Commerce",
    description: "Bestellungen, Produkte & Kunden aus deinem WordPress/WooCommerce-Shop.",
    color: "#7F54B3",
    abbr: "WC",
    fields: [
      { key: "store_url", label: "Shop-URL", placeholder: "https://mein-shop.de", type: "text" },
      { key: "consumer_key", label: "Consumer Key", placeholder: "ck_...", type: "text" },
      { key: "consumer_secret", label: "Consumer Secret", placeholder: "cs_...", type: "password" },
    ],
    docs: "WooCommerce → Einstellungen → Erweitert → REST API",
  },
  {
    type: "mailchimp",
    name: "Mailchimp",
    category: "E-Mail Marketing",
    description: "Abonnenten, Kampagnen-Performance & Open Rates.",
    color: "#FFE01B",
    abbr: "MC",
    textColor: "#1a1a1a",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "abc123def...-us1", type: "password" },
      { key: "server_prefix", label: "Server Prefix", placeholder: "us1", type: "text" },
      { key: "list_id", label: "Audience / List ID", placeholder: "a1b2c3d4", type: "text" },
      { key: "from_name", label: "From Name", placeholder: "INTLYST", type: "text" },
      { key: "reply_to", label: "Reply-To", placeholder: "team@example.com", type: "text" },
    ],
    docs: "Mailchimp → Konto → Extras → API Keys",
  },
  {
    type: "hubspot",
    name: "HubSpot CRM",
    category: "CRM",
    description: "Kontakte, Deals, Pipeline & Kundenaktivitäten.",
    color: "#FF7A59",
    abbr: "HS",
    fields: [
      { key: "access_token", label: "Private App Access Token", placeholder: "pat-eu1-...", type: "password" },
      { key: "portal_id", label: "Portal ID", placeholder: "12345678", type: "text" },
      { key: "owner_id", label: "Owner ID", placeholder: "998877", type: "text" },
    ],
    docs: "HubSpot → Einstellungen → Integrationen → Private Apps",
  },
  {
    type: "slack",
    name: "Slack",
    category: "Collaboration",
    description: "Spielt Strategien, Reports und KPI-Updates direkt in deinen Team-Channel.",
    color: "#4A154B",
    abbr: "SL",
    fields: [
      { key: "webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/...", type: "password" },
      { key: "channel", label: "Channel", placeholder: "#growth-ops", type: "text" },
    ],
    docs: "Slack → Apps → Incoming Webhooks",
  },
  {
    type: "notion",
    name: "Notion",
    category: "Collaboration",
    description: "Dokumentiert Strategien, Reports und Entscheidungen als lebende Wissensbasis.",
    color: "#111111",
    abbr: "NO",
    fields: [
      { key: "access_token", label: "Internal Integration Token", placeholder: "secret_...", type: "password" },
      { key: "database_id", label: "Database ID", placeholder: "oder leer lassen", type: "text" },
      { key: "parent_page_id", label: "Parent Page ID", placeholder: "optional statt Database", type: "text" },
      { key: "title_property", label: "Title Property", placeholder: "Name", type: "text" },
    ],
    docs: "Notion → Einstellungen → Verbindungen → Integrationen",
  },
  {
    type: "trello",
    name: "Trello",
    category: "Collaboration",
    description: "Erstellt operative Karten für Umsetzung und Follow-up direkt im Board.",
    color: "#0C66E4",
    abbr: "TR",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "dein key", type: "password" },
      { key: "token", label: "Token", placeholder: "dein token", type: "password" },
      { key: "list_id", label: "List ID", placeholder: "z.B. 65f...", type: "text" },
    ],
    docs: "Trello Developer API → Key/Token + Ziel-Liste",
  },
  {
    type: "webhook",
    name: "Webhook",
    category: "Automation",
    description: "Leitet freigegebene Aktionen an deine eigenen Systeme oder Workflows weiter.",
    color: "#111827",
    abbr: "WH",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://example.com/intlyst-hook", type: "text" },
      { key: "secret", label: "Shared Secret", placeholder: "optional", type: "password" },
    ],
    docs: "Empfängt Action-Ausführungen und Artefakte nach Freigabe.",
  },
  {
    type: "csv",
    name: "CSV Import",
    category: "Manuell",
    description: "Importiere Daten manuell per CSV-Datei (Umsatz, Traffic, Kunden).",
    color: "#374151",
    abbr: "CSV",
    fields: [
      { key: "note", label: "Hinweis / Quelle", placeholder: "z.B. Export aus Excel", type: "text" },
    ],
    docs: "Datei-Format: date, revenue, traffic, conversions, new_customers",
  },
];

const CATEGORIES = ["Alle", ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))];

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IcoEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IcoLink = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);
const IcoSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);
const IcoInfo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);

// ── Connect Sheet ─────────────────────────────────────────────────────────────
function ConnectSheet({ integration, isOpen, onClose, onSaved, existingFields, authHeader }) {
  const toast = useToast();
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  // Reset when a new integration is opened
  useEffect(() => {
    if (isOpen && integration) {
      const initial = {};
      integration.fields.forEach(f => { initial[f.key] = ""; });
      setValues(initial);
    }
  }, [isOpen, integration]);

  if (!integration) return null;

  const isEditing = existingFields && existingFields.length > 0;
  const canSave = integration.fields.some(f => values[f.key]?.trim());

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/user-integrations/${integration.type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ credentials: values }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Speichern fehlgeschlagen");
      }
      toast.success(`${integration.name} verbunden!`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message || "Verbindung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `${integration.name} bearbeiten` : `${integration.name} verbinden`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>

        {/* Service badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)", background: "#f9f9f9", borderRadius: "var(--r-md)", border: "1px solid #e5e5e5" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "var(--r-md)",
            background: integration.color, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 11, fontWeight: 700,
            color: integration.textColor || "#fff", flexShrink: 0,
          }}>
            {integration.abbr}
          </div>
          <div>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{integration.name}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{integration.category}</div>
          </div>
        </div>

        {/* Fields */}
        {integration.fields.map(field => (
          <div key={field.key}>
            <label className="form-label">{field.label}</label>
            <input
              className="input"
              type={field.type === "password" ? "password" : "text"}
              value={values[field.key] || ""}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              placeholder={isEditing ? "• • • • • • • • (leer lassen = unverändert)" : field.placeholder}
              autoComplete="off"
            />
          </div>
        ))}

        {/* Docs hint */}
        <div style={{ display: "flex", gap: "var(--s-2)", padding: "var(--s-3) var(--s-4)", background: "#f0f7ff", borderRadius: "var(--r-md)", border: "1px solid #cce0ff" }}>
          <span style={{ color: "#3b82f6", flexShrink: 0, marginTop: 1 }}><IcoInfo /></span>
          <p style={{ fontSize: "var(--text-xs)", color: "#374151", margin: 0, lineHeight: 1.6 }}>{integration.docs}</p>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          <button className="btn btn-secondary btn-md" style={{ flex: 1 }} onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn btn-primary btn-md"
            style={{ flex: 1, background: "#000", color: "#fff", border: "none" }}
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Speichern…" : isEditing ? "Aktualisieren" : "Verbinden"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Integration Card ──────────────────────────────────────────────────────────
function IntegrationCard({ integration, connected, onConnect, onEdit, onDisconnect }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-4)", position: "relative" }}>

      {/* Status pill top-right */}
      <div style={{ position: "absolute", top: "var(--s-4)", right: "var(--s-4)" }}>
        {connected ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 999, padding: "2px 8px" }}>
            <IcoCheck /> Verbunden
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9ca3af", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 999, padding: "2px 8px" }}>
            Nicht verbunden
          </span>
        )}
      </div>

      {/* Logo + name */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: integration.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 800,
          color: integration.textColor || "#fff",
          flexShrink: 0, letterSpacing: "-0.5px",
        }}>
          {integration.abbr}
        </div>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--c-text)" }}>{integration.name}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 1 }}>
            <span style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 500 }}>{integration.category}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: 0, lineHeight: 1.6, minHeight: 40 }}>
        {integration.description}
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "auto" }}>
        {connected ? (
          <>
            <button
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
              onClick={onEdit}
            >
              <IcoEdit /> Bearbeiten
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "#ef4444", borderColor: "#fecaca" }}
              onClick={onDisconnect}
            >
              <IcoX />
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-md"
            style={{ width: "100%", background: "#000", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onClick={onConnect}
          >
            <IcoLink /> Verbinden
          </button>
        )}
      </div>
    </div>
  );
}

// ── Disconnect Confirm ────────────────────────────────────────────────────────
function DisconnectSheet({ integration, isOpen, onClose, onConfirm, loading }) {
  if (!integration) return null;
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Integration trennen">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: 0, lineHeight: 1.7 }}>
          Möchtest du <strong>{integration.name}</strong> wirklich trennen? Die gespeicherten Zugangsdaten werden gelöscht. Deine historischen Daten in INTLYST bleiben erhalten.
        </p>
        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          <button className="btn btn-secondary btn-md" style={{ flex: 1 }} onClick={onClose}>Abbrechen</button>
          <button
            className="btn btn-md"
            style={{ flex: 1, background: "#ef4444", color: "#fff", border: "none" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Trenne…" : "Trennen"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ total, connected }) {
  return (
    <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
      <div className="card" style={{ padding: "var(--s-3) var(--s-5)", display: "flex", alignItems: "center", gap: "var(--s-3)", flex: "1 1 140px" }}>
        <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a" }}>
          <IcoCheck />
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", lineHeight: 1 }}>{connected}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Verbunden</div>
        </div>
      </div>
      <div className="card" style={{ padding: "var(--s-3) var(--s-5)", display: "flex", alignItems: "center", gap: "var(--s-3)", flex: "1 1 140px" }}>
        <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
          <IcoLink />
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", lineHeight: 1 }}>{total - connected}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Verfügbar</div>
        </div>
      </div>
      <div className="card" style={{ padding: "var(--s-3) var(--s-5)", display: "flex", alignItems: "center", gap: "var(--s-3)", flex: "1 1 140px" }}>
        <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{connected > 0 ? Math.round((connected / total) * 100) : 0}%</span>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Gesamt</div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Integrations() {
  const { authHeader } = useAuth();
  const toast = useToast();

  const [connectedMap, setConnectedMap] = useState({}); // type → details
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState(null);   // "connect" | "disconnect"
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user-integrations", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const map = {};
      data.forEach(item => {
        if (item.is_active) {
          map[item.integration_type] = {
            configured_fields: item.configured_fields || [],
            last_synced_at: item.last_synced_at,
            error_message: item.error_message,
          };
        }
      });
      setConnectedMap(map);
    } catch {
      // silently fail — not critical
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => { fetchStatus(); }, []);

  function openConnect(integration) {
    setSelectedIntegration(integration);
    setActiveSheet("connect");
  }
  function openEdit(integration) {
    setSelectedIntegration(integration);
    setActiveSheet("connect");
  }
  function openDisconnect(integration) {
    setSelectedIntegration(integration);
    setActiveSheet("disconnect");
  }
  function closeSheets() {
    setActiveSheet(null);
    setSelectedIntegration(null);
  }

  async function handleDisconnect() {
    if (!selectedIntegration) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/user-integrations/${selectedIntegration.type}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selectedIntegration.name} getrennt.`);
      fetchStatus();
      closeSheets();
    } catch {
      toast.error("Trennen fehlgeschlagen.");
    } finally {
      setDisconnecting(false);
    }
  }

  // Filter
  const filtered = INTEGRATIONS.filter(i => {
    const matchCat = category === "Alle" || i.category === category;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const connectedCount = Object.keys(connectedMap).length;

  return (
    <div style={{ padding: "var(--s-6)", maxWidth: 900, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "var(--s-6)" }}>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", margin: "0 0 var(--s-1)" }}>Integrationen</h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: 0 }}>
          Verbinde deine Tools & Dienste — INTLYST zieht automatisch die aktuellen Daten daraus.
        </p>
      </div>

      {/* ── Stats ── */}
      <div style={{ marginBottom: "var(--s-5)" }}>
        <StatsBar total={INTEGRATIONS.length} connected={connectedCount} />
      </div>

      {/* ── Search + Filter bar ── */}
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", marginBottom: "var(--s-5)", alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--c-text-3)", pointerEvents: "none" }}>
            <IcoSearch />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Category tabs */}
        <div style={{ display: "flex", gap: "var(--s-1)", flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                borderRadius: 999, border: "1px solid",
                borderColor: category === cat ? "#000" : "#e5e7eb",
                background: category === cat ? "#000" : "#fff",
                color: category === cat ? "#fff" : "var(--c-text-2)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--s-4)" }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="card" style={{ padding: "var(--s-5)", height: 200 }}>
              <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: "60%", height: 14, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "90%", height: 12, borderRadius: 4, marginBottom: 4 }} />
              <div className="skeleton" style={{ width: "75%", height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--s-12) 0", color: "var(--c-text-3)" }}>
          <div style={{ fontSize: 32, marginBottom: "var(--s-3)" }}>🔍</div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text-2)" }}>Keine Integration gefunden</div>
          <div style={{ fontSize: "var(--text-sm)", marginTop: "var(--s-1)" }}>Versuche einen anderen Suchbegriff oder Filter.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--s-4)" }}>
          {filtered.map(integration => (
            <IntegrationCard
              key={integration.type}
              integration={integration}
              connected={!!connectedMap[integration.type]}
              onConnect={() => openConnect(integration)}
              onEdit={() => openEdit(integration)}
              onDisconnect={() => openDisconnect(integration)}
            />
          ))}
        </div>
      )}

      {/* ── Connected section (if any) ── */}
      {connectedCount > 0 && (
        <div style={{ marginTop: "var(--s-8)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-3)" }}>
            Verbundene Dienste ({connectedCount})
          </div>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            {INTEGRATIONS.filter(i => connectedMap[i.type]).map((integration, idx) => (
              <div key={integration.type} style={{
                display: "flex", alignItems: "center", gap: "var(--s-4)",
                padding: "var(--s-4) var(--s-5)",
                borderTop: idx > 0 ? "1px solid var(--c-border)" : "none",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: integration.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: integration.textColor || "#fff", flexShrink: 0,
                }}>
                  {integration.abbr}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{integration.name}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "#16a34a", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                    <IcoCheck /> Aktiv — {(connectedMap[integration.type]?.configured_fields || []).length} Felder konfiguriert
                  </div>
                  {connectedMap[integration.type]?.last_synced_at && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>
                      Letzter Sync: {new Date(connectedMap[integration.type].last_synced_at).toLocaleString("de-DE")}
                    </div>
                  )}
                  {connectedMap[integration.type]?.error_message && (
                    <div style={{ fontSize: "var(--text-xs)", color: "#dc2626", marginTop: 4 }}>
                      Fehler: {connectedMap[integration.type].error_message}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                  onClick={() => openEdit(integration)}
                >
                  <IcoEdit /> Bearbeiten
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hint: data flow ── */}
      <div className="card" style={{ marginTop: "var(--s-6)", padding: "var(--s-5)", background: "#f9fafb", border: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, background: "#000", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: 16, fontWeight: 700 }}>i</div>
          <div>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-1)" }}>So fließen deine Daten</div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", margin: 0, lineHeight: 1.7 }}>
              Sobald du einen Dienst verbunden hast, importiert INTLYST täglich automatisch Umsatz-, Traffic- und Kundendaten. Diese erscheinen dann auf dem Dashboard, in der Analyse und in deinen Reports. Zugangsdaten werden verschlüsselt gespeichert und nie weitergegeben.
            </p>
          </div>
        </div>
      </div>

      {/* ── Sheets ── */}
      <ConnectSheet
        integration={selectedIntegration}
        isOpen={activeSheet === "connect"}
        onClose={closeSheets}
        onSaved={fetchStatus}
        existingFields={selectedIntegration ? connectedMap[selectedIntegration.type] : null}
        authHeader={authHeader}
      />
      <DisconnectSheet
        integration={selectedIntegration}
        isOpen={activeSheet === "disconnect"}
        onClose={closeSheets}
        onConfirm={handleDisconnect}
        loading={disconnecting}
      />
    </div>
  );
}
