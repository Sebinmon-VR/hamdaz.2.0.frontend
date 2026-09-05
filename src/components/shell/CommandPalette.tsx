"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  Building2,
  CornerDownLeft,
  LogOut,
  ReceiptText,
  Search,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { signOutAndReturnToLogin, withQuery } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { buildNav } from "@/lib/nav";
import { useSession } from "@/lib/session";
import type { OrgUserPage, QuoteListOut, TeamOut } from "@/lib/types";
import { Avatar } from "@/components/ui/primitives";

/**
 * Go anywhere, or find anyone, without navigating to a screen first.
 *
 * The complaint this answers is "too many clicks". Reaching one person's
 * record used to be: open the directory, search, open them, follow the link to
 * their profile — four steps for something you already knew the name of. Here
 * it is one keystroke and a name.
 *
 * Destinations are local and free: `buildNav` already knows every route the
 * viewer can reach, so they filter instantly with no request at all. People,
 * teams and quotes are looked up only once two characters are typed, and only
 * for viewers whose modules include them — asking is what is slow, so nothing
 * is asked speculatively.
 */
export function CommandPalette() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Bound on the window rather than a field, so it works wherever the focus
  // happens to be — the point is not having to reach for anything first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // The next frame, because the input does not exist until this renders.
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const needle = query.trim().toLowerCase();
  const search = useDebounced(needle.length >= 2 ? needle : "", 220);

  const people = useSWR<OrgUserPage>(
    search && session.can("directory")
      ? withQuery("/directory/users", { search, limit: 6 })
      : null,
    { keepPreviousData: true, shouldRetryOnError: false },
  );
  const teams = useSWR<TeamOut[]>(
    search && session.can("teams") ? withQuery("/teams", { search }) : null,
    { keepPreviousData: true, shouldRetryOnError: false },
  );
  const quotes = useSWR<QuoteListOut>(
    search && session.can("quotes") ? withQuery("/quotes", { search, limit: 5 }) : null,
    { keepPreviousData: true, shouldRetryOnError: false },
  );

  const nav = useMemo(() => buildNav(session), [session]);

  const results = useMemo(() => {
    const out: Result[] = [];

    const destinations = [...nav.primary, ...nav.more.flatMap((g) => g.items)];
    for (const item of destinations) {
      if (!needle || item.label.toLowerCase().includes(needle)) {
        out.push({
          id: `nav:${item.href}`,
          group: "Go to",
          label: item.label,
          href: item.href,
          icon: item.icon,
        });
      }
    }

    const account: Result[] = [
      {
        id: "account:profile",
        group: "Account",
        label: "My profile",
        href: `/admin/users/${session.user.id}`,
        icon: UserRound,
      },
      {
        id: "account:settings",
        group: "Account",
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
      {
        id: "account:signout",
        group: "Account",
        label: "Sign out",
        hint: session.user.email,
        href: "",
        icon: LogOut,
        run: signOutAndReturnToLogin,
      },
    ];
    for (const item of account) {
      if (!needle || item.label.toLowerCase().includes(needle)) out.push(item);
    }

    for (const person of people.data?.users ?? []) {
      out.push({
        id: `person:${person.object_id}`,
        group: "People",
        label: person.display_name,
        hint: person.email ?? person.job_title ?? undefined,
        // Straight to the record where everything about them is, when the
        // viewer is allowed to open it.
        href: session.roles.is_admin
          ? `/admin/users/${person.object_id}`
          : `/directory/${person.object_id}`,
        seed: person.object_id,
      });
    }

    for (const team of (teams.data ?? []).slice(0, 5)) {
      out.push({
        id: `team:${team.slug}`,
        group: "Teams",
        label: team.name,
        hint: `/${team.slug}`,
        href: `/teams/${team.slug}`,
        icon: Users,
      });
    }

    for (const quote of (quotes.data?.quotes ?? []).slice(0, 5)) {
      out.push({
        id: `quote:${quote.id}`,
        group: "Quotes",
        label: quote.number,
        hint: quote.customer_name ?? undefined,
        href: `/quotes/${quote.id}`,
        icon: ReceiptText,
      });
    }

    return out.slice(0, 24);
  }, [nav, needle, people.data, teams.data, quotes.data, session.roles.is_admin]);

  // Clamped rather than reset: retyping should not throw away the position if
  // the list only shrank by one.
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  function go(result: Result | undefined) {
    if (result?.run) {
      setOpen(false);
      void result.run();
      return;
    }
    if (!result) return;
    setOpen(false);
    router.push(result.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
        className="rise flex w-full max-w-[620px] flex-col overflow-hidden rounded-[22px] bg-panel shadow-[var(--shadow-float)] ring-1 ring-line"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-4" strokeWidth={2} />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Go to a screen, or find a person, team or quote"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
          />
          <kbd className="micro shrink-0 rounded-md bg-panel-2 px-2 py-1 text-ink-4">esc</kbd>
        </div>

        <div className="no-bar max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">
              {needle.length === 1
                ? "Keep typing — people, teams and quotes are looked up from two letters."
                : "Nothing matches that."}
            </p>
          ) : (
            results.map((result, index) => {
              const Icon = result.icon;
              const first = index === 0 || results[index - 1].group !== result.group;
              return (
                <div key={result.id}>
                  {first && (
                    <p className="micro px-3 pb-1.5 pt-3 text-ink-4">{result.group}</p>
                  )}
                  <button
                    onMouseMove={() => setCursor(index)}
                    onClick={() => go(result)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition",
                      index === active ? "bg-panel-2 text-ink" : "text-ink-2 hover:bg-panel-2",
                    )}
                  >
                    {result.seed ? (
                      <Avatar
                        name={result.label}
                        seed={result.seed}
                        className="size-6 shrink-0 rounded-lg text-[8px]"
                      />
                    ) : Icon ? (
                      <Icon className="size-4 shrink-0 text-ink-4" strokeWidth={1.8} />
                    ) : (
                      <Building2 className="size-4 shrink-0 text-ink-4" strokeWidth={1.8} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {result.label}
                    </span>
                    {result.hint && (
                      <span className="hidden shrink-0 truncate text-[11.5px] text-ink-4 sm:block">
                        {result.hint}
                      </span>
                    )}
                    {index === active ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
                    ) : (
                      <ArrowRight className="size-3.5 shrink-0 text-transparent" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  /** Where it goes. Empty for a result that runs `run` instead. */
  href: string;
  icon?: React.ElementType;
  /** Draws an avatar instead of an icon — people only. */
  seed?: string;
  /**
   * Performed instead of navigating.
   *
   * Signing out is the reason this exists: it lived only behind the rail's
   * account row, which is a bare avatar at 62px with nothing saying it opens
   * anything. The palette is where people look for a command they cannot see,
   * so the command has to be in it.
   */
  run?: () => void | Promise<void>;
}
