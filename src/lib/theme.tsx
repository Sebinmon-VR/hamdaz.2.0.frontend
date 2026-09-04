"use client";

/**
 * Colour theme: an accent palette and a light/dark mode, chosen per person.
 *
 * Both are stamped on <html> as data-palette and data-theme; globals.css does
 * the rest. "System" is resolved to a concrete dark or light here rather than
 * in CSS — otherwise every one of the eight palette/mode blocks would need a
 * prefers-color-scheme duplicate, and the stylesheet would double for nothing.
 *
 * The choice is per browser, not per account. The backend has no place to keep
 * it (there is no user-preferences endpoint), and it is the kind of setting
 * that genuinely differs between someone's laptop and the shared machine in
 * the workshop, so localStorage is the right home rather than a compromise.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const PALETTES = [
  {
    id: "electric",
    name: "Electric",
    blurb: "The Hamdaz blue at full strength. Cold and technical.",
    accent: "#4fd8ff",
    second: "#ff4fa3",
  },
  {
    id: "magenta",
    name: "Magenta",
    blurb: "The brand pink leads, blue supports. Warmer, more distinctive.",
    accent: "#ff3d8f",
    second: "#4fd8ff",
  },
  {
    id: "acid",
    name: "Acid",
    blurb: "Maximum punch on black, and it leaves blue and pink free to mean things.",
    accent: "#cbfb45",
    second: "#ef4896",
  },
  {
    id: "ember",
    name: "Ember",
    blurb: "Warm amber. Reads closer to a trading terminal than a dashboard.",
    accent: "#ffab2e",
    second: "#ef4896",
  },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];
export type ModeChoice = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

const PALETTE_KEY = "hamdaz-palette";
const MODE_KEY = "hamdaz-mode";
const DEFAULT_PALETTE: PaletteId = "electric";

interface ThemeValue {
  palette: PaletteId;
  setPalette: (id: PaletteId) => void;
  /** What the person picked — may be "system". */
  mode: ModeChoice;
  setMode: (mode: ModeChoice) => void;
  /** What is actually on screen once "system" is resolved. */
  resolved: Resolved;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Runs before the first paint, inlined in the document head. Without it a
 * dark-mode viewer gets a white flash, and everyone gets a frame of the wrong
 * accent, on every hard load.
 */
export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement;
var p=localStorage.getItem(${JSON.stringify(PALETTE_KEY)})||${JSON.stringify(DEFAULT_PALETTE)};
if(!/^(electric|magenta|acid|ember)$/.test(p))p=${JSON.stringify(DEFAULT_PALETTE)};
var m=localStorage.getItem(${JSON.stringify(MODE_KEY)})||"system";
if(m!=="light"&&m!=="dark")m=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
d.setAttribute("data-palette",p);d.setAttribute("data-theme",m);
}catch(e){
document.documentElement.setAttribute("data-palette",${JSON.stringify(DEFAULT_PALETTE)});
document.documentElement.setAttribute("data-theme","dark");
}})();`;

function systemMode(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server and first client render must agree, so both start at the defaults;
  // the effect below reconciles with what the pre-paint script already applied.
  const [palette, setPaletteState] = useState<PaletteId>(DEFAULT_PALETTE);
  const [mode, setModeState] = useState<ModeChoice>("system");
  const [resolved, setResolved] = useState<Resolved>("dark");

  useEffect(() => {
    let storedPalette: PaletteId = DEFAULT_PALETTE;
    let storedMode: ModeChoice = "system";
    try {
      const p = localStorage.getItem(PALETTE_KEY);
      if (PALETTES.some((entry) => entry.id === p)) storedPalette = p as PaletteId;
      const m = localStorage.getItem(MODE_KEY);
      if (m === "light" || m === "dark" || m === "system") storedMode = m;
    } catch {
      // Private mode, or storage disabled. The defaults are a fine answer.
    }
    setPaletteState(storedPalette);
    setModeState(storedMode);
    setResolved(storedMode === "system" ? systemMode() : storedMode);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      // Only meaningful while following the system.
      setModeState((current) => {
        if (current === "system") {
          const next = systemMode();
          setResolved(next);
          document.documentElement.setAttribute("data-theme", next);
        }
        return current;
      });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setPalette = useCallback((id: PaletteId) => {
    setPaletteState(id);
    document.documentElement.setAttribute("data-palette", id);
    try {
      localStorage.setItem(PALETTE_KEY, id);
    } catch {
      // Not being able to remember it does not stop it applying now.
    }
  }, []);

  const setMode = useCallback((next: ModeChoice) => {
    setModeState(next);
    const applied = next === "system" ? systemMode() : next;
    setResolved(applied);
    document.documentElement.setAttribute("data-theme", applied);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // As above.
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  return (
    <ThemeContext.Provider
      value={{ palette, setPalette, mode, setMode, resolved, toggle }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme used outside ThemeProvider");
  return value;
}
