"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { useDictation, useMicLevel, useSpeaker, yesOrNo } from "@/lib/speech";
import type { Conversation } from "@/lib/assistant";
import { Orb, useOrbSize, type OrbState } from "@/components/assistant/Orb";
import { ConfirmCard } from "@/components/assistant/ConfirmCard";
import { ToolTrace } from "@/components/assistant/ToolTrace";
import { TurnArtifacts } from "@/components/assistant/ResultPreview";

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

  const speaker = useSpeaker();
  const dictation = useDictation({
    onFinal: (text) => {
      // What was heard is no longer kept here. It becomes a message on the
      // conversation the moment it is sent — optimistically, before the server
      // has it — so the thread already shows it and a second copy would only be
      // a way for the two to disagree.
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

  // Sized to the window, not to the state of the conversation — the same
  // reasoning as the spoken screen: resizing the canvas restarts the animation,
  // and a fixed orb on a short window pushes the controls off the bottom.
  const orb = useOrbSize();

  // Follows whatever arrived last — a message, the answer as it is spoken, the
  // words being dictated right now. Declared before the early return below so
  // the hook order never changes; it does nothing while the overlay is closed.
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [
    open,
    conversation.messages.length,
    turn.answer,
    turn.steps.length,
    dictation.transcript,
  ]);

  if (!open || typeof document === "undefined") return null;

  // What is happening now, which the thread below cannot say. Everything else
  // that used to live on this line — the answer, and what was just heard — is in
  // the thread, where it stays put instead of being overwritten by the reply
  // to it.
  const notice =
    turn.phase === "confirming"
      ? "Say yes to go ahead, or no to leave it."
      : !dictation.supported
        ? "This browser cannot listen. Chrome, Edge and Safari can; Firefox cannot yet."
        : null;

  return createPortal(
    // `overflow-hidden` is a safety net, not the mechanism: the sizing below is
    // what keeps this inside the window. It is here so that anything which does
    // still escape is clipped rather than pushed off the bottom edge, where no
    // scrollbar can reach it.
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-app/95 backdrop-blur-xl">
      {/* ── the bar ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <span className="micro hidden text-ink-4 sm:block">Voice</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {conversation.detail?.title ?? "New conversation"}
        </span>
        {/* The label gives way before the control does: on a phone this row is
            a title and two buttons, and a button squeezed out of the row is a
            button nobody can press. */}
        <button
          onClick={onClose}
          title="Type instead"
          className="flex h-9 shrink-0 items-center gap-2 rounded-[13px] bg-panel px-3 text-[12.5px] font-medium text-ink-2 transition hover:text-ink sm:px-3.5"
        >
          <Keyboard className="size-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Type instead</span>
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
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 pb-4 sm:px-6">
        <div className="relative grid shrink-0 place-items-center">
          <Orb state={paused ? "idle" : state} level={level} size={orb} />
          {paused && (
            <span className="absolute grid size-14 place-items-center rounded-full bg-panel/80 text-ink-3 backdrop-blur">
              <MicOff className="size-5" strokeWidth={1.8} />
            </span>
          )}
        </div>

        <p className="micro shrink-0 text-ink-4">
          {status(state, paused, dictation.supported)}
        </p>

        {/* One scrolling region for the thread, the trace, the previews and the
            confirmation card together. They were separate fixed-height blocks
            under a thread that scrolled on its own, so a turn with a few tools
            and a report in it pushed the controls off the bottom of the
            screen. */}
        <div
          ref={scroller}
          className="no-bar flex w-full min-h-0 max-w-2xl flex-1 flex-col overflow-y-auto"
        >
          <div className="mt-auto space-y-3 py-1">
            <VoiceThread
              conversation={conversation}
              partial={listening ? dictation.transcript : ""}
              speaking={speaker.speaking}
            />

            {notice && (
              <p
                aria-live="polite"
                className="mx-auto w-fit max-w-full break-words rounded-[13px] bg-panel px-3.5 py-2 text-center text-[13px] text-ink-2"
              >
                {notice}
              </p>
            )}

            {turn.steps.length > 0 && <ToolTrace steps={turn.steps} className="w-full" />}

            <TurnArtifacts steps={turn.steps} className="w-full" />

            {dictation.error && (
              <p className="text-center text-[12.5px] text-danger">{dictation.error}</p>
            )}
            {turn.error && (
              <p className="text-center text-[12.5px] text-danger">{turn.error}</p>
            )}

            {turn.phase === "confirming" && turn.pending && (
              <ConfirmCard
                actions={turn.pending.actions}
                onRespond={(ok) => void respond(ok)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── the controls ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-center gap-3 pb-6 pt-2 sm:pb-10">
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

/**
 * The conversation, while it is being spoken.
 *
 * This screen used to carry one centred caption — whatever was last said,
 * whoever said it — on the reasoning that two columns of transcript is a chat
 * window and this is not one. That was wrong in practice for a specific reason:
 * the assistant's answer *overwrote the question it was answering*, so the one
 * thing a person needed in order to make sense of what they were hearing was
 * the one thing the screen had just thrown away. Their own words were never
 * shown back at all.
 *
 * And unlike the spoken-conversation screen, this one has the real thread
 * already — voice mode is the same conversation, the same run and the same
 * saved messages as the chat behind it — so showing it costs nothing and needs
 * no second copy of anything.
 *
 * The last few turns, not all of them: this is a glance, and somebody who wants
 * the whole conversation is one keystroke from the chat, which has it.
 */
function VoiceThread({
  conversation,
  partial,
  speaking,
}: {
  conversation: Conversation;
  /** What the microphone is hearing right now, before it is sent. */
  partial: string;
  speaking: boolean;
}) {
  const { messages, turn } = conversation;
  const recent = messages.slice(-6);
  const last = recent[recent.length - 1];

  /*
   * The answer is held until the server's copy of it lands.
   *
   * A turn ends by clearing what was streamed and then re-fetching the
   * conversation, which is a round trip — and for the whole of that round trip
   * the answer belonged to neither half: the live turn had dropped it and the
   * saved messages did not have it yet. On this screen that gap is at its worst,
   * because the answer is still being read aloud while the words disappear off
   * the screen.
   *
   * So the last answer is kept and shown while the newest saved message is
   * still the question it answers. The moment the real one arrives the held
   * copy is dropped and the saved message takes over — never both.
   */
  const held = useRef("");
  if (turn.answer) held.current = turn.answer;
  else if (last?.role !== "user") held.current = "";
  const answer = turn.answer || (last?.role === "user" ? held.current : "");

  const nothingYet = recent.length === 0 && !partial && !answer;
  if (nothingYet) {
    return (
      <p className="py-6 text-center text-[18px] leading-snug text-ink-4">
        Ask me anything about your work here.
      </p>
    );
  }

  return (
    <div aria-live="polite" className="w-full space-y-2.5">
      {recent.map((message) =>
        message.role === "user" ? (
          <Said key={`${message.id}-${message.seq}`} text={message.content} />
        ) : (
          <Answered key={`${message.id}-${message.seq}`} text={message.content} />
        ),
      )}

      {/* The turn in flight. Shown as it arrives rather than when it finishes,
          because it is being read aloud at the same time and the two running
          together is the whole point of the loop. */}
      {answer && <Answered text={answer} live={speaking && Boolean(turn.answer)} />}

      {partial && <Said text={partial} pending />}
    </div>
  );
}

/** Something the person said. Right-hand side, as in the typed chat. */
function Said({ text, pending }: { text: string; pending?: boolean }) {
  return (
    <div className="flex justify-end">
      <p
        className={clsx(
          "max-w-[80%] break-words rounded-[16px] rounded-br-[6px] bg-panel px-3.5 py-2 text-[14px] leading-relaxed",
          pending ? "text-ink-3" : "text-ink-2",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/** Something the assistant said. Plain text, and the larger of the two. */
function Answered({ text, live }: { text: string; live?: boolean }) {
  return (
    <p className="max-w-[92%] break-words text-[17px] leading-snug text-ink">
      {text}
      {live && (
        <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />
      )}
    </p>
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
