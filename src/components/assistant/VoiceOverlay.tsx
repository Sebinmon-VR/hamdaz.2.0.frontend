"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { useDictation, useMicLevel, useSpeaker, yesOrNo } from "@/lib/speech";
import type { Conversation } from "@/lib/assistant";
import { Orb, type OrbState } from "@/components/assistant/Orb";
import { ConfirmCard } from "@/components/assistant/ConfirmCard";
import { ToolTrace } from "@/components/assistant/ToolTrace";

/**
 * Voice mode: the assistant with the screen taken away.
 *
 * The conversation is the same conversation — same endpoint, same run, same
 * saved messages — so leaving voice mode drops you back into the chat with
 * everything that was said in it. That is the whole design: this is a different
 * way to hold the same conversation, not a second assistant with its own memory.
 *
 * It is a **loop rather than a mode**, which is what separates a voice assistant
 * from a dictation box. Listen, send at the natural end of the utterance, read
 * the answer back, then listen again — nobody taps between turns, because a
 * hands-free interface that needs a hand is not one. The loop is broken only by
 * three things: the person pausing it, a write that needs approving, or an error.
 *
 * **It stops listening while it talks.** Without that the synthesiser's own
 * voice goes back through the microphone and the assistant answers itself, which
 * is the classic failure of a naive implementation of this.
 */
export function VoiceOverlay({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
}) {
  const { turn, busy, send, respond } = conversation;

  // Paused by the person: the loop stops arming itself and the orb goes quiet.
  const [paused, setPaused] = useState(false);
  // Reading answers aloud can be turned off without leaving voice mode — useful
  // in an open office, where being listened to is fine and being talked at is not.
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");

  const speaker = useSpeaker();
  const dictation = useDictation({
    onFinal: (text) => {
      setHeard(text);
      if (turn.phase === "confirming") {
        const answer = yesOrNo(text);
        // Anything that is not clearly one or the other leaves the card up:
        // guessing at "maybe" on a write is the one place to be conservative.
        if (answer !== null) void respond(answer);
        return;
      }
      void send(text);
    },
    enabled: open,
  });

  const level = useMicLevel(open && dictation.listening);

  const listening = dictation.listening;
  const state: OrbState = speaker.speaking
    ? "speaking"
    : busy
      ? "thinking"
      : listening
        ? "listening"
        : "idle";

  /* ── the loop ──────────────────────────────────────────────────────── */

  // The answer as it arrives, kept because the turn resets the moment the
  // server's own copy lands — and that is exactly when it needs speaking.
  const spoken = useRef("");
  useEffect(() => {
    if (turn.phase !== "answering" && turn.phase !== "waiting") return;
    spoken.current = turn.answer;
    // Speak each sentence as it lands. Waiting for the turn to end added the
    // model's whole generation time to the silence, which is what made the
    // voice feel like it had missed the question.
    if (open && !muted && speaker.supported) speaker.feed(turn.answer);
  }, [turn.answer, turn.phase, open, muted, speaker]);

  const arm = useCallback(() => {
    if (!open || paused || !dictation.supported) return;
    dictation.start();
  }, [open, paused, dictation]);

  const previous = useRef(turn.phase);
  useEffect(() => {
    const before = previous.current;
    previous.current = turn.phase;
    if (!open) return;

    // A turn just finished.
    if (before !== "idle" && turn.phase === "idle") {
      const said = spoken.current.trim();
      spoken.current = "";
      // Most of this has already been spoken as it arrived; `finish` says
      // whatever sentence was still incomplete and releases the mouth.
      if (said && !muted && speaker.supported) speaker.finish(said);
      else {
        speaker.cancel();
        arm();
      }
      return;
    }

    // A write is parked. The card is on screen; saying it out loud is what
    // makes it answerable without looking, and the loop re-arms for the answer.
    if (turn.phase === "confirming" && before !== "confirming") {
      const actions = turn.pending?.actions ?? [];
      const what =
        actions.length === 1
          ? actions[0].label
          : `${actions.length} actions, including ${actions[0]?.label ?? "one"}`;
      if (!muted && speaker.supported) {
        speaker.speak(`Before I do this, may I go ahead with ${what}? Say yes, or no.`);
      } else {
        arm();
      }
    }
  }, [turn.phase, turn.pending, open, muted, speaker, arm]);

  // Listening resumes when the assistant has finished talking, and not before.
  const wasSpeaking = useRef(false);
  useEffect(() => {
    const finished = wasSpeaking.current && !speaker.speaking;
    wasSpeaking.current = speaker.speaking;
    if (finished && open && !busy) arm();
  }, [speaker.speaking, open, busy, arm]);

  // Opening starts the loop; closing stops everything it owns.
  useEffect(() => {
    if (!open) return;
    setPaused(false);
    setHeard("");
    spoken.current = "";
    previous.current = turn.phase;
    const id = window.setTimeout(() => dictation.start(), 260);
    return () => {
      window.clearTimeout(id);
      dictation.stop();
      speaker.cancel();
    };
    // Deliberately only on `open`: this is the loop being started and stopped,
    // and re-running it whenever the turn changes would restart the microphone
    // in the middle of somebody's sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  function togglePause() {
    setPaused((was) => {
      const next = !was;
      if (next) {
        dictation.stop();
        speaker.cancel();
      } else if (!busy && turn.phase !== "confirming") {
        dictation.start();
      }
      return next;
    });
  }

  if (!open || typeof document === "undefined") return null;

  const caption =
    turn.phase === "confirming"
      ? "Say yes to go ahead, or no to leave it."
      : speaker.speaking || (busy && turn.answer)
        ? turn.answer || spoken.current
        : listening
          ? dictation.transcript
          : heard;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-app/95 backdrop-blur-xl">
      {/* ── the bar ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-4">
        <span className="micro text-ink-4">Voice</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {conversation.detail?.title ?? "New conversation"}
        </span>
        <button
          onClick={onClose}
          className="flex h-9 items-center gap-2 rounded-[13px] bg-panel px-3.5 text-[12.5px] font-medium text-ink-2 transition hover:text-ink"
        >
          <Keyboard className="size-3.5" strokeWidth={2} />
          Type instead
        </button>
        <button
          onClick={onClose}
          aria-label="Leave voice mode"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {/* ── the orb and what is being said ──────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-4">
        <div className="relative grid place-items-center">
          <Orb state={paused ? "idle" : state} level={level} size={260} />
          {paused && (
            <span className="absolute grid size-14 place-items-center rounded-full bg-panel/80 text-ink-3 backdrop-blur">
              <MicOff className="size-5" strokeWidth={1.8} />
            </span>
          )}
        </div>

        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <p className="micro text-ink-4">{status(state, paused, dictation.supported)}</p>

          {/* One caption line, whoever is talking. Two columns of transcript —
              theirs and its — is a chat window, and this is not one; the chat
              is a keystroke away and has the whole conversation in it. */}
          <p
            aria-live="polite"
            className={clsx(
              "min-h-[4.5rem] max-w-2xl overflow-y-auto text-center text-[19px] leading-snug",
              caption ? "text-ink" : "text-ink-4",
            )}
          >
            {caption ||
              (dictation.supported
                ? "Ask me anything about your work here."
                : "This browser cannot listen. Chrome, Edge and Safari can; Firefox cannot yet.")}
          </p>

          {turn.steps.length > 0 && (
            <ToolTrace steps={turn.steps} className="w-full max-w-md" />
          )}

          {dictation.error && (
            <p className="max-w-md text-center text-[12.5px] text-danger">{dictation.error}</p>
          )}
          {turn.error && (
            <p className="max-w-md text-center text-[12.5px] text-danger">{turn.error}</p>
          )}

          {turn.phase === "confirming" && turn.pending && (
            <div className="w-full max-w-lg">
              <ConfirmCard actions={turn.pending.actions} onRespond={(ok) => void respond(ok)} />
            </div>
          )}
        </div>
      </div>

      {/* ── the controls ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-center gap-3 pb-10 pt-2">
        <button
          onClick={() => {
            setMuted((was) => {
              if (!was) speaker.cancel();
              return !was;
            });
          }}
          aria-pressed={muted}
          title={muted ? "Read answers out loud" : "Stop reading answers out loud"}
          className="grid size-12 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
        >
          {muted ? (
            <VolumeX className="size-4.5" strokeWidth={1.8} />
          ) : (
            <Volume2 className="size-4.5" strokeWidth={1.8} />
          )}
        </button>

        <button
          onClick={togglePause}
          disabled={!dictation.supported}
          aria-pressed={!paused}
          title={paused ? "Start listening" : "Stop listening"}
          className={clsx(
            "grid size-16 place-items-center rounded-full transition disabled:opacity-40",
            paused
              ? "bg-panel text-ink-2 hover:text-ink"
              : "bg-accent text-accent-ink hover:bg-accent-hover",
          )}
        >
          {paused ? (
            <MicOff className="size-6" strokeWidth={1.8} />
          ) : (
            <Mic className="size-6" strokeWidth={1.8} />
          )}
        </button>

        <span className="size-12" aria-hidden />
      </div>
    </div>,
    document.body,
  );
}

function status(state: OrbState, paused: boolean, supported: boolean): string {
  if (!supported) return "Microphone unavailable";
  if (paused) return "Paused — tap the microphone to carry on";
  switch (state) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Working on it";
    case "speaking":
      return "Speaking";
    default:
      return "Ready";
  }
}
