import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

const STORAGE_KEY = "intlyst-theme"; // "light" | "dark" | "system"

function readStoredTheme() {
  if (typeof window === "undefined") return "system";
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
}

function getThemeMediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia("(prefers-color-scheme: dark)");
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage restrictions in private/test environments
    }

    function apply() {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const mediaQuery = getThemeMediaQuery();
      const prefersDark = Boolean(mediaQuery?.matches);
      const isDark = theme === "dark" || (theme === "system" && prefersDark);
      root.setAttribute("data-theme", isDark ? "dark" : "light");
      root.style.colorScheme = isDark ? "dark" : "light";
    }

    apply();

    // Re-apply when OS setting changes (only relevant in "system" mode)
    const mediaQuery = getThemeMediaQuery();
    if (!mediaQuery) return undefined;

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", apply);
      return () => mediaQuery.removeEventListener("change", apply);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(apply);
      return () => mediaQuery.removeListener(apply);
    }

    return undefined;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
