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
const TEAM_FILTER_STORAGE_KEY = "intlyst-planner-team-filter-v1";
const SPECIALTY_FILTER_STORAGE_KEY = "intlyst-planner-specialty-filter-v1";
const VIEW_MODE_STORAGE_KEY = "intlyst-planner-view-mode-v1";
const FOCUS_SLOTS_STORAGE_KEY = "intlyst-planner-focus-slots-v1";
const PLANNER_SECTION_STORAGE_KEY = "intlyst-planner-section-v1";
const AUTOMATION_MODE_STORAGE_KEY = "intlyst-planner-automation-mode-v1";
const AUTOMATION_TEMPLATE_STORAGE_KEY = "intlyst-planner-automation-template-v1";

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

function roundToNextHalfHour(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  date.setSeconds(0, 0);
  if (date.getMinutes() === 0 || date.getMinutes() === 30) return date;
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60);
  return date;
}

function buildSuggestedBlockWindow(scheduleEntry, options = {}) {
  const preferredStartHour = options.preferredStartHour ?? 9;
  const preferredDurationHours = options.preferredDurationHours ?? 2;
  const now = roundToNextHalfHour(new Date());
  const weekly = parseWeeklyHoursMap(scheduleEntry?.weekly_hours_json);

  for (let offset = 0; offset < 7; offset += 1) {
    const candidateDay = startOfDay(addDays(now, offset));
    const availableHours = scheduleEntry ? weekly[weekdayKeyForDate(candidateDay)] || 0 : 8;
    if (scheduleEntry && availableHours <= 0) continue;

    const start = new Date(candidateDay);
    start.setHours(preferredStartHour, 0, 0, 0);
    if (offset === 0 && start < now) {
      start.setTime(now.getTime());
    }

    const end = new Date(start.getTime() + preferredDurationHours * 3600000);
    return {
      starts_at: toLocalDateTimeInputValue(start),
      ends_at: toLocalDateTimeInputValue(end),
    };
  }

  const fallbackStart = roundToNextHalfHour(new Date());
  const fallbackEnd = new Date(fallbackStart.getTime() + preferredDurationHours * 3600000);
  return {
    starts_at: toLocalDateTimeInputValue(fallbackStart),
    ends_at: toLocalDateTimeInputValue(fallbackEnd),
  };
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

function parseSuggestionPayload(raw) {
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
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

function TeamMatrix({ rows, selectedMemberId, onFocusMember, onPrefillTask, onPrefillBlock, canManageTeam, currentUserId }) {
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
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => onPrefillTask?.(row.id)} disabled={!canManageTeam && Number(row.id) !== Number(currentUserId)}>
                  Task
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => onPrefillBlock?.(row.id)} disabled={!canManageTeam && Number(row.id) !== Number(currentUserId)}>
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
              <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                {item.priority ? (
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 700,
                      color: priorityFor(item.priority).color,
                      background: `${priorityFor(item.priority).color}18`,
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {priorityFor(item.priority).label}
                  </span>
                ) : null}
              </div>
              {item.meta ? <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityPulseBoard({ summary, items }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 24"
        title="Prioritaeten auf einen Blick"
        sub="Die wichtigsten Aufgaben und Risiken werden verdichtet gezeigt, damit Planung schneller und klarer wird."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {summary.map((item) => (
          <div key={item.label} className="ceo-section" style={{ padding: "var(--s-4)", display: "grid", gap: 4 }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              {item.label}
            </div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: item.color || "var(--c-text)" }}>{item.value}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Keine priorisierten Aufgaben sichtbar.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: priorityFor(item.priority).color, background: `${priorityFor(item.priority).color}18`, padding: "2px 8px", borderRadius: 999 }}>
                  {priorityFor(item.priority).label}
                </span>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationBoard({
  templates,
  onApplyTaskTemplate,
  onApplyBlockTemplate,
  onDraftAllSuggestions,
  draftingAll,
  pendingSuggestionCount,
  automationMode,
  onAutomationModeChange,
  selectedTemplateKey,
  onSelectedTemplateChange,
  onRunAutomationRoutine,
  runningRoutine,
}) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 25 / 26"
        title="Smart Automation"
        sub="Wiederkehrende Aufgaben und KI-Entwuerfe werden vorbereitet, ohne den Planner unruhig zu machen."
      />
      <div className="ceo-section" style={{ padding: "var(--s-4)", display: "grid", gap: "var(--s-3)" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>
            Automationsprofil
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
            Tag 26 macht die Automatisierung wiederverwendbar: Modus und Standard-Vorlage bleiben im Planner gespeichert.
          </div>
        </div>
        <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(180px, 220px) minmax(220px, 1fr) auto", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Modus</span>
            <select className="input" value={automationMode} onChange={(e) => onAutomationModeChange(e.target.value)}>
              <option value="manual">Manuell</option>
              <option value="draft_first">Entwurf zuerst</option>
              <option value="routine">Routine zuerst</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Standard-Vorlage</span>
            <select className="input" value={selectedTemplateKey} onChange={(e) => onSelectedTemplateChange(e.target.value)}>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-sm" type="button" onClick={onRunAutomationRoutine} disabled={runningRoutine}>
            {runningRoutine ? "Laeuft..." : "Routine ausfuehren"}
          </button>
        </div>
      </div>
      <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>
            KI-Vorschlaege gesammelt als Entwurf sichern
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
            {pendingSuggestionCount > 0 ? `${pendingSuggestionCount} offene Vorschlaege koennen direkt als Draft gespeichert werden.` : "Aktuell gibt es keine offenen Vorschlaege fuer einen Sammel-Entwurf."}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onDraftAllSuggestions} disabled={draftingAll || pendingSuggestionCount === 0}>
          {draftingAll ? "Speichert..." : "Alle als Entwurf sichern"}
        </button>
      </div>
      <div style={{ display: "grid", gap: "var(--s-2)" }}>
        {templates.map((template) => (
          <div key={template.key} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--c-text)" }}>{template.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{template.summary}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{template.meta}</div>
            </div>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => onApplyTaskTemplate(template)}>
                Task-Vorlage
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => onApplyBlockTemplate(template)}>
                Block-Vorlage
              </button>
            </div>
          </div>
        ))}
      </div>
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

function AISuggestionBoard({ items, onApply, onDismiss, onDraft, onApprove, busyKey, canApprove = false }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 15-16"
        title="KI-Vorschläge für heute"
        sub="Die KI bewertet offene Aufgaben, Deadlines und Teamlast und erlaubt jetzt zusätzlich Entwurf und Freigabe direkt im Planner."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Aktuell keine KI-Vorschläge mit hoher Relevanz.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {items.map((item) => {
            const toneColor =
              item.tone === "danger" ? "var(--c-danger)" : item.tone === "warning" ? "var(--c-warning)" : "var(--c-success)";
            const isBusy = busyKey === item.key;
            return (
              <div
                key={item.key}
                style={{
                  padding: "var(--s-4)",
                  borderRadius: "var(--r-md)",
                  border: `1px solid ${toneColor}33`,
                  background: `${toneColor}10`,
                  display: "grid",
                  gap: "var(--s-3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: toneColor, background: `${toneColor}18`, padding: "2px 8px", borderRadius: 999 }}>
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                          color:
                            item.status === "applied"
                              ? "var(--c-success)"
                              : item.status === "dismissed"
                                ? "var(--c-text-3)"
                                : "var(--c-primary)",
                          background:
                            item.status === "applied"
                              ? "var(--c-success)18"
                              : item.status === "dismissed"
                                ? "var(--c-surface-3)"
                                : "var(--c-primary)18",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {item.statusLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>{item.message}</div>
                    {item.prompt ? (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", padding: "var(--s-2) var(--s-3)", background: "var(--c-surface-2)", borderRadius: "var(--r-sm)" }}>
                        {item.prompt}
                      </div>
                    ) : null}
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => onApply(item)} disabled={isBusy || item.status === "applied"}>
                      {isBusy && item.pendingAction === "apply" ? "Wird gespeichert..." : item.actionLabel}
                    </button>
                    {item.status === "suggested" ? (
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => onDraft(item)} disabled={isBusy}>
                        {isBusy && item.pendingAction === "draft" ? "Wird gespeichert..." : "Als Entwurf"}
                      </button>
                    ) : null}
                    {item.status === "draft" && canApprove ? (
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => onApprove(item)} disabled={isBusy}>
                        {isBusy && item.pendingAction === "approve" ? "Wird freigegeben..." : "Freigeben"}
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => onDismiss(item)} disabled={isBusy || item.status === "dismissed"}>
                      {isBusy && item.pendingAction === "dismiss" ? "Wird gespeichert..." : "Ablehnen"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AISuggestionApprovalBoard({ items, onApprove, onDismiss, busyKey, canApprove }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 17"
        title="KI-Freigaben"
        sub="Entwürfe bleiben sichtbar, bis CEO oder Manager sie bewusst freigeben oder ablehnen."
      />
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Aktuell keine offenen KI-Entwürfe zur Freigabe.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {items.map((item) => {
            const isBusy = busyKey === item.key;
            return (
              <div key={item.key} style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: 1.6 }}>{item.message}</div>
                    {item.prompt ? (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", padding: "var(--s-2) var(--s-3)", background: "var(--c-surface)", borderRadius: "var(--r-sm)" }}>
                        {item.prompt}
                      </div>
                    ) : null}
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.meta}</div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                    {canApprove ? (
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => onApprove(item)} disabled={isBusy}>
                        {isBusy ? "Wird freigegeben..." : "Freigeben"}
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => onDismiss(item)} disabled={isBusy}>
                      {isBusy ? "Wird gespeichert..." : "Ablehnen"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamVisibilityBoard({ selectedMember, canManageTeam, viewerRole, teamCount, memberCount }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 18"
        title="Team-Sichtbarkeit"
        sub="Teampläne bleiben für alle sichtbar, aber die Eingriffstiefe richtet sich nach der Rolle."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Sichtmodus</div>
          <div style={{ marginTop: 6, fontWeight: 700, color: "var(--c-text)" }}>{canManageTeam ? "Team steuerbar" : "Read-only Team-Sicht"}</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
            {canManageTeam
              ? "CEO und Manager koennen Teamfokus, Vorschlaege und Teamplanung direkt steuern."
              : "Mitglieder sehen Teamplanung transparent, aber ohne zentrale Steueraktionen fuer andere Personen."}
          </div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Aktueller Fokus</div>
          <div style={{ marginTop: 6, fontWeight: 700, color: "var(--c-text)" }}>{selectedMember ? (selectedMember.name || selectedMember.email) : "Gesamtes Team"}</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
            Rolle: {viewerRole || "member"} · {teamCount} Teams · {memberCount} Mitglieder
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditTrailBoard({ items, viewerRole }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Audit-Log"
        title="Wer hat was geändert"
        sub="Zeigt die letzten Änderungen aus dem Workspace, inklusive KI- und Freigabe-Aktionen."
      />
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
        Sichtbar als: {viewerRole || "member"} · Mitglieder sehen nur ihre eigenen Logs, Manager und CEO den Workspace-Verlauf.
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Noch keine Audit-Einträge für die aktuelle Sicht vorhanden.</div>
      ) : (
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                <span style={{ fontSize: "var(--text-xs)", color: item.isAi ? "var(--c-primary)" : "var(--c-text-3)", background: item.isAi ? "var(--c-primary)18" : "var(--c-surface-3)", padding: "2px 8px", borderRadius: 999 }}>
                  {item.badge}
                </span>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{item.meta}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{item.timeLabel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTransparencySummary({ rows }) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.openTasks += row.openTasks || 0;
      acc.overdue += row.overdueTasks || 0;
      acc.dueToday += row.dueToday || 0;
      if (row.loadLabel === "Hoch") acc.highLoad += 1;
      return acc;
    },
    { openTasks: 0, overdue: 0, dueToday: 0, highLoad: 0 },
  );

  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 20"
        title="Team-Transparenz auf einen Blick"
        sub="Verdichtet die aktuelle Filter-Sicht in wenige Kennzahlen, damit der Teamzustand sofort lesbar bleibt."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Offene Aufgaben</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--c-text)" }}>{totals.openTasks}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Heute fällig</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--c-text)" }}>{totals.dueToday}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Überfällig</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-xl)", fontWeight: 800, color: totals.overdue > 0 ? "var(--c-danger)" : "var(--c-text)" }}>{totals.overdue}</div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Hohe Belastung</div>
          <div style={{ marginTop: 6, fontSize: "var(--text-xl)", fontWeight: 800, color: totals.highLoad > 0 ? "var(--c-warning)" : "var(--c-text)" }}>{totals.highLoad}</div>
        </div>
      </div>
    </div>
  );
}

function DailyFlowBoard({ context, actions }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 22"
        title="Tagesfluss"
        sub="Der Planner gibt dir jetzt einen klaren Tagesmodus vor, statt nur viele einzelne Karten nebeneinander zu zeigen."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(260px, 0.8fr)" }}>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-3)" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Tagesmodus
            </div>
            <div style={{ marginTop: 6, fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--c-text)" }}>
              {context.title}
            </div>
            <div style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
              {context.summary}
            </div>
          </div>
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {context.points.map((point) => (
              <div key={point} style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                {point}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-3)", alignContent: "start" }}>
          <div style={{ fontWeight: 700, color: "var(--c-text)" }}>Nächste Schritte</div>
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {actions.map((action) => (
              <div key={action.title} style={{ padding: "var(--s-3)", borderRadius: "var(--r-sm)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)", marginBottom: 4 }}>{action.title}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>{action.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekThreeReviewBoard({ items, feedback }) {
  return (
    <div className="ceo-section" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-4)" }}>
      <SectionTitle
        eyebrow="Tag 21"
        title="Review und Feedback"
        sub="Woche 3 wird hier als schneller Realitätscheck abgeschlossen: Rollen, KI-Vorschläge, Team-Transparenz und Bedienfluss."
      />
      <div style={{ display: "grid", gap: "var(--s-3)", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(260px, 0.8fr)" }}>
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: `1px solid ${item.color}33`, background: `${item.color}12`, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 700, color: "var(--c-text)" }}>{item.title}</div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: item.color }}>{item.state}</div>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{item.meta}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "grid", gap: "var(--s-3)", alignContent: "start" }}>
          <div style={{ fontWeight: 700, color: "var(--c-text)" }}>Feedback-Schleife</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
            {feedback.summary}
          </div>
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {feedback.points.map((point) => (
              <div key={point} style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                {point}
              </div>
            ))}
          </div>
        </div>
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
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    try {
      return window.localStorage.getItem(TEAM_FILTER_STORAGE_KEY) || "all";
    } catch {
      return "all";
    }
  });
  const [selectedSpecialty, setSelectedSpecialty] = useState(() => {
    try {
      return window.localStorage.getItem(SPECIALTY_FILTER_STORAGE_KEY) || "all";
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
  const [automationMode, setAutomationMode] = useState(() => {
    try {
      return window.localStorage.getItem(AUTOMATION_MODE_STORAGE_KEY) || "manual";
    } catch {
      return "manual";
    }
  });
  const [selectedAutomationTemplateKey, setSelectedAutomationTemplateKey] = useState(() => {
    try {
      return window.localStorage.getItem(AUTOMATION_TEMPLATE_STORAGE_KEY) || "weekly-report";
    } catch {
      return "weekly-report";
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
  const [prioritizedTasks, setPrioritizedTasks] = useState({ today_top: [], week_top: [], ceo_focus: [], all: [], categories: {} });
  const [savedSuggestions, setSavedSuggestions] = useState([]);
  const [suggestionBusyKey, setSuggestionBusyKey] = useState(null);
  const [draftingAllSuggestions, setDraftingAllSuggestions] = useState(false);
  const [runningAutomationRoutine, setRunningAutomationRoutine] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditViewerRole, setAuditViewerRole] = useState("member");

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
          fetch("/api/tasks/prioritized", { headers }),
          fetch("/api/suggestions", { headers }),
          fetch("/api/audit-logs?limit=12", { headers }),
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
          prioritizedRes,
          suggestionsRes,
          auditLogsRes,
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
        setPrioritizedTasks(prioritizedRes.status === "fulfilled" && prioritizedRes.value.ok ? await prioritizedRes.value.json() : { today_top: [], week_top: [], ceo_focus: [], all: [], categories: {} });
        setSavedSuggestions(suggestionsRes.status === "fulfilled" && suggestionsRes.value.ok ? normalizeItems(await suggestionsRes.value.json()) : []);
        if (auditLogsRes.status === "fulfilled" && auditLogsRes.value.ok) {
          const auditPayload = await auditLogsRes.value.json();
          setAuditLogs(normalizeItems(auditPayload));
          setAuditViewerRole(auditPayload?.viewer_role || "member");
        } else {
          setAuditLogs([]);
          setAuditViewerRole("member");
        }
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
  const canApproveAiSuggestions = useMemo(() => ["ceo", "owner", "admin", "manager"].includes(String(user?.role || "").toLowerCase()), [user?.role]);
  const canManageTeamPlanner = canApproveAiSuggestions;
  const specialtyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          memberships
            .map((membership) => String(membership.specialty || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [memberships],
  );
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
          teamId,
          teamName: teamNameById[teamId] || null,
          specialty: membershipByUserId[item.user_id]?.specialty || "",
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
      window.localStorage.setItem(TEAM_FILTER_STORAGE_KEY, selectedTeamId);
    } catch {
      // Ignore storage errors for local team memory.
    }
  }, [selectedTeamId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPECIALTY_FILTER_STORAGE_KEY, selectedSpecialty);
    } catch {
      // Ignore storage errors for local specialty memory.
    }
  }, [selectedSpecialty]);

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
    try {
      window.localStorage.setItem(AUTOMATION_MODE_STORAGE_KEY, automationMode);
    } catch {
      // Ignore storage errors for local automation mode memory.
    }
  }, [automationMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTOMATION_TEMPLATE_STORAGE_KEY, selectedAutomationTemplateKey);
    } catch {
      // Ignore storage errors for local automation template memory.
    }
  }, [selectedAutomationTemplateKey]);

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
        if (selectedTeamId !== "all" && String(item.teamId || "") !== String(selectedTeamId)) return false;
        if (selectedSpecialty !== "all" && String(item.specialty || "") !== String(selectedSpecialty)) return false;
        if (!selectedMember) return true;
        return Number(item.user_id) === Number(selectedMember.id);
      }),
    [plansWithMeta, selectedMember, selectedSpecialty, selectedTeamId, user?.id],
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
          teamId: membership?.team_id || null,
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
        .filter((row) => (selectedTeamId !== "all" ? String(row.teamId || "") === String(selectedTeamId) : true))
        .filter((row) => (selectedSpecialty !== "all" ? String(row.specialty || "") === String(selectedSpecialty) : true))
        .filter((row) => (selectedMember ? Number(row.id) === Number(selectedMember.id) : true))
        .sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name));
  }, [members, membershipByUserId, plan.daily, plans, selectedMember, selectedSpecialty, selectedTeamId, tasks, teamNameById, timeBlocks, user?.id, workScheduleByUserId]);

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
        const planEntry = plansWithMeta.find((entry) => entry.id === block.plan_id);
        const owner = planEntry ? memberById[planEntry.user_id] : null;
        return {
          ...block,
          owner: owner?.name || owner?.email || "",
          user_id: planEntry?.user_id || null,
          teamId: planEntry?.teamId || membershipByUserId[planEntry?.user_id]?.team_id || null,
          teamName: planEntry?.teamName || teamNameById[membershipByUserId[planEntry?.user_id]?.team_id] || "",
          specialty: planEntry?.specialty || membershipByUserId[planEntry?.user_id]?.specialty || "",
          timeLabel: block.starts_at
            ? new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(block.starts_at))
            : "Ohne Zeit",
        };
      }),
    [memberById, membershipByUserId, plansWithMeta, teamNameById, timeBlocks],
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
          if (selectedTeamId !== "all" && String(block.teamId || "") !== String(selectedTeamId)) return false;
          if (selectedSpecialty !== "all" && String(block.specialty || "") !== String(selectedSpecialty)) return false;
          if (!selectedMember) return true;
          return Number(block.user_id) === Number(selectedMember.id);
        }),
      })),
    [blocksWithMeta, selectedMember, selectedSpecialty, selectedTeamId, weekBuckets],
  );

  const visibleBlocks = useMemo(() => {
    const filtered = blocksWithMeta.filter((block) => {
      if (selectedTeamId !== "all" && String(block.teamId || "") !== String(selectedTeamId)) return false;
      if (selectedSpecialty !== "all" && String(block.specialty || "") !== String(selectedSpecialty)) return false;
      if (!selectedMember) return block.user_id === user?.id || !block.user_id;
      return Number(block.user_id) === Number(selectedMember.id);
    });
    return filtered
      .slice()
      .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0))
      .slice(0, 6);
  }, [blocksWithMeta, selectedMember, selectedSpecialty, selectedTeamId, user?.id]);

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
        priority: task.priority,
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

  const priorityPulseSummary = useMemo(() => {
    const scopedTasks = selectedMember
      ? tasks.filter((task) => Number(task.assigned_to_id) === Number(selectedMember.id) || (task.assigned_to && selectedMember.email && task.assigned_to === selectedMember.email))
      : tasks.filter((task) => Number(task.assigned_to_id) === Number(user?.id) || (task.assigned_to && user?.email && task.assigned_to === user.email));

    const openTasks = scopedTasks.filter((task) => task.status !== "done");
    const highPriorityCount = openTasks.filter((task) => String(task.priority || "").toLowerCase() === "high").length;
    const mediumPriorityCount = openTasks.filter((task) => String(task.priority || "").toLowerCase() === "medium").length;
    const overdueCount = openTasks.filter((task) => task.due_date && String(task.due_date) < new Date().toISOString().slice(0, 10)).length;

    return [
      { label: "Hoch", value: highPriorityCount, meta: "sofort sichtbar", color: "var(--c-danger)" },
      { label: "Mittel", value: mediumPriorityCount, meta: "im Blick behalten", color: "var(--c-warning)" },
      { label: "Ueberfaellig", value: overdueCount, meta: "braucht Entscheidung", color: overdueCount > 0 ? "var(--c-danger)" : "var(--c-success)" },
      { label: "Fokus", value: todayFocusCards.topTasks.length, meta: "heute ganz oben", color: "var(--c-primary)" },
    ];
  }, [selectedMember, tasks, todayFocusCards.topTasks.length, user?.email, user?.id]);

  const priorityPulseItems = useMemo(() => {
    const scopedTasks = selectedMember
      ? tasks.filter((task) => Number(task.assigned_to_id) === Number(selectedMember.id) || (task.assigned_to && selectedMember.email && task.assigned_to === selectedMember.email))
      : tasks.filter((task) => Number(task.assigned_to_id) === Number(user?.id) || (task.assigned_to && user?.email && task.assigned_to === user.email));

    return scopedTasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        const dueA = a.due_date ? String(a.due_date) : "9999-12-31";
        const dueB = b.due_date ? String(b.due_date) : "9999-12-31";
        return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || dueA.localeCompare(dueB);
      })
      .slice(0, 4)
      .map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority || "medium",
        meta: `${task.status_label || task.status || "offen"}${task.due_date ? ` · fällig ${new Date(task.due_date).toLocaleDateString("de-DE")}` : ""}`,
      }));
  }, [selectedMember, tasks, user?.email, user?.id]);

  const dailyFlowContext = useMemo(() => {
    const weekday = new Date().getDay();
    const isMonday = weekday === 1;
    const isFriday = weekday === 5;
    const overloadedCount = teamMatrixRows.filter((row) => row.loadLabel === "Hoch" || row.overdueTasks > 0).length;
    const focusCount = todayFocusCards.topTasks.length;
    const blockCount = todayFocusCards.todaysBlocks.length;

    let title = "Fokus zuerst";
    let summary = "Heute stehen wenige wirklich wichtige Aufgaben im Vordergrund. Der Planner reduziert den Tag auf Fokus, Blöcke und die nächsten klaren Schritte.";

    if (isMonday) {
      title = "Montag Fokus";
      summary = "Starte die Woche mit Prioritäten, Teamklarheit und den ersten starken Fokusblöcken statt mit reiner To-do-Sammlung.";
    } else if (isFriday) {
      title = "Freitag Review";
      summary = "Heute liegt der Schwerpunkt auf Abschluss, Review und dem sauberen Übergang in die nächste Woche.";
    } else if (overloadedCount > 1) {
      title = "Engpass-Modus";
      summary = "Mehrere Teammitglieder sind unter Druck. Heute zählt Entlastung, klare Freigabe und das Weglassen von Low-Impact-Arbeit.";
    }

    return {
      title,
      summary,
      points: [
        `${focusCount} priorisierte Aufgaben sind heute im Fokus.`,
        `${blockCount} Fokusblöcke sind für heute bereits sichtbar.`,
        overloadedCount > 0 ? `${overloadedCount} Teampersonen brauchen heute besondere Aufmerksamkeit.` : "Im Team ist aktuell kein akuter Engpass sichtbar.",
      ],
    };
  }, [teamMatrixRows, todayFocusCards]);

  const aiSuggestionLead = useMemo(() => {
    const prioritizedAll = prioritizedTasks?.all || [];
    const todayTop = prioritizedTasks?.today_top || [];
    const dueSoonHigh = prioritizedAll.find((task) => (task.priority_stage === "KRITISCH" || task.priority_stage === "SEHR WICHTIG") && !task.status?.includes("done"));
    const topTask = todayTop[0] || dueSoonHigh || null;
    if (topTask?.title) return topTask.title;

    const overloadedMember = teamMatrixRows.find((row) => row.overdueTasks > 0 || row.loadLabel === "Hoch" || (row.hoursToday > 0 && row.remainingToday <= 1));
    return overloadedMember ? `${overloadedMember.name} braucht Fokus` : "";
  }, [prioritizedTasks, teamMatrixRows]);

  const dailyFlowActions = useMemo(() => {
    const actions = [];
    if (todayFocusCards.topTasks[0]) {
      actions.push({
        title: `Mit ${todayFocusCards.topTasks[0].title} starten`,
        meta: "Die wichtigste Aufgabe zuerst in Fokus oder Block bringen.",
      });
    }
    if (aiSuggestionLead) {
      actions.push({
        title: "KI-Vorschlag prüfen",
        meta: aiSuggestionLead,
      });
    }
    if (todayFocusCards.todaysBlocks[0]) {
      actions.push({
        title: "Ersten Block schützen",
        meta: todayFocusCards.todaysBlocks[0].title,
      });
    }
    while (actions.length < 3) {
      actions.push({
        title: "Planner ruhig halten",
        meta: "Nur die wichtigsten Aufgaben und Blöcke oben lassen.",
      });
    }
    return actions.slice(0, 3);
  }, [aiSuggestionLead, todayFocusCards]);

  const selectedPlannerUserId = selectedMember?.id || user?.id || null;
  const selectedPlannerSchedule = selectedPlannerUserId ? workScheduleByUserId[selectedPlannerUserId] : null;

  const preferredPlannerPlan = useMemo(
    () =>
      plans.find((item) => Number(item.user_id) === Number(selectedPlannerUserId)) ||
      plans.find((item) => Number(item.user_id) === Number(user?.id)) ||
      plans[0] ||
      null,
    [plans, selectedPlannerUserId, user?.id],
  );

  const smartTaskDefaults = useMemo(() => {
    const selectedAssigneeId = selectedMember?.id || "";
    const today = new Date();
    const dueToday = today.toISOString().slice(0, 10);
    const friday = addDays(today, (5 - today.getDay() + 7) % 7 || 0).toISOString().slice(0, 10);
    const primarySuggestion = aiSuggestionLead || todayFocusCards.topTasks[0]?.title || "";

    if (dailyFlowContext.title === "Montag Fokus") {
      return {
        title: primarySuggestion || "Wochenstart priorisieren",
        priority: "high",
        due_date: dueToday,
        assigned_to_id: selectedAssigneeId ? String(selectedAssigneeId) : "",
        label: "Montag-Fokus",
        summary: "Starte die Woche mit einer hoch priorisierten Aufgabe und einem klaren Tagesziel.",
      };
    }

    if (dailyFlowContext.title === "Freitag Review") {
      return {
        title: primarySuggestion || "Wochenabschluss und Review",
        priority: "medium",
        due_date: dueToday,
        assigned_to_id: selectedAssigneeId ? String(selectedAssigneeId) : "",
        label: "Freitag-Review",
        summary: "Setze heute lieber Abschluss und Review als neue offene Schleifen.",
      };
    }

    if (dailyFlowContext.title === "Engpass-Modus") {
      return {
        title: primarySuggestion || "Engpass heute entlasten",
        priority: "high",
        due_date: dueToday,
        assigned_to_id: selectedAssigneeId ? String(selectedAssigneeId) : "",
        label: "Engpass",
        summary: "Hoher Impact und schnelle Entlastung gehen heute vor Nebenthemen.",
      };
    }

    return {
      title: primarySuggestion || "Naechster Fokus-Schritt",
      priority: todayFocusCards.topTasks.length > 0 ? "high" : "medium",
      due_date: todayFocusCards.topTasks.length > 0 ? dueToday : friday,
      assigned_to_id: selectedAssigneeId ? String(selectedAssigneeId) : "",
      label: "Fokus zuerst",
      summary: "Lege zuerst eine wirklich relevante Aufgabe an und halte den Rest klein.",
    };
  }, [aiSuggestionLead, dailyFlowContext.title, selectedMember, todayFocusCards.topTasks]);

  const smartBlockDefaults = useMemo(() => {
    const isFriday = dailyFlowContext.title === "Freitag Review";
    const isMonday = dailyFlowContext.title === "Montag Fokus";
    const isOverloaded = dailyFlowContext.title === "Engpass-Modus";
    const suggestion = buildSuggestedBlockWindow(selectedPlannerSchedule, {
      preferredStartHour: isFriday ? 14 : isMonday ? 9 : isOverloaded ? 10 : 9,
      preferredDurationHours: isFriday ? 1.5 : isOverloaded ? 1 : 2,
    });

    return {
      plan_id: preferredPlannerPlan ? String(preferredPlannerPlan.id) : "",
      title: isFriday ? "Review-Block" : isMonday ? "Wochenstart-Fokus" : isOverloaded ? "Entlastungs-Block" : "Fokus-Block",
      starts_at: suggestion.starts_at,
      ends_at: suggestion.ends_at,
      label: isFriday ? "Review" : isMonday ? "Wochenstart" : isOverloaded ? "Entlastung" : "Fokus",
      summary: isFriday
        ? "Kurzer Review-Block fuer Abschluss, Rueckblick und sauberen Uebergang."
        : isMonday
          ? "Ein klarer Fokusblock zum Wochenstart verhindert To-do-Chaos."
          : isOverloaded
            ? "Kurze Entlastungsfenster helfen bei knapper Kapazitaet mehr als verstreute Tasks."
            : "Plane lieber einen klaren Fokusblock als mehrere lose Unterbrechungen.",
    };
  }, [dailyFlowContext.title, preferredPlannerPlan, selectedPlannerSchedule]);

  const recurringAutomationTemplates = useMemo(() => {
    const assigneeId = selectedMember?.id ? String(selectedMember.id) : smartTaskDefaults.assigned_to_id;
    const reviewWindow = buildSuggestedBlockWindow(selectedPlannerSchedule, { preferredStartHour: 15, preferredDurationHours: 1.5 });
    const focusWindow = buildSuggestedBlockWindow(selectedPlannerSchedule, { preferredStartHour: 9, preferredDurationHours: 2 });
    const reportWindow = buildSuggestedBlockWindow(selectedPlannerSchedule, { preferredStartHour: 11, preferredDurationHours: 1 });

    return [
      {
        key: "weekly-report",
        title: "Woechentlicher Report",
        summary: "Wiederkehrender Abschluss fuer Kennzahlen, Fortschritt und offene Risiken.",
        meta: "Empfohlen freitags als Review plus Report-Block.",
        task: {
          title: "Woechentlichen KPI-Report vorbereiten",
          priority: "medium",
          assigned_to_id: assigneeId || "",
          due_date: addDays(new Date(), (5 - new Date().getDay() + 7) % 7 || 0).toISOString().slice(0, 10),
        },
        block: {
          plan_id: preferredPlannerPlan ? String(preferredPlannerPlan.id) : "",
          title: "Report-Block",
          starts_at: reportWindow.starts_at,
          ends_at: reportWindow.ends_at,
        },
      },
      {
        key: "monday-focus",
        title: "Wochenstart Fokus",
        summary: "Montags wiederkehrend die Top-Themen fuer Team und Umsatz sauber priorisieren.",
        meta: "Passt zum Tagesfluss Montag Fokus.",
        task: {
          title: "Wochenstart priorisieren und Teamfokus setzen",
          priority: "high",
          assigned_to_id: assigneeId || "",
          due_date: new Date().toISOString().slice(0, 10),
        },
        block: {
          plan_id: preferredPlannerPlan ? String(preferredPlannerPlan.id) : "",
          title: "Wochenstart-Fokus",
          starts_at: focusWindow.starts_at,
          ends_at: focusWindow.ends_at,
        },
      },
      {
        key: "friday-review",
        title: "Freitag Review",
        summary: "Wiederkehrender Review fuer Abschluss, Learnings und naechste Freigaben.",
        meta: "Ideal fuer Woche-zu-Woche Uebergabe und CEO-Sicht.",
        task: {
          title: "Freitags Review und offene Punkte schliessen",
          priority: "medium",
          assigned_to_id: assigneeId || "",
          due_date: new Date().toISOString().slice(0, 10),
        },
        block: {
          plan_id: preferredPlannerPlan ? String(preferredPlannerPlan.id) : "",
          title: "Review-Block",
          starts_at: reviewWindow.starts_at,
          ends_at: reviewWindow.ends_at,
        },
      },
    ];
  }, [preferredPlannerPlan, selectedMember, selectedPlannerSchedule, smartTaskDefaults.assigned_to_id]);

  const selectedAutomationTemplate = useMemo(
    () => recurringAutomationTemplates.find((template) => template.key === selectedAutomationTemplateKey) || recurringAutomationTemplates[0] || null,
    [recurringAutomationTemplates, selectedAutomationTemplateKey],
  );

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

  const suggestionStatusByKey = useMemo(() => {
    return Object.fromEntries(
      savedSuggestions.map((row) => {
        const payload = parseSuggestionPayload(row.payload_json);
        return [payload.key, row];
      }).filter(([key]) => !!key),
    );
  }, [savedSuggestions]);

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

  const aiSuggestionItems = useMemo(() => {
    const prioritizedAll = prioritizedTasks?.all || [];
    const todayTop = prioritizedTasks?.today_top || [];
    const ceoFocus = prioritizedTasks?.ceo_focus || [];
    const dueSoonHigh = prioritizedAll.find((task) => (task.priority_stage === "KRITISCH" || task.priority_stage === "SEHR WICHTIG") && !task.status?.includes("done"));
    const topTask = todayTop[0] || dueSoonHigh || null;
    const overloadedMember = teamMatrixRows.find((row) => row.overdueTasks > 0 || row.loadLabel === "Hoch" || (row.hoursToday > 0 && row.remainingToday <= 1));
    const lowImpactTask = prioritizedAll
      .filter((task) => (task.impact_score_calc || 0) < 35 && task.status !== "done")
      .sort((a, b) => (a.impact_score_calc || 0) - (b.impact_score_calc || 0))[0];

    const items = [];

    if (topTask) {
      const statusRow = suggestionStatusByKey[`schedule-task-${topTask.id}`];
      items.push({
        key: `schedule-task-${topTask.id}`,
        type: "schedule_task",
        taskId: topTask.id,
        task: topTask,
        title: `Jetzt einplanen: ${topTask.title}`,
        label: topTask.priority_stage || "Wichtig",
        tone: "danger",
        message: `KI schlägt vor, diese Aufgabe jetzt als Fokusblock einzuplanen, weil Deadline, Priorität und KPI-Impact dafür sprechen.`,
        prompt: "KI schlägt vor, diesen Block zu verschieben oder direkt einzuplanen. Soll ich das als Entwurf speichern oder sofort eintragen?",
        meta: `${topTask.reason || "Hoher Impact"}${topTask.due_date ? ` · Deadline ${new Date(topTask.due_date).toLocaleDateString("de-DE")}` : ""}`,
        actionLabel: "1-Klick einplanen",
        status: statusRow?.status || "suggested",
        statusLabel: statusRow?.status === "applied" ? "Applied" : statusRow?.status === "dismissed" ? "Dismissed" : statusRow?.status === "draft" ? "Draft" : "Suggested",
      });
    }

    if (overloadedMember) {
      const statusRow = suggestionStatusByKey[`focus-member-${overloadedMember.id}`];
      items.push({
        key: `focus-member-${overloadedMember.id}`,
        type: "focus_member",
        memberId: overloadedMember.id,
        title: `${overloadedMember.name} braucht CEO-Fokus`,
        label: overloadedMember.loadLabel,
        tone: overloadedMember.overdueTasks > 0 ? "danger" : "warning",
        message: `KI schlägt vor, den Fokus auf ${overloadedMember.name} zu setzen, weil dort Überlastung oder kritische Deadlines sichtbar sind.`,
        prompt: "KI sieht Überlastung im Team. Soll ich die Team-Sicht auf diese Person fokussieren und den Fall für die Freigabe markieren?",
        meta: `${overloadedMember.overdueTasks} überfällig · ${overloadedMember.dueToday} heute fällig · ${overloadedMember.remainingToday}h Rest`,
        actionLabel: "Fokus setzen",
        status: statusRow?.status || "suggested",
        statusLabel: statusRow?.status === "applied" ? "Applied" : statusRow?.status === "dismissed" ? "Dismissed" : statusRow?.status === "draft" ? "Draft" : "Suggested",
      });
    }

    if (lowImpactTask) {
      const statusRow = suggestionStatusByKey[`deprioritize-${lowImpactTask.id}`];
      items.push({
        key: `deprioritize-${lowImpactTask.id}`,
        type: "deprioritize_task",
        taskId: lowImpactTask.id,
        task: lowImpactTask,
        title: `Low Impact prüfen: ${lowImpactTask.title}`,
        label: "Low Impact",
        tone: "warning",
        message: `KI bewertet diese Aufgabe aktuell als vergleichsweise schwach. Wenn heute Engpass herrscht, sollte sie eher nach hinten rücken als sofort geplant werden.`,
        prompt: "Low Impact erkannt. Soll ich die Priorität reduzieren und die Aufgabe im Planner später einsortieren?",
        meta: `${lowImpactTask.reason || "Niedriger KPI-Impact"} · Score ${Math.round(lowImpactTask.impact_score_calc || 0)}`,
        actionLabel: "Als später markieren",
        status: statusRow?.status || "suggested",
        statusLabel: statusRow?.status === "applied" ? "Applied" : statusRow?.status === "dismissed" ? "Dismissed" : statusRow?.status === "draft" ? "Draft" : "Suggested",
      });
    }

    if (ceoFocus.length > 2) {
      const statusRow = suggestionStatusByKey["ceo-focus-pack"];
      items.push({
        key: "ceo-focus-pack",
        type: "ceo_focus",
        title: "CEO-Fokus bündeln",
        label: "Team-Sicht",
        tone: "success",
        message: `KI hat mehrere umsatzrelevante Aufgaben erkannt. Die CEO-Sicht sollte jetzt auf die kritischsten Aufgaben konzentriert bleiben statt auf die gesamte To-do-Fläche.`,
        prompt: "Mehrere umsatzrelevante Tasks erkannt. Soll ich die CEO-Sicht dafür als Freigabepaket offen halten?",
        meta: `${ceoFocus.length} kritische Aufgaben im CEO-Fokus`,
        actionLabel: "Team-Sicht öffnen",
        status: statusRow?.status || "suggested",
        statusLabel: statusRow?.status === "applied" ? "Applied" : statusRow?.status === "dismissed" ? "Dismissed" : statusRow?.status === "draft" ? "Draft" : "Suggested",
      });
    }

    return items.slice(0, 4);
  }, [prioritizedTasks, suggestionStatusByKey, teamMatrixRows]);

  const aiDraftItems = useMemo(
    () => aiSuggestionItems.filter((item) => item.status === "draft"),
    [aiSuggestionItems],
  );

  const pendingAiDraftCount = useMemo(
    () => aiSuggestionItems.filter((item) => item.status !== "draft" && item.status !== "applied" && item.status !== "dismissed").length,
    [aiSuggestionItems],
  );

  const auditTrailItems = useMemo(() => {
    return auditLogs.slice(0, 8).map((entry) => {
      const metadata = parseSuggestionPayload(entry.metadata_json);
      const context = parseSuggestionPayload(entry.context_json);
      const action = entry.action || "update";
      const actorRole = entry.actor_role || auditViewerRole || "member";
      const isAi = String(action).toLowerCase().includes("ai") || String(actorRole).toLowerCase().includes("ai");
      return {
        id: entry.id,
        isAi,
        badge: isAi ? "KI / Automation" : actorRole,
        title: `${action}${entry.entity_type ? ` · ${entry.entity_type}` : ""}`,
        meta: metadata?.summary || context?.summary || metadata?.field || context?.field || "Aenderung im Workspace protokolliert.",
        timeLabel: entry.created_at ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.created_at)) : "Gerade eben",
      };
    });
  }, [auditLogs, auditViewerRole]);

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

  const weekThreeReviewItems = useMemo(() => {
    const roleCoverage = new Set(teamMatrixRows.map((row) => String(row.role || "").toLowerCase()));
    const hasLeadershipRole = roleCoverage.has("ceo") || roleCoverage.has("owner") || roleCoverage.has("admin") || roleCoverage.has("manager");
    const hasMemberRole = roleCoverage.has("member") || roleCoverage.has("assistant");
    const hasAiWorkflow = aiSuggestionItems.length > 0;
    const hasDraftWorkflow = aiDraftItems.length >= 0;
    const hasTransparency = auditTrailItems.length > 0 && teamMatrixRows.length > 0;

    return [
      {
        id: "roles-check",
        title: "Rollen mit 3 Perspektiven testbar",
        state: hasLeadershipRole && hasMemberRole ? "Bereit" : "Teilweise",
        color: hasLeadershipRole && hasMemberRole ? "var(--c-success)" : "var(--c-warning)",
        meta: hasLeadershipRole && hasMemberRole
          ? "Leadership- und Member-Sicht sind im Planner sichtbar und unterscheidbar."
          : "Mindestens eine zusätzliche Rolle fehlt noch in der aktuellen Teamansicht.",
      },
      {
        id: "ai-check",
        title: "KI-Vorschläge inkl. Entwurf/Freigabe verfügbar",
        state: hasAiWorkflow ? "Bereit" : "Offen",
        color: hasAiWorkflow ? "var(--c-success)" : "var(--c-danger)",
        meta: hasAiWorkflow
          ? `${aiSuggestionItems.length} Vorschläge sichtbar, ${aiDraftItems.length} Entwürfe in der Freigabeübersicht.`
          : "Noch keine KI-Vorschläge im aktuellen Datensatz sichtbar.",
      },
      {
        id: "transparency-check",
        title: "Team-Transparenz und Audit-Verlauf lesbar",
        state: hasTransparency ? "Bereit" : "Teilweise",
        color: hasTransparency ? "var(--c-success)" : "var(--c-warning)",
        meta: hasTransparency
          ? "Teamstatus, Rollenhinweise und Audit-Log stehen gemeinsam im Planner."
          : "Für den vollständigen Transparenzcheck werden mehr Team- oder Audit-Daten benötigt.",
      },
      {
        id: "flow-check",
        title: "Schneller Bedienfluss im Planner",
        state: canManageTeamPlanner ? "Bereit" : "Read-only",
        color: canManageTeamPlanner ? "var(--c-success)" : "var(--c-text-3)",
        meta: canManageTeamPlanner
          ? "Filter, Fokus, KI-Aktionen und Planung bleiben ohne Seitenwechsel erreichbar."
          : "Read-only-Modus ist aktiv; die Teamansicht bleibt transparent statt steuerbar.",
      },
    ];
  }, [aiDraftItems.length, aiSuggestionItems.length, auditTrailItems.length, canManageTeamPlanner, teamMatrixRows]);

  const weekThreeFeedback = useMemo(() => {
    const feedbackPoints = [
      selectedTeamId !== "all" ? `Teamfilter aktiv: ${teamNameById[selectedTeamId] || "Gefiltertes Team"}` : "Teamfilter kann für schnelle Reviews auf einzelne Teams gesetzt werden.",
      selectedSpecialty !== "all" ? `Fachgebiet im Fokus: ${selectedSpecialty}` : "Fachgebietsfilter reduziert die Teamansicht auf einen Bereich.",
      canManageTeamPlanner ? "CEO/Manager können Freigaben, Fokus und Planung direkt steuern." : "Member sehen den Teamkontext transparent, ohne versehentlich zentrale Steuerung auszulösen.",
    ];

    return {
      summary: "Die Woche-3-Oberfläche ist jetzt auf kurze interne Feedback-Schleifen ausgelegt: Team sehen, KI verstehen, Entscheidung treffen und direkt weiterarbeiten.",
      points: feedbackPoints,
    };
  }, [canManageTeamPlanner, selectedSpecialty, selectedTeamId, teamNameById]);

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
        title: smartTaskDefaults.title,
        priority: smartTaskDefaults.priority,
        assigned_to_id: smartTaskDefaults.assigned_to_id,
        due_date: smartTaskDefaults.due_date,
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
      setBlockForm({
        plan_id: blockForm.plan_id || smartBlockDefaults.plan_id,
        title: smartBlockDefaults.title,
        starts_at: smartBlockDefaults.starts_at,
        ends_at: smartBlockDefaults.ends_at,
      });
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

  function applySmartTaskDefaults() {
    setTaskForm({
      title: smartTaskDefaults.title,
      priority: smartTaskDefaults.priority,
      assigned_to_id: smartTaskDefaults.assigned_to_id,
      due_date: smartTaskDefaults.due_date,
    });
  }

  function applySmartBlockDefaults() {
    setEditingBlockId(null);
    setPlannedFromTask(null);
    setBlockForm({
      plan_id: smartBlockDefaults.plan_id,
      title: smartBlockDefaults.title,
      starts_at: smartBlockDefaults.starts_at,
      ends_at: smartBlockDefaults.ends_at,
    });
  }

  function handleApplyRecurringTaskTemplate(template) {
    setPlannerSection("focus");
    setTaskForm({
      title: template.task.title,
      priority: template.task.priority,
      assigned_to_id: template.task.assigned_to_id,
      due_date: template.task.due_date,
    });
  }

  function handleApplyRecurringBlockTemplate(template) {
    setPlannerSection("planning");
    setEditingBlockId(null);
    setPlannedFromTask(null);
    setBlockForm({
      plan_id: template.block.plan_id,
      title: template.block.title,
      starts_at: template.block.starts_at,
      ends_at: template.block.ends_at,
    });
  }

  function handlePrefillTask(memberId) {
    setSelectedMemberId(String(memberId));
    setTaskForm((prev) => {
      const nextAssignedId = String(memberId);
      return {
        ...prev,
        assigned_to_id: nextAssignedId,
        title: prev.title || smartTaskDefaults.title || "Neues Fokus-To-do",
        priority: prev.priority || smartTaskDefaults.priority,
        due_date: prev.due_date || smartTaskDefaults.due_date,
      };
    });
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
      title: prev.title || smartBlockDefaults.title || "Fokus-Block",
      starts_at: prev.starts_at || smartBlockDefaults.starts_at,
      ends_at: prev.ends_at || smartBlockDefaults.ends_at,
    }));
    setPlannedFromTask(null);
  }

  function handlePlanTaskAsBlock(task) {
    const planId = task.suggestedPlanId || blockForm.plan_id || smartBlockDefaults.plan_id;
    setBlockForm({
      plan_id: planId,
      title: task.title || "Fokus-Block",
      starts_at: task.suggestedStart || blockForm.starts_at || smartBlockDefaults.starts_at,
      ends_at: task.suggestedEnd || blockForm.ends_at || smartBlockDefaults.ends_at,
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

  async function persistSuggestionStatus(item, status) {
    const existing = suggestionStatusByKey[item.key];
    const payload = JSON.stringify({
      key: item.key,
      type: item.type,
      task_id: item.taskId ?? null,
      member_id: item.memberId ?? null,
    });

    if (existing) {
      const res = await fetch(`/api/suggestions/${existing.id}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, type: item.type, payload_json: payload, status }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSavedSuggestions((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      return updated;
    }

    const createRes = await fetch("/api/suggestions", {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: item.title, type: item.type, payload_json: payload }),
    });
    if (!createRes.ok) throw new Error();
    const created = await createRes.json();

    if (status === "proposed") {
      setSavedSuggestions((prev) => [created, ...prev]);
      return created;
    }

    const patchRes = await fetch(`/api/suggestions/${created.id}`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!patchRes.ok) throw new Error();
    const updated = await patchRes.json();
    setSavedSuggestions((prev) => [updated, ...prev]);
    return updated;
  }

  async function handleApplySuggestion(item) {
    setSuggestionBusyKey(item.key);
    try {
      if (item.type === "schedule_task") {
        const taskCandidate = taskBlockCandidates.find((task) => Number(task.id) === Number(item.taskId));
        if (taskCandidate) {
          handlePlanTaskAsBlock(taskCandidate);
          setPlannerSection("planning");
          setViewMode("split");
        }
      } else if (item.type === "focus_member" && item.memberId) {
        setSelectedMemberId(String(item.memberId));
        setPlannerSection("team");
        setViewMode("split");
      } else if (item.type === "deprioritize_task" && item.taskId) {
        const res = await fetch(`/api/tasks/${item.taskId}?changed_by=ai`, {
          method: "PATCH",
          headers: { ...authHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({ priority: "low" }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setTasks((prev) => prev.map((task) => (Number(task.id) === Number(item.taskId) ? updated : task)));
        setPlannerSection("overview");
      } else if (item.type === "ceo_focus") {
        setSelectedMemberId("all");
        setPlannerSection("team");
        setViewMode("split");
      }

      await persistSuggestionStatus(item, "applied");
    } catch {
      setError("KI-Vorschlag konnte nicht verarbeitet werden.");
    } finally {
      setSuggestionBusyKey(null);
    }
  }

  async function handleDraftSuggestion(item) {
    setSuggestionBusyKey(item.key);
    try {
      await persistSuggestionStatus(item, "draft");
    } catch {
      setError("KI-Entwurf konnte nicht gespeichert werden.");
    } finally {
      setSuggestionBusyKey(null);
    }
  }

  async function handleApproveSuggestion(item) {
    setSuggestionBusyKey(item.key);
    try {
      if (item.type === "schedule_task") {
        const taskCandidate = taskBlockCandidates.find((task) => Number(task.id) === Number(item.taskId));
        if (taskCandidate) {
          handlePlanTaskAsBlock(taskCandidate);
          setPlannerSection("planning");
          setViewMode("split");
        }
      } else if (item.type === "focus_member" && item.memberId) {
        setSelectedMemberId(String(item.memberId));
        setPlannerSection("team");
        setViewMode("split");
      } else if (item.type === "deprioritize_task" && item.taskId) {
        const res = await fetch(`/api/tasks/${item.taskId}?changed_by=ai_approval`, {
          method: "PATCH",
          headers: { ...authHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({ priority: "low" }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setTasks((prev) => prev.map((task) => (Number(task.id) === Number(item.taskId) ? updated : task)));
      } else if (item.type === "ceo_focus") {
        setSelectedMemberId("all");
        setPlannerSection("team");
        setViewMode("split");
      }

      await persistSuggestionStatus(item, "applied");
    } catch {
      setError("KI-Entwurf konnte nicht freigegeben werden.");
    } finally {
      setSuggestionBusyKey(null);
    }
  }

  async function handleDraftAllSuggestions() {
    const draftableItems = aiSuggestionItems.filter((item) => item.status !== "draft" && item.status !== "applied" && item.status !== "dismissed");
    if (draftableItems.length === 0) return;
    setDraftingAllSuggestions(true);
    try {
      for (const item of draftableItems) {
        await persistSuggestionStatus(item, "draft");
      }
    } catch {
      setError("KI-Vorschlaege konnten nicht gesammelt als Entwurf gespeichert werden.");
    } finally {
      setDraftingAllSuggestions(false);
    }
  }

  async function handleRunAutomationRoutine() {
    if (!selectedAutomationTemplate) return;
    setRunningAutomationRoutine(true);
    try {
      setTaskForm({
        title: selectedAutomationTemplate.task.title,
        priority: selectedAutomationTemplate.task.priority,
        assigned_to_id: selectedAutomationTemplate.task.assigned_to_id,
        due_date: selectedAutomationTemplate.task.due_date,
      });
      setBlockForm({
        plan_id: selectedAutomationTemplate.block.plan_id,
        title: selectedAutomationTemplate.block.title,
        starts_at: selectedAutomationTemplate.block.starts_at,
        ends_at: selectedAutomationTemplate.block.ends_at,
      });
      setEditingBlockId(null);
      setPlannedFromTask(null);
      setPlannerSection(automationMode === "routine" ? "planning" : "focus");
      setViewMode("split");

      if (automationMode !== "manual") {
        const draftableItems = aiSuggestionItems.filter((item) => item.status !== "draft" && item.status !== "applied" && item.status !== "dismissed");
        for (const item of draftableItems) {
          await persistSuggestionStatus(item, "draft");
        }
      }
    } catch {
      setError("Automationsroutine konnte nicht vorbereitet werden.");
    } finally {
      setRunningAutomationRoutine(false);
    }
  }

  async function handleDismissSuggestion(item) {
    setSuggestionBusyKey(item.key);
    try {
      await persistSuggestionStatus(item, "dismissed");
    } catch {
      setError("KI-Vorschlag konnte nicht gespeichert werden.");
    } finally {
      setSuggestionBusyKey(null);
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

      {showOverviewSection ? (
        <AISuggestionBoard
          items={aiSuggestionItems}
          onApply={handleApplySuggestion}
          onDraft={handleDraftSuggestion}
          onApprove={handleApproveSuggestion}
          onDismiss={handleDismissSuggestion}
          busyKey={suggestionBusyKey}
          canApprove={canApproveAiSuggestions}
        />
      ) : null}

      {showOverviewSection ? (
        <AISuggestionApprovalBoard
          items={aiDraftItems}
          onApprove={handleApproveSuggestion}
          onDismiss={handleDismissSuggestion}
          busyKey={suggestionBusyKey}
          canApprove={canApproveAiSuggestions}
        />
      ) : null}

      {showOverviewSection ? (
        <WeekThreeReviewBoard items={weekThreeReviewItems} feedback={weekThreeFeedback} />
      ) : null}

      {showOverviewSection ? <ReviewChecklistBoard items={reviewChecklistItems} /> : null}

      {(showFocusSection || showPlanningSection || showTeamSection) ? (
      <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>Team</div>
        <select className="input" value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">Alle Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>Fachgebiet</div>
        <select className="input" value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">Alle Bereiche</option>
          {specialtyOptions.map((specialty) => (
            <option key={specialty} value={specialty}>
              {specialty}
            </option>
          ))}
        </select>
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
          <DailyFlowBoard context={dailyFlowContext} actions={dailyFlowActions} />

          <PriorityPulseBoard summary={priorityPulseSummary} items={priorityPulseItems} />

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

          <AISuggestionBoard
            items={aiSuggestionItems}
            onApply={handleApplySuggestion}
            onDraft={handleDraftSuggestion}
            onApprove={handleApproveSuggestion}
            onDismiss={handleDismissSuggestion}
            busyKey={suggestionBusyKey}
            canApprove={canApproveAiSuggestions}
          />

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

      <AutomationBoard
        templates={recurringAutomationTemplates}
        onApplyTaskTemplate={handleApplyRecurringTaskTemplate}
        onApplyBlockTemplate={handleApplyRecurringBlockTemplate}
        onDraftAllSuggestions={handleDraftAllSuggestions}
        draftingAll={draftingAllSuggestions}
        pendingSuggestionCount={pendingAiDraftCount}
        automationMode={automationMode}
        onAutomationModeChange={setAutomationMode}
        selectedTemplateKey={selectedAutomationTemplate?.key || recurringAutomationTemplates[0]?.key || "weekly-report"}
        onSelectedTemplateChange={setSelectedAutomationTemplateKey}
        onRunAutomationRoutine={handleRunAutomationRoutine}
        runningRoutine={runningAutomationRoutine}
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
        <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", gap: "var(--s-3)", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Smart-Default heute · {smartTaskDefaults.label}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", fontWeight: 600 }}>
              {smartTaskDefaults.title} · {priorityFor(smartTaskDefaults.priority).label}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              {smartTaskDefaults.summary}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={applySmartTaskDefaults}>
            Smart-Defaults uebernehmen
          </button>
        </div>
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
        <div className="ceo-section" style={{ padding: "var(--s-4)", display: "flex", gap: "var(--s-3)", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Smart-Default Block · {smartBlockDefaults.label}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text)", fontWeight: 600 }}>
              {smartBlockDefaults.title} · {smartBlockDefaults.starts_at ? formatBlockDate(smartBlockDefaults.starts_at) : "zeitnah"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
              {smartBlockDefaults.summary}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={applySmartBlockDefaults}>
            Smart-Block setzen
          </button>
        </div>
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
              setBlockForm({
                plan_id: blockForm.plan_id || smartBlockDefaults.plan_id,
                title: smartBlockDefaults.title,
                starts_at: smartBlockDefaults.starts_at,
                ends_at: smartBlockDefaults.ends_at,
              });
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
      <TeamVisibilityBoard
        selectedMember={selectedMember}
        canManageTeam={canManageTeamPlanner}
        viewerRole={auditViewerRole}
        teamCount={teams.length}
        memberCount={members.length}
      />

      <TeamTransparencySummary rows={teamMatrixRows} />

      {!canManageTeamPlanner ? (
        <div className="ceo-section" style={{ padding: "var(--s-4)", display: "grid", gap: "var(--s-2)" }}>
          <div style={{ fontWeight: 700, color: "var(--c-text)" }}>Read-only Team-Sicht aktiv</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", lineHeight: 1.6 }}>
            Du siehst Teampläne und Verlauf transparent, kannst aber nur deinen eigenen Fokus direkt bearbeiten. Steueraktionen für andere Personen bleiben CEO und Managern vorbehalten.
          </div>
        </div>
      ) : null}

      <TeamMatrix
        rows={teamMatrixRows}
        selectedMemberId={selectedMemberId}
        onFocusMember={handleFocusMember}
        onPrefillTask={handlePrefillTask}
        onPrefillBlock={handlePrefillBlock}
        canManageTeam={canManageTeamPlanner}
        currentUserId={user?.id}
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

      <AuditTrailBoard items={auditTrailItems} viewerRole={auditViewerRole} />

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
