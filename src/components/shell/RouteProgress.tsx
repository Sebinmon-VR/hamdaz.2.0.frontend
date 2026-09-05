"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  endRoute,
  startRoute,
  useInFlight,
  useRoutePending,
} from "@/lib/progress";

/**
 * A bar across the top of the app that says something is happening.
 *
 * The complaint it answers is that clicking did not appear to do anything.
 * Between the click and the next screen there is a gap — the route's code has
 * to arrive and its data has to be asked for — and the app spent that gap
 * looking exactly as it did before, so people clicked again.
 *
 * The click is caught at the document rather than on each link. There is no
 * global "navigation started" event in the App Router, and threading a handler
 * through every `Link` in the app would mean the one somebody forgot is the
 * one that feels broken. Capture phase, so it still fires if a handler below
 * stops propagation.
 *
 * The bar creeps rather than filling: it cannot know how far along it is, and
 * a progress bar that claims a percentage it has not measured is a lie people
 * learn to distrust. It eases towards 90% and only completes when the new
 * pathname actually commits.
 *
 * **It only ever moves forward.** The first version drove the width from a
 * ternary over two signals — the route being pending, and any SWR request
 * being in flight — and the two fought:
 *
 *   - a request in flight pinned the bar at 100%, so it read "finished"
 *     while a screen was still filling in;
 *   - clicking a link then set it to 90%, so the bar animated *backwards*
 *     over six seconds on every navigation started while anything was
 *     revalidating, which on a dashboard is most of the time.
 *
 * So the width is now a small state machine with one direction: reset to zero
 * out of sight, creep to 90%, complete, fade, reset again. Requests in flight
 * no longer touch it at all — that is what `FetchDot` below is for, and its
 * own comment already says why the two are different questions.
 */

/** Where the creep stops. It cannot know the rest, so it does not pretend to. */
const CREEP_TO = 90;
/** How long completing takes, and how long the fade after it takes. */
const FINISH_MS = 260;
const FADE_MS = 380;

export function RouteProgress() {
  const pathname = usePathname();
  const pending = useRoutePending();

  const [width, setWidth] = useState(0);
  // False while the bar is being put back to zero, so the reset is instant and
  // invisible instead of being animated backwards across the screen.
  const [animated, setAnimated] = useState(false);
  const [visible, setVisible] = useState(false);
  // Whether this cycle ever started, so a stray `endRoute` cannot make a bar
  // appear and complete when nothing was ever navigating.
  const running = useRef(false);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Anything but a plain left click is the browser's business, not ours.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Same page: nothing will change, so a bar would just flash.
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return;
      }

      startRoute();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new path is committed, so whatever the bar was waiting for arrived.
  useEffect(() => {
    endRoute();
  }, [pathname]);

  // A route that never commits — a link to nowhere, a cancelled navigation —
  // would otherwise leave the bar creeping forever.
  useEffect(() => {
    if (!pending) return;
    const bail = setTimeout(endRoute, 8000);
    return () => clearTimeout(bail);
  }, [pending]);

  // The whole cycle, in one place, driven by the one signal that means
  // "a navigation is happening".
  useEffect(() => {
    if (pending) {
      running.current = true;
      // Back to zero with transitions off, then creep from there on the next
      // frame. Without the reset the bar would ease from wherever it was left,
      // which is what made it travel backwards.
      setAnimated(false);
      setWidth(0);
      setVisible(true);
      const frame = requestAnimationFrame(() => {
        setAnimated(true);
        setWidth(CREEP_TO);
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!running.current) return;
    running.current = false;

    setAnimated(true);
    setWidth(100);
    const fade = setTimeout(() => setVisible(false), FINISH_MS);
    const reset = setTimeout(() => {
      setAnimated(false);
      setWidth(0);
    }, FINISH_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(reset);
    };
  }, [pending]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden"
    >
      <div
        className="relative h-full rounded-r-full bg-accent"
        // Width, timing and opacity are inline because they are state, not
        // variants — and because the glow has to be. A multi-shadow arbitrary
        // value that Tailwind fails to parse produces no class at all and no
        // warning, so the bar would quietly stop glowing and nobody would know
        // why it had become hard to see.
        style={{
          width: `${width}%`,
          opacity: visible ? 1 : 0,
          boxShadow: "0 0 6px var(--accent)",
          transitionProperty: animated ? "width, opacity" : "opacity",
          // The creep is slow and eased so it never looks stalled; completing
          // is quick, because by then the answer has actually arrived.
          transitionDuration: animated
            ? `${width === 100 ? FINISH_MS : 6000}ms, ${FADE_MS}ms`
            : `0ms, ${FADE_MS}ms`,
          transitionTimingFunction: "ease-out",
        }}
      >
        {/* The tip.
        
            Three pixels of line is easy to miss on a bright screen, and the
            answer is not a thicker bar — it is a brighter end. The eye is
            drawn to the point that moves, which is exactly the thing worth
            watching. It breathes very slightly so the bar reads as live during
            the long middle of a creep, where the width barely changes.

            Rendered only while visible: an infinite animation behind
            `opacity: 0` would keep the compositor busy all session to show
            nobody anything. */}
        {visible && (
          <span
            className="progress-tip absolute right-0 top-1/2 h-[7px] w-[7px] -translate-y-1/2 translate-x-1/3 rounded-full bg-accent"
            style={{ boxShadow: "0 0 12px 2px var(--accent)" }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The quieter half: a dot that pulses while any request is in flight.
 *
 * It sits in the command bar rather than over the page, because by the time
 * requests are running the screen is already there — the question has changed
 * from "did my click work" to "are these numbers finished". A screen reader
 * gets it as a polite live region so it is announced once, not on every tick.
 */
export function FetchDot() {
  const inFlight = useInFlight();
  if (inFlight === 0) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      title={`${inFlight} request${inFlight === 1 ? "" : "s"} in flight`}
      className="flex items-center gap-1.5 text-ink-4"
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
      </span>
      <span className="micro hidden sm:block">loading</span>
    </span>
  );
}
