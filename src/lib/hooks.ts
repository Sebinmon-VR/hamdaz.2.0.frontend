"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

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
