"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeadTTS, HeadTTSMessage } from "@met4citizen/headtts";
import type { TalkingHead } from "@met4citizen/talkinghead";
import { forSpeech, sentences, type Speaker } from "@/lib/speech";

/**
 * The assistant's face: a 3D head that speaks its answers with matching lips.
 *
 * Everything runs in the browser and costs nothing per word:
 *
 * - **TalkingHead** (MIT) draws the head with three.js and moves the mouth to
 *   viseme timings.
 * - **HeadTTS** (MIT, Kokoro voices under Apache 2.0) turns each sentence into
 *   speech *and* the viseme timings for it, on the graphics card where there is
 *   one (WebGPU) and on the processor where there is not.
 *
 * It is a drop-in for `useSpeaker()`: the same `feed` / `finish` / `speak` /
 * `cancel`, so voice mode's listen–answer loop runs unchanged and only the mouth
 * is different. The first time it is opened it downloads the head (~35 MB) and
 * the voice model (~80–300 MB, depending on the device); the browser keeps both,
 * so later visits start in a few seconds.
 *
 * The avatar is the CC0 "MPFB" example from the TalkingHead project, the only
 * one of its examples licensed for company use. A professional-looking avatar
 * (any GLB with a Mixamo rig and ARKit + Oculus viseme blend shapes) replaces it
 * by setting NEXT_PUBLIC_ASSISTANT_AVATAR_URL — no code change.
 */

/**
 * Switched off (2026-10-06): the 3D head did not look human enough. Kept so a
 * realistic face (Azure's live avatar, or real video loops) can replace it
 * behind the same `Speaker` interface. NEXT_PUBLIC_ASSISTANT_FACE=1 shows it.
 */
export const FACE_ENABLED = process.env.NEXT_PUBLIC_ASSISTANT_FACE === "1";

const AVATAR_URL = process.env.NEXT_PUBLIC_ASSISTANT_AVATAR_URL || "/avatars/mpfb.glb";
const AVATAR_BODY = process.env.NEXT_PUBLIC_ASSISTANT_AVATAR_BODY || "F";
/** A Kokoro voice: af_* American female, am_* American male. */
const VOICE = process.env.NEXT_PUBLIC_ASSISTANT_FACE_VOICE || "af_bella";

const HEADTTS = "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3";

export type FaceState = "off" | "loading" | "ready" | "error";

export interface Face {
  /** Attach to the element the head is drawn in. */
  mount: (node: HTMLDivElement | null) => void;
  state: FaceState;
  /** What is loading, for the first visit's wait. */
  progress: string | null;
  error: string | null;
  speaker: Speaker;
}

export function useFace(enabled: boolean): Face {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<FaceState>("off");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const head = useRef<TalkingHead | null>(null);
  const tts = useRef<HeadTTS | null>(null);

  // The same bookkeeping as useSpeaker: a generation that cancel bumps, how
  // much of a streaming answer is already queued, and whether more is coming.
  const generation = useRef(0);
  const consumed = useRef(0);
  const feeding = useRef(false);
  /** Sentences sent to the voice whose audio has not finished playing. */
  const outstanding = useRef(0);

  // ── loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !node) return;
    let cancelled = false;
    setState("loading");
    setError(null);

    (async () => {
      try {
        setProgress("Loading the 3D engine…");
        const [{ TalkingHead }, { LipsyncEn }, { HeadTTS }] = await Promise.all([
          import("@met4citizen/talkinghead"),
          import("@met4citizen/talkinghead/modules/lipsync-en.mjs"),
          import("@met4citizen/headtts"),
        ]);
        if (cancelled) return;
        setProgress("Starting the 3D engine…");

        // Lip-sync languages are normally imported by name at run time, which a
        // bundler cannot follow; English is loaded above and handed over instead.
        const created = new TalkingHead(node, {
          lipsyncModules: [],
          lipsyncLang: "en",
          cameraView: "upper",
          avatarMood: "neutral",
          modelFPS: 30,
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
        });
        created.lipsync.en = new LipsyncEn();
        setProgress("Downloading the face…");
        await created.showAvatar(
          { url: AVATAR_URL, body: AVATAR_BODY, avatarMood: "neutral", lipsyncLang: "en" },
          (ev) => {
            setProgress(
              ev.lengthComputable && ev.total
                ? `Downloading the face… ${Math.round((100 * ev.loaded) / ev.total)}%`
                : `Downloading the face… ${Math.round(ev.loaded / 1_048_576)} MB`,
            );
          },
        );
        if (cancelled) {
          created.dispose();
          return;
        }
        head.current = created;

        setProgress("Loading the voice…");
        const voice = new HeadTTS({
          endpoints: ["webgpu", "wasm"],
          languages: ["en-us"],
          voices: [VOICE],
          audioCtx: created.audioCtx,
          workerModule: `${HEADTTS}/modules/worker-tts.mjs`,
          dictionaryURL: `${HEADTTS}/dictionaries/`,
        });
        await voice.connect(null, (ev) => {
          if (ev.lengthComputable && ev.total) {
            setProgress(`Loading the voice… ${Math.round((100 * ev.loaded) / ev.total)}%`);
          }
        });
        await voice.setup({ voice: VOICE, language: "en-us", speed: 1, audioEncoding: "wav" });
        if (cancelled) return;
        tts.current = voice;
        setProgress(null);
        setState("ready");
      } catch (exc) {
        console.error("[assistant face] could not load", exc);
        if (cancelled) return;
        setProgress(null);
        setError(exc instanceof Error ? exc.message : String(exc));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      generation.current += 1;
      try {
        tts.current?.clear();
      } catch {
        /* already gone */
      }
      tts.current = null;
      head.current?.dispose();
      head.current = null;
      node.replaceChildren();
      setSpeaking(false);
      setState("off");
    };
  }, [enabled, node]);

  // ── speaking ────────────────────────────────────────────────────────

  const settle = useCallback(() => {
    if (outstanding.current <= 0 && !feeding.current) setSpeaking(false);
  }, []);

  /** Send sentences to the voice; each one is spoken by the head as it arrives. */
  const say = useCallback(
    (parts: string[]) => {
      const voice = tts.current;
      const face = head.current;
      if (!voice || !face || !parts.length) {
        settle();
        return;
      }
      // A browser keeps audio asleep until somebody has interacted with the
      // page; voice mode opens on a click, so it can be woken here.
      if (face.audioCtx.state === "suspended") void face.audioCtx.resume();
      face.lookAtCamera(500);
      const mine = generation.current;
      setSpeaking(true);
      for (const part of parts) {
        outstanding.current += 1;
        void voice.synthesize({ input: part }, (message: HeadTTSMessage) => {
          if (generation.current !== mine) return;
          if (message.type === "audio") {
            face.speakAudio(message.data, { lipsyncLang: "en" });
            face.speakMarker(() => {
              if (generation.current !== mine) return;
              outstanding.current -= 1;
              settle();
            });
          } else {
            outstanding.current -= 1;
            settle();
          }
        });
      }
    },
    [settle],
  );

  const cancel = useCallback(() => {
    generation.current += 1;
    consumed.current = 0;
    feeding.current = false;
    outstanding.current = 0;
    try {
      tts.current?.clear();
    } catch {
      /* nothing queued */
    }
    head.current?.stopSpeaking();
    setSpeaking(false);
  }, []);

  const readyPart = (rest: string): string | null => {
    const match = rest.match(/^[\s\S]*[.!?]["')\]]*(?=\s|$)/);
    return match ? match[0] : null;
  };

  const feed = useCallback(
    (answerSoFar: string) => {
      const raw = readyPart(answerSoFar.slice(consumed.current));
      if (!raw) return;
      consumed.current += raw.length;
      const clean = forSpeech(raw);
      if (!clean) return;
      feeding.current = true;
      say(sentences(clean));
    },
    [say],
  );

  const finish = useCallback(
    (fullAnswer?: string) => {
      if (fullAnswer !== undefined) {
        const rest = fullAnswer.slice(consumed.current).trim();
        consumed.current = 0;
        const clean = rest ? forSpeech(rest) : "";
        feeding.current = false;
        if (clean) {
          say(sentences(clean));
          return;
        }
      }
      feeding.current = false;
      consumed.current = 0;
      settle();
    },
    [say, settle],
  );

  const speak = useCallback(
    (text: string) => {
      cancel();
      const clean = forSpeech(text);
      if (clean) say(sentences(clean));
    },
    [cancel, say],
  );

  const speaker: Speaker = {
    supported: state === "ready",
    speaking,
    error,
    speak,
    feed,
    finish,
    cancel,
  };

  return { mount: setNode, state, progress, error, speaker };
}
