"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { activeOf, type PersonLabelsOut, type UserProfileOut, type WorkloadOut } from "@/lib/types";
import { date, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Avatar, Badge, Meta } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/feedback";

/**
 * A person's summary, on hover.
 *
 * Wraps any avatar so that pointing at somebody answers "who is this, what are
 * they carrying, are they around" without leaving the screen you are on. That
 * question comes up constantly — reading a ranking, approving leave, looking at
 * a team — and it was previously a navigation each time.
 *
 * **Administrators only.** For anyone else the wrapper renders its child and
 * nothing else, so no member ever sees a colleague's record by pointing at
 * them. Note the same caveat as the profile screen: `/users/{ref}` takes only
 * `CurrentUser` on the backend, so this is a UI gate rather than a boundary.
 *
 * Nothing is requested until the pointer has rested for a moment. Skimming a
 * list of forty people would otherwise fire forty profile reads, most of them
 * for a card nobody waited to see.
 */
export function PersonHover({
  userId,
  name,
  email,
  children,
  className,
}: {
  /** The Hamdaz user id. Pass null where only an Entra id is known. */
  userId: string | null;
  name: string;
  email?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const session = useSession();
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowed = session.roles.is_admin && Boolean(userId);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!allowed) return <>{children}</>;

  function place() {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const WIDTH = 300;
    // Flip above when there is not room below, and keep it on screen
    // horizontally — a card half off the right edge is no better than a
    // clipped one.
    const below = window.innerHeight - box.bottom > 300;
    setAt({
      top: below ? box.bottom + 8 : Math.max(8, box.top - 8 - 290),
      left: Math.min(Math.max(8, box.left), window.innerWidth - WIDTH - 8),
    });
  }

  function enter() {
    if (timer.current) clearTimeout(timer.current);
    // A rest, not a brush past: skimming forty rows should not open forty
    // cards, nor ask the server about forty people.
    timer.current = setTimeout(place, 350);
  }

  function leave() {
    if (timer.current) clearTimeout(timer.current);
    // A grace period so the pointer can travel onto the card itself.
    timer.current = setTimeout(() => setAt(null), 160);
  }

  return (
    <>
      <span
        ref={anchor}
        className={clsx("relative inline-flex", className)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
      >
        {children}
      </span>

      {at &&
        createPortal(
          // On document.body, so no `overflow-hidden` list, no scroll
          // container and no stacking context in the page can clip it.
          <div
            role="tooltip"
            style={{ top: at.top, left: at.left }}
            className="rise fixed z-[80] w-[300px] rounded-[18px] bg-panel p-4 text-left shadow-[var(--shadow-float)] ring-1 ring-line"
            onMouseEnter={() => {
              if (timer.current) clearTimeout(timer.current);
            }}
            onMouseLeave={leave}
          >
            <Card userId={userId!} name={name} email={email} />
          </div>,
          document.body,
        )}
    </>
  );
}

function Card({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email?: string | null;
}) {
  // Local sections only: the Entra half of a profile is the slow half, and a
  // hover card that takes two seconds to fill is worse than one that says
  // less. The full record is one click away.
  const profile = useSWR<UserProfileOut>(
    `/users/${userId}?local_only=true&include=identity,roles,teams`,
    { revalidateOnFocus: false, dedupingInterval: 300_000, shouldRetryOnError: false },
  );
  // Cache-only. These are org-wide sweeps of SharePoint and the label store;
  // firing one because a pointer paused over an avatar would make hovering the
  // slowest thing in the app. If a screen has already loaded them the numbers
  // appear, and if not the card simply does not claim to know.
  const CACHED = {
    revalidateOnFocus: false,
    revalidateOnMount: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  } as const;
  const labels = useSWR<PersonLabelsOut[]>("/labels/people", CACHED);
  const workload = useSWR<WorkloadOut>("/proposals/workload", CACHED);

  const roles = profile.data?.sections.roles as
    | { is_admin: boolean; is_super_admin: boolean; grants: { key: string; name: string }[] }
    | undefined;
  const teams = profile.data?.sections.teams as
    | { memberships: { slug: string; name: string; archived: boolean }[] }
    | undefined;
  const identity = profile.data?.sections.identity as
    | { last_login_at: string | null; is_active: boolean }
    | undefined;

  const held = labels.data?.find((p) => p.user_id === userId);
  const carrying = workload.data?.people.find(
    (p) =>
      (p.email && email && p.email.toLowerCase() === email.toLowerCase()) ||
      p.name.toLowerCase() === name.toLowerCase(),
  );
  const onLeave = held?.labels.find((l) => l.key === "on_leave");

  return (
    <>
      <span className="flex items-center gap-2.5">
        <Avatar name={name} seed={userId} className="size-9 shrink-0 rounded-xl text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{name}</span>
          <span className="block truncate text-[11.5px] text-ink-3">{email ?? "—"}</span>
        </span>
        <Link
          href={`/admin/users/${userId}`}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-panel-2 hover:text-ink"
          aria-label={`Open ${name}`}
        >
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </Link>
      </span>

      {profile.isLoading && !profile.data ? (
        <span className="mt-3 block space-y-1.5">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </span>
      ) : (
        <>
          {(roles?.is_super_admin || roles?.is_admin || onLeave || identity?.is_active === false) && (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {roles?.is_super_admin && (
                <Badge tone="highlight" icon={ShieldCheck}>
                  Super admin
                </Badge>
              )}
              {roles?.is_admin && !roles.is_super_admin && <Badge tone="accent">Administrator</Badge>}
              {onLeave && (
                <Badge tone="warn">
                  On leave{onLeave.expires_at ? ` to ${date(onLeave.expires_at)}` : ""}
                </Badge>
              )}
              {identity?.is_active === false && <Badge tone="danger">Deactivated</Badge>}
            </span>
          )}

          <span className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Meta label="Live">{carrying ? activeOf(carrying) : "—"}</Meta>
            <Meta label="Due soon">{carrying ? carrying.due_soon : "—"}</Meta>
            <Meta label="Teams">{teams?.memberships.filter((m) => !m.archived).length ?? "—"}</Meta>
          </span>

          {held && held.labels.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-1">
              {held.labels.slice(0, 4).map((label) => (
                <Badge key={label.key} tone={label.source === "derived" ? "accent" : "neutral"}>
                  {label.name}
                </Badge>
              ))}
            </span>
          )}

          <span className="mt-3 block text-[11px] text-ink-4">
            {identity?.last_login_at
              ? `Last seen ${relative(identity.last_login_at)}`
              : "Has never signed in"}
          </span>
        </>
      )}
    </>
  );
}
