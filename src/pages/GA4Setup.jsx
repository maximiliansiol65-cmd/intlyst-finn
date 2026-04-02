import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

const STATUS_CONFIG = {
  success: { color: "#10b981", bg: "#10b98115", label: "Erfolgreich" },
  partial: { color: "#f59e0b", bg: "#f59e0b15", label: "Teilweise"  },
  failed:  { color: "#ef4444", bg: "#ef444415", label: "Fehler"     },
};

function ImportHistoryRow({ log }) {
  const s = STATUS_CONFIG[log.status] || STATUS_CONFIG.failed;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "100px 80px 70px 70px 70px 1fr",
      gap: 10, padding: "8px 16px",
      borderBottom: "1px solid #1e1e2e",
      fontSize: 11, alignItems: "center",
    }}>
      <span style={{ color: "#94a3b8" }}>{log.date}</span>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: "1px 7px",
        borderRadius: 4, background: s.bg, color: s.color,
      }}>
        {s.label}
      </span>
      <span style={{ color: "#e2e8f0" }}>+{log.rows_imported}</span>
      <span style={{ color: "#6366f1" }}>↻{log.rows_updated}</span>
      <span style={{ color: "#475569" }}>{log.duration_ms}ms</span>
      <span style={{ color: "#ef4444", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {log.error || ""}
      </span>
    </div>
  );
}

function RealtimeWidget({ data }) {
  if (!data) return null;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10, marginBottom: 20,
    }}>
      <div style={{
        background: "#13131f", border: "1px solid #10b98130",
        borderRadius: 10, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Jetzt aktiv
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>
          {data.active_users}
        </div>
        <div style={{ fontSize: 11, color: "#475569" }}>Nutzer gerade online</div>
      </div>
      <div style={{
        background: "#13131f", border: "1px solid #6366f130",
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Pageviews (30 Min)
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#6366f1" }}>
          {data.pageviews_last_30min}
        </div>
      </div>
      <div style={{
        background: "#13131f", border: "1px solid #1e1e2e",
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Top Länder
        </div>
        {data.top_countries?.slice(0, 3).map((c, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>
            <span>{c.country}</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{c.users}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GA4Setup() {
  const { authHeader } = useAuth();

  const [status, setStatus]       = useState(null);
  const [history, setHistory]     = useState([]);
  const [realtime, setRealtime]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [importing, setImporting] = useState(false);
  const [testing, setTesting]     = useState(false);
  const [tab, setTab]             = useState("setup");
  const [msg, setMsg]             = useState("");
  const [err, setErr]             = useState("");

  const [propertyId, setPropertyId] = useState("");
  const [autoImport, setAutoImport] = useState(true);
  const [importHour, setImportHour] = useState(6);
  const [importDays, setImportDays] = useState(7);

  const [backfillDays, setBackfillDays] = useState(90);
  const [backfilling, setBackfilling]   = useState(false);

  function flash(m, isErr = false) {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(""); setErr(""); }, 5000);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [statusRes, histRes] = await Promise.all([
        fetch("/api/ga4/status",       { headers: authHeader() }),
        fetch("/api/ga4/history?limit=15", { headers: authHeader() }),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatus(d);
        if (d.property_id) setPropertyId(d.property_id);
        if (d.import_hour != null) setImportHour(d.import_hour);
        setAutoImport(d.auto_import ?? true);
      }
      if (histRes.ok) {
        const d = await histRes.json();
        setHistory(d.imports || []);
      }
    } catch {}
    setLoading(false);
  }

  async function loadRealtime() {
    try {
      const res = await fetch("/api/ga4/realtime", { headers: authHeader() });
      if (res.ok) setRealtime(await res.json());
    } catch {}
  }

  async function configure() {
    if (!propertyId.trim()) return flash("Property ID eingeben.", true);
    try {
      const res = await fetch("/api/ga4/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          property_id:   propertyId.trim(),
          auto_import:   autoImport,
          import_hour:   importHour,
          lookback_days: 1,
        }),
      });
      const d = await res.json();
      res.ok ? flash(d.message) : flash(d.detail || "Fehler beim Speichern.", true);
      if (res.ok) loadAll();
    } catch (e) { flash(e.message, true); }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/ga4/test-connection", {
        method: "POST",
        headers: authHeader(),
      });
      const d = await res.json();
      d.success
        ? flash(`✓ ${d.message}`)
        : flash(`✗ ${d.error}`, true);
    } catch (e) { flash(e.message, true); }
    setTesting(false);
  }

  async function manualImport() {
    setImporting(true);
    try {
      const res = await fetch(`/api/ga4/import?days=${importDays}`, {
        method: "POST",
        headers: authHeader(),
      });
      const d = await res.json();
      if (d.success) {
        flash(`✓ Import: ${d.rows_imported} neue Einträge, ${d.rows_updated} aktualisiert (${d.duration_ms}ms)`);
        loadAll();
      } else {
        flash(`Import teilweise fehlgeschlagen: ${(d.errors || []).join(", ")}`, true);
      }
    } catch (e) { flash(e.message, true); }
    setImporting(false);
  }

  async function backfill() {
    setBackfilling(true);
    try {
      const end   = new Date();
      const start = new Date();
      start.setDate(start.getDate() - backfillDays);
      const startStr = start.toISOString().slice(0, 10);
      const endStr   = new Date(end.getTime() - 86400000).toISOString().slice(0, 10);

      const res = await fetch(
        `/api/ga4/import/range?start=${startStr}&end=${endStr}`,
        { method: "POST", headers: authHeader() },
      );
      const d = await res.json();
      if (d.success) {
        flash(`✓ Backfill: ${d.rows_imported} neue Einträge aus ${backfillDays} Tagen`);
        loadAll();
      } else {
        flash(`Backfill Fehler: ${(d.errors || []).join(", ")}`, true);
      }
    } catch (e) { flash(e.message, true); }
    setBackfilling(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (tab === "realtime" && status?.configured) {
      loadRealtime();
      const id = setInterval(loadRealtime, 30000);
      return () => clearInterval(id);
    }
  }, [tab, status?.configured]);

  const inputSt = {
    width: "100%", background: "#0d0d1a",
    border: "1px solid #1e1e2e", borderRadius: 8,
    padding: "9px 12px", color: "#e2e8f0",
    fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 58px)",
      background: "#0a0a14", color: "#e2e8f0",
      fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "28px 32px",
    }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
              Google Analytics 4
            </h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
              Echte Traffic-Daten · Automatischer täglicher Import · Echtzeit
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status?.configured && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#10b98115", border: "1px solid #10b98130",
                borderRadius: 8, padding: "7px 12px",
                fontSize: 11, fontWeight: 600, color: "#10b981",
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                Verbunden
              </div>
            )}
            <button onClick={loadAll} disabled={loading} style={{
              background: "transparent", border: "1px solid #1e1e2e",
              borderRadius: 8, padding: "7px 14px",
              fontSize: 12, color: loading ? "#334155" : "#475569", cursor: "pointer",
            }}>
              ↻
            </button>
          </div>
        </div>

        {/* Flash Messages */}
        {(msg || err) && (
          <div style={{
            background: err ? "#ef444415" : "#10b98115",
            border: `1px solid ${err ? "#ef444430" : "#10b98130"}`,
            borderRadius: 8, padding: "9px 14px",
            fontSize: 12, color: err ? "#ef4444" : "#10b981",
            marginBottom: 14,
          }}>
            {msg || err}
          </div>
        )}

        {/* Status Karten */}
        {status && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Status",         value: status.configured ? "Aktiv" : "Nicht konfiguriert", color: status.configured ? "#10b981" : "#ef4444" },
              { label: "Auto-Import",    value: status.auto_import ? `${status.import_hour}:00 Uhr` : "Deaktiviert", color: status.auto_import ? "#6366f1" : "#475569" },
              { label: "Letzter Import", value: status.last_import ? new Date(status.last_import).toLocaleDateString("de-DE") : "Noch keiner", color: "#f1f5f9" },
              { label: "Imports gesamt", value: status.total_imports, color: "#f1f5f9" },
            ].map(s => (
              <div key={s.label} style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 3,
          background: "#13131f", border: "1px solid #1e1e2e",
          borderRadius: 9, padding: 3, marginBottom: 18, width: "fit-content",
        }}>
          {[
            { key: "setup",    label: "Einrichten"  },
            { key: "import",   label: "Import"      },
            { key: "realtime", label: "⚡ Echtzeit" },
            { key: "history",  label: "Protokoll"   },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "6px 16px", fontSize: 12, fontWeight: 600,
              borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === t.key ? "#6366f1" : "transparent",
              color: tab === t.key ? "#fff" : "#64748b",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Setup ── */}
        {tab === "setup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                Schritt 1 — Property ID
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
                Admin → Property Settings → Property ID (nur die Zahl, z.B. 123456789)
              </div>
              <input
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                placeholder="z.B. 123456789"
                style={{ ...inputSt, marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Auto-Import täglich</span>
                  <div
                    onClick={() => setAutoImport(a => !a)}
                    style={{
                      width: 38, height: 22, borderRadius: 11,
                      background: autoImport ? "#6366f1" : "#1e1e2e",
                      position: "relative", cursor: "pointer", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3,
                      left: autoImport ? 19 : 3,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#fff", transition: "left 0.2s",
                    }} />
                  </div>
                </div>
                {autoImport && (
                  <select value={importHour} onChange={e => setImportHour(Number(e.target.value))} style={{ ...inputSt, width: "auto", marginBottom: 0, padding: "6px 10px" }}>
                    {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                      <option key={h} value={h}>{h.toString().padStart(2,"0")}:00 Uhr</option>
                    ))}
                  </select>
                )}
              </div>
              <button onClick={configure} style={{
                background: "#6366f1", color: "#fff", border: "none",
                borderRadius: 8, padding: "9px 20px", fontSize: 12,
                fontWeight: 600, cursor: "pointer", marginRight: 8,
              }}>
                Konfiguration speichern
              </button>
              <button onClick={testConnection} disabled={testing || !propertyId.trim()} style={{
                background: "transparent", border: "1px solid #1e1e2e",
                borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600,
                color: testing || !propertyId.trim() ? "#334155" : "#6366f1",
                cursor: testing || !propertyId.trim() ? "not-allowed" : "pointer",
              }}>
                {testing ? "Teste..." : "Verbindung testen"}
              </button>
            </div>

            <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                Schritt 2 — Service Account (empfohlen)
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 14, lineHeight: 1.6 }}>
                Für automatischen Import brauchst du einen Service Account:
              </div>
              {[
                "1. console.cloud.google.com → APIs & Services → Credentials",
                "2. 'Create Credentials' → Service Account → Name eingeben",
                "3. Fertig erstellen → auf Service Account klicken → Keys → Add Key → JSON",
                "4. JSON-Datei herunterladen",
                "5. Den kompletten Inhalt in GA4_SERVICE_ACCOUNT_JSON in .env eintragen",
                "6. In Google Analytics: Admin → Property Access Management → Service Account E-Mail als 'Viewer' hinzufügen",
              ].map((step, i) => (
                <div key={i} style={{ fontSize: 12, color: "#64748b", marginBottom: 5, paddingLeft: 4 }}>{step}</div>
              ))}
              <div style={{
                background: "#0d0d1a", borderRadius: 7,
                padding: "9px 12px", marginTop: 10,
                fontFamily: "monospace", fontSize: 11, color: "#818cf8",
              }}>
                GA4_SERVICE_ACCOUNT_JSON={"{"}"type":"service_account","project_id":"...","private_key":"..."{"}"}
              </div>
            </div>

            <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 10 }}>
                Schritt 3 — Python Pakete installieren
              </div>
              <div style={{ background: "#0d0d1a", borderRadius: 7, padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#10b981" }}>
                pip install google-auth google-auth-httplib2
              </div>
            </div>
          </div>
        )}

        {/* ── Import ── */}
        {tab === "import" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 10 }}>
                Manueller Import
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select value={importDays} onChange={e => setImportDays(Number(e.target.value))} style={{ ...inputSt, width: "auto", marginBottom: 0 }}>
                  {[1,3,7,14,30].map(d => <option key={d} value={d}>Letzte {d} Tage</option>)}
                </select>
                <button onClick={manualImport} disabled={importing || !status?.configured} style={{
                  background: importing || !status?.configured ? "#1e1e2e" : "#6366f1",
                  color: importing || !status?.configured ? "#475569" : "#fff",
                  border: "none", borderRadius: 8,
                  padding: "9px 20px", fontSize: 12,
                  fontWeight: 600,
                  cursor: importing || !status?.configured ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}>
                  {importing ? "Importiere..." : "Jetzt importieren"}
                </button>
              </div>
            </div>

            <div style={{ background: "#13131f", border: "1px solid #f59e0b20", borderRadius: 12, padding: "18px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                Historischer Import
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
                Einmalig die letzten Monate importieren — danach hat die KI eine echte Datenbasis.
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select value={backfillDays} onChange={e => setBackfillDays(Number(e.target.value))} style={{ ...inputSt, width: "auto", marginBottom: 0 }}>
                  {[30,60,90,180,365].map(d => (
                    <option key={d} value={d}>Letzte {d} Tage ({Math.round(d/30)} Monate)</option>
                  ))}
                </select>
                <button onClick={backfill} disabled={backfilling || !status?.configured} style={{
                  background: backfilling || !status?.configured ? "#1e1e2e" : "#f59e0b",
                  color: backfilling || !status?.configured ? "#475569" : "#fff",
                  border: "none", borderRadius: 8,
                  padding: "9px 20px", fontSize: 12,
                  fontWeight: 600,
                  cursor: backfilling || !status?.configured ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}>
                  {backfilling ? "Importiere..." : "Historisch importieren"}
                </button>
              </div>
              {backfilling && (
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 10 }}>
                  Läuft... Das kann einige Minuten dauern je nach Datenmenge.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Echtzeit ── */}
        {tab === "realtime" && (
          <>
            {!status?.configured ? (
              <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "32px", textAlign: "center", color: "#475569", fontSize: 13 }}>
                GA4 zuerst konfigurieren (Tab "Einrichten")
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
                  Aktualisiert automatisch alle 30 Sekunden
                </div>
                <RealtimeWidget data={realtime} />
                {!realtime && (
                  <div style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: 13 }}>
                    Echtzeit-Daten werden geladen...
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Protokoll ── */}
        {tab === "history" && (
          <div style={{ background: "#13131f", border: "1px solid #1e1e2e", borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 80px 70px 70px 70px 1fr",
              gap: 10, padding: "8px 16px",
              background: "#0d0d1a", borderBottom: "1px solid #1e1e2e",
              fontSize: 10, fontWeight: 700, color: "#475569",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <span>Datum</span><span>Status</span><span>Neu</span>
              <span>Upd.</span><span>Zeit</span><span>Fehler</span>
            </div>
            {history.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#334155", fontSize: 13 }}>
                Noch keine Imports — starte mit dem Tab "Import"
              </div>
            ) : (
              history.map((log, i) => <ImportHistoryRow key={i} log={log} />)
            )}
          </div>
        )}

      </div>
    </div>
  );
}
