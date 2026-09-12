"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft,
  AudioLines,
  Command,
  Droplet,
  Droplets,
  Keyboard,
  CornerDownLeft,
  Expand,
  Maximize2,
  Mic,
  MicOff,
  Shrink,
  Square,
  Wrench,
  X,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAssistantStatus, useConversation } from "@/lib/assistant";
import type { ToolStep } from "@/lib/assistant";
import { OPEN_TOOL, destinationOf, guessDestination, type Destination } from "@/lib/places";
import { isLive, realtimeSupported, useRealtime } from "@/lib/realtime";
import type { RealtimeSession } from "@/lib/realtime";
import { labelFor } from "@/lib/nav";
import { useDictation, useStreamLevel } from "@/lib/speech";
import { useSession } from "@/lib/session";
import type {
  AssistantMessageOut,
  AssistantStatusOut,
  ConversationOut,
} from "@/lib/types";
import { Orb, type OrbState } from "@/components/assistant/Orb";
import { Markdown } from "@/components/assistant/Markdown";
import { ConfirmCard } from "@/components/assistant/ConfirmCard";
import { Avatar, Badge } from "@/components/ui/primitives";

/**
 * The assistant, as a fixture of the app rather than a place you go to.
 *
 * A pill at the top of every screen that opens downward into a chat. It is one
 * element that changes shape — see `.island-morph` — because a pill *replaced*
 * by a panel reads as a dialog opening, and a dialog is a thing you dismiss
 * before you can carry on. This is meant to feel like something you talk to
 * mid-task.
 *
 * **It says what it is doing while it is closed.** That is the point of the
 * shape: once a question is asked the pill keeps the answer's tail, the tool
 * it is using, or the page it is about to open, so somebody can ask for
 * something and go back to reading. A chat that has to be watched is a chat
 * that costs attention.
 *
 * **It can move the app.** When a turn calls `app.open` the resolved route
 * comes back in the tool result and this navigates there, remembering where
 * the person was so one chip puts them back. The model decides *whether* to
 * open something — it has the tool and the instructions for when to reach for
 * it — and this decides nothing except how the move looks. That split is what
 * keeps the choice auditable: it is in the run log like every other tool call.
 *
 * It does not replace `/assistant`. Long sessions, history and hands-free
 * voice live there, and the header carries the conversation across so a
 * question started here can be finished full size.
 */
export function Island() {
  const status = useAssistantStatus();
  const pathname = usePathname();

  // Gated here rather than at the call site, so the shell does not have to
  // know what the assistant's rules are. And not on the assistant's own
  // screen: a chat floating above the same chat is a bug that looks like a
  // feature until somebody types in the wrong one.
  if (!status.data?.admitted) return null;
  if (pathname.startsWith("/assistant")) return null;
  return <Body status={status.data} />;
}

/** How long the "put me back" chip stays after the app has moved. */
const UNDO_MS = 9000;

function Body({ status }: { status: AssistantStatusOut }) {
  const { user, access } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  // Small, in the corner, nothing dimmed. The state the island wants to be in
  // whenever the screen matters more than the conversation does.
  const [docked, setDocked] = useState(false);
  // A preference rather than a mode: somebody who likes seeing through it
  // likes it every time, so it is remembered. Read lazily so the server render
  // and the first client render agree — `localStorage` does not exist on the
  // server, and disagreeing about it is a hydration error.
  const [glass, setGlass] = useState(false);
  useEffect(() => {
    try {
      setGlass(window.localStorage.getItem("island-glass") === "on");
    } catch {
      // Private mode, or storage refused. A default is not worth an error.
    }
  }, []);
  const toggleGlass = useCallback(() => {
    setGlass((was) => {
      try {
        window.localStorage.setItem("island-glass", was ? "off" : "on");
      } catch {
        // Not remembering is survivable; not toggling is not.
      }
      return !was;
    });
  }, []);
  const [id, setId] = useState<string | null>(null);
  const chat = useConversation(id);
  const { send } = chat;

  // The first message has to create the chat before it can be sent, and the
  // hook is bound to an id it does not have yet. The text waits here for one
  // render rather than `send` growing a second way to be called — the same
  // arrangement the full assistant screen uses.
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !queued) return;
    const text = queued;
    setQueued(null);
    void send(text);
  }, [id, queued, send]);

  const ask = useCallback(
    async (text: string) => {
      if (id) {
        await send(text);
        return;
      }
      const created = await api.post<ConversationOut>("/assistant/conversations", {});
      setId(created.id);
      setQueued(text);
    },
    [id, send],
  );

  /* ── moving the app ──────────────────────────────────────────────── */

  const [cameFrom, setCameFrom] = useState<{ path: string; label: string } | null>(null);
  const [heading, setHeading] = useState<string | null>(null);
  // Which navigations have already happened. Steps stream in and the array is
  // rebuilt on every event, so without this the same one would fire repeatedly.
  const done = useRef<Set<string>>(new Set());

  const go = useCallback(
    (place: Destination) => {
      if (place.path === pathname) return;
      setCameFrom({ path: pathname, label: labelFor(pathname) });
      setHeading(place.label);
      router.push(place.path);
      // **Get out of the way of the thing they just asked for.**
      //
      // Typing: collapse to the pill. The answer is not lost — it keeps
      // arriving there, and the island lives in the layout, so a navigation
      // never interrupts the turn.
      //
      // Talking: the panel has to stay, because it holds the only way to end
      // the call — so it shrinks into the corner instead, and the scrim goes
      // with it. Somebody who asked to be taken to a page is looking at the
      // page, not at the assistant.
      if (talkingRef.current) setDocked(true);
      else setOpen(false);
    },
    [pathname, router],
  );

  useEffect(() => {
    for (const step of chat.turn.steps) {
      if (step.tool_key !== OPEN_TOOL) continue;
      // The moment it is CALLED, not when it comes back. Resolving the
      // arguments against the access this session already holds moves the app
      // now and leaves the round trip to confirm it — see `guessDestination`.
      const guess = step.ok === undefined
        ? guessDestination(access, step.arguments?.page, step.arguments?.team)
        : null;
      const settled = destinationOf(step);
      const place = settled ?? guess;
      if (!place) continue;
      if (done.current.has(place.path)) continue;
      done.current.add(place.path);
      go(place);
    }
  }, [chat.turn.steps, access, go]);

  // The chip is a courtesy, not a queue. One that outlived the next question
  // would offer to undo a move nobody remembers asking for.
  useEffect(() => {
    if (!cameFrom) return;
    const timer = window.setTimeout(() => setCameFrom(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [cameFrom]);

  useEffect(() => {
    if (!heading) return;
    const timer = window.setTimeout(() => setHeading(null), 1600);
    return () => window.clearTimeout(timer);
  }, [heading]);

  /* ── opening and closing ─────────────────────────────────────────── */

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // ⌘J / Ctrl+J. ⌘K is the command palette; the two are neighbours on
      // purpose — one finds a screen, the other asks a question.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((was) => !was);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        setTalking(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // **No click-outside dismissal, deliberately.**
  //
  // It used to close on any mousedown elsewhere, which meant clicking a tab or
  // a rail link — navigating, the most ordinary thing there is — shut the
  // assistant. That is the opposite of what it is for: the whole point of
  // living in the shell is being there while you move around. It closes on
  // Escape, on its own X, and on nothing else.

  /* ── what the orb is doing ───────────────────────────────────────── */

  // The spoken assistant. Its own switch on the backend, separate from
  // read-aloud, and it needs WebRTC — so it is offered only where both say yes
  // rather than shown and then failing when somebody presses it.
  const [talking, setTalking] = useState(false);
  // Read inside `go`, which is created before `talking` is declared and
  // must not be rebuilt every time a call starts or ends.
  const talkingRef = useRef(false);
  talkingRef.current = talking;
  const canTalk = Boolean(status?.realtime_enabled) && realtimeSupported();

  // The call is held here rather than inside a full-screen overlay, because
  // the point of the island is that the app stays visible and usable while you
  // talk to it. `start` guards against being called twice, so a re-render
  // cannot open a second connection.
  const voice = useRealtime({ enabled: talking });
  const { start: startVoice, stop: stopVoice } = voice;
  // Started by the effect, ended by its cleanup — rather than an `else stop()`
  // in the same body. The cleanup form is symmetric, so a double-invoked
  // effect (React does exactly that in development) ends with one connection
  // instead of two, and unmounting the island always closes the microphone.
  useEffect(() => {
    if (!talking) return;
    startVoice();
    return () => stopVoice();
  }, [talking, startVoice, stopVoice]);

  // Talking only makes sense with the panel open — the caption, the transcript
  // and the way out all live in it.
  useEffect(() => {
    if (talking) setOpen(true);
    // Ending a call hands the screen back to the typed chat, which is not
    // readable at card size.
    else setDocked(false);
  }, [talking]);

  // Closing forgets the shape. Docking is a thing you do to get a page back,
  // not a preference — reopening from the pill should give the full panel
  // rather than the card somebody last tucked away.
  useEffect(() => {
    if (!open) setDocked(false);
  }, [open]);

  // Spoken tool calls report in the same shape typed ones do, so the same
  // reader finds them and the same navigation happens. Each acted on once.
  // Push-to-talk into the typed field. Disabled during a call: two things
  // holding the microphone at once is a device conflict, and the call is
  // already listening.
  const dictation = useDictation({ enabled: open && !talking });

  const spoken = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!talking) {
      spoken.current.clear();
      return;
    }
    for (const step of voice.steps) {
      if (step.tool_key !== OPEN_TOOL || spoken.current.has(step.id)) continue;
      const place =
        destinationOf(step) ??
        guessDestination(access, step.arguments?.page, step.arguments?.team);
      if (!place) continue;
      spoken.current.add(step.id);
      go(place);
    }
  }, [talking, voice.steps, access, go]);
  const phase = chat.turn.phase;
  const orb: OrbState = talking
    ? voiceOrb(voice.phase)
    : dictation.listening
      ? "listening"
      : phase === "waiting"
        ? "thinking"
        : phase === "answering"
          ? "speaking"
          : "idle";

  // Driven by the real audio on both sides rather than by an invented envelope:
  // the person's own stream while they are being heard, what comes back while
  // the assistant is talking.
  const theirs = useStreamLevel(voice.remoteStream, talking && voice.phase === "speaking");
  const mine = useStreamLevel(
    voice.micStream,
    talking && !voice.muted && voice.phase !== "speaking" && voice.phase !== "working",
  );
  const level = voice.phase === "speaking" ? theirs : mine;

  const line = useMemo(
    () => statusLine({ heading, phase, steps: chat.turn.steps, answer: chat.turn.answer }),
    [heading, phase, chat.turn.steps, chat.turn.answer],
  );

  const busy = chat.busy;

  return (
    <>
      {/* **Only for the typed chat, and only lightly.**
          Somebody reading a report and asking about it must still be able to
          read the report, and during a spoken call the screen behind is the
          entire point — so a call never dims anything, and neither does the
          docked card. */}
      <div
        aria-hidden
        className={clsx(
          "fixed inset-0 z-40 bg-app/25 transition-opacity duration-300",
          open && !talking && !docked ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div className="pointer-events-none fixed inset-0 z-50">
        {/* ── the pill ──
            Top right, out of the tab strip's way, and a fixed size. It never
            grows into the panel: that is what used to stutter. */}
        <div className="absolute right-4 top-3 flex flex-col items-end gap-2">
          <div
            // Shown only when the panel is not. Docked, the card in the corner
            // IS the island — a pill above it as well would be two of them.
            data-shown={!open}
            className={clsx(
              "island-pill island-arrive lift pointer-events-auto flex h-11 items-center",
              "gap-2.5 rounded-full bg-panel pl-2.5 pr-2 text-ink",
              // Capped to the strip of space the tab row reserves for it
              // (`TabStrip`'s `pr`). A pill that could grow past that would
              // start covering chips again the moment it had something to say.
              line ? "w-[min(70vw,296px)]" : "w-auto",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen((was) => !was)}
              aria-label="Ask the assistant"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <Orb state={orb} level={talking ? level : undefined} size={30} className="shrink-0" />
              <span
                key={line ?? "idle"}
                className="island-line min-w-0 flex-1 truncate text-[12.5px]"
              >
                {line ?? <span className="text-ink-3">Ask Hamdaz</span>}
              </span>
            </button>

            {!line && (
              <span className="hidden shrink-0 items-center gap-0.5 rounded-full bg-panel-2 px-1.5 py-0.5 text-[10px] text-ink-4 sm:inline-flex">
                <Command className="size-2.5" strokeWidth={2.4} />J
              </span>
            )}

            {canTalk && !talking && (
              <button
                onClick={() => setTalking(true)}
                title="Talk to it"
                aria-label="Talk to it"
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-panel-2 hover:text-ink"
              >
                <AudioLines className="size-3.5" strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Under the pill rather than inside it, so it cannot push the pill's
              own contents around as it comes and goes. */}
          {cameFrom && !open && (
            <button
              onClick={() => {
                router.push(cameFrom.path);
                setCameFrom(null);
              }}
              className="island-line lift pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-[11.5px] text-ink-2"
            >
              <ArrowLeft className="size-3" strokeWidth={2.4} />
              Back to {cameFrom.label}
            </button>
          )}
        </div>

        {/* ── the panel ──
            Laid out once at its final size and slid in by the GPU. Two shapes:
            the tall one hanging off the pill, and the small card in the bottom
            corner for when the screen matters more than the conversation. */}
        <div
          data-shown={open}
          data-dock={docked}
          className={clsx(
            "island-panel lift pointer-events-auto absolute flex flex-col",
            "overflow-hidden text-ink",
            !(docked && glass) && "bg-panel shadow-[var(--shadow-float)]",
            // `dvh`, not `vh`, and a `min()` around the height. On a short
            // window — or a phone, where the browser's own chrome eats the
            // difference — a fixed 330px card measured from `bottom-4` ran off
            // the bottom of the screen and took its controls with it.
            docked
              ? "bottom-5 right-4 h-[min(330px,calc(100dvh-6rem))] w-[min(92vw,330px)] rounded-[22px]"
              : "right-4 top-3 h-[min(72dvh,580px)] max-h-[calc(100dvh-1.5rem)] w-[min(94vw,440px)] rounded-[24px]",
            // Glass is for the small card only. Blurring a backdrop costs real
            // frame time, which is worth paying in a corner and not behind a
            // panel covering a third of the screen.
            docked && glass && "island-glass",
          )}
          aria-hidden={!open}
        >
          <header className="flex shrink-0 items-center gap-2 px-3.5 py-2.5">
            <Orb
              state={orb}
              level={talking ? level : undefined}
              size={docked ? 22 : 26}
              className="shrink-0"
            />
            <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">
              {talking
                ? voiceLine(voice)
                : (line ?? "Ask about your work, or say where to go.")}
            </p>

            {canTalk && !talking && (
              <Tool
                icon={AudioLines}
                label="Talk to it instead"
                onClick={() => setTalking(true)}
              />
            )}
            {docked && (
              <Tool
                icon={glass ? Droplet : Droplets}
                label={glass ? "Make it solid" : "See through it"}
                onClick={toggleGlass}
              />
            )}
            {/* The one control that is only about looking at the app: get small
                and go to the corner, so the screen underneath is whole again. */}
            <Tool
              icon={docked ? Expand : Shrink}
              label={docked ? "Make it bigger" : "Tuck it into the corner"}
              onClick={() => setDocked((was) => !was)}
            />
            {id && !docked && (
              <Link
                href={`/assistant?c=${id}`}
                onClick={() => setOpen(false)}
                title="Open the full screen"
                className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-panel-2 hover:text-ink"
              >
                <Maximize2 className="size-3.5" strokeWidth={2} />
              </Link>
            )}
            <Tool
              icon={X}
              label="Close"
              onClick={() => {
                setOpen(false);
                setTalking(false);
              }}
            />
          </header>

          {talking ? (
            <Talk
              session={voice}
              level={level}
              compact={docked}
              onType={() => setTalking(false)}
              onEnd={() => setTalking(false)}
            />
          ) : (
            <>
              <Thread chat={chat} me={user.display_name} open={open} />
              <Ask
                busy={busy}
                blocked={Boolean(chat.turn.pending)}
                dictation={dictation}
                onSend={ask}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** A round icon button in the panel header. Four of them, all the same. */
function Tool({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-panel-2 hover:text-ink"
    >
      <Icon className="size-3.5" strokeWidth={2} />
    </button>
  );
}

/* ── the thread ────────────────────────────────────────────────────── */

function Thread({
  chat,
  me,
  open,
}: {
  chat: ReturnType<typeof useConversation>;
  me: string;
  open: boolean;
}) {
  const floor = useRef<HTMLDivElement>(null);

  // Follows the answer as it is written, and lands at the bottom when the
  // island is opened onto an existing chat.
  useEffect(() => {
    if (!open) return;
    floor.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [open, chat.messages.length, chat.turn.answer, chat.turn.steps.length]);

  const empty = chat.messages.length === 0 && chat.turn.phase === "idle";

  return (
    <div className="no-bar min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 pb-2">
      {empty && <Openers />}

      {chat.messages.map((message) => (
        <Line key={message.id} message={message} me={me} />
      ))}

      {chat.turn.steps.length > 0 && chat.turn.phase !== "idle" && (
        <Steps steps={chat.turn.steps} />
      )}

      {chat.turn.pending && (
        <ConfirmCard
          actions={chat.turn.pending.actions}
          onRespond={(ok) => void chat.respond(ok)}
        />
      )}

      {chat.turn.error && (
        <p className="rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {chat.turn.error}
        </p>
      )}

      <div ref={floor} />
    </div>
  );
}

/** What it can do, said as things somebody would actually type. */
function Openers() {
  return (
    <div className="space-y-2 pt-1">
      <p className="text-[12px] text-ink-4">Try</p>
      {[
        "How much leave have I got left?",
        "Open the quotes page",
        "What is blocking presales this week?",
      ].map((text) => (
        <p key={text} className="rounded-[12px] bg-panel-2 px-3 py-2 text-[12.5px] text-ink-3">
          {text}
        </p>
      ))}
    </div>
  );
}

function Line({ message, me }: { message: AssistantMessageOut; me: string }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[82%] rounded-[14px] rounded-br-[5px] bg-panel-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          {message.content}
        </div>
        <Avatar name={me} seed={me} className="size-6 rounded-[8px] text-[9px]" />
      </div>
    );
  }
  const used = message.tool_calls ?? [];
  return (
    <div className="text-[12.5px] leading-relaxed">
      <Markdown text={message.content} />
      {used.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-4">
          <Wrench className="size-3" strokeWidth={2} />
          {used.length === 1 ? "1 lookup" : `${used.length} lookups`}
          {used.some((call) => call.ok === false) && (
            <Badge tone="danger">Something was refused</Badge>
          )}
        </p>
      )}
    </div>
  );
}

/** The turn in flight: what it is touching, and the answer as it arrives. */
function Steps({ steps }: { steps: ToolStep[] }) {
  const last = steps[steps.length - 1];
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-ink-4">
      <Wrench className="size-3 animate-pulse" strokeWidth={2} />
      {last?.label ?? "Working"}
    </p>
  );
}

/* ── talking to it ─────────────────────────────────────────────────── */

/**
 * A spoken conversation, inside the island rather than over the whole window.
 *
 * The full-screen version on `/assistant` is right for sitting down with it.
 * This one is right for the other case — asking something without leaving the
 * screen you are working on — and that only holds if the screen stays visible,
 * which is the entire reason it is not a portal.
 *
 * The orb is the interface. There is no button to press to speak: the session
 * decides when somebody is talking, and the shape answers their actual voice.
 * Everything else here is a way out — mute, end, or go back to typing.
 */
function Talk({
  session,
  level,
  compact,
  onType,
  onEnd,
}: {
  session: RealtimeSession;
  level: React.RefObject<number>;
  /** Docked in the corner: the orb shrinks and the transcript goes. */
  compact?: boolean;
  onType: () => void;
  onEnd: () => void;
}) {
  const floor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    floor.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [session.lines.length, session.transcript, session.steps.length]);

  const live = isLive(session.phase);
  const said = session.transcript || session.heard;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-center pt-1">
        <Orb state={voiceOrb(session.phase)} level={level} size={compact ? 64 : 128} />
      </div>

      {/* **The one part that grows, and therefore the only part that scrolls.**
          A spoken answer runs to a paragraph or three. This used to be a
          fixed-height block, so a long one overflowed the card, pushed the
          controls off the bottom of the screen and was cut off mid-sentence
          with no way to read the rest. Everything around it is `shrink-0` and
          this is `min-h-0 flex-1 overflow-y-auto`, which is what keeps End and
          the microphone on screen however much gets said.

          Left-aligned once it is more than a line: centred text is fine for
          "Listening" and unreadable for a paragraph. */}
      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-4 pt-2">
        {said ? (
          <p className="text-[12.5px] leading-relaxed text-ink">{said}</p>
        ) : (
          <p className="pt-1 text-center text-[12.5px] text-ink-4">{voiceLine(session)}</p>
        )}
        {/* Earlier turns, under the live one. Hidden on the small card, where
            there is only room for what is being said now. */}
        {!compact &&
          session.lines
            .filter((line) => line.text && line.text !== said)
            .slice(-6)
            .map((line) => (
              <p
                key={line.id}
                className={clsx(
                  "mt-2 text-[12px] leading-relaxed",
                  line.who === "you" ? "text-ink-3" : "text-ink-2",
                )}
              >
                <span className="mr-1.5 text-[10.5px] uppercase tracking-wide text-ink-4">
                  {line.who === "you" ? "You" : "It"}
                </span>
                {line.text}
              </p>
            ))}
        <div ref={floor} />
      </div>

      {session.error && (
        <p className="mx-4 mt-2 shrink-0 rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {session.error}
        </p>
      )}

      {/* A write it wants to make. Agreeing is done out loud — the model is
          asking — so the only button here is the one that says no, which is
          the one somebody needs when speaking is not being understood. */}
      {session.pending && (
        <div className="mx-4 mt-2 shrink-0 rounded-[12px] bg-warn-soft px-3 py-2">
          <p className="text-[12px] text-warn">
            Waiting for you to agree to <strong>{session.pending.label}</strong>.
          </p>
          <button
            onClick={session.decline}
            className="mt-1.5 text-[11.5px] text-ink-3 underline underline-offset-2 hover:text-ink"
          >
            No, don&apos;t
          </button>
        </div>
      )}

      {/* The tool being run, pinned above the controls rather than in the
          scroller: it is the one wait in a spoken conversation with no sound
          in it, so it must not be something you have to scroll to find. */}
      {session.running && (
        <p className="flex shrink-0 items-center gap-1.5 px-4 pt-1.5 text-[11.5px] text-ink-4">
          <Wrench className="size-3 animate-pulse" strokeWidth={2} />
          {session.running}
        </p>
      )}

      <div className="flex shrink-0 items-center justify-center gap-2 px-3 py-3">
        <button
          onClick={() => session.setMuted(!session.muted)}
          disabled={!live}
          aria-pressed={session.muted}
          title={session.muted ? "Unmute" : "Mute"}
          className={clsx(
            "grid size-9 place-items-center rounded-full transition disabled:opacity-40",
            session.muted
              ? "bg-warn-soft text-warn"
              : "bg-panel-2 text-ink-3 hover:text-ink",
          )}
        >
          {session.muted ? (
            <MicOff className="size-4" strokeWidth={2} />
          ) : (
            <Mic className="size-4" strokeWidth={2} />
          )}
        </button>

        <button
          onClick={onEnd}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-danger-soft px-4 text-[12.5px] font-medium text-danger transition hover:bg-danger hover:text-white"
        >
          <Square className="size-3" strokeWidth={2.6} />
          End
        </button>

        <button
          onClick={onType}
          title="Type instead"
          className="grid size-9 place-items-center rounded-full bg-panel-2 text-ink-3 transition hover:text-ink"
        >
          <Keyboard className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** The orb's state for a spoken phase. */
function voiceOrb(phase: RealtimeSession["phase"]): OrbState {
  if (phase === "speaking") return "speaking";
  if (phase === "hearing") return "listening";
  if (phase === "connecting" || phase === "working") return "thinking";
  return "idle";
}

/** What to say when nobody is saying anything. */
function voiceLine(session: RealtimeSession): string {
  switch (session.phase) {
    case "connecting":
      return "Connecting…";
    case "working":
      return session.running ? `${session.running}…` : "Looking that up…";
    case "confirming":
      return "Waiting for you to agree";
    case "ended":
      return "That call has ended.";
    default:
      return session.muted ? "Muted" : "Listening — just talk.";
  }
}

/* ── the field ─────────────────────────────────────────────────────── */

function Ask({
  busy,
  blocked,
  dictation,
  onSend,
}: {
  busy: boolean;
  blocked: boolean;
  dictation: ReturnType<typeof useDictation>;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(120, element.scrollHeight)}px`;
  }, [text, dictation.transcript]);

  async function submit() {
    const body = text.trim();
    if (!body || busy || blocked) return;
    setText("");
    setFailed(null);
    try {
      await onSend(body);
    } catch (caught) {
      setText(body);
      setFailed(
        caught instanceof ApiError ? caught.message : "That could not be sent. Try again.",
      );
    }
  }

  const shown = dictation.listening
    ? [text, dictation.transcript].filter(Boolean).join(" ")
    : text;

  return (
    <div className="shrink-0 px-3 pb-3">
      {failed && <p className="mb-1.5 px-1 text-[11px] text-danger">{failed}</p>}
      <div className="flex items-end gap-1.5 rounded-[18px] bg-panel-2 px-2.5 py-1">
        <textarea
          ref={field}
          value={shown}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          disabled={blocked}
          placeholder={blocked ? "Answer the question above first" : "Ask, or say where to go…"}
          className="max-h-30 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4 disabled:opacity-60"
        />

        {dictation.supported && (
          <button
            onClick={() => {
              if (dictation.listening) {
                // Keep what was heard: stopping is "I have finished saying it",
                // not "forget that".
                setText((current) =>
                  [current, dictation.transcript].filter(Boolean).join(" "),
                );
                dictation.stop();
              } else {
                dictation.start();
              }
            }}
            disabled={blocked}
            aria-pressed={dictation.listening}
            title={dictation.listening ? "Stop" : "Dictate"}
            className={clsx(
              "mb-1 grid size-8 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
              dictation.listening ? "bg-danger text-white" : "text-ink-3 hover:bg-panel hover:text-ink",
            )}
          >
            {dictation.listening ? (
              <Square className="size-3" strokeWidth={2.6} />
            ) : (
              <Mic className="size-3.5" strokeWidth={2} />
            )}
          </button>
        )}

        <button
          onClick={() => void submit()}
          disabled={busy || blocked || !shown.trim()}
          aria-label="Send"
          className="mb-1 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-40"
        >
          <CornerDownLeft className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────────── */

/** What the pill says while it is closed. Null means "nothing is happening". */
function statusLine({
  heading,
  phase,
  steps,
  answer,
}: {
  heading: string | null;
  phase: string;
  steps: ToolStep[];
  answer: string;
}): string | null {
  if (heading) return `Opening ${heading}…`;
  if (phase === "confirming") return "Waiting for you to confirm";
  if (phase === "waiting") {
    const last = steps[steps.length - 1];
    return last ? `${last.label}…` : "Thinking…";
  }
  if (phase === "answering") {
    // The tail rather than the head: the end of what has been written is the
    // part that is still moving, and a pill showing a frozen first line reads
    // as stuck.
    const flat = answer.replace(/\s+/g, " ").trim();
    return flat ? `…${flat.slice(-70)}` : "Answering…";
  }
  return null;
}
