"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

/**
 * The time, ticking, and how long the viewer has been signed in.
 *
 * Both live in their own components rather than in the screen that shows
 * them. A clock re-renders every second by definition, and the dashboard it
 * sits on holds the task list, the leave summary and every team widget — so
 * hanging the tick on the page would have re-rendered all of that sixty times
 * a minute to move one digit.
 *
 * Nothing here runs during server rendering. It cannot: the app shell shows
 * its boot screen until the session resolves, so these only ever mount on the
 * client, where `new Date()` is the viewer's own clock in the viewer's own
 * timezone. That is the whole point — a greeting computed on a server in
 * another timezone is how "Good morning" ends up on screen at six in the
 * evening.
 */

/** Now, re-read on an interval. */
export function useNow(everyMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);

  return now;
}

/**
 * The right greeting for the hour.
 *
 * The boundaries are the ordinary English ones rather than anything clever:
 * afternoon starts at noon, evening at five, and the small hours get their
 * own rather than being called "morning", because somebody working at 2am is
 * not having a morning.
 */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Working late";
}

/** Ticks once a minute — the only thing that can change the greeting. */
export function Greeting({ name }: { name: string }) {
  const now = useNow(60_000);
  return <>{`${greetingFor(now)}, ${name}`}</>;
}

/** "3h 12m", or null when the elapsed time is not worth a line. */
function elapsed(since: Date, now: Date): string | null {
  const ms = now.getTime() - since.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m`;
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

/**
 * The wall clock, and the length of this session beside it.
 *
 * `last_login_at` is when the person last actually signed in through Entra,
 * which is not the same as when this tab was opened — a session outlives a
 * reload. That is the more useful of the two readings and the only one the
 * backend can vouch for, so it is what is shown, and it is labelled "signed
 * in" rather than anything that would imply a countdown to an expiry the
 * frontend does not know.
 */
export function SessionClock({ since }: { since?: string | null }) {
  const now = useNow(1_000);
  const started = since ? new Date(since) : null;
  const held =
    started && !Number.isNaN(started.getTime()) ? elapsed(started, now) : null;

  return (
    <span className="inline-flex items-center gap-2">
      <Clock3 className="size-3.5 text-ink-4" strokeWidth={2} aria-hidden />
      <span className="tnum">
        {new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now)}
      </span>
      {held && (
        <span className="text-ink-4">
          · signed in <span className="tnum">{held}</span>
        </span>
      )}
    </span>
  );
}
