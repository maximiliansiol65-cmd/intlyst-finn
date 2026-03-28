import { useState, useRef, useEffect, useCallback } from "react";

const MODE_CONFIG = {
  explain:  { color: "#06b6d4", label: "Erklärung",  icon: "?" },
  forecast: { color: "#f59e0b", label: "Prognose",   icon: "▲" },
  action:   { color: "#10b981", label: "Maßnahme",   icon: "→" },
  analysis: { color: "#6366f1", label: "Analyse",    icon: "◎" },
  auto:     { color: "#818cf8", label: "Assistent",  icon: "✦" },
};

const QUICK_QUESTIONS = [
  { text: "Warum ist der Umsatz gefallen?",      mode: "explain"  },
  { text: "Was soll ich heute priorisieren?",    mode: "action"   },
  { text: "Wie wird nächster Monat?",            mode: "forecast" },
  { text: "Wie ist meine Gesamtperformance?",    mode: "analysis" },
  { text: "Wo verliere ich am meisten Geld?",    mode: "explain"  },
  { text: "Was ist meine größte Chance?",        mode: "action"   },
];

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#6366f1",
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <span style={{ fontSize: 11, color: "#475569", marginLeft: 4 }}>
        Claude analysiert...
      </span>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const mode   = MODE_CONFIG[msg.mode_detected] || MODE_CONFIG.auto;

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 12,
    }}>
      {!isUser && (
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "#6366f120", border: "1px solid #6366f130",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#818cf8", flexShrink: 0,
          marginRight: 8, marginTop: 2,
        }}>
          ✦
        </div>
      )}

      <div style={{ maxWidth: "80%" }}>
        {!isUser && msg.mode_detected && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
            background: mode.color + "18", color: mode.color,
            textTransform: "uppercase", letterSpacing: "0.05em",
            marginBottom: 4,
          }}>
            {mode.icon} {mode.label}
          </div>
        )}

        <div style={{
          background: isUser ? "#6366f1" : "#e8e8ed",
          border: isUser ? "none" : "1px solid #1e1e2e",
          borderRadius: isUser
            ? "14px 14px 3px 14px"
            : "3px 14px 14px 14px",
          padding: "10px 14px",
          fontSize: 13,
          color: isUser ? "#fff" : "#374151",
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {msg.content}
        </div>

        <div style={{
          fontSize: 9, color: "#334155",
          marginTop: 3,
          textAlign: isUser ? "right" : "left",
        }}>
          {msg.time}
        </div>
      </div>
    </div>
  );
}

function FollowUpChips({ suggestions, onSelect }) {
  if (!suggestions?.length) return null;
  return (
    <div style={{ padding: "6px 14px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          style={{
            background: "transparent",
            border: "1px solid #1e1e2e",
            borderRadius: 20, padding: "4px 12px",
            fontSize: 11, fontWeight: 500,
            color: "#64748b", cursor: "pointer",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            e.target.style.borderColor = "#6366f1";
            e.target.style.color = "#818cf8";
          }}
          onMouseLeave={e => {
            e.target.style.borderColor = "#e8e8ed";
            e.target.style.color = "#64748b";
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function ChatWidget() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [unread, setUnread]       = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  function getTime() {
    return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput("");
    setFollowUps([]);

    const userMsg = {
      role: "user",
      content: msg,
      time: getTime(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, mode: "auto" }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();

      const assistantMsg = {
        role: "assistant",
        content: data.reply,
        mode_detected: data.mode_detected,
        time: getTime(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setFollowUps(data.follow_ups || []);

      if (!open) setUnread(prev => prev + 1);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Fehler beim Laden der Antwort. Bitte erneut versuchen.",
        time: getTime(),
      }]);
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    setMessages([]);
    setFollowUps([]);
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);    opacity: 0.8; }
          100% { transform: scale(1.35); opacity: 0; }
        }
      `}</style>

      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200 }}>

        {open && (
          <div style={{
            position: "absolute", bottom: 64, right: 0,
            width: 380, height: 520,
            background: "#ffffff",
            border: "1px solid #1e1e2e",
            borderRadius: 16,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            animation: "slideUp 0.2s ease-out",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          }}>

            {/* Header */}
            <div style={{
              padding: "13px 16px",
              borderBottom: "1px solid #1e1e2e",
              display: "flex", alignItems: "center", gap: 10,
              background: "#ffffff",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #818cf8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: "#fff", flexShrink: 0,
              }}>
                ✦
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1d1d1f" }}>
                  INTLYST KI
                </div>
                <div style={{ fontSize: 10, color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  Online · analysiert deine Daten
                </div>
              </div>
              <button
                onClick={clearChat}
                title="Chat leeren"
                style={{
                  background: "transparent", border: "none",
                  color: "#334155", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, padding: "3px 7px",
                  borderRadius: 5,
                }}
              >
                Leeren
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", border: "none",
                  color: "#334155", cursor: "pointer",
                  fontSize: 18, lineHeight: 1,
                  padding: "0 2px",
                }}
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: "auto",
              padding: "14px 14px 0",
              scrollbarWidth: "thin",
              scrollbarColor: "#1e1e2e transparent",
            }}>
              {isEmpty && (
                <div style={{ paddingBottom: 10 }}>
                  <div style={{
                    background: "#e8e8ed", border: "1px solid #1e1e2e",
                    borderRadius: "3px 14px 14px 14px",
                    padding: "12px 14px", marginBottom: 14,
                    fontSize: 13, color: "#94a3b8", lineHeight: 1.65,
                  }}>
                    Hallo! Ich bin dein KI-Business-Analyst. Ich habe Zugriff auf deine aktuellen KPIs, Ziele und Anomalien.
                    Frag mich was du wissen möchtest.
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Schnellfragen
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {QUICK_QUESTIONS.map((q, i) => {
                      const m = MODE_CONFIG[q.mode];
                      return (
                        <button
                          key={i}
                          onClick={() => send(q.text)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            background: "#f5f5f7",
                            border: "1px solid #1e1e2e",
                            borderRadius: 10, padding: "8px 12px",
                            fontSize: 12, color: "#94a3b8",
                            cursor: "pointer", textAlign: "left",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = m.color + "40";
                            e.currentTarget.style.color = "#374151";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = "#e8e8ed";
                            e.currentTarget.style.color = "#94a3b8";
                          }}
                        >
                          <span style={{ fontSize: 10, color: m.color, flexShrink: 0 }}>
                            {m.icon}
                          </span>
                          {q.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}

              {loading && (
                <div style={{ marginBottom: 12 }}>
                  <TypingIndicator />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {followUps.length > 0 && !loading && (
              <FollowUpChips
                suggestions={followUps}
                onSelect={text => send(text)}
              />
            )}

            {/* Input */}
            <div style={{
              padding: "10px 12px",
              borderTop: "1px solid #1e1e2e",
              display: "flex", gap: 8, alignItems: "flex-end",
              background: "#ffffff",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "36px";
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Frage stellen… (Enter zum Senden)"
                rows={1}
                style={{
                  flex: 1,
                  background: "#f5f5f7",
                  border: "1px solid #1e1e2e",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "#374151",
                  fontSize: 12,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  height: 36,
                  maxHeight: 100,
                  overflow: "hidden",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#6366f140"; }}
                onBlur={e => { e.target.style.borderColor = "#e8e8ed"; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 36, height: 36,
                  background: input.trim() && !loading ? "#6366f1" : "#e8e8ed",
                  border: "none", borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  flexShrink: 0,
                  transition: "all 0.15s",
                  fontSize: 14,
                  color: input.trim() && !loading ? "#fff" : "#334155",
                }}
              >
                ↑
              </button>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <div style={{ position: "relative" }}>
          {unread > 0 && !open && (
            <div style={{
              position: "absolute", inset: -4,
              borderRadius: "50%",
              border: "2px solid #6366f1",
              animation: "pulse-ring 1.5s ease-out infinite",
              pointerEvents: "none",
            }} />
          )}

          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: open ? "#e8e8ed" : "linear-gradient(135deg, #6366f1, #4f46e5)",
              border: open ? "1px solid #334155" : "none",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: open ? 20 : 18,
              color: "#fff",
              boxShadow: open ? "none" : "0 4px 24px rgba(99,102,241,0.45)",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {open ? "×" : "✦"}

            {unread > 0 && !open && (
              <div style={{
                position: "absolute", top: -2, right: -2,
                width: 18, height: 18, borderRadius: "50%",
                background: "#ef4444",
                fontSize: 9, fontWeight: 700, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #0a0a14",
              }}>
                {unread}
              </div>
            )}
          </button>
        </div>
      </div>
    </>
  );
}