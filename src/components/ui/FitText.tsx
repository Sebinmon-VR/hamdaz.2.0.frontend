"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Text that shrinks to fit rather than being cut off.
 *
 * An ellipsis is the wrong answer for a page title. "Proposal work for the
 * presales…" tells you less than the same words a point or two smaller, and
 * the title is the one thing on the bar that says where you are — losing its
 * end to make room for a button is the wrong trade.
 *
 * So the size is measured rather than guessed. The natural width at the
 * largest size is derived from one measurement, the ratio against the space
 * actually available gives the size that fits, and it is clamped so a very
 * long title stops shrinking before it becomes unreadable. Past that floor it
 * does clip — but by then the alternative is illegible text, and the path pill
 * beside it still names the screen.
 *
 * One measurement, no loop: `scrollWidth` is the unclipped width at whatever
 * size is currently applied, so scaling it by `max / current` gives the width
 * it would have at full size without ever rendering it there.
 *
 * Children are any node, not just a string. Font size is inherited, so a title
 * that is a live component — the dashboard's ticking greeting, for one —
 * measures and shrinks exactly like plain text. Anything inside it with a size
 * of its own simply keeps it.
 */
export function FitText({
  children,
  max,
  min,
  className,
}: {
  children: ReactNode;
  /** Largest size, in px. What it uses when there is room. */
  max: number;
  /** Smallest it will go before it gives up and clips. */
  min: number;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const frames = useRef(0);
  const [size, setSize] = useState(max);

  const fit = useCallback(() => {
    const wrap = box.current;
    const el = text.current;
    if (!wrap || !el) return;

    const available = wrap.clientWidth;
    // Zero while the element is still being laid out, or when a parent is
    // display:none. Measuring then would set a nonsense size that sticks.
    if (available <= 0) return;

    const current = Number.parseFloat(getComputedStyle(el).fontSize) || max;
    const naturalAtMax = (el.scrollWidth * max) / current;
    if (naturalAtMax <= 0) return;

    const next =
      naturalAtMax <= available
        ? max
        : Math.max(min, Math.floor((max * available) / naturalAtMax));

    // Only when it actually differs, or every observer callback would be a
    // state write and the ResizeObserver would loop on its own output.
    setSize((was) => (Math.abs(was - next) >= 1 ? next : was));
  }, [max, min]);

  useLayoutEffect(fit, [fit, children]);

  // A second pass on the next two frames.
  //
  // The first measurement happens before the browser has finished settling the
  // flex line this sits in, and a title measured against a width that is about
  // to change is measured against the wrong one — which is exactly how it ends
  // up clipped at full size instead of shrunk. Two frames is enough for layout
  // to be final, and the guard inside `fit` makes the extra passes free when
  // nothing changed.
  useEffect(() => {
    const first = requestAnimationFrame(() => {
      fit();
      const second = requestAnimationFrame(fit);
      frames.current = second;
    });
    frames.current = first;
    return () => cancelAnimationFrame(frames.current);
  }, [fit, children]);

  useEffect(() => {
    const wrap = box.current;
    const el = text.current;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    // Both: the box changes when the bar re-lays out, and the text changes when
    // its own content does. Watching only the box missed a title that grew
    // inside a container that had not moved.
    if (wrap) observer.observe(wrap);
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // A window resize can change the line without changing this element first.
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  // Fonts land after first paint and are wider or narrower than the fallback,
  // so a title measured before they arrive is measured against the wrong one.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    let live = true;
    void fonts.ready.then(() => {
      if (live) fit();
    });
    return () => {
      live = false;
    };
  }, [fit]);

  return (
    <span ref={box} className={`block min-w-0 overflow-hidden ${className ?? ""}`}>
      <span
        ref={text}
        className="block whitespace-nowrap"
        // Size only. Line height belongs to whatever is using this — the page
        // heading sets its own, and overriding it here would undo that.
        style={{ fontSize: `${size}px` }}
      >
        {children}
      </span>
    </span>
  );
}
