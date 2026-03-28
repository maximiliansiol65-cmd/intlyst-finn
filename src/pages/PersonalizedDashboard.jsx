/* eslint-disable */
import { useState, useRef } from "react";
import { DASHBOARD_WIDGETS } from "../hooks/useWidgetLayout";
import { useTheme } from "../contexts/ThemeContext";
import { ALL_TABS } from "../components/layout/BottomTabBar";

const STORAGE_KEY = "intlyst-dashboard-layout";

function loadItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const ids = parsed.map((w) => w.id);
      const missing = DASHBOARD_WIDGETS
        .filter((w) => !ids.includes(w.id))
        .map((w) => ({ id: w.id, visible: true }));
      return [...parsed, ...missing];
    }
  } catch {}
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

// ── Dashboard Editor Sheet ────────────────────────────────────────────────────
function DashboardEditor({ isOpen, onClose }) {
  const [items, setItems] = useState(loadItems);
  const dragId = useRef(null);
  const dragOverId = useRef(null);

  if (!isOpen) return null;

  function handleDragStart(id) { dragId.current = id; }
  function handleDragEnter(id) { dragOverId.current = id; }
  function handleDragEnd() {
    if (!dragId.current || dragId.current === dragOverId.current) return;
    const from = items.findIndex((i) => i.id === dragId.current);
    const to   = items.findIndex((i) => i.id === dragOverId.current);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    dragId.current = null;
    dragOverId.current = null;
  }

  function toggleWidget(id) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i))
    );
  }

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("intlyst-layout-changed"));
    onClose();
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        display: "flex", alignItems: "flex-end",
        background: "rgba(0,0,0,0.45)",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 500, margin: "0 auto",
        background: "var(--c-surface)",
        borderRadius: "20px 20px 0 0",
        padding: "var(--s-6)",
        maxHeight: "88dvh", overflowY: "auto",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-5)" }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>
              Dashboard bearbeiten
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>
              Ziehen zum Sortieren · Schalter zum Ein-/Ausblenden
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", fontSize: 20, padding: 4, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Widget list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
          {items.map((item) => {
            const meta = DASHBOARD_WIDGETS.find((w) => w.id === item.id);
            if (!meta) return null;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragEnter={() => handleDragEnter(item.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--s-3)",
                  padding: "var(--s-3) var(--s-4)",
                  background: "var(--c-surface-2)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--c-border)",
                  cursor: "grab",
                  opacity: item.visible ? 1 : 0.45,
                  transition: "opacity 0.15s ease",
                  userSelect: "none",
                }}
              >
                {/* Drag handle */}
                <span style={{ color: "var(--c-text-4)", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⠿</span>
                {/* Icon */}
                <span style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</span>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{meta.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 1 }}>{meta.desc}</div>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => toggleWidget(item.id)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: item.visible ? "#000" : "#ccc",
                    position: "relative", transition: "background 0.2s ease", flexShrink: 0,
                    padding: 0,
                  }}
                  aria-label={item.visible ? "Ausblenden" : "Einblenden"}
                >
                  <span style={{
                    position: "absolute", top: 2,
                    left: item.visible ? 22 : 2,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s ease",
                    display: "block",
                  }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "var(--s-3) var(--s-4)",
            background: "#000", color: "#fff",
            border: "2px solid #000", borderRadius: "var(--r-md)",
            fontSize: "var(--text-sm)", fontWeight: 600,
            cursor: "pointer", transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Speichern & anwenden
        </button>
      </div>
    </div>
  );
}

// ── Theme Picker Sheet ────────────────────────────────────────────────────────
const THEME_OPTIONS = [
  { id: "light",  icon: "☀️", label: "Hell",       desc: "Immer helles Design" },
  { id: "dark",   icon: "🌙", label: "Dunkel",      desc: "Immer dunkles Design" },
  { id: "system", icon: "⚙️", label: "Automatisch", desc: "Wie auf deinem Gerät eingestellt" },
];

function ThemePicker({ isOpen, onClose }) {
  const { theme, setTheme } = useTheme();
  if (!isOpen) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)" }}
    >
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto", background: "var(--c-surface)", borderRadius: "20px 20px 0 0", padding: "var(--s-6)", boxShadow: "0 -4px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-5)" }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>App-Theme</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>Wähle dein bevorzugtes Erscheinungsbild</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", fontSize: 20, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setTheme(opt.id); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--s-4)",
                  padding: "var(--s-4)", borderRadius: "var(--r-md)",
                  border: active ? "2px solid #000" : "2px solid var(--c-border)",
                  background: active ? "var(--c-surface-2)" : "var(--c-surface)",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: 24 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{opt.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{opt.desc}</div>
                </div>
                {active && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "#000", flexShrink: 0 }}>
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Schnellaktionen Sheet ─────────────────────────────────────────────────────
const QA_STORAGE_KEY  = "intlyst-quick-actions";
const QA_DEFAULT      = ["dashboard", "analyse", "wachstum", "tasks", "mehr"];
const QA_MAX          = 5;

function loadQA() {
  try {
    const s = localStorage.getItem(QA_STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return QA_DEFAULT;
}

function SchnellaktionenSheet({ isOpen, onClose }) {
  const [selected, setSelected] = useState(loadQA);
  const dragRef = useRef(null);
  const dragOverRef = useRef(null);

  if (!isOpen) return null;

  function toggle(id) {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < QA_MAX ? [...prev, id] : prev
    );
  }

  function handleDragStart(id) { dragRef.current = id; }
  function handleDragEnter(id) { dragOverRef.current = id; }
  function handleDragEnd() {
    if (!dragRef.current || dragRef.current === dragOverRef.current) return;
    const from = selected.indexOf(dragRef.current);
    const to   = selected.indexOf(dragOverRef.current);
    if (from < 0 || to < 0) return;
    const next = [...selected];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSelected(next);
    dragRef.current = null; dragOverRef.current = null;
  }

  function handleSave() {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(selected));
    window.dispatchEvent(new Event("intlyst-quick-actions-changed"));
    onClose();
  }

  const selectedTabs = selected.map(id => ALL_TABS.find(t => t.id === id)).filter(Boolean);
  const unselected   = ALL_TABS.filter(t => !selected.includes(t.id));

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)" }}>
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto", background: "var(--c-surface)", borderRadius: "20px 20px 0 0", padding: "var(--s-6)", maxHeight: "90dvh", overflowY: "auto", boxShadow: "0 -4px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-5)" }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>Schnellaktionen</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>Wähle bis zu {QA_MAX} Tabs · Ziehen zum Sortieren</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", fontSize: 20, padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Selected — sortierbar */}
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>
          Aktive Tabs ({selected.length}/{QA_MAX})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
          {selectedTabs.map(tab => (
            <div key={tab.id} draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragEnter={() => handleDragEnter(tab.id)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", cursor: "grab", userSelect: "none" }}>
              <span style={{ color: "var(--c-text-4)", fontSize: 18, flexShrink: 0 }}>⠿</span>
              <div style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <tab.Icon />
              </div>
              <span style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}</span>
              <button onClick={() => toggle(tab.id)} style={{ background: "none", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "2px 10px", cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Entfernen</button>
            </div>
          ))}
          {selected.length === 0 && <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", padding: "var(--s-3) 0" }}>Noch keine Tabs ausgewählt.</div>}
        </div>

        {/* Unselected — hinzufügbar */}
        {unselected.length > 0 && <>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>Verfügbar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
            {unselected.map(tab => (
              <div key={tab.id} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)", background: "var(--c-surface)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", opacity: selected.length >= QA_MAX ? 0.4 : 1 }}>
                <div style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", background: "#f0f0f0", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <tab.Icon />
                </div>
                <span style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}</span>
                <button onClick={() => toggle(tab.id)} disabled={selected.length >= QA_MAX}
                  style={{ background: selected.length < QA_MAX ? "#000" : "#ccc", border: "none", borderRadius: "var(--r-sm)", padding: "4px 12px", cursor: selected.length < QA_MAX ? "pointer" : "default", fontSize: "var(--text-xs)", color: "#fff", fontWeight: 600 }}>
                  + Hinzufügen
                </button>
              </div>
            ))}
          </div>
        </>}

        <button onClick={handleSave}
          style={{ width: "100%", padding: "var(--s-3) var(--s-4)", background: "#000", color: "#fff", border: "2px solid #000", borderRadius: "var(--r-md)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          Speichern & anwenden
        </button>
      </div>
    </div>
  );
}

// ── Startseite Sheet ──────────────────────────────────────────────────────────
const START_OPTIONS = [
  { path: "/",         label: "Dashboard",  desc: "Deine KPIs und Charts" },
  { path: "/analyse",  label: "Analyse",    desc: "Tiefe Einblicke & Auswertungen" },
  { path: "/wachstum", label: "Wachstum",   desc: "Wachstumsstrategie & Empfehlungen" },
  { path: "/tasks",    label: "Tasks",      desc: "Deine Aufgaben im Überblick" },
  { path: "/mehr",     label: "Mehr",       desc: "Alle Bereiche der App" },
];

function StartseitePicker({ isOpen, onClose }) {
  const [selected, setSelected] = useState(() => localStorage.getItem("intlyst-start-page") || "/");

  if (!isOpen) return null;

  function handleSave() {
    localStorage.setItem("intlyst-start-page", selected);
    onClose();
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)" }}>
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto", background: "var(--c-surface)", borderRadius: "20px 20px 0 0", padding: "var(--s-6)", boxShadow: "0 -4px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-5)" }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>Startseite</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>Welche Seite beim Öffnen der App erscheint</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", fontSize: 20, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
          {START_OPTIONS.map(opt => {
            const active = selected === opt.path;
            return (
              <button key={opt.path} onClick={() => setSelected(opt.path)}
                style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", padding: "var(--s-4)", borderRadius: "var(--r-md)", border: active ? "2px solid #000" : "2px solid var(--c-border)", background: active ? "var(--c-surface-2)" : "var(--c-surface)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s ease" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{opt.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{opt.desc}</div>
                </div>
                {active && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "#000", flexShrink: 0 }}>
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={handleSave}
          style={{ width: "100%", padding: "var(--s-3) var(--s-4)", background: "#000", color: "#fff", border: "2px solid #000", borderRadius: "var(--r-md)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          Speichern
        </button>
      </div>
    </div>
  );
}

// ── Menu items ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  {
    id: "dashboard",
    icon: "🎨",
    label: "Dashboard bearbeiten",
    desc: "Widgets sortieren und ein- oder ausblenden",
    tag: "Drag & Drop",
    tagDark: true,
    action: "editor",
  },
  {
    id: "theme",
    icon: "🌗",
    label: "App-Theme",
    desc: "Hell, dunkel oder automatisch",
    tag: null,
    action: "theme",
  },
  {
    id: "quickactions",
    icon: "⚡",
    label: "Schnellaktionen",
    desc: "Tabs in der Navigationsleiste anpassen",
    tag: null,
    action: "quickactions",
  },
  {
    id: "startscreen",
    icon: "🏠",
    label: "Startseite",
    desc: "Welche Seite beim Öffnen der App erscheint",
    tag: null,
    action: "startscreen",
  },
];

// ── Main export (used inside Settings > Personalisierung tab) ─────────────────
export default function PersonalizedDashboard() {
  const [editorOpen, setEditorOpen]       = useState(false);
  const [themeOpen, setThemeOpen]         = useState(false);
  const [qaOpen, setQaOpen]               = useState(false);
  const [startOpen, setStartOpen]         = useState(false);
  const { theme } = useTheme();

  const THEME_LABEL = { light: "Hell", dark: "Dunkel", system: "Automatisch" };
  const startLabel  = START_OPTIONS.find(o => o.path === (localStorage.getItem("intlyst-start-page") || "/"))?.label ?? "Dashboard";

  function handleMenuAction(item) {
    if (item.action === "editor")      setEditorOpen(true);
    else if (item.action === "theme")  setThemeOpen(true);
    else if (item.action === "quickactions") setQaOpen(true);
    else if (item.action === "startscreen")  setStartOpen(true);
  }

  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginBottom: "var(--s-4)" }}>
        Passe INTLYST an deine Arbeitsweise an.
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {MENU_ITEMS.map((item, idx) => (
          <button
            key={item.id}
            disabled={!!item.disabled}
            onClick={!item.disabled ? () => handleMenuAction(item) : undefined}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: "var(--s-4)", padding: "var(--s-4) var(--s-5)",
              background: "none", border: "none",
              borderTop: idx > 0 ? "1px solid var(--c-border)" : "none",
              cursor: item.disabled ? "default" : "pointer",
              textAlign: "left", fontFamily: "inherit",
              opacity: item.disabled ? 0.5 : 1,
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "var(--c-surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {/* Icon box */}
            <div style={{
              width: 40, height: 40, borderRadius: "var(--r-md)",
              background: "#f0f0f0", border: "1px solid #e0e0e0",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
            }}>
              {item.icon}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{item.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>
                {item.id === "theme" ? THEME_LABEL[theme] : item.id === "startscreen" ? startLabel : item.desc}
              </div>
            </div>

            {/* Tag */}
            {item.tag && (
              <span style={{
                fontSize: "var(--text-xs)", padding: "2px 8px",
                borderRadius: 99, flexShrink: 0,
                background: item.tagDark ? "#000" : "#eee",
                color: item.tagDark ? "#fff" : "var(--c-text-3)",
              }}>
                {item.tag}
              </span>
            )}

            {/* Chevron for active items */}
            {!item.disabled && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ color: "var(--c-text-3)", flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            )}
          </button>
        ))}
      </div>

      <DashboardEditor isOpen={editorOpen} onClose={() => setEditorOpen(false)} />
      <ThemePicker isOpen={themeOpen} onClose={() => setThemeOpen(false)} />
      <SchnellaktionenSheet isOpen={qaOpen} onClose={() => setQaOpen(false)} />
      <StartseitePicker isOpen={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  );
}
