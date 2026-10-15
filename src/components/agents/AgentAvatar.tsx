"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { BLOB_COLOURS, normalizeAvatar, type AvatarSpec } from "@/lib/agents";

/**
 * An agent's avatar: a soft, fuzzy blob with a face.
 *
 * Each body is a handful of circles and ellipses drawn as one shape — one
 * gradient across all of them (userSpaceOnUse, so there are no seams), one
 * clip for the lighting, and one filter that roughens the edge and grains the
 * surface so it reads as felt rather than as vector art. Eyes and most things
 * worn on it stay crisp on top, the way buttons on a plush toy do.
 *
 * It breathes (a slow squash from the floor up) and blinks. `mood="active"`
 * makes it hop and glance — a card under the pointer, an agent at work.
 * Everything stops under reduced motion (globals.css).
 *
 * It also watches the pointer: the face drifts a few units towards it, googly
 * pupils a little further, and the body leans a degree or two. One shared
 * listener feeds every avatar on the page through two CSS variables, so a
 * mouse move re-renders nothing (see `follow` below).
 *
 * Plain SVG, no package. The last animated face pulled 430 MB of runtime into
 * node_modules and broke the Static Web Apps deploy.
 */

type Prim =
  | { c: [number, number, number] }
  | { e: [number, number, number, number] }
  | { r: [number, number, number, number, number] }
  | { p: string };

interface BodyDef {
  prims: Prim[];
  /** Eye centres and their size. */
  eyes: [[number, number], [number, number]];
  eyeScale: number;
  /** Where a hat sits, its tilt, and how wide it is drawn. */
  hat: { x: number; y: number; tilt: number; scale: number };
}

const INK = "#131317";
const FLOOR = 182;

const BODIES: Record<AvatarSpec["body"], BodyDef> = {
  cloud: {
    prims: [
      { e: [100, 148, 78, 34] },
      { c: [66, 112, 42] },
      { c: [120, 98, 50] },
      { c: [152, 134, 32] },
      { r: [24, 128, 152, 54, 27] },
    ],
    eyes: [[86, 132], [116, 132]],
    eyeScale: 1,
    hat: { x: 88, y: 66, tilt: -14, scale: 0.95 },
  },
  frog: {
    prims: [
      { e: [100, 150, 84, 32] },
      { e: [100, 128, 72, 44] },
      { c: [64, 94, 29] },
      { c: [136, 94, 29] },
      { r: [16, 140, 168, 42, 21] },
    ],
    eyes: [[64, 90], [136, 90]],
    eyeScale: 1.3,
    hat: { x: 100, y: 88, tilt: 0, scale: 0.8 },
  },
  pebble: {
    prims: [
      {
        p: "M100 40 C130 40 148 88 168 136 C182 170 168 182 140 182 L60 182 C32 182 18 170 32 136 C52 88 70 40 100 40 Z",
      },
    ],
    eyes: [[80, 124], [120, 124]],
    eyeScale: 1,
    hat: { x: 100, y: 48, tilt: 0, scale: 0.75 },
  },
  heart: {
    prims: [
      { c: [72, 114, 50] },
      { c: [128, 110, 52] },
      { e: [100, 154, 80, 28] },
      { r: [22, 132, 156, 50, 25] },
    ],
    eyes: [[80, 124], [124, 122]],
    eyeScale: 1,
    hat: { x: 70, y: 68, tilt: -10, scale: 0.85 },
  },
  mochi: {
    prims: [{ e: [100, 134, 82, 52] }, { r: [18, 132, 164, 50, 25] }],
    eyes: [[80, 128], [120, 128]],
    eyeScale: 1,
    hat: { x: 100, y: 88, tilt: 0, scale: 0.9 },
  },
  bean: {
    prims: [{ r: [52, 36, 96, 146, 48] }],
    eyes: [[83, 90], [117, 90]],
    eyeScale: 0.95,
    hat: { x: 100, y: 42, tilt: 0, scale: 0.8 },
  },
};

function Shape({ prim, fill }: { prim: Prim; fill?: string }) {
  if ("c" in prim) return <circle cx={prim.c[0]} cy={prim.c[1]} r={prim.c[2]} fill={fill} />;
  if ("e" in prim) return <ellipse cx={prim.e[0]} cy={prim.e[1]} rx={prim.e[2]} ry={prim.e[3]} fill={fill} />;
  if ("r" in prim) {
    const [x, y, w, h, rx] = prim.r;
    return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} />;
  }
  return <path d={prim.p} fill={fill} />;
}

/* ── following the pointer ────────────────────────────────────────────── */

/*
 * One pointermove listener for the whole page, throttled to a frame. Each
 * avatar that follows registers its <svg>; on every frame it is given
 * --fx and --fy, each -1…1, saying where the pointer is relative to its own
 * middle. CSS turns those into small transforms, with a transition to ease
 * them, so React is never involved after mount.
 */

const followers = new Set<SVGSVGElement>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;
/** How far away, in screen pixels, the pointer has to be to get the full lean. */
const REACH = 360;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function paint() {
  frame = 0;
  for (const el of followers) {
    if (!pointer) {
      el.style.setProperty("--fx", "0");
      el.style.setProperty("--fy", "0");
      continue;
    }
    const box = el.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) continue;
    el.style.setProperty("--fx", clamp((pointer.x - (box.left + box.width / 2)) / REACH).toFixed(3));
    el.style.setProperty("--fy", clamp((pointer.y - (box.top + box.height * 0.45)) / REACH).toFixed(3));
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(paint);
}

/** For an avatar that moves while the pointer does not — the companion. */
export const repaintFollowers = schedule;

function onMove(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  pointer = { x: e.clientX, y: e.clientY };
  schedule();
}

function onLeave() {
  pointer = null;
  schedule();
}

function follow(el: SVGSVGElement): () => void {
  if (followers.size === 0) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  }
  followers.add(el);
  schedule();
  return () => {
    followers.delete(el);
    if (followers.size === 0) {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    }
  };
}

export function AgentAvatar({
  spec: raw,
  size = 96,
  mood = "idle",
  className,
  title,
}: {
  spec: AvatarSpec;
  size?: number;
  /** idle breathes and blinks; active hops and glances; still holds. */
  mood?: "idle" | "active" | "still";
  className?: string;
  title?: string;
}) {
  const spec = normalizeAvatar(raw);
  // Gradient, clip and filter ids must be unique per drawing, and useId's own
  // characters are not all safe inside url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const body = BODIES[spec.body];
  const colour = BLOB_COLOURS.find((c) => c.key === spec.colour) ?? BLOB_COLOURS[0];
  const tone = (dl: number, dc = 0) =>
    `oklch(${Math.max(0, Math.min(1, colour.light + dl)).toFixed(3)} ${Math.max(0, colour.chroma + dc).toFixed(3)} ${colour.hue})`;

  const moving = mood !== "still";

  // Still avatars (the picker's thumbnails) do not watch; neither does anybody
  // who has asked the system for less motion.
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svg.current;
    if (!el || !moving) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return follow(el);
  }, [moving]);
  const anim = (name: string) => (moving ? name : undefined);
  const [[lx, ly], [rx, ry]] = body.eyes;
  const s = body.eyeScale;
  const mid = (lx + rx) / 2;
  const glasses = spec.accessory === "glasses" || spec.accessory === "shades";

  return (
    <svg
      ref={svg}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={clsx("shrink-0 overflow-visible", className)}
    >
      <defs>
        <radialGradient id={id("fill")} gradientUnits="userSpaceOnUse" cx={78} cy={70} r={150}>
          <stop offset="0" stopColor={tone(0.12, -0.03)} />
          <stop offset="0.55" stopColor={tone(0)} />
          <stop offset="1" stopColor={tone(-0.2, 0.01)} />
        </radialGradient>
        <clipPath id={id("clip")}>
          {body.prims.map((prim, i) => (
            <Shape key={i} prim={prim} />
          ))}
        </clipPath>
        {/* Felt: roughen the outline, then sprinkle a fine grain over it. */}
        <filter id={id("felt")} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="fuzzy" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 -0.42" result="grain" />
          <feComposite in="grain" in2="fuzzy" operator="in" result="grainOn" />
          <feMerge>
            <feMergeNode in="fuzzy" />
            <feMergeNode in="grainOn" />
          </feMerge>
        </filter>
        <filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* The floor shadow, breathing with the body. */}
      <ellipse
        cx={100}
        cy={FLOOR + 4}
        rx={72}
        ry={7}
        fill="#000"
        opacity={0.22}
        className={anim(mood === "active" ? "blob-shadow-hop" : "blob-shadow")}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      <g
        className={anim(mood === "active" ? "blob-hop" : "blob-breathe")}
        style={{ transformBox: "view-box", transformOrigin: `100px ${FLOOR}px` }}
      >
        <g className="blob-lean">
        {/* ── the body ── */}
        <g filter={url("felt")}>
          <g fill={url("fill")}>
            {body.prims.map((prim, i) => (
              <Shape key={i} prim={prim} />
            ))}
          </g>
          <g clipPath={url("clip")}>
            {/* Light from the top left, and the underside in shade. */}
            <ellipse cx={70} cy={70} rx={46} ry={30} fill="#fff" opacity={0.22} filter={url("soft")} />
            <ellipse cx={100} cy={FLOOR + 6} rx={96} ry={22} fill="#000" opacity={0.22} filter={url("soft")} />
          </g>
          {spec.accessory === "beret" && <Beret hat={body.hat} />}
        </g>

        {/* ── the face ── */}
        <g className="blob-look">
        <g className={mood === "active" ? "blob-glance" : undefined}>
          {spec.mouth !== "none" || spec.eyes === "happy" || spec.eyes === "joy" ? (
            <g fill="#ff6f9f" opacity={0.32} filter={url("soft")}>
              <ellipse cx={lx - 12 * s} cy={ly + 16 * s} rx={9} ry={5} />
              <ellipse cx={rx + 12 * s} cy={ry + 16 * s} rx={9} ry={5} />
            </g>
          ) : null}
          <g
            className={["dots", "wide", "googly", "sparkle"].includes(spec.eyes) && !glasses ? anim("blob-blink") : undefined}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <Eye kind={spec.eyes} x={lx} y={ly} s={s} />
            <Eye kind={spec.eyes} x={rx} y={ry} s={s} />
          </g>
          <Mouth kind={spec.mouth} x={mid} y={Math.max(ly, ry) + 20 * s} />
          {glasses && <Glasses shades={spec.accessory === "shades"} l={[lx, ly]} r={[rx, ry]} s={s} />}
        </g>
        </g>

        {spec.accessory !== "beret" && !glasses && spec.accessory !== "none" && (
          <Hat kind={spec.accessory} hat={body.hat} />
        )}
        </g>
      </g>
    </svg>
  );
}

/* ── the face ────────────────────────────────────────────────────────── */

function Eye({ kind, x, y, s }: { kind: AvatarSpec["eyes"]; x: number; y: number; s: number }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  const stroke = { fill: "none", stroke: INK, strokeWidth: 4, strokeLinecap: "round" as const };
  switch (kind) {
    case "dots":
      return (
        <g transform={t}>
          <ellipse rx={7.5} ry={11} fill={INK} />
          <circle cx={-2.2} cy={-4.5} r={2} fill="#fff" opacity={0.85} />
        </g>
      );
    case "wide":
      return (
        <g transform={t}>
          <circle r={11} fill={INK} />
          <circle cx={-3.5} cy={-4} r={3.6} fill="#fff" />
          <circle cx={3.5} cy={3.5} r={1.6} fill="#fff" opacity={0.8} />
        </g>
      );
    case "googly":
      return (
        <g transform={t}>
          <circle r={14} fill="#fff" stroke={INK} strokeWidth={1.6} />
          <g className="blob-pupil">
            <circle cx={1} cy={1.5} r={7.5} fill={INK} />
            <circle cx={-1} cy={-1} r={2.2} fill="#fff" />
          </g>
        </g>
      );
    case "happy":
      return <path transform={t} d="M-9 -2 Q0 7 9 -2" {...stroke} />;
    case "joy":
      return <path transform={t} d="M-9 3 Q0 -7 9 3" {...stroke} />;
    case "sparkle":
      return (
        <path
          transform={t}
          d="M0 -11 Q1.8 -1.8 11 0 Q1.8 1.8 0 11 Q-1.8 1.8 -11 0 Q-1.8 -1.8 0 -11 Z"
          fill={INK}
        />
      );
  }
}

function Mouth({ kind, x, y }: { kind: AvatarSpec["mouth"]; x: number; y: number }) {
  const t = `translate(${x} ${y})`;
  switch (kind) {
    case "smile":
      return <path transform={t} d="M-7 0 Q0 7 7 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
    case "grin":
      return (
        <g transform={t}>
          <path d="M-9 -1 Q0 13 9 -1 Z" fill={INK} strokeLinejoin="round" stroke={INK} strokeWidth={1.5} />
          <ellipse cx={0} cy={5.5} rx={4} ry={2.2} fill="#ff7a9a" />
        </g>
      );
    case "o":
      return <ellipse transform={t} rx={4.2} ry={5.2} fill={INK} />;
    case "none":
      return null;
  }
}

function Glasses({
  shades,
  l,
  r,
  s,
}: {
  shades: boolean;
  l: [number, number];
  r: [number, number];
  s: number;
}) {
  const radius = (shades ? 15 : 16) * s;
  const [lx, ly] = l;
  const [rx, ry] = r;
  return (
    <g stroke={INK} strokeWidth={3.4} strokeLinecap="round">
      {/* arms first, so the lenses sit over them */}
      <path d={`M${lx - radius} ${ly - 2} l-14 -4`} fill="none" />
      <path d={`M${rx + radius} ${ry - 2} l14 -4`} fill="none" />
      <path
        d={`M${lx + radius - 1} ${ly - 3} Q${(lx + rx) / 2} ${Math.min(ly, ry) - 10} ${rx - radius + 1} ${ry - 3}`}
        fill="none"
      />
      <circle cx={lx} cy={ly} r={radius} fill={shades ? INK : "rgba(255,255,255,0.12)"} />
      <circle cx={rx} cy={ry} r={radius} fill={shades ? INK : "rgba(255,255,255,0.12)"} />
      {shades && (
        <g stroke="#fff" strokeOpacity={0.35} strokeWidth={2.4} fill="none">
          <path d={`M${lx - radius * 0.55} ${ly - radius * 0.2} Q${lx - radius * 0.45} ${ly - radius * 0.6} ${lx - radius * 0.1} ${ly - radius * 0.62}`} />
          <path d={`M${rx - radius * 0.55} ${ry - radius * 0.2} Q${rx - radius * 0.45} ${ry - radius * 0.6} ${rx - radius * 0.1} ${ry - radius * 0.62}`} />
        </g>
      )}
    </g>
  );
}

/* ── things to wear ──────────────────────────────────────────────────── */

function Worn({ hat, children }: { hat: BodyDef["hat"]; children: ReactNode }) {
  return <g transform={`translate(${hat.x} ${hat.y}) rotate(${hat.tilt}) scale(${hat.scale})`}>{children}</g>;
}

/** Felt, like the body — so it lives inside the felt filter. */
function Beret({ hat }: { hat: BodyDef["hat"] }) {
  return (
    <Worn hat={hat}>
      {/* A felt pancake, slouched to one side, with its stalk on top. */}
      <ellipse cx={4} cy={6} rx={60} ry={20} fill="#141418" />
      <path d="M-62 6 C-60 -30 -20 -44 12 -42 C46 -40 70 -22 66 4 C40 18 -36 20 -62 6 Z" fill="#232329" />
      <ellipse cx={-14} cy={-24} rx={26} ry={9} fill="#fff" opacity={0.07} />
      <rect x={-6} y={-54} width={10} height={14} rx={5} fill="#232329" />
    </Worn>
  );
}

function Hat({ kind, hat }: { kind: AvatarSpec["accessory"]; hat: BodyDef["hat"] }) {
  switch (kind) {
    case "bow":
      return (
        <Worn hat={{ ...hat, x: hat.x + 26 * hat.scale, tilt: hat.tilt + 14 }}>
          <path d="M0 0 C-10 -16 -32 -16 -30 0 C-32 16 -10 16 0 0 Z" fill="#ff4f7e" />
          <path d="M0 0 C10 -16 32 -16 30 0 C32 16 10 16 0 0 Z" fill="#ff4f7e" />
          <path d="M-22 -4 Q-14 -8 -8 -2" fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={2.5} strokeLinecap="round" />
          <circle r={7} fill="#e23a68" />
        </Worn>
      );
    case "party":
      return (
        <Worn hat={hat}>
          <path d="M-24 4 L0 -52 L24 4 Z" fill="#ffd23f" />
          <path d="M-14 -18 L10 -6 M-6 -36 L14 -24 M-20 -6 L20 4" stroke="#ff4f9a" strokeWidth={5} strokeLinecap="round" />
          <path d="M-24 4 L0 -52 L24 4 Z" fill="none" stroke="#e8b400" strokeWidth={1.5} strokeLinejoin="round" />
          <circle cy={-54} r={8} fill="#5ae6ff" />
        </Worn>
      );
    case "crown":
      return (
        <Worn hat={hat}>
          <path d="M-30 6 L-34 -30 L-14 -12 L0 -38 L14 -12 L34 -30 L30 6 Z" fill="#ffcf3a" stroke="#e0a800" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={0} cy={-4} r={4.5} fill="#ff4f7e" />
          <circle cx={-18} cy={-2} r={3.5} fill="#5ae6ff" />
          <circle cx={18} cy={-2} r={3.5} fill="#6dff9a" />
        </Worn>
      );
    case "sprout":
      return (
        <Worn hat={hat}>
          <path d="M0 4 Q-2 -14 2 -30" fill="none" stroke="#2f9e4f" strokeWidth={4} strokeLinecap="round" />
          <path d="M2 -26 C-10 -44 -30 -36 -30 -26 C-18 -20 -6 -20 2 -26 Z" fill="#53c26b" />
          <path d="M2 -28 C14 -48 34 -40 32 -30 C20 -22 8 -22 2 -28 Z" fill="#6ad67f" />
        </Worn>
      );
    default:
      return null;
  }
}
