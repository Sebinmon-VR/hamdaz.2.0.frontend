"use client";

/**
 * Light / dark / follow-the-system, persisted per browser.
 *
 * Three states rather than two: "system" is the default and stamps no
 * attribute at all, which is what lets the prefers-color-scheme block in
 * globals.css do the work. Choosing light or dark stamps data-theme and wins
 * over the media query in both directions.
 *
 * The initial paint is handled by THEME_SCRIPT below, injected before the body
 * so the attribute is set before the first frame. Without it a dark-mode user
 * gets a white flash on every hard load.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "hamdaz-theme";

interface ThemeValue {
  choice: ThemeChoice;
  /** What is actually on screen once "system" is resolved. */
  resolved: "light" | "dark";
  setChoice: (choice: ThemeChoice) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(c==="light"||c==="dark"){document.documentElement.setAttribute("data-theme",c)}}catch(e){}})();`;

function systemIsDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at "system" on both server and client so hydration matches; the
  // effect below corrects it from localStorage on the client's first pass.
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: ThemeChoice = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      // Private mode, or storage disabled. "system" is a fine answer.
    }
    setChoiceState(stored);
    setResolved(stored === "system" ? (systemIsDark() ? "dark" : "light") : stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Only meaningful while following the system.
      setChoiceState((current) => {
        if (current === "system") setResolved(media.matches ? "dark" : "light");
        return current;
      });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    setResolved(next === "system" ? (systemIsDark() ? "dark" : "light") : next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice does not stop it applying now.
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === "dark" ? "light" : "dark");
  }, [resolved, setChoice]);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme used outside ThemeProvider");
  return value;
}
