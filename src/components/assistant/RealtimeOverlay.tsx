"use client";

import clsx from "clsx";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Mic, MicOff, Square, X } from "lucide-react";
import { useStreamLevel } from "@/lib/speech";
import { useRealtime, type RealtimePhase, type RealtimeStep } from "@/lib/realtime";
import type { ToolStep } from "@/lib/assistant";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Orb, type OrbState } from "@/components/assistant/Orb";
import { ArgumentList, ToolTrace } from "@/components/assistant/ToolTrace";

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

  // Opening starts the call and closing ends it. `start` guards against being
  // called twice, so a re-render cannot open a second connection.
  useEffect(() => {
    if (open) start();
    else stop();
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

  if (!open || typeof document === "undefined") return null;

  const caption =
    phase === "confirming"
      ? session.pending?.label
        ? `Shall I go ahead with: ${session.pending.label}?`
        : "Waiting on your answer."
      : // A tool is the one wait with no sound in it, and some of them read
        // SharePoint or Zoho live and take seconds. Naming it is the difference
        // between a slow answer and an apparently broken one.
        phase === "working" && session.running
        ? session.running
        : session.transcript || session.heard;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-app/95 backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-3 px-5 py-4">
        <span className="micro text-ink-4">Spoken</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {session.info
            ? `${session.info.model} · ${session.info.voice}`
            : "Opening the conversation"}
        </span>
        {session.info && !session.info.writes_enabled && (
          <Badge tone="neutral" title="A super admin has not enabled writes in a spoken conversation.">
            Read only
          </Badge>
        )}
        <button
          onClick={onType}
          className="flex h-9 items-center gap-2 rounded-[13px] bg-panel px-3.5 text-[12.5px] font-medium text-ink-2 transition hover:text-ink"
        >
          <Keyboard className="size-3.5" strokeWidth={2} />
          Type instead
        </button>
        <button
          onClick={onClose}
          aria-label="Leave the conversation"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-4">
        <div className="relative grid place-items-center">
          <Orb state={orbFor(phase, session.muted)} level={level} size={260} />
          {session.muted && (
            <span className="absolute grid size-14 place-items-center rounded-full bg-panel/80 text-ink-3 backdrop-blur">
              <MicOff className="size-5" strokeWidth={1.8} />
            </span>
          )}
        </div>

        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <p className="micro text-ink-4">{status(phase, session.muted)}</p>

          <p
            aria-live="polite"
            className={clsx(
              "min-h-[4.5rem] max-w-2xl overflow-y-auto text-center text-[19px] leading-snug",
              caption ? "text-ink" : "text-ink-4",
            )}
          >
            {caption ||
              (phase === "connecting"
                ? "Connecting…"
                : "Just talk — it is listening, and you can interrupt it.")}
          </p>

          {session.steps.length > 0 && (
            <ToolTrace steps={session.steps.map(asToolStep)} className="w-full max-w-md" />
          )}

          {session.error && (
            <p className="max-w-md text-center text-[12.5px] text-danger">{session.error}</p>
          )}

          {session.pending && <Waiting step={session.pending} onDecline={session.decline} />}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 pb-10 pt-2">
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
    <div className="rise w-full max-w-lg overflow-hidden rounded-[20px] bg-panel-2 ring-1 ring-warn/35">
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
