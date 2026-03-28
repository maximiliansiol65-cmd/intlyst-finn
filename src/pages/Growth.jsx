import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReferralNudge from "../components/ReferralNudge";

const VELOCITY_CONFIG = {
  slow:      { color: "#475569", label: "Langsam",   width: "25%"  },
  medium:    { color: "#6366f1", label: "Mittel",    width: "50%"  },
  fast:      { color: "#f59e0b", label: "Schnell",   width: "75%"  },
  explosive: { color: "#10b981", label: "Explosiv",  width: "100%" },
};

const IMPACT_CONFIG = {
  high:   { color: "#ef4444", bg: "#ef444412", label: "Hoher Impact"    },
  medium: { color: "#f59e0b", bg: "#f59e0b12", label: "Mittlerer Impact" },
  low:    { color: "#6366f1", bg: "#6366f112", label: "Niedriger Impact" },
};

const EFFORT_CONFIG = {
  low:    { color: "#10b981", label: "Wenig Aufwand"  },
  medium: { color: "#f59e0b", label: "Mittlerer Aufwand" },
  high:   { color: "#ef4444", label: "Hoher Aufwand"  },
};

const TIMEFRAME_CONFIG = {
  immediate:  { color: "#ef4444", label: "Sofort"       },
  this_week:  { color: "#f59e0b", label: "Diese Woche"  },
  this_month: { color: "#6366f1", label: "Diesen Monat" },
};

const PLATFORM_COLORS = {
  Instagram: { color: "#e1306c", bg: "#e1306c12" },
  TikTok:    { color: "#69c9d0", bg: "#69c9d012" },
  YouTube:   { color: "#ff0000", bg: "#ff000012" },
  LinkedIn:  { color: "#0077b5", bg: "#0077b512" },
  Twitter:   { color: "#1da1f2", bg: "#1da1f212" },
};

function GoalSelector({ goals, onSelect }) {
  const [selected, setSelected] = useState("");
  const [company, setCompany]   = useState("");
  const [industry, setIndustry] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok]     = useState("");
  const [youtube, setYoutube]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [step, setStep]         = useState(1);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/growth/set-goal", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          growth_goal:   selected,
          company_name:  company,
          industry:      industry,
          social_handles: {
            instagram: instagram || undefined,
            tiktok:    tiktok    || undefined,
            youtube:   youtube   || undefined,
          },
        }),
      });
      if (res.ok) onSelect(selected);
    } catch {}
    setSaving(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#ffffff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "32px",
    }}>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>
            Wie soll dein Unternehmen wachsen?
          </div>
          <div style={{ fontSize: 14, color: "#475569" }}>
            INTLYST passt alle Analysen und Strategien genau an dein Ziel an.
          </div>
        </div>

        {step === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {goals.map(goal => (
                <button
                  key={goal.key}
                  onClick={() => setSelected(goal.key)}
                  style={{
                    padding: "16px 18px",
                    background: selected === goal.key ? "#6366f118" : "#f5f5f7",
                    border: `1px solid ${selected === goal.key ? "#6366f1" : "#e8e8ed"}`,
                    borderRadius: 12, cursor: "pointer",
                    textAlign: "left", transition: "all 0.15s",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{goal.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selected === goal.key ? "#818cf8" : "#374151", marginBottom: 3 }}>
                      {goal.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>
                      {goal.focus.slice(0, 60)}...
                    </div>
                  </div>
                  {selected === goal.key && (
                    <span style={{ marginLeft: "auto", color: "#6366f1", flexShrink: 0 }}>&#10003;</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => selected && setStep(2)}
              disabled={!selected}
              style={{
                width: "100%", padding: "14px 0",
                background: selected ? "#6366f1" : "#e8e8ed",
                color: selected ? "#fff" : "#475569",
                border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                cursor: selected ? "pointer" : "not-allowed",
              }}
            >
              Weiter &#8594;
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: 16 }}>
                Erzähl mir mehr über dein Unternehmen
              </div>
              {[
                { label: "Unternehmensname", value: company, setter: setCompany, placeholder: "z.B. Muster GmbH" },
                { label: "Branche", value: industry, setter: setIndustry, placeholder: "z.B. E-Commerce, Gastronomie, SaaS" },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: "#475569", display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} style={inputSt} />
                </div>
              ))}
            </div>
            <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: 4 }}>Social Media (optional)</div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
                Damit INTLYST deine Social Media Strategie personalisieren kann.
              </div>
              {[
                { label: "Instagram Handle", value: instagram, setter: setInstagram, placeholder: "@deinhandle" },
                { label: "TikTok Handle", value: tiktok, setter: setTiktok, placeholder: "@deinhandle" },
                { label: "YouTube Kanal", value: youtube, setter: setYoutube, placeholder: "Kanalname" },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "#475569", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} style={inputSt} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ padding: "12px 20px", background: "transparent", border: "1px solid #1e1e2e", borderRadius: 10, fontSize: 13, color: "#64748b", cursor: "pointer" }}>
                Zuruck
              </button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "12px 0", background: saving ? "#e8e8ed" : "#6366f1", color: saving ? "#475569" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {saving ? "Speichert..." : "Strategie generieren"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GrowthScoreMeter({ score, velocity }) {
  const vel = VELOCITY_CONFIG[velocity] || VELOCITY_CONFIG.medium;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#6366f1" : score >= 25 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#e8e8ed" strokeWidth="10" />
          <circle cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 1.2s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 26, fontWeight: 700, color }}>{score}</span>
          <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Growth Score</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>Wachstumsgeschwindigkeit</div>
        <div style={{ width: 200, height: 6, background: "#e8e8ed", borderRadius: 3, marginBottom: 6 }}>
          <div style={{ width: vel.width, height: "100%", background: vel.color, borderRadius: 3, transition: "width 1s ease" }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: vel.color }}>{vel.label}</div>
      </div>
    </div>
  );
}

function ActionCard({ action, onCreateTask }) {
  const [expanded, setExpanded] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const imp = IMPACT_CONFIG[action.impact]       || IMPACT_CONFIG.medium;
  const eff = EFFORT_CONFIG[action.effort]       || EFFORT_CONFIG.medium;
  const tf  = TIMEFRAME_CONFIG[action.timeframe] || TIMEFRAME_CONFIG.this_week;

  async function createTask() {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       action.title,
          description: action.description + "\n\nWarum jetzt: " + action.why_now,
          priority:    action.impact === "high" ? "high" : action.impact === "medium" ? "medium" : "low",
        }),
      });
      setTaskDone(true);
      onCreateTask?.();
    } catch {}
  }

  return (
    <div style={{ background: "#f5f5f7", border: `1px solid ${imp.color}20`, borderRadius: 12, padding: "15px 17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: imp.bg, color: imp.color, textTransform: "uppercase" }}>{imp.label}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#e8e8ed", color: tf.color }}>{tf.label}</span>
        <span style={{ fontSize: 10, color: eff.color, marginLeft: "auto" }}>Aufwand: {eff.label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1d1d1f" }}>{action.title}</div>
        <div style={{ background: "#10b98118", border: "1px solid #10b98130", borderRadius: 7, padding: "5px 10px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>+{action.impact_pct}%</div>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>Impact</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 8px" }}>{action.description}</p>
      <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", background: "#ffffff", borderRadius: 6, padding: "7px 10px", marginBottom: 10 }}>
        {action.why_now}
      </div>
      <button onClick={() => setExpanded(e => !e)} style={{ background: "transparent", border: "none", fontSize: 11, color: "#475569", cursor: "pointer", marginBottom: expanded ? 8 : 0, padding: 0 }}>
        {expanded ? "Schritte ausblenden" : (action.specific_steps?.length || 0) + " konkrete Schritte"}
      </button>
      {expanded && action.specific_steps?.length > 0 && (
        <div style={{ background: "#ffffff", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          {action.specific_steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#94a3b8", marginBottom: i < action.specific_steps.length - 1 ? 6 : 0 }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#e8e8ed", color: "#6366f1", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
      )}
      <button onClick={createTask} disabled={taskDone} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", background: taskDone ? "#10b98118" : "#6366f1", color: taskDone ? "#10b981" : "#fff", cursor: taskDone ? "default" : "pointer" }}>
        {taskDone ? "Task erstellt" : "Als Task erstellen"}
      </button>
      {taskCreated && <ReferralNudge trigger={taskCreated} userId={user?.id} />}
    </div>
  );
}

function SocialCard({ strategy }) {
  const pc = PLATFORM_COLORS[strategy.platform] || { color: "#6366f1", bg: "#6366f112" };
  return (
    <div style={{ background: "#f5f5f7", border: `1px solid ${pc.color}20`, borderRadius: 12, padding: "15px 17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 5, background: pc.bg, color: pc.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{strategy.platform}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{strategy.content_type}</span>
        <span style={{ fontSize: 11, color: "#334155", marginLeft: "auto" }}>{strategy.frequency}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ background: "#ffffff", borderRadius: 7, padding: "9px 12px" }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Hook-Formel</div>
          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{strategy.hook_formula}</div>
        </div>
        <div style={{ background: "#ffffff", borderRadius: 7, padding: "9px 12px" }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Content-Idee</div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{strategy.example_idea}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#ffffff", borderRadius: 7, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>Erwartete Reichweite</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: pc.color }}>{strategy.expected_reach}</div>
          </div>
          <div style={{ background: "#ffffff", borderRadius: 7, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>Bringt</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>{strategy.converts_to}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentIdeasTab() {
  const [ideas, setIdeas]     = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/growth/content-ideas?count=6");
      if (res.ok) setIdeas(await res.json());
    } catch {}
    setLoading(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Content-Ideen</div>
        <button onClick={load} disabled={loading} style={{ background: "#6366f118", border: "1px solid #6366f130", borderRadius: 7, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: "#818cf8", cursor: "pointer" }}>
          {loading ? "Generiere..." : "Neue Ideen generieren"}
        </button>
      </div>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#475569", fontSize: 12, padding: "20px 0" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
          Content-Ideen werden generiert...
        </div>
      )}
      {!loading && ideas.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#334155", fontSize: 13 }}>
          Klicke "Neue Ideen generieren" für personalisierte Content-Ideen.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 12 }}>
        {ideas.map((idea, i) => {
          const pc = PLATFORM_COLORS[idea.platform] || { color: "#6366f1", bg: "#6366f112" };
          return (
            <div key={i} style={{ background: "#f5f5f7", border: `1px solid ${pc.color}20`, borderRadius: 12, padding: "15px 17px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 5, background: pc.bg, color: pc.color, textTransform: "uppercase" }}>{idea.platform}</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{idea.format}</span>
                <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto" }}>{idea.best_time}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", marginBottom: 6 }}>Hook: {idea.hook}</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>{idea.content}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 11, color: "#374151", background: "#ffffff", borderRadius: 6, padding: "5px 10px", borderLeft: `2px solid ${pc.color}` }}>CTA: {idea.cta}</div>
                <span style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>{idea.goal}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Growth() {
  const [goals, setGoals]           = useState([]);
  const [profile, setProfile]       = useState(null);
  const [strategy, setStrategy]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab]               = useState("strategy");
  const [noProfile, setNoProfile]   = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [goalsRes, profileRes] = await Promise.all([
        fetch("/api/growth/goals"),
        fetch("/api/growth/profile"),
      ]);
      if (goalsRes.ok) setGoals(await goalsRes.json());
      if (profileRes.ok) {
        setProfile(await profileRes.json());
        setNoProfile(false);
      } else {
        setNoProfile(true);
      }
    } catch {}
    setLoading(false);
  }

  async function generateStrategy() {
    setGenerating(true);
    try {
      const res = await fetch("/api/growth/strategy");
      if (res.ok) setStrategy(await res.json());
    } catch {}
    setGenerating(false);
  }

  useEffect(() => { loadAll(); }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );

  if (noProfile) return (
    <GoalSelector goals={goals} onSelect={async () => { await loadAll(); await generateStrategy(); }} />
  );

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#374151", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>Wachstumsstrategie</h1>
            {profile && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: "#6366f118", color: "#818cf8" }}>
                {profile.goal_icon} {profile.goal_label}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>{profile?.focus}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setNoProfile(true)} style={{ background: "transparent", border: "1px solid #1e1e2e", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
            Ziel ändern
          </button>
          <button onClick={generateStrategy} disabled={generating} style={{ background: generating ? "#e8e8ed" : "#6366f1", color: generating ? "#475569" : "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer" }}>
            {generating ? "Analysiere..." : "Strategie generieren"}
          </button>
        </div>
      </div>

      {generating && (
        <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 12, padding: "28px", display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 3 }}>Strategie wird generiert für: {profile?.goal_label}</div>
            <div style={{ fontSize: 11, color: "#334155" }}>Echte Daten werden analysiert und ausgewertet...</div>
          </div>
        </div>
      )}

      {strategy && !generating && (
        <>
          <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 12, padding: "20px", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", marginBottom: 16 }}>
              <GrowthScoreMeter score={strategy.growth_score} velocity={strategy.growth_velocity} />
              <div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: "0 0 10px" }}>{strategy.executive_summary}</p>
                <div style={{ background: "#ffffff", border: "1px solid #6366f130", borderLeft: "3px solid #6366f1", borderRadius: "0 8px 8px 0", padding: "9px 14px", fontSize: 12, color: "#374151" }}>
                  <span style={{ color: "#818cf8", fontWeight: 600 }}>Größter Hebel: </span>{strategy.biggest_lever}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#10b98112", border: "1px solid #10b98120", borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Quick Wins</div>
                {strategy.quick_wins.map((qw, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 5, display: "flex", gap: 6 }}>
                    <span style={{ color: "#10b981", flexShrink: 0 }}>&#10003;</span> {qw}
                  </div>
                ))}
              </div>
              <div style={{ background: "#ef444412", border: "1px solid #ef444420", borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Warnungen</div>
                {strategy.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 5, display: "flex", gap: 6 }}>
                    <span style={{ color: "#ef4444", flexShrink: 0 }}>&#9888;</span> {w}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {strategy.next_30_days?.length > 0 && (
            <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>30-Tage Fahrplan</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                {strategy.next_30_days.map((week, i) => (
                  <div key={i} style={{ background: "#ffffff", borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", marginBottom: 5 }}>{week.split(":")[0]}</div>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{week.split(":").slice(1).join(":").trim()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 3, background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 9, padding: 3, marginBottom: 18, width: "fit-content" }}>
            {[
              { key: "strategy", label: "Massnahmen"    },
              { key: "social",   label: "Social Media" },
              { key: "content",  label: "Content-Ideen" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", cursor: "pointer", background: tab === t.key ? "#6366f1" : "transparent", color: tab === t.key ? "#fff" : "#64748b" }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "strategy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {strategy.actions.map(a => <ActionCard key={a.id} action={a} />)}
            </div>
          )}

          {tab === "social" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 12 }}>
              {strategy.social_strategies.map((s, i) => <SocialCard key={i} strategy={s} />)}
            </div>
          )}

          {tab === "content" && <ContentIdeasTab />}
        </>
      )}

      {!strategy && !generating && (
        <div style={{ background: "#f5f5f7", border: "1px solid #1e1e2e", borderRadius: 12, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{profile?.goal_icon}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", marginBottom: 6 }}>Bereit für deine {profile?.goal_label} Strategie</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>
            Klicke "Strategie generieren" - alle Empfehlungen werden exakt auf dein Ziel ausgerichtet.
          </div>
          <button onClick={generateStrategy} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Strategie generieren
          </button>
        </div>
      )}

      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

const inputSt = {
  width: "100%", background: "#ffffff",
  border: "1px solid #1e1e2e", borderRadius: 8,
  padding: "9px 12px", color: "#374151",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};
