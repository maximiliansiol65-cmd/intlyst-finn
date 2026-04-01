/* eslint-disable */
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { usePlan } from "../../contexts/PlanContext";

const IcoHome    = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10L12 3l9 7v11a1 1 0 01-1 1H4a1 1 0 01-1-1V10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 21v-7h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>);
const IcoChart   = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 18l5-5 4 4 9-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IcoRocket  = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 2S19 4 19 11c0 3-2 5-4 6.5L12 20l-3-2.5C7 16 5 14 5 11 5 4 10 2 10 2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoCheck   = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13l5 5L20 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IcoGrid    = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoBell    = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoPeople  = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.5"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoGlobe   = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M2 12h20M12 2c-3 3-4 7-4 10s1 7 4 10M12 2c3 3 4 7 4 10s-1 7-4 10" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoGear    = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5"/></svg>);
const IcoCommand = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);
const IcoPlanner = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 3v4M17 3v4M3 9h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);

// Alle verfügbaren Tabs (auch für Settings-Editor exportiert)
export const ALL_TABS = [
  { id: "dashboard", to: "/",         label: "Entscheid.", Icon: IcoHome,    end: true },
  { id: "command",   to: "/command",  label: "Priorit.",   Icon: IcoCommand           },
  { id: "analyse",   to: "/analyse",  label: "Analyse",   Icon: IcoChart             },
  { id: "tasks",     to: "/tasks",    label: "Aufgaben",  Icon: IcoCheck             },
  { id: "alerts",    to: "/alerts",   label: "Signale",   Icon: IcoBell              },
  { id: "wachstum",  to: "/wachstum", label: "Wachstum",  Icon: IcoRocket            },
  { id: "empfehlungen", to: "/ceo",   label: "Beratung",  Icon: IcoRocket            },
  { id: "kunden",    to: "/kunden",   label: "Kunden",    Icon: IcoPeople            },
  { id: "market",    to: "/market",   label: "Markt",     Icon: IcoGlobe             },
  { id: "planner",   to: "/planner",  label: "Planer",    Icon: IcoPlanner           },
  { id: "settings",  to: "/settings", label: "Settings",  Icon: IcoGear              },
  { id: "review",    to: "/review-audit", label: "Review",    Icon: IcoCheck            },
  { id: "szenarien", to: "/szenarien", label: "Szenarien", Icon: IcoChart             },
  { id: "mehr",      to: "/mehr",     label: "System",    Icon: IcoGrid              },
];

// Standard-Tabs je Abo — 5 Hauptbereiche für jeden Plan
export const PLAN_DEFAULTS = {
  trial:         ["dashboard", "command", "tasks", "mehr"],
  standard:      ["dashboard", "analyse", "command", "tasks", "mehr"],
  team_standard: ["dashboard", "analyse", "command", "tasks", "mehr"],
  team_pro:      ["dashboard", "analyse", "command", "tasks", "mehr"],
};

export const MAX_TABS    = 5;
export const STORAGE_KEY = (plan) => `intlyst-quick-actions-${plan}`;

export function getTabsForPlan(plan) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(plan));
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length > 0) return ids.slice(0, MAX_TABS);
    }
  } catch {}
  return PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS.trial;
}

export function saveTabsForPlan(plan, ids) {
  localStorage.setItem(STORAGE_KEY(plan), JSON.stringify(ids.slice(0, MAX_TABS)));
  window.dispatchEvent(new Event("intlyst-quick-actions-changed"));
}

export default function BottomTabBar() {
  const { plan } = usePlan();
  const [ids, setIds] = useState(() => getTabsForPlan(plan));
  const [coreMode, setCoreMode] = useState(() => localStorage.getItem("intlyst_core_mode") === "1");

  // Plan wechselt → sofort neue Tabs laden
  useEffect(() => {
    setIds(getTabsForPlan(plan));
  }, [plan]);

  // Manuelle Anpassung aus Settings
  useEffect(() => {
    function onChanged() { setIds(getTabsForPlan(plan)); }
    window.addEventListener("intlyst-quick-actions-changed", onChanged);
    return () => window.removeEventListener("intlyst-quick-actions-changed", onChanged);
  }, [plan]);

  useEffect(() => {
    function onCoreMode() {
      setCoreMode(localStorage.getItem("intlyst_core_mode") === "1");
    }
    window.addEventListener("intlyst-core-mode-changed", onCoreMode);
    return () => window.removeEventListener("intlyst-core-mode-changed", onCoreMode);
  }, []);

  const coreIds = ["dashboard", "analyse", "command", "tasks", "mehr"];

  const visibleTabs = (coreMode ? coreIds : ids)
    .map(id => ALL_TABS.find(t => t.id === id))
    .filter(Boolean);

  return (
    <nav className="bottom-tabbar" role="navigation" aria-label="Navigation">
      {visibleTabs.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `bottom-tab${isActive ? " active" : ""}`}
          aria-label={label}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
