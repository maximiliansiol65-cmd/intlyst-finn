import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

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

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priorityFeed, setPriorityFeed] = useState(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [ceoOnly, setCeoOnly] = useState(false);
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

  const ceoFocusIds = (priorityFeed?.ceo_focus || []).map((t) => t.id);
  const tasksForView = ceoOnly && ceoFocusIds.length ? tasks.filter((t) => ceoFocusIds.includes(t.id)) : tasks;
  const priorityLookup = new Map((priorityFeed?.all || []).map((t) => [t.id, t]));
  const tasksAugmented = tasksForView.map((t) => (priorityLookup.get(t.id) ? { ...t, ...priorityLookup.get(t.id) } : t));

  const total          = tasksAugmented.length;
  const openCount      = tasksAugmented.filter((t) => t.status === "open").length;
  const inProgCount    = tasksAugmented.filter((t) => t.status === "in_progress").length;
  const doneCount      = tasksAugmented.filter((t) => t.status === "done").length;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;

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
          <h1 className="text-title">Tasks</h1>

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
          {showForm ? "× Schließen" : "+ Neuer Task"}
        </button>
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
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>Nur die wichtigsten Aufgaben</div>
            <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>
              Automatisch priorisiert nach Umsatz-, Traffic- und Growth-Impact. Heute & diese Woche im Fokus.
            </div>
          </div>
          <button
            className={`btn ${ceoOnly ? "btn-secondary" : "btn-primary"}`}
            onClick={() => setCeoOnly((v) => !v)}
          >
            {ceoOnly ? "Alle anzeigen" : "Nur wichtigste Aufgaben anzeigen"}
          </button>
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
            <div style={{ fontWeight: 700, marginBottom: "var(--s-2)" }}>CEO-Fokus</div>
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
