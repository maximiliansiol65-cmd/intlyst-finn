import { useEffect, useState } from "react";

const COLUMNS = [
  { key: "open", label: "Offen", color: "#6366f1" },
  { key: "in_progress", label: "In Arbeit", color: "#f59e0b" },
  { key: "done", label: "Erledigt", color: "#10b981" },
];

const PRIORITY_COLORS = {
  high: { color: "#ef4444", bg: "#ef444415", label: "Hoch" },
  medium: { color: "#f59e0b", bg: "#f59e0b15", label: "Mittel" },
  low: { color: "#6366f1", bg: "#6366f115", label: "Niedrig" },
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function TaskCard({ task, onUpdate, onDelete }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const [loading, setLoading] = useState(false);

  async function advanceStatus() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/next-status`, { method: "PATCH" });
      const updated = await res.json();
      onUpdate(updated);
    } catch {
      // Intentionally ignored.
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("Task loeschen?")) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onDelete(task.id);
  }

  return (
    <div
      style={{
        background: "#f5f5f7",
        border: "1px solid #1e1e2e",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 4,
            background: p.bg,
            color: p.color,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {p.label}
        </span>
        <button
          onClick={handleDelete}
          style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 14 }}
        >
          x
        </button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", lineHeight: 1.4 }}>{task.title}</div>

      {task.description && (
        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
          {task.description.length > 80 ? `${task.description.slice(0, 80)}...` : task.description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 10, color: "#334155" }}>
          {task.assigned_to && <span>-&gt; {task.assigned_to}</span>}
          {task.due_date && <span style={{ marginLeft: task.assigned_to ? 8 : 0 }}>Bis {formatDate(task.due_date)}</span>}
        </div>
        <button
          onClick={advanceStatus}
          disabled={loading}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 5,
            border: "1px solid #1e1e2e",
            background: "transparent",
            color: "#6366f1",
            cursor: "pointer",
          }}
        >
          {loading ? "..." : task.status === "done" ? "Zurueck" : "Weiter"}
        </button>
      </div>
    </div>
  );
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", assigned_to: "", due_date: "" });

  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      setTasks([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  function handleUpdate(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleDelete(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function createTask() {
    if (!newTask.title.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTask.title,
        priority: newTask.priority,
        assigned_to: newTask.assigned_to || undefined,
        due_date: newTask.due_date || undefined,
      }),
    });
    const created = await res.json();
    setTasks((prev) => [created, ...prev]);
    setNewTask({ title: "", priority: "medium", assigned_to: "", due_date: "" });
    setShowForm(false);
  }

  const byStatus = (status) => tasks.filter((t) => t.status === status);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#374151",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>Tasks</h1>
          <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>{tasks.length} Tasks gesamt</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Neuer Task
        </button>
      </div>

      {showForm && (
        <div
          style={{
            background: "#f5f5f7",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: "16px 18px",
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "1fr 140px 160px 120px auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            placeholder="Task-Titel"
            value={newTask.title}
            onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && createTask()}
            style={{
              background: "#ffffff",
              border: "1px solid #1e1e2e",
              borderRadius: 7,
              padding: "7px 10px",
              color: "#374151",
              fontSize: 12,
            }}
          />
          <select
            value={newTask.priority}
            onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
            style={{
              background: "#ffffff",
              border: "1px solid #1e1e2e",
              borderRadius: 7,
              padding: "7px 10px",
              color: "#374151",
              fontSize: 12,
            }}
          >
            <option value="high">Hoch</option>
            <option value="medium">Mittel</option>
            <option value="low">Niedrig</option>
          </select>
          <input
            placeholder="Zugewiesen an"
            value={newTask.assigned_to}
            onChange={(e) => setNewTask((p) => ({ ...p, assigned_to: e.target.value }))}
            style={{
              background: "#ffffff",
              border: "1px solid #1e1e2e",
              borderRadius: 7,
              padding: "7px 10px",
              color: "#374151",
              fontSize: 12,
            }}
          />
          <input
            type="date"
            value={newTask.due_date}
            onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))}
            style={{
              background: "#ffffff",
              border: "1px solid #1e1e2e",
              borderRadius: 7,
              padding: "7px 10px",
              color: "#374151",
              fontSize: 12,
            }}
          />
          <button
            onClick={createTask}
            style={{
              background: "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Erstellen
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Laden...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
          {COLUMNS.map((col) => (
            <div key={col.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, display: "inline-block" }} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: "#e8e8ed",
                    color: "#475569",
                  }}
                >
                  {byStatus(col.key).length}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byStatus(col.key).map((task) => (
                  <TaskCard key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
                {byStatus(col.key).length === 0 && (
                  <div
                    style={{
                      border: "1px dashed #1e1e2e",
                      borderRadius: 10,
                      padding: "20px",
                      textAlign: "center",
                      color: "#334155",
                      fontSize: 12,
                    }}
                  >
                    Keine Tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
