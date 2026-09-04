"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Middleware } from "swr";

/**
 * Is anything happening right now?
 *
 * Two separate answers, because they are two separate anxieties. A **route**
 * is pending between clicking a link and the new screen appearing — the app
 * looks frozen for that whole window, and on a cold route it is the longest
 * part. **Requests** are in flight while a screen fills itself in; the screen
 * is there but half its numbers are not.
 *
 * Both are counted here rather than in a provider, so the counters survive the
 * component tree being replaced mid-navigation, which is exactly when they
 * matter. Subscribers are notified through `useSyncExternalStore`, so React
 * never reads a torn value.
 */

let requests = 0;
let route = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ── requests ────────────────────────────────────────────────────────── */

function snapshotRequests() {
  return requests;
}

/** Number of requests in flight. Reads 0 on the server. */
export function useInFlight(): number {
  return useSyncExternalStore(subscribe, snapshotRequests, () => 0);
}

/**
 * SWR middleware that keeps the count.
 *
 * `isValidating` is the right signal rather than `isLoading`: a screen served
 * from cache and revalidating in the background is precisely the case where
 * somebody is looking at a number that might be about to change, and the whole
 * point of the indicator is to say so.
 */
export const countRequests: Middleware = (useSWRNext) => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config);
  const busy = swr.isValidating;

  useEffect(() => {
    if (!busy) return;
    requests += 1;
    emit();
    return () => {
      requests = Math.max(0, requests - 1);
      emit();
    };
  }, [busy]);

  return swr;
};

/* ── routes ──────────────────────────────────────────────────────────── */

function snapshotRoute() {
  return route;
}

export function useRoutePending(): boolean {
  return useSyncExternalStore(subscribe, snapshotRoute, () => false);
}

export function startRoute() {
  if (route) return;
  route = true;
  emit();
}

export function endRoute() {
  if (!route) return;
  route = false;
  emit();
}
