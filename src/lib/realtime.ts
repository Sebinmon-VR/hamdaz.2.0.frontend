"use client";

/**
 * The spoken conversation.
 *
 * This is a different arrangement from reading an answer aloud, and the whole
 * file follows from the difference. Read-aloud is **our** loop: the chat answers
 * in text, then a speech model reads it out, and every turn passes through this
 * app. Realtime is **OpenAI's** loop — the browser opens a WebRTC connection
 * straight to them, streams the microphone into it, and hears speech back with
 * no turn of ours in between. That is what makes it feel like a conversation
 * rather than a walkie-talkie, and it is also what makes it the more delicate
 * thing to secure.
 *
 * Two rules keep it inside the same access model as everything else, and
 * **neither is enforced here**, which is the point:
 *
 * 1. The session is furnished on the server. Model, voice, instructions and the
 *    tool list are all fixed when the token is minted, so this file receives a
 *    key to a room it did not decorate. Nothing below sends `session.update`
 *    with tools or instructions, and it must stay that way — a client that
 *    could redefine its own session would make the whole arrangement theatre.
 * 2. Tools never execute in the browser. A call from the model is relayed to
 *    `/assistant/realtime/call`, which resolves the person's policy again and
 *    runs it through the same route as the text chat with their own session
 *    cookie. This file learns the *name* of a tool; it never learns its URL.
 *
 * The honest weak point is confirmation. In the text chat the server parks the
 * run and nothing can happen until a person answers. Here the server refuses a
 * confirmable write once and tells the model to ask out loud; the model asks,
 * hears an answer, and calls again — and it is this client that marks the second
 * call confirmed. The judgement of "they said yes" is the model's. That is why
 * writes are their own switch, off by default, and why the card below is shown
 * on screen even though the conversation is meant to be hands-free: somebody
 * should be able to see what was asked, and stop it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type {
  RealtimeCallOut,
  RealtimeSessionOut,
  RealtimeToolOut,
} from "@/lib/types";

/**
 * Where the browser trades its offer for an answer.
 *
 * The session is already described by the ephemeral secret, so no model or
 * configuration is sent with it — only the SDP. Anything else here would be
 * this client trying to furnish a room the server has already furnished.
 */
const OPENAI_CALLS = "https://api.openai.com/v1/realtime/calls";

/** The channel OpenAI expects for session events. The name is theirs. */
const EVENT_CHANNEL = "oai-events";

export type RealtimePhase =
  | "idle"
  /** Minting a token and negotiating the connection. */
  | "connecting"
  /** Connected, microphone open, nobody talking. */
  | "live"
  /** The person is speaking. */
  | "hearing"
  /** The assistant is speaking. */
  | "speaking"
  /** A write is waiting to be agreed to, out loud. */
  | "confirming"
  /**
   * A tool is running.
   *
   * Its own phase because it is the one wait in a spoken conversation with no
   * sound in it. Several of these tools read SharePoint, Graph or Zoho live and
   * take seconds, and the model says nothing while it waits — so without
   * something on screen the person is listening to silence with no way to tell
   * a slow answer from a broken one.
   */
  | "working"
  | "ended";

/** One tool call, as it happens, for the trace on screen. */
export interface RealtimeStep {
  id: string;
  tool_key: string;
  label: string;
  arguments: Record<string, unknown>;
  ok?: boolean;
  status?: number;
  /** Set while the model is asking the person to agree to this. */
  awaiting?: boolean;
  warning?: string | null;
}

export interface RealtimeSession {
  phase: RealtimePhase;
  /** What the assistant is saying, as its transcript arrives. */
  transcript: string;
  /** What the person last said, when transcription is available. */
  heard: string;
  steps: RealtimeStep[];
  /** The write waiting to be agreed to, if any. */
  pending: RealtimeStep | null;
  error: string | null;
  /** The session as minted — model, voice, and what it may do. */
  info: RealtimeSessionOut | null;
  muted: boolean;
  /**
   * The microphone, and what comes back.
   *
   * Handed out so the orb can be driven from the real audio on both sides.
   * Opening a second microphone for that cost a device acquisition on every
   * turn, and the assistant's half was an invented envelope rather than its
   * actual voice.
   */
  micStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** The tool being run right now, for the screen to name. */
  running: string | null;
  start: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  /** Refuse a pending write from the screen, rather than out loud. */
  decline: () => void;
}

/**
 * Opens and drives one spoken conversation.
 *
 * Everything the connection owns — the peer connection, the microphone tracks,
 * the audio element, the data channel — is held in refs and torn down together.
 * A half-closed WebRTC connection keeps the microphone light on, which is the
 * one bug in this file a person would notice from across the room.
 */
export function useRealtime({ enabled }: { enabled: boolean }): RealtimeSession {
  const [phase, setPhase] = useState<RealtimePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [heard, setHeard] = useState("");
  const [steps, setSteps] = useState<RealtimeStep[]>([]);
  const [pending, setPending] = useState<RealtimeStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RealtimeSessionOut | null>(null);
  const [muted, setMutedState] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  // Several tools can be in flight at once, so the screen clears the "working"
  // state on the last one finishing rather than the first.
  const inFlight = useRef(0);

  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const runId = useRef<string | null>(null);
  const tools = useRef<Map<string, RealtimeToolOut>>(new Map());
  // Tool names the server has already refused once pending confirmation. The
  // model asks out loud, and the next call for that name carries `confirmed`.
  const awaiting = useRef<Set<string>>(new Set());
  // Bumped on every stop, so work in flight from a finished conversation
  // cannot write into the one that replaced it.
  const generation = useRef(0);

  const teardown = useCallback((next: RealtimePhase) => {
    generation.current += 1;
    channel.current?.close();
    channel.current = null;
    peer.current?.close();
    peer.current = null;
    if (microphone.current) {
      for (const track of microphone.current.getTracks()) track.stop();
      microphone.current = null;
    }
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
      audio.current = null;
    }
    awaiting.current.clear();
    inFlight.current = 0;
    setRunning(null);
    setMicStream(null);
    setRemoteStream(null);
    setPending(null);
    setPhase(next);
  }, []);

  const stop = useCallback(() => {
    // Nothing to end. Without this guard, mounting the screen closed would run
    // a teardown and leave the phase reading "ended" before anything had begun.
    if (!peer.current && !runId.current) return;
    const id = runId.current;
    runId.current = null;
    teardown("ended");
    // The run is closed so it stops showing as live to an administrator. Best
    // effort on purpose: the conversation is already over for the person, and
    // failing to tidy the record is not something to interrupt them with.
    if (id) {
      void api.post(`/assistant/realtime/session/${id}/end`).catch(() => undefined);
    }
  }, [teardown]);

  // Leaving the screen must end the call. Without this the microphone stays
  // open and OpenAI keeps billing a conversation nobody is having.
  useEffect(() => () => teardown("ended"), [teardown]);

  useEffect(() => {
    if (!enabled && peer.current) stop();
  }, [enabled, stop]);

  /** Hands one event to the model over the data channel. */
  const send = useCallback((event: Record<string, unknown>) => {
    const open = channel.current;
    if (open?.readyState === "open") open.send(JSON.stringify(event));
  }, []);

  /**
   * Runs one tool the model asked for, then hands the result back.
   *
   * The result is handed back **whatever it was** — a refusal included. A tool
   * that came back 403 is something the model has to be told about so it can
   * say so out loud; swallowing it would leave the person waiting for an answer
   * that is never coming.
   */
  const runTool = useCallback(
    async (callId: string, name: string, args: Record<string, unknown>) => {
      const mine = generation.current;
      const spec = tools.current.get(name);
      const confirmed = awaiting.current.has(name);
      if (confirmed) awaiting.current.delete(name);

      const step: RealtimeStep = {
        id: callId,
        tool_key: spec?.tool_key ?? name,
        label: spec?.label ?? name,
        arguments: args,
        warning: spec?.warning ?? null,
      };
      setSteps((current) => [...current, step]);
      inFlight.current += 1;
      setRunning(step.label);
      setPhase((current) => (current === "confirming" ? current : "working"));

      /** The wait is over for this call; the phase only clears on the last. */
      const finished = () => {
        inFlight.current = Math.max(0, inFlight.current - 1);
        if (inFlight.current > 0) return;
        setRunning(null);
        setPhase((current) => (current === "working" ? "live" : current));
      };

      let result: RealtimeCallOut;
      try {
        result = await api.post<RealtimeCallOut>("/assistant/realtime/call", {
          run_id: runId.current,
          name,
          arguments: args,
          confirmed,
        });
      } catch (caught) {
        const message =
          caught instanceof ApiError ? caught.message : "That could not be run.";
        if (generation.current === mine) {
          setSteps((current) =>
            current.map((s) => (s.id === callId ? { ...s, ok: false, status: 0 } : s)),
          );
          finished();
        }
        // The model still needs an answer, or the conversation stalls.
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ error: message }),
          },
        });
        send({ type: "response.create" });
        return;
      }

      if (generation.current !== mine) return;
      finished();

      if (result.requires_confirmation) {
        // Nothing ran. The model has been told to ask; the card gives the
        // person something to look at and a way to refuse without speaking.
        awaiting.current.add(name);
        const asking = { ...step, awaiting: true, warning: result.warning ?? step.warning };
        setSteps((current) => current.map((s) => (s.id === callId ? asking : s)));
        setPending(asking);
        setPhase("confirming");
      } else {
        setSteps((current) =>
          current.map((s) =>
            s.id === callId
              ? { ...s, ok: result.ok, status: result.status, awaiting: false }
              : s,
          ),
        );
        // Cleared by **tool**, not by call id. The retry after somebody says
        // yes is a new call with a new id, so matching on the id alone left the
        // card on screen for the rest of the conversation and the phase stuck
        // on "waiting on your answer" — asking about something that had already
        // happened.
        setPending((current) =>
          current && (current.id === callId || current.tool_key === step.tool_key)
            ? null
            : current,
        );
        setPhase((current) => (current === "confirming" ? "live" : current));
      }

      send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: result.output },
      });
      send({ type: "response.create" });
    },
    [send],
  );

  /** Everything the model sends down the data channel. */
  const onEvent = useCallback(
    (raw: MessageEvent<string>) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(event.type ?? "");

      switch (type) {
        case "input_audio_buffer.speech_started":
          setPhase((current) => (current === "confirming" ? current : "hearing"));
          setTranscript("");
          break;

        case "input_audio_buffer.speech_stopped":
          setPhase((current) => (current === "confirming" ? current : "live"));
          break;

        // What the person said, when the session is transcribing input.
        case "conversation.item.input_audio_transcription.completed":
          setHeard(String(event.transcript ?? "").trim());
          break;

        case "response.output_audio_transcript.delta":
          setPhase("speaking");
          setTranscript((current) => current + String(event.delta ?? ""));
          break;

        case "response.output_audio_transcript.done":
          setTranscript(String(event.transcript ?? "").trim());
          break;

        case "response.done":
          setPhase((current) => (current === "confirming" ? current : "live"));
          break;

        // The model wants a tool. This is the only event that reaches back into
        // the API, and it goes through the proxy rather than anywhere near a
        // module's own route.
        case "response.function_call_arguments.done": {
          const callId = String(event.call_id ?? "");
          const name = String(event.name ?? "");
          let args: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(String(event.arguments ?? "{}")) as unknown;
            if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
          } catch {
            // Malformed arguments are the model's mistake, and it is told so
            // below rather than left waiting.
          }
          if (callId && name) void runTool(callId, name, args);
          break;
        }

        case "error": {
          const detail = event.error as
            | { message?: string; param?: string; code?: string }
            | undefined;
          const about = `${detail?.param ?? ""} ${detail?.message ?? ""}`.toLowerCase();
          // The transcription request below is the one optional thing this
          // client asks for. If the session will not do it, the captions of
          // what the person said simply do not appear — which is not worth
          // putting an error on a screen where the conversation is going fine.
          if (about.includes("transcription") || about.includes("audio.input")) break;
          setError(detail?.message ?? "The spoken conversation hit an error.");
          break;
        }

        default:
          break;
      }
    },
    [runTool],
  );

  const start = useCallback(() => {
    if (peer.current) return;
    setError(null);
    setTranscript("");
    setHeard("");
    setSteps([]);
    setPending(null);
    setPhase("connecting");

    void (async () => {
      const mine = generation.current;
      try {
        // 1. The microphone and the token, at the same time.
        //
        //    These were sequential, and both are slow for unrelated reasons:
        //    minting is a round trip through our API to OpenAI, and opening the
        //    microphone can mean a permission prompt and a device starting up.
        //    Waiting for one before beginning the other simply added the two
        //    delays together at the front of every conversation.
        const asking = navigator.mediaDevices.getUserMedia({ audio: true });
        // Claimed immediately so a failure while minting cannot surface as an
        // unhandled rejection; the real handling is below.
        asking.catch(() => undefined);

        let minted: RealtimeSessionOut;
        try {
          minted = await api.post<RealtimeSessionOut>("/assistant/realtime/session");
        } catch (cause) {
          // The microphone may still be opening. Let it, then close it, rather
          // than leaving a live device behind on a conversation that never was.
          void asking.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => undefined);
          throw cause;
        }
        if (generation.current !== mine) {
          void asking.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => undefined);
          return;
        }
        runId.current = minted.run_id;
        tools.current = new Map(minted.tools.map((tool) => [tool.name, tool]));
        setInfo(minted);

        const stream = await asking;
        if (generation.current !== mine) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        microphone.current = stream;
        setMicStream(stream);

        const connection = new RTCPeerConnection();
        peer.current = connection;

        // 3. What comes back is played. An element rather than the Web Audio
        //    API: this is speech, not something to analyse, and an element
        //    handles the codec and the device change for free.
        const element = new Audio();
        element.autoplay = true;
        audio.current = element;
        connection.ontrack = (track) => {
          element.srcObject = track.streams[0];
          setRemoteStream(track.streams[0] ?? null);
          void element.play().catch(() => {
            // Autoplay refused. The connection is fine; the person can retry
            // from the button, which counts as the gesture the browser wants.
            setError("The browser would not play audio. Try again.");
          });
        };

        for (const track of stream.getTracks()) connection.addTrack(track, stream);

        const events = connection.createDataChannel(EVENT_CHANNEL);
        channel.current = events;
        events.onmessage = onEvent;
        events.onopen = () => {
          if (generation.current !== mine) return;
          setPhase("live");
          // Nothing is asked of the session here, deliberately. Input
          // transcription used to be requested from this side; the backend now
          // sets it when it mints the session, with a newer and quicker model
          // than this end was asking for. Leaving the request in would have
          // quietly overridden the server's choice with the older one.
          //
          // Keeping this empty is also the cleaner invariant: the client sends
          // no `session.update` at all, so there is no path by which it could
          // grow into one that changes tools or instructions.
        };
        events.onclose = () => {
          if (generation.current === mine) setPhase("ended");
        };

        connection.onconnectionstatechange = () => {
          if (generation.current !== mine) return;
          const state = connection.connectionState;
          if (state === "failed" || state === "disconnected") {
            setError("The connection dropped.");
            teardown("ended");
          }
        };

        // 4. Trade the offer for an answer, using the ephemeral secret. It is
        //    worth two minutes and this is the one thing it is for.
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        const answer = await fetch(OPENAI_CALLS, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${minted.client_secret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp ?? "",
        });
        if (!answer.ok) {
          throw new ApiError(
            answer.status,
            `OpenAI would not open the conversation (${answer.status}). ${await answer
              .text()
              .catch(() => "")}`.trim(),
          );
        }
        if (generation.current !== mine) return;
        await connection.setRemoteDescription({
          type: "answer",
          sdp: await answer.text(),
        });
      } catch (caught) {
        if (generation.current !== mine) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : caught instanceof DOMException && caught.name === "NotAllowedError"
              ? "The microphone is blocked. Allow it for this site, then try again."
              : caught instanceof Error
                ? caught.message
                : "The spoken conversation could not be opened.",
        );
        teardown("idle");
      }
    })();
  }, [onEvent, send, teardown]);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    // Disabling the track rather than stopping it: a stopped track cannot be
    // restarted, and unmuting would need the whole connection renegotiated.
    for (const track of microphone.current?.getAudioTracks() ?? []) {
      track.enabled = !next;
    }
  }, []);

  /**
   * Refuse a waiting write from the screen.
   *
   * The model is told plainly, so it says so rather than trying again. The name
   * is dropped from the waiting set first, which is what stops a retry being
   * marked confirmed.
   */
  const decline = useCallback(() => {
    const waiting = pending;
    setPending(null);
    setPhase("live");
    if (!waiting) return;
    awaiting.current.clear();
    setSteps((current) =>
      current.map((s) => (s.id === waiting.id ? { ...s, awaiting: false, ok: false } : s)),
    );
    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "No — do not do that. Acknowledge and ask what I would like instead.",
          },
        ],
      },
    });
    send({ type: "response.create" });
  }, [pending, send]);

  return {
    phase,
    transcript,
    heard,
    steps,
    pending,
    error,
    info,
    muted,
    micStream,
    remoteStream,
    running,
    start,
    stop,
    setMuted,
    decline,
  };
}

/** A live conversation, for anything that has to know without the details. */
export function isLive(phase: RealtimePhase): boolean {
  return (
    phase === "live" ||
    phase === "hearing" ||
    phase === "speaking" ||
    phase === "working" ||
    phase === "confirming"
  );
}

/**
 * Whether this browser can hold a spoken conversation.
 *
 * WebRTC and a microphone, both of which are needed before the button is worth
 * offering. Checked at the call site rather than assumed: Firefox has
 * `RTCPeerConnection` but not `SpeechRecognition`, so the two voice paths in
 * this app are unavailable in different places and each has to ask its own
 * question.
 */
export function realtimeSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}
