/* eslint-disable */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const TOUR_KEY = "intlyst_tour_done";

const STEPS_FULL = [
  {
    route: "/",
    selector: ".kpi-card:first-child",
    title: "Deine KPIs auf einen Blick",
    desc: "Diese Karten zeigen deine wichtigsten Kennzahlen in Echtzeit. Klicke auf eine Karte für mehr Details.",
    position: "bottom",
  },
  {
    route: "/",
    selector: ".topnav-ai-btn",
    title: "Dein KI-Berater",
    desc: "Stelle dem KI-Assistenten jederzeit Fragen zu deinen Daten. Er kennt alle deine Zahlen.",
    position: "bottom",
  },
  {
    route: "/analyse",
    selector: ".tabs-underline",
    title: "Analyse & Prognosen",
    desc: "Wechsle zwischen Analyse, Prognose, Benchmark und Markt — alle Daten in einer Ansicht.",
    position: "bottom",
  },
  {
    route: "/ceo",
    selector: null,
    title: "Empfehlungen",
    desc: "Hier findest du priorisierte Handlungsempfehlungen und 1-Klick-Umsetzungen.",
    position: "center",
  },
  {
    route: "/wachstum",
    selector: null, // full page hint
    title: "Wachstumsstrategie",
    desc: "Hier siehst du alles was auf dein Wachstumsziel einzahlt. Setze dein Ziel in den Einstellungen.",
    position: "center",
  },
  {
    route: "/kunden",
    selector: null,
    title: "Kunden & Segmente",
    desc: "Analysiere deine Kunden nach Segment, Lifetime Value und Kaufverhalten.",
    position: "center",
  },
  {
    route: "/social",
    selector: null,
    title: "Social Media Hub",
    desc: "Verbinde Instagram, TikTok und YouTube — sieh alles auf einer Seite.",
    position: "center",
  },
  {
    route: "/aufgaben",
    selector: null,
    title: "Aufgaben & Kanban",
    desc: "Verwalte Tasks im Kanban-Board. Die KI erstellt automatisch Tasks aus deinen Daten.",
    position: "center",
  },
  {
    route: "/settings",
    selector: null,
    title: "Einstellungen",
    desc: "Verbinde Integrationen, setze dein Wachstumsziel und konfiguriere dein Team. Du bist bereit.",
    position: "center",
  },
];

const STEPS_CORE = [
  {
    route: "/",
    selector: ".kpi-card:first-child",
    title: "Kern-KPIs",
    desc: "Umsatz, Traffic, Kunden und Conversion Rate zeigen dir sofort die Lage.",
    position: "bottom",
  },
  {
    route: "/alerts",
    selector: null,
    title: "Alerts",
    desc: "Warnungen priorisieren und als Aufgaben starten.",
    position: "center",
  },
  {
    route: "/ceo",
    selector: null,
    title: "Empfehlungen",
    desc: "Priorisierte Maßnahmen mit Simulation und Freigabe.",
    position: "center",
  },
];

export default function ProductTour({ onComplete }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState(null);
  const isDone = localStorage.getItem(TOUR_KEY) === "1";
  const coreMode = localStorage.getItem("intlyst_core_mode") === "1";
  const steps = coreMode ? STEPS_CORE : STEPS_FULL;

  useEffect(() => {
    if (!isDone) {
      // Small delay so page renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  const updateBox = useCallback(() => {
    const current = steps[step];
    if (!current?.selector) { setBox(null); return; }
    const el = document.querySelector(current.selector);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, steps]);

  useEffect(() => {
    if (!visible) return;
    const current = steps[step];
    if (current?.route && location.pathname !== current.route) {
      navigate(current.route);
      return;
    }
    updateBox();
    window.addEventListener("resize", updateBox);
    return () => window.removeEventListener("resize", updateBox);
  }, [visible, step, location.pathname, navigate, updateBox]);

  function next() {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  }

  function skip() { finish(); }

  function finish() {
    setVisible(false);
    localStorage.setItem(TOUR_KEY, "1");
    onComplete?.();
  }

  if (!visible || isDone) return null;

  const current = steps[step];
  const PAD = 8;

  // Tooltip position
  let tooltipStyle = {};
  if (box) {
    if (current.position === "bottom") {
      tooltipStyle = {
        top: box.top + box.height + PAD + 16,
        left: Math.max(16, Math.min(box.left + box.width / 2 - 160, window.innerWidth - 336)),
      };
    } else {
      tooltipStyle = {
        top: box.top + box.height / 2 - 80,
        left: Math.max(16, box.left + box.width + PAD + 8),
      };
    }
  } else {
    // center
    tooltipStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 800,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
        }}
        onClick={skip}
        aria-hidden="true"
      />

      {/* Spotlight cutout */}
      {box && (
        <div
          style={{
            position: "fixed",
            zIndex: 801,
            top:    box.top    - PAD,
            left:   box.left   - PAD,
            width:  box.width  + PAD * 2,
            height: box.height + PAD * 2,
            borderRadius: "var(--r-md)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "2px solid var(--c-primary)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{
          position: "fixed",
          zIndex: 802,
          width: 320,
          background: "var(--c-surface)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-xl)",
          padding: "var(--s-5)",
          animation: "slideUp var(--dur-base) var(--ease-out) both",
          ...tooltipStyle,
        }}
        role="dialog"
        aria-label={`Tour Schritt ${step + 1}: ${current.title}`}
      >
        {/* Step dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: "var(--s-3)" }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 16 : 6, height: 6,
                borderRadius: "var(--r-full)",
                background: i === step ? "var(--c-primary)" : "var(--c-border-2)",
                transition: "width var(--dur-base) var(--ease-spring)",
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-text)", marginBottom: "var(--s-2)" }}>
          {current.title}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", lineHeight: "var(--lh-base)", marginBottom: "var(--s-4)" }}>
          {current.desc}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", background: "none", cursor: "pointer" }}
            onClick={skip}
          >
            Tour überspringen
          </button>
          <button className="btn btn-primary btn-sm" onClick={next} autoFocus>
            {step === steps.length - 1 ? "Fertig" : "Weiter →"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Reset tour (for settings) */
export function resetTour() {
  localStorage.removeItem(TOUR_KEY);
}
