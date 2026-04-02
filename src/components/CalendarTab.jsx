/* eslint-disable */
/**
 * CalendarTab – reusable calendar component for CommandCenter.
 * Shows tasks (by due_date) and time-planning blocks side by side.
 */
import { useState, useMemo } from "react";

const PRIORITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
const PRIORITY_LABELS = { high: "Hoch", medium: "Mittel", low: "Niedrig" };
const WEEK_DAYS_FULL  = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const WEEK_DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
];
const TIME_CATEGORIES = [
  { id: "marketing",  label: "Marketing",  color: "#3b82f6" },
  { id: "vertrieb",   label: "Vertrieb",   color: "#10b981" },
  { id: "content",    label: "Content",    color: "#8b5cf6" },
  { id: "strategie",  label: "Strategie",  color: "#f59e0b" },
  { id: "analyse",    label: "Analyse",    color: "#ef4444" },
  { id: "review",     label: "Review",     color: "#6366f1" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isToday(d) {
  if (!d) return false;
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day  = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ currentDate, tasks, onSelectDay, selectedDay }) {
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const grid = useMemo(() => {
    const firstDay   = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
    return cells;
  }, [year, month]);

  function tasksForDay(date) {
    if (!date) return [];
    const ds = toDateStr(date);
    return tasks.filter(t => t.due_date === ds);
  }

  return (
    <>
      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: "var(--s-2)" }}>
        {WEEK_DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {grid.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} style={{ minHeight: 76 }} />;
          const dayTasks   = tasksForDay(date);
          const today      = isToday(date);
          const selected   = selectedDay && toDateStr(date) === toDateStr(selectedDay);
          const hasOverdue = dayTasks.some(t => t.status !== "done" && new Date(t.due_date) < new Date());

          return (
            <div
              key={i}
              onClick={() => onSelectDay(selected ? null : date)}
              style={{
                minHeight: 76,
                padding: "6px",
                borderRadius: "var(--r-sm)",
                border: selected
                  ? "2px solid #0f172a"
                  : today
                  ? "2px solid #3b82f6"
                  : `1px solid ${hasOverdue && dayTasks.length > 0 ? "#fca5a5" : "var(--c-border)"}`,
                background: today ? "#eff6ff" : hasOverdue && dayTasks.length > 0 ? "#fff5f5" : "var(--c-surface)",
                cursor: "pointer",
                transition: "all 0.1s",
              }}
            >
              <div style={{
                fontSize: "var(--text-xs)", fontWeight: today ? 800 : 500,
                color: today ? "#1d4ed8" : "var(--c-text-2)",
                marginBottom: 4,
              }}>{date.getDate()}</div>
              <div style={{ display: "grid", gap: 2 }}>
                {dayTasks.slice(0, 3).map(t => (
                  <div key={t.id} style={{
                    fontSize: 10, padding: "2px 4px", borderRadius: 3,
                    background: (PRIORITY_COLORS[t.priority] || "#6b7280") + "22",
                    color: PRIORITY_COLORS[t.priority] || "#6b7280",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontWeight: 600,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                  }}>{t.title}</div>
                ))}
                {dayTasks.length > 3 && (
                  <div style={{ fontSize: 10, color: "var(--c-text-3)", fontWeight: 500 }}>+{dayTasks.length - 3} mehr</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ currentDate, tasks, blocks }) {
  const weekDates = useMemo(() => {
    const day  = currentDate.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() + diff);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  function tasksForDay(date) {
    return tasks.filter(t => t.due_date === toDateStr(date));
  }
  function blocksForDay(dayName) {
    return blocks.filter(b => b.day === dayName).sort((a, b) => a.start.localeCompare(b.start));
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: "var(--s-3)", minWidth: 620 }}>
        {weekDates.map((date, i) => {
          const today      = isToday(date);
          const dayTasks   = tasksForDay(date);
          const dayBlocks  = blocksForDay(WEEK_DAYS_FULL[i]);

          return (
            <div key={i}>
              {/* Day header */}
              <div style={{
                textAlign: "center", padding: "var(--s-2)",
                marginBottom: "var(--s-2)", borderRadius: "var(--r-sm)",
                background: today ? "#1d4ed8" : "var(--c-surface-2)",
                color: today ? "#fff" : "var(--c-text-2)",
                fontWeight: 700, fontSize: "var(--text-sm)",
              }}>
                {WEEK_DAYS_FULL[i]}
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                  {date.toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                </div>
              </div>

              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {/* Time blocks */}
                {dayBlocks.map(block => {
                  const cat = TIME_CATEGORIES.find(c => c.id === block.category);
                  return (
                    <div key={block.id} style={{
                      padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)",
                      borderLeft: `3px solid ${cat?.color || "#6b7280"}`,
                      background: (cat?.color || "#6b7280") + "14",
                      fontSize: "var(--text-xs)",
                    }}>
                      <div style={{ fontWeight: 700, color: "var(--c-text)", marginBottom: 2 }}>{block.title}</div>
                      <div style={{ color: "var(--c-text-3)" }}>{block.start}–{block.end}</div>
                      <div style={{ color: cat?.color, fontWeight: 600, fontSize: 10, marginTop: 2 }}>{cat?.label}</div>
                    </div>
                  );
                })}

                {/* Tasks */}
                {dayTasks.map(t => (
                  <div key={t.id} style={{
                    padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)",
                    border: `1px solid ${(PRIORITY_COLORS[t.priority] || "#6b7280")}40`,
                    background: (PRIORITY_COLORS[t.priority] || "#6b7280") + "10",
                    fontSize: "var(--text-xs)",
                  }}>
                    <div style={{
                      fontWeight: 600, color: "var(--c-text)", marginBottom: 2,
                      textDecoration: t.status === "done" ? "line-through" : "none",
                    }}>✅ {t.title}</div>
                    {t.assigned_to && <div style={{ color: "var(--c-text-3)" }}>👤 {t.assigned_to}</div>}
                    <div style={{ color: PRIORITY_COLORS[t.priority] || "#6b7280", fontWeight: 600, marginTop: 2, fontSize: 10 }}>
                      {PRIORITY_LABELS[t.priority] || t.priority}
                    </div>
                  </div>
                ))}

                {dayBlocks.length === 0 && dayTasks.length === 0 && (
                  <div style={{
                    padding: "var(--s-4)", border: "1px dashed var(--c-border)",
                    borderRadius: "var(--r-sm)", fontSize: "var(--text-xs)",
                    color: "var(--c-text-4)", textAlign: "center",
                  }}>Frei</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────
function DayDetail({ date, tasks }) {
  if (!date) return null;
  const dayTasks = tasks.filter(t => t.due_date === toDateStr(date));

  return (
    <div style={{ padding: "var(--s-4)", background: "var(--c-surface-2)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
      <div style={{ fontWeight: 700, marginBottom: "var(--s-3)", fontSize: "var(--text-sm)" }}>
        {date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
      </div>
      {dayTasks.length === 0 ? (
        <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Keine Aufgaben für diesen Tag.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {dayTasks.map(t => (
            <div key={t.id} style={{
              display: "flex", gap: "var(--s-3)", alignItems: "center",
              padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)",
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[t.priority] || "#6b7280", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600, fontSize: "var(--text-xs)",
                  textDecoration: t.status === "done" ? "line-through" : "none",
                }}>{t.title}</div>
                {t.assigned_to && <div style={{ fontSize: 11, color: "var(--c-text-3)" }}>👤 {t.assigned_to}</div>}
              </div>
              <span style={{
                padding: "2px 7px", borderRadius: "999px", fontSize: 10, fontWeight: 600,
                background: (PRIORITY_COLORS[t.priority] || "#6b7280") + "20",
                color: PRIORITY_COLORS[t.priority] || "#6b7280",
              }}>{PRIORITY_LABELS[t.priority] || t.priority}</span>
              {t.status === "done" && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: "999px", background: "#dcfce7", color: "#16a34a", fontWeight: 600 }}>Erledigt</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main CalendarTab Export ──────────────────────────────────────────────────
export default function CalendarTab({ tasks = [], blocks = [] }) {
  const [viewMode, setViewMode]     = useState("monat");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  function prevPeriod() {
    const d = new Date(currentDate);
    if (viewMode === "monat") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
    setSelectedDay(null);
  }
  function nextPeriod() {
    const d = new Date(currentDate);
    if (viewMode === "monat") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
    setSelectedDay(null);
  }
  function goToday() {
    setCurrentDate(new Date());
    setSelectedDay(null);
  }

  const weekForTitle = useMemo(() => {
    if (viewMode !== "woche") return null;
    const day  = currentDate.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon  = new Date(currentDate);
    mon.setDate(currentDate.getDate() + diff);
    const fri  = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return { mon, fri, kw: getWeekNumber(mon) };
  }, [currentDate, viewMode]);

  const title = viewMode === "monat"
    ? `${MONTH_NAMES[month]} ${year}`
    : weekForTitle
    ? `KW ${weekForTitle.kw} · ${weekForTitle.mon.toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${weekForTitle.fri.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`
    : "";

  // Task stats
  const totalTasks   = tasks.length;
  const openTasks    = tasks.filter(t => t.status !== "done").length;
  const overdueTasks = tasks.filter(t => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date()).length;

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--s-3)" }}>
        {[
          { label: "Aufgaben gesamt", value: totalTasks, color: "var(--c-text)" },
          { label: "Offen",           value: openTasks,  color: "#f59e0b"       },
          { label: "Überfällig",      value: overdueTasks, color: overdueTasks > 0 ? "#ef4444" : "var(--c-text-3)" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
          }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Calendar card */}
      <div className="ceo-section">
        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-5)", flexWrap: "wrap", gap: "var(--s-3)" }}>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <button className="btn btn-secondary btn-sm" onClick={prevPeriod}>←</button>
            <button className="btn btn-secondary btn-sm" onClick={goToday}>Heute</button>
            <button className="btn btn-secondary btn-sm" onClick={nextPeriod}>→</button>
          </div>
          <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            {["monat", "woche"].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: "6px 14px", borderRadius: "var(--r-sm)", cursor: "pointer",
                border: "1px solid var(--c-border)",
                background: viewMode === m ? "#0f172a" : "var(--c-surface)",
                color: viewMode === m ? "#fff" : "var(--c-text)",
                fontWeight: 600, fontSize: "var(--text-xs)",
              }}>{m === "monat" ? "Monat" : "Woche"}</button>
            ))}
          </div>
        </div>

        {viewMode === "monat" ? (
          <MonthView
            currentDate={currentDate}
            tasks={tasks}
            onSelectDay={setSelectedDay}
            selectedDay={selectedDay}
          />
        ) : (
          <WeekView currentDate={currentDate} tasks={tasks} blocks={blocks} />
        )}
      </div>

      {/* Day detail (only in month view) */}
      {viewMode === "monat" && selectedDay && (
        <div className="ceo-section" style={{ paddingTop: "var(--s-4)" }}>
          <DayDetail date={selectedDay} tasks={tasks} />
        </div>
      )}

      {/* Legend */}
      <div className="ceo-section">
        <div className="section-title">Legende</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: "var(--s-2)" }}>Aufgaben-Priorität</div>
            <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                <div key={key} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: PRIORITY_COLORS[key] }} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", marginBottom: "var(--s-2)" }}>Zeitblöcke</div>
            <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
              {TIME_CATEGORIES.map(cat => (
                <div key={cat.id} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: cat.color }} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>{cat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
