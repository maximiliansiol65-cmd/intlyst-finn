import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";
import ReferralTab from "../components/ReferralTab";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "personalisierung",    label: "Personalisierung"    },
  { key: "konto",              label: "Konto"              },
  { key: "team",               label: "Team"               },
  { key: "benachrichtigungen", label: "Benachrichtigungen" },
  { key: "sprache",            label: "Sprache"            },
  { key: "abonnement",         label: "Abonnement"         },
  { key: "governance",         label: "Governance"         },
  { key:   "referral", label: "Freunde einladen", icon: "🎁", group: "Abo & Zahlung" },
];
import PersonalizedDashboard from "./PersonalizedDashboard";
import { ALL_TABS, PLAN_DEFAULTS, MAX_TABS, STORAGE_KEY, getTabsForPlan, saveTabsForPlan } from "../components/layout/BottomTabBar";
import { usePlan } from "../contexts/PlanContext";

// ── Schnelleiste-Editor ───────────────────────────────────────────────────────
function SchnelleisteEditor() {
  const toast = useToast();
  const { plan } = usePlan();
  const [selected, setSelected] = useState(() => getTabsForPlan(plan));

  // Plan wechselt → Editor aktualisieren
  useEffect(() => {
    setSelected(getTabsForPlan(plan));
  }, [plan]);

  function toggle(id) {
    setSelected(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter(x => x !== id);
      }
      if (prev.length >= MAX_TABS) {
        toast.error(`Maximal ${MAX_TABS} Tabs erlaubt.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function save() {
    saveTabsForPlan(plan, selected);
    toast.success("Schnelleiste gespeichert!");
  }

  function reset() {
    const defaults = PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS.trial;
    setSelected(defaults);
    saveTabsForPlan(plan, defaults);
    toast.success("Auf Grundeinstellungen zurückgesetzt.");
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--s-4)" }}>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", margin: "0 0 var(--s-3)" }}>
          Wähle bis zu <strong>{MAX_TABS}</strong> Tabs für deine Schnelleiste.
          Aktuell ausgewählt: <strong>{selected.length} / {MAX_TABS}</strong>
        </p>
        {/* Vorschau — simuliert die weiße Schnelleiste */}
        <div style={{ marginBottom: "var(--s-2)", fontSize: "var(--text-xs)", color: "var(--c-text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Vorschau</div>
        <div style={{
          display: "flex", justifyContent: "space-around", alignItems: "center",
          background: "#fff", border: "1px solid #e5e5e5", borderRadius: "var(--r-md)",
          padding: "10px 8px 8px", marginBottom: "var(--s-5)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        }}>
          {selected.map(id => {
            const tab = ALL_TABS.find(t => t.id === id);
            if (!tab) return null;
            const { Icon, label } = tab;
            return (
              <div key={id} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 3, flex: 1, color: "#000",
              }}>
                <Icon />
                <span style={{ fontSize: 10, fontWeight: 400, color: "#555" }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggle-Liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
        {ALL_TABS.map(({ id, label, Icon }) => {
          const active = selected.includes(id);
          const disabled = !active && selected.length >= MAX_TABS;
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              disabled={disabled}
              style={{
                display: "flex", alignItems: "center", gap: "var(--s-3)",
                padding: "var(--s-3) var(--s-4)",
                background: active ? "var(--c-surface-2)" : "var(--c-surface)",
                border: `1.5px solid ${active ? "var(--c-primary)" : "var(--c-border)"}`,
                borderRadius: "var(--r-md)", cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1, textAlign: "left", fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ color: active ? "var(--c-primary)" : "var(--c-text-3)" }}><Icon /></span>
              <span style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: active ? 500 : 400, color: "var(--c-text)" }}>{label}</span>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                background: active ? "var(--c-primary)" : "transparent",
                border: `2px solid ${active ? "var(--c-primary)" : "var(--c-border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {active && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "var(--s-3)" }}>
        <button className="btn btn-primary btn-md" onClick={save}>Speichern</button>
        <button className="btn btn-ghost btn-md" onClick={reset}>Grundeinstellungen</button>
      </div>
    </div>
  );
}

const PLAN_META = {
  trial:         { label: "Trial",         badge: "badge-neutral" },
  standard:      { label: "Standard",      badge: "badge-info"    },
  team_standard: { label: "Team Standard", badge: "badge-success" },
  team_pro:      { label: "Team Pro",      badge: "badge-warning" },
};

const INTEGRATION_LABELS = {
  google_analytics: "Google Analytics 4",
  shopify:          "Shopify",
  woocommerce:      "WooCommerce",
  stripe:           "Stripe",
  klaviyo:          "Klaviyo",
  facebook_ads:     "Facebook Ads",
};

// ── Sub-pages ─────────────────────────────────────────────────────────────────

function KontoTab({ user, authHeader, logout }) {
  const toast = useToast();
  const { t } = useLanguage();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleEraseAccount() {
    if (deleteConfirm !== "KONTO LÖSCHEN" || !deletePassword) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/erase-account", {
        method: "DELETE",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword, confirm_text: deleteConfirm }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Fehler beim Löschen des Kontos.");
        return;
      }
      toast.success("Konto erfolgreich gelöscht. Du wirst abgemeldet.");
      setTimeout(() => logout(), 1500);
    } catch {
      toast.error("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setDeleting(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('profileSaved'));
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPw !== confirmPw) { toast.error("Passwörter stimmen nicht überein."); return; }
    if (newPw.length < 8) { toast.error("Mindestens 8 Zeichen."); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      if (!res.ok) throw new Error();
      toast.success("Passwort geändert.");
      setOldPw(""); setNewPw(""); setConfirmPw("");
    } catch {
      toast.error("Passwortänderung fehlgeschlagen.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>

      {/* Profile */}
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-5)" }}>Profil</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" />
          </div>
          <div className="form-group">
            <label className="form-label">E-Mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" />
          </div>
          <button className="btn btn-primary btn-md" onClick={saveProfile} disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-5)" }}>Passwort ändern</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          <div className="form-group">
            <label className="form-label">Aktuelles Passwort</label>
            <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Neues Passwort</label>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Passwort bestätigen</label>
            <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-md" onClick={changePassword} disabled={pwSaving || !oldPw || !newPw || !confirmPw} style={{ alignSelf: "flex-start" }}>
            {pwSaving ? "Ändern…" : "Passwort ändern"}
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-2)" }}>Abmelden</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: "var(--s-4)" }}>
          Du wirst abgemeldet, dein Konto bleibt erhalten.
        </p>
        <button className="btn btn-secondary btn-sm" onClick={logout}>Abmelden</button>
      </div>

      {/* GDPR / Danger zone */}
      <div className="card" style={{ padding: "var(--s-6)", borderLeft: "3px solid var(--c-danger)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-2)", color: "var(--c-danger)" }}>
          Datenschutz & Kontolöschung (DSGVO Art. 17)
        </div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: "var(--s-4)", lineHeight: 1.6 }}>
          Gemäß DSGVO Art. 17 hast du das Recht auf Löschung deiner personenbezogenen Daten.
          Das Anonymisieren deines Kontos ist <strong>permanent und kann nicht rückgängig gemacht werden</strong>.
          Alle persönlichen Daten (Name, E-Mail, Unternehmen) werden unwiderruflich gelöscht.
        </p>
        {!showDelete ? (
          <button className="btn btn-danger btn-sm" onClick={() => setShowDelete(true)}>
            Konto löschen (DSGVO Art. 17)
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--c-danger)", fontWeight: 600 }}>
              ⚠️ Diese Aktion ist nicht rückgängig zu machen.
            </p>
            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", display: "block", marginBottom: 4 }}>
                Aktuelles Passwort zur Bestätigung
              </label>
              <input
                className="input"
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Dein Passwort"
              />
            </div>
            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", display: "block", marginBottom: 4 }}>
                Tippe <strong>KONTO LÖSCHEN</strong> zur Bestätigung
              </label>
              <input
                className="input"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="KONTO LÖSCHEN"
              />
            </div>
            <div style={{ display: "flex", gap: "var(--s-3)" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); setDeletePassword(""); }}
              >Abbrechen</button>
              <button
                className="btn btn-danger btn-sm"
                disabled={deleteConfirm !== "KONTO LÖSCHEN" || !deletePassword || deleting}
                onClick={handleEraseAccount}
              >
                {deleting ? "Wird gelöscht..." : "Endgültig löschen"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamTab({ authHeader }) {
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  function buildAuthHeaders({ includeWorkspace = true } = {}) {
    const headers = { ...authHeader() };
    if (!includeWorkspace) {
      delete headers["X-Workspace-ID"];
    }
    return headers;
  }

  async function fetchWithWorkspaceFallback(url, options = {}) {
    const firstHeaders = { ...buildAuthHeaders(), ...(options.headers || {}) };
    let response = await fetch(url, { ...options, headers: firstHeaders });

    if (!response.ok && firstHeaders["X-Workspace-ID"]) {
      const fallbackHeaders = { ...buildAuthHeaders({ includeWorkspace: false }), ...(options.headers || {}) };
      response = await fetch(url, { ...options, headers: fallbackHeaders });
    }

    return response;
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/team/members");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : data.members ?? []);
    } catch {
      toast.error("Team konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function inviteMember() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Einladung an ${inviteEmail} gesendet.`);
      setInviteEmail("");
      fetchMembers();
    } catch {
      toast.error("Einladung fehlgeschlagen.");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(id) {
    setRemovingId(id);
    try {
      const res = await fetchWithWorkspaceFallback(`/api/team/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Mitglied entfernt.");
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error("Entfernen fehlgeschlagen.");
    } finally {
      setRemovingId(null);
    }
  }

  const ROLE_LABELS = { admin: "Admin", manager: "Manager", member: "Mitglied", owner: "Inhaber" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Mitglied einladen</div>
        <div className="flex gap-3">
          <input
            className="input" type="email" value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && inviteMember()}
            placeholder="name@beispiel.de" style={{ flex: 1 }}
          />
          <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ maxWidth: 140 }}>
            <option value="member">Mitglied</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-primary btn-md" onClick={inviteMember} disabled={!inviteEmail || inviting}>
            {inviting ? "Sende…" : "Einladen"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Teammitglieder</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                  <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--s-8) 0" }}>
            <div className="empty-icon">👥</div>
            <div className="empty-title">Noch keine Mitglieder</div>
            <div className="empty-text">Lade dein Team ein um zusammenzuarbeiten.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m, idx) => (
              <div key={m.id ?? idx}>
                {idx > 0 && <div className="divider" />}
                <div className="flex items-center gap-3" style={{ padding: "var(--s-3) 0" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "var(--c-primary-light)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-primary)", flexShrink: 0,
                  }}>
                    {(m.name ?? m.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name ?? m.email}
                    </div>
                    {m.name && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{m.email}</div>
                    )}
                  </div>
                  <span className="badge badge-sm badge-neutral">{ROLE_LABELS[m.role] ?? m.role ?? "Mitglied"}</span>
                  {m.role !== "owner" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--c-danger)", padding: "4px 8px" }}
                      disabled={removingId === m.id}
                      onClick={() => removeMember(m.id)}
                    >
                      {removingId === m.id ? "…" : "Entfernen"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DatenquellenTab({ authHeader }) {
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/connections", { headers: authHeader() });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConnections(Array.isArray(data) ? data : data.connections ?? []);
      } catch {
        toast.error("Datenquellen konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authHeader, toast]);

  async function toggleConnection(id, enabled) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error();
      setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)));
      toast.success(!enabled ? "Verbindung aktiviert." : "Verbindung deaktiviert.");
    } catch {
      toast.error("Änderung fehlgeschlagen.");
    } finally {
      setTogglingId(null);
    }
  }

  const STATUS_BADGE = {
    connected:    { label: "Verbunden",  cls: "badge-success" },
    disconnected: { label: "Getrennt",   cls: "badge-neutral" },
    error:        { label: "Fehler",     cls: "badge-danger"  },
    pending:      { label: "Ausstehend", cls: "badge-warning" },
  };

  const ICONS = {
    google_analytics: "📊", shopify: "🛍️", woocommerce: "🛒",
    stripe: "💳", klaviyo: "📧", facebook_ads: "📣",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Verbundene Quellen</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "var(--r-md)" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                  <div className="skeleton skeleton-text" style={{ width: "30%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "50%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--s-8) 0" }}>
            <div className="empty-icon">🔌</div>
            <div className="empty-title">Keine Datenquellen</div>
            <div className="empty-text">Verbinde eine Datenquelle um mit der Analyse zu starten.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {connections.map((c, idx) => {
              const meta = STATUS_BADGE[c.status] ?? { label: c.status ?? "Unbekannt", cls: "badge-neutral" };
              return (
                <div key={c.id ?? idx}>
                  {idx > 0 && <div className="divider" />}
                  <div className="flex items-center gap-3" style={{ padding: "var(--s-4) 0" }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "var(--r-md)",
                      background: "var(--c-surface-2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {ICONS[c.type] ?? "🔗"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>
                        {INTEGRATION_LABELS[c.type] ?? c.name ?? c.type ?? "Integration"}
                      </div>
                      {c.account && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.account}
                        </div>
                      )}
                    </div>
                    <span className={`badge badge-sm ${meta.cls}`}>{meta.label}</span>
                    <label className="toggle" title={c.enabled ? "Deaktivieren" : "Aktivieren"}>
                      <input type="checkbox" checked={!!c.enabled} onChange={() => toggleConnection(c.id, c.enabled)} disabled={togglingId === c.id} />
                      <span className="toggle-track"><span className="toggle-thumb" /></span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-5)", borderLeft: "3px solid var(--c-primary)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-primary)", marginBottom: "var(--s-2)" }}>
          Neue Integration hinzufügen
        </div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.65 }}>
          Weitere Integrationen können über den INTLYST Partner-Connector eingerichtet werden.
          Kontaktiere <span style={{ color: "var(--c-primary)" }}>support@intlyst.com</span> für individuelle Anbindungen.
        </p>
      </div>
    </div>
  );
}

function BenachrichtigungenTab({ authHeader }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const EMAIL_ITEMS = [
    { key: "alerts",          label: "Kritische Alerts",          sub: "Sofort bei neuen kritischen Ereignissen" },
    { key: "goals",           label: "Ziel-Fortschritt",          sub: "Wenn Ziele erreicht oder gefährdet sind" },
    { key: "recommendations", label: "Empfehlungen",              sub: "Neue KI-Handlungsempfehlungen" },
    { key: "anomalies",       label: "Anomalie-Erkennung",        sub: "Ungewöhnliche Datenmuster" },
    { key: "weekly_summary",  label: "Wöchentliche Zusammenfassung", sub: "Jeden Montag um 07:00 Uhr" },
    { key: "reports",         label: "Tägliche Reports",          sub: "Täglich um 07:00 Uhr" },
  ];

  useEffect(() => {
    fetch("/api/email-preferences", { headers: authHeader() })
      .then(r => r.json())
      .then(data => setPrefs(data))
      .catch(() => setPrefs({ enabled: true, alerts: true, goals: true, recommendations: true, anomalies: true, weekly_summary: true, reports: false }))
      .finally(() => setLoading(false));
  }, []);

  async function savePrefs() {
    setSaving(true);
    try {
      const res = await fetch("/api/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      toast.success("E-Mail-Einstellungen gespeichert.");
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  }

  if (loading || !prefs) {
    return <div className="card" style={{ padding: "var(--s-6)", color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Wird geladen…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>

      {/* Master switch */}
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--c-text)" }}>E-Mail-Benachrichtigungen</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: "var(--s-1)" }}>
              Alle E-Mail-Benachrichtigungen aktivieren oder deaktivieren
            </div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={!!prefs.enabled} onChange={() => toggle("enabled")} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </div>

      {/* Per-type settings */}
      <div className="card" style={{ padding: "var(--s-6)", opacity: prefs.enabled ? 1 : 0.45, transition: "opacity 0.2s ease", pointerEvents: prefs.enabled ? "auto" : "none" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Benachrichtigungsarten</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {EMAIL_ITEMS.map((item, idx) => (
            <div key={item.key}>
              {idx > 0 && <div className="divider" />}
              <div className="flex items-center justify-between" style={{ padding: "var(--s-3) 0" }}>
                <div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--c-text)" }}>{item.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: "var(--s-1)" }}>{item.sub}</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={!!prefs[item.key]} onChange={() => toggle(item.key)} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
        <button className="btn btn-primary btn-md" onClick={savePrefs} disabled={saving}>
          {saving ? "Speichern…" : "Einstellungen speichern"}
        </button>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          E-Mails werden an deine Konto-E-Mail-Adresse gesendet.
        </span>
      </div>
    </div>
  );
}

function SpracheTab() {
  const { language, setLanguage, t } = useLanguage();

  const languages = [
    { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
    { code: 'en', name: 'English',    flag: '🇬🇧' },
    { code: 'es', name: 'Español',    flag: '🇪🇸' },
    { code: 'fr', name: 'Français',   flag: '🇫🇷' },
    { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
    { code: 'pt', name: 'Português',  flag: '🇵🇹' },
    { code: 'zh', name: '中文',        flag: '🇨🇳' },
    { code: 'ru', name: 'Русский',    flag: '🇷🇺' },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      <div>
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--s-2)", color: "var(--c-text)" }}>
          Sprache wählen
        </h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: "var(--s-4)" }}>
          Wähle deine bevorzugte Sprache für die Benutzeroberfläche.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--s-3)" }}>
          {languages.map(lang => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              style={{
                padding: "var(--s-3) var(--s-4)",
                border: language === lang.code ? "2px solid #000" : "1px solid var(--c-border)",
                borderRadius: "var(--r-md)",
                background: language === lang.code ? "#f5f5f5" : "var(--c-surface)",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--s-2)",
              }}
            >
              <span style={{ fontSize: "32px" }}>{lang.flag}</span>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--c-text)" }}>
                {lang.name}
              </span>
              {language === lang.code && (
                <span style={{ fontSize: "12px", color: "#000", fontWeight: 700 }}>✓ Aktiv</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: "var(--s-3)", borderTop: "1px solid var(--c-border)" }}>
        <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--s-2)", color: "var(--c-text)" }}>
          Sprachpräferenzen
        </h4>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Deine Spracheinstellung wird automatisch gespeichert und beim nächsten Login wiederhergestellt.
        </p>
      </div>
    </div>
  );
}

const PLAN_DEFINITIONS = [
  { key: "trial",         label: "Trial",         price: "0 €",   per: "/ Monat", color: "#888",    features: ["Dashboard & KPIs", "Tasks (nur lesen)", "Einstellungen"],                                                               lockedRoutes: ["/analyse","/wachstum","/kunden","/standort","/market","/abtests","/alerts","/reports"] },
  { key: "standard",      label: "Standard",      price: "29 €",  per: "/ Monat", color: "#000",    features: ["Dashboard & KPIs", "Tasks & Ziele", "Alerts", "Reports", "5 Integrationen"],                                           lockedRoutes: ["/analyse","/wachstum","/kunden","/standort","/market","/abtests"] },
  { key: "team_standard", label: "Team Standard", price: "79 €",  per: "/ Monat", color: "#0071E3", features: ["Alles in Standard", "Analyse & Wachstum", "Kunden & Standort", "Markt & Trends", "5 Team-Mitglieder"], highlighted: true, lockedRoutes: ["/abtests"] },
  { key: "team_pro",      label: "Team Pro",      price: "129 €", per: "/ Monat", color: "#AF52DE", features: ["Alles in Team Standard", "A/B Tests", "Alle Integrationen", "Unbegrenzte Mitglieder", "Priority Support"],             lockedRoutes: [] },
];

const TAB_ALIASES = {
  account: "konto",
  language: "sprache",
  notifications: "benachrichtigungen",
  personalization: "personalisierung",
  subscription: "abonnement",
};

function AbonnementTab({ authHeader }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [switching, setSwitching] = useState(null);
  const toast = useToast();

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces/current", { headers: authHeader() });
      if (!res.ok) throw new Error();
      setWorkspace(await res.json());
    } catch { setWorkspace(null); }
    finally { setLoading(false); }
  }, [authHeader]);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  const plan = workspace?.subscription?.plan ?? workspace?.plan ?? "trial";
  const planMeta  = PLAN_META[plan] ?? { label: plan, badge: "badge-neutral" };
  const currentDef = PLAN_DEFINITIONS.find(p => p.key === plan);

  async function handleSwitch(planKey) {
    if (planKey === plan) return;
    setSwitching(planKey);
    try {
      const res = await fetch("/api/billing/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ plan: planKey }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(`Plan gewechselt zu ${data.plan_name}!`);
      await fetchWorkspace();
      window.dispatchEvent(new Event("intlyst-plan-changed"));
    } catch (e) { toast.error(`Fehler: ${e.message || "Plan konnte nicht gewechselt werden."}`); }
    finally { setSwitching(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      {/* Aktueller Plan Banner */}
      <div className="card" style={{ padding: "var(--s-5)", borderLeft: `4px solid ${currentDef?.color ?? "#888"}` }}>
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>Aktueller Plan</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            <div className="skeleton skeleton-text" style={{ width: "30%" }} />
            <div className="skeleton skeleton-text" style={{ width: "50%" }} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>{planMeta.label}</span>
            <span className={`badge badge-sm ${planMeta.badge}`}>{workspace?.name ?? "Mein Workspace"}</span>
            {currentDef && <span style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{currentDef.price} {currentDef.per}</span>}
          </div>
        )}
        {currentDef && currentDef.lockedRoutes.length > 0 && (
          <div style={{ marginTop: "var(--s-3)", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
            🔒 Gesperrt: {currentDef.lockedRoutes.map(r => r.replace("/","")).join(", ")}
          </div>
        )}
      </div>

      {/* Plan-Karten */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--s-4)" }}>
        {PLAN_DEFINITIONS.filter(p => p.key !== "trial").map((p) => {
          const isCurrent  = plan === p.key;
          const isLoading  = switching === p.key;
          const currentIdx = PLAN_DEFINITIONS.findIndex(x => x.key === plan);
          const targetIdx  = PLAN_DEFINITIONS.findIndex(x => x.key === p.key);
          const btnLabel   = isLoading ? "Wechsle…" : targetIdx > currentIdx ? "Upgraden" : "Downgraden";
          return (
            <div key={p.key} className="card" style={{ padding: "var(--s-5)", borderTop: p.highlighted ? `3px solid ${p.color}` : undefined, outline: isCurrent ? `2px solid ${p.color}` : undefined }}>
              {p.highlighted && <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--s-2)" }}>Beliebteste Wahl</div>}
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)", marginBottom: "var(--s-1)" }}>{p.label}</div>
              <div style={{ marginBottom: "var(--s-4)" }}>
                <span style={{ fontSize: "var(--text-title)", fontWeight: 700, color: "var(--c-text)" }}>{p.price}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}> {p.per}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--s-5) 0", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                {p.features.map(f => (
                  <li key={f} style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", display: "flex", alignItems: "flex-start", gap: "var(--s-2)" }}>
                    <span style={{ color: "var(--c-success)", fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div style={{ textAlign: "center", padding: "8px 0", fontSize: "var(--text-sm)", color: p.color, fontWeight: 600, border: `1.5px solid ${p.color}`, borderRadius: "var(--r-sm)" }}>✓ Aktiver Plan</div>
              ) : (
                <button onClick={() => handleSwitch(p.key)} disabled={!!switching}
                  style={{ width: "100%", padding: "8px 0", borderRadius: "var(--r-sm)", background: p.highlighted ? p.color : "transparent", color: p.highlighted ? "#fff" : "var(--c-text)", border: `1.5px solid ${p.highlighted ? p.color : "var(--c-border-2)"}`, fontWeight: 600, fontSize: "var(--text-sm)", cursor: switching ? "wait" : "pointer", opacity: switching && !isLoading ? 0.5 : 1 }}>
                  {btnLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GovernanceTab({ authHeader }) {
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/approval-policy", { headers: authHeader() })
      .then((r) => r.json())
      .then((data) => setPolicy(data))
      .catch(() => setPolicy(null));
  }, [authHeader]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/approval-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(policy),
      });
      if (!res.ok) throw new Error();
      setPolicy(await res.json());
      toast.success("Approval-Policy gespeichert.");
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return <div className="card" style={{ padding: "var(--s-6)", color: "var(--c-text-3)" }}>Governance lädt…</div>;
  }

  function update(key, value) {
    setPolicy((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Approval Policy</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)" }}>
          <div><label className="form-label">Low Risk Max</label><input className="input" type="number" value={policy.low_risk_max} onChange={(e) => update("low_risk_max", Number(e.target.value))} /></div>
          <div><label className="form-label">Medium Risk Max</label><input className="input" type="number" value={policy.medium_risk_max} onChange={(e) => update("medium_risk_max", Number(e.target.value))} /></div>
          <div><label className="form-label">High Impact Threshold</label><input className="input" type="number" value={policy.high_impact_threshold} onChange={(e) => update("high_impact_threshold", Number(e.target.value))} /></div>
          <div><label className="form-label">Critical Impact Threshold</label><input className="input" type="number" value={policy.critical_impact_threshold} onChange={(e) => update("critical_impact_threshold", Number(e.target.value))} /></div>
          <div><label className="form-label">Role for Low Risk</label><select className="input" value={policy.low_risk_required_role} onChange={(e) => update("low_risk_required_role", e.target.value)}><option value="manager">Manager</option><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
          <div><label className="form-label">Role for Medium Risk</label><select className="input" value={policy.medium_risk_required_role} onChange={(e) => update("medium_risk_required_role", e.target.value)}><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
          <div><label className="form-label">Role for High Risk</label><select className="input" value={policy.high_risk_required_role} onChange={(e) => update("high_risk_required_role", e.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option></select></div>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Execution Defaults</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          <label className="flex items-center gap-3"><input type="checkbox" checked={!!policy.require_dual_review} onChange={(e) => update("require_dual_review", e.target.checked)} /> Dual Review bei kritischen Aktionen verlangen</label>
          <label className="flex items-center gap-3"><input type="checkbox" checked={!!policy.auto_execute_on_approval} onChange={(e) => update("auto_execute_on_approval", e.target.checked)} /> Nach Freigabe automatisch ausführen</label>
        </div>
      </div>

      <div>
        <button className="btn btn-primary btn-md" onClick={save} disabled={saving}>{saving ? "Speichern…" : "Governance speichern"}</button>
      </div>
    </div>
  );
}

// ── Main Settings ─────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, authHeader, logout } = useAuth();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("konto");
  const [dashboardCustomizationOpen, setDashboardCustomizationOpen] = useState(false);
  const [coreMode, setCoreMode] = useState(() => localStorage.getItem("intlyst_core_mode") === "1");

  const TABS_DYNAMIC = [
    { key: "personalisierung",    label: "Personalisierung"       },
    { key: "konto",               label: t('account')             },
    { key: "team",                label: t('team')                },
    { key: "benachrichtigungen",  label: t('notifications')       },
    { key: "sprache",             label: t('language')            },
    { key: "abonnement",          label: t('subscription')        },
    { key: "governance",          label: "Governance"             },
    { key: "referral",            label: "🎁 Freunde einladen"    },
  ];
  const validTabKeys = TABS_DYNAMIC.map((tab) => tab.key);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const resolvedTab = TAB_ALIASES[requestedTab] ?? requestedTab;
    if (resolvedTab && validTabKeys.includes(resolvedTab)) {
      setActiveTab(resolvedTab);
    }
  }, [searchParams, validTabKeys]);

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "konto") nextParams.delete("tab");
    else nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
  }

  function restartTour() {
    localStorage.removeItem("intlyst_tour_done");
    navigate("/?tour=1");
  }

  function resetTips() {
    ["kpi_basics", "alerts_basics", "recommendations_basics"].forEach((key) => {
      localStorage.removeItem(`intlyst_tip_${key}`);
    });
    navigate("/?tour=1");
  }

  function toggleCoreMode(next) {
    const value = next ? "1" : "0";
    localStorage.setItem("intlyst_core_mode", value);
    setCoreMode(next);
    window.dispatchEvent(new Event("intlyst-core-mode-changed"));
  }

  return (
    <div
      className="page-enter"
      style={{
        background: "var(--c-bg)",
        minHeight: "calc(100dvh - var(--nav-height))",
        padding: "var(--s-8)",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--s-6)" }}>
        <div className="page-title">Einstellungen</div>
        <div className="page-subtitle">Verwalte dein Konto und deine Präferenzen</div>
      </div>

      <div className="tabs-underline" style={{ marginBottom: "var(--s-6)" }}>
        {TABS_DYNAMIC.map((t) => (
          <button
            key={t.key}
            className={`tab-underline${activeTab === t.key ? " active" : ""}`}
            onClick={() => handleTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div key={activeTab} className="page-enter">
        {activeTab === "personalisierung" && (
          <div>
            <h2 className="section-title" style={{ marginBottom: 24 }}>Personalisierung</h2>
            <div className="card" style={{ marginBottom: "var(--s-7)", overflow: "hidden" }}>
              <button
                onClick={() => setDashboardCustomizationOpen((prev) => !prev)}
                aria-expanded={dashboardCustomizationOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--s-4)",
                  padding: "var(--s-5)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--c-text)", margin: "0 0 var(--s-2)" }}>
                    Schnelleiste anpassen
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: 0 }}>
                    Lege fest, welche 5 Tabs unten in der Schnelleiste erscheinen.
                  </p>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{
                    color: "var(--c-text-3)",
                    flexShrink: 0,
                    transform: dashboardCustomizationOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {dashboardCustomizationOpen && (
                <div style={{ padding: "0 var(--s-5) var(--s-5)" }}>
                  <SchnelleisteEditor />
                </div>
              )}
            </div>

            <div className="card" style={{ padding: "var(--s-5)", marginBottom: "var(--s-7)", display: "grid", gap: "var(--s-3)" }}>
              <div>
                <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--c-text)", margin: "0 0 var(--s-2)" }}>
                  Onboarding & Tutorials
                </h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: 0 }}>
                  Starte die geführte Tour erneut oder rufe einzelne Module ab.
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={restartTour}>Tour neu starten</button>
                <button className="btn btn-ghost btn-sm" onClick={resetTips}>Hinweise zurücksetzen</button>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>KPI-Guide</button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/alerts")}>Alerts verstehen</button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/ceo")}>Empfehlungen</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-3)" }}>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                  Kernmodus: {coreMode ? "Aktiv (nur wichtigste Bereiche)" : "Aus (alle Funktionen sichtbar)"}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleCoreMode(!coreMode)}>
                  {coreMode ? "Alle Funktionen freischalten" : "Kernmodus aktivieren"}
                </button>
              </div>
            </div>
            <div className="divider" style={{ margin: "var(--s-6) 0" }} />
            <PersonalizedDashboard />
          </div>
        )}
        {activeTab === "konto"              && <KontoTab user={user} authHeader={authHeader} logout={logout} />}
        {activeTab === "team"               && <TeamTab authHeader={authHeader} />}
        {activeTab === "benachrichtigungen" && <BenachrichtigungenTab authHeader={authHeader} />}
        {activeTab === "sprache"            && <SpracheTab />}
        {activeTab === "abonnement"         && <AbonnementTab authHeader={authHeader} />}
        {activeTab === "governance"         && <GovernanceTab authHeader={authHeader} />}
        {activeTab === "referral" && (
          <div>
            <h2 className="section-title" style={{ marginBottom: 8 }}>Freunde einladen</h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginBottom: 24 }}>
              Lade Freunde ein und erhaltet beide gratis Monate dazu.
            </p>
            <ReferralTab />
          </div>
        )}
      </div>
    </div>
  );
}
