"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, PawPrint, SquareDashedMousePointer } from "lucide-react";
import { useAgents, useRecentRuns, type Agent } from "@/lib/agents";
import {
  dockRect,
  dockZoneBottom,
  loadCompanion,
  motion,
  registerDock,
  saveCompanionPosition,
  setCompanionMode,
  useCompanion,
} from "@/lib/companion";
import { useMaybeSession } from "@/lib/session";
import { AgentAvatar, repaintFollowers } from "@/components/agents/AgentAvatar";
import { CompanionGuide } from "@/components/agents/CompanionGuide";
import { CompanionLook, START_ASK, START_LOOK } from "@/components/agents/CompanionLook";

/**
 * The companion, in two pieces.
 *
 * `CompanionDock` sits in every screen's command bar. Docked, it is the agent
 * itself: click to open it, or drag it down onto the page to let it out. Out,
 * the dock is an empty spot — click it (or press Escape) and the agent flies
 * home.
 *
 * `CompanionLayer` is mounted once in the shell, above every screen, so an
 * agent let out stays out as you move between pages. It trails the pointer
 * with a little lag, leans into its own movement, hops while it travels, and
 * never takes a click: it is drawn with pointer-events off, so it can sit on
 * top of a button without being in the way.
 */

const SIZE = 52;
/** Where it trails behind the pointer: below and to the right of it. */
const TRAIL = { x: 30, y: 34 };
const DRAG_START = 5;

/** The agent riding along: the one chosen, else the newest. */
function useCompanionAgent(): Agent | null {
  const session = useMaybeSession();
  const { agents } = useAgents(session?.user.id ?? "");
  const { agentId } = useCompanion();
  if (!session) return null;
  return agents.find((a) => a.id === agentId) ?? agents[0] ?? null;
}

/* ── the dock, in the command bar ────────────────────────────────────── */

export function CompanionDock() {
  const agent = useCompanionAgent();
  const { mode } = useCompanion();
  const router = useRouter();
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  // Runs waiting for an answer: a badge on the agent, wherever you are.
  const recent = useRecentRuns(Boolean(agent));
  const waiting = (recent.data ?? []).filter((r) => r.status === "waiting");

  useEffect(() => {
    const el = ref.current;
    registerDock(el);
    return () => registerDock(null, el);
  }, [agent?.id, mode]);

  if (!agent) return null;
  const name = agent.name.trim() || "your agent";
  const badge = waiting.length > 0 && (
    <Link
      href={`/agents/${waiting[0].agent_id}?run=${waiting[0].id}`}
      title={`${waiting.length} run${waiting.length === 1 ? "" : "s"} waiting for your answer`}
      aria-label={`${waiting.length} run${waiting.length === 1 ? "" : "s"} waiting for your answer`}
      onPointerDown={(e) => e.stopPropagation()}
      className="tnum absolute -right-1 -top-1 z-10 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-panel"
    >
      {waiting.length}
    </Link>
  );

  /** Out of the bar, with the bubble open: a click on the agent means "I want help". */
  function popOutAndAsk() {
    const rect = dockRect();
    motion.x = rect ? rect.left + rect.width / 2 : window.innerWidth - 80;
    motion.y = rect ? rect.top + rect.height / 2 + 60 : 120;
    setHover(false);
    setCompanionMode("out");
    saveCompanionPosition();
    // The bubble lives in the layer, which mounts once the agent is out.
    setTimeout(() => window.dispatchEvent(new Event(START_ASK)), 80);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0 || !agent) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const move = (ev: PointerEvent) => {
      motion.pointerX = ev.clientX;
      motion.pointerY = ev.clientY;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_START) {
        dragging = true;
        // Lift off from where it sits, so it is seen leaving the bar.
        const rect = dockRect();
        motion.x = rect ? rect.left + rect.width / 2 : startX;
        motion.y = rect ? rect.top + rect.height / 2 : startY;
        setHover(false);
        setCompanionMode("dragging");
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) {
        if (ev.type === "pointerup") popOutAndAsk();
        return;
      }
      // Let go over the bar and it goes home; anywhere below, it stays out.
      if (ev.clientY < dockZoneBottom() + 12) {
        setCompanionMode("returning");
      } else {
        setCompanionMode("out");
        saveCompanionPosition();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  if (mode !== "docked") {
    return (
      <span ref={ref} className="relative flex h-10 shrink-0 items-center gap-1">
        {badge}
        {/* Out on the page, it can be asked anything, or about any part of it. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(START_ASK))}
          aria-label={`Ask ${name}`}
          title={`Ask ${name} anything — or “how do I…” and it will show you`}
          className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink transition hover:bg-accent-hover"
        >
          <MessageCircleQuestion className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(START_LOOK))}
          aria-label={`Ask ${name} about part of the screen`}
          title={`Ask ${name} about part of the screen (or hold Alt and drag)`}
          className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent-text transition hover:bg-accent hover:text-accent-ink"
        >
          <SquareDashedMousePointer className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setCompanionMode("returning")}
          aria-label={`Call ${name} back`}
          title={`Call ${name} back (Esc)`}
          className="grid size-9 place-items-center rounded-full border-2 border-dashed border-line-strong text-ink-4 transition hover:border-accent hover:text-accent-text"
        >
          <PawPrint className="size-3.5" strokeWidth={2.2} />
        </button>
      </span>
    );
  }

  return (
    <span ref={ref} className="relative grid size-10 shrink-0 place-items-center">
      {badge}
      <button
        type="button"
        onPointerDown={onPointerDown}
        // Keyboard only: a pointer press is handled on release, above, so a
        // drag does not also count as a click.
        onClick={(e) => {
          if (e.detail === 0) popOutAndAsk();
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={`Ask ${name} for help, or drag onto the page to bring along`}
        title={`Click to ask ${name} — or drag me onto the page and I'll follow you`}
        className={clsx(
          "-my-1 grid cursor-grab touch-none place-items-center rounded-full transition hover:scale-110 active:cursor-grabbing",
        )}
      >
        <AgentAvatar spec={agent.avatar} size={40} mood={hover ? "active" : "idle"} />
      </button>
    </span>
  );
}

/* ── the layer, over everything ──────────────────────────────────────── */

export function CompanionLayer() {
  const session = useMaybeSession();
  const agent = useCompanionAgent();
  const { mode } = useCompanion();
  const wrap = useRef<HTMLDivElement>(null);
  const lean = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  const [hint, setHint] = useState(false);
  const previous = useRef(mode);

  useEffect(() => {
    if (session) loadCompanion(session.user.id);
  }, [session]);

  // Where the pointer is, always — the companion needs it the moment it is out.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      motion.pointerX = e.clientX;
      motion.pointerY = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Escape sends it home.
  useEffect(() => {
    if (mode !== "out") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCompanionMode("returning");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // The first time out, it says how to get it back.
  useEffect(() => {
    const was = previous.current;
    previous.current = mode;
    if (was === "dragging" && mode === "out") {
      setHint(true);
      const t = setTimeout(() => setHint(false), 3600);
      return () => clearTimeout(t);
    }
    if (mode !== "out") setHint(false);
  }, [mode]);

  // The motion: ease towards a target every frame, and write the result
  // straight onto the element.
  useEffect(() => {
    if (mode === "docked" || !agent) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let isMoving = false;
    let stillFrames = 0;
    const half = SIZE / 2;

    const tick = () => {
      let tx = motion.x;
      let ty = motion.y;
      let k = 0.09;
      if (mode === "dragging") {
        tx = motion.pointerX;
        ty = motion.pointerY - 6;
        k = 0.45;
      } else if (mode === "returning") {
        const rect = dockRect();
        if (!rect) {
          setCompanionMode("docked");
          return;
        }
        tx = rect.left + rect.width / 2;
        ty = rect.top + rect.height / 2;
        k = 0.2;
      } else if (motion.anchor) {
        // Perched on the corner of the box it is explaining.
        tx = motion.anchor.x;
        ty = motion.anchor.y - 20;
        k = 0.16;
      } else if (motion.pointerX >= 0) {
        tx = motion.pointerX + TRAIL.x;
        ty = motion.pointerY + TRAIL.y;
      }
      tx = Math.min(Math.max(tx, half), window.innerWidth - half);
      ty = Math.min(Math.max(ty, half), window.innerHeight - half);
      if (reduce) k = 1;

      const px = motion.x;
      const py = motion.y;
      motion.x += (tx - motion.x) * k;
      motion.y += (ty - motion.y) * k;
      const vx = motion.x - px;
      const speed = Math.hypot(vx, motion.y - py);

      if (wrap.current) {
        wrap.current.style.transform = `translate3d(${motion.x - half}px, ${motion.y - half}px, 0)`;
      }
      if (lean.current) {
        lean.current.style.transform = `rotate(${Math.max(-14, Math.min(14, vx * 1.4)).toFixed(2)}deg)`;
      }
      // Its eyes keep finding the pointer while it travels, not only when the pointer moves.
      if (speed > 0.3) repaintFollowers();

      const nowMoving = isMoving ? speed > 0.3 : speed > 1.5;
      if (nowMoving !== isMoving) {
        isMoving = nowMoving;
        setMoving(nowMoving);
      }

      if (mode === "returning" && Math.hypot(tx - motion.x, ty - motion.y) < 1.5) {
        setMoving(false);
        setCompanionMode("docked");
        return;
      }
      if (mode === "out") {
        stillFrames = speed < 0.05 ? stillFrames + 1 : 0;
        if (stillFrames === 30) saveCompanionPosition();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, agent]);

  if (!agent || mode === "docked") return null;

  const flip = typeof window !== "undefined" && motion.x > window.innerWidth - 260;

  return (
    <>
    {mode === "out" && <CompanionLook agent={agent} />}
    {mode === "out" && <CompanionGuide agent={agent} />}
    <div
      ref={wrap}
      aria-hidden
      data-companion
      className="pointer-events-none fixed left-0 top-0 z-[70]"
      style={{ transform: `translate3d(${motion.x - SIZE / 2}px, ${motion.y - SIZE / 2}px, 0)` }}
    >
      <div ref={lean} style={{ transformOrigin: "50% 90%" }}>
        <AgentAvatar spec={agent.avatar} size={SIZE} mood={moving || mode === "dragging" ? "active" : "idle"} />
      </div>
      {hint && (
        <div
          className={clsx(
            "rise absolute top-0 w-[200px] rounded-[14px] bg-panel px-3 py-2 text-[11.5px] leading-snug text-ink-2 shadow-[var(--shadow-float)]",
            flip ? "right-full mr-1 rounded-tr-[4px]" : "left-full ml-1 rounded-tl-[4px]",
          )}
        >
          I&apos;ll follow you around. Ask me anything with the speech button — or “how do I…”, and I&apos;ll show you.
          Hold <kbd className="font-semibold text-ink">Alt</kbd> and drag over anything to ask about it.
        </div>
      )}
    </div>
    </>
  );
}
