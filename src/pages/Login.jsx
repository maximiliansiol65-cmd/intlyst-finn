import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const inputStyle = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#1d1d1f",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease",
  fontFamily: "inherit",
};

const btnStyle = (disabled) => ({
  width: "100%",
  padding: "13px 0",
  background: disabled ? "#e8e8ed" : "linear-gradient(135deg, #000000, #555555)",
  color: disabled ? "#86868b" : "#ffffff",
  border: "none",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "opacity 0.15s ease",
  fontFamily: "inherit",
});

function Label({ children }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: "#6e6e73", display: "block", marginBottom: 6 }}>
      {children}
    </label>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ background: "#fff1f0", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#ef4444", marginBottom: 16 }}>
      {msg}
    </div>
  );
}

function CodeInput({ digits, refs, onChange, onKeyDown, onPaste }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24 }}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={refs[idx]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => onChange(idx, e.target.value)}
          onKeyDown={e => onKeyDown(idx, e)}
          onPaste={idx === 0 ? onPaste : undefined}
          style={{
            width: 48, height: 58,
            textAlign: "center",
            fontSize: 22, fontWeight: 700,
            background: "#ffffff",
            border: `2px solid ${digit ? "#000000" : "#e2e8f0"}`,
            borderRadius: 10,
            color: "#1d1d1f",
            outline: "none",
            transition: "border-color 0.15s ease",
            fontFamily: "inherit",
          }}
          onFocus={e => { e.target.style.borderColor = "#000"; }}
          onBlur={e => { e.target.style.borderColor = digits[idx] ? "#000" : "#e2e8f0"; }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const [mode, setMode]   = useState("login"); // "login" | "register"
  const [step, setStep]   = useState(1);
  // step login:    1=email+password  2=verify-code
  // step register: 1=email           2=verify-code   3=set-password

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [password2,setPassword2]= useState("");
  const [name,     setName]     = useState("");
  const [codeDigits, setCodeDigits] = useState(["","","","","",""]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const codeRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const pendingLogin = useRef(null); // holds token+user after login credential check

  const { login } = useAuth();
  const navigate  = useNavigate();

  function resetCode() {
    setCodeDigits(["","","","","",""]);
    setTimeout(() => codeRefs[0].current?.focus(), 80);
  }

  function switchMode(m) {
    setMode(m);
    setStep(1);
    setError("");
    setEmail(""); setPassword(""); setPassword2(""); setName("");
    setCodeDigits(["","","","","",""]);
  }

  // ── Send verification code to email ──────────────────────────────────────
  async function sendCode(toEmail) {
    await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: toEmail }),
    }).catch(() => {});
  }

  // ── LOGIN: Step 1 – check credentials, then send code ────────────────────
  async function handleLoginStep1(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const form = new FormData();
      form.append("username", email);
      form.append("password", password);
      const res  = await fetch("/api/auth/login", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Falsche E-Mail oder Passwort."); }
      else {
        pendingLogin.current = data;
        await sendCode(data.email || email);
        setStep(2); resetCode();
      }
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── LOGIN: Step 2 – verify code → complete login ──────────────────────────
  async function handleLoginVerify() {
    const code = codeDigits.join("");
    if (code.length < 6) return;
    setLoading(true); setError("");
    try {
      const verifyEmail = pendingLogin.current?.email || email;
      const res  = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Falscher oder abgelaufener Code."); }
      else {
        const d = pendingLogin.current;
        login(d.access_token, {
          id: d.user_id, email: d.email, name: d.name,
          onboarding_done: d.onboarding_done,
          active_workspace_id: d.active_workspace_id,
        });
        navigate(d.onboarding_done ? "/" : "/onboarding");
      }
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── REGISTER: Step 1 – enter email, send code ─────────────────────────────
  async function handleRegisterStep1(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await sendCode(email);
      setStep(2); resetCode();
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── REGISTER: Step 2 – verify code ───────────────────────────────────────
  async function handleRegisterVerify() {
    const code = codeDigits.join("");
    if (code.length < 6) return;
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Falscher oder abgelaufener Code."); }
      else { setStep(3); }
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── REGISTER: Step 3 – set name+password, create account ─────────────────
  async function handleRegisterStep3(e) {
    e.preventDefault();
    if (password !== password2) { setError("Passwörter stimmen nicht überein."); return; }
    if (password.length < 8)    { setError("Passwort muss mindestens 8 Zeichen haben."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Registrierung fehlgeschlagen."); }
      else {
        login(data.access_token, {
          id: data.user_id, email: data.email, name: data.name,
          onboarding_done: data.onboarding_done,
          active_workspace_id: data.active_workspace_id,
        });
        navigate(data.onboarding_done ? "/" : "/onboarding");
      }
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── Code input handlers ───────────────────────────────────────────────────
  function handleCodeChange(idx, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...codeDigits];
    next[idx] = digit;
    setCodeDigits(next);
    if (digit && idx < 5) codeRefs[idx + 1].current?.focus();
  }

  function handleCodeKey(idx, e) {
    if (e.key === "Backspace" && !codeDigits[idx] && idx > 0) codeRefs[idx - 1].current?.focus();
    if (e.key === "Enter") mode === "login" ? handleLoginVerify() : handleRegisterVerify();
  }

  function handleCodePaste(e) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = [...text.split(""), ...Array(6).fill("")].slice(0, 6);
    setCodeDigits(next);
    codeRefs[Math.min(text.length, 5)].current?.focus();
    e.preventDefault();
  }

  // ── Demo login ────────────────────────────────────────────────────────────
  async function loginAsDemo() {
    setLoading(true); setError("");
    try {
      const seedRes  = await fetch("/api/auth/seed-demo-user", { method: "POST" });
      const seedData = await seedRes.json().catch(() => ({}));
      const demoEmail    = seedData.email    || "demo@bizlytics.de";
      const demoPassword = seedData.password || "demo1234";
      const form = new FormData();
      form.append("username", demoEmail);
      form.append("password", demoPassword);
      const res  = await fetch("/api/auth/login", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        const h = { Authorization: `Bearer ${data.access_token}` };
        await Promise.allSettled([
          fetch("/api/dev/seed-demo",       { method: "POST", headers: h }),
          fetch("/api/customers/seed-demo", { method: "POST", headers: h }),
          fetch("/api/abtests/seed-demo",   { method: "POST", headers: h }),
        ]);
        localStorage.setItem("intlyst_demo_seeded_v1", "1");
        login(data.access_token, {
          id: data.user_id, email: data.email, name: data.name,
          onboarding_done: data.onboarding_done,
          active_workspace_id: data.active_workspace_id,
        });
        navigate("/");
      } else { setError(data.detail || "Demo-Login fehlgeschlagen."); }
    } catch { setError("Verbindungsfehler – Backend läuft?"); }
    setLoading(false);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  const cardStyle = {
    background: "#ffffff", border: "1px solid #000000",
    borderRadius: 18, padding: "32px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
  };

  const focusIn  = e => { e.target.style.borderColor = "#000"; e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.06)"; };
  const focusOut = e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; };

  const stepLabel = mode === "login"
    ? ["Anmelden", "Code eingeben"][step - 1]
    : ["E-Mail bestätigen", "Code eingeben", "Passwort festlegen"][step - 1];

  const totalSteps = mode === "login" ? 2 : 3;

  return (
    <div style={{
      minHeight: "100vh", background: "#f5f5f7",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 32, fontWeight: 800, letterSpacing: "0.10em",
            background: "linear-gradient(135deg, #000000 0%, #888888 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>INTLYST</div>
          <div style={{ fontSize: 13, color: "#86868b", marginTop: 6 }}>Intelligente Business-Analyse</div>
        </div>

        <div style={cardStyle}>

          {/* Mode tabs — only on step 1 */}
          {step === 1 && (
            <div style={{ display: "flex", gap: 4, background: "#f5f5f7", borderRadius: 10, padding: 4, marginBottom: 28 }}>
              {[["login","Anmelden"],["register","Registrieren"]].map(([k,l]) => (
                <button key={k} onClick={() => switchMode(k)} style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600,
                  borderRadius: 7, border: "none", cursor: "pointer",
                  background: mode === k ? "#ffffff" : "transparent",
                  color: mode === k ? "#1d1d1f" : "#86868b",
                  boxShadow: mode === k ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                  transition: "all 0.18s ease", fontFamily: "inherit",
                }}>{l}</button>
              ))}
            </div>
          )}

          {/* Step indicator */}
          {step > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
              {Array.from({ length: totalSteps }, (_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 99,
                  background: i < step ? "#000000" : "#e2e8f0",
                  transition: "background 0.3s ease",
                }} />
              ))}
            </div>
          )}

          {/* ── LOGIN Step 1 ── */}
          {mode === "login" && step === 1 && (
            <form onSubmit={handleLoginStep1}>
              <div style={{ marginBottom: 16 }}>
                <Label>E-Mail</Label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="max@beispiel.de" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <Label>Passwort</Label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <ErrorBox msg={error} />
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Bitte warten…" : "Weiter"}
              </button>
            </form>
          )}

          {/* ── REGISTER Step 1 ── */}
          {mode === "register" && step === 1 && (
            <form onSubmit={handleRegisterStep1}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f", marginBottom: 4 }}>Konto erstellen</div>
                <div style={{ fontSize: 13, color: "#6e6e73", marginBottom: 20 }}>
                  Gib deine E-Mail-Adresse ein. Wir senden dir einen Bestätigungscode.
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <Label>E-Mail-Adresse</Label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="max@beispiel.de" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <ErrorBox msg={error} />
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Code wird gesendet…" : "Code senden"}
              </button>
            </form>
          )}

          {/* ── Step 2: Code eingeben (login + register) ── */}
          {step === 2 && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>✉️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>
                  Code eingeben
                </div>
                <div style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.6 }}>
                  Wir haben einen 6-stelligen Code an<br />
                  <strong style={{ color: "#1d1d1f" }}>{email}</strong> gesendet.
                </div>
              </div>

              <CodeInput
                digits={codeDigits} refs={codeRefs}
                onChange={handleCodeChange} onKeyDown={handleCodeKey} onPaste={handleCodePaste}
              />

              <ErrorBox msg={error} />

              <button
                onClick={mode === "login" ? handleLoginVerify : handleRegisterVerify}
                disabled={loading || codeDigits.join("").length < 6}
                style={btnStyle(loading || codeDigits.join("").length < 6)}
              >
                {loading ? "Bitte warten…" : "Bestätigen"}
              </button>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => { setStep(1); setError(""); }} style={{
                  background: "none", border: "none", fontSize: 12, color: "#86868b", cursor: "pointer", fontFamily: "inherit",
                }}>← Zurück</button>
                <button onClick={() => { resetCode(); sendCode(email); }} disabled={loading} style={{
                  background: "none", border: "none", fontSize: 12, color: "#86868b", cursor: "pointer", fontFamily: "inherit",
                }}>Code erneut senden</button>
              </div>
            </div>
          )}

          {/* ── REGISTER Step 3: Passwort + Name ── */}
          {mode === "register" && step === 3 && (
            <form onSubmit={handleRegisterStep3}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f", marginBottom: 4 }}>Fast geschafft!</div>
                <div style={{ fontSize: 13, color: "#6e6e73" }}>Lege deinen Namen und ein Passwort fest.</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label>Name</Label>
                <input value={name} onChange={e=>setName(e.target.value)}
                  placeholder="Max Mustermann" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label>Passwort</Label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <Label>Passwort wiederholen</Label>
                <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)}
                  placeholder="••••••••" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <ErrorBox msg={error} />
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Konto wird erstellt…" : "Konto erstellen"}
              </button>
            </form>
          )}

          {/* Demo link — only on login step 1 */}
          {mode === "login" && step === 1 && (
            <div style={{ marginTop: 18, textAlign: "center" }}>
              <div style={{ height: 1, background: "#f2f2f2", marginBottom: 16 }} />
              <button onClick={loginAsDemo} disabled={loading} style={{
                background: "none", border: "none", fontSize: 13,
                color: "#86868b", cursor: "pointer", fontFamily: "inherit",
              }}>Demo-Modus ausprobieren →</button>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#aeaeb2" }}>
          Deine Daten werden sicher verarbeitet.
        </div>
      </div>
    </div>
  );
}
