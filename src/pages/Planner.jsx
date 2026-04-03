/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import PlanBoard from "../components/planner/PlanBoard";
import DailyTodos from "../components/planner/DailyTodos";

const FALLBACK_PLAN = {
  yearly: [
    { title: "Umsatzwachstum sichern", reason: "Strategisches Kernziel", priority: "high", kpis: ["revenue"] },
    { title: "Nachfrage steigern", reason: "Traffic & Conversion ausbauen", priority: "medium", kpis: ["traffic", "conversion_rate"] },
  ],
  monthly: [
    { title: "Top-3 Wachstumsmaßnahmen", reason: "Monatsfokus setzen", priority: "medium", kpis: ["revenue", "traffic"] },
  ],
  weekly: [
    { title: "Marketing Push", reason: "Kurzfristig mehr Nachfrage", priority: "high", kpis: ["traffic"] },
    { title: "Sales Pipeline stärken", reason: "Leads & Deals sichern", priority: "medium", kpis: ["new_customers"] },
  ],
  daily: [
    { title: "3 Social Posts planen", reason: "Traffic & Engagement pushen", priority: "high", eta_minutes: 60 },
    { title: "E-Mail an Bestandskunden", reason: "Reaktivierung & Conversion", priority: "medium", eta_minutes: 45 },
  ],
};

const priorityMeta = {
  high: { label: "Hoch", color: "var(--c-danger)" },
  medium: { label: "Mittel", color: "var(--c-warning)" },
  low: { label: "Niedrig", color: "var(--c-success)" },
};

const DASHBOARD_STORAGE_KEY = "intlyst-planner-dashboard-v1";
const MEMBER_FILTER_STORAGE_KEY = "intlyst-planner-member-filter-v1";
const VIEW_MODE_STORAGE_KEY = "intlyst-planner-view-mode-v1";
const FOCUS_SLOTS_STORAGE_KEY = "intlyst-planner-focus-slots-v1";
const PLANNER_SECTION_STORAGE_KEY = "intlyst-planner-section-v1";

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.items ?? [];
}

function priorityFor(value) {
  return priorityMeta[(value || "medium").toLowerCase()] || priorityMeta.medium;
}

function formatDateRange(start, end) {
  if (!start && !end) return "Kein Zeitraum";
  const formatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
  if (start && end) return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
  return formatter.format(new Date(start || end));
}

function parseWeeklyHours(raw) {
  if (!raw) return 0;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Object.values(parsed || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  } catch {
    return 0;
  }
}

function parseWeeklyHoursMap(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Object.fromEntries(
      Object.entries(parsed || {}).map(([key, value]) => [String(key).toLowerCase(), Number(value) || 0]),
    );
  } catch {
    return {};
  }
}

function weekdayKeyForDate(value) {
  const weekday = new Date(value).getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekday] || "mon";
}

function hoursForDate(scheduleEntry, value) {
  if (!scheduleEntry) return 0;
  const weekly = parseWeeklyHoursMap(scheduleEntry.weekly_hours_json);
  return weekly[weekdayKeyForDate(value)] || 0;
}

function formatHoursLabel(hours) {
  if (!hours) return "Nicht buchbar";
  return `${hours}h verfuegbar`;
}

function calculateBlockDurationHours(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  return Math.round(((end.getTime() - start.getTime()) / 3600000) * 10) / 10;
}

function createDefaultWeeklyHours() {
  return { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6, sat: 0, sun: 0 };
}

function toLocalDateTimeInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatBlockDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(base, days) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function mergeDashboardColumns(baseColumns, storedColumns) {
  if (!storedColumns || typeof storedColumns !== "object") return baseColumns;
  const baseItems = Object.values(baseColumns).flat();
  const itemById = Object.fromEntries(baseItems.map((item) => [item.id, item]));
  const used = new Set();

  const merged = Object.fromEntries(
    Object.keys(baseColumns).map((key) => {
      const storedIds = Array.isArray(storedColumns[key]) ? storedColumns[key] : [];
      const items = storedIds
        .map((id) => itemById[id])
        .filter(Boolean)
        .map((item) => {
          used.add(item.id);
          return item;
        });
      return [key, items];
    }),
  );

  const leftovers = baseItems.filter((item) => !used.has(item.id));
  return {
    team: [...(merged.team || []), ...leftovers.filter((item) => item.id.startsWith("plan-"))],
    mine: [...(merged.mine || []), ...leftovers.filter((item) => item.id.startsWith("myplan-"))],
    today: [...(merged.today || []), ...leftovers.filter((item) => item.id.startsWith("task-"))],
  };
}

function SectionTitle({ eyebrow, title, sub }) {
  return (
    <div style={{ display: "grid", gap: "var(--s-1)" }}>
      {eyebrow ? (
        <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-text-3)", fontWeight: 700 }}>
          {eyebrow}
        </div>
      ) : null}
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
      {sub ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{sub}</div> : null}
    </div>
  );
}

function PlanSummaryCard({ title, value, sub }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-4)", display: "grid", gap: "var(--s-2)" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--c-text)" }}>{value}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{sub}</div>
    </div>
  );
}

function PlanListCard({ title, subtitle, items, emptyText }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
      <div>
        <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {items.length === 0 ? (
        <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => {
            const priority = priorityFor(item.priority);
            return (
              <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-3)" }}>
                  <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{item.title || "Unbenannter Plan"}</div>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: priority.color, background: `${priority.color}18`, padding: "2px 8px", borderRadius: 999 }}>
                    {priority.label}
                  </span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                  {formatDateRange(item.period_start, item.period_end)}
                </div>
                {item.owner ? (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>
                    Verantwortlich: <strong>{item.owner}</strong>
                  </div>
                ) : null}
                {item.teamName ? (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-2)" }}>
                    Team: <strong>{item.teamName}</strong>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamMatrix({ rows, selectedMemberId, onFocusMember, onPrefillTask, onPrefillBlock }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="CEO-Sicht"
        title="Wer macht was, wann, mit welchem Status"
        sub="Tag 4 macht die Matrix steuerbarer: heute, diese Woche, überfällig und Belastung bleiben direkt sichtbar."
      />
      {rows.length === 0 ? (
        <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Noch keine Teamdaten verfügbar.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1.2fr) repeat(9, minmax(84px, 1fr))",
                gap: "var(--s-3)",
                alignItems: "center",
                padding: "var(--s-3)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--c-border)",
                background: "var(--c-surface-2)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{row.name}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>
                  {row.role} {row.specialty ? `· ${row.specialty}` : ""}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Team</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{row.teamName || "Noch offen"}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Offen</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{row.openTasks}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Heute</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{row.todayFocus}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Heute fällig</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{row.dueToday}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Überfällig</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: row.overdueTasks ? "var(--c-danger)" : "var(--c-text)" }}>{row.overdueTasks}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Plan</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{row.planTitle}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Wann</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{row.nextBlock || "Noch offen"}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Heute verf.</div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: row.availabilityColor, background: `${row.availabilityColor}18`, padding: "4px 8px", borderRadius: 999, width: "fit-content" }}>
                  {row.availabilityLabel}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4 }}>
                  {row.bookedToday}h geplant
                </div>
              </div>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Belastung</div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: row.loadColor, background: `${row.loadColor}18`, padding: "4px 8px", borderRadius: 999, width: "fit-content" }}>
                  {row.loadLabel}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => onFocusMember?.(row.id)}>
                  {String(selectedMemberId) === String(row.id) ? "Im Fokus" : "Fokus"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => onPrefillTask?.(row.id)}>
                  Task
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => onPrefillBlock?.(row.id)}>
                  Block
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekBoard({ title, subtitle, buckets, emptyText }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <div>
        <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {buckets.map((bucket) => (
          <div key={bucket.key} style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", padding: "var(--s-3)", display: "grid", gap: "var(--s-3)", alignContent: "start" }}>
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{bucket.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{bucket.items.length} Einträge</div>
            </div>
            {bucket.items.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{emptyText}</div>
            ) : (
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {bucket.items.map((item) => (
                  <div key={item.id} style={{ padding: "var(--s-2)", borderRadius: "var(--r-sm)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{item.title}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4 }}>
                      {item.owner ? `${item.owner} · ` : ""}
                      {item.timeLabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FocusStrip({ title, subtitle, items, emptyText, accent = "var(--c-primary)" }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
      <div>
        <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${accent}33`, background: `${accent}12`, display: "grid", gap: 4 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
              {item.meta ? <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotLaneBoard({ lanes }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Heute"
        title="Fokus-Slots"
        sub="Zeitblöcke des Tages nach Slot gebündelt, damit Planung und Fokus direkt zusammen sichtbar bleiben."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {lanes.map((lane) => (
          <div key={lane.key} style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", padding: "var(--s-3)", display: "grid", gap: "var(--s-3)", alignContent: "start" }}>
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{lane.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{lane.items.length} Blöcke</div>
            </div>
            {lane.items.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Noch kein Fokusblock in diesem Slot.</div>
            ) : (
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {lane.items.map((item) => (
                  <div key={item.id} style={{ padding: "var(--s-2)", borderRadius: "var(--r-sm)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{item.title}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4 }}>{item.meta}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotPlanningBoard({ lanes, taskPool, onTaskDragStart, onLaneDrop, onDragOver, onRemoveTask }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Heute"
        title="Fokus-Slots mit Planung"
        sub="Tag 7 ergänzt interne Drag-and-Drop-Planung: Aufgaben lassen sich direkt in die Tages-Slots ziehen."
      />
      <div style={{ display: "grid", gap: "var(--s-2)" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>Aufgaben-Pool</div>
        {taskPool.length === 0 ? (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Keine weiteren Fokus-Aufgaben zum Einplanen.</div>
        ) : (
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            {taskPool.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => onTaskDragStart?.(task.id)}
                style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid var(--c-border)", background: "var(--c-surface)", cursor: "grab", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text)" }}
              >
                {task.title}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {lanes.map((lane) => (
          <div
            key={lane.key}
            onDrop={() => onLaneDrop?.(lane.key)}
            onDragOver={onDragOver}
            style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", background: "var(--c-surface-2)", padding: "var(--s-3)", display: "grid", gap: "var(--s-3)", alignContent: "start", minHeight: 180 }}
          >
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{lane.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{lane.items.length} Einträge</div>
            </div>
            {lane.items.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Noch nichts in diesem Slot geplant.</div>
            ) : (
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {lane.items.map((item) => (
                  <div key={item.id} style={{ padding: "var(--s-2)", borderRadius: "var(--r-sm)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)", alignItems: "start" }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{item.title}</div>
                      {item.kind === "task" ? (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onRemoveTask?.(item.id)}>
                          Lösen
                        </button>
                      ) : null}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4 }}>{item.meta}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertStrip({ items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Warnungen"
        title="Überlastung und Engpässe"
        sub="Tag 4 hebt sofort hervor, wo heute oder diese Woche Handlungsbedarf besteht."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Aktuell keine kritischen Überlastungen erkannt.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 4 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AvailabilityStrip({ items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Arbeitszeiten"
        title="Wer heute buchbar ist"
        sub="Tag 8 bringt die vorhandenen Wochenstunden in den Planner: freie Stunden, Nicht-Arbeitstage und erste Kapazitaetswarnungen."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Noch keine Arbeitszeiten verfuegbar.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)", alignItems: "center" }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.name}</div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: item.color }}>{item.badge}</div>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{item.hoursLabel}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyCapacityStrip({ items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Kapazitaet"
        title="Wochenkapazitaet im Team"
        sub="Tag 9 bringt den Wochenblick dazu: geplante Stunden gegen verfuegbare Arbeitszeit, damit Ueberbuchung frueh sichtbar wird."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Noch keine Wochenkapazitaet verfuegbar.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)", alignItems: "center" }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.name}</div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: item.color }}>{item.badge}</div>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                {item.plannedHours}h geplant · {item.capacityHours}h verfuegbar
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConflictStrip({ items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Konflikte"
        title="Planungskonflikte und Ueberbuchung"
        sub="Tag 12 macht Konflikte sichtbar: doppelt belegte Zeitfenster, gesperrte Tage und zu enge Restkapazitaet."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Aktuell keine akuten Planungskonflikte erkannt.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 4 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannerHealthBoard({ conflicts, availability, capacity }) {
  const sections = [
    {
      key: "conflicts",
      title: "Konflikte",
      subtitle: "Ueberschneidungen und Blocker",
      items: conflicts,
      emptyText: "Keine akuten Konflikte.",
      color: "var(--c-danger)",
      renderMeta: (item) => item.meta,
    },
    {
      key: "availability",
      title: "Heute verfuegbar",
      subtitle: "Wer heute noch Luft hat",
      items: availability,
      emptyText: "Keine Daten verfuegbar.",
      color: "var(--c-warning)",
      renderMeta: (item) => `${item.hoursLabel} · ${item.meta}`,
    },
    {
      key: "capacity",
      title: "Wochenkapazitaet",
      subtitle: "Wer diese Woche knapp wird",
      items: capacity,
      emptyText: "Keine Engpaesse in der Woche.",
      color: "var(--c-success)",
      renderMeta: (item) => `${item.plannedHours}h geplant · ${item.capacityHours}h verfuegbar · ${item.meta}`,
    },
  ];

  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 13"
        title="Planungsstatus auf einen Blick"
        sub="Kapazitaet, Verfuegbarkeit und Konflikte sind jetzt in einer klareren Steuerungsansicht zusammengezogen."
      />
      <div style={{ display: "grid", gap: "var(--s-4)", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {sections.map((section) => (
          <div key={section.key} style={{ display: "grid", gap: "var(--s-3)", alignContent: "start", padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{section.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{section.subtitle}</div>
            </div>
            {section.items.length === 0 ? (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{section.emptyText}</div>
            ) : (
              <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {section.items.slice(0, 4).map((item) => (
                  <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-sm)", border: `1px solid ${item.color || section.color}33`, background: `${item.color || section.color}12`, display: "grid", gap: 4 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>
                      {item.title || item.name}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                      {section.renderMeta(item)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewChecklistBoard({ items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 14"
        title="Review und Tests"
        sub="Woche 2 wird hier direkt im Planner gegengeprueft: Rollen, Arbeitszeiten und Planbarkeit auf einen Blick."
      />
      <div style={{ display: "grid", gap: "var(--s-2)" }}>
        {items.map((item) => (
          <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: item.color }}>{item.state}</div>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlannerSection({ eyebrow, title, sub, actions, children }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "start", flexWrap: "wrap" }}>
        <SectionTitle eyebrow={eyebrow} title={title} sub={sub} />
        {actions ? <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function PlannerDisclosure({ title, subtitle, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="ceo-section" style={{ padding: "var(--s-5)" }}>
      <summary style={{ listStyle: "none", cursor: "pointer" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div className="section-title" style={{ marginBottom: 0, fontSize: "var(--text-base)" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{subtitle}</div> : null}
        </div>
      </summary>
      <div style={{ display: "grid", gap: "var(--s-4)", marginTop: "var(--s-4)" }}>{children}</div>
    </details>
  );
}

function PlannerSectionTabs({ value, onChange }) {
  const tabs = [
    { id: "overview", label: "Uebersicht" },
    { id: "focus", label: "Fokus" },
    { id: "planning", label: "Planung" },
    { id: "team", label: "Team" },
  ];

  return (
    <div className="ceo-section" style={{ padding: "var(--s-4)", display: "grid", gap: "var(--s-3)" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div className="section-title" style={{ marginBottom: 0, fontSize: "var(--text-base)" }}>Ansicht</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Gleiche Funktionen, aber in klaren Bereichen wie in der Prioritaetsansicht.
        </div>
      </div>
      <div className="tabs-pill" style={{ width: "fit-content", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-pill ${value === tab.id ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkScheduleEditor({ title, subtitle, value, onChange, onSave, saving }) {
  const dayLabels = [
    ["mon", "Mo"],
    ["tue", "Di"],
    ["wed", "Mi"],
    ["thu", "Do"],
    ["fri", "Fr"],
    ["sat", "Sa"],
    ["sun", "So"],
  ];

  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle eyebrow="Arbeitszeiten" title={title} sub={subtitle} />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(180px, 220px) 1fr" }}>
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", fontWeight: 700 }}>Zeitzone</label>
          <input className="input" value={value.timezone} onChange={(e) => onChange((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="Europe/Berlin" />
        </div>
        <div style={{ display: "grid", gap: "var(--s-2)", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))" }}>
          {dayLabels.map(([key, label]) => (
            <div key={key} style={{ display: "grid", gap: "var(--s-2)" }}>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", fontWeight: 700 }}>{label}</label>
              <input
                className="input"
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={value.weekly_hours[key]}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    weekly_hours: {
                      ...prev.weekly_hours,
                      [key]: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Wochenstunden gesamt: <strong>{Object.values(value.weekly_hours).reduce((sum, item) => sum + (Number(item) || 0), 0)}h</strong>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={onSave} disabled={saving}>
          {saving ? "Speichert..." : "Arbeitszeiten speichern"}
        </button>
      </div>
    </div>
  );
}

function DashboardColumn({ title, subtitle, items, emptyText, accent, onDragStart, onDrop, onDragOver }) {
  return (
    <div
      className="ceo-section"
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)", alignContent: "start", minHeight: 260 }}
    >
      <div>
        <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart?.(item.id)}
              style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${accent}33`, background: `${accent}12`, cursor: "grab", display: "grid", gap: 4 }}
            >
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
              {item.meta ? <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewModeToggle({ value, onChange }) {
  const modes = [
    { id: "day", label: "Heute" },
    { id: "week", label: "Woche" },
    { id: "split", label: "Beides" },
  ];

  return (
    <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div className="section-title" style={{ marginBottom: 0, fontSize: "var(--text-base)" }}>Ansichtsmodus</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Tag 6 trennt die Arbeitsfläche klar in Tagesmodus und Wochenmodus.
        </div>
      </div>
      <div className="tabs-pill" style={{ width: "fit-content", flexWrap: "wrap" }}>
        {modes.map((mode) => (
          <button
            key={mode.id}
            className={`tab-pill ${value === mode.id ? "active" : ""}`}
            type="button"
            onClick={() => onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Planner() {
  const { authHeader, user } = useAuth();
  const [plan, setPlan] = useState(FALLBACK_PLAN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    try {
      return window.localStorage.getItem(MEMBER_FILTER_STORAGE_KEY) || "all";
    } catch {
      return "all";
    }
  });
  const [viewMode, setViewMode] = useState(() => {
    try {
      return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) || "split";
    } catch {
      return "split";
    }
  });
  const [plannerSection, setPlannerSection] = useState(() => {
    try {
      return window.localStorage.getItem(PLANNER_SECTION_STORAGE_KEY) || "overview";
    } catch {
      return "overview";
    }
  });
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [deletingBlockId, setDeletingBlockId] = useState(null);
  const [draggingDashboardItemId, setDraggingDashboardItemId] = useState(null);
  const [draggingFocusTaskId, setDraggingFocusTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({ title: "", priority: "medium", assigned_to_id: "", due_date: "" });
  const [blockForm, setBlockForm] = useState({ plan_id: "", title: "", starts_at: "", ends_at: "" });
  const [plannedFromTask, setPlannedFromTask] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ id: null, user_id: null, timezone: "Europe/Berlin", weekly_hours: createDefaultWeeklyHours() });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [plans, setPlans] = useState([]);
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workSchedules, setWorkSchedules] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const headers = authHeader();
        const results = await Promise.allSettled([
          fetch("/api/planning/auto", { headers }),
          fetch("/api/team/members", { headers }),
          fetch("/api/teams", { headers }),
          fetch("/api/teams/memberships", { headers }),
          fetch("/api/plans", { headers }),
          fetch("/api/time-blocks", { headers }),
          fetch("/api/tasks", { headers }),
          fetch("/api/work-schedules", { headers }),
        ]);
        if (!alive) return;

        const [
          planningRes,
          membersRes,
          teamsRes,
          membershipsRes,
          plansRes,
          blocksRes,
          tasksRes,
          schedulesRes,
        ] = results;

        if (planningRes.status === "fulfilled" && planningRes.value.ok) {
          setPlan(await planningRes.value.json());
          setError(null);
        } else {
          setPlan(FALLBACK_PLAN);
          setError("Planung konnte nicht geladen werden. Fallback aktiv.");
        }

        setMembers(membersRes.status === "fulfilled" && membersRes.value.ok ? normalizeItems(await membersRes.value.json()) : []);
        setTeams(teamsRes.status === "fulfilled" && teamsRes.value.ok ? normalizeItems(await teamsRes.value.json()) : []);
        setMemberships(membershipsRes.status === "fulfilled" && membershipsRes.value.ok ? normalizeItems(await membershipsRes.value.json()) : []);
        setPlans(plansRes.status === "fulfilled" && plansRes.value.ok ? normalizeItems(await plansRes.value.json()) : []);
        setTimeBlocks(blocksRes.status === "fulfilled" && blocksRes.value.ok ? normalizeItems(await blocksRes.value.json()) : []);
        setTasks(tasksRes.status === "fulfilled" && tasksRes.value.ok ? normalizeItems(await tasksRes.value.json()) : []);
        setWorkSchedules(schedulesRes.status === "fulfilled" && schedulesRes.value.ok ? normalizeItems(await schedulesRes.value.json()) : []);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [authHeader]);

  const teamNameById = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team.name])), [teams]);
  const memberById = useMemo(() => Object.fromEntries(members.map((member) => [member.id, member])), [members]);
  const membershipByUserId = useMemo(() => Object.fromEntries(memberships.map((membership) => [membership.user_id, membership])), [memberships]);
  const workScheduleByUserId = useMemo(
    () => Object.fromEntries(workSchedules.map((entry) => [entry.user_id, entry])),
    [workSchedules],
  );

  const plansWithMeta = useMemo(
    () =>
      plans.map((item) => {
        const owner = memberById[item.user_id];
        const teamId = item.team_id || membershipByUserId[item.user_id]?.team_id;
        return {
          ...item,
          owner: owner?.name || owner?.email || null,
          teamName: teamNameById[teamId] || null,
          priority: item.user_id === user?.id ? "high" : "medium",
        };
      }),
    [memberById, membershipByUserId, plans, teamNameById, user?.id],
  );

  const selectedMember = useMemo(
    () => (selectedMemberId === "all" ? null : memberById[Number(selectedMemberId)] || null),
    [memberById, selectedMemberId],
  );

  useEffect(() => {
    if (selectedMember) {
      setTaskForm((prev) => ({ ...prev, assigned_to_id: String(selectedMember.id) }));
    }
  }, [selectedMember]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MEMBER_FILTER_STORAGE_KEY, selectedMemberId);
    } catch {
      // Ignore storage errors for local filter memory.
    }
  }, [selectedMemberId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore storage errors for local view memory.
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLANNER_SECTION_STORAGE_KEY, plannerSection);
    } catch {
      // Ignore storage errors for local section memory.
    }
  }, [plannerSection]);

  useEffect(() => {
    const preferredPlan =
      (selectedMember ? plans.find((item) => Number(item.user_id) === Number(selectedMember.id)) : null) ||
      plans.find((item) => Number(item.user_id) === Number(user?.id)) ||
      plans[0] ||
      null;
    setBlockForm((prev) => ({
      ...prev,
      plan_id: preferredPlan ? String(preferredPlan.id) : "",
      title: prev.title || "Fokus-Block",
    }));
  }, [plans, selectedMember, user?.id]);

  const myPlans = useMemo(() => plansWithMeta.filter((item) => item.user_id === user?.id), [plansWithMeta, user?.id]);

  const teamPlans = useMemo(
    () =>
      plansWithMeta.filter((item) => {
        if (!(item.user_id !== user?.id || item.team_id)) return false;
        if (!selectedMember) return true;
        return Number(item.user_id) === Number(selectedMember.id);
      }),
    [plansWithMeta, selectedMember, user?.id],
  );

  const selectedMemberTasks = useMemo(() => {
    if (!selectedMember) return [];
    return tasks
      .filter((task) => {
        if (task.assigned_to_id != null) return Number(task.assigned_to_id) === Number(selectedMember.id);
        if (task.assigned_to && selectedMember.email) return task.assigned_to === selectedMember.email;
        return false;
      })
      .sort((a, b) => {
        const rank = { open: 0, in_progress: 1, done: 2 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      });
  }, [selectedMember, tasks]);

  const teamMatrixRows = useMemo(() => {
    const todayCount = (plan.daily || []).length;
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekStart = startOfDay();
    const weekKeys = new Set(
      Array.from({ length: 5 }, (_, index) => addDays(weekStart, index).toISOString().slice(0, 10)),
    );
    return members
      .map((member) => {
        const membership = membershipByUserId[member.id];
        const userPlans = plans.filter((entry) => entry.user_id === member.id);
        const memberTasks = tasks.filter((task) => {
          if (task.assigned_to_id != null) return Number(task.assigned_to_id) === Number(member.id);
          if (task.assigned_to && member.email) return task.assigned_to === member.email;
          return false;
        });
        const openTasks = memberTasks.filter((task) => task.status !== "done").length;
        const dueToday = memberTasks.filter((task) => task.status !== "done" && task.due_date && String(task.due_date).slice(0, 10) === todayKey).length;
        const overdueTasks = memberTasks.filter((task) => task.status !== "done" && task.due_date && String(task.due_date).slice(0, 10) < todayKey).length;
        const primaryPlan = userPlans[0];
          const memberBlocks = timeBlocks
            .filter((block) => block.plan_id && userPlans.some((entry) => entry.id === block.plan_id))
            .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
          const scheduleEntry = workScheduleByUserId[member.id];
          const hours = parseWeeklyHours(scheduleEntry?.weekly_hours_json);
          const hoursToday = hoursForDate(scheduleEntry, new Date());
          const bookedToday = Math.round(
            memberBlocks
              .filter((block) => block.starts_at && String(block.starts_at).slice(0, 10) === todayKey)
              .reduce((sum, block) => sum + calculateBlockDurationHours(block.starts_at, block.ends_at), 0) * 10,
          ) / 10;
          const remainingToday = Math.max(hoursToday - bookedToday, 0);
          const weekBlockCount = memberBlocks.filter((block) => block.starts_at && weekKeys.has(String(block.starts_at).slice(0, 10))).length;
          const loadScore = overdueTasks * 2 + dueToday + weekBlockCount;
          const loadLabel = loadScore >= 6 ? "Hoch" : loadScore >= 3 ? "Mittel" : "Stabil";
          const loadColor = loadScore >= 6 ? "var(--c-danger)" : loadScore >= 3 ? "var(--c-warning)" : "var(--c-success)";
          const availabilityLabel = hoursToday <= 0 ? "Frei" : remainingToday <= 0 ? "Voll" : remainingToday <= 2 ? "Knapp" : `${remainingToday}h frei`;
          const availabilityColor = hoursToday <= 0 ? "var(--c-text-3)" : remainingToday <= 0 ? "var(--c-danger)" : remainingToday <= 2 ? "var(--c-warning)" : "var(--c-success)";
          return {
            id: member.id,
            name: member.name || member.email,
          role: member.role || "member",
          specialty: membership?.specialty || "",
          teamName: teamNameById[membership?.team_id] || "",
          openTasks,
          todayFocus: member.id === user?.id ? todayCount : Math.min(openTasks, 3),
          dueToday,
          overdueTasks,
          planTitle: primaryPlan?.title || (primaryPlan ? "Persönlicher Plan" : "Noch kein Plan"),
            nextBlock: memberBlocks[0] ? formatBlockDate(memberBlocks[0].starts_at) : "",
            blockCount: weekBlockCount,
            loadLabel,
            loadColor,
            hours,
            hoursToday,
            bookedToday,
            remainingToday,
            availabilityLabel,
            availabilityColor,
          };
        })
        .filter((row) => (selectedMember ? Number(row.id) === Number(selectedMember.id) : true))
        .sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name));
  }, [members, membershipByUserId, plan.daily, plans, selectedMember, tasks, teamNameById, timeBlocks, user?.id, workScheduleByUserId]);

  const weekBuckets = useMemo(() => {
    const start = startOfDay();
    return Array.from({ length: 5 }, (_, index) => {
      const date = addDays(start, index);
      return {
        key: date.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date),
      };
    });
  }, []);

  const blocksWithMeta = useMemo(
    () =>
      timeBlocks.map((block) => {
        const planEntry = plans.find((entry) => entry.id === block.plan_id);
        const owner = planEntry ? memberById[planEntry.user_id] : null;
        return {
          ...block,
          owner: owner?.name || owner?.email || "",
          user_id: planEntry?.user_id || null,
          timeLabel: block.starts_at
            ? new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(block.starts_at))
            : "Ohne Zeit",
        };
      }),
    [memberById, plans, timeBlocks],
  );

  const myWeekBuckets = useMemo(
    () =>
      weekBuckets.map((bucket) => ({
        ...bucket,
        items: blocksWithMeta.filter((block) => block.user_id === user?.id && block.starts_at && block.starts_at.slice(0, 10) === bucket.key),
      })),
    [blocksWithMeta, user?.id, weekBuckets],
  );

  const teamWeekBuckets = useMemo(
    () =>
      weekBuckets.map((bucket) => ({
        ...bucket,
        items: blocksWithMeta.filter((block) => {
          if (!(block.starts_at && block.starts_at.slice(0, 10) === bucket.key)) return false;
          if (!selectedMember) return true;
          return Number(block.user_id) === Number(selectedMember.id);
        }),
      })),
    [blocksWithMeta, selectedMember, weekBuckets],
  );

  const visibleBlocks = useMemo(() => {
    const filtered = blocksWithMeta.filter((block) => {
      if (!selectedMember) return block.user_id === user?.id || !block.user_id;
      return Number(block.user_id) === Number(selectedMember.id);
    });
    return filtered
      .slice()
      .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0))
      .slice(0, 6);
  }, [blocksWithMeta, selectedMember, user?.id]);

  const todayFocusCards = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const scopedTasks = selectedMember
      ? tasks.filter((task) => {
          if (task.assigned_to_id != null) return Number(task.assigned_to_id) === Number(selectedMember.id);
          if (task.assigned_to && selectedMember.email) return task.assigned_to === selectedMember.email;
          return false;
        })
      : tasks.filter((task) => {
          if (task.assigned_to_id != null) return Number(task.assigned_to_id) === Number(user?.id);
          if (task.assigned_to && user?.email) return task.assigned_to === user.email;
          return false;
        });

    const topTasks = scopedTasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => {
        const priorityRank = { high: 0, medium: 1, low: 2 };
        const dateA = a.due_date ? String(a.due_date) : "9999-12-31";
        const dateB = b.due_date ? String(b.due_date) : "9999-12-31";
        return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || dateA.localeCompare(dateB);
      })
      .slice(0, 3)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        meta: `${priorityFor(task.priority).label}${task.due_date ? ` · fällig ${new Date(task.due_date).toLocaleDateString("de-DE")}` : ""}`,
      }));

    const todaysBlocks = visibleBlocks
      .filter((block) => block.starts_at && String(block.starts_at).slice(0, 10) === todayKey)
      .slice(0, 3)
      .map((block) => ({
        id: `block-${block.id}`,
        title: block.title || "Zeitblock",
        meta: `${block.owner ? `${block.owner} · ` : ""}${formatBlockDate(block.starts_at)}`,
      }));

    return { topTasks, todaysBlocks };
  }, [selectedMember, tasks, user?.email, user?.id, visibleBlocks]);

  const focusTasksBase = useMemo(
    () =>
      todayFocusCards.topTasks.map((task) => ({
        id: task.id,
        title: task.title,
        meta: task.meta,
        kind: "task",
      })),
    [todayFocusCards.topTasks],
  );

  const [focusSlotAssignments, setFocusSlotAssignments] = useState({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOCUS_SLOTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      setFocusSlotAssignments(parsed?.[selectedMemberId] || {});
    } catch {
      setFocusSlotAssignments({});
    }
  }, [selectedMemberId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOCUS_SLOTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[selectedMemberId] = focusSlotAssignments;
      window.localStorage.setItem(FOCUS_SLOTS_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // Ignore storage errors for local slot assignments.
    }
  }, [focusSlotAssignments, selectedMemberId]);

  const todaySlotLanes = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const lanes = [
      { key: "morning", label: "Morgen", items: [] },
      { key: "midday", label: "Mittag", items: [] },
      { key: "afternoon", label: "Nachmittag", items: [] },
    ];

    visibleBlocks
      .filter((block) => block.starts_at && String(block.starts_at).slice(0, 10) === todayKey)
      .forEach((block) => {
        const hour = new Date(block.starts_at).getHours();
        const laneKey = hour < 12 ? "morning" : hour < 15 ? "midday" : "afternoon";
        const lane = lanes.find((item) => item.key === laneKey);
        lane?.items.push({
          id: block.id,
          title: block.title || "Zeitblock",
          meta: `${block.owner ? `${block.owner} · ` : ""}${formatBlockDate(block.starts_at)}`,
        });
      });

    return lanes;
  }, [visibleBlocks]);

  const plannedTaskIds = useMemo(
    () => new Set(Object.values(focusSlotAssignments || {}).flat()),
    [focusSlotAssignments],
  );

  const focusTaskPool = useMemo(
    () => focusTasksBase.filter((task) => !plannedTaskIds.has(task.id)),
    [focusTasksBase, plannedTaskIds],
  );

  const slotPlanningLanes = useMemo(() => {
    const taskById = Object.fromEntries(focusTasksBase.map((task) => [task.id, task]));
    return todaySlotLanes.map((lane) => ({
      ...lane,
      items: [
        ...(lane.items || []).map((item) => ({ ...item, kind: "block" })),
        ...((focusSlotAssignments[lane.key] || []).map((id) => taskById[id]).filter(Boolean)),
      ],
    }));
  }, [focusSlotAssignments, focusTasksBase, todaySlotLanes]);

  const summary = useMemo(() => {
    const myBlockIds = new Set(myPlans.map((entry) => entry.id));
    return {
      teamMembers: members.length,
      openTasks: tasks.filter((task) => task.status !== "done").length,
      myPlans: myPlans.length,
      myBlocks: timeBlocks.filter((block) => myBlockIds.has(block.plan_id)).length,
    };
  }, [members.length, myPlans, tasks, timeBlocks]);

  const overloadAlerts = useMemo(
    () =>
      teamMatrixRows
        .filter((row) => row.overdueTasks > 0 || row.loadLabel === "Hoch" || row.dueToday >= 3 || (row.hoursToday > 0 && row.remainingToday <= 1))
        .slice(0, 5)
        .map((row) => ({
          id: `alert-${row.id}`,
          title: `${row.name} braucht Aufmerksamkeit`,
          meta: `${row.overdueTasks} überfällig · ${row.dueToday} heute fällig · Belastung ${row.loadLabel.toLowerCase()}`,
          color: row.overdueTasks > 0 || row.loadLabel === "Hoch" || (row.hoursToday > 0 && row.remainingToday <= 0) ? "var(--c-danger)" : "var(--c-warning)",
        })),
      [teamMatrixRows],
  );

  const availabilityItems = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return teamMatrixRows
      .map((row) => {
        const todaysBlocks = blocksWithMeta.filter(
          (block) => Number(block.user_id) === Number(row.id) && block.starts_at && String(block.starts_at).slice(0, 10) === todayKey,
        );
        const bookedHours = todaysBlocks.reduce(
          (sum, block) => sum + calculateBlockDurationHours(block.starts_at, block.ends_at),
          0,
        );
        const remaining = Math.max((row.hoursToday || 0) - bookedHours, 0);
        const isClosed = (row.hoursToday || 0) <= 0;
        const isFull = !isClosed && bookedHours >= (row.hoursToday || 0) && (row.hoursToday || 0) > 0;
        const color = isClosed ? "var(--c-text-3)" : isFull ? "var(--c-danger)" : remaining <= 2 ? "var(--c-warning)" : "var(--c-success)";
        const badge = isClosed ? "Heute frei" : isFull ? "Voll" : remaining <= 2 ? "Knapp" : "Verfuegbar";
        return {
          id: row.id,
          name: row.name,
          color,
          badge,
          hoursLabel: `${formatHoursLabel(row.hoursToday || 0)} · ${bookedHours}h geplant`,
          meta: isClosed ? "Heute ist laut Arbeitszeitmodell kein Arbeitstag." : `${remaining}h Restkapazitaet fuer heute`,
        };
      })
      .slice(0, selectedMember ? 1 : 6);
  }, [blocksWithMeta, selectedMember, teamMatrixRows]);

  const weeklyCapacityItems = useMemo(() => {
    const weekKeys = new Set(weekBuckets.map((bucket) => bucket.key));
    return teamMatrixRows
      .map((row) => {
        const plannedHours = Math.round(
          blocksWithMeta
            .filter((block) => Number(block.user_id) === Number(row.id) && block.starts_at && weekKeys.has(String(block.starts_at).slice(0, 10)))
            .reduce((sum, block) => sum + calculateBlockDurationHours(block.starts_at, block.ends_at), 0) * 10,
        ) / 10;
        const capacityHours = Math.round((row.hours || 0) * 10) / 10;
        const remainingHours = Math.max(capacityHours - plannedHours, 0);
        const isNoCapacity = capacityHours <= 0;
        const isOverbooked = capacityHours > 0 && plannedHours > capacityHours;
        const isTight = capacityHours > 0 && !isOverbooked && remainingHours <= 4;
        const color = isNoCapacity ? "var(--c-text-3)" : isOverbooked ? "var(--c-danger)" : isTight ? "var(--c-warning)" : "var(--c-success)";
        const badge = isNoCapacity ? "Ohne Modell" : isOverbooked ? "Ueberbucht" : isTight ? "Knapp" : "Stabil";
        return {
          id: row.id,
          name: row.name,
          color,
          badge,
          plannedHours,
          capacityHours,
          remainingHours,
          meta: isNoCapacity
            ? "Fuer diese Person sind noch keine Wochenstunden hinterlegt."
            : isOverbooked
              ? `${Math.round((plannedHours - capacityHours) * 10) / 10}h ueber der Wochenkapazitaet`
              : `${remainingHours}h Rest fuer diese Woche`,
        };
      })
      .slice(0, selectedMember ? 1 : 6);
  }, [blocksWithMeta, selectedMember, teamMatrixRows, weekBuckets]);

  const selectedPlannerUserId = selectedMember?.id || user?.id || null;
  const selectedPlannerSchedule = selectedPlannerUserId ? workScheduleByUserId[selectedPlannerUserId] : null;

  const blockFormScheduleCheck = useMemo(() => {
    if (!blockForm.starts_at || !blockForm.ends_at || !selectedPlannerUserId) return null;
    const dailyHours = hoursForDate(selectedPlannerSchedule, blockForm.starts_at);
    const durationHours = calculateBlockDurationHours(blockForm.starts_at, blockForm.ends_at);
    const dateKey = String(new Date(blockForm.starts_at).toISOString()).slice(0, 10);
    const sameUserDayBlocks = visibleBlocks.filter((block) => Number(block.user_id) === Number(selectedPlannerUserId) && block.starts_at && String(block.starts_at).slice(0, 10) === dateKey && block.id !== editingBlockId);
    const sameDayHours = sameUserDayBlocks.reduce((sum, block) => sum + calculateBlockDurationHours(block.starts_at, block.ends_at), 0);
    const totalHours = Math.round((sameDayHours + durationHours) * 10) / 10;
    const startTime = new Date(blockForm.starts_at).getTime();
    const endTime = new Date(blockForm.ends_at).getTime();
    const conflictingBlock = sameUserDayBlocks.find((block) => {
      const blockStart = new Date(block.starts_at).getTime();
      const blockEnd = new Date(block.ends_at).getTime();
      return startTime < blockEnd && endTime > blockStart;
    });
    if (!selectedPlannerSchedule) {
      return {
        tone: "warning",
        message: "Fuer diese Person sind noch keine Arbeitszeiten hinterlegt.",
        conflict: null,
      };
    }
    if (!dailyHours) {
      return {
        tone: "danger",
        message: "Dieser Tag ist laut Arbeitszeitmodell nicht buchbar.",
        conflict: null,
      };
    }
    if (durationHours <= 0) {
      return {
        tone: "warning",
        message: "Bitte einen gueltigen Zeitraum fuer den Zeitblock waehlen.",
        conflict: null,
      };
    }
    if (conflictingBlock) {
      return {
        tone: "danger",
        message: `Zeitfenster kollidiert mit "${conflictingBlock.title || "bestehendem Block"}".`,
        conflict: conflictingBlock,
      };
    }
    if (totalHours > dailyHours) {
      return {
        tone: "danger",
        message: `Geplante Stunden (${totalHours}h) liegen ueber der Tageskapazitaet von ${dailyHours}h.`,
        conflict: null,
      };
    }
    return {
      tone: "success",
      message: `${durationHours}h Block passen in die heutige/verwaehlte Tageskapazitaet von ${dailyHours}h.`,
      conflict: null,
    };
  }, [blockForm.ends_at, blockForm.starts_at, editingBlockId, selectedPlannerSchedule, selectedPlannerUserId, user?.id, visibleBlocks]);

  const planningConflictItems = useMemo(() => {
    const items = [];
    weeklyCapacityItems
      .filter((item) => item.badge === "Ueberbucht" || item.badge === "Knapp")
      .slice(0, 4)
      .forEach((item) => {
        items.push({
          id: `capacity-${item.id}`,
          title: `${item.name}: ${item.badge}`,
          meta: item.meta,
          color: item.badge === "Ueberbucht" ? "var(--c-danger)" : "var(--c-warning)",
        });
      });

    teamMatrixRows
      .filter((row) => row.hoursToday > 0 && row.remainingToday <= 1)
      .slice(0, 3)
      .forEach((row) => {
        items.push({
          id: `today-${row.id}`,
          title: `${row.name}: Tageskapazitaet fast voll`,
          meta: `${row.bookedToday}h geplant, nur noch ${row.remainingToday}h frei.`,
          color: row.remainingToday <= 0 ? "var(--c-danger)" : "var(--c-warning)",
        });
      });

    if (blockFormScheduleCheck?.tone === "danger") {
      items.unshift({
        id: "draft-conflict",
        title: "Aktueller Zeitblock ist konfliktbehaftet",
        meta: blockFormScheduleCheck.message,
        color: "var(--c-danger)",
      });
    }

    return items.slice(0, 6);
  }, [blockFormScheduleCheck, teamMatrixRows, weeklyCapacityItems]);

  const plannerHealthAvailability = useMemo(
    () => availabilityItems.filter((item) => item.badge !== "Verfuegbar").slice(0, 4),
    [availabilityItems],
  );

  const plannerHealthCapacity = useMemo(
    () => weeklyCapacityItems.filter((item) => item.badge === "Ueberbucht" || item.badge === "Knapp").slice(0, 4),
    [weeklyCapacityItems],
  );

  useEffect(() => {
    const weekly = parseWeeklyHoursMap(selectedPlannerSchedule?.weekly_hours_json);
    setScheduleForm({
      id: selectedPlannerSchedule?.id || null,
      user_id: selectedPlannerUserId,
      timezone: selectedPlannerSchedule?.timezone || "Europe/Berlin",
      weekly_hours: {
        ...createDefaultWeeklyHours(),
        ...weekly,
      },
    });
  }, [selectedPlannerSchedule, selectedPlannerUserId]);

  const taskBlockCandidates = useMemo(() => {
    const relevantTasks = (selectedMember ? selectedMemberTasks : tasks.filter((task) => {
      if (task.assigned_to_id != null) return Number(task.assigned_to_id) === Number(user?.id);
      if (task.assigned_to && user?.email) return task.assigned_to === user.email;
      return false;
    }))
      .filter((task) => task.status !== "done")
      .slice()
      .sort((a, b) => {
        const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        const rank = { high: 0, medium: 1, low: 2 };
        return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
      });

    return relevantTasks.slice(0, 6).map((task) => {
      const assigneeId = task.assigned_to_id != null ? Number(task.assigned_to_id) : selectedPlannerUserId;
      const suggestedPlan =
        plans.find((item) => Number(item.user_id) === Number(assigneeId)) ||
        plans.find((item) => Number(item.user_id) === Number(selectedPlannerUserId)) ||
        plans.find((item) => Number(item.user_id) === Number(user?.id)) ||
        plans[0] ||
        null;
      const baseDate = task.due_date ? new Date(task.due_date) : startOfDay();
      baseDate.setHours(9, 0, 0, 0);
      const endDate = new Date(baseDate.getTime() + 90 * 60000);
      const alreadyPlanned = visibleBlocks.some((block) => String(block.title || "").trim().toLowerCase() === String(task.title || "").trim().toLowerCase());
      return {
        ...task,
        suggestedPlanId: suggestedPlan ? String(suggestedPlan.id) : "",
        suggestedStart: toLocalDateTimeInputValue(baseDate),
        suggestedEnd: toLocalDateTimeInputValue(endDate),
        alreadyPlanned,
      };
    });
  }, [plans, selectedMember, selectedMemberTasks, selectedPlannerUserId, tasks, user?.email, user?.id, visibleBlocks]);

  const reviewChecklistItems = useMemo(() => {
    const hasTeamData = members.length > 0 && teamMatrixRows.length > 0;
    const hasFocusedMemberFlow = !!selectedMember || selectedMemberTasks.length > 0 || selectedMemberId !== "all";
    const hasSchedules = workSchedules.length > 0;
    const hasScheduleGuard = !!blockFormScheduleCheck;
    const hasBlockPlanning = visibleBlocks.length > 0 || !!plannedFromTask || taskBlockCandidates.length > 0;

    return [
      {
        id: "ceo-matrix",
        title: "CEO verschiebt und steuert Teamplanung",
        state: hasTeamData ? "Bereit" : "Offen",
        color: hasTeamData ? "var(--c-success)" : "var(--c-warning)",
        meta: hasTeamData
          ? `${teamMatrixRows.length} Teamzeilen, Fokus- und Block-Aktionen verfuegbar.`
          : "Es fehlen noch Teamdaten fuer die CEO-Pruefung.",
      },
      {
        id: "member-scope",
        title: "Mitarbeiter sieht fokussierte Aufgaben",
        state: hasFocusedMemberFlow ? "Bereit" : "Offen",
        color: hasFocusedMemberFlow ? "var(--c-success)" : "var(--c-warning)",
        meta: hasFocusedMemberFlow
          ? "Teamfokus und Mitarbeiter-Ansicht koennen direkt im Planner getestet werden."
          : "Waehle eine Person im Teamfokus, um den Rollenfluss zu pruefen.",
      },
      {
        id: "work-hours",
        title: "Arbeitszeiten blocken ungueltige Eintraege",
        state: hasSchedules && hasScheduleGuard ? "Bereit" : hasSchedules ? "Teilweise" : "Offen",
        color: hasSchedules && hasScheduleGuard ? "var(--c-success)" : hasSchedules ? "var(--c-warning)" : "var(--c-danger)",
        meta: hasSchedules
          ? "Arbeitszeiten sind hinterlegt und werden beim Zeitblock-Formular geprueft."
          : "Lege zuerst Arbeitszeiten an, damit Kapazitaets- und Blocker-Checks greifen.",
      },
      {
        id: "planning-flow",
        title: "Aufgaben lassen sich in Bloecke ueberfuehren",
        state: hasBlockPlanning ? "Bereit" : "Offen",
        color: hasBlockPlanning ? "var(--c-success)" : "var(--c-warning)",
        meta: hasBlockPlanning
          ? "Direkte Einplanung aus Aufgaben ist verfuegbar und kann geprueft werden."
          : "Es werden offene Aufgaben oder vorhandene Bloecke fuer den Test gebraucht.",
      },
    ];
  }, [blockFormScheduleCheck, members.length, plannedFromTask, selectedMember, selectedMemberId, selectedMemberTasks.length, taskBlockCandidates.length, teamMatrixRows, visibleBlocks.length, workSchedules.length]);

  const initialDashboardColumns = useMemo(
    () => ({
      team: teamPlans.slice(0, 4).map((item) => ({ id: `plan-${item.id}`, title: item.title || "Teamplan", meta: item.owner || item.teamName || "Team" })),
      mine: myPlans.slice(0, 4).map((item) => ({ id: `myplan-${item.id}`, title: item.title || "Mein Plan", meta: item.teamName || "Persönlicher Fokus" })),
      today: todayFocusCards.topTasks.slice(0, 4).map((item) => ({ ...item })),
    }),
    [myPlans, teamPlans, todayFocusCards.topTasks],
  );

  const [dashboardColumns, setDashboardColumns] = useState({ team: [], mine: [], today: [] });

  useEffect(() => {
    let storedColumns = null;
    try {
      storedColumns = JSON.parse(window.localStorage.getItem(DASHBOARD_STORAGE_KEY) || "null");
    } catch {
      storedColumns = null;
    }
    setDashboardColumns(mergeDashboardColumns(initialDashboardColumns, storedColumns));
  }, [initialDashboardColumns]);

  useEffect(() => {
    try {
      const payload = Object.fromEntries(
        Object.entries(dashboardColumns).map(([key, items]) => [key, items.map((item) => item.id)]),
      );
      window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors in local-only dashboard persistence.
    }
  }, [dashboardColumns]);

  async function handleTaskStatusUpdate(taskId, status) {
    setUpdatingTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status, status_label: status } : task)));
    } catch {
      setError("Task-Status konnte nicht aktualisiert werden.");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    setCreatingTask(true);
    try {
      const assignee = memberById[Number(taskForm.assigned_to_id)];
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskForm.title.trim(),
          priority: taskForm.priority,
          assigned_to_id: taskForm.assigned_to_id ? Number(taskForm.assigned_to_id) : null,
          assigned_to: assignee?.email || assignee?.name || null,
          due_date: taskForm.due_date || null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setTasks((prev) => [created, ...prev]);
      setTaskForm({
        title: "",
        priority: "medium",
        assigned_to_id: selectedMember ? String(selectedMember.id) : "",
        due_date: "",
      });
    } catch {
      setError("Task konnte im Planner nicht angelegt werden.");
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleCreateTimeBlock(event) {
    event.preventDefault();
    if (!blockForm.plan_id || !blockForm.title.trim() || !blockForm.starts_at || !blockForm.ends_at) return;
    setCreatingBlock(true);
    try {
      const res = await fetch(editingBlockId ? `/api/time-blocks/${editingBlockId}` : "/api/time-blocks", {
        method: editingBlockId ? "PATCH" : "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: Number(blockForm.plan_id),
          title: blockForm.title.trim(),
          starts_at: new Date(blockForm.starts_at).toISOString(),
          ends_at: new Date(blockForm.ends_at).toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setTimeBlocks((prev) =>
        editingBlockId ? prev.map((block) => (block.id === editingBlockId ? saved : block)) : [saved, ...prev],
      );
      setBlockForm((prev) => ({
        ...prev,
        title: "Fokus-Block",
        starts_at: "",
        ends_at: "",
        plan_id: prev.plan_id,
      }));
      setPlannedFromTask(null);
      setEditingBlockId(null);
    } catch {
      setError("Zeitblock konnte im Planner nicht angelegt werden.");
    } finally {
      setCreatingBlock(false);
    }
  }

  async function handleSaveSchedule() {
    if (!selectedPlannerUserId) return;
    setSavingSchedule(true);
    try {
      const payload = {
        user_id: selectedPlannerUserId,
        timezone: scheduleForm.timezone || "Europe/Berlin",
        weekly_hours_json: JSON.stringify(scheduleForm.weekly_hours),
      };
      const res = await fetch(scheduleForm.id ? `/api/work-schedules/${scheduleForm.id}` : "/api/work-schedules", {
        method: scheduleForm.id ? "PATCH" : "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setWorkSchedules((prev) => {
        if (scheduleForm.id) {
          return prev.map((entry) => (entry.id === saved.id ? saved : entry));
        }
        return [saved, ...prev.filter((entry) => Number(entry.user_id) !== Number(saved.user_id))];
      });
      setScheduleForm({
        id: saved.id,
        user_id: saved.user_id,
        timezone: saved.timezone || "Europe/Berlin",
        weekly_hours: {
          ...createDefaultWeeklyHours(),
          ...parseWeeklyHoursMap(saved.weekly_hours_json),
        },
      });
    } catch {
      setError("Arbeitszeiten konnten nicht gespeichert werden.");
    } finally {
      setSavingSchedule(false);
    }
  }

  function handleFocusMember(memberId) {
    setSelectedMemberId(String(memberId));
  }

  function handlePrefillTask(memberId) {
    setSelectedMemberId(String(memberId));
    setTaskForm((prev) => ({
      ...prev,
      assigned_to_id: String(memberId),
      title: prev.title || "Neues Fokus-To-do",
    }));
  }

  function handlePrefillBlock(memberId) {
    const preferredPlan =
      plans.find((item) => Number(item.user_id) === Number(memberId)) ||
      plans.find((item) => Number(item.user_id) === Number(user?.id)) ||
      plans[0] ||
      null;
    setSelectedMemberId(String(memberId));
    setBlockForm((prev) => ({
      ...prev,
      plan_id: preferredPlan ? String(preferredPlan.id) : prev.plan_id,
      title: prev.title || "Fokus-Block",
    }));
    setPlannedFromTask(null);
  }

  function handlePlanTaskAsBlock(task) {
    const planId = task.suggestedPlanId || blockForm.plan_id;
    setBlockForm({
      plan_id: planId,
      title: task.title || "Fokus-Block",
      starts_at: task.suggestedStart || blockForm.starts_at,
      ends_at: task.suggestedEnd || blockForm.ends_at,
    });
    setPlannedFromTask({
      id: task.id,
      title: task.title || "Aufgabe",
    });
  }

  function handleEditBlock(block) {
      setEditingBlockId(block.id);
      setPlannedFromTask(null);
      setBlockForm({
        plan_id: block.plan_id ? String(block.plan_id) : "",
        title: block.title || "Fokus-Block",
        starts_at: toDateInputValue(block.starts_at),
      ends_at: toDateInputValue(block.ends_at),
    });
  }

  async function handleDeleteBlock(blockId) {
    setDeletingBlockId(blockId);
    try {
      const res = await fetch(`/api/time-blocks/${blockId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error();
      setTimeBlocks((prev) => prev.filter((block) => block.id !== blockId));
        if (editingBlockId === blockId) {
          setEditingBlockId(null);
          setPlannedFromTask(null);
          setBlockForm((prev) => ({ ...prev, title: "Fokus-Block", starts_at: "", ends_at: "" }));
        }
    } catch {
      setError("Zeitblock konnte nicht gelöscht werden.");
    } finally {
      setDeletingBlockId(null);
    }
  }

  function handleDashboardDrop(targetColumn) {
    if (!draggingDashboardItemId) return;
    setDashboardColumns((prev) => {
      let movedItem = null;
      const next = Object.fromEntries(
        Object.entries(prev).map(([key, items]) => [
          key,
          items.filter((item) => {
            if (item.id === draggingDashboardItemId) {
              movedItem = item;
              return false;
            }
            return true;
          }),
        ]),
      );
      if (!movedItem) return prev;
      return {
        ...next,
        [targetColumn]: [movedItem, ...(next[targetColumn] || [])],
      };
    });
    setDraggingDashboardItemId(null);
  }

  function handleFocusTaskDrop(targetLane) {
    if (!draggingFocusTaskId) return;
    setFocusSlotAssignments((prev) => {
      const next = Object.fromEntries(
        ["morning", "midday", "afternoon"].map((key) => [key, (prev[key] || []).filter((id) => id !== draggingFocusTaskId)]),
      );
      next[targetLane] = [...(next[targetLane] || []), draggingFocusTaskId];
      return next;
    });
    setDraggingFocusTaskId(null);
  }

  function handleRemoveFocusTask(taskId) {
    setFocusSlotAssignments((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, ids]) => [key, (ids || []).filter((id) => id !== taskId)]),
      ),
    );
  }

  function handleResetDashboardLayout() {
    setDashboardColumns(initialDashboardColumns);
    setSelectedMemberId("all");
    setViewMode("split");
    setPlannerSection("overview");
    try {
      window.localStorage.removeItem(DASHBOARD_STORAGE_KEY);
      window.localStorage.removeItem(MEMBER_FILTER_STORAGE_KEY);
      window.localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
      window.localStorage.removeItem(FOCUS_SLOTS_STORAGE_KEY);
      window.localStorage.removeItem(PLANNER_SECTION_STORAGE_KEY);
    } catch {
      // Ignore storage errors for reset.
    }
  }

  const showOverviewSection = plannerSection === "overview";
  const showFocusSection = plannerSection === "focus";
  const showPlanningSection = plannerSection === "planning";
  const showTeamSection = plannerSection === "team";

  return (
    <div className="page-enter page-content" style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-2)" }}>
        <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-text-3)", fontWeight: 600 }}>
          Planer-Zentrum
        </div>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--c-text)" }}>
          Teamplan, persönlicher Plan und Tagesfokus an einem Ort
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", maxWidth: 720 }}>
          Tag 3 bündelt hier die sichtbare Plan-Struktur: tägliche To-dos, mein Plan, Teampläne und die CEO-Matrix für Zuständigkeiten.
        </div>
        {error ? <div style={{ fontSize: "var(--text-sm)", color: "var(--c-warning)" }}>{error}</div> : null}
      </div>

      <div style={{ display: "grid", gap: "var(--s-4)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <PlanSummaryCard title="Teammitglieder" value={summary.teamMembers} sub="Aktive Personen im Workspace" />
        <PlanSummaryCard title="Offene Aufgaben" value={summary.openTasks} sub="Noch nicht erledigte Aufgaben" />
        <PlanSummaryCard title="Meine Pläne" value={summary.myPlans} sub="Persönliche Plan-Einträge" />
        <PlanSummaryCard title="Meine Zeitblöcke" value={summary.myBlocks} sub="Im aktuellen Plan verknüpft" />
      </div>

      <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
          Dashboard, Teamfokus und Drag-and-Drop-Reihenfolge werden jetzt lokal automatisch gespeichert.
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={handleResetDashboardLayout}>
          Dashboard zurücksetzen
        </button>
      </div>

      <div style={{ display: "grid", gap: "var(--s-4)", gridTemplateColumns: "minmax(260px, 380px) minmax(260px, 1fr)" }}>
        <PlannerSectionTabs value={plannerSection} onChange={setPlannerSection} />
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {showOverviewSection ? (
      <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <DashboardColumn
          title="Team-Pläne"
          subtitle="Tag-5-Dashboard: Teamfokus und gemeinsame Prioritäten."
          items={dashboardColumns.team}
          emptyText="Noch keine Team-Pläne im Dashboard."
          accent="var(--c-primary)"
          onDragStart={setDraggingDashboardItemId}
          onDrop={() => handleDashboardDrop("team")}
          onDragOver={(e) => e.preventDefault()}
        />
        <DashboardColumn
          title="Mein Plan"
          subtitle="Eigene Schwerpunkte und persönliche Planung."
          items={dashboardColumns.mine}
          emptyText="Noch keine eigenen Plan-Karten im Dashboard."
          accent="var(--c-success)"
          onDragStart={setDraggingDashboardItemId}
          onDrop={() => handleDashboardDrop("mine")}
          onDragOver={(e) => e.preventDefault()}
        />
        <DashboardColumn
          title="Heute / To-dos"
          subtitle="Wichtigste Aufgaben für den aktuellen Fokus. Intern per Drag-and-Drop sortierbar."
          items={dashboardColumns.today}
          emptyText="Noch keine To-dos im Dashboard."
          accent="var(--c-warning)"
          onDragStart={setDraggingDashboardItemId}
          onDrop={() => handleDashboardDrop("today")}
          onDragOver={(e) => e.preventDefault()}
        />
      </div>
      ) : null}

      {showOverviewSection ? <AlertStrip items={overloadAlerts} /> : null}

      {showOverviewSection ? (
        <PlannerHealthBoard
          conflicts={planningConflictItems}
          availability={plannerHealthAvailability}
          capacity={plannerHealthCapacity}
        />
      ) : null}

      {showOverviewSection ? <ReviewChecklistBoard items={reviewChecklistItems} /> : null}

      {(showFocusSection || showPlanningSection || showTeamSection) ? (
      <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>Teamfokus</div>
        <select className="input" value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="all">Gesamtes Team</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name || member.email}
            </option>
          ))}
        </select>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
          Filtert Teampläne und CEO-Matrix nach einer Person.
        </div>
      </div>
      ) : null}

      {showFocusSection && viewMode !== "week" ? (
        <>
          <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "minmax(280px, 0.95fr) minmax(320px, 1.05fr)" }}>
            <DailyTodos items={plan.daily || []} loading={loading} />
            <PlanListCard title="Mein Plan" subtitle="Eigene Plan-Einträge und Zeiträume für die nächsten Schritte." items={myPlans} emptyText="Noch kein persönlicher Plan angelegt." />
          </div>

          <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <FocusStrip
              title={selectedMember ? `Top 3 für ${selectedMember.name || selectedMember.email}` : "Top 3 für heute"}
              subtitle="Die wichtigsten offenen Aufgaben für den aktuellen Fokus."
              items={todayFocusCards.topTasks}
              emptyText="Keine offenen Fokus-Aufgaben gefunden."
              accent="var(--c-warning)"
            />
            <FocusStrip
              title="Heutige Fokusblöcke"
              subtitle="Bereits eingeplante Zeitfenster für heute."
              items={todayFocusCards.todaysBlocks}
              emptyText="Für heute ist noch kein Zeitblock geplant."
              accent="var(--c-success)"
            />
          </div>

          <SlotPlanningBoard
            lanes={slotPlanningLanes}
            taskPool={focusTaskPool}
            onTaskDragStart={setDraggingFocusTaskId}
            onLaneDrop={handleFocusTaskDrop}
            onDragOver={(e) => e.preventDefault()}
            onRemoveTask={handleRemoveFocusTask}
          />
        </>
      ) : null}

      {showPlanningSection ? (
      <PlannerDisclosure
        title="Planungswerkzeuge"
        subtitle="Arbeitszeiten, Aufgaben-zu-Block, neue To-dos und Zeitblock-Bearbeitung an einem Ort."
        defaultOpen
      >
      <WorkScheduleEditor
        title={selectedMember ? `Arbeitszeit fuer ${selectedMember.name || selectedMember.email}` : "Meine Arbeitszeit"}
        subtitle="Tag 10 schliesst den Arbeitszeiten-Block ab: Wochenstunden direkt im Planner pflegen und sofort in Verfuegbarkeit und Woche sehen."
        value={scheduleForm}
        onChange={setScheduleForm}
        onSave={handleSaveSchedule}
        saving={savingSchedule}
      />

      {showPlanningSection ? (
      <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
        <SectionTitle
          eyebrow="Tag 11"
          title="Aufgaben direkt als Zeitblock einplanen"
          sub="Zeitblock und Aufgabe laufen jetzt zusammen: offene Aufgaben koennen direkt in einen konkreten Block ueberfuehrt werden."
        />
        {taskBlockCandidates.length === 0 ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Keine offenen Aufgaben fuer die direkte Blockplanung gefunden.</div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {taskBlockCandidates.map((task) => {
              const priority = priorityFor(task.priority);
              return (
                <div key={task.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{task.title}</div>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: priority.color, background: `${priority.color}18`, padding: "2px 8px", borderRadius: 999 }}>
                        {priority.label}
                      </span>
                      {task.alreadyPlanned ? (
                        <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-success)", background: "var(--c-success)18", padding: "2px 8px", borderRadius: 999 }}>
                          Bereits als Block sichtbar
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                      {task.due_date ? `Deadline ${new Date(task.due_date).toLocaleDateString("de-DE")} · ` : ""}Vorschlag: 90 min Block
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => handlePlanTaskAsBlock(task)}>
                    Als Block einplanen
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      ) : null}

      {showFocusSection ? (
      <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
        <SectionTitle
          eyebrow="Heute / To-dos"
          title="Aufgabe direkt im Planner anlegen"
          sub="Tag 3 Abschluss: neue To-dos direkt einer Person zuweisen, ohne die Seite zu verlassen."
        />
        <form onSubmit={handleCreateTask} style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(220px, 1.6fr) repeat(3, minmax(140px, 1fr)) auto" }}>
          <input className="input" placeholder="Was muss heute erledigt werden?" value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} />
          <select className="input" value={taskForm.assigned_to_id} onChange={(e) => setTaskForm((prev) => ({ ...prev, assigned_to_id: e.target.value }))}>
            <option value="">Niemand zugewiesen</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || member.email}
              </option>
            ))}
          </select>
          <select className="input" value={taskForm.priority} onChange={(e) => setTaskForm((prev) => ({ ...prev, priority: e.target.value }))}>
            <option value="high">Hoch</option>
            <option value="medium">Mittel</option>
            <option value="low">Niedrig</option>
          </select>
          <input className="input" type="date" value={taskForm.due_date} onChange={(e) => setTaskForm((prev) => ({ ...prev, due_date: e.target.value }))} />
          <button className="btn btn-primary btn-sm" type="submit" disabled={creatingTask || !taskForm.title.trim()}>
            {creatingTask ? "Speichert..." : "To-do anlegen"}
          </button>
        </form>
      </div>
      ) : null}

      {showPlanningSection && viewMode !== "day" ? (
        <>
          <PlanListCard title="Teampläne" subtitle="Alle bereits vorhandenen Team- und Mitarbeiterpläne im aktuellen Workspace." items={teamPlans} emptyText="Noch keine Teampläne vorhanden." />

          <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "minmax(320px, 1.05fr) minmax(320px, 0.95fr)" }}>
            <WeekBoard
              title="Meine Woche"
              subtitle="Eigene Zeitblöcke und Fokusfenster für die nächsten Arbeitstage."
              buckets={myWeekBuckets.map((bucket) => ({
                ...bucket,
                label: `${bucket.label}${hoursForDate(workScheduleByUserId[user?.id], bucket.key) <= 0 ? " · frei" : ` · ${hoursForDate(workScheduleByUserId[user?.id], bucket.key)}h`}`,
              }))}
              emptyText="Kein Block geplant."
            />
            <WeekBoard
              title="Team-Woche"
              subtitle={selectedMember ? `Zeitblöcke für ${selectedMember.name || selectedMember.email}.` : "Zeitblöcke des Teams nach Tag gebündelt."}
              buckets={teamWeekBuckets.map((bucket) => ({
                ...bucket,
                label: selectedMember
                  ? `${bucket.label}${hoursForDate(workScheduleByUserId[selectedMember.id], bucket.key) <= 0 ? " · frei" : ` · ${hoursForDate(workScheduleByUserId[selectedMember.id], bucket.key)}h`}`
                  : bucket.label,
              }))}
              emptyText="Noch nichts eingeplant."
            />
          </div>
        </>
      ) : null}

      <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
        <SectionTitle
          eyebrow="Tag 4"
          title="Zeitblock direkt im Planner planen"
          sub="Ohne neuen Screen: Zeitfenster sofort einem bestehenden Plan zuordnen und bei Bedarf direkt anpassen."
        />
        <form onSubmit={handleCreateTimeBlock} style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(180px, 1.1fr) minmax(220px, 1.4fr) repeat(2, minmax(180px, 1fr)) auto" }}>
          <select className="input" value={blockForm.plan_id} onChange={(e) => setBlockForm((prev) => ({ ...prev, plan_id: e.target.value }))}>
            <option value="">Plan wählen</option>
            {plansWithMeta.map((planEntry) => (
              <option key={planEntry.id} value={planEntry.id}>
                {(planEntry.owner || "Unbekannt")} · {planEntry.title || "Plan"}
              </option>
            ))}
          </select>
          <input className="input" value={blockForm.title} onChange={(e) => setBlockForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="z. B. Fokus-Block, Review, Deep Work" />
          <input className="input" type="datetime-local" value={toDateInputValue(blockForm.starts_at)} onChange={(e) => setBlockForm((prev) => ({ ...prev, starts_at: e.target.value }))} />
          <input className="input" type="datetime-local" value={toDateInputValue(blockForm.ends_at)} onChange={(e) => setBlockForm((prev) => ({ ...prev, ends_at: e.target.value }))} />
            <button className="btn btn-primary btn-sm" type="submit" disabled={creatingBlock || !blockForm.plan_id || !blockForm.title.trim() || !blockForm.starts_at || !blockForm.ends_at || blockFormScheduleCheck?.tone === "danger"}>
              {creatingBlock ? "Speichert..." : editingBlockId ? "Zeitblock aktualisieren" : "Zeitblock anlegen"}
            </button>
          </form>
          {plannedFromTask ? (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              Zeitblock wird gerade aus der Aufgabe <strong>{plannedFromTask.title}</strong> vorbereitet.
            </div>
          ) : null}
          {blockFormScheduleCheck ? (
            <div
              style={{
                padding: "var(--s-3)",
                borderRadius: "var(--r-md)",
                border: `1px solid ${blockFormScheduleCheck.tone === "danger" ? "var(--c-danger)" : blockFormScheduleCheck.tone === "warning" ? "var(--c-warning)" : "var(--c-success)"}33`,
                background: `${blockFormScheduleCheck.tone === "danger" ? "var(--c-danger)" : blockFormScheduleCheck.tone === "warning" ? "var(--c-warning)" : "var(--c-success)"}12`,
                fontSize: "var(--text-sm)",
                color: "var(--c-text-2)",
              }}
            >
              {blockFormScheduleCheck.message}
            </div>
          ) : null}
          {editingBlockId ? (
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Bearbeite gerade einen bestehenden Zeitblock.</div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => {
              setEditingBlockId(null);
              setBlockForm((prev) => ({ ...prev, title: "Fokus-Block", starts_at: "", ends_at: "" }));
            }}>
              Bearbeitung beenden
            </button>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>
            {selectedMember ? `Nächste Blöcke für ${selectedMember.name || selectedMember.email}` : "Nächste sichtbare Blöcke"}
          </div>
          {visibleBlocks.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Noch keine Zeitblöcke zum Bearbeiten vorhanden.</div>
          ) : (
            <div style={{ display: "grid", gap: "var(--s-2)" }}>
                {visibleBlocks.map((block) => (
                  <div
                    key={block.id}
                    style={{
                      padding: "var(--s-3)",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--c-border)",
                      background: hoursForDate(workScheduleByUserId[block.user_id], block.starts_at) <= 0 ? "var(--c-surface-3, #f3f4f6)" : "var(--c-surface-2)",
                      opacity: hoursForDate(workScheduleByUserId[block.user_id], block.starts_at) <= 0 ? 0.72 : 1,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--s-3)",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{block.title || "Zeitblock"}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                        {block.owner ? `${block.owner} · ` : ""}{formatBlockDate(block.starts_at)}{block.ends_at ? ` bis ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(block.ends_at))}` : ""}
                      </div>
                      {hoursForDate(workScheduleByUserId[block.user_id], block.starts_at) <= 0 ? (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-warning)" }}>
                          Nicht buchbarer Tag laut Arbeitszeitmodell
                        </div>
                      ) : null}
                    </div>
                  <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleEditBlock(block)}>
                      Bearbeiten
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleDeleteBlock(block.id)} disabled={deletingBlockId === block.id}>
                      {deletingBlockId === block.id ? "Löscht..." : "Löschen"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </PlannerDisclosure>
      ) : null}

      {showTeamSection ? (
      <PlannerDisclosure
        title="Teamsteuerung"
        subtitle="CEO-Matrix, Mitarbeiterfokus und Wochen-Setup bleiben da, aber in einem eigenen ruhigen Bereich."
        defaultOpen
      >
      <TeamMatrix
        rows={teamMatrixRows}
        selectedMemberId={selectedMemberId}
        onFocusMember={handleFocusMember}
        onPrefillTask={handlePrefillTask}
        onPrefillBlock={handlePrefillBlock}
      />

      {selectedMember ? (
        <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
          <SectionTitle
            eyebrow="Mitarbeiter-Fokus"
            title={`Heute für ${selectedMember.name || selectedMember.email}`}
            sub="Direkter Blick auf die aktuell zugewiesenen Aufgaben mit Statuspflege direkt im Planner."
          />
          {selectedMemberTasks.length === 0 ? (
            <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Für diese Person sind aktuell keine Aufgaben zugewiesen.</div>
          ) : (
            <div style={{ display: "grid", gap: "var(--s-2)" }}>
              {selectedMemberTasks.map((task) => {
                const priority = priorityFor(task.priority);
                const nextStatus = task.status === "open" ? "in_progress" : task.status === "in_progress" ? "done" : "open";
                const nextLabel = nextStatus === "in_progress" ? "Starten" : nextStatus === "done" ? "Erledigen" : "Zurücksetzen";
                return (
                  <div key={task.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{task.title}</div>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: priority.color, background: `${priority.color}18`, padding: "2px 8px", borderRadius: 999 }}>
                        {priority.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                      <span>Status: {task.status_label || task.status}</span>
                      {task.due_date ? <span>Deadline: {new Date(task.due_date).toLocaleDateString("de-DE")}</span> : null}
                    </div>
                    <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleTaskStatusUpdate(task.id, nextStatus)} disabled={updatingTaskId === task.id}>
                        {updatingTaskId === task.id ? "Speichert..." : nextLabel}
                      </button>
                      <Link to="/tasks" className="btn btn-ghost btn-sm">In Aufgaben öffnen</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
          <div style={{ fontWeight: 700 }}>Wochen-Setup</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            Plane fixe Zeitblöcke für Strategie, Marketing und Review.
          </div>
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {["Strategie-Review", "Marketing Review", "Sales Pipeline"].map((item) => (
              <div key={item} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
                <div style={{ fontWeight: 600 }}>{item}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Empfohlen: 90 min</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <Link to="/team" className="btn btn-secondary btn-sm">Teamstruktur öffnen</Link>
            <button className="btn btn-primary btn-sm">Zeitblöcke bearbeiten</button>
          </div>
        </div>

        <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
          <div style={{ fontWeight: 700 }}>Tag 3 ist damit vollständig</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
            Teamplan sichtbar, persönlicher Plan sichtbar, tägliche To-dos als eigener Bereich und CEO-Matrix mit Status- und Fokuspflege im Planner.
          </div>
          <Link to="/command" className="btn btn-secondary btn-sm" style={{ width: "fit-content" }}>
            Priorisierung öffnen
          </Link>
        </div>
      </div>
      </PlannerDisclosure>
      ) : null}

      {showOverviewSection ? <PlanBoard plan={plan} loading={loading} /> : null}
    </div>
  );
}
