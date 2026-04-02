/* eslint-disable */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

// ── Static navigation items ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { type: "page", icon: "⊞", label: "Dashboard",   desc: "Übersicht & KPIs",              to: "/" },
  { type: "page", icon: "📊", label: "Analyse",     desc: "Datenanalyse & Prognosen",      to: "/analyse" },
  { type: "page", icon: "🚀", label: "Wachstum",    desc: "Ziele & Wachstumsstrategien",   to: "/wachstum" },
  { type: "page", icon: "👥", label: "Kunden",      desc: "Kundensegmente & CRM",          to: "/kunden" },
  { type: "page", icon: "📱", label: "Social",      desc: "Social Media Hub",              to: "/social" },
  { type: "page", icon: "✓",  label: "Aufgaben",    desc: "Kanban Board & Tasks",          to: "/aufgaben" },
  { type: "page", icon: "⚙",  label: "Einstellungen", desc: "Account, Team und Präferenzen", to: "/settings" },
  { type: "settings", icon: "🎯", label: "Strategie setzen",  desc: "Wachstumsziel festlegen",     to: "/settings?tab=strategie" },
  { type: "settings", icon: "🔗", label: "Integrationen",     desc: "Stripe, GA4, Shopify verbinden", to: "/integrations" },
  { type: "settings", icon: "👥", label: "Team",              desc: "Mitglieder verwalten und einladen", to: "/settings?tab=team" },
  { type: "settings", icon: "🔔", label: "Benachrichtigungen",desc: "Notification-Einstellungen",  to: "/settings?tab=benachrichtigungen" },
  { type: "settings", icon: "👤", label: "Account",           desc: "Profil & Sicherheit",         to: "/settings?tab=account" },
];

const SHORTCUTS = [
  { key: ">", label: "Befehl",         desc: "> befehl eingeben" },
  { key: "?", label: "Hilfe",          desc: "? hilfe öffnen" },
  { key: "@", label: "Zu Seite",       desc: "@seite navigieren" },
];

function fuzzyMatch(str, query) {
  if (!query) return true;
  const s = str.toLowerCase();
  const q = query.toLowerCase();
  let si = 0;
  for (let qi = 0; qi < q.length; qi++) {
    si = s.indexOf(q[qi], si);
    if (si === -1) return false;
    si++;
  }
  return true;
}

const RECENT_KEY = "intlyst_recent_searches";
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(query) {
  if (!query.trim()) return;
  const prev = getRecent().filter(r => r !== query).slice(0, 4);
  localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...prev]));
}

export default function CommandPalette({ isOpen, onClose }) {
  const navigate    = useNavigate();
  const { authHeader } = useAuth();
  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading]   = useState(false);
  const debounceRef = useRef(null);
  const recent = getRecent();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Build static results from query
  const buildResults = useCallback((q) => {
    const trimmed = q.trim();
    if (!trimmed) return [];

    const items = [];

    // Special prefix shortcuts
    if (trimmed.startsWith(">")) {
      const cmd = trimmed.slice(1).trim().toLowerCase();
      if (!cmd || "abmelden".includes(cmd))
        items.push({ type: "action", icon: "🚪", label: "Abmelden", action: "logout" });
      if (!cmd || "einstellungen".includes(cmd))
        items.push({ type: "page", icon: "⚙", label: "Einstellungen öffnen", to: "/settings" });
      if (!cmd || "task erstellen".includes(cmd))
        items.push({ type: "action", icon: "✚", label: "Neuer Task erstellen", action: "new_task" });
      return items;
    }

    if (trimmed.startsWith("@")) {
      const page = trimmed.slice(1).trim().toLowerCase();
      return NAV_ITEMS.filter(n =>
        fuzzyMatch(n.label, page) || fuzzyMatch(n.desc, page)
      ).map(n => ({ ...n }));
    }

    // Pages
    NAV_ITEMS.filter(n =>
      fuzzyMatch(n.label, trimmed) || fuzzyMatch(n.desc, trimmed)
    ).forEach(n => items.push({ ...n }));

    // AI query shortcut
    if (trimmed.length > 2) {
      items.push({
        type: "ai",
        icon: "✦",
        label: `KI fragen: "${trimmed}"`,
        desc: "Sofort analysieren mit INTLYST AI",
        query: trimmed,
      });
    }

    return items.slice(0, 8);
  }, []);

  // Fetch live data (tasks, customers) with debounce
  const fetchLive = useCallback(async (q) => {
    if (q.length < 2) return [];
    try {
      const [tasksRes, alertsRes] = await Promise.allSettled([
        fetch(`/api/tasks?search=${encodeURIComponent(q)}&limit=3`, { headers: authHeader() }),
        fetch(`/api/alerts?search=${encodeURIComponent(q)}&limit=3`, { headers: authHeader() }),
      ]);
      const live = [];
      if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
        const data = await tasksRes.value.json();
        const tasks = Array.isArray(data) ? data : (data?.tasks ?? []);
        tasks.slice(0, 3).forEach(t =>
          live.push({ type: "task", icon: "✓", label: t.title, desc: `Task · ${t.status ?? "offen"}`, to: "/aufgaben" })
        );
      }
      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const data = await alertsRes.value.json();
        const alerts = Array.isArray(data) ? data : (data?.alerts ?? []);
        alerts.slice(0, 2).forEach(a =>
          live.push({ type: "alert", icon: "🔔", label: a.title, desc: `Alert · ${a.alert_type ?? "info"}`, to: "/settings?tab=benachrichtigungen" })
        );
      }
      return live;
    } catch { return []; }
  }, [authHeader]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    const staticRes = buildResults(trimmed);
    setResults(staticRes);
    setSelected(0);

    if (trimmed.length >= 2) {
      setLoading(true);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const live = await fetchLive(trimmed);
        setResults(prev => {
          const merged = [...live, ...prev.filter(p => p.type !== "task" && p.type !== "alert")];
          return merged.slice(0, 8);
        });
        setLoading(false);
      }, 280);
    } else {
      setLoading(false);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen, buildResults, fetchLive]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    function handler(e) {
      if (e.key === "Escape") { onClose(); return; }
      const list = results.length > 0 ? results : [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(s => (s + 1) % Math.max(list.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(s => (s - 1 + Math.max(list.length, 1)) % Math.max(list.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = list[selected];
        if (item) openItem(item);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, results, selected, onClose]); // eslint-disable-line

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected];
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function openItem(item) {
    if (item.to) {
      saveRecent(query || item.label);
      navigate(item.to);
      onClose();
    } else if (item.action === "logout") {
      onClose();
      // handled by auth
    } else if (item.action === "new_task") {
      saveRecent(query || item.label);
      navigate("/aufgaben");
      onClose();
    } else if (item.type === "ai") {
      saveRecent(item.query);
      // emit custom event that ChatPanel listens to
      window.dispatchEvent(new CustomEvent("intlyst:open-chat", { detail: { query: item.query } }));
      onClose();
    }
  }

  function openRecent(r) {
    setQuery(r);
    inputRef.current?.focus();
  }

  if (!isOpen) return null;

  const showRecent  = !query.trim() && recent.length > 0;
  const showShorts  = !query.trim();
  const showResults = results.length > 0;

  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="cmd-modal" role="dialog" aria-label="Schnellsuche" aria-modal="true">
        {/* Search input */}
        <div className="cmd-input-row">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: "var(--c-text-3)", flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            type="text"
            placeholder="Suchen oder Befehl eingeben…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Suche"
          />
          {loading && <span className="spinner spinner-sm" aria-hidden="true" />}
          <kbd className="cmd-kbd">ESC</kbd>
        </div>

        <div className="cmd-body">
          {/* Recent searches */}
          {showRecent && (
            <div className="cmd-section">
              <div className="cmd-section-label">Zuletzt gesucht</div>
              {recent.map((r, i) => (
                <button key={i} className="cmd-item" onClick={() => openRecent(r)}>
                  <span className="cmd-item-icon">⏱</span>
                  <span className="cmd-item-label">{r}</span>
                </button>
              ))}
            </div>
          )}

          {/* Shortcuts hint */}
          {showShorts && (
            <div className="cmd-section">
              <div className="cmd-section-label">Shortcuts</div>
              <div className="cmd-shortcuts-row">
                {SHORTCUTS.map((s, i) => (
                  <button key={i} className="cmd-shortcut-chip" onClick={() => setQuery(s.key)}>
                    <kbd>{s.key}</kbd>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Schnell-Navigation */}
          {showShorts && (
            <div className="cmd-section">
              <div className="cmd-section-label">Seiten</div>
              <div ref={listRef}>
                {NAV_ITEMS.slice(0, 7).map((item, i) => (
                  <button
                    key={i}
                    className={`cmd-item${selected === i ? " selected" : ""}`}
                    onClick={() => openItem(item)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="cmd-item-icon">{item.icon}</span>
                    <span className="cmd-item-label">{item.label}</span>
                    <span className="cmd-item-desc">{item.desc}</span>
                    <span className="cmd-item-type">{item.type === "page" ? "Seite" : "Einstellung"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          {showResults && (
            <div className="cmd-section">
              <div className="cmd-section-label">Ergebnisse</div>
              <div ref={listRef}>
                {results.map((item, i) => (
                  <button
                    key={i}
                    className={`cmd-item${selected === i ? " selected" : ""}`}
                    onClick={() => openItem(item)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="cmd-item-icon">{item.icon}</span>
                    <span className="cmd-item-label">{item.label}</span>
                    {item.desc && <span className="cmd-item-desc">{item.desc}</span>}
                    <span className="cmd-item-type">{
                      item.type === "page" ? "Seite" :
                      item.type === "task" ? "Task" :
                      item.type === "alert" ? "Alert" :
                      item.type === "ai" ? "KI" :
                      item.type === "settings" ? "Einstellung" : ""
                    }</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() && !showResults && !loading && (
            <div className="cmd-empty">
              <span>Keine Ergebnisse für „{query}"</span>
            </div>
          )}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigieren</span>
          <span><kbd>↵</kbd> öffnen</span>
          <span><kbd>ESC</kbd> schließen</span>
        </div>
      </div>
    </>
  );
}
