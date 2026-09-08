"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The thing that says it is listening.
 *
 * A voice interface has no cursor, no field and no button being pressed, so the
 * only thing telling somebody the machine is hearing them is how it moves. That
 * makes this the load-bearing element of the whole voice screen rather than
 * decoration, and it is why it is a canvas: the blob is driven by the actual
 * microphone level at sixty frames a second, and doing that through React would
 * re-render the screen sixty times to move one shape.
 *
 * It is drawn in the app's own two colours — the accent → second ramp that every
 * bar and meter in this design already runs on — read from the CSS variables
 * rather than hard-coded, so it follows the palette and the mode like everything
 * else. Four states, and each says a different thing:
 *
 *   idle       breathing slowly, waiting to be spoken to
 *   listening  answering to the microphone, so a person can see they are heard
 *   thinking   turning under its own power — the model has it now
 *   speaking   pulsing on an envelope of its own, since the audio is generated
 *              on the server and there is no signal here to measure
 *
 * **Everything is drawn inside the box, and that is a constraint rather than a
 * detail.** A canvas clips, and a glow whose gradient still has alpha when it
 * reaches the edge is cut off square — which reads as a border nobody asked for,
 * on a shape whose whole point is not having one. So every radius below is a
 * fraction of `R`, the half-width, and the outermost one fades to fully
 * transparent before it gets there. `GEOMETRY` collects those fractions in one
 * place so the relationship stays checkable.
 *
 * Reduced motion is honoured properly rather than by disabling the component:
 * the shape still answers the microphone, because that is information, and only
 * the idle wobble and the rotation stop.
 */

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Every radius as a fraction of the half-width, so nothing can quietly grow
 * past the edge. The rule the whole file depends on: `HALO` is 1 — the glow
 * reaches zero alpha exactly at the box — and `CORE * LOUD + BLOOM` stays under
 * it, so the blurred shape never touches the boundary either.
 */
const GEOMETRY = {
  /** Core radius at rest. */
  CORE: 0.4,
  /** What the core is multiplied by at full volume. */
  LOUD: 1.16,
  /** How far the blur spreads past the core. */
  BLOOM: 0.16,
  /** The two trailing rings, as multiples of the core. */
  RINGS: [1.18, 1.34] as const,
  /** The halo fades to nothing exactly here. */
  HALO: 1,
};

/**
 * An orb that fits the window it is drawn in.
 *
 * The voice screens are `fixed inset-0` columns: a bar, the orb, the
 * conversation, and the controls. Only the conversation can give up space, so
 * on a short window — a laptop with a dock, a phone held sideways — a
 * fixed-size orb plus the controls came to more than the viewport and the
 * controls went off the bottom edge, where nothing scrolls to reach them. The
 * orb is the piece that can afford to be smaller, so it is the piece that
 * yields.
 *
 * Rounded to eight pixels, because the animation lives on the canvas and a
 * canvas resize restarts it: without the rounding, dragging a window edge would
 * restart the orb on every pixel of the drag.
 */
export function useOrbSize(max = 200): number {
  const [size, setSize] = useState(max);

  useEffect(() => {
    const fit = () => {
      const next = Math.max(
        88,
        Math.min(
          max,
          Math.round(Math.min(window.innerHeight * 0.22, window.innerWidth * 0.5) / 8) * 8,
        ),
      );
      setSize((current) => (current === next ? current : next));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [max]);

  return size;
}

export function Orb({
  state,
  level,
  size = 220,
  className,
}: {
  state: OrbState;
  /** Live microphone level, 0–1. Updated outside React by `useMicLevel`. */
  level?: React.RefObject<number>;
  size?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Read inside the frame loop, so a state change never restarts the animation
  // — the orb eases from one state to the next instead of jumping.
  const phase = useRef<OrbState>(state);
  phase.current = state;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let still = motion.matches;
    const onMotion = () => {
      still = motion.matches;
    };
    motion.addEventListener("change", onMotion);

    // Re-read on a theme or palette change. The colours are CSS variables and
    // switching the mode swaps them underneath a canvas that has already
    // sampled them — without this the orb keeps yesterday's accent until the
    // component happens to remount.
    let accent: RGB = [79, 216, 255];
    let second: RGB = [255, 79, 163];
    const readColours = () => {
      const styles = getComputedStyle(element);
      accent = parse(styles.getPropertyValue("--accent")) ?? accent;
      second = parse(styles.getPropertyValue("--second")) ?? second;
    };
    readColours();
    const watcher = new MutationObserver(readColours);
    watcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette", "style"],
    });

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    element.width = Math.round(size * ratio);
    element.height = Math.round(size * ratio);
    context.scale(ratio, ratio);

    const centre = size / 2;
    // Half the box. Every radius is a fraction of this, and nothing exceeds it.
    const R = size / 2;

    let frame = 0;
    const start = performance.now();
    // Eased towards the target every frame, so gaining or losing the
    // microphone is a swell rather than a jump.
    let amplitude = 0;
    let spin = 0;
    let drift = 0;

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const current = phase.current;

      const target =
        current === "listening"
          ? Math.min(1, level?.current ?? 0)
          : current === "speaking"
            ? // Nothing to measure: the audio is generated on the server and
              // played back as an opaque clip. So this is an envelope rather
              // than a reading — three incommensurate sines, which reads as
              // speech rhythm instead of as a metronome.
              0.34 +
              0.3 * Math.abs(Math.sin(t * 5.1)) * Math.abs(Math.sin(t * 1.7 + 0.6)) +
              0.1 * Math.sin(t * 8.3)
            : current === "thinking"
              ? 0.22 + 0.09 * Math.sin(t * 2.4)
              : 0.06 + 0.05 * Math.sin(t * 1.15);

      amplitude += (Math.max(0, target) - amplitude) * (still ? 0.5 : 0.16);
      // Two rotations at different rates: the gradient turns with `spin` and
      // the shape's own lobes wander with `drift`, so the surface never lines
      // up with the silhouette twice and the thing does not look like it is
      // simply spinning.
      spin += current === "thinking" ? 0.014 : 0.0032;
      drift += current === "thinking" ? 0.006 : 0.0017;

      // Scaled so the blurred edge still lands inside the box at full volume.
      const core = R * GEOMETRY.CORE * (1 + amplitude * (GEOMETRY.LOUD - 1));

      context.clearRect(0, 0, size, size);

      /* The halo. A rect fill rather than an arc: past its last stop the
         gradient paints that stop's colour, which is fully transparent, so the
         corners come out empty and there is no edge anywhere. Drawn first and
         wider than the blob, so the blob sits *in* it — a rim would read as a
         border, and nothing in this design is a card with one. */
      const halo = context.createRadialGradient(
        centre,
        centre,
        core * 0.35,
        centre,
        centre,
        R * GEOMETRY.HALO,
      );
      halo.addColorStop(0, rgba(accent, 0.34 + amplitude * 0.26));
      halo.addColorStop(0.42, rgba(second, 0.13 + amplitude * 0.13));
      halo.addColorStop(0.72, rgba(second, 0.04));
      halo.addColorStop(1, rgba(second, 0));
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);

      /* Two rings trailing the blob at a fraction of its motion. They are what
         stops a single circle reading as a loading spinner. */
      for (let i = 0; i < GEOMETRY.RINGS.length; i++) {
        const scale = GEOMETRY.RINGS[i];
        context.beginPath();
        blob(context, centre, core * scale, t * 0.55 + scale * 3, drift * 0.7, amplitude * 0.45, still);
        context.strokeStyle = rgba(i === 0 ? accent : second, 0.2 - i * 0.07);
        context.lineWidth = 1.1;
        context.stroke();
      }

      /* The bloom: the body drawn once more, blurred, underneath itself. This
         is what gives the shape a soft edge instead of a cut one — and the blur
         radius is part of the geometry budget, so it cannot reach the box. */
      context.save();
      context.filter = `blur(${(R * GEOMETRY.BLOOM).toFixed(1)}px)`;
      context.globalAlpha = 0.55 + amplitude * 0.25;
      context.beginPath();
      blob(context, centre, core, t, drift, amplitude, still);
      context.fillStyle = ramp(context, centre, core, spin, accent, second);
      context.fill();
      context.restore();

      /* The body. */
      context.beginPath();
      blob(context, centre, core, t, drift, amplitude, still);
      context.fillStyle = ramp(context, centre, core, spin, accent, second);
      context.fill();

      /* A highlight off-centre, which is what gives it a surface rather than a
         silhouette. It drifts with the spin, so the shape reads as turning. */
      const gloss = context.createRadialGradient(
        centre - core * 0.3 * Math.cos(spin),
        centre - core * 0.34 * Math.sin(spin + 1.2) - core * 0.1,
        0,
        centre,
        centre,
        core * 1.15,
      );
      gloss.addColorStop(0, "rgba(255,255,255,0.5)");
      gloss.addColorStop(0.4, "rgba(255,255,255,0.07)");
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gloss;
      context.fill();

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      motion.removeEventListener("change", onMotion);
    };
  }, [size, level]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={LABEL[state]}
      style={{ width: size, height: size }}
      // `block` because an inline canvas sits on the text baseline and leaves a
      // few pixels of descender space under it, which in a centred layout reads
      // as the orb hanging slightly high.
      className={clsx("block select-none", className)}
    />
  );
}

const LABEL: Record<OrbState, string> = {
  idle: "The assistant is waiting",
  listening: "The assistant is listening",
  thinking: "The assistant is working on it",
  speaking: "The assistant is speaking",
};

/** The accent → second ramp, turned so the light appears to move over it. */
function ramp(
  context: CanvasRenderingContext2D,
  centre: number,
  radius: number,
  spin: number,
  accent: RGB,
  second: RGB,
): CanvasGradient {
  const x = Math.cos(spin) * radius;
  const y = Math.sin(spin) * radius;
  const gradient = context.createLinearGradient(centre - x, centre - y, centre + x, centre + y);
  gradient.addColorStop(0, rgba(accent, 1));
  gradient.addColorStop(0.55, rgba(mix(accent, second, 0.5), 1));
  gradient.addColorStop(1, rgba(second, 1));
  return gradient;
}

/**
 * A closed, smooth blob: a circle with three harmonics on its radius.
 *
 * Three rather than one because a single sine reads as a wobbling circle, and
 * three that share no common factor never quite repeat — which is what makes
 * the shape look organic instead of mechanical. The harmonics scale with
 * amplitude, so a quiet room gives a near-perfect circle and a loud one
 * distorts it.
 *
 * The points are joined with quadratic curves through their midpoints rather
 * than with straight lines. At this size a polygon of 72 sides is visibly
 * faceted along the flatter arcs, and the curve costs nothing.
 */
function blob(
  context: CanvasRenderingContext2D,
  centre: number,
  radius: number,
  t: number,
  drift: number,
  amplitude: number,
  still: boolean,
): void {
  const wobble = still ? 0 : 0.05 + amplitude * 0.17;
  const steps = 64;
  const points: [number, number][] = [];

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 + drift;
    const r =
      radius *
      (1 +
        wobble * Math.sin(angle * 3 + t * 1.5) +
        wobble * 0.6 * Math.sin(angle * 5 - t * 1.1) +
        wobble * 0.37 * Math.sin(angle * 2 + t * 2.2));
    points.push([centre + Math.cos(angle) * r, centre + Math.sin(angle) * r]);
  }

  // Start at the midpoint of the last and first, so the curve closes on itself
  // with no seam — beginning at a point would leave a visible corner there.
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  let from = mid(points[steps - 1], points[0]);
  context.moveTo(from[0], from[1]);
  for (let i = 0; i < steps; i++) {
    const control = points[i];
    const to = mid(control, points[(i + 1) % steps]);
    context.quadraticCurveTo(control[0], control[1], to[0], to[1]);
    from = to;
  }
  context.closePath();
}

/* ── colour ──────────────────────────────────────────────────────────────
 *
 * The palette is resolved to plain numbers once and every colour the canvas
 * sees is an `rgba(...)` built from them.
 *
 * That is not tidiness. A canvas rejects a colour it cannot parse by
 * **throwing** from `addColorStop`, and an exception inside the frame loop
 * stops the animation dead — a blank box where the orb was. Handing it a CSS
 * function like `color-mix()` therefore bets the whole component on how new the
 * viewer's browser is, for a blend that is four lines of arithmetic here.
 * ───────────────────────────────────────────────────────────────────────── */

type RGB = [number, number, number];

/**
 * A palette variable as three numbers.
 *
 * Custom properties are not resolved by `getComputedStyle`, so this sees
 * whatever the stylesheet or the theme script wrote — hex for every shipped
 * palette and for the custom one. `rgb()` is accepted too, since that is what a
 * resolved colour looks like if one is ever passed through. Anything else
 * returns null and the caller keeps the colour it already had.
 */
function parse(value: string): RGB | null {
  const text = value.trim();
  if (!text) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const body = hex[1];
    const full =
      body.length === 3
        ? body
            .split("")
            .map((c) => c + c)
            .join("")
        : body;
    const int = Number.parseInt(full, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  const fn = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(text);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];

  return null;
}

/** Blended in sRGB, which is close enough between two saturated brand colours. */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgba(colour: RGB, value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${clamped})`;
}
