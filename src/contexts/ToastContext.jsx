import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

function ToastItem({ toast, onRemove }) {
  const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
  return (
    <div className={`toast toast-${toast.type}`} role="alert">
      <div className="toast-icon">{icons[toast.type] ?? "i"}</div>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--c-text-3)", fontSize: "16px", lineHeight: 1,
          padding: "0 0 0 8px", flexShrink: 0,
        }}
        aria-label="Schließen"
      >×</button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info", duration = 3500) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, dur) => addToast(msg, "success", dur),
    error:   (msg, dur) => addToast(msg, "error",   dur),
    warning: (msg, dur) => addToast(msg, "warning", dur),
    info:    (msg, dur) => addToast(msg, "info",    dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast muss innerhalb von ToastProvider verwendet werden.");
  return ctx;
}
