/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/premium-dashboard.css";
import { useAuth } from "../contexts/AuthContext";

// ─── Role-based KPI configurations ───────────────────────────────────────────
const ROLE_KPI_CONFIGS = {
  ceo: {
    label: "CEO",
    icon: "👔",
    description: "Strategie & Gesamtperformance",
    kpis: [
      { label: "Umsatz",           category: "revenue"    },
      { label: "Wachstum (MoM)",   category: "growth"     },
      { label: "Neue Kunden",      category: "customers"  },
      { label: "Conversion Rate",  category: "conversion" },
      { label: "Team-Effizienz",   category: "operations" },
    ],
  },
  cmo: {
    label: "CMO",
    icon: "📣",
    description: "Marketing & Kampagnen",
    kpis: [
      { label: "Marketing ROI",    category: "marketing"  },
      { label: "Traffic",          category: "traffic"    },
      { label: "Social Reach",     category: "social"     },
      { label: "Lead-Generierung", category: "leads"      },
      { label: "E-Mail Open Rate", category: "email"      },
    ],
  },
  cfo: {
    label: "CFO",
    icon: "💰",
    description: "Finanzen & Cash-Flow",
    kpis: [
      { label: "Umsatz",           category: "revenue"    },
      { label: "EBITDA",           category: "ebitda"     },
      { label: "Cashflow",         category: "cashflow"   },
      { label: "Burn Rate",        category: "burn"       },
      { label: "ROI",              category: "roi"        },
    ],
  },
  coo: {
    label: "COO",
    icon: "⚙️",
    description: "Operations & Prozesse",
    kpis: [
      { label: "Kundenzufriedenheit", category: "nps"       },
      { label: "Prozesseffizienz",    category: "efficiency" },
      { label: "Lieferzeit (Ø)",      category: "delivery"  },
      { label: "Support-Tickets",     category: "support"   },
      { label: "Mitarbeiter-KPI",     category: "hr"        },
    ],
  },
  strategist: {
    label: "Stratege",
    icon: "🎯",
    description: "Markt & Wettbewerb",
    kpis: [
      { label: "Marktanteil",        category: "market"       },
      { label: "Wachstumstrend",     category: "growth"       },
      { label: "Wettbewerbs-Index",  category: "competitive"  },
      { label: "Kundenbindungsrate", category: "retention"    },
      { label: "Innovation-KPI",     category: "innovation"   },
    ],
  },
  assistant: {
    label: "Assistent",
    icon: "🤝",
    description: "Überblick & Support",
    kpis: [
      { label: "Umsatz",           category: "revenue"   },
      { label: "Traffic",          category: "traffic"   },
      { label: "Offene Aufgaben",  category: "tasks"     },
      { label: "Alerts",           category: "alerts"    },
      { label: "Team-Aktivität",   category: "team"      },
    ],
  },
};

const ROLE_STORAGE_KEY = "intlyst_dashboard_role";

// ─── Static fallback data ─────────────────────────────────────────────────────
const FALLBACK_KPIS = [
  { label: "Umsatz",          value: "–",    delta: null },
  { label: "Neue Kunden",     value: "–",    delta: null },
  { label: "Traffic",         value: "–",    delta: null },
  { label: "Conversion Rate", value: "–",    delta: null },
  { label: "Ø Bestellwert",   value: "–",    delta: null },
];

const FALLBACK_WARNING = {
  title: "Conversion Rate rückläufig",
  detail: "Checkout Drop-offs ab Schritt 2 — Mobile Nutzern brechen 14% häufiger ab.",
  action: "Analyse öffnen",
  href: "/analyse",
};

const FALLBACK_OPPORTUNITY = {
  title: "Organischer Traffic steigt",
  detail: "+18,9% durch Social Push — SEO-Momentum nutzen.",
  action: "Strategie planen",
  href: "/command",
};

const FALLBACK_ACTION = {
  title: "Checkout-Ladezeit optimieren",
  detail: "Mobile Conversion kann durch Bildkompression & CDN sofort verbessert werden. Impact: Hoch.",
  owner: "Tech",
  kpi: "Conversion Rate",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { authHeader } = useAuth();

  const today = useMemo(() =>
    new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()), []);

  const [causeData, setCauseData]     = useState([]);
  const [actionCreated, setActionCreated] = useState(false);
  const [selectedRole, setSelectedRole]   = useState(
    () => localStorage.getItem(ROLE_STORAGE_KEY) || "ceo"
  );

  const roleConfig = ROLE_KPI_CONFIGS[selectedRole] || ROLE_KPI_CONFIGS.ceo;

  function changeRole(roleKey) {
    setSelectedRole(roleKey);
    localStorage.setItem(ROLE_STORAGE_KEY, roleKey);
  }

  // Week progress
  const weekDay = new Date().getDay();
  const weekProgress = weekDay === 0 || weekDay === 6 ? 100 : Math.round((weekDay / 5) * 100);

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/causes", { headers: authHeader() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => { if (alive) setCauseData(data.items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authHeader]);

  // Top warning & opportunity from live data
  const topWarning = useMemo(() => {
    const downEvents = causeData.filter(e => e.direction === "down");
    if (downEvents.length > 0) {
      const e = downEvents[0];
      return {
        title: e.metric_label + " rückläufig",
        detail: e.summary,
        action: "Analyse öffnen",
        href: "/analyse",
      };
    }
    return FALLBACK_WARNING;
  }, [causeData]);

  const topOpportunity = useMemo(() => {
    const upEvents = causeData.filter(e => e.direction === "up");
    if (upEvents.length > 0) {
      const e = upEvents[0];
      return {
        title: e.metric_label + " steigt",
        detail: e.summary,
        action: "Momentum nutzen",
        href: "/command",
      };
    }
    return FALLBACK_OPPORTUNITY;
  }, [causeData]);

  function handleCreateAction() {
    setActionCreated(true);
    setTimeout(() => setActionCreated(false), 3000);
  }

  return (
    <div className="ceo-shell">
      {/* Header */}
      <header className="ceo-hero">
        <div>
          <p className="eyebrow">3-Sekunden-Überblick</p>
          <h1>Wie läuft dein Unternehmen?</h1>
          <p className="sub">{today}</p>
        </div>
        <div className="hero-note" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Wochenfortschritt</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${weekProgress}%`, background: "#0f9f6e", borderRadius: 4, transition: "width 0.5s ease" }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{weekProgress}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* Role Selector */}
      <section className="ceo-section" style={{ paddingBottom: "var(--s-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s-3)" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              Dashboard-Ansicht
            </div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)" }}>
              {roleConfig.icon} {roleConfig.label} — {roleConfig.description}
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            {Object.entries(ROLE_KPI_CONFIGS).map(([key, cfg]) => (
              <button key={key} onClick={() => changeRole(key)} style={{
                padding: "5px 12px", borderRadius: "999px", cursor: "pointer",
                border: "1px solid var(--border)",
                background: selectedRole === key ? "#0f172a" : "var(--surface)",
                color: selectedRole === key ? "#fff" : "var(--text)",
                fontSize: "var(--text-xs)", fontWeight: 600,
              }}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs — role specific */}
      <section className="ceo-section kpi-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {roleConfig.icon} {roleConfig.label}-KPIs
          </div>
          <Link to="/settings" style={{ fontSize: "var(--text-xs)", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
            Daten verbinden →
          </Link>
        </div>
        <div className="kpi-grid">
          {roleConfig.kpis.map((kpi) => (
            <div key={kpi.label} className="kpi-card">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: "var(--muted)" }}>–</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Keine Daten</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "var(--s-3)", fontSize: "var(--text-xs)", color: "var(--muted)" }}>
          Live-Daten verfügbar nach Verbinden deiner Datenquellen in{" "}
          <Link to="/integrations" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>Integrationen</Link>.
        </div>
      </section>

      {/* Warning + Opportunity */}
      <section className="ceo-section analysis-section">
        {/* Warning */}
        <div className="analysis-card" style={{ borderLeft: "4px solid #ef4444", borderRadius: "18px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "var(--s-2)" }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div className="section-title" style={{ marginBottom: 0, color: "#b91c1c" }}>Wichtigste Warnung</div>
          </div>
          <div className="change-title">{topWarning.title}</div>
          <div className="change-detail" style={{ marginTop: 6, lineHeight: 1.6 }}>{topWarning.detail}</div>
          <Link to={topWarning.href} style={{
            display: "inline-block", marginTop: "var(--s-3)",
            padding: "6px 16px", borderRadius: "var(--r-sm)",
            background: "#fef2f2", color: "#b91c1c",
            fontSize: "var(--text-xs)", fontWeight: 700, textDecoration: "none",
          }}>
            {topWarning.action} →
          </Link>
        </div>

        {/* Opportunity */}
        <div className="analysis-card small" style={{ borderLeft: "4px solid #10b981", borderRadius: "18px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "var(--s-2)" }}>
            <span style={{ fontSize: 20 }}>🚀</span>
            <div className="section-title" style={{ marginBottom: 0, color: "#065f46" }}>Größte Chance</div>
          </div>
          <div className="change-title">{topOpportunity.title}</div>
          <div className="change-detail" style={{ marginTop: 6, lineHeight: 1.6 }}>{topOpportunity.detail}</div>
          <Link to={topOpportunity.href} style={{
            display: "inline-block", marginTop: "var(--s-3)",
            padding: "6px 16px", borderRadius: "var(--r-sm)",
            background: "#ecfdf5", color: "#065f46",
            fontSize: "var(--text-xs)", fontWeight: 700, textDecoration: "none",
          }}>
            {topOpportunity.action} →
          </Link>
        </div>
      </section>

      {/* Recommended Action */}
      <section className="ceo-section action-section">
        <div className="action-card">
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "var(--s-2)" }}>
              <span style={{ fontSize: 20 }}>🎯</span>
              <div className="section-title" style={{ marginBottom: 0 }}>Empfohlene Aktion heute</div>
            </div>
            <div className="change-title" style={{ fontSize: 18 }}>{FALLBACK_ACTION.title}</div>
            <div className="change-detail" style={{ marginTop: 8, lineHeight: 1.6 }}>{FALLBACK_ACTION.detail}</div>
            <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-3)", flexWrap: "wrap" }}>
              <span style={{ padding: "3px 10px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontSize: "var(--text-xs)", fontWeight: 600 }}>
                Verantwortlich: {FALLBACK_ACTION.owner}
              </span>
              <span style={{ padding: "3px 10px", borderRadius: "999px", background: "#ede9fe", color: "#6d28d9", fontSize: "var(--text-xs)", fontWeight: 600 }}>
                KPI: {FALLBACK_ACTION.kpi}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-4)", flexWrap: "wrap" }}>
            <button
              className={`cta ${actionCreated ? "done" : "idle"}`}
              onClick={handleCreateAction}
              disabled={actionCreated}
            >
              {actionCreated ? "Aufgabe erstellt ✅" : "Als Aufgabe erstellen"}
            </button>
            <Link to="/command" style={{
              padding: "12px 20px", borderRadius: "var(--r-md)",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text)", fontSize: 14, fontWeight: 600,
              textDecoration: "none", display: "flex", alignItems: "center",
            }}>
              Im Command Center planen →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Navigation */}
      <footer className="ceo-footer">
        <div className="foot-note">
          Mehr Details? Wähle deinen Bereich:
        </div>
        <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", marginTop: "var(--s-3)" }}>
          {[
            { label: "Command Center", href: "/command", emoji: "🎯" },
            { label: "Analyse",        href: "/analyse", emoji: "📊" },
            { label: "Aufgaben",       href: "/tasks",   emoji: "✅" },
            { label: "AI-Empfehlungen",href: "/ceo",     emoji: "🤖" },
            { label: "Alerts",         href: "/alerts",  emoji: "🔔" },
          ].map(item => (
            <Link key={item.href} to={item.href} style={{
              display: "flex", gap: "var(--s-2)", alignItems: "center",
              padding: "8px 16px", borderRadius: "var(--r-md)",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", textDecoration: "none",
              fontSize: 14, fontWeight: 500,
            }}>
              {item.emoji} {item.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
