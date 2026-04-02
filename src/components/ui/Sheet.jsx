import { useEffect } from "react";

/**
 * Sheet — slides up from bottom with backdrop
 *
 * isOpen:  boolean
 * onClose: () => void
 * title:   string
 * children
 */
export function Sheet({ isOpen, onClose, title, children }) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {title && (
          <div className="sheet-header">
            <span className="sheet-title">{title}</span>
            <button
              onClick={onClose}
              className="btn-icon"
              aria-label="Schließen"
              style={{ fontSize: "20px", color: "var(--c-text-3)" }}
            >×</button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

export default Sheet;
