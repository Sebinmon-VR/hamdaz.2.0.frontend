"use client";

/**
 * Who is signed in, and what they are allowed to see.
 *
 * Loaded once at the top of the app shell and shared by context, because four
 * separate screens all need the same answer and none of it changes during a
 * page view. Everything here is cheap and cached by SWR; the expensive,
 * screen-specific calls stay in the screens.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { ApiError, fetcher } from "@/lib/api";
import type {
  EffectiveAccessOut,
  LeaveSettingsOut,
  MyRolesOut,
  MyTeamOut,
  UserOut,
} from "@/lib/types";

export interface Session {
  user: UserOut;
  roles: MyRolesOut;
  access: EffectiveAccessOut;
  teams: MyTeamOut[];
  /** True when the viewer belongs to the team named in the leave settings. */
  isHr: boolean;
  /** Module keys the viewer can reach, grants and always-open modules alike. */
  modules: Set<string>;
  /** "module:page" for every page the viewer can reach. */
  pages: Set<string>;
  can: (module: string, page?: string) => boolean;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Leave and Quotes are open to every signed-in person — their endpoints check
 * nothing beyond a session, and the module catalogue says so in as many words.
 * They are in the catalogue for navigation, not for gating, so the nav has to
 * add them back after the grant-driven list.
 */
const ALWAYS_OPEN = ["leave", "quotes"] as const;

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession used outside the app shell");
  return session;
}

/** Null until loaded — for the few places that render before the shell does. */
export function useMaybeSession(): Session | null {
  return useContext(SessionContext);
}

export interface SessionLoad {
  session: Session | null;
  loading: boolean;
  /** Set when the session has gone, so the shell can bounce to /login. */
  unauthorised: boolean;
  error: ApiError | null;
}

/** Nothing here changes during a page view, so nothing here needs polling. */
const ONCE = { shouldRetryOnError: false, revalidateOnFocus: false, dedupingInterval: 60_000 };

export function useLoadSession(): SessionLoad {
  // All five fire together rather than waiting on /auth/me first. Every one of
  // them authenticates from the same cookie, so gating the others on the user
  // bought nothing but a second round trip in front of every cold load — and
  // that round trip was the app's slowest moment. If the cookie has gone they
  // all 401 at once, which is the same answer, sooner.
  const user = useSWR<UserOut>("/auth/me", fetcher, ONCE);
  const roles = useSWR<MyRolesOut>("/roles/me", fetcher, ONCE);
  const access = useSWR<EffectiveAccessOut>("/access/me", fetcher, ONCE);
  const teams = useSWR<MyTeamOut[]>("/teams/me", fetcher, ONCE);
  // Readable by anyone; the write side is HR-only. Wanted here purely to learn
  // which team HR is, so the leave queue can be hidden from everyone else
  // rather than shown and then 403-ing.
  const leave = useSWR<LeaveSettingsOut>("/leave/settings", fetcher, ONCE);

  const session = useMemo<Session | null>(() => {
    if (!user.data || !roles.data || !access.data || !teams.data) return null;

    const modules = new Set<string>(ALWAYS_OPEN);
    const pages = new Set<string>();
    for (const module of access.data.modules) {
      modules.add(module.key);
      for (const page of module.pages) pages.add(`${module.key}:${page.key}`);
    }
    // The always-open modules carry no grant, so their pages are not in the
    // effective list. Admin pages stay gated by role, below.
    for (const key of ALWAYS_OPEN) {
      if (!access.data.modules.some((m) => m.key === key)) {
        for (const page of OPEN_PAGES[key]) pages.add(`${key}:${page}`);
      }
    }

    const hrSlug = leave.data?.hr_team_slug;
    const isHr = Boolean(hrSlug && teams.data.some((t) => t.team.slug === hrSlug));

    return {
      user: user.data,
      roles: roles.data,
      access: access.data,
      teams: teams.data,
      isHr,
      modules,
      pages,
      can: (module, page) => (page ? pages.has(`${module}:${page}`) : modules.has(module)),
    };
  }, [user.data, roles.data, access.data, teams.data, leave.data]);

  const error = [user.error, roles.error, access.error, teams.error].find(
    (e): e is ApiError => e instanceof ApiError,
  );

  return {
    session,
    loading: !session && !error,
    unauthorised: error?.unauthorised ?? false,
    error: error ?? null,
  };
}

/** The page keys of the always-open modules, from the backend catalogue. */
const OPEN_PAGES: Record<(typeof ALWAYS_OPEN)[number], string[]> = {
  leave: ["mine", "request", "calendar", "queue", "rules"],
  quotes: ["list", "detail"],
};

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
