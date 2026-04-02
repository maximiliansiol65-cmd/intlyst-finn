import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + "T00:00:00");
  return due < today;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_MAP = {
  high:   { label: "Hoch",    cls: "badge badge-danger"  },
  medium: { label: "Mittel",  cls: "badge badge-warning" },
  low:    { label: "Niedrig", cls: "badge badge-neutral" },
};

const COLUMN_META = {
  open:        { label: "Offen",     dot: "var(--c-primary)", badge: "badge badge-info"    },
  in_progress: { label: "In Arbeit", dot: "var(--c-warning)", badge: "badge badge-warning" },
  done:        { label: "Erledigt",  dot: "var(--c-success)", badge: "badge badge-success" },
};

const COLUMNS = ["open", "in_progress", "done"];

const ROLE_RULES = [
  { label: "CMO", match: ["marketing", "growth", "campaign", "content", "performance"] },
  { label: "CFO", match: ["finance", "finanzen", "cfo", "budget", "cash", "profit"] },
  { label: "Strategist", match: ["strategie", "strateg", "market", "analyse", "research"] },
  { label: "Assistant", match: ["assistant", "assist", "support", "ops", "admin", "office"] },
];

function inferRole(task) {
  const haystack = `${task?.assigned_to || ""} ${task?.title || ""} ${task?.description || ""} ${task?.goal || ""}`.toLowerCase();
  const matched = ROLE_RULES.find((rule) => rule.match.some((token) => haystack.includes(token)));
  return matched?.label || "Assistant";
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        marginBottom: "var(--s-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="skeleton" style={{ width: 50, height: 20, borderRadius: "var(--r-full)" }} />
        <div className="skeleton" style={{ width: 22, height: 22, borderRadius: "var(--r-sm)" }} />
      </div>
      <div className="skeleton skeleton-text" style={{ width: "82%" }} />
      <div className="skeleton skeleton-text" style={{ width: "56%" }} />
      <div
        className="skeleton"
        style={{ width: 76, height: 26, borderRadius: "var(--r-sm)", marginTop: "var(--s-1)" }}
      />
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onAdvance, onDelete, advancingId, deletingId }) {
  const prio = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const overdue = isOverdue(task.due_date) && task.status !== "done";
  const isDone = task.status === "done";
  const isAdvancing = advancingId === task.id;
  const isDeleting = deletingId === task.id;

  const advanceLabel =
    task.status === "open" ? "Weiter →" :
    task.status === "in_progress" ? "Erledigen ✓" :
    null;

  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: `1px solid ${overdue ? "var(--c-danger)" : "var(--c-border)"}`,
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        marginBottom: "var(--s-3)",
        opacity: isDone ? 0.7 : 1,
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-2)",
        transition:
          "opacity var(--dur-base) ease, border-color var(--dur-base) ease, box-shadow var(--dur-base) ease",
      }}
    >
      {/* Row 1: Priority + Delete */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-2)" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className={prio.cls}>{prio.label}</span>
          {task.priority_stage && (
            <span className="badge badge-primary badge-sm">{task.priority_stage}</span>
          )}
          {typeof task.impact_score_calc === "number" && (
            <span className="badge badge-neutral badge-sm">Impact {task.impact_score_calc}</span>
          )}
        </div>
        <button
          className="btn btn-ghost btn-icon-sm"
          onClick={() => onDelete(task.id)}
          disabled={isDeleting}
          aria-label="Task löschen"
          style={{ color: "var(--c-text-3)", fontSize: "var(--text-lg)", lineHeight: 1, flexShrink: 0 }}
        >
          {isDeleting ? <span className="spinner spinner-sm" /> : "×"}
        </button>
      </div>

      {/* Row 2: Title */}
      <div
        style={{
          fontSize: "15px",
          fontWeight: 500,
          color: "var(--c-text)",
          lineHeight: "var(--lh-base)",
        }}
      >
        {task.title}
      </div>

      {/* Row 3: Assigned + Due date */}
      {(task.assigned_to || task.due_date) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            flexWrap: "wrap",
          }}
        >
          {task.assigned_to && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--c-text-3)",
                background: "var(--c-surface-3)",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--r-full)",
                padding: "2px 8px",
                whiteSpace: "nowrap",
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {task.assigned_to}
            </span>
          )}
          {task.due_date && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: overdue ? "var(--c-danger)" : "var(--c-text-3)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {overdue ? "Überfällig · " : ""}
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
      )}

      {/* Footer: Advance button */}
      {advanceLabel && (
        <div style={{ marginTop: "var(--s-1)" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAdvance(task)}
            disabled={isAdvancing}
            style={{ color: "var(--c-primary)", paddingLeft: 0 }}
          >
            {isAdvancing ? <span className="spinner spinner-sm" /> : advanceLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ── NewTaskForm ───────────────────────────────────────────────────────────────

function NewTaskForm({ onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({
    title: "",
    priority: "medium",
    assigned_to: "",
    due_date: "",
  });

  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--c-surface-2)",
        border: "1px solid var(--c-border-2)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-4)",
        marginBottom: "var(--s-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
        animation: "slideDown var(--dur-base) var(--ease-out) both",
      }}
    >
      {/* Title */}
      <div className="form-group">
        <label className="form-label">Titel *</label>
        <input
          ref={titleRef}
          className="input input-sm"
          placeholder="Task-Titel eingeben…"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </div>

      {/* Priority */}
      <div className="form-group">
        <label className="form-label">Priorität</label>
        <select
          className="select"
          style={{ padding: "7px 36px 7px 10px", fontSize: "var(--text-sm)" }}
          value={form.priority}
          onChange={(e) => set("priority", e.target.value)}
        >
          <option value="high">Hoch</option>
          <option value="medium">Mittel</option>
          <option value="low">Niedrig</option>
        </select>
      </div>

      {/* Assigned to */}
      <div className="form-group">
        <label className="form-label">Zugewiesen an</label>
        <input
          className="input input-sm"
          placeholder="Name der Person"
          value={form.assigned_to}
          onChange={(e) => set("assigned_to", e.target.value)}
        />
      </div>

      {/* Due date */}
      <div className="form-group">
        <label className="form-label">Fälligkeitsdatum</label>
        <input
          type="date"
          className="input input-sm"
          value={form.due_date}
          onChange={(e) => set("due_date", e.target.value)}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-1)" }}>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={saving || !form.title.trim()}
        >
          {saving ? <span className="spinner spinner-sm" /> : "Erstellen"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          disabled={saving}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

// ── KanbanColumn ──────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  loading,
  showForm,
  onToggleForm,
  onCreateTask,
  saving,
  onAdvance,
  onDelete,
  advancingId,
  deletingId,
}) {
  const meta = COLUMN_META[status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        background: "var(--c-surface-2)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--r-lg)",
        padding: "var(--s-4)",
      }}
    >
      {/* Column Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          marginBottom: "var(--s-4)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "var(--r-full)",
            background: meta.dot,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          className="label"
          style={{ flex: 1, color: "var(--c-text-2)" }}
        >
          {meta.label}
        </span>
        <span className={meta.badge}>
          {loading ? "—" : tasks.length}
        </span>
      </div>

      {/* New Task Form (Offen column only) */}
      {status === "open" && showForm && (
        <NewTaskForm
          onSubmit={onCreateTask}
          onCancel={onToggleForm}
          saving={saving}
        />
      )}

      {/* Scrollable Task List */}
      <div
        style={{
          overflowY: "auto",
          maxHeight: "calc(100vh - 280px)",
          paddingRight: "2px",
        }}
      >
        {/* Skeletons while loading */}
        {loading && [1, 2, 3].map((i) => <SkeletonCard key={i} />)}

        {/* Task cards */}
        {!loading &&
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onAdvance={onAdvance}
              onDelete={onDelete}
              advancingId={advancingId}
              deletingId={deletingId}
            />
          ))}

        {/* Empty state */}
        {!loading && tasks.length === 0 && (
          <div
            style={{
              border: "1px dashed var(--c-border-2)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-6) var(--s-4)",
              textAlign: "center",
              color: "var(--c-text-4)",
              fontSize: "var(--text-sm)",
            }}
          >
            Keine Tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tasks Page ────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { authHeader } = useAuth();
  const { profile } = useCompanyProfile();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priorityFeed, setPriorityFeed] = useState(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [focusOnly, setFocusOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancingId, setAdvancingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTasks() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      setError("Tasks konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPriorityFeed() {
    setPriorityLoading(true);
    try {
      const res = await fetch("/api/tasks/prioritized", { headers: authHeader() });
      if (res.ok) {
        setPriorityFeed(await res.json());
      }
    } finally {
      setPriorityLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    loadPriorityFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived Stats ─────────────────────────────────────────────────────────

  const focusIds = (priorityFeed?.ceo_focus || []).map((t) => t.id);
  const tasksForView = focusOnly && focusIds.length ? tasks.filter((t) => focusIds.includes(t.id)) : tasks;
  const priorityLookup = new Map((priorityFeed?.all || []).map((t) => [t.id, t]));
  const tasksAugmented = tasksForView.map((t) => (priorityLookup.get(t.id) ? { ...t, ...priorityLookup.get(t.id) } : t));

  const total          = tasksAugmented.length;
  const openCount      = tasksAugmented.filter((t) => t.status === "open").length;
  const inProgCount    = tasksAugmented.filter((t) => t.status === "in_progress").length;
  const doneCount      = tasksAugmented.filter((t) => t.status === "done").length;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount   = tasksAugmented.filter((t) => isOverdue(t.due_date) && t.status !== "done").length;
  const unassignedCount = tasksAugmented.filter((t) => t.status !== "done" && !t.assigned_to).length;
  const unlinkedCount = tasksAugmented.filter((t) => t.status !== "done" && !(t.goal || t.expected_result || (t.kpis && t.kpis.length))).length;
  const roleCoverage = ROLE_RULES.map((rule) => ({
    role: rule.label,
    count: tasksAugmented.filter((task) => task.status !== "done" && inferRole(task) === rule.label).length,
  }));

  const byStatus = (status) => tasksAugmented.filter((t) => t.status === status);

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate(form) {
    setSaving(true);

    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      title: form.title.trim(),
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      status: "open",
    };

    setTasks((prev) => [optimistic, ...prev]);
    setShowForm(false);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          title: form.title.trim(),
          priority: form.priority,
          ...(form.assigned_to && { assigned_to: form.assigned_to }),
          ...(form.due_date    && { due_date: form.due_date }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    } catch {
      // Rollback optimistic insert and re-open form
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setShowForm(true);
    } finally {
      setSaving(false);
    }
  }

  function handleCreateSuggestedTask(item) {
    handleCreate({
      title: item.title,
      priority: item.priority || "medium",
      assigned_to: item.assigned_to || "",
      due_date: "",
    });
  }

  // ── Advance Status ────────────────────────────────────────────────────────

  async function handleAdvance(task) {
    const nextStatus = task.status === "open" ? "in_progress" : "done";
    setAdvancingId(task.id);

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      // Rollback
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
    } finally {
      setAdvancingId(null);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id) {
    setDeletingId(id);

    const snapshot = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback
      if (snapshot) {
        setTasks((prev) => [snapshot, ...prev.filter((t) => t.id !== id)]);
      }
    } finally {
      setDeletingId(null);
    }
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (error && !loading && tasks.length === 0) {
    return (
      <div className="page-enter page-content">
        <div className="error-state">
          <div className="error-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: "var(--c-text)",
            }}
          >
            Fehler beim Laden
          </p>
          <p style={{ color: "var(--c-text-2)", fontSize: "var(--text-md)" }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={loadTasks}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter page-content">
      {/* ── Page Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--s-4)",
          marginBottom: "var(--s-6)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="text-title">{profile.tasks.title}</h1>
          <p style={{ margin: "8px 0 0", color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
            {profile.tasks.description}
          </p>

          {/* Stats Strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
              marginTop: "var(--s-3)",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Gesamt",        value: total         },
              { label: "Offen",         value: openCount     },
              { label: "In Arbeit",     value: inProgCount   },
              { label: "Erledigt",      value: doneCount     },
              { label: "Abschlussrate", value: `${completionRate}%` },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--s-1)",
                  padding: "4px 10px",
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-border)",
                  borderRadius: "var(--r-full)",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  className="tabular"
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    color: "var(--c-text-2)",
                  }}
                >
                  {loading ? "—" : stat.value}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--c-text-3)",
                  }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "× Schließen" : "+ Aufgabe verteilen"}
        </button>
      </div>

      <div
        className="card"
        style={{
          padding: "var(--s-4)",
          marginBottom: "var(--s-5)",
          border: "1px solid var(--c-border)",
          background: "linear-gradient(180deg, var(--c-surface) 0%, var(--c-surface-2) 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Aufgabenkontrolle</div>
            <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
              Prüft operative Engpässe, Rollenverteilung und KPI-Verknüpfung aller offenen Aufgaben.
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <span className={`badge badge-sm ${overdueCount > 0 ? "badge-danger" : "badge-success"}`}>Überfällig {overdueCount}</span>
            <span className={`badge badge-sm ${unassignedCount > 0 ? "badge-warning" : "badge-neutral"}`}>Ohne Owner {unassignedCount}</span>
            <span className={`badge badge-sm ${unlinkedCount > 0 ? "badge-warning" : "badge-neutral"}`}>Ohne KPI {unlinkedCount}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
          <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
            <div className="label" style={{ marginBottom: 8 }}>Kritische Hinweise</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.7 }}>
              {overdueCount > 0 ? `${overdueCount} Aufgaben sind überfällig und sollten zuerst eskaliert oder neu terminiert werden.` : "Aktuell keine überfälligen Aufgaben."}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 8 }}>
              {unassignedCount > 0 ? `${unassignedCount} Aufgaben brauchen sofort eine klare Zuständigkeit.` : "Zuständigkeiten sind aktuell weitgehend sauber verteilt."}
            </div>
          </div>
          <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
            <div className="label" style={{ marginBottom: 8 }}>Teamrollen</div>
            <div style={{ display: "grid", gap: 4 }}>
              {roleCoverage.map((item) => (
                <div key={item.role} style={{ fontSize: "var(--text-sm)", color: "var(--c-text)" }}>
                  {item.role}: {item.count} offene Aufgaben
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
            <div className="label" style={{ marginBottom: 8 }}>Strategische Verknüpfung</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", lineHeight: 1.7 }}>
              {unlinkedCount > 0
                ? `${unlinkedCount} offene Aufgaben sind nicht klar mit KPI oder Ziel verknüpft. Diese Aufgaben sollten präzisiert oder zurückgestellt werden.`
                : "Alle offenen Aufgaben haben eine erkennbare Verbindung zu Ziel oder Ergebnis."}
            </div>
          </div>
        </div>
      </div>

      {/* ── CEO-Prioritäten ── */}
      <div
        className="card"
        style={{
          padding: "var(--s-4)",
          marginBottom: "var(--s-5)",
          border: "1px solid var(--c-border)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{profile.shortLabel}-Fokus</div>
            <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
              Automatisch priorisiert nach Geschäftsimpact und passend für diese Unternehmensversion.
            </div>
          </div>
          <button
            className={`btn ${focusOnly ? "btn-secondary" : "btn-primary"}`}
            onClick={() => setFocusOnly((v) => !v)}
          >
            {focusOnly ? profile.tasks.resetLabel : profile.tasks.focusLabel}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
          {profile.tasks.suggestions.map((item) => (
            <div key={item.title} style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--s-3)", background: "var(--c-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-3)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                  <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-xs)", marginTop: 6 }}>
                    {item.assigned_to || "Team"} · {item.priority === "high" ? "Hohe Priorität" : "Mittlere Priorität"}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => handleCreateSuggestedTask(item)}>
                  Erstellen
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
          {["today_top", "week_top"].map((key) => {
            const title = key === "today_top" ? "Heute" : "Diese Woche";
            const items = priorityFeed?.[key] || [];
            return (
              <div key={key} style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--s-3)", background: "var(--c-surface-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-2)" }}>
                  <div style={{ fontWeight: 700 }}>{title}</div>
                  <span className="badge badge-neutral badge-sm">{items.length || (priorityLoading ? "…" : "0")}</span>
                </div>
                {items.length === 0 ? (
                  <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
                    {priorityLoading ? "Lade..." : "Keine priorisierten Tasks"}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "var(--s-2)" }}>
                    {items.slice(0, 3).map((item) => (
                      <div key={item.id} style={{ display: "grid", gap: 4, borderBottom: "1px dashed var(--c-border)", paddingBottom: "var(--s-2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600 }}>{item.title}</span>
                          <span className="badge badge-info badge-sm">{item.priority_stage || "WICHTIG"}</span>
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                          {item.category_group} · Impact {item.impact_score_calc ?? "—"}
                        </div>
                        {item.due_date && (
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>
                            Fällig: {formatDate(item.due_date)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--s-3)", background: "var(--c-surface-2)" }}>
            <div style={{ fontWeight: 700, marginBottom: "var(--s-2)" }}>{profile.shortLabel}-Fokus</div>
            {priorityFeed?.ceo_focus?.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {priorityFeed.ceo_focus.map((item) => (
                  <span key={item.id} className="badge badge-success badge-sm" style={{ whiteSpace: "nowrap" }}>
                    {item.title}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
                {priorityLoading ? "Lade..." : "Noch keine hochpriorisierten Tasks"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Kanban Board ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-4)",
          alignItems: "start",
        }}
      >
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={loading ? [] : byStatus(status)}
            loading={loading}
            showForm={status === "open" && showForm}
            onToggleForm={() => setShowForm((v) => !v)}
            onCreateTask={handleCreate}
            saving={saving}
            onAdvance={handleAdvance}
            onDelete={handleDelete}
            advancingId={advancingId}
            deletingId={deletingId}
          />
        ))}
      </div>

      {/* ── Inline error banner (non-fatal, after first load) ── */}
      {error && tasks.length > 0 && (
        <div
          style={{
            marginTop: "var(--s-4)",
            padding: "var(--s-3) var(--s-4)",
            background: "var(--c-danger-light)",
            border: "1px solid var(--c-danger)",
            borderRadius: "var(--r-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-4)",
          }}
        >
          <span style={{ fontSize: "var(--text-sm)", color: "var(--c-danger)" }}>
            {error}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--c-danger)" }}
            onClick={loadTasks}
          >
            Erneut versuchen
          </button>
        </div>
      )}
    </div>
  );
}
