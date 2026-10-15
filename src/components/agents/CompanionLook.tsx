"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { type Agent } from "@/lib/agents";
import { motion } from "@/lib/companion";
import { around as aroundOf, pageName, pageText, textIn, type Around, type Box } from "@/lib/screen";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { START_GUIDE } from "@/components/agents/CompanionGuide";

/**
 * The companion's bubble: ask it anything, or box part of the screen first.
 *
 * - **Box it** — hold Alt and drag, or the box button by its spot in the bar.
 *   The agent hops onto the box and says what is in it.
 * - **Ask** — the speech button, or click the agent in the bar. A question
 *   about this page is answered from the page; "how do I…", "take me to…"
 *   starts a walk-through instead (``CompanionGuide``).
 *
 * The browser sends text, never a picture: what is in the box, what is around
 * it (its column, row, section and the currencies shown) and the visible page
 * condensed — enough for the answer to connect a figure to the total or the
 * toggle that explains it. The backend answers from its glossary or its own
 * sums when it can, then a free model, and only falls back to a paid one when
 * every free one is busy.
 */

interface Turn {
  role: "you" | "agent";
  text: string;
  how?: Assisted["how"];
  model?: string | null;
  cost?: string;
}

interface Assisted {
  answer: string;
  how: "glossary" | "system" | "free" | "ai" | "busy" | "guide";
  model: string | null;
  cost_usd: string;
  guide_goal: string | null;
}

interface Open {
  box: Box | null;
  /** Fixed when the bubble opens, so it never chases the pointer. */
  at: React.CSSProperties;
  selection: string;
  around: Around;
}

/** Start a box from elsewhere (the dock's box button). */
export const START_LOOK = "companion:look";
/** Open the bubble with no box (the dock's speech button, or a click on the agent). */
export const START_ASK = "companion:ask";

const MIN = 14;
const SUGGESTIONS = ["What is on this page?", "How do I raise a quote?", "Take me to my tasks"];

export function CompanionLook({ agent }: { agent: Agent }) {
  const [selecting, setSelecting] = useState(false);
  const [drawing, setDrawing] = useState<Box | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [thread, setThread] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(null);
    setThread([]);
    setFailed(null);
    setQuestion("");
    motion.anchor = null;
  }, []);

  const ask = useCallback(
    async (state: Open, followUp: string, history: Turn[]) => {
      setBusy(true);
      setFailed(null);
      try {
        // The page is read again for every question: it may have changed.
        const fresh = state.box ? state.around : { ...state.around, page_text: pageText() };
        const out = await api.post<Assisted>("/agents/assist", {
          agent_id: agent.id,
          page: pageName(),
          selection: state.selection,
          around: fresh,
          question: followUp,
          history: history.map(({ role, text }) => ({ role, text })),
        });
        if (out.how === "guide" && out.guide_goal) {
          close();
          window.dispatchEvent(new CustomEvent(START_GUIDE, { detail: out.guide_goal }));
          return;
        }
        setThread((now) => [...now, { role: "agent", text: out.answer, how: out.how, model: out.model, cost: out.cost_usd }]);
      } catch (caught) {
        setFailed(caught instanceof Error ? caught.message : "I could not answer that.");
      } finally {
        setBusy(false);
        setTimeout(() => input.current?.focus(), 0);
      }
    },
    [agent.id, close],
  );

  const finish = useCallback(
    (drawn: Box) => {
      setSelecting(false);
      setDrawing(null);
      if (drawn.width < MIN || drawn.height < MIN) return;
      const state: Open = {
        box: drawn,
        at: place(drawn),
        selection: textIn(drawn) || "(nothing written inside the box)",
        around: aroundOf(drawn),
      };
      setOpen(state);
      setThread([]);
      setQuestion("");
      // Hop onto the box's top corner while it explains.
      motion.anchor = { x: Math.min(drawn.left + drawn.width, window.innerWidth - 30), y: Math.max(drawn.top, 30) };
      void ask(state, "", []);
    },
    [ask],
  );

  // Drawing follows the pointer wherever it is, whether it began on the
  // overlay or as an Alt-drag on the page itself.
  const begin = useCallback(
    (x: number, y: number) => {
      start.current = { x, y };
      setDrawing({ left: x, top: y, width: 0, height: 0 });
      const rect = (e: PointerEvent, s: { x: number; y: number }): Box => ({
        left: Math.min(s.x, e.clientX),
        top: Math.min(s.y, e.clientY),
        width: Math.abs(e.clientX - s.x),
        height: Math.abs(e.clientY - s.y),
      });
      const move = (e: PointerEvent) => {
        if (start.current) setDrawing(rect(e, start.current));
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const s = start.current;
        start.current = null;
        if (s) finish(rect(e, s));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [finish],
  );

  // Alt + drag anywhere draws a box instead of selecting text.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!e.altKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      setSelecting(true);
      begin(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [begin, close]);

  // The dock's buttons.
  useEffect(() => {
    const look = () => {
      close();
      setSelecting(true);
    };
    const chat = () => {
      close();
      const at = place(null);
      setOpen({ box: null, at, selection: "", around: { column: "", row: "", section: "", currencies: [], page_text: "" } });
      // Sit beside the bubble while it is open, instead of following the
      // pointer into it — otherwise the bubble cannot be used.
      motion.anchor = { x: Number(at.left) - 26, y: Number(at.top) + 26 };
      setTimeout(() => input.current?.focus(), 30);
    };
    window.addEventListener(START_LOOK, look);
    window.addEventListener(START_ASK, chat);
    return () => {
      window.removeEventListener(START_LOOK, look);
      window.removeEventListener(START_ASK, chat);
    };
  }, [close]);

  // Escape backs out one level at a time — the box, then the bubble. The
  // companion's own Escape (go home) waits until neither is open.
  useEffect(() => {
    if (!selecting && !open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (selecting) {
        setSelecting(false);
        setDrawing(null);
      } else close();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [selecting, open, close]);

  useEffect(() => () => void (motion.anchor = null), []);

  const shown = drawing ?? open?.box ?? null;

  function send(text: string) {
    const q = text.trim();
    if (!q || busy || !open) return;
    const history = thread;
    setThread((now) => [...now, { role: "you", text: q }]);
    setQuestion("");
    void ask(open, q, history);
  }

  return (
    <>
      {selecting && (
        <div
          data-companion
          className="fixed inset-0 z-[68] cursor-crosshair bg-black/[0.04]"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            begin(e.clientX, e.clientY);
          }}
        >
          {!drawing && (
            <div className="rise pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-panel px-4 py-2 text-[12.5px] font-medium shadow-[var(--shadow-float)]">
              Drag a box around anything you want explained · Esc to cancel
            </div>
          )}
        </div>
      )}

      {shown && (
        <div
          data-companion
          aria-hidden
          className="pointer-events-none fixed z-[69] rounded-[10px] border-2 border-dashed border-accent bg-accent/10"
          style={{ left: shown.left, top: shown.top, width: shown.width, height: shown.height }}
        />
      )}

      {open && (
        <div
          data-companion
          role="dialog"
          aria-label={`${agent.name || "Your agent"}`}
          className="rise fixed z-[71] flex max-h-[420px] flex-col overflow-hidden rounded-[18px] bg-panel shadow-[var(--shadow-float)]"
          style={open.at}
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <AgentAvatar spec={agent.avatar} size={28} mood={busy ? "active" : "still"} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{agent.name || "Your agent"}</span>
            <button onClick={close} aria-label="Close" className="grid size-7 place-items-center rounded-full text-ink-4 hover:bg-panel-2 hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {open.box ? (
              <p className="line-clamp-2 border-l-2 border-accent pl-2 text-[11px] italic text-ink-4">{open.selection.slice(0, 160)}</p>
            ) : thread.length === 0 ? (
              <div>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  Ask me about this page, or how to do something — I can take you there and show you which button to press.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full bg-panel-2 px-2.5 py-1 text-[11.5px] text-ink-2 hover:bg-accent-soft hover:text-accent-text">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {thread.map((t, i) =>
              t.role === "you" ? (
                <p key={i} className="ml-8 rounded-[14px] rounded-br-[4px] bg-accent-soft px-3 py-2 text-[12.5px] text-accent-text">
                  {t.text}
                </p>
              ) : (
                <div key={i} className="mr-4">
                  <p className="whitespace-pre-line rounded-[14px] rounded-bl-[4px] bg-panel-2 px-3 py-2 text-[12.5px] leading-relaxed">{t.text}</p>
                  <p className="mt-1 flex items-center gap-1 pl-1 text-[10.5px] text-ink-4">{label(t)}</p>
                </div>
              ),
            )}
            {busy && (
              <p className="flex items-center gap-2 text-[12px] text-ink-3">
                <Loader2 className="size-3.5 animate-spin" /> Thinking…
              </p>
            )}
            {failed && <p className="rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{failed}</p>}
            <End deps={[thread, busy]} />
          </div>

          <form
            className="flex items-center gap-2 border-t border-line p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(question);
            }}
          >
            <input
              ref={input}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={open.box ? "Ask about this, or how to do something…" : "Ask anything, or “how do I…”"}
              className="h-9 min-w-0 flex-1 rounded-[12px] bg-panel-2 px-3 text-[12.5px] placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!question.trim() || busy}
              aria-label="Ask"
              className={clsx(
                "grid size-9 shrink-0 place-items-center rounded-full transition",
                question.trim() && !busy ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-4",
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/** Keeps the newest message in view. A block body: scrollIntoView may return a Promise. */
function End({ deps }: { deps: unknown[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div ref={end} />;
}

function label(t: Turn) {
  if (t.how === "glossary") return "From the app's glossary · free";
  if (t.how === "system") return "Worked out by the app · free";
  if (t.how === "busy") return "Free models busy";
  if (t.how === "free")
    return (
      <>
        <Sparkles className="size-3" /> Free AI{t.model ? ` (${t.model.split(":")[0]})` : ""} · $0
      </>
    );
  return (
    <>
      <Sparkles className="size-3" /> AI{t.cost && Number(t.cost) > 0 ? ` · $${Number(t.cost).toFixed(4)}` : ""}
    </>
  );
}

/** Beside the box where there is room, else beside the agent. */
function place(box: Box | null): React.CSSProperties {
  const WIDTH = 350;
  if (box) {
    const right = box.left + box.width + 16;
    const left = right + WIDTH < window.innerWidth - 12 ? right : Math.max(12, box.left - WIDTH - 16);
    return { left, top: Math.min(Math.max(12, box.top), window.innerHeight - 440), width: WIDTH };
  }
  const left = motion.x + 40 + WIDTH < window.innerWidth - 12 ? motion.x + 40 : Math.max(12, motion.x - WIDTH - 40);
  return { left, top: Math.min(Math.max(12, motion.y - 40), window.innerHeight - 440), width: WIDTH };
}
