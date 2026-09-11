"use client";

/**
 * What this person has been told.
 *
 * The API has no route that takes a user id — deliberately, so there is no way
 * for one person to read another's — which means everything here is implicitly
 * about the viewer and nothing needs to say so.
 *
 * The count is its own request, and that is the backend's design rather than an
 * accident: a bell polls, and fetching a page of notifications to render a
 * number would make every screen in the app quietly slower for no reason
 * anybody could point at.
 */

import useSWR from "swr";
import { api } from "@/lib/api";
import type { NotificationPage } from "@/lib/types";

/**
 * The number on the bell.
 *
 * Polled rather than pushed. The things that raise a notification here are
 * background work — a tender arriving in a watched mailbox, a report being
 * filed — so they happen on their own clock and a minute's delay in showing
 * that is not worth a socket. `revalidateOnFocus` covers the case that actually
 * annoys people: coming back to the tab and seeing yesterday's number.
 */
export function useUnread() {
  const { data, mutate } = useSWR<{ unread: number }>("/notifications/unread-count", {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    // A bell that shows an error is worse than a bell that shows nothing.
    shouldRetryOnError: false,
  });
  return { unread: data?.unread ?? 0, refresh: mutate };
}

export function useNotifications(unreadOnly = false, limit = 50) {
  return useSWR<NotificationPage>(
    `/notifications?unread_only=${unreadOnly}&limit=${limit}`,
    { revalidateOnFocus: true },
  );
}

/**
 * Mark some, or everything unread.
 *
 * An id belonging to somebody else simply matches nothing — the backend scopes
 * the update in the statement rather than checking first, which is both the safe
 * outcome and one fewer round trip.
 */
export async function markRead(ids?: string[]): Promise<void> {
  await api.post("/notifications/read", ids ? { ids } : {});
}
