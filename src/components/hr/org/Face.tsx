"use client";

import type { CSSProperties } from "react";
import { initials, RING, type OrgColour } from "@/lib/org";

/*
 * A face the way the website draws it (hamdaz.com, Our People): a circle in a
 * soft wash of the person's colour, a ring in that colour round it, and the
 * cut-out on top with the head rising out over the ring. The numbers are the
 * website's, so what HR sees here is what the page will show.
 *
 * The cut-out is 3:4 and 134% of the circle's height, anchored at the bottom. It
 * is masked to the circle, plus a band above it for the head, fading out at the
 * sides so shoulders never poke out beside the circle.
 */

const MASK =
  "radial-gradient(circle closest-side at 50% 68.75%, #000 calc(100% - 1px), transparent 100%), linear-gradient(#000 37.5%, transparent 46%)";

export function Face({
  src,
  name,
  colour,
  size,
  gap = "var(--color-panel, #fff)",
  ring = true,
  dim = false,
  className,
}: {
  /** The cut-out (900 x 1200, transparent). Without one the initials show. */
  src?: string | null;
  name: string;
  colour: OrgColour;
  /** The circle's diameter in pixels. */
  size: number;
  /** The colour between the circle and its ring: whatever is behind the face. */
  gap?: string;
  ring?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const c = RING[colour];
  const ringW = Math.max(1.5, Math.round(size / 40));
  const gapW = Math.max(2, Math.round(size / 30));
  const circle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    overflow: "hidden",
    background: `radial-gradient(60% 55% at 22% 18%, color-mix(in oklab, ${c} 55%, #fff) 0%, rgba(255,255,255,0) 70%),
      radial-gradient(60% 60% at 88% 82%, color-mix(in oklab, ${c} 38%, #fff) 0%, rgba(255,255,255,0) 70%),
      radial-gradient(55% 50% at 78% 12%, #fff 0%, rgba(255,255,255,0) 70%),
      color-mix(in oklab, ${c} 16%, #f8f6fa)`,
    boxShadow: ring ? `0 0 0 ${gapW}px ${gap}, 0 0 0 ${gapW + ringW}px ${c}` : undefined,
  };
  return (
    <span
      className={className}
      role="img"
      aria-label={name}
      style={{
        position: "relative",
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        opacity: dim ? 0.45 : 1,
        filter: dim ? "saturate(0.3)" : undefined,
      }}
    >
      <span style={circle}>
        {!src && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontWeight: 600,
              fontSize: Math.max(10, size * 0.32),
              color: c,
            }}
          >
            {initials(name)}
          </span>
        )}
      </span>
      {src && (
        <span
          style={{
            position: "absolute",
            inset: "-60% 0 0 0",
            WebkitMaskImage: MASK,
            maskImage: MASK,
            pointerEvents: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob or API URL, sized by the mask */}
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              height: "83.75%",
              width: "auto",
              aspectRatio: "3 / 4",
              maxWidth: "none",
              transform: "translateX(-50%)",
            }}
          />
        </span>
      )}
    </span>
  );
}
