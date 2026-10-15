/**
 * The companion: one of your agents, riding along with you through the app.
 *
 * It lives in the command bar of every screen (the dock). Drag it down onto
 * the page and it comes out and follows the pointer around; send it back by
 * clicking its empty spot in the bar or pressing Escape.
 *
 * State that React draws from — which agent, and whether it is docked — sits
 * in a tiny store here. Its position does not: that changes every frame and is
 * written straight to the DOM by the layer that draws it (components/agents/
 * Companion.tsx), so following the pointer never re-renders anything.
 *
 * Remembered per user in this browser, so a companion left out on the page is
 * still out after a reload. Every storage access is wrapped: blocked storage
 * only means it forgets.
 */

import { useSyncExternalStore } from "react";

export type CompanionMode = "docked" | "dragging" | "out" | "returning";

export interface CompanionState {
  mode: CompanionMode;
  /** The agent riding along. Null means "the newest one". */
  agentId: string | null;
}

const PREFIX = "hamdaz.companion.v1.";
const INITIAL: CompanionState = { mode: "docked", agentId: null };

let state: CompanionState = INITIAL;
let userId: string | null = null;
const listeners = new Set<() => void>();

/** Where it is drawn and where the pointer is, in viewport pixels. Not React state. */
export const motion = {
  x: 0,
  y: 0,
  pointerX: -1,
  pointerY: -1,
  /** Somewhere to sit instead of following — the corner of a box it is explaining. */
  anchor: null as { x: number; y: number } | null,
};

function persist() {
  if (!userId) return;
  try {
    const out = state.mode === "out" || state.mode === "dragging";
    window.localStorage.setItem(
      PREFIX + userId,
      JSON.stringify({ agentId: state.agentId, out, x: motion.x, y: motion.y }),
    );
  } catch {
    // Forgets on reload; nothing else to do.
  }
}

function set(patch: Partial<CompanionState>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCompanion(): CompanionState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** Read what this user left last time. Called once, by the layer, on mount. */
export function loadCompanion(forUser: string) {
  if (userId === forUser) return;
  userId = forUser;
  let saved: { agentId?: unknown; out?: unknown; x?: unknown; y?: unknown } = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(PREFIX + forUser) ?? "{}") ?? {};
  } catch {
    saved = {};
  }
  const out = saved.out === true && typeof saved.x === "number" && typeof saved.y === "number";
  if (out) {
    motion.x = Math.min(Math.max(saved.x as number, 24), window.innerWidth - 24);
    motion.y = Math.min(Math.max(saved.y as number, 24), window.innerHeight - 24);
  }
  state = {
    agentId: typeof saved.agentId === "string" ? saved.agentId : null,
    mode: out ? "out" : "docked",
  };
  listeners.forEach((fn) => fn());
}

export function setCompanionAgent(agentId: string) {
  set({ agentId });
}

export function setCompanionMode(mode: CompanionMode) {
  if (state.mode !== mode) set({ mode });
}

/** Remember where it stopped, without telling React — it is not drawn from this. */
export function saveCompanionPosition() {
  persist();
}

/* ── the dock ────────────────────────────────────────────────────────── */

/*
 * Every screen's command bar renders a dock, but only one screen is shown at a
 * time, so there is one dock element at most. The layer asks it where to fly
 * back to, and where the bar ends (letting go above that line docks it).
 */

let dock: HTMLElement | null = null;

/** `previous` on unmount: only clear the dock if it is still that one, not the next screen's. */
export function registerDock(el: HTMLElement | null, previous?: HTMLElement | null) {
  if (el === null && previous !== undefined && dock !== previous) return;
  dock = el;
}

export function dockRect(): DOMRect | null {
  return dock?.isConnected ? dock.getBoundingClientRect() : null;
}

/** The bottom edge of the command bar the dock sits in. */
export function dockZoneBottom(): number {
  const bar = dock?.closest("header");
  const rect = (bar ?? dock)?.getBoundingClientRect();
  return rect ? rect.bottom : 80;
}
