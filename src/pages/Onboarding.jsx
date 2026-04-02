import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  COMPANY_PROFILE_OPTIONS,
  COMPANY_PROFILE_STORAGE_KEY,
  getCompanyProfile,
  inferCompanyProfile,
} from "../config/companyProfiles";
import "../styles/onboarding-v3.css";

const STEP_COUNT = 7;

const industries = [
  "Software / SaaS",
  "E-Commerce",
  "Beratung",
  "Gesundheit",
  "Finanzen",
  "Fertigung",
  "Bildung",
  "Andere",
];

const goals = [
  { key: "umsatz", label: "Mehr Umsatz" },
  { key: "kunden", label: "Mehr Kunden" },
  { key: "traffic", label: "Mehr Traffic" },
  { key: "social", label: "Social Media verbessern" },
  { key: "effizienz", label: "Effizienter arbeiten" },
  { key: "automation", label: "Automatisierung aufbauen" },
];

const connectors = [
  { key: "traffic", title: "Website / Traffic", hint: "GA4, Matomo, Plausible" },
  { key: "social", title: "Social Media", hint: "LinkedIn, Instagram, X" },
  { key: "crm", title: "Kunden / CRM", hint: "HubSpot, Pipedrive" },
  { key: "revenue", title: "Umsatz / Shop", hint: "Shopify, Stripe" },
  { key: "csv", title: "CSV Upload", hint: "Schneller Start ohne Integration" },
];

const accentOptions = ["#0F9F6E", "#0071E3", "#E4572E", "#7C3AED", "#0EA5E9", "#F59E0B"];
const teamSizes = ["1–3", "4–10", "10+"];
const modes = ["Online", "Lokal", "Beides"];
const dashboardSizes = ["kompakt", "normal", "groß"];

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(1, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function lighten(hex, amount = 0.12) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.floor((num >> 16) + 255 * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0xff) + 255 * amount));
  const b = Math.min(255, Math.floor((num & 0xff) + 255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { authHeader, login, token, user } = useAuth();
  const { setTheme } = useTheme();

  const [step, setStep] = useState(0);
  const [timer, setTimer] = useState(60);

  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [mode, setMode] = useState("");
  const [team, setTeam] = useState("");
  const [country, setCountry] = useState("Deutschland");
  const [language, setLanguage] = useState("Deutsch");

  const [selectedGoals, setSelectedGoals] = useState([]);
  const [selectedConnectors, setSelectedConnectors] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(
    () => localStorage.getItem(COMPANY_PROFILE_STORAGE_KEY) || ""
  );

  const [accent, setAccent] = useState(
    localStorage.getItem("intlyst_accent") || accentOptions[0]
  );
  const [themeMode, setThemeMode] = useState(
    localStorage.getItem("intlyst-theme") || "light"
  );
  const [dashboardSize, setDashboardSize] = useState("normal");
  const [fontScale, setFontScale] = useState(100);

  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = setInterval(() => setTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const inferred = inferCompanyProfile({
      team,
      goals: selectedGoals,
      industry,
      mode,
    });
    setSelectedProfile((current) => current || inferred);
  }, [team, selectedGoals, industry, mode]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", `${accent}22`);
    document.documentElement.style.setProperty("--accent-strong", lighten(accent, 0.08));
    document.documentElement.style.setProperty("--c-primary", accent);
    document.documentElement.style.setProperty("--c-primary-hover", lighten(accent, 0.06));
    localStorage.setItem("intlyst_accent", accent);
  }, [accent]);

  useEffect(() => {
    setTheme(themeMode);
  }, [themeMode, setTheme]);

  useEffect(() => {
    if (step === 5) {
      setAnalyzing(true);
      setInsights([]);
      const t = setTimeout(() => {
        setAnalyzing(false);
        const profile = getCompanyProfile(selectedProfile || "management_ceo");
        setInsights([
          {
            title: "Größte Chance",
            text: profile.analysis.actions[0],
          },
          {
            title: "Größte Schwäche",
            text: `${profile.dashboard.warningLabel}: Wir blenden nur Risiken ein, die jetzt relevant sind.`,
          },
          {
            title: "Schneller Gewinn",
            text: profile.analysis.actions[1],
          },
        ]);
      }, 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selectedGoals, selectedProfile, step]);

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return company && industry && mode && team && country && language;
    if (step === 2) return selectedGoals.length > 0 && selectedProfile;
    if (step === 3) return true;
    if (step === 4) return true;
    if (step === 5) return !analyzing;
    return true;
  }, [step, company, industry, mode, team, country, language, selectedGoals, analyzing]);

  const progress = ((step + 1) / STEP_COUNT) * 100;

  const accentText = {
    primary: accent,
    soft: `${accent}18`,
  };
  const recommendedProfileId = inferCompanyProfile({ team, goals: selectedGoals, industry, mode });
  const selectedProfileConfig = getCompanyProfile(selectedProfile || recommendedProfileId);

  async function finish() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          company,
          industry,
          goals: selectedGoals,
          data_source: selectedConnectors[0] || "manual",
          meta: {
            mode,
            team,
            country,
            language,
            accent,
            themeMode,
            dashboardSize,
            fontScale,
            companyProfile: selectedProfileConfig.id,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "Fehler beim Speichern.");
      } else {
        localStorage.setItem("intlyst_onboarding_v3_done", "1");
        localStorage.setItem("intlyst-theme", themeMode);
        localStorage.setItem("intlyst_accent", accent);
        localStorage.setItem("intlyst_dashboard_size", dashboardSize);
        localStorage.setItem("intlyst_font_scale", String(fontScale));
        localStorage.setItem(COMPANY_PROFILE_STORAGE_KEY, selectedProfileConfig.id);
        localStorage.setItem("intlyst_dashboard_role", selectedProfileConfig.dashboardRole);

        login(token, {
          ...(user || {}),
          company,
          industry,
          company_profile: selectedProfileConfig.id,
          onboarding_done: true,
        }, null);

        navigate("/");
      }
    } catch (err) {
      console.error(err);
      setError("Verbindungsfehler.");
    }
    setSaving(false);
  }

  function goNext() {
    if (!canProceed) return;
    if (step < STEP_COUNT - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }

  function goBack() {
    if (step === 0) return;
    setStep((s) => Math.max(0, s - 1));
  }

  function toggleGoal(key) {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  }

  function toggleConnector(key) {
    setSelectedConnectors((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  const previewTheme = themeMode === "dark" ? "preview-dark" : "preview-light";

  return (
    <div className="onb-shell">
      <div className="onb-glow onb-glow-a" />
      <div className="onb-glow onb-glow-b" />

      <div className="onb-top">
        <div className="onb-brand">
          <div className="onb-dot" />
          Intlyst
        </div>
        <div className="onb-progress">
          <div className="onb-progress-label">
            Schritt {step + 1} / {STEP_COUNT}
          </div>
          <div className="onb-progress-bar">
            <div className="onb-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="onb-timer">
          <span>1-Minuten-Setup</span>
          <strong>{formatTimer(timer)}</strong>
        </div>
      </div>

      <div className="onb-layout">
        <div className="onb-card">
          {step === 0 && (
            <div className="onb-hero">
              <div className="onb-eyebrow">Willkommen</div>
              <h1>Richte dein Unternehmen in 1 Minute ein</h1>
              <p>
                Intlyst analysiert dein Unternehmen automatisch und zeigt dir sofort,
                was du verbessern kannst.
              </p>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-primary" onClick={goNext}>
                  Jetzt starten
                </button>
                <button className="onb-btn onb-btn-ghost" onClick={() => navigate("/")}>
                  Später
                </button>
              </div>
              <div className="onb-dots">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`dot ${i === 0 ? "active" : ""}`} />
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">Unternehmen</div>
                <h2>Erzähl uns kurz etwas über dein Unternehmen</h2>
              </div>
              <div className="onb-grid two">
                <div className="onb-field">
                  <label>Unternehmensname</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="z.B. Muster GmbH"
                  />
                </div>
                <div className="onb-field">
                  <label>Branche</label>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Bitte wählen</option>
                    {industries.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="onb-field">
                  <label>Online / Lokal / Beides</label>
                  <div className="onb-chips">
                    {modes.map((m) => (
                      <button
                        key={m}
                        className={`chip ${mode === m ? "active" : ""}`}
                        onClick={() => setMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="onb-field">
                  <label>Teamgröße</label>
                  <div className="onb-chips">
                    {teamSizes.map((size) => (
                      <button
                        key={size}
                        className={`chip ${team === size ? "active" : ""}`}
                        onClick={() => setTeam(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="onb-field">
                  <label>Land</label>
                  <input value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div className="onb-field">
                  <label>Sprache</label>
                  <input value={language} onChange={(e) => setLanguage(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">Ziele</div>
                <h2>Was möchtest du verbessern?</h2>
              </div>
              <div className="onb-grid three">
                {goals.map((goal) => {
                  const active = selectedGoals.includes(goal.key);
                  return (
                    <button
                      key={goal.key}
                      className={`onb-card-tile ${active ? "active" : ""}`}
                      onClick={() => toggleGoal(goal.key)}
                    >
                      <div className="tile-title">{goal.label}</div>
                      <div className="tile-sub">Sofort umsetzbare Maßnahmen</div>
                    </button>
                  );
                })}
              </div>
              <div className="onb-rail-card" style={{ marginTop: "var(--s-5)" }}>
                <div className="rail-title">Empfohlene Version</div>
                <p style={{ marginTop: 0 }}>
                  Automatisch erkannt: <strong>{getCompanyProfile(recommendedProfileId).label}</strong>.
                  Du kannst das bei Bedarf direkt bestaetigen oder anpassen.
                </p>
                <div className="onb-chips" style={{ marginTop: "var(--s-3)" }}>
                  {COMPANY_PROFILE_OPTIONS.map((profile) => (
                    <button
                      key={profile.id}
                      className={`chip ${selectedProfileConfig.id === profile.id ? "active" : ""}`}
                      onClick={() => setSelectedProfile(profile.id)}
                    >
                      {profile.label}
                    </button>
                  ))}
                </div>
                <div className="onb-subtle" style={{ marginTop: "var(--s-3)" }}>
                  {selectedProfileConfig.description}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">Daten</div>
                <h2>Verbinde deine Daten (optional, aber empfohlen)</h2>
                <p className="onb-subtle">Du kannst das auch später machen.</p>
              </div>
              <div className="onb-grid two">
                {connectors.map((c) => {
                  const active = selectedConnectors.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      className={`onb-card-tile connector ${active ? "active" : ""}`}
                      onClick={() => toggleConnector(c.key)}
                    >
                      <div>
                        <div className="tile-title">{c.title}</div>
                        <div className="tile-sub">{c.hint}</div>
                      </div>
                      <span className="chip mini">{active ? "Verbunden" : "Verbinden"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">Personalisierung</div>
                <h2>So soll deine App aussehen</h2>
              </div>
              <div className="onb-personalize">
                <div className="onb-controls">
                  <label>Temauswahl</label>
                  <div className="onb-chips">
                    {["light", "dark"].map((t) => (
                      <button
                        key={t}
                        className={`chip ${themeMode === t ? "active" : ""}`}
                        onClick={() => setThemeMode(t)}
                      >
                        {t === "light" ? "Hell" : "Dark"}
                      </button>
                    ))}
                  </div>

                  <label>Akzentfarbe</label>
                  <div className="accent-row">
                    {accentOptions.map((c) => (
                      <button
                        key={c}
                        className={`accent ${accent === c ? "active" : ""}`}
                        style={{ background: c }}
                        onClick={() => setAccent(c)}
                      />
                    ))}
                    <input
                      className="accent-input"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                    />
                  </div>

                  <label>Dashboard-Größe</label>
                  <div className="onb-chips">
                    {dashboardSizes.map((d) => (
                      <button
                        key={d}
                        className={`chip ${dashboardSize === d ? "active" : ""}`}
                        onClick={() => setDashboardSize(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  <label>Schriftgröße</label>
                  <div className="slider-row">
                    <input
                      type="range"
                      min="90"
                      max="110"
                      value={fontScale}
                      onChange={(e) => setFontScale(Number(e.target.value))}
                    />
                    <span>{fontScale}%</span>
                  </div>
                </div>

                <div className={`onb-preview ${previewTheme}`} style={{ fontSize: `${fontScale}%` }}>
                  <div className="preview-header">
                    <div className="badge">Live Preview</div>
                    <div className="pill" style={{ background: accentText.soft, color: accent }}>
                      {dashboardSize === "kompakt"
                        ? "Kompakt"
                        : dashboardSize === "groß"
                        ? "Detailreich"
                        : "Balance"}
                    </div>
                  </div>
                  <h4 style={{ color: accent }}>Intlyst KPI Snapshot</h4>
                  <div className="preview-grid">
                    <div className="preview-card">
                      <div className="label">Health Score</div>
                      <div className="value">82</div>
                      <div className="trend up">+6.4%</div>
                    </div>
                    <div className="preview-card">
                      <div className="label">Umsatz (30T)</div>
                      <div className="value">+€142k</div>
                      <div className="trend flat">Stabil</div>
                    </div>
                    <div className="preview-card wide">
                      <div className="label">Nächste Maßnahmen</div>
                      <ul>
                        <li>UX-Checkouts reduzieren Drop-offs</li>
                        <li>Social Proof Banner live schalten</li>
                        <li>CRM Nurture Sequenz aktivieren</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">KI-Moment</div>
                <h2>Deine erste Analyse wird erstellt…</h2>
              </div>
              {analyzing ? (
                <div className="onb-ai-loader">
                  <div className="ai-wave">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="ai-bar">
                    <div className="ai-bar-fill" />
                  </div>
                  <p>Wir lesen deine Ziele und erstellen die ersten Insights…</p>
                </div>
              ) : (
                <div className="onb-insights">
                  <h3>Erste Erkenntnisse über dein Unternehmen</h3>
                  <div className="onb-grid two">
                    {insights.map((i) => (
                      <div key={i.title} className="insight-card">
                        <div className="insight-label">{i.title}</div>
                        <div className="insight-text">{i.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="onb-section">
              <div className="onb-header">
                <div className="onb-eyebrow">CEO Moment</div>
                <h2>Das solltest du jetzt tun</h2>
              </div>
              <div className="onb-grid one">
                <div className="insight-card">
                  <div className="insight-label">1. Quick Win</div>
                  <div className="insight-text">
                    {selectedProfileConfig.analysis.actions[0]}.
                  </div>
                </div>
                <div className="insight-card">
                  <div className="insight-label">2. Wachstum</div>
                  <div className="insight-text">
                    {selectedProfileConfig.analysis.actions[1]}.
                  </div>
                </div>
                <div className="insight-card">
                  <div className="insight-label">3. Effizienz</div>
                  <div className="insight-text">
                    {selectedProfileConfig.analysis.actions[2]}.
                  </div>
                </div>
              </div>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-primary" onClick={finish} disabled={saving}>
                  {saving ? "Speichern..." : "Jetzt umsetzen (1 Klick)"}
                </button>
              </div>
              <div className="onb-subtle">Diese App ist dein intelligenter Business-Assistent.</div>
            </div>
          )}

          {error && <div className="onb-error">{error}</div>}
        </div>

        <div className="onb-rail">
          <div className="onb-rail-card">
            <div className="rail-title">Schneller, klarer, moderner</div>
            <p>
              Minimalistische Screens, viel Weißraum, sofortiger Mehrwert. Jeder Schritt
              dauert unter 30 Sekunden.
            </p>
            <div className="rail-list">
              <span>Vertrauen</span>
              <span>Klarheit</span>
              <span>Motivation</span>
              <span>Begeisterung</span>
              <span>Professionalität</span>
            </div>
          </div>
          <div className="onb-rail-card">
            <div className="rail-title">Fortschritt</div>
            <div className="rail-steps">
              {Array.from({ length: STEP_COUNT }).map((_, i) => (
                <div key={i} className={`rail-step ${i <= step ? "done" : ""}`} />
              ))}
            </div>
            <button className="onb-btn onb-btn-ghost" onClick={goBack} disabled={step === 0}>
              Zurück
            </button>
            <button className="onb-btn onb-btn-primary" onClick={goNext} disabled={!canProceed || saving}>
              {step === STEP_COUNT - 1 ? "Fertig" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
