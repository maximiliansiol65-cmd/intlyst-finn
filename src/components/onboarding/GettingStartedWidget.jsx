/* eslint-disable */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const STEPS = [
  {
    id: "goal",
    icon: "🎯",
    title: "Wachstumsziel setzen",
    desc: "Definiere dein Ziel — KI passt alle Analysen an",
    cta: "Ziel setzen",
    to: "/settings?tab=strategie",
  },
  {
    id: "integration",
    icon: "🔗",
    title: "Erste Integration verbinden",
    desc: "Verbinde Stripe, GA4 oder Shopify",
    cta: "Integration hinzufügen",
    to: "/integrations",
  },
  {
    id: "task",
    icon: "✓",
    title: "Ersten Task erstellen",
    desc: "Organisiere deine Aufgaben im Kanban Board",
    cta: "Task erstellen",
    to: "/aufgaben",
  },
  {
    id: "ai",
    icon: "✦",
    title: "KI fragen stellen",
    desc: "Frag den Assistenten nach deinen Daten",
    cta: "KI öffnen",
    action: "open_chat",
  },
  {
    id: "prognose",
    icon: "📊",
    title: "Prognose ansehen",
    desc: "Lass die KI deine nächsten 30 Tage vorhersagen",
    cta: "Prognose ansehen",
    to: "/analyse",
  },
];

const STORE_KEY = "intlyst_getting_started";

function getCompleted() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); }
  catch { return new Set(); }
}

function setCompleted(ids) {
  localStorage.setItem(STORE_KEY, JSON.stringify([...ids]));
}

export default function GettingStartedWidget({ onOpenChat }) {
  const navigate = useNavigate();
  const { authHeader } = useAuth();
  const [done, setDone] = useState(getCompleted);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("intlyst_gs_dismissed") === "1"
  );
  const [celebrating, setCelebrating] = useState(false);

  // Auto-detect completed steps from server
  useEffect(() => {
    async function detect() {
      try {
        const [profileRes, tasksRes, intRes] = await Promise.allSettled([
          fetch("/api/growth/profile", { headers: authHeader() }),
          fetch("/api/tasks?limit=1",  { headers: authHeader() }),
          fetch("/api/integrations",   { headers: authHeader() }),
        ]);

        const updates = new Set(done);

        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const p = await profileRes.value.json();
          if (p?.goal_type) updates.add("goal");
        }
        if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
          const t = await tasksRes.value.json();
          const list = Array.isArray(t) ? t : (t?.tasks ?? []);
          if (list.length > 0) updates.add("task");
        }
        if (intRes.status === "fulfilled" && intRes.value.ok) {
          const i = await intRes.value.json();
          const list = Array.isArray(i) ? i : [];
          if (list.some(x => x.is_connected)) updates.add("integration");
        }

        setDone(updates);
        setCompleted(updates);
      } catch { }
    }
    detect();
  }, []); // eslint-disable-line

  function markDone(id) {
    setDone(prev => {
      const next = new Set([...prev, id]);
      setCompleted(next);
      if (next.size === STEPS.length) {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 4000);
      }
      return next;
    });
  }

  function handleStep(step) {
    markDone(step.id);
    if (step.action === "open_chat") {
      onOpenChat?.();
    } else if (step.to) {
      navigate(step.to);
    }
  }

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("intlyst_gs_dismissed", "1");
  }

  const progress = Math.round((done.size / STEPS.length) * 100);

  if (dismissed && progress < 100) return null;

  if (celebrating || progress === 100) {
    return (
      <div className="gs-widget gs-complete" style={{ animation: "slideUp var(--dur-slow) var(--ease-spring) both" }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <div style={{ fontWeight: 600, fontSize: "var(--text-lg)" }}>Einrichtung abgeschlossen!</div>
        <div style={{ color: "var(--c-text-2)", fontSize: "var(--text-sm)" }}>
          Intlyst ist jetzt vollständig für dich konfiguriert.
        </div>
        <button className="btn btn-secondary btn-sm" onClick={dismiss} style={{ marginTop: 4 }}>
          Schließen
        </button>
      </div>
    );
  }

  return (
    <div className="gs-widget">
      <div className="gs-header">
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>
            Erste Schritte
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: 2 }}>
            {done.size} von {STEPS.length} erledigt
          </div>
        </div>
        <button className="topnav-icon-btn" onClick={dismiss} title="Schließen" aria-label="Widget schließen">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ margin: "var(--s-2) 0 var(--s-4)" }}>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progress}%`, background: "var(--c-success)" }}
          />
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: var_or("var(--s-2)", 8) }}>
        {STEPS.map(step => {
          const isDone = done.has(step.id);
          return (
            <div
              key={step.id}
              className={`gs-step${isDone ? " done" : ""}`}
            >
              <div className={`gs-check${isDone ? " done" : ""}`}>
                {isDone ? (
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <span style={{ fontSize: 14 }}>{step.icon}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 500,
                  fontSize: "var(--text-sm)",
                  color: isDone ? "var(--c-text-3)" : "var(--c-text)",
                  textDecoration: isDone ? "line-through" : "none",
                }}>
                  {step.title}
                </div>
                {!isDone && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 1 }}>
                    {step.desc}
                  </div>
                )}
              </div>
              {!isDone && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flexShrink: 0, fontSize: 11 }}
                  onClick={() => handleStep(step)}
                >
                  {step.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function var_or(val, fallback) { return val; }
