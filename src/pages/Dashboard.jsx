import { useEffect, useMemo, useState } from "react";
import "../styles/premium-dashboard.css";
import { useAuth } from "../contexts/AuthContext";

const kpiCards = [
  { label: "Umsatz", value: "€142.500", delta: "+8,4%" },
  { label: "Neue Kunden", value: "326", delta: "+12,1%" },
  { label: "Traffic", value: "184.200", delta: "+18,9%" },
  { label: "Conversion Rate", value: "3,28%", delta: "-0,4%" },
];

const changeSignals = [
  { title: "Umsatz fällt leicht", detail: "‑2,3% vs. letzte Woche" },
  { title: "Traffic steigt", detail: "+18,9% durch Social Push" },
  { title: "Conversion sinkt", detail: "Checkout Drop-offs ab Schritt 2" },
  { title: "Social Media wächst", detail: "+31% Reichweite" },
];

const fallbackCauses = [
  "Paid spend erhöht, aber Landingpage-Bounce bleibt hoch.",
  "Mobile Checkout hat 14% Abbrüche wegen langsamer Ladezeit.",
  "Social Posts mit Use-Cases konvertieren 2,1x besser.",
];

const actions = [
  "3 neue Social Posts erstellen und terminieren",
  "E-Mail an Bestandskunden mit Angebot senden",
  "7-Tage Contentplan automatisch generieren",
];

const socialModule = {
  stats: [
    { label: "Reichweite", value: "1,2 Mio" },
    { label: "Follower", value: "184k" },
    { label: "Engagement", value: "7,8%" },
    { label: "Beste Plattform", value: "Instagram · Reels" },
  ],
  ideas: [
    "3 Reels zu Produkt-Use-Cases automatisch generieren",
    "LinkedIn Thought Leadership Post für CEO",
    "TikTok Trend-Remix mit eigenem Sound",
  ],
};

const emailModule = {
  stats: [
    { label: "Öffnungsrate", value: "42%" },
    { label: "Klickrate", value: "18%" },
    { label: "Conversion", value: "4,6%" },
    { label: "Letzte Kampagne", value: "Spring Drop" },
  ],
  suggestions: [
    "Reaktivierungsserie für Inaktive (3 Steps)",
    "VIP-Angebot an Top 5% Käufer heute 18:00",
    "Wöchentlicher Deal-Newsletter automatisieren",
  ],
};

const analyticsFindings = [
  { title: "Anomalie: Checkout LCP 3.2s", impact: "Hoch", action: "Bildkompression & CDN aktivieren" },
  { title: "Trend: Organischer Traffic +22%", impact: "Mittel", action: "SEO Playbook ausrollen" },
  { title: "Muster: CRM Nurture steigert AOV +9%", impact: "Hoch", action: "Sequenz auf Neukunden anwenden" },
];

const taskModule = [
  { title: "Checkout-Ladezeit <2.5s", owner: "Tech", due: "Heute", impact: "Hoch" },
  { title: "3 Instagram Reels generieren & planen", owner: "Marketing", due: "Heute", impact: "Hoch" },
  { title: "B2B Outreach Sequenz aktualisieren", owner: "Sales", due: "Diese Woche", impact: "Mittel" },
];

const securityBadges = [
  "DSGVO Ready",
  "SOC 2 in Arbeit",
  "End-to-End verschlüsselt",
  "Audit-Logs aktiv",
];

export default function Dashboard() {
  const { authHeader } = useAuth();
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    []
  );

  const [ctaState, setCtaState] = useState("idle"); // idle | busy | done
  const [postBusy, setPostBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [causeData, setCauseData] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/decision/causes", { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setCauseData(data.items || []);
      } catch (err) {
        console.error("Cause fetch failed", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authHeader]);

  const causeList = useMemo(() => {
    if (causeData.length > 0) {
      return causeData.slice(0, 4).map((item) => ({
        id: item.event_id,
        label: item.metric_label,
        text: item.summary,
        tone: item.direction === "down" ? "down" : "up",
        impact: item.top_causes?.[0]?.impact_level || "mittel",
      }));
    }
    return fallbackCauses.map((text, idx) => ({ id: idx, label: "Signal", text, tone: "neutral", impact: "mittel" }));
  }, [causeData]);

  function handleOneClick() {
    if (ctaState === "busy") return;
    setCtaState("busy");
    setTimeout(() => setCtaState("done"), 600);
    setTimeout(() => setCtaState("idle"), 2200);
  }

  function handlePost() {
    setPostBusy(true);
    setTimeout(() => setPostBusy(false), 1200);
  }

  function handleEmail() {
    setEmailBusy(true);
    setTimeout(() => setEmailBusy(false), 1400);
  }

  return (
    <div className="ceo-shell">
      <header className="ceo-hero">
        <div>
          <p className="eyebrow">So läuft dein Unternehmen heute</p>
          <h1>3-Sekunden-Überblick für CEOs</h1>
          <p className="sub">{today}</p>
        </div>
        <div className="hero-note">
          <span className="dot" />
          <span>Erkennen → Verstehen → Umsetzen in einem Flow.</span>
        </div>
      </header>

      {/* Bereich 1 – Status */}
      <section className="ceo-section kpi-section">
        <div className="section-title">Status des Unternehmens</div>
        <div className="kpi-grid">
          {kpiCards.map((kpi) => (
            <div key={kpi.label} className="kpi-card">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value}</div>
              <div className={`kpi-delta ${kpi.delta.startsWith("-") ? "down" : "up"}`}>
                {kpi.delta}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bereich 2 – Problem & Ursache */}
      <section className="ceo-section analysis-section">
        <div className="analysis-card">
          <div className="section-title">Was sich gerade verändert hat</div>
          <div className="change-list">
            {changeSignals.map((item) => (
              <div key={item.title} className="change-row">
                <span className="change-dot" />
                <div>
                  <div className="change-title">{item.title}</div>
                  <div className="change-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="analysis-card small">
          <div className="section-title">Warum das passiert</div>
          <ul className="cause-list">
            {causeList.map((c) => (
              <li key={c.id} style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: c.tone === "down" ? "#fee2e2" : c.tone === "up" ? "#dcfce7" : "#e5e7eb",
                      color: "#111827",
                      fontSize: "12px",
                      textTransform: "capitalize",
                    }}
                  >
                    {c.impact}
                  </span>
                  <span style={{ fontWeight: 700 }}>{c.label}</span>
                </div>
                <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>{c.text}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Bereich 3 – 1-Klick-Umsetzung */}
      <section className="ceo-section action-section">
        <div className="action-card">
          <div>
            <div className="section-title">Das solltest du jetzt tun</div>
            <div className="action-list">
              {actions.map((a) => (
                <div key={a} className="action-item">
                  <span className="bullet" />
                  {a}
                </div>
              ))}
            </div>
            <p className="action-sub">Automatisch vorbereitet: Drafts, Assets, Owner.</p>
          </div>
          <button className={`cta ${ctaState}`} onClick={handleOneClick}>
            {ctaState === "busy" && "Wird gestartet..."}
            {ctaState === "done" && "Gestartet ✅"}
            {ctaState === "idle" && "JETZT UMSETZEN (1 Klick)"}
          </button>
        </div>
      </section>

      <footer className="ceo-footer">
        <div className="foot-note">Mehr Tiefe? Öffne den Command Center für Live-Daten & Freigaben.</div>
        <a className="ghost-link" href="/ceo">Zum Command Center →</a>
      </footer>

      {/* Social Media Modul */}
      <section className="ceo-section grid-2">
        <div className="card luxe-card">
          <div className="section-title">Social Media — Autopilot</div>
          <div className="stat-row">
            {socialModule.stats.map((s) => (
              <div key={s.label} className="pill-stat">
                <div className="pill-label">{s.label}</div>
                <div className="pill-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="idea-list">
            {socialModule.ideas.map((idea) => (
              <div key={idea} className="idea-row">
                <span className="bullet" />
                {idea}
              </div>
            ))}
          </div>
          <div className="cta-row">
            <button className={`ghost-btn ${postBusy ? "busy" : ""}`} onClick={handlePost}>
              {postBusy ? "Erstellt..." : "POST AUTOMATISCH ERSTELLEN"}
            </button>
            <button className="mini-btn">Planen</button>
          </div>
        </div>

        {/* E-Mail Marketing Modul */}
        <div className="card luxe-card">
          <div className="section-title">E-Mail Marketing</div>
          <div className="stat-row">
            {emailModule.stats.map((s) => (
              <div key={s.label} className="pill-stat">
                <div className="pill-label">{s.label}</div>
                <div className="pill-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="idea-list">
            {emailModule.suggestions.map((item) => (
              <div key={item} className="idea-row">
                <span className="bullet" />
                {item}
              </div>
            ))}
          </div>
          <div className="cta-row">
            <button className={`ghost-btn ${emailBusy ? "busy" : ""}`} onClick={handleEmail}>
              {emailBusy ? "Wird gesendet..." : "JETZT SENDEN"}
            </button>
            <button className="mini-btn">Termin planen</button>
          </div>
        </div>
      </section>

      {/* Deep Analytics & Tasks */}
      <section className="ceo-section grid-2">
        <div className="card luxe-card">
          <div className="section-title">Deep Analytics & Insights</div>
          <div className="trend-bar">
            <div className="trend-label">Historie vs. Forecast</div>
            <div className="trend-line">
              <div className="trend-progress" />
            </div>
            <div className="trend-foot">Drill-Down & Parallax-Effekt beim Hover</div>
          </div>
          <div className="analytics-list">
            {analyticsFindings.map((f) => (
              <div key={f.title} className="analytics-row">
                <div>
                  <div className="change-title">{f.title}</div>
                  <div className="change-detail">{f.action}</div>
                </div>
                <span className="badge-impact">{f.impact}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card luxe-card">
          <div className="section-title">Automatisiertes Aufgaben-Management</div>
          <div className="task-list">
            {taskModule.map((t) => (
              <div key={t.title} className="task-row">
                <div>
                  <div className="change-title">{t.title}</div>
                  <div className="change-detail">{t.owner} · {t.due}</div>
                </div>
                <span className="badge-impact">{t.impact}</span>
              </div>
            ))}
          </div>
          <div className="cta-row">
            <button className="ghost-btn">Aufgaben bestätigen</button>
            <button className="mini-btn">Sync mit Team</button>
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="ceo-section">
        <div className="card luxe-card">
          <div className="section-title">Sicherheit & Compliance</div>
          <div className="badge-row">
            {securityBadges.map((b) => (
              <span key={b} className="security-badge">{b}</span>
            ))}
          </div>
          <p className="action-sub">Rollen & Rechte · Audit-Logs · Verschlüsselung ruhend & in Transit.</p>
        </div>
      </section>
    </div>
  );
}
