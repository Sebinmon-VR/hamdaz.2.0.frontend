"use client";

import clsx from "clsx";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { endRoute, startRoute, useInFlight, useRoutePending } from "@/lib/progress";

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
 */
export function RouteProgress() {
  const pathname = usePathname();
  const pending = useRoutePending();
  const inFlight = useInFlight();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Anything but a plain left click is the browser's business, not ours.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Same page: nothing will change, so a bar would just flash.
      if (next.pathname === window.location.pathname && next.search === window.location.search) {
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

  const busy = pending || inFlight > 0;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[7px] overflow-hidden"
    >
      {/* Thicker than a hairline, with a glow. At 2px against the app's own
          background this read as an artefact of the display on some screens,
          which defeats the point of it — the bar only works if it is noticed
          without being looked for. Height is set on the track above; the glow
          is what stops it looking like a flat block at any thickness. */}
      <div
        className={clsx(
          "h-full rounded-r-full bg-accent transition-[width,opacity]",
          pending
            ? "w-[90%] opacity-100 duration-[6000ms] ease-out"
            : busy
              ? "w-full opacity-90 duration-200"
              : "w-full opacity-0 duration-500",
        )}
        // The glow is written here rather than as an arbitrary Tailwind class:
        // a multi-shadow arbitrary value that Tailwind fails to parse produces
        // no class at all and no warning, so the bar would quietly go back to
        // being a hairline. A style attribute either works or is obvious.
        style={{
          boxShadow: "0 0 10px var(--accent), 0 0 3px var(--accent)",
          ...(pending ? { width: "90%" } : null),
        }}
      />
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
