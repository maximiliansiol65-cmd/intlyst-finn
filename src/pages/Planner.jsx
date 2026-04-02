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
    <div className="card" style={{ padding: "var(--s-4)", display: "grid", gap: "var(--s-2)" }}>
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
                gridTemplateColumns: "minmax(180px, 1.2fr) repeat(8, minmax(84px, 1fr))",
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

function DashboardColumn({ title, subtitle, items, emptyText, accent, onDragStart, onDrop, onDragOver }) {
  return (
    <div
      className="card"
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

export default function Planner() {
  const { authHeader, user } = useAuth();
  const [plan, setPlan] = useState(FALLBACK_PLAN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState("all");
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [deletingBlockId, setDeletingBlockId] = useState(null);
  const [draggingDashboardItemId, setDraggingDashboardItemId] = useState(null);
  const [taskForm, setTaskForm] = useState({ title: "", priority: "medium", assigned_to_id: "", due_date: "" });
  const [blockForm, setBlockForm] = useState({ plan_id: "", title: "", starts_at: "", ends_at: "" });
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
        const hours = parseWeeklyHours(workSchedules.find((item) => item.user_id === member.id)?.weekly_hours_json);
        const weekBlockCount = memberBlocks.filter((block) => block.starts_at && weekKeys.has(String(block.starts_at).slice(0, 10))).length;
        const loadScore = overdueTasks * 2 + dueToday + weekBlockCount;
        const loadLabel = loadScore >= 6 ? "Hoch" : loadScore >= 3 ? "Mittel" : "Stabil";
        const loadColor = loadScore >= 6 ? "var(--c-danger)" : loadScore >= 3 ? "var(--c-warning)" : "var(--c-success)";
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
        };
      })
      .filter((row) => (selectedMember ? Number(row.id) === Number(selectedMember.id) : true))
      .sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name));
  }, [members, membershipByUserId, plan.daily, plans, selectedMember, tasks, teamNameById, timeBlocks, user?.id, workSchedules]);

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
        .filter((row) => row.overdueTasks > 0 || row.loadLabel === "Hoch" || row.dueToday >= 3)
        .slice(0, 5)
        .map((row) => ({
          id: `alert-${row.id}`,
          title: `${row.name} braucht Aufmerksamkeit`,
          meta: `${row.overdueTasks} überfällig · ${row.dueToday} heute fällig · Belastung ${row.loadLabel.toLowerCase()}`,
          color: row.overdueTasks > 0 || row.loadLabel === "Hoch" ? "var(--c-danger)" : "var(--c-warning)",
        })),
    [teamMatrixRows],
  );

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
    setDashboardColumns(initialDashboardColumns);
  }, [initialDashboardColumns]);

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
      setEditingBlockId(null);
    } catch {
      setError("Zeitblock konnte im Planner nicht angelegt werden.");
    } finally {
      setCreatingBlock(false);
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
  }

  function handleEditBlock(block) {
    setEditingBlockId(block.id);
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

  return (
    <div className="page-enter page-content" style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-2)" }}>
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

      <AlertStrip items={overloadAlerts} />

      <div className="card" style={{ padding: "var(--s-4)", display: "flex", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
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

      <SlotLaneBoard lanes={todaySlotLanes} />

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

      <PlanListCard title="Teampläne" subtitle="Alle bereits vorhandenen Team- und Mitarbeiterpläne im aktuellen Workspace." items={teamPlans} emptyText="Noch keine Teampläne vorhanden." />

      <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "minmax(320px, 1.05fr) minmax(320px, 0.95fr)" }}>
        <WeekBoard
          title="Meine Woche"
          subtitle="Eigene Zeitblöcke und Fokusfenster für die nächsten Arbeitstage."
          buckets={myWeekBuckets}
          emptyText="Kein Block geplant."
        />
        <WeekBoard
          title="Team-Woche"
          subtitle={selectedMember ? `Zeitblöcke für ${selectedMember.name || selectedMember.email}.` : "Zeitblöcke des Teams nach Tag gebündelt."}
          buckets={teamWeekBuckets}
          emptyText="Noch nichts eingeplant."
        />
      </div>

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
          <button className="btn btn-primary btn-sm" type="submit" disabled={creatingBlock || !blockForm.plan_id || !blockForm.title.trim() || !blockForm.starts_at || !blockForm.ends_at}>
            {creatingBlock ? "Speichert..." : editingBlockId ? "Zeitblock aktualisieren" : "Zeitblock anlegen"}
          </button>
        </form>
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
                <div key={block.id} style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-2)", display: "flex", justifyContent: "space-between", gap: "var(--s-3)", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{block.title || "Zeitblock"}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                      {block.owner ? `${block.owner} · ` : ""}{formatBlockDate(block.starts_at)}{block.ends_at ? ` bis ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(block.ends_at))}` : ""}
                    </div>
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

      <PlanBoard plan={plan} loading={loading} />
    </div>
  );
}
