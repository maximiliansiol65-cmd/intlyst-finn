/* eslint-disable */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const SUGGESTIONS = [
  "Wie war die Performance diese Woche?",
  "Was soll ich heute tun?",
  "Warum sinkt mein Umsatz?",
  "Was ist mein größter Hebel?",
];

const IcoClose = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IcoSend = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M14 2L2 7l4 2 2 5 6-12z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);

export default function ChatPanel({ isOpen, onClose }) {
  const { authHeader } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 320);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  async function send(text) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      const reply = data?.reply ?? data?.message ?? data?.content ?? "Keine Antwort erhalten.";
      const sources = data?.data_used ?? [];
      setMessages(prev => [...prev, { role: "assistant", content: reply, sources }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Verbindungsfehler. Bitte überprüfe die Serververbindung.",
        sources: [],
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="chat-backdrop" onClick={onClose} aria-hidden="true" />

      <aside
        className="chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label="KI-Assistent"
      >
        {/* Header */}
        <div className="chat-header">
          <div>
            <div className="chat-header-title">✦ INTLYST AI</div>
            <div className="chat-header-sub">
              <span className="pulse-dot" aria-hidden="true" />
              Verbunden mit deinen Daten
            </div>
          </div>
          <button
            className="topnav-icon-btn"
            onClick={onClose}
            aria-label="Chat schließen"
          >
            <IcoClose />
          </button>
        </div>

        {/* Messages or empty state */}
        {messages.length === 0 && !loading ? (
          <div className="chat-empty">
            <div style={{ fontSize: 40, lineHeight: 1, color: "var(--c-text-4)" }}>✦</div>
            <div style={{ fontSize: "var(--text-md)", color: "var(--c-text-2)", fontWeight: 500 }}>
              Stell mir eine Frage zu deinen Daten
            </div>
            <div className="chat-suggestion-pills">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="chat-suggestion-pill" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages" aria-live="polite">
            {messages.map((m, i) => (
              m.role === "user" ? (
                <div key={i} className="chat-msg-user">{m.content}</div>
              ) : (
                <div key={i}>
                  <div className="chat-msg-ai">{m.content}</div>
                  {m.sources?.length > 0 && (
                    <div className="chat-msg-chips">
                      {m.sources.slice(0, 4).map((s, j) => (
                        <span key={j} className="chat-chip">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            ))}
            {loading && (
              <div className="typing-indicator" aria-label="INTLYST AI schreibt">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder="Frag INTLYST AI…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            aria-label="Nachricht eingeben"
          />
          <button
            className={`chat-send-btn${input.trim() ? " active" : ""}`}
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            aria-label="Senden"
          >
            <IcoSend />
          </button>
        </div>
      </aside>
    </>
  );
}
