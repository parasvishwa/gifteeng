"use client";

/**
 * Gifteeng Theme System
 *
 * Three modes:
 *   light  → :root  (warm white, elegant)
 *   dark   → .dark-premium  (CRED-style deep navy, gold accents)
 *   system → follows OS prefers-color-scheme
 *
 * Stored in localStorage("gifteeng.theme").
 * Class applied to <html> so all CSS variables cascade.
 *
 * Usage:
 *   const { theme, setTheme, resolved } = useTheme();
 *   setTheme("dark"); // → immediately applies dark-premium class
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeCtx {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (t: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "light", resolved: "light", setTheme: () => {} });

const KEY = "gifteeng.theme";

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyToRoot(mode: ThemeMode) {
  const root = document.documentElement;
  const isDark = mode === "dark" || (mode === "system" && getSystemDark());
  root.classList.remove("dark", "dark-premium");
  if (isDark) root.classList.add("dark-premium");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  const calcResolved = useCallback((mode: ThemeMode): ResolvedTheme => {
    return mode === "dark" || (mode === "system" && getSystemDark()) ? "dark" : "light";
  }, []);

  // Bootstrap from localStorage on mount
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "light";
    setThemeState(saved);
    setResolved(calcResolved(saved));
    applyToRoot(saved);
  }, [calcResolved]);

  // Watch OS preference when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyToRoot("system");
      setResolved(calcResolved("system"));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, calcResolved]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(KEY, mode);
    setThemeState(mode);
    setResolved(calcResolved(mode));
    applyToRoot(mode);
  }, [calcResolved]);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
