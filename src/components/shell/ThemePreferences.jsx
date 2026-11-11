import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "knoux.theme";
const DEFAULT_THEME = "dark";

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* ignore */ }
  // Respect OS preference on first visit.
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(load);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const value = useMemo(() => ({
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext) || { theme: DEFAULT_THEME, setTheme: () => {}, toggle: () => {} };
}