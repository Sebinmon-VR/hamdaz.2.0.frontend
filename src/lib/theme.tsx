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
  {
    id: "mono",
    name: "Black and white",
    blurb: "No colour at all. The data is the only thing on screen with a hue.",
    // Shown on the swatch. The real accents flip with the mode — see the
    // mono blocks in globals.css for why one value cannot serve both.
    accent: "#f2f2f5",
    second: "#6a6a76",
  },
  {
    id: "custom",
    name: "Custom",
    blurb: "Your own two colours, and the background behind them.",
    accent: "#7c6cff",
    second: "#ff9f43",
  },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];
export type ModeChoice = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

const PALETTE_KEY = "hamdaz-palette";
const MODE_KEY = "hamdaz-mode";
const DEFAULT_PALETTE: PaletteId = "electric";
const CUSTOM_KEY = "hamdaz-custom";

interface ThemeValue {
  palette: PaletteId;
  setPalette: (id: PaletteId) => void;
  /** What the person picked — may be "system". */
  mode: ModeChoice;
  setMode: (mode: ModeChoice) => void;
  /** What is actually on screen once "system" is resolved. */
  resolved: Resolved;
  toggle: () => void;
  /** The colours behind the "custom" palette, and the shared background. */
  custom: CustomTheme;
  setCustom: (next: CustomTheme) => void;
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
if(!/^(electric|magenta|acid|ember|mono|custom)$/.test(p))p=${JSON.stringify(DEFAULT_PALETTE)};
var m=localStorage.getItem(${JSON.stringify(MODE_KEY)})||"system";
if(m!=="light"&&m!=="dark")m=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
d.setAttribute("data-palette",p);d.setAttribute("data-theme",m);
/* Custom colours are inline variables, so they must be stamped here too —
   otherwise a custom theme shows one frame of the default accent on every
   hard load, which is the exact flash this script exists to prevent. */
var c=JSON.parse(localStorage.getItem(${JSON.stringify(CUSTOM_KEY)})||"{}");
var hex=/^#[0-9a-fA-F]{6}$/;
function ink(h){var n=parseInt(h.slice(1),16),f=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
return 0.2126*f(n>>16&255)+0.7152*f(n>>8&255)+0.0722*f(n&255)>0.42?"#0a0a0e":"#ffffff"}
if(p==="custom"&&hex.test(c.accent||"")&&hex.test(c.second||"")){
d.style.setProperty("--accent",c.accent);
d.style.setProperty("--accent-hover","color-mix(in oklab, "+c.accent+" 82%, #ffffff)");
d.style.setProperty("--on-accent",ink(c.accent));
d.style.setProperty("--second",c.second);
d.style.setProperty("--on-second",ink(c.second));}
if(hex.test(c.background||"")){
d.style.setProperty("--app",c.background);
d.style.setProperty("--bezel","color-mix(in oklab, "+c.background+" 86%, #000000)");}
if(c.image){var dim=Math.min(95,Math.max(0,typeof c.imageDim==="number"?c.imageDim:72));
var w="color-mix(in srgb, var(--app) "+dim+"%, transparent)";
d.style.setProperty("--app-image",'url("'+String(c.image).replace(/"/g,'\\"')+'")');
d.style.setProperty("--app-scrim","linear-gradient("+w+", "+w+")");
d.style.setProperty("--app-image-size",c.imageFit==="tile"?"auto":(c.imageFit||"cover"));
d.style.setProperty("--app-image-repeat",c.imageFit==="tile"?"repeat":"no-repeat");}
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
  const [custom, setCustomState] = useState<CustomTheme>(DEFAULT_CUSTOM);

  useEffect(() => {
    let storedPalette: PaletteId = DEFAULT_PALETTE;
    let storedMode: ModeChoice = "system";
    try {
      const p = localStorage.getItem(PALETTE_KEY);
      if (PALETTES.some((entry) => entry.id === p)) storedPalette = p as PaletteId;
      const m = localStorage.getItem(MODE_KEY);
      if (m === "light" || m === "dark" || m === "system") storedMode = m;
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomTheme>;
        const restored: CustomTheme = {
          accent: isHex(parsed.accent ?? "") ? parsed.accent! : DEFAULT_CUSTOM.accent,
          second: isHex(parsed.second ?? "") ? parsed.second! : DEFAULT_CUSTOM.second,
          background: isHex(parsed.background ?? "") ? parsed.background! : "",
          image: typeof parsed.image === "string" ? parsed.image : "",
          imageFit:
            parsed.imageFit === "contain" || parsed.imageFit === "tile"
              ? parsed.imageFit
              : "cover",
          imageDim:
            typeof parsed.imageDim === "number" ? parsed.imageDim : DEFAULT_CUSTOM.imageDim,
        };
        setCustomState(restored);
        // The pre-paint script already stamped these; re-applying keeps React
        // and the DOM agreeing after a palette change later in the session.
        applyCustom(restored, storedPalette === "custom");
      }
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

  const setPalette = useCallback(
    (id: PaletteId) => {
      setPaletteState(id);
      document.documentElement.setAttribute("data-palette", id);
      // Leaving "custom" has to clear the inline variables, or they would
      // outrank the palette just chosen and nothing would appear to change.
      applyCustom(custom, id === "custom");
      try {
        localStorage.setItem(PALETTE_KEY, id);
      } catch {
        // Not being able to remember it does not stop it applying now.
      }
    },
    [custom],
  );

  const setCustom = useCallback(
    (next: CustomTheme) => {
      setCustomState(next);
      applyCustom(next, palette === "custom");
      try {
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
      } catch {
        // As above.
      }
    },
    [palette],
  );

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
      value={{ palette, setPalette, mode, setMode, resolved, toggle, custom, setCustom }}
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

/**
 * A colour someone typed, and the ink that stays legible on it.
 *
 * `--on-accent` is the one value a custom palette cannot be allowed to get
 * wrong: it is the text on every filled button, and a shipped palette hand-picks
 * it. Derived here from relative luminance instead, because the alternative is
 * asking somebody to choose their own button text colour, which nobody wants to
 * be asked.
 */
export function readableInk(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return "#0a0a0e";
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255);
  return luminance > 0.42 ? "#0a0a0e" : "#ffffff";
}

/** Nudged towards white so a hover is visibly lighter without a second picker. */
function lighten(hex: string): string {
  return `color-mix(in oklab, ${hex} 82%, #ffffff)`;
}

export const isHex = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value.trim());

/**
 * Everything a custom theme lets somebody set.
 *
 * Deliberately three values and not thirty. The shipped palettes each tune
 * eleven neutrals by hand against their accent; exposing that would be handing
 * people a job they did not ask for and a hundred ways to make the app
 * unreadable. Accent, second, and the ground behind it all — the three that
 * change how the app *feels* — are enough, and the neutral surfaces stay on a
 * grey that works with any of them.
 */
export interface CustomTheme {
  accent: string;
  second: string;
  /** The app's ground colour. Empty means the palette's own. */
  background: string;
  /** A picture behind the app: an http(s) URL, or a data URL from a file. */
  image: string;
  imageFit: ImageFit;
  /**
   * How much of the ground colour is washed over the image, 0–95.
   *
   * Not decoration. Panels are near-solid but the rail and the tab strip are
   * not, and a photograph directly behind them turns text into noise. The
   * default is heavy for that reason — it can be taken down, but it starts
   * somewhere legible.
   */
  imageDim: number;
}

export type ImageFit = "cover" | "contain" | "tile";

/** Bigger than this and localStorage refuses the write, silently. */
export const MAX_IMAGE_BYTES = 2_000_000;

export const DEFAULT_CUSTOM: CustomTheme = {
  accent: "#7c6cff",
  second: "#ff9f43",
  background: "",
  image: "",
  imageFit: "cover",
  imageDim: 72,
};

/** Applied as inline variables, which beat the stylesheet's palette blocks. */
export function applyCustom(custom: CustomTheme, active: boolean): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--accent": custom.accent,
    "--accent-hover": lighten(custom.accent),
    "--on-accent": readableInk(custom.accent),
    "--second": custom.second,
    "--on-second": readableInk(custom.second),
  };
  for (const [name, value] of Object.entries(vars)) {
    if (active && isHex(custom.accent) && isHex(custom.second)) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  // The ground is independent of the palette: somebody may want the shipped
  // Electric accents on a background of their own, so it applies either way.
  if (isHex(custom.background)) {
    root.style.setProperty("--app", custom.background);
    root.style.setProperty("--bezel", `color-mix(in oklab, ${custom.background} 86%, #000000)`);
  } else {
    root.style.removeProperty("--app");
    root.style.removeProperty("--bezel");
  }

  if (custom.image) {
    const dim = Math.min(95, Math.max(0, custom.imageDim));
    const wash = `color-mix(in srgb, var(--app) ${dim}%, transparent)`;
    root.style.setProperty("--app-image", `url("${custom.image.replace(/"/g, '\\"')}")`);
    root.style.setProperty("--app-scrim", `linear-gradient(${wash}, ${wash})`);
    root.style.setProperty(
      "--app-image-size",
      custom.imageFit === "tile" ? "auto" : custom.imageFit,
    );
    root.style.setProperty(
      "--app-image-repeat",
      custom.imageFit === "tile" ? "repeat" : "no-repeat",
    );
  } else {
    for (const name of ["--app-image", "--app-scrim", "--app-image-size", "--app-image-repeat"]) {
      root.style.removeProperty(name);
    }
  }
}
