import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SkeletonCard, SkeletonLine, Badge, Card } from "../components/ui";

// ── Constants ──────────────────────────────────────────────────────────────────

const GOALS = [
  { key: "revenue",    icon: "📈", label: "Umsatz steigern",       desc: "Mehr Umsatz durch gezielte Maßnahmen und bessere Conversion-Raten" },
  { key: "new_clients",icon: "🎯", label: "Neue Kunden",           desc: "Neue Zielgruppen erschließen und Reichweite systematisch ausbauen" },
  { key: "traffic",    icon: "🚀", label: "Traffic erhöhen",       desc: "Mehr qualifizierte Besucher durch SEO und Performance-Marketing" },
  { key: "retention",  icon: "💎", label: "Kundenbindung",         desc: "Stammkunden halten, Wiederkaufsrate und Customer Lifetime Value steigern" },
  { key: "conversion", icon: "⚡", label: "Conversion optimieren", desc: "Mehr Besucher in zahlende Kunden umwandeln und Funnel verbessern" },
  { key: "costs",      icon: "💰", label: "Kosten senken",         desc: "Operative Kosten reduzieren, Prozesse automatisieren und Effizienz steigern" },
  { key: "expansion",  icon: "🌍", label: "Marktexpansion",        desc: "In neue Märkte, Regionen oder Zielgruppen erfolgreich expandieren" },
  { key: "brand",      icon: "✨", label: "Markenbekanntheit",     desc: "Marke stärken, Sichtbarkeit erhöhen und Vertrauen aufbauen" },
];

const EMPLOYEES_OPTIONS = [
  "Solo (nur ich)",
  "2–5 Personen",
  "6–15 Personen",
  "16–50 Personen",
  "51–200 Personen",
  "200+ Personen",
];

const TIMEFRAME_BADGE = {
  immediate:  "danger",
  this_week:  "warning",
  this_month: "purple",
  long_term:  "neutral",
};

const TIMEFRAME_LABEL = {
  immediate:  "Sofort",
  this_week:  "Diese Woche",
  this_month: "Diesen Monat",
  long_term:  "Langfristig",
};

const EFFORT_BADGE = {
  low:    "success",
  medium: "warning",
  high:   "danger",
};

const EFFORT_LABEL = {
  low:    "Wenig Aufwand",
  medium: "Mittlerer Aufwand",
  high:   "Hoher Aufwand",
};

// Brand colors: #E1306C (Instagram) and #010101 (TikTok) are intentional
// YouTube uses var(--c-danger) as required by spec
const PLATFORM_CONFIG = {
  Instagram: { color: "#E1306C",          bg: "rgba(225,48,108,0.10)" },
  TikTok:    { color: "#010101",          bg: "rgba(1,1,1,0.07)"      },
  YouTube:   { color: "var(--c-danger)",  bg: "var(--c-danger-light)" },
};

const MAIN_TABS = [
  { key: "strategie", label: "Strategie"    },
  { key: "social",    label: "Social Media" },
  { key: "content",   label: "Content"      },
  { key: "plan",      label: "30-Tage Plan" },
];

// ── GoalSelector ───────────────────────────────────────────────────────────────

function GoalSelector({ authHeader, onComplete }) {
  const [selectedGoal, setSelectedGoal] = useState("");
  const [step,         setStep]         = useState(1);
  const [companyName,  setCompanyName]  = useState("");
  const [industry,     setIndustry]     = useState("");
  const [employees,    setEmployees]    = useState("");
  const [instagram,    setInstagram]    = useState("");
  const [tiktok,       setTiktok]       = useState("");
  const [youtube,      setYoutube]      = useState("");
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState(null);

  const selectedObj = GOALS.find(g => g.key === selectedGoal);

  async function handleSubmit() {
    if (!selectedGoal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/growth/setup-goal", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          goal_type:    selectedGoal,
          company_name: companyName.trim() || undefined,
          industry:     industry.trim()    || undefined,
          employees:    employees          || undefined,
          social_handles: {
            instagram: instagram.replace("@", "").trim() || undefined,
            tiktok:    tiktok.replace("@", "").trim()    || undefined,
            youtube:   youtube.trim()                    || undefined,
          },
        }),
      });
      if (res.ok) {
        onComplete();
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    } catch {
      setSaveError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="page-enter"
      style={{
        minHeight:       "100vh",
        background:      "var(--c-bg)",
        display:         "flex",
        justifyContent:  "center",
        paddingTop:      "var(--s-16)",
        paddingBottom:   "var(--s-16)",
        paddingLeft:     "var(--s-6)",
        paddingRight:    "var(--s-6)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>

        {/* ── Page header ── */}
        <div style={{ textAlign: "center", marginBottom: "var(--s-10)" }}>
          <h1
            className="text-title"
            style={{ fontWeight: 700, color: "var(--c-text)", marginBottom: "var(--s-2)" }}
          >
            Wie soll dein Unternehmen wachsen?
          </h1>
          <p className="text-md" style={{ color: "var(--c-text-2)" }}>
            INTLYST richtet alle Analysen auf dein Ziel aus
          </p>
        </div>

        {/* ── Step indicator ── */}
        <div
          style={{
            display:        "flex",
            justifyContent: "center",
            gap:            "var(--s-2)",
            marginBottom:   "var(--s-8)",
          }}
        >
          {[1, 2].map(s => (
            <div
              key={s}
              style={{
                width:      28,
                height:     4,
                borderRadius: "var(--r-full)",
                background:  s <= step ? "var(--c-primary)" : "var(--c-border-2)",
                transition:  "background var(--dur-base) ease",
              }}
            />
          ))}
        </div>

        {/* ── Step 1: Goal selection ── */}
        {step === 1 && (
          <>
            <div className="grid-4" style={{ marginBottom: "var(--s-8)" }}>
              {GOALS.map(goal => {
                const isSelected = selectedGoal === goal.key;
                return (
                  <button
                    key={goal.key}
                    onClick={() => setSelectedGoal(goal.key)}
                    style={{
                      background:   isSelected ? "var(--c-primary)" : "var(--c-surface)",
                      border:       `1px solid ${isSelected ? "var(--c-primary)" : "var(--c-border)"}`,
                      borderRadius: "var(--r-lg)",
                      padding:      "var(--s-5)",
                      textAlign:    "left",
                      cursor:       "pointer",
                      transition:   "all 200ms var(--ease-out)",
                      transform:    isSelected ? "scale(1.02)" : "scale(1)",
                      boxShadow:    isSelected ? "var(--shadow-md)" : "none",
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.transform   = "scale(1.02)";
                        e.currentTarget.style.boxShadow   = "var(--shadow-md)";
                        e.currentTarget.style.borderColor = "var(--c-primary)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        e.currentTarget.style.transform   = "scale(1)";
                        e.currentTarget.style.boxShadow   = "none";
                        e.currentTarget.style.borderColor = "var(--c-border)";
                      }
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: "var(--s-2)", lineHeight: 1 }}>
                      {goal.icon}
                    </div>
                    <div
                      style={{
                        fontSize:     "var(--text-md)",
                        fontWeight:   600,
                        color:        isSelected ? "#fff" : "var(--c-text)",
                        marginBottom: "var(--s-1)",
                      }}
                    >
                      {goal.label}
                    </div>
                    <div
                      className="text-sm"
                      style={{
                        color:      isSelected ? "rgba(255,255,255,0.75)" : "var(--c-text-2)",
                        lineHeight: "var(--lh-loose)",
                      }}
                    >
                      {goal.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Weiter — fades in when a goal is selected */}
            <div
              style={{
                display:        "flex",
                justifyContent: "center",
                opacity:        selectedGoal ? 1 : 0,
                transform:      selectedGoal ? "translateY(0)" : "translateY(8px)",
                transition:     "opacity 200ms var(--ease-out), transform 200ms var(--ease-out)",
                pointerEvents:  selectedGoal ? "auto" : "none",
              }}
            >
              <button className="btn btn-primary btn-lg" onClick={() => setStep(2)}>
                Weiter &rarr;
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Company details ── */}
        {step === 2 && (
          <>
            {/* Selected goal summary */}
            <div
              className="card"
              style={{
                marginBottom:  "var(--s-5)",
                display:       "flex",
                alignItems:    "center",
                gap:           "var(--s-3)",
              }}
            >
              <span style={{ fontSize: 28 }}>{selectedObj?.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="label">Dein Ziel</div>
                <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--c-text)" }}>
                  {selectedObj?.label}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                Ändern
              </button>
            </div>

            {/* Company info */}
            <div className="card" style={{ marginBottom: "var(--s-4)" }}>
              <h3
                style={{
                  fontSize:     "var(--text-lg)",
                  fontWeight:   600,
                  marginBottom: "var(--s-5)",
                  color:        "var(--c-text)",
                }}
              >
                Erzähl uns über dein Unternehmen
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                <div className="form-group">
                  <label className="form-label">Unternehmensname</label>
                  <input
                    className="input"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="z.B. Muster GmbH"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Branche</label>
                  <input
                    className="input"
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    placeholder="z.B. E-Commerce, Gastronomie, SaaS"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mitarbeiteranzahl</label>
                  <select
                    className="select"
                    value={employees}
                    onChange={e => setEmployees(e.target.value)}
                  >
                    <option value="">Bitte wählen (optional)</option>
                    {EMPLOYEES_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Social handles */}
            <div className="card" style={{ marginBottom: "var(--s-6)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--c-text)" }}>
                  Social Media
                </h3>
                <span className="badge badge-neutral">optional</span>
              </div>
              <p
                className="text-sm"
                style={{ color: "var(--c-text-2)", marginBottom: "var(--s-5)" }}
              >
                Damit INTLYST deine Social Media Strategie personalisieren kann.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                <div className="form-group">
                  <label className="form-label">Instagram Handle</label>
                  <input
                    className="input"
                    value={instagram}
                    onChange={e => setInstagram(e.target.value)}
                    placeholder="@deinhandle"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">TikTok Handle</label>
                  <input
                    className="input"
                    value={tiktok}
                    onChange={e => setTiktok(e.target.value)}
                    placeholder="@deinhandle"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube Kanal</label>
                  <input
                    className="input"
                    value={youtube}
                    onChange={e => setYoutube(e.target.value)}
                    placeholder="Kanalname oder URL"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {saveError && (
              <div
                style={{
                  background:   "var(--c-danger-light)",
                  border:       "1px solid var(--c-danger)",
                  borderRadius: "var(--r-sm)",
                  padding:      "var(--s-3) var(--s-4)",
                  color:        "var(--c-danger)",
                  fontSize:     "var(--text-sm)",
                  marginBottom: "var(--s-4)",
                }}
              >
                {saveError}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--s-3)" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                Zurück
              </button>
              <button
                className="btn btn-primary btn-full"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span
                      className="spinner spinner-sm"
                      style={{
                        borderColor:    "rgba(255,255,255,0.30)",
                        borderTopColor: "#fff",
                      }}
                    />
                    Strategie generieren…
                  </>
                ) : (
                  "Strategie generieren"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── GrowthScoreRing ────────────────────────────────────────────────────────────

function GrowthScoreRing({ score = 0, velocity = "medium" }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const safeScore     = Math.min(100, Math.max(0, score));
  const offset        = circumference - (safeScore / 100) * circumference;

  const VELOCITY_MAP = {
    slow:      { label: "Langsam",  pct: "25%"  },
    medium:    { label: "Mittel",   pct: "50%"  },
    fast:      { label: "Schnell",  pct: "75%"  },
    explosive: { label: "Explosiv", pct: "100%" },
  };
  const vel = VELOCITY_MAP[velocity] || VELOCITY_MAP.medium;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-5)", flexShrink: 0 }}>
      {/* SVG ring */}
      <div style={{ position: "relative", width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke="#fff"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 1.2s var(--ease-out)" }}
          />
        </svg>
        <div
          style={{
            position:       "absolute",
            inset:          0,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
            {score}
          </span>
          <span
            style={{
              fontSize:       9,
              color:          "rgba(255,255,255,0.65)",
              textTransform:  "uppercase",
              letterSpacing:  "0.06em",
              marginTop:      2,
            }}
          >
            Score
          </span>
        </div>
      </div>

      {/* Velocity bar */}
      <div>
        <div
          style={{
            fontSize:      "var(--text-xs)",
            color:         "rgba(255,255,255,0.65)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom:  "var(--s-2)",
          }}
        >
          Geschwindigkeit
        </div>
        <div
          style={{
            width:        140,
            height:       5,
            background:   "rgba(255,255,255,0.20)",
            borderRadius: "var(--r-full)",
            marginBottom: "var(--s-1)",
            overflow:     "hidden",
          }}
        >
          <div
            style={{
              width:        vel.pct,
              height:       "100%",
              background:   "#fff",
              borderRadius: "var(--r-full)",
              transition:   "width 1s var(--ease-out)",
            }}
          />
        </div>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "#fff" }}>
          {vel.label}
        </div>
      </div>
    </div>
  );
}

// ── ActionCard ─────────────────────────────────────────────────────────────────

function ActionCard({ action, authHeader }) {
  const [expanded,    setExpanded]    = useState(false);
  const [taskDone,    setTaskDone]    = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);

  const steps    = action.specific_steps || action.steps || [];
  const iceScore = action.ice_score ?? action.iceScore ?? null;

  async function createTask() {
    setTaskLoading(true);
    try {
      await fetch("/api/tasks", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          title:       action.title,
          description: [action.description, action.why_now ? `Warum jetzt: ${action.why_now}` : ""]
            .filter(Boolean).join("\n\n"),
          priority:
            action.impact === "high"   ? "high"   :
            action.impact === "medium" ? "medium"  : "low",
        }),
      });
      setTaskDone(true);
    } catch { /* silent */ }
    setTaskLoading(false);
  }

  return (
    <div className="card card-lift">

      {/* ── Badges row ── */}
      <div
        style={{
          display:       "flex",
          flexWrap:      "wrap",
          gap:           "var(--s-2)",
          alignItems:    "center",
          marginBottom:  "var(--s-3)",
        }}
      >
        {action.type && (
          <span className="badge badge-info">{action.type}</span>
        )}
        <span className={`badge badge-${TIMEFRAME_BADGE[action.timeframe] || "neutral"}`}>
          {TIMEFRAME_LABEL[action.timeframe] || action.timeframe}
        </span>
        <span className={`badge badge-${EFFORT_BADGE[action.effort] || "neutral"}`}>
          {EFFORT_LABEL[action.effort] || action.effort}
        </span>
        {iceScore != null && (
          <span className="badge badge-purple" style={{ marginLeft: "auto" }}>
            ICE&nbsp;{iceScore}
          </span>
        )}
      </div>

      {/* ── Title + impact pct ── */}
      <div
        style={{
          display:       "flex",
          alignItems:    "flex-start",
          gap:           "var(--s-3)",
          marginBottom:  "var(--s-2)",
        }}
      >
        <h4
          style={{
            flex:       1,
            fontSize:   "var(--text-md)",
            fontWeight: 600,
            color:      "var(--c-text)",
            lineHeight: "var(--lh-tight)",
            margin:     0,
          }}
        >
          {action.title}
        </h4>
        {action.impact_pct != null && (
          <div
            style={{
              flexShrink:   0,
              background:   "var(--c-success-light)",
              border:       "1px solid var(--c-success)",
              borderRadius: "var(--r-sm)",
              padding:      "var(--s-2) var(--s-3)",
              textAlign:    "center",
            }}
          >
            <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--c-success)" }}>
              +{action.impact_pct}%
            </div>
            <div className="label" style={{ color: "var(--c-success)" }}>Impact</div>
          </div>
        )}
      </div>

      {/* ── Description ── */}
      {action.description && (
        <p
          className="text-sm"
          style={{
            color:        "var(--c-text-2)",
            lineHeight:   "var(--lh-loose)",
            marginBottom: "var(--s-3)",
            margin:       "0 0 var(--s-3)",
          }}
        >
          {action.description}
        </p>
      )}

      {/* ── Why now ── */}
      {action.why_now && (
        <div
          style={{
            background:   "var(--c-surface-2)",
            borderLeft:   "3px solid var(--c-primary)",
            borderRadius: "var(--r-xs)",
            padding:      "var(--s-3) var(--s-4)",
            marginBottom: "var(--s-3)",
          }}
        >
          <p
            className="text-sm italic"
            style={{ color: "var(--c-text-2)", margin: 0, lineHeight: "var(--lh-base)" }}
          >
            {action.why_now}
          </p>
        </div>
      )}

      {/* ── Steps toggle ── */}
      {steps.length > 0 && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "var(--s-1) 0", justifyContent: "flex-start" }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded
            ? "Schritte ausblenden"
            : `${steps.length} konkrete Schritt${steps.length === 1 ? "" : "e"} anzeigen`}
        </button>
      )}

      {/* ── Expanded steps ── */}
      {expanded && steps.length > 0 && (
        <div
          style={{
            background:    "var(--c-surface-2)",
            borderRadius:  "var(--r-sm)",
            padding:       "var(--s-4)",
            marginTop:     "var(--s-2)",
            display:       "flex",
            flexDirection: "column",
            gap:           "var(--s-3)",
          }}
        >
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--s-3)", alignItems: "flex-start" }}>
              <span
                style={{
                  width:          22,
                  height:         22,
                  borderRadius:   "var(--r-full)",
                  background:     "var(--c-primary-light)",
                  color:          "var(--c-primary)",
                  fontSize:       "var(--text-xs)",
                  fontWeight:     700,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  marginTop:      1,
                }}
              >
                {i + 1}
              </span>
              <p
                className="text-sm"
                style={{ color: "var(--c-text-2)", margin: 0, lineHeight: "var(--lh-base)" }}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Create task ── */}
      <div
        style={{
          borderTop:  "1px solid var(--c-border)",
          paddingTop: "var(--s-3)",
          marginTop:  "var(--s-3)",
        }}
      >
        <button
          className={`btn btn-sm ${taskDone ? "btn-secondary" : "btn-primary"}`}
          onClick={createTask}
          disabled={taskDone || taskLoading}
        >
          {taskLoading ? (
            <>
              <span
                className="spinner spinner-sm"
                style={{ borderColor: "rgba(255,255,255,0.30)", borderTopColor: "#fff" }}
              />
              Erstelle…
            </>
          ) : taskDone ? (
            "Task erstellt ✓"
          ) : (
            "Als Task erstellen"
          )}
        </button>
      </div>
    </div>
  );
}

// ── SocialCard ─────────────────────────────────────────────────────────────────

function SocialCard({ strategy }) {
  const pc = PLATFORM_CONFIG[strategy.platform] || {
    color: "var(--c-primary)",
    bg:    "var(--c-primary-light)",
  };

  return (
    <div className="card" style={{ borderTop: `3px solid ${pc.color}` }}>

      {/* Platform header */}
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "var(--s-3)",
          marginBottom:  "var(--s-4)",
          flexWrap:      "wrap",
        }}
      >
        <span
          style={{
            background:    pc.bg,
            color:         pc.color,
            padding:       "3px 10px",
            borderRadius:  "var(--r-full)",
            fontSize:      "var(--text-xs)",
            fontWeight:    700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {strategy.platform}
        </span>
        {strategy.content_type && (
          <span className="text-sm" style={{ color: "var(--c-text-2)" }}>
            {strategy.content_type}
          </span>
        )}
        {strategy.frequency && (
          <span className="label" style={{ marginLeft: "auto" }}>
            {strategy.frequency}
          </span>
        )}
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>

        {strategy.hook_formula && (
          <div
            style={{
              background:   "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
              padding:      "var(--s-3) var(--s-4)",
            }}
          >
            <div className="label" style={{ marginBottom: "var(--s-1)" }}>Hook-Formel</div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text)", margin: 0, lineHeight: "var(--lh-base)" }}
            >
              {strategy.hook_formula}
            </p>
          </div>
        )}

        {(strategy.example_idea || strategy.content_idea) && (
          <div
            style={{
              background:   "var(--c-surface-2)",
              borderRadius: "var(--r-sm)",
              padding:      "var(--s-3) var(--s-4)",
            }}
          >
            <div className="label" style={{ marginBottom: "var(--s-1)" }}>Content-Idee</div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text-2)", margin: 0, lineHeight: "var(--lh-base)" }}
            >
              {strategy.example_idea || strategy.content_idea}
            </p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
          {strategy.expected_reach && (
            <div
              style={{
                background:   "var(--c-surface-2)",
                borderRadius: "var(--r-sm)",
                padding:      "var(--s-3)",
              }}
            >
              <div className="label" style={{ marginBottom: "var(--s-1)" }}>
                Erwartete Reichweite
              </div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: pc.color }}>
                {strategy.expected_reach}
              </div>
            </div>
          )}

          {(strategy.converts_to || strategy.what_it_brings) && (
            <div
              style={{
                background:   "var(--c-success-light)",
                borderRadius: "var(--r-sm)",
                padding:      "var(--s-3)",
              }}
            >
              <div className="label" style={{ marginBottom: "var(--s-1)", color: "var(--c-success)" }}>
                Was bringt es
              </div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-success)" }}>
                {strategy.converts_to || strategy.what_it_brings}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── StrategyTab ────────────────────────────────────────────────────────────────

function StrategyTab({ strategy, authHeader, loading, error, onRetry }) {

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card"><SkeletonCard lines={5} /></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <div className="error-icon">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8"  x2="12"    y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="empty-title">{error}</p>
        <button className="btn btn-primary" onClick={onRetry}>Erneut versuchen</button>
      </div>
    );
  }

  if (!strategy) return null;

  const actions = (strategy.actions || [])
    .slice()
    .sort((a, b) => (b.ice_score ?? b.iceScore ?? 0) - (a.ice_score ?? a.iceScore ?? 0));

  return (
    <div>

      {/* Executive summary */}
      {strategy.executive_summary && (
        <div className="card" style={{ marginBottom: "var(--s-5)" }}>
          <div className="label" style={{ marginBottom: "var(--s-2)" }}>Executive Summary</div>
          <p
            style={{
              fontSize:   "var(--text-lg)",
              color:      "var(--c-text)",
              lineHeight: "var(--lh-loose)",
              margin:     0,
            }}
          >
            {strategy.executive_summary}
          </p>
        </div>
      )}

      {/* Biggest lever */}
      {strategy.biggest_lever && (
        <div
          style={{
            background:   "var(--c-primary-light)",
            border:       "1px solid var(--c-primary)",
            borderLeft:   "4px solid var(--c-primary)",
            borderRadius: "var(--r-sm)",
            padding:      "var(--s-4)",
            marginBottom: "var(--s-5)",
          }}
        >
          <div className="label" style={{ color: "var(--c-primary)", marginBottom: "var(--s-1)" }}>
            Größter Hebel
          </div>
          <p
            style={{
              fontSize:   "var(--text-md)",
              fontWeight: 600,
              color:      "var(--c-text)",
              margin:     0,
            }}
          >
            {strategy.biggest_lever}
          </p>
        </div>
      )}

      {/* Action cards sorted by ICE score */}
      {actions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {actions.map((a, i) => (
            <ActionCard key={a.id ?? i} action={a} authHeader={authHeader} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>🎯</div>
          <p className="empty-title">Keine Maßnahmen vorhanden</p>
          <p className="empty-text">
            Generiere eine neue Strategie um konkrete Maßnahmen zu sehen.
          </p>
        </div>
      )}
    </div>
  );
}

// ── SocialTab ──────────────────────────────────────────────────────────────────

function SocialTab({ strategies, loading, error, onRetry }) {

  if (loading) {
    return (
      <div className="grid-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card"><SkeletonCard lines={5} /></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <div className="error-icon">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8"  x2="12"    y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="empty-title">{error}</p>
        <button className="btn btn-primary" onClick={onRetry}>Erneut versuchen</button>
      </div>
    );
  }

  if (!strategies || strategies.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 40 }}>📱</div>
        <p className="empty-title">Keine Social Media Strategien</p>
        <p className="empty-text">
          Strategiedaten werden für Social Media Empfehlungen benötigt.
        </p>
      </div>
    );
  }

  return (
    <div className="grid-3">
      {strategies.map((s, i) => (
        <SocialCard key={i} strategy={s} />
      ))}
    </div>
  );
}

// ── ContentTab ─────────────────────────────────────────────────────────────────

function ContentTab({ authHeader }) {
  const [ideas,   setIdeas]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [loaded,  setLoaded]  = useState(false);

  async function loadIdeas() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/growth/content", { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        setIdeas(Array.isArray(data) ? data : (data.ideas || []));
        setLoaded(true);
      } else {
        setError("Content-Ideen konnten nicht geladen werden.");
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>

      {/* Header */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   "var(--s-5)",
          flexWrap:       "wrap",
          gap:            "var(--s-3)",
        }}
      >
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--c-text)", margin: 0 }}>
          Content-Ideen
        </h3>
        <button className="btn btn-primary btn-sm" onClick={loadIdeas} disabled={loading}>
          {loading ? (
            <>
              <span
                className="spinner spinner-sm"
                style={{ borderColor: "rgba(255,255,255,0.30)", borderTopColor: "#fff" }}
              />
              Generiere…
            </>
          ) : (
            "Neue Ideen generieren"
          )}
        </button>
      </div>

      {/* Loading skeleton — 2×3 grid */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card"><SkeletonCard lines={4} /></div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8"  x2="12"    y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="empty-title">{error}</p>
          <button className="btn btn-primary" onClick={loadIdeas}>Erneut versuchen</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !loaded && (
        <div className="empty-state">
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: "var(--s-2)" }}>💡</div>
          <p className="empty-title">Noch keine Content-Ideen</p>
          <p className="empty-text">
            Klicke "Neue Ideen generieren" für personalisierte Content-Ideen zu deinem Wachstumsziel.
          </p>
        </div>
      )}

      {/* Ideas grid — 2×3 */}
      {!loading && ideas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
          {ideas.slice(0, 6).map((idea, i) => {
            const pc = PLATFORM_CONFIG[idea.platform] || {
              color: "var(--c-primary)",
              bg:    "var(--c-primary-light)",
            };
            return (
              <div
                key={i}
                className="card card-lift"
                style={{ display: "flex", flexDirection: "column" }}
              >
                {/* Platform + format + best time */}
                <div
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           "var(--s-2)",
                    marginBottom:  "var(--s-3)",
                    flexWrap:      "wrap",
                  }}
                >
                  <span
                    style={{
                      background:    pc.bg,
                      color:         pc.color,
                      padding:       "2px 9px",
                      borderRadius:  "var(--r-full)",
                      fontSize:      "var(--text-xs)",
                      fontWeight:    700,
                      textTransform: "uppercase",
                    }}
                  >
                    {idea.platform}
                  </span>
                  {idea.format && (
                    <span className="badge badge-neutral">{idea.format}</span>
                  )}
                  {idea.best_time && (
                    <span className="label" style={{ marginLeft: "auto" }}>{idea.best_time}</span>
                  )}
                </div>

                {/* Hook */}
                <div
                  style={{
                    fontSize:     "var(--text-sm)",
                    fontWeight:   600,
                    color:        "var(--c-text)",
                    marginBottom: "var(--s-2)",
                  }}
                >
                  Hook: {idea.hook}
                </div>

                {/* Content */}
                <p
                  className="text-sm"
                  style={{
                    color:        "var(--c-text-2)",
                    lineHeight:   "var(--lh-base)",
                    marginBottom: "var(--s-3)",
                    flex:         1,
                    margin:       "0 0 var(--s-3)",
                  }}
                >
                  {idea.content}
                </p>

                {/* CTA + goal */}
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    gap:            "var(--s-2)",
                    borderTop:      "1px solid var(--c-border)",
                    paddingTop:     "var(--s-2)",
                    flexWrap:       "wrap",
                  }}
                >
                  {idea.cta && (
                    <span
                      className="text-sm"
                      style={{
                        color:       "var(--c-text-3)",
                        borderLeft:  `2px solid ${pc.color}`,
                        paddingLeft: "var(--s-2)",
                        lineHeight:  "var(--lh-tight)",
                      }}
                    >
                      CTA: {idea.cta}
                    </span>
                  )}
                  {idea.goal && (
                    <span className="badge badge-success">{idea.goal}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PlanTab ────────────────────────────────────────────────────────────────────

function PlanTab({ weeks }) {

  if (!weeks || weeks.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 40 }}>📅</div>
        <p className="empty-title">Kein 30-Tage Plan verfügbar</p>
        <p className="empty-text">
          Generiere zuerst eine Strategie um den Fahrplan zu sehen.
        </p>
      </div>
    );
  }

  // Normalize: weeks can be strings "Woche 1: Focus text\nbullet;bullet"
  // or objects { label, focus, bullets/tasks/actions }
  const normalized = weeks.slice(0, 4).map((w, i) => {
    if (typeof w === "string") {
      const colonIdx = w.indexOf(":");
      const label    = colonIdx > -1 ? w.slice(0, colonIdx).trim() : `Woche ${i + 1}`;
      const rest     = colonIdx > -1 ? w.slice(colonIdx + 1).trim() : w;
      const lines    = rest.split(/\n|;/).map(l => l.trim()).filter(Boolean);
      return { label, focus: lines[0] || "", bullets: lines.slice(1) };
    }
    return {
      label:   w.label  || w.week  || `Woche ${i + 1}`,
      focus:   w.focus  || w.theme || w.title || "",
      bullets: w.bullets || w.tasks || w.actions || [],
    };
  });

  return (
    <div>
      <h3
        style={{
          fontSize:     "var(--text-lg)",
          fontWeight:   600,
          color:        "var(--c-text)",
          marginBottom: "var(--s-5)",
        }}
      >
        30-Tage Fahrplan
      </h3>

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 "var(--s-4)",
        }}
      >
        {normalized.map((week, i) => (
          <div
            key={i}
            className="card"
            style={{ borderTop: "3px solid var(--c-primary)" }}
          >
            <div
              className="label"
              style={{ color: "var(--c-primary)", marginBottom: "var(--s-2)" }}
            >
              {week.label}
            </div>

            {week.focus && (
              <div
                style={{
                  fontSize:     "var(--text-md)",
                  fontWeight:   600,
                  color:        "var(--c-text)",
                  marginBottom: "var(--s-3)",
                  lineHeight:   "var(--lh-tight)",
                }}
              >
                {week.focus}
              </div>
            )}

            {week.bullets.length > 0 && (
              <ul style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                {week.bullets.slice(0, 3).map((b, j) => (
                  <li
                    key={j}
                    style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-start" }}
                  >
                    <span
                      style={{
                        width:        6,
                        height:       6,
                        borderRadius: "var(--r-full)",
                        background:   "var(--c-primary)",
                        flexShrink:   0,
                        marginTop:    5,
                      }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--c-text-2)", lineHeight: "var(--lh-base)" }}
                    >
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Wachstum() {
  const { authHeader } = useAuth();
  // useNavigate kept for potential future routing needs
  const navigate = useNavigate(); // eslint-disable-line no-unused-vars

  // "loading" | "no-goal" | "has-goal"
  const [pageState,    setPageState]    = useState("loading");
  const [strategy,     setStrategy]     = useState(null);
  const [stratLoading, setStratLoading] = useState(false);
  const [stratError,   setStratError]   = useState(null);
  const [activeTab,    setActiveTab]    = useState("strategie");

  const loadStrategy = useCallback(async () => {
    setStratLoading(true);
    setStratError(null);
    try {
      const res = await fetch("/api/growth/strategy", { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        if (!data || !data.goal_type) {
          setPageState("no-goal");
        } else {
          setStrategy(data);
          setPageState("has-goal");
        }
      } else if (res.status === 404 || res.status === 204) {
        setPageState("no-goal");
      } else {
        setStratError("Strategie konnte nicht geladen werden.");
        setPageState("has-goal");
      }
    } catch {
      setStratError("Netzwerkfehler. Bitte erneut versuchen.");
      setPageState("has-goal");
    } finally {
      setStratLoading(false);
    }
  }, []); // authHeader is stable (defined in context)

  useEffect(() => {
    loadStrategy();
  }, [loadStrategy]);

  function handleGoalComplete() {
    setPageState("loading");
    setStrategy(null);
    loadStrategy();
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div
        style={{
          minHeight:      "100vh",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     "var(--c-bg)",
        }}
      >
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // ── No goal set ────────────────────────────────────────────────────────────

  if (pageState === "no-goal") {
    return <GoalSelector authHeader={authHeader} onComplete={handleGoalComplete} />;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  const goalKey   = strategy?.goal_type;
  const goalObj   = GOALS.find(g => g.key === goalKey) || {
    icon:  "📊",
    label: strategy?.goal_label || "Wachstum",
  };
  const score             = strategy?.growth_score    ?? 0;
  const velocity          = strategy?.growth_velocity ?? "medium";
  const socialStrategies  = strategy?.social_strategies || [];
  const weekPlan          = strategy?.next_30_days || strategy?.week_plan || [];

  return (
    <div className="page-enter" style={{ minHeight: "100vh", background: "var(--c-bg)" }}>

      {/* ── Hero Banner (gradient) ─────────────────────────────────────────── */}
      {/*
          The gradient endpoint #5856D6 is an intentional design decision.
          White (#fff) is used for text on this dark gradient background.
      */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--c-primary) 0%, #5856D6 100%)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin:   "0 auto",
            padding:  "var(--s-8) var(--content-pad) 0",
          }}
        >
          {/* Top row: title left, score ring right */}
          <div
            style={{
              display:        "flex",
              alignItems:     "flex-start",
              justifyContent: "space-between",
              gap:            "var(--s-6)",
              flexWrap:       "wrap",
              marginBottom:   "var(--s-6)",
            }}
          >
            {/* Left: labels + goal name */}
            <div>
              <div
                style={{
                  fontSize:      12,
                  fontWeight:    500,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color:         "rgba(255,255,255,0.70)",
                  marginBottom:  "var(--s-2)",
                }}
              >
                Wachstumsstrategie
              </div>

              <div
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        "var(--s-3)",
                  flexWrap:   "wrap",
                }}
              >
                <span style={{ fontSize: 28 }}>{goalObj.icon}</span>
                <h1
                  style={{
                    fontSize:   22,
                    fontWeight: 700,
                    color:      "#fff",
                    margin:     0,
                    lineHeight: "var(--lh-tight)",
                  }}
                >
                  {goalObj.label}
                </h1>
              </div>

              {strategy?.focus && (
                <p
                  style={{
                    fontSize:   "var(--text-sm)",
                    color:      "rgba(255,255,255,0.70)",
                    marginTop:  "var(--s-2)",
                    marginBottom: 0,
                  }}
                >
                  {strategy.focus}
                </p>
              )}

              <button
                className="btn btn-sm"
                style={{
                  marginTop:  "var(--s-4)",
                  background: "rgba(255,255,255,0.15)",
                  color:      "#fff",
                  border:     "1px solid rgba(255,255,255,0.25)",
                }}
                onClick={() => setPageState("no-goal")}
              >
                Ziel ändern
              </button>
            </div>

            {/* Right: growth score ring */}
            {score > 0 && (
              <GrowthScoreRing score={score} velocity={velocity} />
            )}
          </div>

          {/* Tabs — white override on gradient */}
          <div
            className="tabs-underline"
            style={{ borderBottomColor: "rgba(255,255,255,0.20)" }}
          >
            {MAIN_TABS.map(t => (
              <button
                key={t.key}
                className={`tab-underline${activeTab === t.key ? " active" : ""}`}
                style={{
                  color:            activeTab === t.key
                    ? "#fff"
                    : "rgba(255,255,255,0.60)",
                  borderBottomColor: activeTab === t.key
                    ? "#fff"
                    : "transparent",
                }}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: "var(--content-max)",
          margin:   "0 auto",
          padding:  "var(--s-6) var(--content-pad) var(--s-16)",
        }}
      >
        {activeTab === "strategie" && (
          <StrategyTab
            strategy={strategy}
            authHeader={authHeader}
            loading={stratLoading}
            error={stratError}
            onRetry={loadStrategy}
          />
        )}

        {activeTab === "social" && (
          <SocialTab
            strategies={socialStrategies}
            loading={stratLoading}
            error={stratError}
            onRetry={loadStrategy}
          />
        )}

        {activeTab === "content" && (
          <ContentTab authHeader={authHeader} />
        )}

        {activeTab === "plan" && (
          <PlanTab weeks={weekPlan} />
        )}
      </div>
    </div>
  );
}
