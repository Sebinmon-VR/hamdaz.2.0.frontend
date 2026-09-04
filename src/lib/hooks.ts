"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { ApiError, withQuery } from "@/lib/api";

/**
 * Runs a write and remembers how it went.
 *
 * Every mutating screen in this app needs the same three things — is it in
 * flight, did it fail, and what did the backend say — and the backend's error
 * messages are written for people, so showing `detail` verbatim is the right
 * behaviour rather than a fallback.
 */
export function useAction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      setPending(true);
      setError(null);
      try {
        const result = await fn(...args);
        return result;
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "Something went wrong.";
        // Guarded because a successful write usually navigates away, and
        // setting state on the way out is a warning nobody needs.
        if (alive.current) setError(message);
        return undefined;
      } finally {
        if (alive.current) setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, clearError: () => setError(null) };
}

/**
 * Delays a value. Used for the search boxes that hit the API on every
 * keystroke — the directory in particular reads all of Entra.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Load a screen fast first, then complete it.
 *
 * Three endpoints take `local_only`, which tells the backend to skip the parts
 * that call out to Entra or SharePoint. Those remote reads are what make a
 * dashboard take seconds; everything else answers from Postgres in
 * milliseconds. So both are requested at once and the fuller answer replaces
 * the quick one when it lands.
 *
 * The two run in parallel rather than in sequence — waiting for the local one
 * to arrive before starting the full one would add its latency to the total
 * for no benefit, since the backend serves them independently.
 */
export function useProgressive<T>(
  path: string | null,
  query: Record<string, string | number | boolean | undefined> = {},
  config?: SWRConfiguration<T>,
) {
  const local = useSWR<T>(path ? withQuery(path, { ...query, local_only: true }) : null, config);
  const full = useSWR<T>(path ? withQuery(path, query) : null, config);

  return {
    /** The best answer available: the complete one once it exists. */
    data: full.data ?? local.data,
    /** True while the remote-backed parts are still on their way. */
    partial: !full.data && Boolean(local.data),
    // A failure of the full request still leaves a usable screen, so only the
    // local one failing counts as the screen having failed.
    error: local.error ?? (full.error && !local.data ? full.error : undefined),
    remoteError: full.error && local.data ? full.error : undefined,
    isLoading: !local.data && !full.data && !local.error,
    isValidating: local.isValidating || full.isValidating,
    mutate: async () => {
      await Promise.all([local.mutate(), full.mutate()]);
    },
  };
}
