"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { type Agent } from "@/lib/agents";
import { motion } from "@/lib/companion";
import { buildNav } from "@/lib/nav";
import { pageName, pressable, pressables } from "@/lib/screen";
import { useSession } from "@/lib/session";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * A walk-through: "how do I raise a quote?" shown, not told.
 *
 * One step at a time. Each step reads the screen as it is *now* — its
 * buttons, tabs and fields, each tagged with an id — and asks the backend for
 * the next one, which answers from a recipe or a page name when it can and
 * from a free model when it cannot, choosing only from what is listed. So a
 * step can never point at something that is not there.
 *
 * A "navigate" step goes to the page; a "click" step dims the screen around
 * the thing to press, perches the agent beside it, and moves on by itself
 * when the person presses it (or presses Next). Nothing is pressed for them —
 * the hand on the mouse stays theirs.
 */

export const START_GUIDE = "companion:guide";

interface GuideStep {
  action: "click" | "navigate" | "done";
  say: string;
  target: string | null;
  path: string | null;
  how: string;
}

const PAD = 6;

export function CompanionGuide({ agent }: { agent: Agent }) {
  const session = useSession();
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [missing, setMissing] = useState(false);
  const done = useRef<string[]>([]);
  const goalRef = useRef<string | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Every page the person can open, by name — the walk-through's map.
  const pages = useMemo(() => {
    const nav = buildNav(session);
    const all = [...nav.primary, ...nav.more.flatMap((g) => g.items)];
    const seen = new Set<string>();
    return all
      .filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)))
      .map((i) => ({ path: i.href, label: i.label }));
  }, [session]);

  const stop = useCallback(() => {
    goalRef.current = null;
    setGoal(null);
    setStep(null);
    setBusy(false);
    motion.anchor = null;
  }, []);

  const plan = useCallback(async () => {
    const current = goalRef.current;
    if (!current) return;
    setBusy(true);
    setMissing(false);
    try {
      const next = await api.post<GuideStep>("/agents/guide/next", {
        goal: current,
        path: location.pathname,
        page: pageName(),
        elements: pressables(),
        pages,
        done: done.current,
      });
      if (goalRef.current !== current) return;
      setStep(next);
      setCount((n) => n + 1);
      if (next.action === "navigate" && next.path) {
        done.current.push(`nav:${next.path}`);
        router.push(next.path);
        await arrive(next.path);
        if (goalRef.current === current) void plan();
        return;
      }
    } catch {
      setStep({ action: "done", say: "I lost my way there. Ask me again?", target: null, path: null, how: "busy" });
    } finally {
      setBusy(false);
    }
  }, [pages, router]);

  // Started from the bubble.
  useEffect(() => {
    const begin = (e: Event) => {
      const wanted = (e as CustomEvent<string>).detail;
      if (!wanted) return;
      done.current = [];
      goalRef.current = wanted;
      setGoal(wanted);
      setCount(0);
      setStep(null);
      void plan();
    };
    window.addEventListener(START_GUIDE, begin);
    return () => window.removeEventListener(START_GUIDE, begin);
  }, [plan]);

  // A click step: find it, bring it into view, ring it, and wait for the press.
  useEffect(() => {
    if (!step || step.action !== "click" || !step.target) return;
    const el = pressable(step.target);
    if (!el) {
      setMissing(true);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const target = step.target;
    let frame = 0;
    const follow = () => {
      const r = el.getBoundingClientRect();
      if (ring.current) {
        Object.assign(ring.current.style, {
          left: `${r.left - PAD}px`,
          top: `${r.top - PAD}px`,
          width: `${r.width + PAD * 2}px`,
          height: `${r.height + PAD * 2}px`,
        });
      }
      if (card.current) {
        const below = r.bottom + 14;
        const top = below + 170 < window.innerHeight ? below : Math.max(12, r.top - 184);
        const left = Math.min(Math.max(12, r.left), window.innerWidth - 332);
        Object.assign(card.current.style, { left: `${left}px`, top: `${top}px` });
      }
      motion.anchor = { x: Math.min(r.right + 30, window.innerWidth - 30), y: r.top + 4 };
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    const pressed = () => {
      done.current.push(target);
      // Let what the press opens — a page, a dialog, a tab — appear first.
      setTimeout(() => void plan(), 900);
    };
    el.addEventListener("click", pressed, { capture: true, once: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("click", pressed, { capture: true });
    };
  }, [step, plan]);

  // Escape ends it.
  useEffect(() => {
    if (!goal) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      stop();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [goal, stop]);

  useEffect(() => () => void (motion.anchor = null), []);

  if (!goal) return null;

  const pointing = step?.action === "click" && !missing;

  return (
    <>
      {pointing && (
        <div
          ref={ring}
          data-companion
          aria-hidden
          className="guide-ring pointer-events-none fixed z-[67] rounded-[14px] border-2 border-accent transition-[left,top,width,height] duration-200"
          style={{ boxShadow: "0 0 0 9999px rgb(8 8 16 / 0.38)" }}
        />
      )}

      <div
        ref={card}
        data-companion
        role="dialog"
        aria-label="Walk-through"
        className="rise fixed z-[71] w-[320px] rounded-[18px] bg-panel p-3.5 shadow-[var(--shadow-float)]"
        style={pointing ? undefined : { left: Math.min(motion.x + 40, window.innerWidth - 332), top: Math.max(12, Math.min(motion.y - 30, window.innerHeight - 200)) }}
      >
        <div className="flex items-center gap-2">
          <AgentAvatar spec={agent.avatar} size={26} mood={busy ? "active" : "still"} />
          <span className="micro flex-1 text-ink-4">
            {busy && !step ? "Working it out" : `Step ${Math.max(1, count)}`} · {goal.length > 34 ? `${goal.slice(0, 34)}…` : goal}
          </span>
          <button onClick={stop} aria-label="Stop the walk-through" className="grid size-7 place-items-center rounded-full text-ink-4 hover:bg-panel-2 hover:text-ink">
            <X className="size-3.5" />
          </button>
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed">
          {busy && (!step || step.action !== "click") ? (
            <span className="flex items-center gap-2 text-ink-3">
              <Loader2 className="size-3.5 animate-spin" /> {step?.action === "navigate" ? step.say : "Looking at the screen…"}
            </span>
          ) : (
            step?.say
          )}
        </p>
        {missing && <p className="mt-1.5 text-[11.5px] text-warn">I can&apos;t see it on the screen — it may be further down or inside a tab.</p>}

        <div className="mt-3 flex items-center gap-2">
          {step?.action === "done" ? (
            <button onClick={stop} className="inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-accent px-3 text-[12px] font-bold text-accent-ink">
              <Check className="size-3.5" strokeWidth={2.6} /> Got it
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => {
                if (step?.target) done.current.push(step.target);
                void plan();
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-line px-3 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
            >
              {pointing ? "Done it" : "Next"} <ArrowRight className="size-3.5" />
            </button>
          )}
          <span className="ml-auto text-[10.5px] text-ink-4">
            {step?.how === "system" ? "the app's own steps · free" : step?.how === "free" ? "free AI · $0" : ""}
          </span>
        </div>
      </div>
    </>
  );
}

/** Wait until the browser is on ``path`` and the new screen has drawn. */
async function arrive(path: string): Promise<void> {
  const until = Date.now() + 6000;
  while (location.pathname !== path && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 120));
  }
  // The screen fades in and fetches; give it a moment to put its buttons out.
  await new Promise((r) => setTimeout(r, 900));
}
