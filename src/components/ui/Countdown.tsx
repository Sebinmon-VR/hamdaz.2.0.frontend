"use client";

import { useSyncExternalStore } from "react";
import { Timer } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/primitives";

/**
 * A live countdown to a moment — "2d 4h 12m", then "03:12:45" in the last day.
 *
 * One clock for the whole page, not one per row: a task list is up to five
 * hundred rows, and five hundred intervals is a lot of timers for one number.
 * The clock only runs while at least one countdown is on screen.
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatLeft(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** Nothing once the moment has passed — the late state is the due chip's job. */
export function Countdown({ to, title }: { to: Date | string | null; title?: string }) {
  const current = useNow();
  if (!to) return null;
  const target = typeof to === "string" ? new Date(to) : to;
  const left = target.getTime() - current;
  if (Number.isNaN(left) || left <= 0) return null;
  const tone: Tone = left < 6 * 3_600_000 ? "danger" : left < 86_400_000 ? "warn" : "neutral";
  return (
    <Badge tone={tone} icon={Timer} title={title} className="tnum">
      {formatLeft(left)}
    </Badge>
  );
}

/**
 * When a BCD really is, from the value SharePoint holds.
 *
 * People type UAE time into "BCD UAE Time", and the site is set to US Pacific,
 * so SharePoint stores what was typed as a Pacific time. Its Pacific wall clock
 * is what was typed; read that clock as UAE time (UTC+4, no daylight saving).
 * The same reading as the backend's `as_typed` in app/followups/service.py.
 */
export function bcdInstant(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const stored = new Date(raw);
  if (Number.isNaN(stored.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(stored)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(wall - 4 * 3_600_000);
}
