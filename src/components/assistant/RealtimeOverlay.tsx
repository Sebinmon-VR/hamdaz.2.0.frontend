"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Mic, MicOff, Square, X } from "lucide-react";
import { useStreamLevel } from "@/lib/speech";
import {
  useRealtime,
  type RealtimeLine,
  type RealtimePhase,
  type RealtimeStep,
} from "@/lib/realtime";
import type { ToolStep } from "@/lib/assistant";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Orb, useOrbSize, type OrbState } from "@/components/assistant/Orb";
import { ArgumentList, ToolTrace } from "@/components/assistant/ToolTrace";
import { TurnArtifacts } from "@/components/assistant/ResultPreview";

/**
 * A spoken conversation — the assistant with the screen taken away.
 *
 * This is a **different loop** from the other voice screen, not a variation of
 * it, which is why it is a separate component rather than a branch inside one.
 * There, the browser transcribes, the text chat answers, and a speech model
 * reads the answer back — three of our turns per exchange. Here the browser is
 * connected straight to OpenAI and audio flows both ways continuously: it can be
 * interrupted mid-sentence, it hears the pause at the end of a question, and
 * nothing waits for a round trip through this app.
 *
 * What still comes back to us is the part that matters. Every tool the model
 * asks for is relayed to the API, checked against this person's policy again,
 * and run through the same route the text chat uses with their own session. The
 * browser learns that a tool is called something; it never learns where it
 * lives.
 *
 * **The confirmation here is weaker than in the chat, and the screen says so.**
 * In the chat the server parks the run and nothing happens until somebody
 * answers. In a spoken conversation the model asks out loud and judges the
 * answer itself. So a waiting write is put on screen as well as spoken — not
 * because a hands-free interface should need a hand, but because somebody should
 * be able to see what was asked and stop it without having to out-talk it.
 */
export function RealtimeOverlay({
  open,
  onClose,
  onType,
}: {
  open: boolean;
  onClose: () => void;
  /** Leave the conversation and go back to typing. */
  onType: () => void;
}) {
  const session = useRealtime({ enabled: open });
  const { phase, start, stop } = session;

  // Opening starts the call; the cleanup ends it. Symmetric on purpose: an
  // effect that starts in its body and stops in an `else` branch of the same
  // body opens two connections when React double-invokes it, which it does in
  // development. `start` is single-flight as well, but one guard is not a
  // reason to write the other one wrongly.
  useEffect(() => {
    if (!open) return;
    start();
    return () => stop();
  }, [open, start, stop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // The orb runs off the real audio rather than off a second microphone or an
  // invented envelope: the person's own stream while they are being listened
  // to, and what comes back while the assistant is talking. Opening another
  // microphone for this acquired the device again on every turn, which is a
  // cost paid in the middle of a conversation.
  const speaking = phase === "speaking";
  const mine = useStreamLevel(
    session.micStream,
    open && !session.muted && !speaking && phase !== "working",
  );
  const theirs = useStreamLevel(session.remoteStream, open && speaking);
  const level = speaking ? theirs : mine;

  // The trace and the previews read the same steps, in the chat's shape.
  const steps = session.steps.map(asToolStep);

  // Sized to the window rather than to the state of the call. It shrank once a
  // conversation had started, which resized the canvas mid-session and — since
  // the animation is bound to the canvas — restarted it: the orb blinked out
  // and swelled again on the first sentence transcribed. What it does yield to
  // is a short window, which is the case where a fixed orb pushed the microphone
  // and stop buttons off the bottom edge.
  const orb = useOrbSize();

  // Following the newest thing said, whatever produced it — a line of speech, a
  // tool being called, a report arriving. Hooks run before the early return
  // below, so the effect is declared here and does nothing while closed.
  const scroller = useRef<HTMLDivElement | null>(null);
  const tail = session.lines[session.lines.length - 1]?.text;
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [session.lines.length, tail, session.steps.length, open]);

  if (!open || typeof document === "undefined") return null;

  // What is happening *now*, which the transcript below cannot say: a write
  // waiting on an answer, or a tool being read. The tool case matters most —
  // it is the one wait in a spoken conversation with no sound in it, and some
  // of these read SharePoint or Zoho live and take seconds, so naming it is the
  // difference between a slow answer and an apparently broken one.
  const notice =
    phase === "confirming"
      ? session.pending?.label
        ? `Shall I go ahead with: ${session.pending.label}?`
        : "Waiting on your answer."
      : phase === "working" && session.running
        ? session.running
        : null;

  return createPortal(
    // `overflow-hidden` is the safety net rather than the mechanism: the sizing
    // below is what keeps everything inside the window, and this is what stops
    // anything that still escapes from doing so *silently*, off the bottom edge
    // where no scrollbar can reach it.
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-app/95 backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <span className="micro hidden text-ink-4 sm:block">Spoken</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {session.info
            ? `${session.info.model} · ${session.info.voice}`
            : "Opening the conversation"}
        </span>
        {session.info && !session.info.writes_enabled && (
          <Badge
            tone="neutral"
            className="hidden sm:inline-flex"
            title="A super admin has not enabled writes in a spoken conversation."
          >
            Read only
          </Badge>
        )}
        {/* The label goes before the control does. On a phone this row is a
            title, a badge and two buttons, and it is the words that have to
            give — a button that has been squeezed out is a button somebody
            cannot press. */}
        <button
          onClick={onType}
          title="Type instead"
          className="flex h-9 shrink-0 items-center gap-2 rounded-[13px] bg-panel px-3 text-[12.5px] font-medium text-ink-2 transition hover:text-ink sm:px-3.5"
        >
          <Keyboard className="size-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Type instead</span>
        </button>
        <button
          onClick={onClose}
          aria-label="Leave the conversation"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 pb-4 sm:px-6">
        <div className="relative grid shrink-0 place-items-center">
          <Orb state={orbFor(phase, session.muted)} level={level} size={orb} />
          {session.muted && (
            <span className="absolute grid size-14 place-items-center rounded-full bg-panel/80 text-ink-3 backdrop-blur">
              <MicOff className="size-5" strokeWidth={1.8} />
            </span>
          )}
        </div>

        <p className="micro shrink-0 text-ink-4">{status(phase, session.muted)}</p>

        {/* Everything below the orb scrolls **together**, in one box.
            Separately-scrolling pieces were the bug: the transcript had its own
            scroller and the trace, the previews and the confirmation card sat
            under it as fixed-height blocks, so a turn that called three tools
            and returned a report pushed the microphone and stop buttons off the
            bottom of the screen. One region that scrolls cannot do that,
            whatever it is holding. */}
        <div
          ref={scroller}
          className="no-bar flex w-full min-h-0 max-w-2xl flex-1 flex-col overflow-y-auto"
        >
          {/* Bottom-anchored, the way a conversation reads: a short exchange
              sits just above the controls rather than stranded at the top. */}
          <div className="mt-auto space-y-3 py-1">
            <Transcript
              lines={session.lines}
              empty={
                phase === "connecting"
                  ? "Connecting…"
                  : "Just talk — it is listening, and you can interrupt it."
              }
            />

            {notice && (
              <p
                aria-live="polite"
                className="mx-auto w-fit max-w-full break-words rounded-[13px] bg-panel px-3.5 py-2 text-center text-[13px] text-ink-2"
              >
                {notice}
              </p>
            )}

            {session.steps.length > 0 && (
              <ToolTrace steps={steps} className="w-full" />
            )}

            <TurnArtifacts steps={steps} className="w-full" />

            {session.error && (
              <p className="text-center text-[12.5px] text-danger">{session.error}</p>
            )}

            {session.pending && (
              <Waiting step={session.pending} onDecline={session.decline} />
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 pb-6 pt-2 sm:pb-10">
        <button
          onClick={() => session.setMuted(!session.muted)}
          aria-pressed={session.muted}
          title={session.muted ? "Unmute the microphone" : "Mute the microphone"}
          className={clsx(
            "grid size-14 place-items-center rounded-full transition",
            session.muted
              ? "bg-panel text-ink-2 hover:text-ink"
              : "bg-accent text-accent-ink hover:bg-accent-hover",
          )}
        >
          {session.muted ? (
            <MicOff className="size-5" strokeWidth={1.8} />
          ) : (
            <Mic className="size-5" strokeWidth={1.8} />
          )}
        </button>

        {/* A square, not a handset. This is not a phone call and nobody is
            being hung up on — a filled square is the stop everybody already
            reads on anything that plays or records, and it is the same control
            the chat composer uses to stop an answer. */}
        <button
          onClick={onClose}
          title="Stop the conversation"
          aria-label="Stop the conversation"
          className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger transition hover:bg-danger hover:text-white"
        >
          <Square className="size-4.5 fill-current" strokeWidth={2} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The conversation, both sides of it.
 *
 * This screen used to show a single centred line — whatever was last said,
 * whoever said it — and that is unreadable the moment a conversation is longer
 * than one exchange. The assistant's answer overwrote the question it was
 * answering, so somebody glancing back after listening for a minute found a
 * sentence with no idea what it was a reply to, and their own words nowhere at
 * all. A spoken conversation is exactly the case where you cannot scroll back
 * through your own memory of it.
 *
 * So: a proper thread, oldest at the top, the person's turns on the right the
 * way they are in the typed chat, and the assistant's as plain text on the
 * left. The scrolling belongs to the region above rather than to this — the
 * trace and the previews scroll with the words, and the controls at the foot of
 * the overlay stay where the hand expects them however long it runs.
 *
 * Every line here is OpenAI's transcription — of the person's audio going in,
 * of the model's coming out — so it is what was *heard*. Close enough to read
 * back; not a record to quote from.
 */
function Transcript({ lines, empty }: { lines: RealtimeLine[]; empty: string }) {
  if (lines.length === 0) {
    return (
      <p className="py-6 text-center text-[18px] leading-snug text-ink-4">{empty}</p>
    );
  }

  return (
    <div aria-live="polite" className="w-full space-y-2.5">
      {lines.map((line) =>
        line.who === "you" ? (
          <div key={line.id} className="flex justify-end">
            <p
              className={clsx(
                "max-w-[80%] break-words rounded-[16px] rounded-br-[6px] bg-panel px-3.5 py-2 text-[14px] leading-relaxed",
                line.done ? "text-ink-2" : "text-ink-3",
              )}
            >
              {line.text}
            </p>
          </div>
        ) : (
          <p
            key={line.id}
            className="max-w-[92%] break-words text-[17px] leading-snug text-ink"
          >
            {line.text}
            {!line.done && (
              <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />
            )}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * A write the model is asking about.
 *
 * Saying yes is the ordinary way through — the model asked out loud and is
 * listening for the answer. This card exists for the other half: seeing what was
 * actually asked, in full, and being able to refuse without arguing with it. The
 * arguments are shown for the same reason they are in the chat, because the
 * spoken summary is the model's account and this is what would really be sent.
 */
function Waiting({ step, onDecline }: { step: RealtimeStep; onDecline: () => void }) {
  return (
    <div className="rise mx-auto w-full max-w-lg overflow-hidden rounded-[20px] bg-panel-2 ring-1 ring-warn/35">
      <div className="px-4 pt-4">
        <p className="text-[13.5px] font-semibold text-ink">{step.label}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Nothing has been changed yet. Say yes to go ahead, or use the button.
        </p>
        {step.warning && (
          <p className="mt-2.5 rounded-[9px] bg-warn-soft px-3 py-2 text-[11.5px] leading-relaxed text-warn">
            {step.warning}
          </p>
        )}
        <div className="mt-3">
          <p className="micro mb-1.5 text-ink-4">What would be sent</p>
          <ArgumentList args={step.arguments} />
        </div>
      </div>
      <div className="mt-3.5 flex justify-end bg-panel px-4 py-3">
        <Button size="sm" variant="ghost" icon={X} onClick={onDecline}>
          No, don&rsquo;t
        </Button>
      </div>
    </div>
  );
}

/** The live steps, in the shape the chat's trace already renders. */
function asToolStep(step: RealtimeStep): ToolStep {
  return {
    tool_key: step.tool_key,
    label: step.label,
    arguments: step.arguments,
    // An awaiting call has not run, so it stays in the trace's pending state
    // rather than claiming an outcome it does not have.
    ok: step.awaiting ? undefined : step.ok,
    status: step.status,
    summary: step.summary,
  };
}

function orbFor(phase: RealtimePhase, muted: boolean): OrbState {
  if (muted) return "idle";
  switch (phase) {
    case "connecting":
      return "thinking";
    case "hearing":
      return "listening";
    case "speaking":
      return "speaking";
    case "confirming":
      return "speaking";
    case "working":
      return "thinking";
    case "live":
      return "listening";
    default:
      return "idle";
  }
}

function status(phase: RealtimePhase, muted: boolean): string {
  if (muted) return "Muted — nothing is being heard";
  switch (phase) {
    case "connecting":
      return "Connecting";
    case "hearing":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "confirming":
      return "Waiting on your answer";
    case "working":
      return "Looking that up";
    case "live":
      return "Listening";
    case "ended":
      return "Conversation ended";
    default:
      return "Ready";
  }
}
