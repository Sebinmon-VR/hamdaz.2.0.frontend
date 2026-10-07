"use client";

/**
 * Speech: heard in the browser, spoken by the server.
 *
 * The two halves are not symmetric, and the asymmetry is the backend's decision
 * rather than an accident of what was easy here.
 *
 * **Listening is the browser's.** There is no speech-to-text endpoint. Nothing
 * from the microphone is uploaded or stored, and the assistant receives exactly
 * the text a person would have typed. That is a real constraint and it shapes
 * every screen: `SpeechRecognition` is a **Chrome, Edge and Safari** feature
 * that Firefox does not ship, so the microphone has to be allowed to be missing
 * — the button is hidden rather than broken when `dictationSupported()` is
 * false.
 *
 * **Speaking is the server's.** Answers are read by an OpenAI speech model
 * through `POST /assistant/speech`, steered by a voice and a sentence of
 * direction a super admin sets. The backend spells out why it is not
 * `speechSynthesis`: the built-in voices are whatever the operating system
 * ships, they differ on every machine, and on most of them the result is flat
 * enough that people stop pressing the button. This sounds the same for
 * everyone.
 *
 * The browser voice survives only as a **fallback**, for when the server will
 * not speak at all — the voice switched off, no API key, a laptop with no
 * connection. A worse voice beats silence. It is never used for a *sample*,
 * where the whole question is how one particular voice sounds.
 *
 * None of the three Web Speech interfaces this file needs are in TypeScript's
 * DOM library (5.9 ships `SpeechRecognitionResultList` but not the recogniser
 * itself), so they are declared below — narrowly, covering only what is used.
 */

import { API_ROOT } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── the pieces TypeScript does not know about ───────────────────────── */

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  /** "no-speech", "not-allowed", "audio-capture", "network", "aborted"… */
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function recogniser(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can listen at all. False in Firefox, and on the server. */
export function dictationSupported(): boolean {
  return recogniser() !== null;
}

/** Whether this browser can read an answer out loud. */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * The language recognition and playback use.
 *
 * en-GB to match the rest of the app, which formats every date and number in
 * that locale. It is a constant rather than a setting because a voice picker is
 * a preference nobody asked for, and getting the *dialect* wrong costs only
 * accuracy on names, not comprehension.
 */
export const SPEECH_LANG = "en-GB";

/* ── listening ───────────────────────────────────────────────────────── */

export interface Dictation {
  supported: boolean;
  /** True between `start()` and the recogniser actually stopping. */
  listening: boolean;
  /** What has been heard so far this utterance, final and interim together. */
  transcript: string;
  /** Set when the microphone was refused or failed. Shown, then cleared on retry. */
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Throw away what has been heard without sending it. */
  reset: () => void;
}

/**
 * One utterance at a time.
 *
 * `continuous` is deliberately off. With it on, the recogniser runs until it is
 * told to stop and the caller has to invent its own silence detection; with it
 * off the browser ends the utterance after a natural pause, which is exactly the
 * turn boundary a spoken conversation wants. The cost is that a long pause
 * mid-sentence ends the turn early, and the fix for that is the person tapping
 * to talk again — not a timer this file would have to guess at.
 *
 * `onFinal` fires once per utterance with the whole thing. It is held in a ref
 * because the recogniser outlives the render that created it, and a handler
 * captured at construction would send a stale conversation id.
 */
export function useDictation({
  onFinal,
  enabled = true,
}: {
  onFinal?: (text: string) => void;
  enabled?: boolean;
} = {}): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const engine = useRef<SpeechRecognitionLike | null>(null);
  const final = useRef(onFinal);
  final.current = onFinal;
  // Set while stopping on purpose, so `onend` knows the difference between the
  // person tapping stop and the recogniser giving up on its own.
  const stopping = useRef(false);
  const heard = useRef("");

  // Read after mount: the server has no window, and rendering the microphone
  // button on the server and not on the client is a hydration mismatch.
  useEffect(() => {
    setSupported(dictationSupported());
  }, []);

  useEffect(() => {
    const Ctor = recogniser();
    if (!Ctor || !enabled) return;

    const engineInstance = new Ctor();
    engineInstance.lang = SPEECH_LANG;
    engineInstance.continuous = false;
    engineInstance.interimResults = true;
    engineInstance.maxAlternatives = 1;

    engineInstance.onstart = () => {
      setListening(true);
      setError(null);
    };

    engineInstance.onresult = (event) => {
      let settled = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) settled += text;
        else pending += text;
      }
      if (settled) heard.current = `${heard.current} ${settled}`.trim();
      setTranscript(`${heard.current} ${pending}`.trim());
    };

    engineInstance.onerror = (event) => {
      // "aborted" is what a deliberate stop looks like from in here, and
      // "no-speech" is somebody thinking about what to say. Neither is a fault
      // worth putting on screen.
      if (event.error === "aborted" || event.error === "no-speech") return;
      setError(
        event.error === "not-allowed"
          ? "The microphone is blocked. Allow it for this site in your browser, then try again."
          : event.error === "audio-capture"
            ? "No microphone was found."
            : event.error === "network"
              ? "Speech recognition needs a network connection and could not reach it."
              : "The microphone stopped unexpectedly.",
      );
    };

    engineInstance.onend = () => {
      setListening(false);
      const said = heard.current.trim();
      heard.current = "";
      const deliberate = stopping.current;
      stopping.current = false;
      // A stop the person asked for still delivers what was heard: they said
      // their piece and then tapped, and throwing it away is the one behaviour
      // that reads as the app not listening.
      if (said) final.current?.(said);
      else if (!deliberate) setTranscript("");
    };

    engine.current = engineInstance;
    return () => {
      engineInstance.onresult = null;
      engineInstance.onerror = null;
      engineInstance.onend = null;
      engineInstance.onstart = null;
      try {
        engineInstance.abort();
      } catch {
        // Already stopped, or never started. Nothing to undo.
      }
      engine.current = null;
    };
  }, [enabled]);

  const start = useCallback(() => {
    if (!engine.current) return;
    heard.current = "";
    setTranscript("");
    setError(null);
    try {
      engine.current.start();
    } catch {
      // Chrome throws InvalidStateError if start() is called while already
      // running. That is the state we wanted, so it is not an error.
    }
  }, []);

  const stop = useCallback(() => {
    if (!engine.current) return;
    stopping.current = true;
    try {
      engine.current.stop();
    } catch {
      // As above — already stopped.
    }
  }, []);

  const reset = useCallback(() => {
    heard.current = "";
    setTranscript("");
  }, []);

  return { supported, listening, transcript, error, start, stop, reset };
}

/* ── speaking ────────────────────────────────────────────────────────── */

export interface Speaker {
  supported: boolean;
  speaking: boolean;
  /**
   * Why it could not speak, in the backend's own words.
   *
   * Only set where there is nothing else to fall back to — a sample, which is
   * asking about one specific voice and cannot be answered by a different one.
   * When an *answer* fails the browser reads it instead, and a person hearing a
   * plainer voice does not also need an error about it.
   */
  error: string | null;
  /**
   * `voice` overrides the configured one and is **super admin only** on the
   * backend — it exists so an administrator can hear each voice say the same
   * sentence before choosing, not so anybody can pick their own. Everyone else
   * omits it and gets the voice the super admin set.
   */
  speak: (text: string, options?: { voice?: string }) => void;
  /**
   * Speak an answer **while it is still arriving**.
   *
   * Call it with the whole answer so far on every update; it works out which
   * sentences are newly complete and says only those. Waiting for the turn to
   * finish before speaking added the model's entire generation time to the
   * silence, which is what made the voice feel broken.
   */
  feed: (answerSoFar: string) => void;
  /** No more is coming. Speaks whatever is left over and releases the mouth. */
  finish: (fullAnswer?: string) => void;
  cancel: () => void;
}

/**
 * Reads an answer out loud, in the assistant's own voice.
 *
 * The audio comes from the backend (`POST /assistant/speech`), which runs a
 * speech model steered by wording a super admin controls. That is the whole
 * point of not using `speechSynthesis` any more: the built-in voices are
 * whatever the operating system happens to ship, they differ on every machine,
 * and on most of them the result is flat enough that people stop pressing the
 * button. This sounds the same for everyone and sounds like a person.
 *
 * Three details are load-bearing.
 *
 * The text is **stripped of markdown** first — a reader says "asterisk
 * asterisk", and a bulleted list read literally is unlistenable.
 *
 * It is fetched **a sentence at a time**, with the next one requested while the
 * current one plays. Generating a whole paragraph before any sound arrives
 * feels broken even when it is quick; this way the first words start after the
 * first short clip, and the rest arrives under cover of playback.
 *
 * And it **falls back to the browser** when the backend cannot speak — the
 * voice switched off, no API key, an offline laptop. A worse voice beats
 * silence and an error nobody can act on.
 */
export function useSpeaker(): Speaker {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every `speak` and `cancel`. Async work checks it before doing
  // anything visible, so a clip that was already in flight when the person
  // pressed stop cannot start playing afterwards.
  const generation = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Set once the backend has refused for a reason that will not change within
  // this page's life, so the next answer does not pay for another round trip.
  const useBrowser = useRef(false);
  // Sentences waiting for a mouth, in order. A queue rather than a list built
  // up front, because an answer that is still streaming arrives one sentence at
  // a time and there is no reason to wait for the last one.
  const queue = useRef<string[]>([]);
  const pumping = useRef(false);
  // How much of the answer has already been queued, measured on the **raw**
  // text. Raw text only grows, so a prefix stays a prefix; the cleaned text can
  // be rewritten from the start when a code fence finally closes.
  const consumed = useRef(0);
  // True between the first `feed` and `finish`. Without it `speaking` would drop
  // in the gap between two sentences, the overlay would re-arm the microphone
  // mid-answer, and the assistant would start listening to itself.
  const feeding = useRef(false);
  // Set only while sampling one specific voice, which must never fall back.
  const sampling = useRef<string | undefined>(undefined);

  useEffect(() => {
    // The button is offered if *either* mouth works.
    setSupported(true);
    return () => {
      generation.current += 1;
      abort.current?.abort();
      audio.current?.pause();
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    // The running pump sees the new generation and bails; its cleanup checks
    // the generation before touching these, so clearing them here is safe.
    queue.current = [];
    pumping.current = false;
    consumed.current = 0;
    feeding.current = false;
    sampling.current = undefined;
    abort.current?.abort();
    abort.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    if (speechSupported()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  /** One clip. Resolves to null when the backend will not speak this. */
  const fetchClip = useCallback(
    async (text: string, signal: AbortSignal, voice?: string): Promise<Blob | null> => {
      const response = await fetch(`${API_ROOT}/assistant/speech`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voice ? { text, voice } : { text }),
        signal,
      });
      if (!response.ok) {
        // 409 is "voice switched off", 403 "not released to you", 503 "no key".
        // None of those get better by asking again on the next sentence.
        if ([403, 409, 503].includes(response.status)) useBrowser.current = true;
        // Reported only when a specific voice was asked for — that is the
        // sample, and it has nothing to fall back to. An *answer* that cannot
        // be generated is read by the browser instead, and somebody hearing a
        // plainer voice does not also need an error explaining why.
        //
        // Each of these is a sentence written for a person to read, so it is
        // carried through rather than replaced with a status code.
        if (voice) {
          const payload = await response.json().catch(() => null);
          const detail = (payload as { detail?: unknown } | null)?.detail;
          setError(
            typeof detail === "string" ? detail : "The assistant could not speak that.",
          );
        }
        return null;
      }
      return response.blob();
    },
    [],
  );

  const play = useCallback((clip: Blob, mine: number): Promise<void> => {
    return new Promise((resolve) => {
      if (generation.current !== mine) return resolve();
      const url = URL.createObjectURL(clip);
      const element = new Audio(url);
      audio.current = element;
      const done = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      element.onended = done;
      // A failed clip should not strand the queue — move on to the next.
      element.onerror = done;
      void element.play().catch(done);
    });
  }, []);

  /** The old mouth, kept for when the new one is unavailable. */
  const speakInBrowser = useCallback((clean: string) => {
    if (!speechSupported()) {
      setSpeaking(false);
      return;
    }
    const utterances = sentences(clean).map((chunk) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = SPEECH_LANG;
      utterance.rate = 1.02;
      utterance.pitch = 1;
      return utterance;
    });
    const last = utterances[utterances.length - 1];
    if (last) {
      last.onend = () => setSpeaking(false);
      last.onerror = () => setSpeaking(false);
    }
    for (const utterance of utterances) window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Works the queue until it runs dry: fetch a clip, play it, and fetch the
   * next one while that plays. One in flight ahead is enough to hide the round
   * trip without paying for clips a cancel would throw away.
   */
  const pump = useCallback(
    (mine: number) => {
      if (pumping.current) return;
      pumping.current = true;

      void (async () => {
        try {
          let ahead: { text: string; clip: Promise<Blob | null> } | null = null;
          for (;;) {
            if (generation.current !== mine) return;

            let current = ahead;
            ahead = null;
            if (!current) {
              const next = queue.current.shift();
              if (next === undefined) return;
              const controller = abort.current;
              if (!controller) return;
              current = {
                text: next,
                clip: fetchClip(next, controller.signal, sampling.current).catch(() => null),
              };
            }

            const clip = await current.clip;
            if (generation.current !== mine) return;
            if (!clip) {
              // Nothing came back. If the backend has told us it will not speak
              // at all, read what is left in the browser rather than going
              // quiet — except when sampling, where a substitute voice answers
              // a question nobody asked.
              const rest = [current.text, ...queue.current.splice(0)];
              if (useBrowser.current && !sampling.current) speakInBrowser(rest.join(" "));
              return;
            }

            const after = queue.current.shift();
            if (after !== undefined && abort.current) {
              ahead = {
                text: after,
                clip: fetchClip(after, abort.current.signal, sampling.current).catch(() => null),
              };
            }
            await play(clip, mine);
          }
        } finally {
          // Only the pump that still owns this generation may clear the flags;
          // a superseded one must not stand on its replacement.
          if (generation.current === mine) {
            pumping.current = false;
            if (!feeding.current && !queue.current.length) setSpeaking(false);
          }
        }
      })();
    },
    [fetchClip, play, speakInBrowser],
  );

  /** Everything up to the last finished sentence. The tail may still be growing. */
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

      if (!feeding.current) {
        feeding.current = true;
        sampling.current = undefined;
        setError(null);
        setSpeaking(true);
        abort.current = new AbortController();
        queue.current = [];
      }
      if (useBrowser.current) {
        speakInBrowser(clean);
        return;
      }
      queue.current.push(...sentences(clean));
      pump(generation.current);
    },
    [pump, speakInBrowser],
  );

  const finish = useCallback(
    (fullAnswer?: string) => {
      if (fullAnswer !== undefined) {
        const rest = fullAnswer.slice(consumed.current).trim();
        consumed.current = fullAnswer.length;
        const clean = rest ? forSpeech(rest) : "";
        if (clean) {
          if (!feeding.current) {
            // Nothing was fed — this is a whole answer arriving at once.
            feeding.current = true;
            sampling.current = undefined;
            setError(null);
            setSpeaking(true);
            abort.current = new AbortController();
            queue.current = [];
          }
          if (useBrowser.current) speakInBrowser(clean);
          else queue.current.push(...sentences(clean));
        }
      }
      feeding.current = false;
      if (queue.current.length) pump(generation.current);
      else if (!pumping.current) setSpeaking(false);
    },
    [pump, speakInBrowser],
  );

  const speak = useCallback(
    (text: string, options?: { voice?: string }) => {
      const clean = forSpeech(text);
      if (!clean) return;

      cancel();
      const mine = generation.current;
      setError(null);
      setSpeaking(true);

      sampling.current = options?.voice;

      // Sampling never falls back. The point of a sample is hearing *that*
      // voice, and an operating-system reading of the same sentence answers a
      // question nobody asked.
      if (useBrowser.current && !options?.voice) {
        speakInBrowser(clean);
        return;
      }

      abort.current = new AbortController();
      queue.current = sentences(clean);
      pump(mine);
    },
    [cancel, pump, speakInBrowser],
  );

  return { supported, speaking, error, speak, feed, finish, cancel };
}


/**
 * An answer as something worth hearing.
 *
 * The model writes for a screen — short lists, identifiers, the occasional
 * emphasis — and most of that punctuation is noise out loud. Bullets become
 * pauses, links become their text, and code fences are dropped entirely rather
 * than spelled out character by character.
 */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, "$1$2")
    .replace(/^\s*[-*•]\s+/gm, ". ")
    .replace(/^\s*\d+\.\s+/gm, ". ")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A clip this long is where the backend stops accepting one. */
const SPEECH_MAX_CHARS = 4000;

/** What one request aims for — short enough that the first sound comes quickly. */
const CLIP_CHARS = 180;

/**
 * Sentence-sized pieces to ask for one at a time.
 *
 * Two limits, and they are doing different jobs. `CLIP_CHARS` is a *target*: a
 * short first clip is what gets a voice into the room quickly, and the rest is
 * fetched while something is already playing. `SPEECH_MAX_CHARS` is the
 * backend's **hard** limit, which it refuses rather than truncates.
 *
 * That refusal is why a sentence longer than the target is broken on word
 * boundaries rather than passed through whole. Splitting on `.!?` alone assumes
 * the model punctuated, and one long unpunctuated answer — a flattened list, a
 * paragraph of clauses — would otherwise become a single oversized request that
 * comes back 422 and plays nothing at all, silently.
 *
 * The total is capped for the reason the backend gives for capping its own: a
 * whole document read aloud is not something anybody waits for, and it bills per
 * character. What is past the cap is on screen to be read.
 */
function sentences(text: string): string[] {
  const clauses = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];

  // Anything longer than a clip on its own is cut on spaces first, so no piece
  // entering the grouping below can exceed the endpoint's limit by itself.
  const parts: string[] = [];
  for (const clause of clauses) {
    if (clause.length <= CLIP_CHARS) {
      parts.push(clause);
      continue;
    }
    let piece = "";
    for (const word of clause.split(/(\s+)/)) {
      if (piece && (piece + word).length > CLIP_CHARS) {
        parts.push(piece);
        piece = "";
      }
      // A single "word" longer than a clip is not language — a URL, a hash —
      // and is cut where it falls rather than left to overflow.
      if (word.length > CLIP_CHARS) {
        for (let i = 0; i < word.length; i += CLIP_CHARS) {
          parts.push(word.slice(i, i + CLIP_CHARS));
        }
        continue;
      }
      piece += word;
    }
    if (piece) parts.push(piece);
  }

  const out: string[] = [];
  let buffer = "";
  let spent = 0;

  const flush = () => {
    const piece = buffer.trim();
    buffer = "";
    if (!piece) return;
    if (spent + piece.length > SPEECH_MAX_CHARS) return;
    spent += piece.length;
    out.push(piece);
  };

  for (const part of parts) {
    if (buffer && (buffer + part).length > CLIP_CHARS) flush();
    buffer += part;
  }
  flush();
  return out;
}

/* ── how loud it is right now ────────────────────────────────────────── */

/**
 * The microphone's level, 0–1, for anything that has to look alive.
 *
 * Returned as a **ref rather than state** on purpose. This updates on every
 * animation frame, and putting sixty renders a second through React to move one
 * blob would re-render the whole voice screen — the orb reads this inside its
 * own frame loop and paints, so nothing above it renders at all.
 *
 * Its own `getUserMedia` stream, separate from the recogniser's: the Web Speech
 * API gives no access to the audio it is hearing, so there is nothing to share.
 * Failing here is not fatal — the orb has an idle animation for exactly this —
 * so a refusal is swallowed rather than raised.
 */
export function useMicLevel(active: boolean): React.RefObject<number> {
  const level = useRef(0);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      level.current = 0;
      return;
    }

    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((granted) => {
        if (stopped) {
          for (const track of granted.getTracks()) track.stop();
          return;
        }
        stream = granted;
        context = new AudioContext();
        const source = context.createMediaStreamSource(granted);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.frequencyBinCount);
        const read = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const centred = (sample - 128) / 128;
            sum += centred * centred;
          }
          const rms = Math.sqrt(sum / samples.length);
          // Speech sits low in this range, so it is scaled up and clamped —
          // otherwise an ordinary voice barely moves the orb at all.
          const scaled = Math.min(1, rms * 4.2);
          // Eased towards the new value so the shape breathes rather than
          // flickering on every frame.
          level.current += (scaled - level.current) * 0.28;
          frame = requestAnimationFrame(read);
        };
        read();
      })
      .catch(() => {
        // Refused, or no microphone. The orb falls back to its idle motion.
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      level.current = 0;
      if (stream) for (const track of stream.getTracks()) track.stop();
      void context?.close().catch(() => undefined);
    };
  }, [active]);

  return level;
}

/* ── answering out loud ───────────────────────────────────────── */

/**
 * Whether somebody said yes, no, or something else.
 *
 * Null for anything ambiguous, which is the important case: this decides
 * whether a write happens, and a misheard "no thanks" read as approval is the
 * one mistake in this whole screen that cannot be taken back. So the lists are
 * short and unambiguous, and everything else falls through to the buttons.
 */
export function yesOrNo(text: string): boolean | null {
  const said = text.toLowerCase().replace(/[^a-z\s]/g, " ").trim();
  const words = said.split(/\s+/);
  const has = (phrase: string) =>
    phrase.includes(" ") ? said.includes(phrase) : words.includes(phrase);

  const no =
    has("no") ||
    has("nope") ||
    has("cancel") ||
    has("decline") ||
    has("stop") ||
    has("don t") ||
    has("do not") ||
    has("leave it");
  const yes =
    has("yes") ||
    has("yeah") ||
    has("yep") ||
    has("confirm") ||
    has("approve") ||
    has("go ahead") ||
    has("do it") ||
    has("please do");

  // "no, go ahead" is not a sentence anybody says to mean yes, and hearing both
  // usually means the recogniser caught the tail of something else.
  if (yes === no) return null;
  return yes;
}

/**
 * The level of a stream somebody else already opened.
 *
 * The same meter as `useMicLevel`, without the `getUserMedia`. A spoken
 * conversation already holds the microphone — asking the browser for it a
 * second time acquires the device again, and doing that on every turn as the
 * orb switched between listening and speaking cost a device acquisition per
 * exchange and could glitch the audio that mattered.
 *
 * It also works on what comes *back*: handed the remote stream, it drives the
 * orb from the assistant's actual voice rather than from an invented envelope.
 */
export function useStreamLevel(
  stream: MediaStream | null,
  active: boolean,
): React.RefObject<number> {
  const level = useRef(0);

  useEffect(() => {
    if (!stream || !active || typeof window === "undefined") {
      level.current = 0;
      return;
    }
    // A stream with no live audio track has nothing to measure, and building an
    // analyser on one throws in some browsers.
    if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
      level.current = 0;
      return;
    }

    let context: AudioContext | null = null;
    let frame = 0;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / samples.length);
        const scaled = Math.min(1, rms * 4.2);
        level.current += (scaled - level.current) * 0.28;
        frame = requestAnimationFrame(read);
      };
      read();
    } catch {
      // No analyser. The orb keeps its idle motion, which is a fair fallback.
      level.current = 0;
    }

    return () => {
      cancelAnimationFrame(frame);
      level.current = 0;
      // The stream belongs to the caller, so its tracks are deliberately left
      // running — stopping them here would end the conversation.
      void context?.close().catch(() => undefined);
    };
  }, [stream, active]);

  return level;
}
