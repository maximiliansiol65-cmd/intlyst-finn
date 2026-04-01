/* eslint-disable */
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useCompanyProfile } from "../../contexts/CompanyProfileContext";

/* ── Icons ─────────────────────────────────────────────────────────────────── */
const IcoHome = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M6 15v-4h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);
const IcoChart = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 12l3.5-3.5 3 3 5.5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoRocket = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M9.5 2C9.5 2 13 3.5 13 8c0 2-1.5 3.5-3 4.5L8 14l-2-1.5C4.5 11.5 3 10 3 8c0-4.5 3.5-6 3.5-6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <circle cx="8" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IcoPeople = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M11.5 7a1.5 1.5 0 110-3M13.5 14c0-2-1-3.6-2.5-4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IcoPin = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1C5.8 1 4 2.8 4 5c0 3 4 9 4 9s4-6 4-9c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="8" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 9l4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoBell = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1.5A4.5 4.5 0 003.5 6v3l-1 2h11l-1-2V6A4.5 4.5 0 008 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IcoFlask = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 2v5L2 13h12L10 7V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 2h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IcoGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 8h12M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IcoGear = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.5 1.5M11.4 11.4l1.5 1.5M11.4 4.6l-1.5 1.5M4.6 11.4l-1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IcoBellLg = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M9 1.5A5 5 0 004 6.5v3l-1.5 2.5h13L14 9.5v-3A5 5 0 009 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M7 15.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoReport = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M5 4h6M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

// Desktop-Navigation folgt den 6 Management-Bereichen
const NAV_LINKS_BASE = [
  { to: "/",             labelKey: "Entscheidungen", Icon: IcoHome,   end: true },
  { to: "/analyse",      labelKey: "Analyse",        Icon: IcoChart },
  { to: "/command",      labelKey: "Priorisierung",  Icon: IcoFlask },
  { to: "/ceo",          labelKey: "Beratung",       Icon: IcoRocket },
  { to: "/tasks",        labelKey: "Aufgaben",       Icon: IcoCheck },
  { to: "/review-audit", labelKey: "Review",         Icon: IcoReport },
];

export default function TopNav({ onAiClick }) {
  const { user, authHeader, activeWorkspaceId, setActiveWorkspace } = useAuth();
  const { t } = useLanguage();
  const { profile } = useCompanyProfile();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [alertCount, setAlertCount] = useState(0);

  const NAV_LINKS = NAV_LINKS_BASE.map(link => ({
    ...link,
    label: t?.(link.labelKey) || link.labelKey,
  }));

  useEffect(() => {
    loadWorkspaces();
    loadAlertCount();
  }, [activeWorkspaceId]); // eslint-disable-line

  async function loadWorkspaces() {
    try {
      const res = await fetch("/api/workspaces", { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
  }

  async function loadAlertCount() {
    try {
      const res = await fetch("/api/alerts?limit=100", { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.alerts ?? []);
      setAlertCount(list.filter(a => !a.is_read).length);
    } catch { /* noop */ }
  }

  async function switchWorkspace(id) {
    if (!id) return;
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ workspace_id: Number(id) }),
      });
      if (!res.ok) return;
      setActiveWorkspace(Number(id));
      window.location.reload();
    } catch { /* noop */ }
  }

  const initials = (user?.name || user?.email || "?")[0].toUpperCase();

  return (
    <nav className="topnav" role="navigation" aria-label="Hauptnavigation">
      {/* Brand */}
      <NavLink to="/" className="topnav-logo">INTLYST</NavLink>

      {/* Center nav links */}
      <div className="topnav-links" role="menubar">
        {NAV_LINKS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
            role="menuitem"
          >
            <Icon />
            <span className="hide-mobile">{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Right actions */}
      <div className="topnav-actions">
        {/* Workspace selector */}
        {workspaces.length > 1 && (
          <select
            className="hide-mobile"
            value={activeWorkspaceId || ""}
            onChange={e => switchWorkspace(e.target.value)}
            aria-label="Workspace wechseln"
            style={{
              fontSize: "var(--text-sm)",
              padding: "5px 28px 5px 10px",
              background: "var(--c-surface-3)",
              border: "1px solid var(--c-border)",
              borderRadius: "var(--r-sm)",
              color: "var(--c-text)",
              cursor: "pointer",
              appearance: "none",
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2386868B' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              maxWidth: 120,
            }}
          >
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        )}

        {/* AI Button */}
        <div
          className="hide-mobile"
          style={{
            padding: "5px 10px",
            borderRadius: "999px",
            background: "var(--c-surface-3)",
            border: "1px solid var(--c-border)",
            fontSize: "var(--text-xs)",
            color: "var(--c-text-2)",
            whiteSpace: "nowrap",
          }}
        >
          {profile.shortLabel}
        </div>

        <button
          className="topnav-ai-btn"
          onClick={onAiClick}
          aria-label="KI-Assistent öffnen"
        >
          <span aria-hidden="true" style={{ fontSize: 13 }}>✦</span>
          <span>Fragen</span>
        </button>

        {/* Notification bell */}
        <button
          className="topnav-icon-btn"
          onClick={() => navigate("/alerts")}
          aria-label={alertCount > 0 ? `${alertCount} ungelesene Alerts` : "Alerts"}
          title="Alerts"
        >
          <IcoBellLg />
          {alertCount > 0 && <span className="notif-badge" aria-hidden="true" />}
        </button>

        {/* Avatar */}
        <button
          className="topnav-avatar"
          onClick={() => navigate("/settings")}
          aria-label="Profileinstellungen"
          title={user?.email ?? "Einstellungen"}
        >
          {initials}
        </button>
      </div>
    </nav>
  );
}
