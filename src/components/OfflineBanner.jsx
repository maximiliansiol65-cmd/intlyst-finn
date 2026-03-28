/* eslint-disable */
import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setOffline(true);
      setBackOnline(false);
    }
    function handleOnline() {
      setOffline(false);
      setBackOnline(true);
      setTimeout(() => setBackOnline(false), 3500);
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline && !backOnline) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "var(--nav-height)",
        left: 0, right: 0,
        zIndex: 500,
        background: offline ? "var(--c-warning)" : "var(--c-success)",
        color: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 16px",
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        boxShadow: "var(--shadow-md)",
        animation: "slideDown var(--dur-base) var(--ease-out) both",
      }}
      role="status"
      aria-live="polite"
    >
      {offline ? (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Offline — Daten werden aktualisiert sobald Verbindung besteht
        </>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Verbindung wiederhergestellt ✓
        </>
      )}
    </div>
  );
}
