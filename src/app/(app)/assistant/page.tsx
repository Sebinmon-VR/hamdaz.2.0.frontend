"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Ban,
  CircleStop,
  Clock3,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Volume2,
  Wrench,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import { dictationSupported, useDictation, useSpeaker } from "@/lib/speech";
import { realtimeSupported } from "@/lib/realtime";
import {
  suggestionsFor,
  useAssistantStatus,
  useConversation,
  useConversations,
} from "@/lib/assistant";
import type { AssistantMessageOut, ConversationOut } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton, Spinner } from "@/components/ui/feedback";
import { Markdown } from "@/components/assistant/Markdown";
import { Orb } from "@/components/assistant/Orb";
import { ToolTrace } from "@/components/assistant/ToolTrace";
import { TurnArtifacts } from "@/components/assistant/ResultPreview";
import { ConfirmCard } from "@/components/assistant/ConfirmCard";
import { VoiceOverlay } from "@/components/assistant/VoiceOverlay";
import { RealtimeOverlay } from "@/components/assistant/RealtimeOverlay";

/**
 * The assistant, as a screen.
 *
 * It is a page rather than a panel bolted to the shell, and that is the same
 * reasoning the calendar screen already sets out: this is something people sit
 * with for minutes, and this app makes pages first-class in its tab strip — so a
 * conversation can be kept open beside the proposal it is about, linked to, and
 * come back after a reload. A drawer would have been none of those things.
 *
 * Three things on this screen exist because of how the backend actually works,
 * and each is doing a job:
 *
 * **The tool trace.** Every tool call is an HTTP request to the real endpoint
 * carrying the person's own session, so an answer is only as trustworthy as what
 * it was allowed to read. Showing the calls — including the refused ones — is
 * what makes that legible instead of magic. It runs along one line rather than
 * down the page: a turn that calls eight tools used to push the answer off the
 * bottom of the screen before it had finished arriving.
 *
 * **What a turn produced, as itself.** A tool that fetched a report puts the
 * report under the answer rather than leaving the model to describe it. The card
 * fetches through the reader's own session, so it can never show something the
 * API would have refused them.
 *
 * **The confirmation card.** A write that policy says must be approved parks the
 * whole run. Nothing has happened when the card appears, and the loop resumes
 * from that exact point on an answer, so the card is the action rather than a
 * notice about one.
 *
 * **Stopping does not cancel.** The turn runs in a background task on the server
 * and the response merely watches a queue, deliberately — a turn that died with
 * the connection after making a write would be worse than one that finishes
 * unwatched. So the stop button says it stops *watching*, and the answer is
 * there on a refresh.
 */
export default function AssistantPage() {
  const status = useAssistantStatus();
  const conversations = useConversations();
  const [id, setId] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);

  // `?c=` carries a conversation in from the island at the top of the app, so
  // "open this full size" continues the chat rather than starting another one
  // about the same thing. Read from the location on mount rather than through
  // useSearchParams: this page is statically rendered, and that hook would
  // need a Suspense boundary around the whole screen to stay that way.
  useEffect(() => {
    const carried = new URLSearchParams(window.location.search).get("c");
    if (carried) setId(carried);
  }, []);

  const conversation = useConversation(id);
  const { send } = conversation;

  // The first message has to create the chat before it can be sent, and the
  // hook is bound to an id it does not yet have. So the text waits here for one
  // render rather than `send` growing a second way to be called.
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !queued) return;
    const text = queued;
    setQueued(null);
    void send(text);
  }, [id, queued, send]);

  const start = useCallback(
    async (text: string) => {
      if (id) {
        await send(text);
        return;
      }
      const created = await api.post<ConversationOut>("/assistant/conversations", {});
      setId(created.id);
      setQueued(text);
      void conversations.mutate();
    },
    [id, send, conversations],
  );

  // A new chat is not created until something is said in it. An empty
  // conversation saved on every visit would fill the history with nothing.
  const reset = useCallback(() => {
    setId(null);
    setVoice(false);
  }, []);

  if (status.error) {
    return (
      <>
        <PageHead eyebrow="You" title="Assistant" />
        <ErrorState error={status.error} onRetry={() => status.mutate()} />
      </>
    );
  }

  if (!status.data) {
    return (
      <>
        <PageHead eyebrow="You" title="Assistant" />
        <PanelSkeleton lines={6} />
      </>
    );
  }

  if (!status.data.admitted) {
    return (
      <>
        <PageHead eyebrow="You" title="Assistant" />
        <Closed
          code={status.data.code}
          reason={status.data.reason}
          onRetry={() => status.mutate()}
        />
      </>
    );
  }

  // Three questions, and they have three different answers.
  //
  // `canHear` — reading an answer aloud. Generated on the server, so it needs
  // nothing of the browser and is offered wherever the voice is switched on.
  //
  // `canConverse` — a spoken conversation, where the browser is connected
  // straight to OpenAI. It needs a microphone and WebRTC, and it is the better
  // experience by a distance, so it wins where a super admin has enabled it.
  //
  // `canDictate` — the older arrangement: the browser transcribes, the text
  // chat answers, a speech model reads it back. Kept for the case where voice
  // is on but a spoken conversation is not.
  //
  // Both spoken paths need `SpeechRecognition` or `RTCPeerConnection`, neither
  // of which Firefox offers in full — so the button is hidden there rather than
  // being broken.
  const canHear = status.data.voice_enabled;
  const canConverse = status.data.realtime_enabled && realtimeSupported();
  const canDictate = canHear && dictationSupported();
  const canSpeak = canConverse || canDictate;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      <PageHead
        eyebrow="You"
        title="Assistant"
        lead="It acts as you, through the same permission checks."
        meta={status.data.model ?? undefined}
        actions={
          <>
            {canSpeak && (
              <Button variant="accent" icon={AudioLines} onClick={() => setVoice(true)}>
                {canConverse ? "Talk" : "Voice"}
              </Button>
            )}
            <Button icon={Plus} onClick={reset}>
              New chat
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-3.5 lg:grid-cols-[264px_1fr]">
        <History
          conversations={conversations.data ?? []}
          loading={!conversations.data}
          selected={id}
          onSelect={setId}
          onNew={reset}
          onDeleted={(gone) => {
            if (gone === id) setId(null);
            void conversations.mutate();
          }}
        />

        <Thread
          conversation={conversation}
          suggestions={suggestionsFor(status.data)}
          canSpeak={canSpeak}
          canHear={canHear}
          onSend={start}
          onVoice={() => setVoice(true)}
        />
      </div>

      {/* A spoken conversation is its own loop and its own record on the
          server — it opens a run of its own rather than continuing this chat,
          which is why it takes nothing from the conversation above. The
          dictation screen *is* this chat, held differently, so it does. */}
      {canConverse ? (
        <RealtimeOverlay
          open={voice}
          onClose={() => setVoice(false)}
          onType={() => setVoice(false)}
        />
      ) : (
        canDictate && (
          <VoiceOverlay
            open={voice}
            onClose={() => setVoice(false)}
            conversation={{
              ...conversation,
              // Voice mode is the same conversation, and its first utterance
              // has to be able to create one exactly as the composer does.
              send: start,
            }}
          />
        )
      )}
    </div>
  );
}

/* ── not for you, or not yet ─────────────────────────────────────────── */

/**
 * Why it is not available, in the backend's own words.
 *
 * Every one of these codes arrives with a sentence written for a person to
 * read, so the sentence is shown verbatim and the code only decides the shape
 * around it — which of these is temporary, and whether there is anything the
 * reader can do about it.
 */
function Closed({
  code,
  reason,
  onRetry,
}: {
  code: string | null;
  reason: string | null;
  onRetry: () => void;
}) {
  const temporary = code === "rate_limited" || code === "cost_cap_user" || code === "cost_cap_total";
  return (
    <Empty
      icon={temporary ? Clock3 : Ban}
      title={
        code === "disabled"
          ? "The assistant is switched off"
          : code === "not_released"
            ? "Not released to you yet"
            : temporary
              ? "Back later today"
              : "Not available to you"
      }
      body={
        <>
          {reason ?? "The assistant is not available to you at the moment."}
          {code === "not_released" && (
            <>
              {" "}
              It is being released a team at a time, and a super admin decides who is next.
            </>
          )}
        </>
      }
      action={temporary ? <Button onClick={onRetry}>Check again</Button> : undefined}
    />
  );
}

/* ── the chats you have had ──────────────────────────────────────────── */

function History({
  conversations,
  loading,
  selected,
  onSelect,
  onNew,
  onDeleted,
}: {
  conversations: ConversationOut[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/assistant/conversations/${id}`);
      onDeleted(id);
    } catch {
      // Already gone, most likely. The list refresh below settles it either way.
      onDeleted(id);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Panel className="hidden min-h-0 flex-col p-3 lg:flex">
      <button
        onClick={onNew}
        className={clsx(
          "mb-2 flex h-10 shrink-0 items-center gap-2.5 rounded-[13px] px-3 text-[13px] font-medium transition",
          selected === null
            ? "bg-accent text-accent-ink"
            : "text-ink-2 hover:bg-panel-2 hover:text-ink",
        )}
      >
        <Plus className="size-4" strokeWidth={2.2} />
        New chat
      </button>

      <p className="micro shrink-0 px-3 pb-1.5 pt-2 text-ink-4">Earlier</p>

      <div className="no-bar min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {loading ? (
          <div className="space-y-1.5 px-1 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-9 rounded-[11px]" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-4 text-[12px] leading-relaxed text-ink-4">
            Nothing yet. A chat is kept once you have said something in it.
          </p>
        ) : (
          conversations.map((chat) => {
            const on = chat.id === selected;
            return (
              <div
                key={chat.id}
                className={clsx(
                  "group flex items-center rounded-[11px] transition",
                  on ? "bg-row text-row-ink" : "hover:bg-panel-2",
                )}
              >
                <button
                  onClick={() => onSelect(chat.id)}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                >
                  <span className="block truncate text-[12.5px] font-medium">
                    {chat.title ?? "Untitled"}
                  </span>
                  <span
                    className={clsx(
                      "block truncate text-[10.5px]",
                      on ? "text-row-ink-2" : "text-ink-4",
                    )}
                  >
                    {relative(chat.last_message_at ?? chat.created_at)}
                  </span>
                </button>
                <button
                  onClick={() => void remove(chat.id)}
                  aria-label={`Delete ${chat.title ?? "this chat"}`}
                  className={clsx(
                    "mr-1.5 grid size-7 shrink-0 place-items-center rounded-lg opacity-0 transition group-hover:opacity-100",
                    on ? "text-row-ink-2 hover:text-row-ink" : "text-ink-4 hover:text-danger",
                  )}
                >
                  {deleting === chat.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" strokeWidth={1.9} />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}

/* ── the conversation ────────────────────────────────────────────────── */

function Thread({
  conversation,
  suggestions,
  canSpeak,
  canHear,
  onSend,
  onVoice,
}: {
  conversation: ReturnType<typeof useConversation>;
  suggestions: string[];
  canSpeak: boolean;
  canHear: boolean;
  onSend: (text: string) => Promise<void>;
  onVoice: () => void;
}) {
  const session = useSession();
  const { messages, turn, busy, respond, detach, refresh, loading, loadError } = conversation;
  const foot = useRef<HTMLDivElement>(null);

  // One speaker for the whole thread rather than one per message: two answers
  // playing over each other is the obvious failure, and it is avoided by there
  // being only one mouth to begin with.
  const speaker = useSpeaker();
  const [reading, setReading] = useState<string | null>(null);

  function readAloud(id: string, text: string) {
    if (reading === id && speaker.speaking) {
      speaker.cancel();
      setReading(null);
      return;
    }
    setReading(id);
    speaker.speak(text);
  }

  // Following the answer as it is written. `auto` rather than `smooth`: a
  // smooth scroll cannot keep up with tokens arriving and ends up permanently
  // a paragraph behind.
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [messages.length, turn.answer, turn.steps.length, turn.phase]);

  const empty = messages.length === 0 && turn.phase === "idle";

  return (
    <Panel className="flex min-h-0 flex-col">
      <div className="no-bar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {loadError ? (
          <ErrorState error={loadError} onRetry={() => void refresh()} />
        ) : loading ? (
          <PanelSkeleton lines={5} className="bg-transparent shadow-none" />
        ) : empty ? (
          <Opening suggestions={suggestions} canSpeak={canSpeak} onPick={onSend} onVoice={onVoice} />
        ) : (
          <>
            {messages.map((message) => (
              <Message
                key={`${message.id}-${message.seq}`}
                message={message}
                me={session.user.display_name}
                canHear={canHear}
                reading={reading === message.id && speaker.speaking}
                onRead={() => readAloud(message.id, message.content)}
              />
            ))}

            {/* The turn in flight. Its own block rather than a synthesised
                message, because it carries things a saved message does not:
                the live trace, and the card that stops everything. */}
            {turn.phase !== "idle" && (
              <div className="flex gap-3">
                <Mark />
                <div className="min-w-0 flex-1 space-y-2.5">
                  {turn.steps.length > 0 && <ToolTrace steps={turn.steps} />}

                  {turn.answer ? (
                    <div className="text-[13.5px] text-ink">
                      <Markdown text={turn.answer} />
                      {busy && <Caret />}
                    </div>
                  ) : (
                    busy && <Thinking steps={turn.steps.length} />
                  )}

                  {/* What the turn produced, as itself rather than as a
                      paragraph about itself. Under the answer, because the
                      answer is what was asked for and this is what it is
                      about. */}
                  <TurnArtifacts steps={turn.steps} />

                  {turn.phase === "confirming" && turn.pending && (
                    <ConfirmCard actions={turn.pending.actions} onRespond={(ok) => void respond(ok)} />
                  )}

                  {turn.phase === "detached" && (
                    <div className="flex flex-wrap items-center gap-3 rounded-[13px] bg-panel-2 px-3.5 py-3 text-[12px] text-ink-3">
                      <span className="min-w-0 flex-1">
                        Stopped watching. The turn carries on and is saved either way — it
                        will be here when it finishes.
                      </span>
                      <Button size="sm" icon={RefreshCw} onClick={() => void refresh()}>
                        Refresh
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {turn.error && (
          <div className="flex items-start gap-3 rounded-[20px] bg-danger-soft px-5 py-3.5 text-[12.5px] leading-relaxed text-danger">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
            <span className="min-w-0 flex-1">{turn.error}</span>
          </div>
        )}

        <div ref={foot} />
      </div>

      <Composer
        busy={busy}
        blocked={turn.phase === "confirming"}
        canSpeak={canSpeak}
        onSend={onSend}
        onStop={detach}
        onVoice={onVoice}
      />
    </Panel>
  );
}

/** The opening screen: what it is, and four things worth asking it. */
function Opening({
  suggestions,
  canSpeak,
  onPick,
  onVoice,
}: {
  suggestions: string[];
  canSpeak: boolean;
  onPick: (text: string) => Promise<void>;
  onVoice: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
      <Orb state="idle" size={132} />
      <div>
        <p className="text-[17px] font-semibold text-ink">How can I help?</p>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-ink-3">
          Ask about leave, your calendar, quotes, teams or the people directory. It works
          through the same permissions you have, so it can only see what you can.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => void onPick(suggestion)}
              className="rounded-[13px] bg-panel-2 px-3.5 py-2 text-[12.5px] text-ink-2 transition hover:bg-panel-3 hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {canSpeak && (
        <Button variant="outline" icon={AudioLines} onClick={onVoice}>
          Talk to it instead
        </Button>
      )}
    </div>
  );
}

/** One saved message. */
function Message({
  message,
  me,
  canHear,
  reading,
  onRead,
}: {
  message: AssistantMessageOut;
  me: string;
  canHear: boolean;
  reading: boolean;
  onRead: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[80%] rounded-[18px] rounded-br-[6px] bg-panel-2 px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
          {message.content}
        </div>
        <Avatar name={me} seed={me} className="size-7 rounded-[9px] text-[9px]" />
      </div>
    );
  }

  const used = message.tool_calls ?? [];
  return (
    <div className="flex gap-3">
      <Mark />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-[13.5px] text-ink">
          <Markdown text={message.content} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {used.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-4">
              <Wrench className="size-3" strokeWidth={2} />
              {used.length === 1 ? "1 tool" : `${used.length} tools`}
              {used.some((call) => call.ok === false) && (
                <Badge tone="danger">Something was refused</Badge>
              )}
            </p>
          )}
          {/* Reading an answer costs a request and is billed per character, so
              it is a button rather than something that happens on its own. The
              hands-free screen is where speaking is the default. */}
          {canHear && message.content.trim() && (
            <button
              onClick={onRead}
              aria-label={reading ? "Stop reading" : "Read this aloud"}
              title={reading ? "Stop reading" : "Read this aloud"}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] transition",
                reading
                  ? "bg-accent-soft text-accent-text"
                  : "text-ink-4 hover:bg-panel-2 hover:text-ink-2",
              )}
            >
              {reading ? (
                <Square className="size-2.5" strokeWidth={2.6} />
              ) : (
                <Volume2 className="size-3" strokeWidth={2} />
              )}
              {reading ? "Stop" : "Listen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The assistant's face in the thread. */
function Mark() {
  return (
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-ink">
      <Sparkles className="size-3.5" strokeWidth={2.2} />
    </span>
  );
}

/**
 * What it is doing before there is anything to read.
 *
 * It names the step rather than spinning: "reading your leave" is a different
 * wait from "thinking", and on a turn that calls three endpoints the difference
 * between those is most of the wait.
 */
function Thinking({ steps }: { steps: number }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
      <Spinner className="size-3.5" />
      {steps === 0 ? "Thinking" : steps === 1 ? "Reading what it needs" : "Putting it together"}
    </p>
  );
}

/** The cursor at the end of an answer still being written. */
function Caret() {
  return (
    <span
      aria-hidden
      className="progress-tip ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] rounded-full bg-accent align-baseline"
    />
  );
}

/* ── saying something ────────────────────────────────────────────────── */

/**
 * The composer.
 *
 * Enter sends and Shift+Enter starts a line, which is what every chat in the
 * world does and what people's hands already expect. The microphone here is
 * push-to-talk into the field rather than a second voice mode: it dictates, and
 * what is dictated can be read and corrected before it goes — the hands-free
 * loop lives behind the Voice button, where nothing is proofread.
 */
function Composer({
  busy,
  blocked,
  canSpeak,
  onSend,
  onStop,
  onVoice,
}: {
  busy: boolean;
  blocked: boolean;
  canSpeak: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  onVoice: () => void;
}) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation({
    onFinal: (said) => setText((current) => (current ? `${current} ${said}` : said)),
  });

  // Grows with the text to a ceiling, then scrolls. Measured rather than
  // guessed at with rows, since a wrapped line is not a newline.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(168, element.scrollHeight)}px`;
  }, [text, dictation.transcript]);

  async function submit() {
    const body = text.trim();
    if (!body || busy || blocked) return;
    setText("");
    setFailed(null);
    try {
      await onSend(body);
    } catch (caught) {
      // Putting the text back is the point: losing what somebody typed because
      // the chat was busy is worse than the refusal itself.
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
    <div className="shrink-0 border-t border-line px-4 py-3 sm:px-6">
      {failed && <p className="mb-2 text-[11.5px] text-danger">{failed}</p>}
      {blocked && (
        <p className="mb-2 text-[11.5px] text-warn">
          Answer the question above before carrying on.
        </p>
      )}

      <div className="flex items-end gap-2 rounded-[20px] bg-panel-2 px-3 py-2">
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
          placeholder={
            blocked ? "Waiting on your answer above" : "Ask about your work here…"
          }
          className="max-h-42 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4 disabled:opacity-60"
        />

        {dictation.supported && (
          <button
            onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            disabled={blocked}
            aria-pressed={dictation.listening}
            title={dictation.listening ? "Stop dictating" : "Dictate"}
            className={clsx(
              "grid size-9 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
              dictation.listening
                ? "bg-accent text-accent-ink"
                : "text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            <Mic className="size-4" strokeWidth={1.9} />
          </button>
        )}

        {busy ? (
          <button
            onClick={onStop}
            title="Stop watching this answer. The turn still finishes on the server."
            className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-3 text-ink-2 transition hover:text-ink"
          >
            <CircleStop className="size-4" strokeWidth={1.9} />
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={!text.trim() || blocked}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            <Send className="size-4" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-3 px-1">
        <p className="min-w-0 flex-1 truncate text-[10.5px] text-ink-4">
          {dictation.error ??
            (dictation.listening
              ? "Listening — it will stop when you do."
              : "Enter sends, Shift+Enter starts a line.")}
        </p>
        {canSpeak && (
          <button
            onClick={onVoice}
            className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-ink-4 transition hover:text-ink-2"
          >
            <AudioLines className="size-3" strokeWidth={2} />
            Hands-free
          </button>
        )}
      </div>
    </div>
  );
}
