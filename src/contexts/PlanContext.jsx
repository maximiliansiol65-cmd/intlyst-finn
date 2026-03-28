import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

// ── Feature-Matrix pro Plan ───────────────────────────────────────────────────
export const PLAN_FEATURES = {
  trial: {
    routes:   ["/", "/tasks", "/settings", "/mehr"],
    features: ["dashboard", "tasks"],
  },
  standard: {
    routes:   ["/", "/tasks", "/alerts", "/reports", "/mehr", "/settings"],
    features: ["dashboard", "tasks", "alerts", "goals", "reports", "kpis", "chart"],
  },
  team_standard: {
    routes:   ["/", "/tasks", "/alerts", "/reports", "/mehr", "/settings",
               "/analyse", "/wachstum", "/kunden", "/standort", "/market"],
    features: ["dashboard", "tasks", "alerts", "goals", "reports", "kpis", "chart",
               "analyse", "wachstum", "kunden", "standort", "market", "team"],
  },
  team_pro: {
    routes:   "all",
    features: "all",
  },
};

export const PLAN_LABELS = {
  trial:         { label: "Trial",         color: "#888" },
  standard:      { label: "Standard",      color: "#000" },
  team_standard: { label: "Team Standard", color: "#0071E3" },
  team_pro:      { label: "Team Pro",      color: "#AF52DE" },
};

const PlanContext = createContext();

export function PlanProvider({ children }) {
  const { authHeader, user } = useAuth();
  const [plan, setPlan]       = useState("trial");
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const res = await fetch("/api/workspaces/current", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlan(data?.subscription?.plan ?? data?.plan ?? "trial");
    } catch {
      setPlan("trial");
    } finally {
      setLoading(false);
    }
  }, [authHeader, user]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // Listen for plan changes triggered by settings
  useEffect(() => {
    window.addEventListener("intlyst-plan-changed", fetchPlan);
    return () => window.removeEventListener("intlyst-plan-changed", fetchPlan);
  }, [fetchPlan]);

  function canAccess(route) {
    const matrix = PLAN_FEATURES[plan] ?? PLAN_FEATURES.trial;
    if (matrix.routes === "all") return true;
    return matrix.routes.includes(route);
  }

  function hasFeature(feature) {
    const matrix = PLAN_FEATURES[plan] ?? PLAN_FEATURES.trial;
    if (matrix.features === "all") return true;
    return matrix.features.includes(feature);
  }

  return (
    <PlanContext.Provider value={{ plan, loading, canAccess, hasFeature, refetch: fetchPlan }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
