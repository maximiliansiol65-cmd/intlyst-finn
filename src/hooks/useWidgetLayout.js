import { useState, useEffect } from "react";

export const DASHBOARD_WIDGETS = [
  { id: "kpis",           label: "KPI-Karten",     desc: "Umsatz, Traffic, Kunden, Conversion",  icon: "📊" },
  { id: "chart",          label: "Umsatz-Chart",   desc: "Verlauf der letzten 7 / 30 / 90 Tage", icon: "📈" },
  { id: "recommendation", label: "Top Empfehlung", desc: "Tages-Empfehlung der KI",              icon: "💡" },
  { id: "goals",          label: "Aktuelle Ziele", desc: "Fortschritt deiner Ziele",             icon: "🎯" },
  { id: "tasks",          label: "Offene Tasks",   desc: "Nächste Aufgaben auf einen Blick",     icon: "✅" },
  { id: "alerts",         label: "Alerts",         desc: "Aktuelle Warnungen und Hinweise",      icon: "🔔" },
];

const STORAGE_KEY = "intlyst-dashboard-layout";

function defaultLayout() {
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

function loadLayout() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultLayout();
    const parsed = JSON.parse(saved);
    const ids = parsed.map((w) => w.id);
    const missing = DASHBOARD_WIDGETS
      .filter((w) => !ids.includes(w.id))
      .map((w) => ({ id: w.id, visible: true }));
    return [...parsed, ...missing];
  } catch {
    return defaultLayout();
  }
}

export function useWidgetLayout() {
  const [layout, setLayout] = useState(loadLayout);

  // Re-read when the editor saves a new layout
  useEffect(() => {
    function onLayoutChanged() {
      setLayout(loadLayout());
    }
    window.addEventListener("intlyst-layout-changed", onLayoutChanged);
    return () => window.removeEventListener("intlyst-layout-changed", onLayoutChanged);
  }, []);

  /** Returns true if a widget with the given id is visible */
  function isVisible(id) {
    const item = layout.find((w) => w.id === id);
    return item ? item.visible : true;
  }

  /** Returns ids in user-defined order, filtered to visible ones */
  function visibleIds() {
    return layout.filter((w) => w.visible).map((w) => w.id);
  }

  return { layout, isVisible, visibleIds };
}
