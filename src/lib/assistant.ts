"use client";

/**
 * Talking to the agent.
 *
 * Sending a message does not answer with JSON. A turn calls tools as it goes
 * and can take a while, so the backend replies with Server-Sent Events and this
 * file turns that byte stream back into something a screen can render: the
 * answer arriving a token at a time, each tool as it is called and as it comes
 * back, and the card that appears when a write is waiting on somebody's yes.
 *
 * It is `fetch` rather than `EventSource` for two reasons that are both
 * requirements, not preferences: `EventSource` cannot POST, and the message has
 * to go in a body; and it cannot be aborted mid-stream in a way that leaves the
 * caller in control.
 *
 * **Detaching is not cancelling.** The backend runs a turn in a background task
 * and only watches a queue on the HTTP side, deliberately — a turn that died
 * with the connection *after* it had already made a write would be worse than
 * one that finishes unwatched. So closing the stream here stops the screen
 * following along; it does not stop the work, and only a super admin can
 * actually cancel a run. Everything in this file that says "stop" is careful to
 * mean the first thing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { ApiError, apiUrl } from "@/lib/api";
import { performActions, snapshotScreen } from "@/lib/screen";
import type {
  AssistantMessageOut,
  AssistantStatusOut,
  ConversationDetailOut,
  ConversationOut,
  PendingActionOut,
  VoiceOptionsOut,
} from "@/lib/types";

/* ── the events a turn emits ─────────────────────────────────────────── */

export interface ToolStep {
  tool_key: string;
  label: string;
  arguments?: Record<string, unknown>;
  /** Undefined while the call is still in flight. */
  ok?: boolean;
  status?: number;
  ms?: number;
  /** The first 500 characters of what came back, which is all the backend logs. */
  summary?: string;
}

export type StreamEvent =
  | { type: "run"; run_id: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; tool_key: string; label: string; arguments: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_key: string;
      label?: string;
      ok: boolean;
      status: number;
      ms?: number;
      summary?: string;
    }
  | { type: "confirm"; run_id: string; actions: PendingActionOut[] }
  /**
   * The turn is parked on the screen: the model asked for something only the
   * browser can do. The hook performs the actions and posts the results, and
   * the stream that answers is the turn carrying on.
   */
  | { type: "client_action"; run_id: string; actions: PendingActionOut[] }
  | { type: "error"; run_id: string; message: string }
  | {
      type: "done";
      run_id: string;
      status: string;
      cost_usd?: string;
      input_tokens?: number;
      output_tokens?: number;
      tool_calls?: number;
    };

/**
 * POSTs, then reads the event stream to the end.
 *
 * The parser is deliberately small and deliberately not a line-by-line one: SSE
 * frames are separated by a blank line and a chunk can split anywhere, so
 * anything less than a buffer that keeps the tail until it sees `\n\n` will
 * eventually drop half a token. The backend sends one JSON object per frame.
 */
export async function streamTurn(
  path: string,
  body: unknown,
  { signal, onEvent }: { signal?: AbortSignal; onEvent: (event: StreamEvent) => void },
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      credentials: "include",
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) return;
    throw new ApiError(0, "Could not reach the Hamdaz API.", cause);
  }

  if (!response.ok) {
    // Every refusal on these two routes is a sentence written for a person —
    // switched off, not released, over a cap, or already working on the last
    // message — so it is carried through verbatim rather than replaced.
    const payload = await response.json().catch(() => null);
    const detail = (payload as { detail?: unknown } | null)?.detail;
    throw new ApiError(
      response.status,
      typeof detail === "string" ? detail : response.statusText,
      payload,
    );
  }
  if (!response.body) throw new ApiError(0, "The assistant sent no answer.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const parsed = parseFrame(frame);
        if (parsed) onEvent(parsed);
        split = buffer.indexOf("\n\n");
      }
    }
  } catch (cause) {
    // An abort during `read()` is the caller detaching, which is normal.
    if (signal?.aborted) return;
    throw cause instanceof ApiError
      ? cause
      : new ApiError(0, "The connection to the assistant was lost.", cause);
  } finally {
    // Releasing rather than cancelling: the turn goes on either way, and this
    // only lets the browser reclaim the socket.
    reader.releaseLock();
  }
}

function parseFrame(frame: string): StreamEvent | null {
  let kind = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) kind = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    const payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
    return { ...payload, type: kind } as StreamEvent;
  } catch {
    // A frame that is not JSON is a frame this app does not know about. Better
    // ignored than allowed to break a turn that is otherwise going fine.
    return null;
  }
}

/* ── status ──────────────────────────────────────────────────────────── */

/**
 * May I use it, and what can it do for me.
 *
 * Asked before anything else is drawn. `modules` is this person's own tool list
 * after every policy is folded in, so it is what the suggestions are built from
 * — the assistant never offers something it would then refuse.
 */
export function useAssistantStatus() {
  return useSWR<AssistantStatusOut>("/assistant/status", {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

/**
 * The voices, and which one is configured.
 *
 * Open to **any signed-in person**, not admins alone, which is deliberate on the
 * backend's side and used both ways here: the admin screen needs the list to
 * offer a sample of each, and the chat needs to know whether a speaker button is
 * worth showing at all.
 *
 * `max_chars` matters to the caller. The endpoint refuses an over-long request
 * rather than truncating it, so a long answer has to be cut into pieces before
 * it is sent, not after it comes back.
 */
export function useVoiceOptions(enabled = true) {
  return useSWR<VoiceOptionsOut>(enabled ? "/assistant/voices" : null, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

export function useConversations(limit = 50) {
  return useSWR<ConversationOut[]>(`/assistant/conversations?limit=${limit}`, {
    revalidateOnFocus: false,
  });
}

/* ── one conversation, and the turn in flight ────────────────────────── */

export type TurnPhase =
  | "idle"
  /** The request is out; nothing has come back yet. */
  | "waiting"
  /** Tokens are arriving. */
  | "answering"
  /** A write is parked on the confirmation card. */
  | "confirming"
  /** The screen is doing what the assistant asked — a press, a fill, a scroll. */
  | "acting"
  /** The person stopped watching. The turn is still running on the server. */
  | "detached";

export interface Turn {
  phase: TurnPhase;
  /** The message just sent, shown before the server has it saved. */
  asked: string | null;
  /** The answer so far. */
  answer: string;
  /** Every tool this turn has touched, in order. */
  steps: ToolStep[];
  pending: { run_id: string; actions: PendingActionOut[] } | null;
  error: string | null;
}

const IDLE: Turn = {
  phase: "idle",
  asked: null,
  answer: "",
  steps: [],
  pending: null,
  error: null,
};

export interface Conversation {
  detail: ConversationDetailOut | undefined;
  /** Saved messages plus the one in flight, ready to render in order. */
  messages: AssistantMessageOut[];
  loading: boolean;
  loadError: unknown;
  turn: Turn;
  /** True while a turn is in flight — the composer is closed for the duration. */
  busy: boolean;
  send: (text: string) => Promise<void>;
  /** Answer the confirmation card. Declining streams a reply too. */
  respond: (approved: boolean) => Promise<void>;
  /** Stop following the answer. Does not stop the turn. */
  detach: () => void;
  refresh: KeyedMutator<ConversationDetailOut>;
  /** Cleared when a person dismisses a failure and carries on. */
  clearError: () => void;
}

/**
 * Everything one chat needs.
 *
 * Saved messages come from the API; the turn in flight lives here and is thrown
 * away the moment the server's own copy has landed. The join is ordered rather
 * than merged — the in-flight pair is always the newest thing in the list — so
 * there is no window where a message appears twice.
 */
export function useConversation(conversationId: string | null): Conversation {
  const key = conversationId ? `/assistant/conversations/${conversationId}` : null;
  const { data, error, isLoading, mutate } = useSWR<ConversationDetailOut>(key, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // Whether this person may delete, for the screen actions. Read here rather
  // than threaded in from every caller: the rule is the assistant's, and the
  // status is already cached by SWR for the chat that is open.
  const { data: status } = useAssistantStatus();
  const canDelete = useRef(false);
  canDelete.current = Boolean(status?.can_delete);

  const [turn, setTurn] = useState<Turn>(IDLE);
  const abort = useRef<AbortController | null>(null);
  // The run the confirmation card belongs to, kept out of state so `respond`
  // does not need it threaded through a closure that may already be stale.
  const openRun = useRef<string | null>(null);

  // Switching chats abandons the stream: its events belong to a conversation
  // that is no longer on screen, and applying them to this one would show one
  // chat's answer inside another.
  useEffect(() => {
    abort.current?.abort();
    abort.current = null;
    openRun.current = null;
    setTurn(IDLE);
  }, [conversationId]);

  useEffect(() => () => abort.current?.abort(), []);

  // A chat reopened while a write was still parked has its pending actions on
  // the detail payload rather than on any event, so the card comes back.
  //
  // A chat reopened while parked on the *screen* is different: the screen the
  // assistant was pressing on is gone with the reload, so the actions are
  // answered as not done and the turn is let go — see `report` below.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.pending) return;
    if (data.pending.status === "awaiting_client") {
      if (reported.current === data.pending.run_id) return;
      reported.current = data.pending.run_id;
      void report(
        data.pending.run_id,
        data.pending.actions.map((action) => ({
          call_id: action.call_id,
          ok: false,
          output: "Not done: the page was reloaded before the screen could act. Ask again if it still matters.",
        })),
      );
      return;
    }
    openRun.current = data.pending.run_id;
    setTurn((current) =>
      current.phase === "idle"
        ? { ...IDLE, phase: "confirming", pending: data.pending }
        : current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pending]);

  const run = useCallback(
    async (path: string, body: unknown, asked: string | null, continuing = false) => {
      const controller = new AbortController();
      abort.current = controller;
      // Continuing a turn keeps what it has said and done so far; the steps
      // and the answer belong to the same message, not a new one.
      setTurn((current) =>
        continuing ? { ...current, phase: "waiting", pending: null } : { ...IDLE, phase: "waiting", asked },
      );

      // Set from inside the event callback, so a ref-shaped holder rather than
      // a `let`: TypeScript cannot see an assignment made in a closure and
      // would narrow a plain variable to null at the check below.
      const parkedOn: { current: { run_id: string; actions: PendingActionOut[] } | null } = {
        current: null,
      };
      try {
        await streamTurn(path, body, {
          signal: controller.signal,
          onEvent: (event) => {
            setTurn((current) => reduce(current, event));
            if (event.type === "confirm") openRun.current = event.run_id;
            if (event.type === "client_action") {
              parkedOn.current = { run_id: event.run_id, actions: event.actions };
            }
          },
        });
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "Something went wrong.";
        setTurn((current) => ({ ...current, phase: "idle", error: message }));
        // The user message was saved before the turn started, so the server's
        // copy of the chat has moved on even when the turn itself failed.
        await mutate();
        return;
      } finally {
        abort.current = null;
      }

      // The turn stopped to let the screen act. Do it, then carry on with the
      // results — the answer to this message is on the far side of that.
      if (parkedOn.current && !controller.signal.aborted) {
        const parked = parkedOn.current;
        const results = await performActions(parked.actions, { canDelete: canDelete.current });
        await run(
          `/assistant/conversations/${conversationId}/client-result`,
          { run_id: parked.run_id, results },
          null,
          true,
        );
        return;
      }

      setTurn((current) => {
        // A parked write stays on screen: its card is the only way forward.
        if (current.phase === "confirming") return current;
        // Detaching already said its piece and must not be overwritten by the
        // stream ending, which is what detaching causes.
        if (current.phase === "detached") return current;
        return current.error ? { ...current, phase: "idle" } : IDLE;
      });
      await mutate();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate, conversationId],
  );

  /** Answer a turn parked on the screen, when the screen cannot act. */
  const report = useCallback(
    async (runId: string, results: { call_id: string; ok: boolean; output: string }[]) => {
      if (!conversationId) return;
      await run(
        `/assistant/conversations/${conversationId}/client-result`,
        { run_id: runId, results },
        null,
        true,
      );
    },
    [conversationId, run],
  );

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!conversationId || !body) return;
      // The route the person is looking at goes with every message, and so
      // does what is on it. The route is what makes "open this one" and
      // "summarise this" answerable; the controls are what make "press Save"
      // a press rather than a question. Both read at send time, so they are
      // the screen they are on now and not the one the chat opened on.
      await run(
        `/assistant/conversations/${conversationId}/messages`,
        { text: body, page: currentPath(), screen: snapshotScreen() ?? null },
        body,
      );
    },
    [conversationId, run],
  );

  const respond = useCallback(
    async (approved: boolean) => {
      const runId = openRun.current;
      if (!conversationId || !runId) return;
      openRun.current = null;
      await run(
        `/assistant/conversations/${conversationId}/confirm`,
        { run_id: runId, approved },
        null,
      );
    },
    [conversationId, run],
  );

  const detach = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setTurn((current) => ({ ...current, phase: "detached" }));
  }, []);

  const clearError = useCallback(() => {
    setTurn((current) => ({ ...current, error: null }));
  }, []);

  // The message in flight is appended unless the server's copy of it has
  // already arrived. Only the *last* saved message is compared, not every one:
  // asking the same question twice in a chat is ordinary, and matching on
  // content alone made the earlier copy vanish while the second was in flight.
  const saved = data?.messages ?? [];
  const last = saved[saved.length - 1];
  const alreadySaved = last?.role === "user" && last.content === turn.asked;
  const messages =
    turn.asked && turn.phase !== "idle" && !alreadySaved
      ? [...saved, local(turn.asked)]
      : saved;

  return {
    detail: data,
    messages,
    loading: isLoading && !data,
    loadError: error,
    turn,
    busy: turn.phase === "waiting" || turn.phase === "answering" || turn.phase === "acting",
    send,
    respond,
    detach,
    refresh: mutate,
    clearError,
  };
}

/** One event applied to the turn on screen. */
function reduce(turn: Turn, event: StreamEvent): Turn {
  switch (event.type) {
    case "run":
      return { ...turn, phase: "waiting" };
    case "text":
      return { ...turn, phase: "answering", answer: turn.answer + event.delta };
    case "tool_call":
      return {
        ...turn,
        steps: [
          ...turn.steps,
          { tool_key: event.tool_key, label: event.label, arguments: event.arguments },
        ],
      };
    case "tool_result": {
      // Matched to the newest call of that tool still waiting on a result: the
      // model may call the same tool twice in one round with different
      // arguments, and filling in the first would attach an answer to the
      // wrong question.
      const steps = [...turn.steps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].tool_key === event.tool_key && steps[i].ok === undefined) {
          steps[i] = {
            ...steps[i],
            ok: event.ok,
            status: event.status,
            ms: event.ms,
            summary: event.summary,
          };
          return { ...turn, steps };
        }
      }
      // A result with no call in front of it is a write that was confirmed on a
      // turn this screen did not watch start.
      return {
        ...turn,
        steps: [
          ...steps,
          {
            tool_key: event.tool_key,
            label: event.label ?? event.tool_key,
            ok: event.ok,
            status: event.status,
            ms: event.ms,
            summary: event.summary,
          },
        ],
      };
    }
    case "confirm":
      return {
        ...turn,
        phase: "confirming",
        pending: { run_id: event.run_id, actions: event.actions },
      };
    case "client_action":
      // Each action becomes a step on the trace, filled in when the result
      // comes back through the continued stream as an ordinary tool_result.
      return {
        ...turn,
        phase: "acting",
        pending: null,
        steps: [
          ...turn.steps,
          ...event.actions.map((action) => ({
            tool_key: action.tool_key,
            label: action.label,
            arguments: action.arguments,
          })),
        ],
      };
    case "error":
      return { ...turn, error: event.message };
    case "done":
      return turn;
    default:
      return turn;
  }
}

/** The message a person just sent, before the server's copy comes back. */
function local(text: string): AssistantMessageOut {
  return {
    id: "pending",
    run_id: null,
    seq: Number.MAX_SAFE_INTEGER,
    role: "user",
    content: text,
    tool_calls: null,
    created_at: new Date().toISOString(),
  };
}

/* ── what to ask it ──────────────────────────────────────────────────── */

/**
 * Openers, chosen from what this person's tools can actually answer.
 *
 * Built from `status.modules` rather than written as a fixed list, because the
 * tool list is per person: a suggestion the assistant would have to refuse is
 * worse than no suggestion, and this way a module a super admin has switched off
 * simply stops being offered.
 */
export function suggestionsFor(status: AssistantStatusOut | undefined): string[] {
  if (!status?.admitted) return [];
  const has = new Set(status.modules.map((m) => m.key));
  const out: string[] = [];
  if (has.has("reports")) out.push("Start my daily report.");
  if (has.has("leave")) out.push("How much leave do I have left this year?");
  if (has.has("meetings")) out.push("What is on my calendar tomorrow?");
  if (has.has("proposals")) out.push("Which proposal tasks are assigned to me?");
  if (has.has("quotes")) out.push("Show me the quotes raised this month.");
  if (has.has("teams")) out.push("Who is on the presales team?");
  if (has.has("directory")) out.push("Find everyone with 'engineer' in their job title.");
  if (has.has("me")) out.push("What can I reach in this system, and why?");
  if (has.has("dashboard")) out.push("Summarise my dashboard for me.");
  return out.slice(0, 4);
}

/** "leave.request_create" → "Leave". The module a tool belongs to, for a badge. */
export function moduleOf(toolKey: string): string {
  return toolKey.split(".")[0] ?? toolKey;
}


/**
 * The route the browser is on, for telling the assistant where somebody is.
 *
 * Read off `location` rather than through `usePathname`, because this is
 * called from inside a callback at the moment a message is sent — a hook would
 * capture the path at render time, which is the page they were looking at when
 * the chat opened rather than the one they are on now.
 */
export function currentPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname || undefined;
}
