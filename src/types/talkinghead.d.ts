// The face libraries ship as plain ES modules with no type declarations.
// Only what the assistant's face uses is described here.

declare module "@met4citizen/talkinghead" {
  export class TalkingHead {
    constructor(node: HTMLElement, opt?: Record<string, unknown>);
    audioCtx: AudioContext;
    lipsync: Record<string, unknown>;
    isSpeaking: boolean;
    showAvatar(avatar: Record<string, unknown>, onprogress?: (ev: ProgressEvent) => void): Promise<void>;
    speakAudio(r: unknown, opt?: Record<string, unknown> | null, onsubtitles?: ((word: string) => void) | null): void;
    speakMarker(onmarker: () => void): void;
    stopSpeaking(): void;
    setMood(mood: string): void;
    setView(view: string, opt?: Record<string, unknown>): void;
    lookAtCamera(t: number): void;
    makeEyeContact(t: number): void;
    start(): void;
    stop(): void;
    dispose(): void;
  }
}

declare module "@met4citizen/talkinghead/modules/lipsync-en.mjs" {
  export class LipsyncEn {}
}

declare module "@met4citizen/headtts" {
  export interface HeadTTSMessage {
    type: "audio" | "error" | string;
    ref?: number;
    data: Record<string, unknown> & { error?: string };
  }
  export class HeadTTS {
    constructor(settings?: Record<string, unknown>, onerror?: ((e: unknown) => void) | null);
    onmessage: ((message: HeadTTSMessage) => void) | null;
    connect(
      settings?: Record<string, unknown> | null,
      onprogress?: ((ev: ProgressEvent) => void) | null,
      onerror?: ((e: unknown) => void) | null,
    ): Promise<void>;
    setup(data: Record<string, unknown>): Promise<unknown>;
    synthesize(
      data: { input: string },
      onmessage?: ((message: HeadTTSMessage) => void) | null,
      onerror?: ((e: unknown) => void) | null,
    ): Promise<unknown>;
    clear(): void;
  }
}
