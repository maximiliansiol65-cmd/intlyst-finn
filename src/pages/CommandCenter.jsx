/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/premium-dashboard.css";
import CalendarTab from "../components/CalendarTab";

// ─── Local Storage Keys ───────────────────────────────────────────────────────
const LS_GOALS   = "intlyst_cmd_goals";
const LS_BLOCKS  = "intlyst_cmd_timeblocks";
const LS_REVIEWS = "intlyst_cmd_reviews";

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
const PRIORITY_LABELS = { high: "Hoch", medium: "Mittel", low: "Niedrig" };
const DEPARTMENTS     = ["Marketing", "Vertrieb", "Tech", "Content", "Finanzen", "Operations", "HR"];
const WEEK_DAYS       = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const KPI_OPTIONS     = ["Umsatz", "Traffic", "Conversion Rate", "Neue Kunden", "CAC", "LTV", "Churn Rate", "ROI", "MRR"];
const TIME_CATEGORIES = [
  { id: "marketing",  label: "Marketing",  color: "#3b82f6" },
  { id: "vertrieb",   label: "Vertrieb",   color: "#10b981" },
  { id: "content",    label: "Content",    color: "#8b5cf6" },
  { id: "strategie",  label: "Strategie",  color: "#f59e0b" },
  { id: "analyse",    label: "Analyse",    color: "#ef4444" },
  { id: "review",     label: "Review",     color: "#6366f1" },
];
const DEFAULT_REVIEWS = {
  daily_briefing: "08:00",
  weekly_kpi_day: "Montag",
  weekly_kpi_time: "09:00",
  monthly_strategy_date: "1",
  team_review_day: "Freitag",
  team_review_time: "16:00",
};
const DEFAULT_BLOCKS = [
  { id: 1, day: "Montag",     start: "09:00", end: "11:00", category: "strategie", title: "Wochenstrategie" },
  { id: 2, day: "Dienstag",   start: "10:00", end: "12:00", category: "marketing", title: "Marketing Review" },
  { id: 3, day: "Mittwoch",   start: "14:00", end: "16:00", category: "vertrieb",  title: "Vertrieb Calls" },
  { id: 4, day: "Donnerstag", start: "09:00", end: "11:00", category: "content",   title: "Content Planung" },
  { id: 5, day: "Freitag",    start: "15:00", end: "17:00", category: "analyse",   title: "Wochenanalyse & Review" },
];
const TABS = [
  { id: "heute",    label: "Heute",    emoji: "🌅" },
  { id: "aufgaben", label: "Aufgaben", emoji: "✅" },
  { id: "ziele",    label: "Ziele",    emoji: "🎯" },
  { id: "planung",  label: "Planung",  emoji: "📅" },
  { id: "kalender", label: "Kalender", emoji: "📆" },
  { id: "reviews",  label: "Reviews",  emoji: "🔍" },
];
const DAY_PLANS = {
  "Montag":     "Strategietag — Plane deine Woche und setze klare Prioritäten.",
  "Dienstag":   "Marketing-Tag — Überprüfe Kampagnen und plane Content.",
  "Mittwoch":   "Vertriebs-Tag — Fokus auf Leads, Calls und Pipeline-Pflege.",
  "Donnerstag": "Content-Tag — Erstelle und plane Inhalte für die nächste Woche.",
  "Freitag":    "Analyse & Review — Was hat funktioniert? Was gilt es anzupassen?",
  "Samstag":    "Wochenrückblick — Überblick verschaffen, nächste Woche vorbereiten.",
  "Sonntag":    "Wochenrückblick — Überblick verschaffen, nächste Woche vorbereiten.",
};

// ─── Shared Styles ────────────────────────────────────────────────────────────
const labelStyle = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--c-text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--s-1)",
};
const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--c-border)",
  background: "var(--c-surface)",
  color: "var(--c-text)",
  fontSize: "var(--text-sm)",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Local Storage Helpers ────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ─── Tab: Heute ───────────────────────────────────────────────────────────────
function TabHeute({ tasks, loadingTasks, onTabChange }) {
  const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const dayName = weekdays[new Date().getDay()];
  const weekDay = new Date().getDay();
  const weekProgress = weekDay === 0 || weekDay === 6 ? 100 : Math.round((weekDay / 5) * 100);
  const todayTasks = tasks.filter(t => t.status !== "done").slice(0, 3);

  const quickActions = [
    { label: "Neue Aufgabe erstellen", tab: "aufgaben", icon: "✅", href: null },
    { label: "Ziel festlegen",         tab: "ziele",    icon: "🎯", href: null },
    { label: "Zeit blockieren",        tab: "planung",  icon: "📅", href: null },
    { label: "Analyse öffnen",         href: "/analyse", icon: "📊", tab: null },
    { label: "AI-Empfehlungen",        href: "/ceo",     icon: "🤖", tab: null },
    { label: "Alerts prüfen",          href: "/alerts",  icon: "🔔", tab: null },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Day context card */}
      <div className="ceo-section" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff", borderColor: "transparent" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-4)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>
              {dayName}
            </div>
            <div style={{ fontSize: "clamp(17px, 2.5vw, 24px)", fontWeight: 700, lineHeight: 1.4, marginBottom: "var(--s-2)" }}>
              {DAY_PLANS[dayName]}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "#94a3b8" }}>
              Wochenfortschritt: {weekProgress}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "#94a3b8", marginBottom: "var(--s-1)", textAlign: "right" }}>
              Woche
            </div>
            <div style={{ width: 140, height: 8, background: "#1e3a5f", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${weekProgress}%`, background: "#3b82f6", borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 tasks */}
      <div className="ceo-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-4)" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Top 3 Prioritäten heute</div>
          <Link to="/tasks" style={{ fontSize: "var(--text-sm)", color: "var(--c-primary)", textDecoration: "none", fontWeight: 600 }}>
            Alle Aufgaben →
          </Link>
        </div>
        {loadingTasks ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)", padding: "var(--s-4)" }}>Lädt Aufgaben...</div>
        ) : todayTasks.length === 0 ? (
          <div style={{ padding: "var(--s-6)", textAlign: "center", color: "var(--c-text-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)" }}>
            Keine offenen Aufgaben.{" "}
            <button onClick={() => onTabChange("aufgaben")} style={{ background: "none", border: "none", color: "var(--c-primary)", cursor: "pointer", fontWeight: 600, padding: 0 }}>
              Neue Aufgabe erstellen →
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {todayTasks.map((t, i) => (
              <div key={t.id} style={{
                display: "flex", gap: "var(--s-3)", alignItems: "center",
                padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
                background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: i === 0 ? "#0f172a" : "var(--c-surface-3)",
                  color: i === 0 ? "#fff" : "var(--c-text-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: "var(--text-sm)", flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--c-text)", fontSize: "var(--text-sm)" }}>{t.title}</div>
                  {t.assigned_to && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>
                      👤 {t.assigned_to}
                    </div>
                  )}
                </div>
                <span style={{
                  padding: "3px 10px", borderRadius: "999px",
                  fontSize: "var(--text-xs)", fontWeight: 600, flexShrink: 0,
                  background: (PRIORITY_COLORS[t.priority] || "#6b7280") + "18",
                  color: PRIORITY_COLORS[t.priority] || "#6b7280",
                }}>
                  {PRIORITY_LABELS[t.priority] || t.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="ceo-section">
        <div className="section-title">Schnellzugriff</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)" }}>
          {quickActions.map(a => (
            a.tab ? (
              <button key={a.label} onClick={() => onTabChange(a.tab)} style={{
                display: "flex", gap: "var(--s-2)", alignItems: "center",
                padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
                border: "1px solid var(--c-border)", background: "var(--c-surface)",
                color: "var(--c-text)", fontSize: "var(--text-sm)", fontWeight: 500,
                cursor: "pointer", textAlign: "left",
              }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>{a.label}
              </button>
            ) : (
              <Link key={a.label} to={a.href} style={{
                display: "flex", gap: "var(--s-2)", alignItems: "center",
                padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
                border: "1px solid var(--c-border)", background: "var(--c-surface)",
                color: "var(--c-text)", fontSize: "var(--text-sm)", fontWeight: 500,
                textDecoration: "none",
              }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>{a.label}
              </Link>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Aufgaben ────────────────────────────────────────────────────────────
function TaskRow({ task, onUpdateStatus, onDelete, busy }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
  return (
    <div style={{
      display: "flex", gap: "var(--s-3)", alignItems: "flex-start",
      padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
      border: `1px solid ${isOverdue ? "#fca5a5" : "var(--c-border)"}`,
      background: isOverdue ? "#fff5f5" : "var(--c-surface)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
          <span style={{
            padding: "2px 8px", borderRadius: "999px", fontSize: "var(--text-xs)", fontWeight: 600,
            background: (PRIORITY_COLORS[task.priority] || "#6b7280") + "18",
            color: PRIORITY_COLORS[task.priority] || "#6b7280",
          }}>{PRIORITY_LABELS[task.priority] || task.priority}</span>
          {task.department && (
            <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "var(--text-xs)", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
              {task.department}
            </span>
          )}
          {task.status === "in_progress" && (
            <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "var(--text-xs)", background: "#dbeafe", color: "#2563eb", fontWeight: 600 }}>In Arbeit</span>
          )}
          {task.status === "done" && (
            <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "var(--text-xs)", background: "#dcfce7", color: "#16a34a", fontWeight: 600 }}>Erledigt</span>
          )}
          {isOverdue && (
            <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "var(--text-xs)", background: "#fee2e2", color: "#dc2626", fontWeight: 600 }}>Überfällig</span>
          )}
        </div>
        <div style={{ fontWeight: 600, color: "var(--c-text)", fontSize: "var(--text-sm)" }}>{task.title}</div>
        <div style={{ display: "flex", gap: "var(--s-3)", marginTop: 4, flexWrap: "wrap" }}>
          {task.assigned_to && <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>👤 {task.assigned_to}</span>}
          {task.due_date && (
            <span style={{ fontSize: "var(--text-xs)", color: isOverdue ? "#dc2626" : "var(--c-text-3)" }}>
              📅 {new Date(task.due_date + "T00:00:00").toLocaleDateString("de-DE")}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--s-2)", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {task.status === "open" && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onUpdateStatus(task.id, "in_progress")}>
            Starten
          </button>
        )}
        {task.status === "in_progress" && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onUpdateStatus(task.id, "done")}>
            Erledigt
          </button>
        )}
        <button disabled={busy} onClick={() => onDelete(task.id)} style={{
          background: "none", border: "none", color: "var(--c-text-3)",
          cursor: "pointer", padding: "4px 8px", fontSize: 18, lineHeight: 1,
        }}>×</button>
      </div>
    </div>
  );
}

function TabAufgaben({ tasks, loadingTasks, onCreateTask, onUpdateStatus, onDeleteTask, busy }) {
  const [form, setForm] = useState({ title: "", priority: "medium", assigned_to: "", department: "", due_date: "", kpi: "" });
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterDept, setFilterDept] = useState("");

  function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onCreateTask({ ...form });
    setForm({ title: "", priority: "medium", assigned_to: "", department: "", due_date: "", kpi: "" });
    setShowForm(false);
  }

  const filtered = tasks.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterDept && t.department !== filterDept) return false;
    return true;
  });

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Create Form */}
      <div className="ceo-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showForm ? "var(--s-5)" : 0 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Aufgaben erstellen & zuweisen</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? "Abbrechen" : "+ Neue Aufgabe"}
          </button>
        </div>
        {showForm && (
          <form onSubmit={handleCreate} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Aufgabe *</label>
                <input style={inputStyle} placeholder="Was muss erledigt werden?" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div>
                <label style={labelStyle}>Priorität</label>
                <select style={inputStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="high">Hoch — sofort handeln</option>
                  <option value="medium">Mittel — diese Woche</option>
                  <option value="low">Niedrig — wenn Zeit</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Zugewiesen an</label>
                <input style={inputStyle} placeholder="Name der Person" value={form.assigned_to}
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Abteilung</label>
                <select style={inputStyle} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Keine Abteilung</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fällig bis</label>
                <input type="date" style={inputStyle} value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Verbundener KPI</label>
                <select style={inputStyle} value={form.kpi} onChange={e => setForm(f => ({ ...f, kpi: e.target.value }))}>
                  <option value="">Kein KPI</option>
                  {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div style={{ padding: "var(--s-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-sm)", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              Die Aufgabe wird im System gespeichert. Der Verantwortliche wird nicht automatisch benachrichtigt — stelle sicher, dass du ihn informierst.
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.title.trim()}>
              {busy ? "Wird erstellt..." : "Aufgabe erstellen & zuweisen"}
            </button>
          </form>
        )}
      </div>

      {/* Filter + Task List */}
      <div className="ceo-section">
        <div style={{ display: "flex", gap: "var(--s-3)", marginBottom: "var(--s-4)", flexWrap: "wrap", alignItems: "center" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {filtered.length} Aufgabe{filtered.length !== 1 ? "n" : ""}
          </div>
          {[["open", "Offen"], ["in_progress", "In Arbeit"], ["done", "Erledigt"]].map(([s, l]) => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "" : s)} style={{
              padding: "4px 14px", borderRadius: "999px",
              border: "1px solid var(--c-border)",
              background: filterStatus === s ? "#0f172a" : "var(--c-surface)",
              color: filterStatus === s ? "#fff" : "var(--c-text)",
              fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer",
            }}>{l}</button>
          ))}
          <select style={{ ...inputStyle, width: "auto", padding: "4px 10px" }} value={filterDept}
            onChange={e => setFilterDept(e.target.value)}>
            <option value="">Alle Abteilungen</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {loadingTasks ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)", padding: "var(--s-4)" }}>Lädt...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "var(--s-8)", textAlign: "center", color: "var(--c-text-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)" }}>
            Keine Aufgaben gefunden.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {filtered.map(t => (
              <TaskRow key={t.id} task={t} onUpdateStatus={onUpdateStatus} onDelete={onDeleteTask} busy={busy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Ziele ───────────────────────────────────────────────────────────────
function TabZiele() {
  const [period, setPeriod] = useState("woche");
  const [goals, setGoals] = useState(() => lsGet(LS_GOALS, {}));
  const [form, setForm] = useState({ title: "", target: "", unit: "", kpi: "", department: "" });
  const [showForm, setShowForm] = useState(false);

  const periodLabels = { woche: "Diese Woche", monat: "Diesen Monat", quartal: "Dieses Quartal" };
  const currentGoals = goals[period] || [];

  function addGoal() {
    if (!form.title.trim()) return;
    const newGoal = { id: Date.now(), ...form, progress: 0, created: new Date().toISOString() };
    const updated = { ...goals, [period]: [...currentGoals, newGoal] };
    setGoals(updated);
    lsSet(LS_GOALS, updated);
    setForm({ title: "", target: "", unit: "", kpi: "", department: "" });
    setShowForm(false);
  }

  function removeGoal(id) {
    const updated = { ...goals, [period]: currentGoals.filter(g => g.id !== id) };
    setGoals(updated);
    lsSet(LS_GOALS, updated);
  }

  function updateProgress(id, progress) {
    const updated = {
      ...goals,
      [period]: currentGoals.map(g => g.id === id ? { ...g, progress: Math.min(100, Math.max(0, Number(progress))) } : g),
    };
    setGoals(updated);
    lsSet(LS_GOALS, updated);
  }

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="ceo-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-4)" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Strategische Ziele</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? "Abbrechen" : "+ Ziel hinzufügen"}
          </button>
        </div>

        {/* Period Switcher */}
        <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
          {Object.entries(periodLabels).map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)} style={{
              padding: "7px 18px", borderRadius: "var(--r-sm)", cursor: "pointer",
              border: "1px solid var(--c-border)",
              background: period === key ? "#0f172a" : "var(--c-surface)",
              color: period === key ? "#fff" : "var(--c-text)",
              fontWeight: 600, fontSize: "var(--text-sm)",
            }}>{label}</button>
          ))}
        </div>

        {/* Add Form */}
        {showForm && (
          <div style={{ padding: "var(--s-4)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)", marginBottom: "var(--s-4)", display: "grid", gap: "var(--s-3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Ziel *</label>
                <input style={inputStyle} placeholder="z.B. Umsatz um 15% steigern" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Zielwert</label>
                <input style={inputStyle} placeholder="z.B. 50000" value={form.target}
                  onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Einheit</label>
                <input style={inputStyle} placeholder="€ oder %" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Verbundener KPI</label>
                <select style={inputStyle} value={form.kpi} onChange={e => setForm(f => ({ ...f, kpi: e.target.value }))}>
                  <option value="">Kein KPI</option>
                  {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Verantwortliche Abteilung</label>
                <select style={inputStyle} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Alle</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" onClick={addGoal} disabled={!form.title.trim()}>
              Ziel für {periodLabels[period]} speichern
            </button>
          </div>
        )}

        {/* Goal List */}
        {currentGoals.length === 0 ? (
          <div style={{ padding: "var(--s-8)", textAlign: "center", color: "var(--c-text-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)" }}>
            Noch keine Ziele für {periodLabels[period]}. Füge dein erstes Ziel hinzu.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            {currentGoals.map(goal => (
              <div key={goal.id} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--c-text)", marginBottom: "var(--s-1)" }}>{goal.title}</div>
                    <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                      {goal.target && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Ziel: {goal.target}{goal.unit}</span>
                      )}
                      {goal.kpi && (
                        <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: "999px", background: "#dbeafe", color: "#2563eb" }}>
                          KPI: {goal.kpi}
                        </span>
                      )}
                      {goal.department && (
                        <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: "999px", background: "var(--c-surface-2)", color: "var(--c-text-3)" }}>
                          {goal.department}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeGoal(goal.id)} style={{
                    background: "none", border: "none", color: "var(--c-text-3)",
                    cursor: "pointer", fontSize: 20, padding: "2px 6px", lineHeight: 1,
                  }}>×</button>
                </div>
                <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                  <div style={{ flex: 1, height: 8, background: "var(--c-surface-2)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${goal.progress}%`, borderRadius: 4,
                      background: goal.progress >= 100 ? "#10b981" : goal.progress >= 50 ? "#3b82f6" : "#f59e0b",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexShrink: 0 }}>
                    <input type="range" min="0" max="100" value={goal.progress}
                      onChange={e => updateProgress(goal.id, e.target.value)} style={{ width: 80 }} />
                    <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", minWidth: 38, textAlign: "right" }}>
                      {goal.progress}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Planung ─────────────────────────────────────────────────────────────
function TabPlanung() {
  const [blocks, setBlocks] = useState(() => lsGet(LS_BLOCKS, DEFAULT_BLOCKS));
  const [form, setForm] = useState({ day: "Montag", start: "09:00", end: "10:00", category: "strategie", title: "" });
  const [showForm, setShowForm] = useState(false);

  function addBlock() {
    if (!form.title.trim()) return;
    const updated = [...blocks, { id: Date.now(), ...form }];
    setBlocks(updated);
    lsSet(LS_BLOCKS, updated);
    setForm({ day: "Montag", start: "09:00", end: "10:00", category: "strategie", title: "" });
    setShowForm(false);
  }

  function removeBlock(id) {
    const updated = blocks.filter(b => b.id !== id);
    setBlocks(updated);
    lsSet(LS_BLOCKS, updated);
  }

  const blocksByDay = WEEK_DAYS.reduce((acc, day) => {
    acc[day] = blocks.filter(b => b.day === day).sort((a, b) => a.start.localeCompare(b.start));
    return acc;
  }, {});

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="ceo-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-5)" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Wochenplanung</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? "Abbrechen" : "+ Zeitblock"}
          </button>
        </div>

        {showForm && (
          <div style={{ padding: "var(--s-4)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)", marginBottom: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Titel *</label>
                <input style={inputStyle} placeholder="z.B. Marketing Review" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Tag</label>
                <select style={inputStyle} value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))}>
                  {WEEK_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {TIME_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Beginn</label>
                <input type="time" style={inputStyle} value={form.start}
                  onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Ende</label>
                <input type="time" style={inputStyle} value={form.end}
                  onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={addBlock} disabled={!form.title.trim()}>
              Zeitblock hinzufügen
            </button>
          </div>
        )}

        {/* Weekly grid — scrollable on mobile */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: "var(--s-3)", minWidth: 600 }}>
            {WEEK_DAYS.map(day => (
              <div key={day}>
                <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: "var(--s-2)", color: "var(--c-text-2)", paddingBottom: "var(--s-2)", borderBottom: "2px solid var(--c-border)" }}>
                  {day}
                </div>
                <div style={{ display: "grid", gap: "var(--s-2)" }}>
                  {blocksByDay[day].length === 0 ? (
                    <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-sm)", border: "1px dashed var(--c-border)", fontSize: "var(--text-xs)", color: "var(--c-text-4)", textAlign: "center" }}>
                      Frei
                    </div>
                  ) : blocksByDay[day].map(block => {
                    const cat = TIME_CATEGORIES.find(c => c.id === block.category);
                    return (
                      <div key={block.id} style={{
                        padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)",
                        borderLeft: `3px solid ${cat?.color || "#6b7280"}`,
                        background: (cat?.color || "#6b7280") + "12",
                        fontSize: "var(--text-xs)",
                      }}>
                        <div style={{ fontWeight: 700, color: "var(--c-text)", marginBottom: 2 }}>{block.title}</div>
                        <div style={{ color: "var(--c-text-3)" }}>{block.start}–{block.end}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: cat?.color, fontWeight: 600, marginTop: 2 }}>{cat?.label}</div>
                        <button onClick={() => removeBlock(block.id)} style={{
                          background: "none", border: "none", color: "var(--c-text-4)",
                          cursor: "pointer", padding: 0, fontSize: 11, marginTop: 4,
                        }}>entfernen</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="ceo-section">
        <div className="section-title">Legende</div>
        <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap" }}>
          {TIME_CATEGORIES.map(cat => (
            <div key={cat.id} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: cat.color }} />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Reviews ─────────────────────────────────────────────────────────────
function TabReviews() {
  const [settings, setSettings] = useState(() => lsGet(LS_REVIEWS, DEFAULT_REVIEWS));
  const [saved, setSaved] = useState(false);

  function save() {
    lsSet(LS_REVIEWS, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const Field = ({ fieldKey, label, type = "text", options = null }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {options ? (
        <select style={inputStyle} value={settings[fieldKey]}
          onChange={e => setSettings(s => ({ ...s, [fieldKey]: e.target.value }))}>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </select>
      ) : (
        <input type={type} style={inputStyle} value={settings[fieldKey]}
          onChange={e => setSettings(s => ({ ...s, [fieldKey]: e.target.value }))} />
      )}
    </div>
  );

  const reviewItems = [
    { icon: "📅", label: "Tägliches Briefing", value: `Täglich um ${settings.daily_briefing} Uhr` },
    { icon: "📊", label: "KPI-Review", value: `${settings.weekly_kpi_day}, ${settings.weekly_kpi_time} Uhr` },
    { icon: "🎯", label: "Strategie-Review", value: `${settings.monthly_strategy_date}. des Monats` },
    { icon: "👥", label: "Team-Review", value: `${settings.team_review_day}, ${settings.team_review_time} Uhr` },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Summary first */}
      <div className="ceo-section">
        <div className="section-title">Dein Review-Kalender</div>
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {reviewItems.map(item => (
            <div key={item.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
              background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
            }}>
              <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{item.label}</div>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="ceo-section">
        <div className="section-title">Review-Zeiten konfigurieren</div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "0 0 var(--s-5)" }}>
          Bestimme wann du Reports, KPI-Updates und Reviews sehen möchtest.
        </p>

        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          {[
            { title: "📅 Tägliches Briefing", fields: [{ key: "daily_briefing", label: "Uhrzeit", type: "time" }] },
            { title: "📊 Wöchentlicher KPI-Review", fields: [
              { key: "weekly_kpi_day", label: "Wochentag", options: WEEK_DAYS.map(d => ({ value: d, label: d })) },
              { key: "weekly_kpi_time", label: "Uhrzeit", type: "time" },
            ]},
            { title: "🎯 Monatlicher Strategie-Review", fields: [
              { key: "monthly_strategy_date", label: "Tag im Monat", options: Array.from({length: 28}, (_, i) => ({ value: String(i+1), label: `${i+1}. des Monats` })) },
            ]},
            { title: "👥 Team-Review", fields: [
              { key: "team_review_day", label: "Wochentag", options: WEEK_DAYS.map(d => ({ value: d, label: d })) },
              { key: "team_review_time", label: "Uhrzeit", type: "time" },
            ]},
          ].map(section => (
            <div key={section.title} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
              <div style={{ fontWeight: 700, marginBottom: "var(--s-3)" }}>{section.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--s-3)" }}>
                {section.fields.map(f => (
                  <Field key={f.key} fieldKey={f.key} label={f.label} type={f.type} options={f.options} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" onClick={save} style={{ marginTop: "var(--s-5)", width: "100%" }}>
          {saved ? "✓ Gespeichert" : "Review-Einstellungen speichern"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CommandCenter() {
  const { authHeader } = useAuth();
  const [activeTab, setActiveTab] = useState("heute");
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() =>
    new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()), []);

  useEffect(() => {
    let alive = true;
    setLoadingTasks(true);
    fetch("/api/tasks", { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (alive) setTasks(Array.isArray(data) ? data : (data.tasks || [])); })
      .catch(() => { if (alive) setTasks([]); })
      .finally(() => { if (alive) setLoadingTasks(false); });
    return () => { alive = false; };
  }, []);

  async function handleCreateTask(form) {
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, priority: form.priority, assigned_to: form.assigned_to || null, due_date: form.due_date || null, status: "open" }),
      });
      if (res.ok) {
        const newTask = await res.json();
        setTasks(prev => [newTask, ...prev]);
      }
    } finally { setBusy(false); }
  }

  async function handleUpdateStatus(taskId, newStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } finally { setBusy(false); }
  }

  async function handleDeleteTask(taskId) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE", headers: authHeader() });
      if (res.ok || res.status === 204) setTasks(prev => prev.filter(t => t.id !== taskId));
    } finally { setBusy(false); }
  }

  return (
    <div className="ceo-shell">
      {/* Header */}
      <header className="ceo-hero">
        <div>
          <p className="eyebrow">CEO Command Center</p>
          <h1>Dein Führungscockpit</h1>
          <p className="sub">{today}</p>
        </div>
        <div className="hero-note">
          <span className="dot" />
          <span>Du entscheidest — die KI berät.</span>
        </div>
      </header>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-5)", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", borderRadius: "var(--r-md)", cursor: "pointer",
            border: "1px solid var(--c-border)",
            background: activeTab === tab.id ? "#0f172a" : "var(--c-surface)",
            color: activeTab === tab.id ? "#fff" : "var(--c-text)",
            fontWeight: 600, fontSize: "var(--text-sm)",
            display: "flex", gap: "var(--s-2)", alignItems: "center",
            boxShadow: activeTab === tab.id ? "0 4px 14px rgba(0,0,0,0.15)" : "none",
            transition: "all 0.15s",
          }}>
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "heute" && (
        <TabHeute tasks={tasks} loadingTasks={loadingTasks} onTabChange={setActiveTab} />
      )}
      {activeTab === "aufgaben" && (
        <TabAufgaben
          tasks={tasks}
          loadingTasks={loadingTasks}
          onCreateTask={handleCreateTask}
          onUpdateStatus={handleUpdateStatus}
          onDeleteTask={handleDeleteTask}
          busy={busy}
        />
      )}
      {activeTab === "ziele"    && <TabZiele />}
      {activeTab === "planung"  && <TabPlanung />}
      {activeTab === "kalender" && (
        <CalendarTab
          tasks={tasks}
          blocks={lsGet(LS_BLOCKS, DEFAULT_BLOCKS)}
        />
      )}
      {activeTab === "reviews"  && <TabReviews />}
    </div>
  );
}
