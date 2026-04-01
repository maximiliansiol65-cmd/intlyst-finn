/* eslint-disable */
import { useEffect, useState } from "react";
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

export default function Planner() {
  const { authHeader } = useAuth();
  const [plan, setPlan] = useState(FALLBACK_PLAN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/planning/auto", { headers: authHeader() })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!alive) return;
        setPlan(data);
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setError("Planung konnte nicht geladen werden. Fallback aktiv.");
        setPlan(FALLBACK_PLAN);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [authHeader]);

  return (
    <div className="page-enter page-content" style={{ display: "grid", gap: "var(--s-5)" }}>
      <div className="card" style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-2)" }}>
        <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-text-3)", fontWeight: 600 }}>
          Planer-Zentrum
        </div>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--c-text)" }}>
          Alles für heute, diese Woche und den nächsten Monat
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", maxWidth: 520 }}>
          Dein zentraler Ort für Strategie, Tagesfokus und Zeiteinteilung. Die KI zieht KPI-Daten und setzt Prioritäten.
        </div>
        {error && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-warning)" }}>{error}</div>
        )}
      </div>

      <div style={{ display: "grid", gap: "var(--s-5)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <DailyTodos items={plan.daily || []} loading={loading} />
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
          <button className="btn btn-primary btn-sm">Zeitblöcke bearbeiten</button>
        </div>
      </div>

      <PlanBoard plan={plan} loading={loading} />
    </div>
  );
}
