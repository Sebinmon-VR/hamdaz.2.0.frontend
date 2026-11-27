/* The cut-out tool's engine: takes a photo of a person and gives back the
   person alone, on a transparent background, framed the way the website's Our
   People page expects (900 x 1200, head near the top, the face a set size).

   It all runs in the HR user's browser. Nothing is sent anywhere to be cut out.

   - The model is MODNet (portrait matting, Apache-2.0), about 25 MB. It is
     downloaded once from Hugging Face at a pinned revision, checked against its
     SHA-256 before use, and kept in the browser's Cache Storage after that.
   - The runtime is onnxruntime-web, served from this site's own /ort/ folder
     (copied there from node_modules by scripts/copy-ort.mjs), never a CDN: this
     page carries the ERP session, and third-party code does not belong on it.
   - After the model, a clean-up: keep only the largest connected shape (the
     person), fill holes in it, and drop faint fringe. That removes most of what
     a busy background leaves behind; the brush in the tool removes the rest.
*/

import type * as OrtTypes from "onnxruntime-web";

type Ort = typeof OrtTypes;

declare global {
  interface Window {
    ort?: Ort;
  }
}

const ORT_SCRIPT = "/ort/ort.wasm.min.js";
const MODEL_URL =
  process.env.NEXT_PUBLIC_CUTOUT_MODEL_URL ||
  "https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx";
/** sha256 of that model.onnx. A different file is refused, wherever it came from. */
const MODEL_SHA256 =
  process.env.NEXT_PUBLIC_CUTOUT_MODEL_SHA256 ||
  "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9";
const CACHE_NAME = "hz-cutout-model-v1";

/** The website's frame. */
export const OUT_W = 900;
export const OUT_H = 1200;
/** Where the head goes in that frame: its top at 8%, its width (hair included) 34%. */
const HEAD_TOP = 0.08 * OUT_H;
const HEAD_WIDTH = 0.34 * OUT_W;
/** The photo is worked on at most this size on its long side. */
export const WORK_MAX = 1600;
/** The model sees the photo at this size on its short side (a multiple of 32). */
const MODEL_SHORT = 768;
const MODEL_LONG_MAX = 1280;

export type Progress = { stage: "runtime" | "model" | "cutting"; fraction?: number };

/* ── loading the runtime and the model ─────────────────────────────────── */

let ortLoad: Promise<Ort> | null = null;

function loadOrt(): Promise<Ort> {
  if (window.ort) return Promise.resolve(window.ort);
  if (!ortLoad) {
    ortLoad = new Promise<Ort>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ORT_SCRIPT;
      s.async = true;
      s.onload = () => (window.ort ? resolve(window.ort) : reject(new Error("The cut-out runtime did not start.")));
      s.onerror = () => {
        ortLoad = null;
        reject(new Error("Could not load the cut-out runtime."));
      };
      document.head.appendChild(s);
    }).then((ort) => {
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      return ort;
    });
  }
  return ortLoad;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchModel(onProgress?: (p: Progress) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(MODEL_URL);
    if (hit) {
      const buf = await hit.arrayBuffer();
      if ((await sha256(buf)) === MODEL_SHA256) return buf;
      await cache.delete(MODEL_URL);
    }
  } catch {
    cache = null; // no Cache Storage (private window): download every time
  }
  const res = await fetch(MODEL_URL, { credentials: "omit" });
  if (!res.ok || !res.body) throw new Error("Could not download the cut-out model.");
  const total = Number(res.headers.get("content-length")) || 25_888_640;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.({ stage: "model", fraction: Math.min(1, got / total) });
  }
  const all = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  const buf = all.buffer;
  if ((await sha256(buf)) !== MODEL_SHA256) throw new Error("The cut-out model did not match its checksum, so it was not used.");
  try {
    await cache?.put(MODEL_URL, new Response(buf.slice(0), { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    /* full or unavailable: fine, it downloads again next time */
  }
  return buf;
}

let sessionLoad: Promise<OrtTypes.InferenceSession> | null = null;

function getSession(onProgress?: (p: Progress) => void): Promise<OrtTypes.InferenceSession> {
  if (!sessionLoad) {
    sessionLoad = (async () => {
      onProgress?.({ stage: "runtime" });
      const ort = await loadOrt();
      const model = await fetchModel(onProgress);
      return ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })().catch((e) => {
      sessionLoad = null;
      throw e;
    });
  }
  return sessionLoad;
}

/* ── images ─────────────────────────────────────────────────────────────── */

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("This browser cannot draw images.");
  return g;
}

/** The photo, upright (browsers apply EXIF orientation when decoding), at most WORK_MAX on its long side. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file is not a photo this browser can open. Use JPG, PNG or WebP.");
  }
  const k = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height));
  const c = canvas(bitmap.width * k, bitmap.height * k);
  const g = ctx2d(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}

/** True when the photo already has a transparent background: then it is used as it is. */
export function hasTransparency(photo: HTMLCanvasElement): boolean {
  const { data } = ctx2d(photo).getImageData(0, 0, photo.width, photo.height);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 16) clear += 1;
  return clear > data.length / 4 / 7 / 20; // over 5% of the picture is see-through
}

/* ── the cut-out ────────────────────────────────────────────────────────── */

/** The person's mask at the photo's size: white where they are, clear elsewhere. */
export async function cutOut(photo: HTMLCanvasElement, onProgress?: (p: Progress) => void): Promise<HTMLCanvasElement> {
  const session = await getSession(onProgress);
  onProgress?.({ stage: "cutting" });
  // Let the "cutting out" message paint before the CPU is busy.
  await new Promise((r) => setTimeout(r, 30));
  const ort = await loadOrt();

  const short = Math.min(photo.width, photo.height);
  let k = MODEL_SHORT / short;
  if (Math.max(photo.width, photo.height) * k > MODEL_LONG_MAX) k = MODEL_LONG_MAX / Math.max(photo.width, photo.height);
  const w = Math.max(32, Math.round((photo.width * k) / 32) * 32);
  const h = Math.max(32, Math.round((photo.height * k) / 32) * 32);
  const small = canvas(w, h);
  const sg = ctx2d(small);
  sg.imageSmoothingQuality = "high";
  sg.drawImage(photo, 0, 0, w, h);
  const px = sg.getImageData(0, 0, w, h).data;
  const plane = w * h;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    input[i] = px[i * 4] / 127.5 - 1;
    input[plane + i] = px[i * 4 + 1] / 127.5 - 1;
    input[2 * plane + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]) });
  const matte = clean(out[session.outputNames[0]].data as Float32Array, w, h);

  // To an image at the model's size, then up to the photo's size; smoothing gives a soft edge.
  const m = canvas(w, h);
  const mg = ctx2d(m);
  const img = mg.createImageData(w, h);
  for (let i = 0; i < plane; i += 1) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(matte[i] * 255);
  }
  mg.putImageData(img, 0, 0);
  const mask = canvas(photo.width, photo.height);
  const g = ctx2d(mask);
  g.imageSmoothingQuality = "high";
  g.drawImage(m, 0, 0, mask.width, mask.height);
  return mask;
}

/** A mask from a photo that is already cut out: its own transparency. */
export function maskFromAlpha(photo: HTMLCanvasElement): HTMLCanvasElement {
  const mask = canvas(photo.width, photo.height);
  const g = ctx2d(mask);
  const src = ctx2d(photo).getImageData(0, 0, photo.width, photo.height);
  const d = g.createImageData(photo.width, photo.height);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = src.data[i + 3];
  }
  g.putImageData(d, 0, 0);
  return mask;
}

/**
 * Keep the person, lose the rest: the largest connected shape, its holes filled,
 * the soft edge kept only right next to it, and faint fringe pushed out.
 */
export function clean(a: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let i = 0; i < n; i += 1) {
    if (a[i] <= 0.5 || label[i]) continue;
    next += 1;
    let top = 0;
    let size = 0;
    stack[top++] = i;
    label[i] = next;
    while (top) {
      const p = stack[--top];
      size += 1;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q >= 0 && q < n && !label[q] && a[q] > 0.5) {
          label[q] = next;
          stack[top++] = q;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) keep[i] = label[i] === best && best ? 1 : 0;

  // Holes: anything not the person that the border cannot reach.
  const outside = new Uint8Array(n);
  let top = 0;
  const seed = (p: number) => {
    if (!keep[p] && !outside[p]) {
      outside[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < w; x += 1) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (top) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p - w >= 0) seed(p - w);
    if (p + w < n) seed(p + w);
  }
  for (let i = 0; i < n; i += 1) if (!outside[i]) keep[i] = 1;

  // The soft edge: only within a few pixels of the person.
  let near = keep;
  for (let r = 0; r < 4; r += 1) {
    const grown = near.slice();
    for (let i = 0; i < n; i += 1) {
      if (near[i]) continue;
      const x = i % w;
      if ((x > 0 && near[i - 1]) || (x < w - 1 && near[i + 1]) || (i >= w && near[i - w]) || (i + w < n && near[i + w])) grown[i] = 1;
    }
    near = grown;
  }
  // Inside the person (holes included) and at their edge, the model's own values stand:
  // a gap between an arm and the body is background, and the model already says so.
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = near[i] ? a[i] : 0;
    out[i] = Math.min(1, Math.max(0, (v - 0.12) / 0.76));
  }
  return out;
}

/* ── framing ────────────────────────────────────────────────────────────── */

export interface Frame {
  /** Photo pixels to frame pixels. */
  scale: number;
  /** Where the photo's top-left corner lands in the frame. */
  x: number;
  y: number;
}

/**
 * Where the head is, from the mask alone: its top is the first row with the
 * person in it; its width is the widest row above the neck, the neck being the
 * narrowest point before the shoulders spread out.
 */
export function autoFrame(mask: HTMLCanvasElement): Frame {
  const w = mask.width;
  const h = mask.height;
  const { data } = ctx2d(mask).getImageData(0, 0, w, h);
  const left = new Int32Array(h).fill(-1);
  const right = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 127) {
        if (left[y] < 0) left[y] = x;
        right[y] = x;
      }
    }
  }
  let topRow = 0;
  while (topRow < h && left[topRow] < 0) topRow += 1;
  let bottom = h - 1;
  while (bottom > topRow && left[bottom] < 0) bottom -= 1;
  if (topRow >= h) return { scale: OUT_W / w, x: 0, y: 0 };
  const span = bottom - topRow + 1;
  const width = (y: number) => (left[y] < 0 ? 0 : right[y] - left[y] + 1);
  // Smoothed widths down the top part of the person.
  const look = Math.min(bottom, topRow + Math.round(span * 0.6));
  const sm: number[] = [];
  for (let y = topRow; y <= look; y += 1) {
    let s = 0;
    let c = 0;
    for (let k = -3; k <= 3; k += 1) {
      const yy = y + k;
      if (yy >= topRow && yy <= look) {
        s += width(yy);
        c += 1;
      }
    }
    sm.push(s / c);
  }
  // The neck: the narrowest point after the head has filled out, followed by a clear widening.
  let headW = 0;
  let neck = -1;
  let maxSoFar = 0;
  for (let i = Math.round(span * 0.06); i < sm.length; i += 1) {
    maxSoFar = Math.max(maxSoFar, sm[i]);
    const ahead = sm.slice(i, Math.min(sm.length, i + Math.round(span * 0.15)));
    if (sm[i] < maxSoFar * 0.95 && ahead.length > 3 && Math.max(...ahead) > sm[i] * 1.35) {
      neck = i;
      headW = maxSoFar;
      break;
    }
  }
  const shoulders = Math.max(...sm);
  if (neck < 0 || headW < shoulders * 0.25) {
    // No clear neck (a scarf, long hair, a turned pose): a head is about half the shoulders.
    headW = shoulders * 0.5;
    neck = Math.round(span * 0.18);
  }
  let cx = 0;
  let c = 0;
  for (let y = topRow; y <= topRow + neck; y += 1) {
    if (left[y] >= 0) {
      cx += (left[y] + right[y]) / 2;
      c += 1;
    }
  }
  cx = c ? cx / c : w / 2;
  const scale = HEAD_WIDTH / Math.max(8, headW);
  return { scale, x: OUT_W / 2 - cx * scale, y: HEAD_TOP - topRow * scale };
}

/* ── output ─────────────────────────────────────────────────────────────── */

/** The person alone: the photo with the mask as its transparency. */
export function applyMask(photo: HTMLCanvasElement, mask: HTMLCanvasElement, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? canvas(photo.width, photo.height);
  const g = ctx2d(c);
  g.globalCompositeOperation = "copy";
  g.drawImage(photo, 0, 0);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-over";
  return c;
}

/** The 900 x 1200 picture the website gets. */
export function render(cut: HTMLCanvasElement, frame: Frame, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? canvas(OUT_W, OUT_H);
  const g = ctx2d(c);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, OUT_W, OUT_H);
  g.imageSmoothingQuality = "high";
  g.setTransform(frame.scale, 0, 0, frame.scale, frame.x, frame.y);
  g.drawImage(cut, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

export function toBlob(c: HTMLCanvasElement, type = "image/webp", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the picture."))), type, quality),
  );
}

/* ── the brush ──────────────────────────────────────────────────────────── */

/** Erase (take away) or restore (put back) a round dab of the mask. */
export function dab(mask: HTMLCanvasElement, x: number, y: number, radius: number, mode: "erase" | "restore"): void {
  const g = ctx2d(mask);
  g.save();
  g.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
  const grad = g.createRadialGradient(x, y, radius * 0.6, x, y, radius);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The mask's transparency only, for undo: a quarter of the memory of a full copy. */
export function snapshot(mask: HTMLCanvasElement): Uint8ClampedArray {
  const { data } = ctx2d(mask).getImageData(0, 0, mask.width, mask.height);
  const a = new Uint8ClampedArray(mask.width * mask.height);
  for (let i = 0; i < a.length; i += 1) a[i] = data[i * 4 + 3];
  return a;
}

export function restore(mask: HTMLCanvasElement, a: Uint8ClampedArray): void {
  const g = ctx2d(mask);
  const d = g.createImageData(mask.width, mask.height);
  for (let i = 0; i < a.length; i += 1) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255;
    d.data[i * 4 + 3] = a[i];
  }
  g.putImageData(d, 0, 0);
}
