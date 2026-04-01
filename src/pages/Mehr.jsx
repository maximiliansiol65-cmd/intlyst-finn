/* eslint-disable */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";
import { useToast } from "../contexts/ToastContext";
import { SkeletonCard, SkeletonLine, Sheet } from "../components/ui";
import CurrentGoalsPanel from "../components/goals/CurrentGoalsPanel";

// â”€â”€ Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const IcoPeople = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87"/></svg>);
const IcoPin   = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>);
const IcoGlobe = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c-3 3-4 7-4 10s1 7 4 10M12 2c3 3 4 7 4 10s-1 7-4 10"/></svg>);
const IcoFlask = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M9 3v7L4 20h16L15 10V3"/></svg>);
const IcoBell  = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>);
const IcoGear  = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>);
const IcoTarget   = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>);
const IcoChart    = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18l5-5 4 4 9-10"/></svg>);
const IcoTask     = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l5 5L20 6"/></svg>);
const IcoStar     = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>);
const IcoAI       = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H4a7 7 0 017-7h1V5.73A2 2 0 0110 4a2 2 0 012-2zM4 14v2a8 8 0 0016 0v-2"/></svg>);
const IcoPlug     = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M6 8H5a4 4 0 000 8h1"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="10" y1="5" x2="10" y2="8"/><line x1="14" y1="5" x2="14" y2="8"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="14" y1="16" x2="14" y2="19"/></svg>);
const IcoShieldAI = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 3v6c0 5-3.5 9.5-7 11-3.5-1.5-7-6-7-11V5l7-3z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>);
const IcoClipboard = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>);
const IcoSocial    = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 3.5M15.4 7l-6.8 3.5"/></svg>);
const IcoPlanner   = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/></svg>);
const IcoChevronDown = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

// â”€â”€ Task helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function taskPriorityColor(p) {
  if (!p) return "var(--c-text-4)";
  const s = p.toLowerCase();
  if (s === "high" || s === "hoch") return "var(--c-danger)";
  if (s === "medium" || s === "mittel") return "var(--c-warning)";
  return "var(--c-success)";
}
function taskStatusBadge(s) {
  if (!s) return "badge badge-neutral badge-sm";
  const v = s.toLowerCase();
  if (v === "done" || v === "completed") return "badge badge-success badge-sm";
  if (v === "in_progress" || v === "in-progress") return "badge badge-info badge-sm";
  if (v === "overdue") return "badge badge-danger badge-sm";
  return "badge badge-neutral badge-sm";
}
function taskStatusLabel(s) {
  if (!s) return "Offen";
  const map = { todo: "Offen", open: "Offen", in_progress: "LÃ¤uft", "in-progress": "LÃ¤uft", done: "Erledigt", completed: "Erledigt", overdue: "ÃœberfÃ¤llig" };
  return map[s.toLowerCase()] ?? s;
}

// â”€â”€ Goal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function goalProgressClass(s) {
  if (!s) return "progress-fill";
  const v = s.toLowerCase();
  if (v === "on_track" || v === "on-track" || v === "ahead") return "progress-fill progress-success";
  if (v === "behind" || v === "at_risk") return "progress-fill progress-warning";
  if (v === "critical" || v === "missed") return "progress-fill progress-danger";
  return "progress-fill";
}
function goalBadgeClass(s) {
  if (!s) return "badge badge-neutral";
  const v = s.toLowerCase();
  if (v === "on_track" || v === "on-track" || v === "ahead") return "badge badge-success";
  if (v === "behind" || v === "at_risk") return "badge badge-warning";
  if (v === "critical" || v === "missed") return "badge badge-danger";
  return "badge badge-neutral";
}
function goalStatusLabel(s) {
  if (!s) return "Unbekannt";
  const map = { on_track: "Im Plan", "on-track": "Im Plan", ahead: "Voraus", behind: "Verzug", at_risk: "GefÃ¤hrdet", critical: "Kritisch", missed: "Verfehlt" };
  return map[s.toLowerCase()] ?? s;
}

// â”€â”€ GoalRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function GoalRow({ goal }) {
  const pct = goal.progress_pct ?? (goal.target_value > 0 ? Math.min((goal.current_value / goal.target_value) * 100, 100) : 0);
  const pctDisplay = Math.round(pct);
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", padding: "var(--s-4) var(--s-5)" }}>
      <div style={{ minWidth: 110, flex: "0 0 auto" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{goal.metric_label ?? goal.metric ?? "Ziel"}</div>
        {goal.period && <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{goal.period === "monthly" ? "Monatlich" : "WÃ¶chentlich"}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 60 }}>
        <div className="progress-track"><div className={goalProgressClass(goal.status)} style={{ width: `${pctDisplay}%` }} /></div>
      </div>
      <div style={{ minWidth: 80, textAlign: "right", fontSize: "var(--text-sm)", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: "var(--c-text)" }}>{pctDisplay}%</span>
        {goal.current_value != null && <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(goal.current_value)} / {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(goal.target_value)}</span>}
      </div>
      <div style={{ flexShrink: 0 }}><span className={goalBadgeClass(goal.status)}>{goalStatusLabel(goal.status)}</span></div>
    </div>
  );
}

// â”€â”€ AddGoalSheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const METRICS_OPTIONS = [
  { value: "revenue", label: "Umsatz (â‚¬)" }, { value: "traffic", label: "Traffic" },
  { value: "conversions", label: "Conversions" }, { value: "conversion_rate", label: "Conversion Rate (%)" },
  { value: "new_customers", label: "Neue Kunden" },
];
function AddGoalSheet({ isOpen, onClose, onSaved, authHeader }) {
  const [metric, setMetric] = useState("revenue");
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  async function handleSave() {
    const val = parseFloat(target);
    if (!val || isNaN(val)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ metric, target_value: val, period }) });
      if (!res.ok) throw new Error();
      toast.success("Ziel gespeichert!");
      setTarget(""); setMetric("revenue"); setPeriod("monthly"); onSaved();
    } catch { toast.error("Ziel konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
  }
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Neues Ziel setzen">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <div><label className="form-label">Metrik</label><select className="select" value={metric} onChange={e => setMetric(e.target.value)}>{METRICS_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
        <div><label className="form-label">Zielwert</label><input className="input" type="number" value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} placeholder="z.B. 5000" /></div>
        <div><label className="form-label">Zeitraum</label><div className="tabs-pill">{[{ value: "monthly", label: "Monat" }, { value: "weekly", label: "Woche" }].map(p => <button key={p.value} className={`tab-pill${period === p.value ? " active" : ""}`} onClick={() => setPeriod(p.value)}>{p.label}</button>)}</div></div>
        <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !target}>{saving ? "Speichernâ€¦" : "Ziel speichern"}</button>
      </div>
    </Sheet>
  );
}

// â”€â”€ Expandable Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ExpandableRow({ icon: Icon, label, sub, children, idx }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: "var(--s-4)", padding: "var(--s-4) var(--s-5)",
          background: open ? "var(--c-surface-2)" : "none",
          border: "none", borderTop: idx > 0 ? "1px solid var(--c-border)" : "none",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--c-surface-2)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "none"; }}
      >
        <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "#f0f0f0", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", flexShrink: 0 }}>
          <Icon />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{label}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{sub}</div>
        </div>
        <span style={{ color: "var(--c-text-3)" }}><IcoChevronDown open={open} /></span>
      </button>
      {open && (
        <div style={{ padding: "var(--s-4) var(--s-5) var(--s-5)", borderTop: "1px solid var(--c-border)", background: "var(--c-surface-2)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Nav Row (navigates to page) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NavRow({ icon: Icon, label, sub, to, idx }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        gap: "var(--s-4)", padding: "var(--s-4) var(--s-5)",
        background: "none", border: "none",
        borderTop: idx > 0 ? "1px solid var(--c-border)" : "none",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--c-surface-2)"}
      onMouseLeave={e => e.currentTarget.style.background = "none"}
    >
      <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "#f0f0f0", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", flexShrink: 0 }}>
        <Icon />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{label}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ color: "var(--c-text-3)" }}><IcoChevronDown open={false} style={{ transform: "rotate(0deg)" }} /></span>
    </button>
  );
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Mehr() {
  const navigate = useNavigate();
  const { authHeader } = useAuth();
  const { profile } = useCompanyProfile();
  const toast = useToast();
  const [coreMode, setCoreMode] = useState(() => localStorage.getItem("intlyst_core_mode") === "1");

  const [goals, setGoals]                               = useState([]);
  const [goalsLoading, setGoalsLoading]                 = useState(true);
  const [goalsError, setGoalsError]                     = useState(null);
  const [goalSheetOpen, setGoalSheetOpen]               = useState(false);
  const [tasks, setTasks]                               = useState([]);
  const [tasksLoading, setTasksLoading]                 = useState(true);
  const [alerts, setAlerts]                             = useState([]);
  const [alertsLoading, setAlertsLoading]               = useState(true);
  const [analysis, setAnalysis]                         = useState(null);
  const [analysisLoading, setAnalysisLoading]           = useState(true);
  const [briefing, setBriefing]                         = useState(null);

  const fetchGoals = useCallback(async () => {
    setGoalsLoading(true); setGoalsError(null);
    try {
      const res = await fetch("/api/goals", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGoals(Array.isArray(data) ? data : data.goals ?? data.items ?? []);
    } catch { setGoalsError("Ziele konnten nicht geladen werden."); }
    finally { setGoalsLoading(false); }
  }, [authHeader]);

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch("/api/tasks?limit=3&status=open", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : data.tasks ?? data.items ?? []);
    } catch { setTasks([]); } finally { setTasksLoading(false); }
  }, [authHeader]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/alerts?limit=1", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : data.alerts ?? data.items ?? []);
    } catch { setAlerts([]); } finally { setAlertsLoading(false); }
  }, [authHeader]);

  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/analysis/summary", { headers: authHeader() });
      if (!res.ok) throw new Error();
      setAnalysis(await res.json());
    } catch { setAnalysis(null); } finally { setAnalysisLoading(false); }
  }, [authHeader]);

  const fetchBriefing = useCallback(async () => {
    try {
      const res = await fetch("/api/decision/briefing", { headers: authHeader() });
      if (!res.ok) throw new Error();
      setBriefing(await res.json());
    } catch { setBriefing(null); }
  }, [authHeader]);

  useEffect(() => { fetchGoals(); fetchTasks(); fetchAlerts(); fetchAnalysis(); fetchBriefing(); }, []);

  useEffect(() => {
    function onCoreMode() {
      setCoreMode(localStorage.getItem("intlyst_core_mode") === "1");
    }
    window.addEventListener("intlyst-core-mode-changed", onCoreMode);
    return () => window.removeEventListener("intlyst-core-mode-changed", onCoreMode);
  }, []);

  const latestAlert = alerts[0] ?? null;
  const topRecommendation = analysis?.top_recommendation ?? analysis?.recommendations?.[0]?.text ?? analysis?.summary ?? null;

  return (
    <div style={{ padding: "var(--s-6)", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: "var(--s-6)" }}>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", margin: 0 }}>System</h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", margin: "6px 0 0" }}>
            Datenbasis, Planung, Ziele und Einstellungen auf einen Blick.
          </p>
        </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        {coreMode && (
          <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>
              Kernmodus aktiv
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>
              Fokus auf Entscheidungen, Analyse und Priorisierung. Weitere Management-Bereiche sind ausgeblendet.
            </div>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>Entscheidungen</button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate("/analyse")}>Analyse</button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate("/command")}>Priorisierung</button>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                localStorage.setItem("intlyst_core_mode", "0");
                window.dispatchEvent(new Event("intlyst-core-mode-changed"));
                setCoreMode(false);
              }}
            >
              Weitere Funktionen freischalten
            </button>
          </div>
        )}

        {!coreMode && (
        <>
        {/* â”€â”€ Analyse â”€â”€ */}
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>Analyse & Priorisierung</div>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            {[
              { to: "/integrations", label: "Datenbasis",      sub: "Shopify, Stripe, GA4 und weitere Quellen verbinden", Icon: IcoPlug },
              { to: "/planner",      label: "Planung",         sub: "Strategie, Tagesfokus und Zeitblöcke abstimmen",     Icon: IcoPlanner },
              { to: "/kunden",       label: "Kunden",          sub: "Kundendaten und Segmente für bessere Entscheidungen", Icon: IcoPeople },
              { to: "/standort",     label: "Standorte",       sub: "Geografische Auswertung und regionale Muster",        Icon: IcoPin },
              { to: "/market",       label: "Markt",           sub: "Marktdaten, Trends und Wettbewerbslage",              Icon: IcoGlobe },
              { to: "/team",         label: "Teamstruktur",    sub: "Mitglieder, Rollen und operative Kapazität",          Icon: IcoPeople },
            ].map(({ to, label, sub, Icon }, idx) => (
              <NavRow key={to} to={to} icon={Icon} label={label} sub={sub} idx={idx} />
            ))}
          </div>
        </div>
        {/* â”€â”€ Beratung, Review und weitere Bereiche â”€â”€ */}
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>Beratung, Aufgaben, Review & Entscheidungen</div>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>

            {/* Alerts â€” navigiert */}
            <NavRow to="/alerts" icon={IcoBell} label="Signale" sub="Warnungen, Hinweise und Veränderungen" idx={0} />

            {/* Social Media â€” navigiert */}
            <NavRow to="/social" icon={IcoSocial} label="Social Performance" sub="Kanäle, Inhalte und Reichweitenwirkung" idx={1} />

            {/* Offene Tasks */}
            <ExpandableRow idx={2} icon={IcoTask} label="Offene Aufgaben" sub="Aktuelle Umsetzung im Überblick">
              {tasksLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                  {[0,1,2].map(i => <div key={i} className="flex items-center gap-3"><div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} /><SkeletonLine width="70%" height={12} /></div>)}
                </div>
              ) : tasks.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Keine offenen Tasks ðŸŽ‰</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {tasks.map((task, idx) => (
                    <div key={task.id ?? idx}>
                      {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
                      <div className="flex items-center gap-3" style={{ padding: "8px 0" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: taskPriorityColor(task.priority), flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title ?? task.name ?? "Task"}</span>
                        <span className={taskStatusBadge(task.status)}>{taskStatusLabel(task.status)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="divider" style={{ margin: "var(--s-3) 0 0" }} />
                  <Link to="/tasks" className="btn btn-ghost btn-sm" style={{ justifyContent: "center", color: "var(--c-text-2)" }}>Alle Tasks â†’</Link>
                </div>
              )}
            </ExpandableRow>

            {/* Aktuelle Ziele */}
            <ExpandableRow idx={3} icon={IcoTarget} label="Aktuelle Ziele" sub="Fortschritt und Zielsteuerung">
              <CurrentGoalsPanel
                goals={goals}
                profile={profile}
                loading={goalsLoading}
                error={goalsError}
                onRetry={fetchGoals}
                onAddGoal={() => setGoalSheetOpen(true)}
                emptyText="Noch keine aktuellen Ziele für diese Rolle vorhanden."
              />
            </ExpandableRow>

            {/* Szenarien */}
            <NavRow to="/szenarien" icon={IcoChart} label="Szenarien & Vergleich" sub="Strategische Szenarien, Prognosen und Frühwarnung" idx={4} />

            <NavRow to="/review-audit" icon={IcoClipboard} label="Review & Fortschritt" sub="Reviews, Artefakte, Verlauf und Ergebnislage" idx={5} />
            <NavRow to="/settings" icon={IcoGear} label="Einstellungen" sub="Konto, Abo & Benachrichtigungen" idx={6} />

          </div>
        </div>
        </>
        )}
      </div>

      <AddGoalSheet
        isOpen={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        authHeader={authHeader}
        onSaved={() => { setGoalSheetOpen(false); fetchGoals(); }}
      />
    </div>
  );
}
