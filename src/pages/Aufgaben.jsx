/* eslint-disable */
// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import StrategyBanner from "../components/StrategyBanner";

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IcoKI = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);
const IcoChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IcoClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IcoFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ── Constants ──────────────────────────────────────────────────────────────────
const COLUMNS = [
  { id: "open",       label: "Offen",     color: "var(--c-text-3)" },
  { id: "in_progress",label: "In Arbeit", color: "#FF9F0A" },
  { id: "done",       label: "Erledigt",  color: "#30D158" },
];

const PRIORITY_META = {
  high:   { color: "#FF3B30", label: "Hoch" },
  medium: { color: "#FF9F0A", label: "Mittel" },
  low:    { color: "#0A84FF", label: "Niedrig" },
};

const FILTER_OPTIONS = [
  { id: "all",        label: "Alle" },
  { id: "mine",       label: "Meine Tasks" },
  { id: "high",       label: "High Priority" },
  { id: "overdue",    label: "Überfällig" },
  { id: "ai_created", label: "Von KI erstellt" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

// ── Task Card ──────────────────────────────────────────────────────────────────
function TaskCard({ task, onMove, onDelete, currentUser }) {
  const overdue = isOverdue(task.due_date) && task.status !== "done";
  const priority = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const nextStatus = { open: "in_progress", in_progress: "done", done: "open" };
  const nextLabel  = { open: "→ Starten", in_progress: "→ Erledigt", done: "↩ Wieder öffnen" };

  return (
    <div className="task-card" style={{
      background: "var(--c-surface)",
      border: "1px solid var(--c-border)",
      borderRadius: "var(--r-md)",
      padding: "var(--s-3)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--s-2)",
      position: "relative",
    }}>
      {/* Priority dot + title */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: priority.color,
          flexShrink: 0, marginTop: 5,
        }} title={priority.label} />
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", lineHeight: 1.4, flex: 1 }}>
          {task.title}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", padding: 0, flexShrink: 0 }}
          aria-label="Task löschen"
        >
          <IcoClose />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p style={{ fontSize: 12, color: "var(--c-text-2)", margin: 0, lineHeight: 1.5 }}>
          {task.description}
        </p>
      )}

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
        {task.assigned_to && (
          <span style={{
            fontSize: 11, background: "var(--c-surface-2)", color: "var(--c-text-2)",
            borderRadius: "var(--r-sm)", padding: "2px 7px",
          }}>
            {task.assigned_to}
          </span>
        )}
        {task.ai_created && (
          <span style={{
            fontSize: 11, background: "rgba(10,132,255,0.12)", color: "#0A84FF",
            borderRadius: "var(--r-sm)", padding: "2px 7px", display: "flex", alignItems: "center", gap: 3,
          }}>
            <IcoKI /> KI
          </span>
        )}
        {task.due_date && (
          <span style={{
            fontSize: 11, marginLeft: "auto",
            color: overdue ? "#FF3B30" : "var(--c-text-3)",
            fontWeight: overdue ? 600 : 400,
          }}>
            {overdue ? "⚠ " : ""}{formatDate(task.due_date)}
          </span>
        )}
      </div>

      {/* Move button */}
      <button
        onClick={() => onMove(task.id, nextStatus[task.status])}
        style={{
          background: "var(--c-surface-2)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-sm)",
          padding: "5px 10px",
          fontSize: 12,
          cursor: "pointer",
          color: "var(--c-text-2)",
          display: "flex", alignItems: "center", gap: 4,
          width: "100%", justifyContent: "center",
        }}
      >
        {nextLabel[task.status]}
      </button>
    </div>
  );
}

// ── Add Task Sheet ─────────────────────────────────────────────────────────────
function AddTaskSheet({ defaultStatus = "open", onAdd, onClose }) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    due_date: "", assigned_to: "", status: defaultStatus,
  });
  const [loading, setLoading] = useState(false);

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    await onAdd({ ...form, title: form.title.trim() });
    setLoading(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, padding: "0 var(--s-3)",
    }} onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--c-surface)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          padding: "var(--s-6)",
          width: "100%", maxWidth: 520,
          display: "flex", flexDirection: "column", gap: "var(--s-4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>Neue Aufgabe</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)" }}>
            <IcoClose />
          </button>
        </div>

        <input
          autoFocus
          required
          placeholder="Aufgabentitel *"
          value={form.title}
          onChange={e => set("title", e.target.value)}
          style={{ padding: "var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)" }}
        />

        <textarea
          placeholder="Beschreibung (optional)"
          value={form.description}
          onChange={e => set("description", e.target.value)}
          rows={2}
          style={{ padding: "var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)", resize: "vertical" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--c-text-2)", display: "block", marginBottom: 4 }}>Priorität</label>
            <select value={form.priority} onChange={e => set("priority", e.target.value)}
              style={{ width: "100%", padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)" }}>
              <option value="high">🔴 Hoch</option>
              <option value="medium">🟡 Mittel</option>
              <option value="low">🔵 Niedrig</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--c-text-2)", display: "block", marginBottom: 4 }}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              style={{ width: "100%", padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)" }}>
              <option value="open">Offen</option>
              <option value="in_progress">In Arbeit</option>
              <option value="done">Erledigt</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--c-text-2)", display: "block", marginBottom: 4 }}>Fälligkeitsdatum</label>
            <input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)}
              style={{ width: "100%", padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--c-text-2)", display: "block", marginBottom: 4 }}>Zugewiesen an</label>
            <input placeholder="Name / E-Mail" value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)}
              style={{ width: "100%", padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", color: "var(--c-text)", fontSize: "var(--text-sm)", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !form.title.trim()}
          style={{
            background: loading ? "var(--c-surface-2)" : "var(--c-primary)",
            color: loading ? "var(--c-text-2)" : "#fff",
            border: "none", borderRadius: "var(--r-sm)",
            padding: "var(--s-3)", fontWeight: 600, fontSize: "var(--text-sm)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Speichern…" : "Aufgabe erstellen"}
        </button>
      </form>
    </div>
  );
}

// ── KI Tasks Sheet ─────────────────────────────────────────────────────────────
function KITasksSheet({ onAdd, onClose, authHeader }) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, []); // eslint-disable-line

  async function loadSuggestions() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/ai-suggestions", { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : (data?.suggestions ?? []));
      } else {
        setSuggestions(FALLBACK_SUGGESTIONS);
      }
    } catch {
      setSuggestions(FALLBACK_SUGGESTIONS);
    } finally {
      setLoading(false);
    }
  }

  function toggle(i) {
    setSelected(s => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    for (const i of selected) {
      await onAdd({ ...suggestions[i], ai_created: true });
    }
    setAdding(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, padding: "0 var(--s-3)",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--c-surface)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          padding: "var(--s-6)",
          width: "100%", maxWidth: 520,
          maxHeight: "80vh", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "var(--s-4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--c-primary)" }}>✦</span> KI-Aufgabenvorschläge
          </h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)" }}>
            <IcoClose />
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {[0,1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: "var(--r-md)" }} />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p style={{ color: "var(--c-text-2)", fontSize: "var(--text-sm)", textAlign: "center", padding: "var(--s-6) 0" }}>
            Keine Vorschläge verfügbar. Füge mehr Daten hinzu.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {suggestions.map((s, i) => (
              <label key={i} style={{
                display: "flex", alignItems: "flex-start", gap: "var(--s-3)",
                padding: "var(--s-3)", borderRadius: "var(--r-md)",
                border: `1px solid ${selected.has(i) ? "var(--c-primary)" : "var(--c-border)"}`,
                background: selected.has(i) ? "rgba(10,132,255,0.06)" : "var(--c-surface-2)",
                cursor: "pointer",
              }}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ marginTop: 2, accentColor: "var(--c-primary)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 2 }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: PRIORITY_META[s.priority]?.color || "#0A84FF",
                      marginRight: 6, verticalAlign: "middle",
                    }} />
                    {s.title}
                  </div>
                  {s.description && <div style={{ fontSize: 12, color: "var(--c-text-2)" }}>{s.description}</div>}
                  {s.estimated_impact && (
                    <div style={{ fontSize: 11, color: "#30D158", marginTop: 2 }}>
                      Erwarteter Impact: {s.estimated_impact}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <button
          onClick={addSelected}
          disabled={selected.size === 0 || adding}
          style={{
            background: selected.size === 0 ? "var(--c-surface-2)" : "var(--c-primary)",
            color: selected.size === 0 ? "var(--c-text-3)" : "#fff",
            border: "none", borderRadius: "var(--r-sm)",
            padding: "var(--s-3)", fontWeight: 600, fontSize: "var(--text-sm)",
            cursor: selected.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          {adding ? "Hinzufügen…" : `${selected.size} Aufgabe${selected.size !== 1 ? "n" : ""} hinzufügen`}
        </button>
      </div>
    </div>
  );
}

const FALLBACK_SUGGESTIONS = [
  { title: "Google My Business Profil optimieren", description: "Öffnungszeiten, Fotos und Beschreibung aktualisieren", priority: "high", estimated_impact: "+12% mehr Klicks" },
  { title: "Kundenbewertungen auf 4,5★ steigern", description: "Follow-up E-Mails nach Kauf einrichten", priority: "high", estimated_impact: "+8% Konversionsrate" },
  { title: "Instagram Posting-Frequenz erhöhen", description: "Mindestens 3x pro Woche posten", priority: "medium", estimated_impact: "+25% Reichweite" },
  { title: "Saisonales Sonderangebot erstellen", description: "Zeitlich begrenztes Angebot für Q2 planen", priority: "medium", estimated_impact: "+5% Umsatz" },
];

// ── Kanban Column ──────────────────────────────────────────────────────────────
function KanbanColumn({ column, tasks, onMove, onDelete, onAddClick, currentUser }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "var(--s-3)",
      minWidth: 0, flex: 1,
    }}>
      {/* Column header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: column.color, flexShrink: 0,
          }} />
          <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>{column.label}</span>
          <span style={{
            fontSize: 11, background: "var(--c-surface-2)", color: "var(--c-text-3)",
            borderRadius: 10, padding: "1px 7px", fontWeight: 600,
          }}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddClick(column.id)}
          style={{
            background: "none", border: "1px solid var(--c-border)",
            borderRadius: "var(--r-sm)", cursor: "pointer",
            color: "var(--c-text-3)", padding: "4px 8px",
            display: "flex", alignItems: "center", gap: 4, fontSize: 12,
          }}
          aria-label={`Aufgabe zu ${column.label} hinzufügen`}
        >
          <IcoPlus /> Neu
        </button>
      </div>

      {/* Task cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", minHeight: 120 }}>
        {tasks.length === 0 ? (
          <div style={{
            border: "2px dashed var(--c-border)",
            borderRadius: "var(--r-md)",
            padding: "var(--s-6) var(--s-3)",
            textAlign: "center",
            color: "var(--c-text-3)", fontSize: 13,
          }}>
            Keine Aufgaben
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onMove={onMove}
              onDelete={onDelete}
              currentUser={currentUser}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Aufgaben() {
  const { authHeader, user } = useAuth();
  const navigate = useNavigate();

  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showAdd, setShowAdd]   = useState(false);
  const [showKI, setShowKI]     = useState(false);
  const [addStatus, setAddStatus] = useState("open");

  useEffect(() => {
    loadTasks();
  }, []); // eslint-disable-line

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", { headers: authHeader() });
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : (data?.tasks ?? []));
    } catch (err) {
      setError(err.message || "Aufgaben konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(taskData) {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(taskData),
      });
      if (!res.ok) throw new Error("Fehler");
      const created = await res.json();
      setTasks(t => [created, ...t]);
    } catch {
      // Optimistic fallback
      setTasks(t => [{ id: Date.now(), ...taskData }, ...t]);
    }
  }

  async function handleMoveTask(id, newStatus) {
    setTasks(t => t.map(task => task.id === id ? { ...task, status: newStatus } : task));
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch { /* optimistic update stays */ }
  }

  async function handleDeleteTask(id) {
    setTasks(t => t.filter(task => task.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: authHeader() });
    } catch { /* optimistic delete stays */ }
  }

  function openAddSheet(status = "open") {
    setAddStatus(status);
    setShowAdd(true);
  }

  // Filter logic
  const filteredTasks = tasks.filter(task => {
    if (activeFilter === "mine") return task.assigned_to === user?.email || task.assigned_to === user?.name;
    if (activeFilter === "high") return task.priority === "high";
    if (activeFilter === "overdue") return isOverdue(task.due_date) && task.status !== "done";
    if (activeFilter === "ai_created") return task.ai_created;
    return true;
  });

  // Stats
  const totalOpen     = tasks.filter(t => t.status === "open").length;
  const totalProgress = tasks.filter(t => t.status === "in_progress").length;
  const totalDone     = tasks.filter(t => t.status === "done").length;
  const overdueCount  = tasks.filter(t => isOverdue(t.due_date) && t.status !== "done").length;

  return (
    <div style={{ padding: "var(--s-6) var(--s-6) 120px", maxWidth: 1200, margin: "0 auto" }}>
      <StrategyBanner />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-6)", flexWrap: "wrap", gap: "var(--s-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: 0 }}>Aufgaben</h1>
          <p style={{ color: "var(--c-text-2)", fontSize: "var(--text-sm)", margin: "4px 0 0" }}>
            {totalOpen} offen · {totalProgress} in Arbeit · {totalDone} erledigt
            {overdueCount > 0 && <span style={{ color: "#FF3B30", marginLeft: 8 }}>· {overdueCount} überfällig</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <button
            onClick={() => setShowKI(true)}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s-2)",
              background: "rgba(10,132,255,0.1)", color: "var(--c-primary)",
              border: "1px solid rgba(10,132,255,0.25)",
              borderRadius: "var(--r-sm)", padding: "var(--s-2) var(--s-4)",
              fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer",
            }}
          >
            <IcoKI /> KI-Vorschläge
          </button>
          <button
            onClick={() => openAddSheet("open")}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s-2)",
              background: "var(--c-primary)", color: "#fff",
              border: "none", borderRadius: "var(--r-sm)",
              padding: "var(--s-2) var(--s-4)",
              fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer",
            }}
          >
            <IcoPlus /> Neue Aufgabe
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: "flex", gap: "var(--s-2)", overflowX: "auto",
        marginBottom: "var(--s-5)", paddingBottom: 2,
      }}>
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            style={{
              padding: "var(--s-2) var(--s-4)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--c-border)",
              background: activeFilter === f.id ? "var(--c-primary)" : "var(--c-surface)",
              color: activeFilter === f.id ? "#fff" : "var(--c-text-2)",
              fontWeight: activeFilter === f.id ? 600 : 400,
              fontSize: "var(--text-sm)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {f.label}
            {f.id === "overdue" && overdueCount > 0 && (
              <span style={{
                display: "inline-block", background: "#FF3B30", color: "#fff",
                borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: "1px 5px", marginLeft: 5,
              }}>
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)",
          borderRadius: "var(--r-md)", padding: "var(--s-4)",
          color: "#FF3B30", fontSize: "var(--text-sm)", marginBottom: "var(--s-4)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {error}
          <button onClick={loadTasks} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF3B30", fontWeight: 600, fontSize: "var(--text-sm)" }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--s-5)" }}>
          {COLUMNS.map(col => (
            <div key={col.id} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
              <div className="skeleton" style={{ height: 28, width: "60%", borderRadius: "var(--r-sm)" }} />
              {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--r-md)" }} />)}
            </div>
          ))}
        </div>
      ) : (
        /* Kanban Board */
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-5)",
          alignItems: "start",
        }}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={filteredTasks.filter(t => t.status === col.id)}
              onMove={handleMoveTask}
              onDelete={handleDeleteTask}
              onAddClick={openAddSheet}
              currentUser={user}
            />
          ))}
        </div>
      )}

      {/* Sheets */}
      {showAdd && (
        <AddTaskSheet
          defaultStatus={addStatus}
          onAdd={handleAddTask}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showKI && (
        <KITasksSheet
          onAdd={handleAddTask}
          onClose={() => setShowKI(false)}
          authHeader={authHeader}
        />
      )}
    </div>
  );
}
