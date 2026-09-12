"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { countRequests } from "@/lib/progress";
import { labelFor } from "@/lib/nav";
import { SessionProvider, useLoadSession } from "@/lib/session";
import { TabsProvider } from "@/lib/tabs";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Island } from "@/components/shell/Island";
import { Doodles } from "@/components/shell/Doodles";
import { RouteProgress } from "@/components/shell/RouteProgress";
import { Rail } from "@/components/shell/Rail";
import { TabStrip } from "@/components/shell/TabStrip";
import { Wordmark } from "@/components/shell/Wordmark";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

/**
 * Everything behind sign-in renders inside this.
 *
 * The frame is a rail down the left and a column of blocks to its right, all
 * floating on the app ground with a 16px gutter. Nothing is a card with a
 * border: a block separates from the ground by tone in dark and by shadow in
 * light, which is the one thing `--lift` decides.
 *
 * Screens do not draw their own background and do not scroll the window. Each
 * one owns its command bar (that is what `PageHead` renders) and then its own
 * blocks, so the shell holds no per-screen state at all.
 *
 * The session loads once here rather than per page, so a navigation never
 * re-asks who the viewer is. A 401 on that first load is the one error the
 * shell handles itself: the cookie has expired, and the only useful response
 * is to send the person back to sign in, remembering where they were.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        // Coming back to a machine after lunch should not re-sweep SharePoint
        // for every screen that happens to be open.
        revalidateOnReconnect: false,
        // Re-entering a screen through a tab should be instant. Within the
        // dedupe window SWR serves the cached answer and skips the request,
        // which is what makes the tab strip feel free. A minute rather than
        // thirty seconds because the expensive endpoints here are org-wide
        // sweeps of SharePoint and Entra that the backend caches anyway — a
        // second sweep inside a minute cannot tell you anything new.
        dedupingInterval: 60_000,
        // Show the last answer while fetching the next one. Without this a
        // filter change blanks the screen and redraws it, which reads as
        // slower than it is even when it is not.
        keepPreviousData: true,
        // A failure here is usually real — a 403, or SharePoint being down —
        // so hammering it three times helps nobody.
        errorRetryCount: 1,
        // Counts what is in flight so the shell can say so. Screens opt into
        // nothing and pass nothing: the middleware sees every hook.
        use: [countRequests],
      }}
    >
      <Shell>{children}</Shell>
    </SWRConfig>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { session, loading, unauthorised, error } = useLoadSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (unauthorised) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorised, router, pathname]);

  if (unauthorised) return <BootScreen />;

  if (error) {
    return (
      <Frame>
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center">
              <Wordmark />
            </div>
            <ErrorState error={error} onRetry={() => location.reload()} />
          </div>
        </div>
      </Frame>
    );
  }

  if (loading || !session) return <BootScreen />;

  return (
    <SessionProvider session={session}>
      <TabsProvider labelFor={labelFor}>
        <Frame>
          {/* Bound to the window, so ⌘K works from any screen and from any
              focused field — the point is not having to reach for anything. */}
          <CommandPalette />
          {/* Its neighbour on ⌘J. The palette finds a screen; the island
              answers a question — and can open a screen itself, which is why
              it lives here rather than on one page. */}
          <Island />
          <Rail />
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            {/* The open screens ride on the ground rather than in a block:
                they are a list of places, not a second navigation, and giving
                them a surface of their own made them compete with the command
                bar directly underneath. */}
            <TabStrip />
            {/* One scroll container — the rail and the tab chips stay put
                while a long list moves under them.

                `[&>*]:shrink-0` is load-bearing, not tidying. A flex column
                gives every child `flex-shrink: 1`, so once the screen's blocks
                were taller than the window they were COMPRESSED to fit instead
                of overflowing and scrolling — panels lost height and their
                contents were sliced through the middle. Headline numbers were
                cut in half on every screen with more than a couple of blocks.
                Children keep their natural height; the container scrolls. */}
            <Screen>{children}</Screen>
          </main>
        </Frame>
      </TabsProvider>
    </SessionProvider>
  );
}

/**
 * The one scroll container, and the thing that makes a navigation look like one.
 *
 * Re-keyed on the route, so React replaces the element rather than reusing it
 * and the entrance animation runs again — a screen that fades in where the last
 * one was reads as arriving, which matters most when it was the assistant that
 * moved you and you did not press anything.
 *
 * `[&>*]:shrink-0` is load-bearing, not tidying. A flex column gives every
 * child `flex-shrink: 1`, so once a screen's blocks were taller than the window
 * they were COMPRESSED to fit instead of overflowing and scrolling — panels lost
 * height and their contents were sliced through the middle. Headline numbers
 * were cut in half on every screen with more than a couple of blocks. Children
 * keep their natural height; the container scrolls.
 */
function Screen({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="screen-in flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto [&>*]:shrink-0"
    >
      {children}
    </div>
  );
}

/**
 * The app ground. Blocks float on it; nothing else paints a background.
 *
 * `isolation: isolate` is what lets the doodle layer sit at z-index -1 —
 * above this element's own background, below every block in flow — so no
 * block on any screen needs a z-index of its own. The drawing inks itself
 * from `currentColor`, so it follows the mode without a second copy.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-ground relative isolate flex h-dvh gap-3.5 overflow-hidden bg-app p-3 text-ink sm:p-4">
      <Doodles />
      {/* Above everything, including the modal layer: the one thing that must
          stay visible while a screen is being replaced is the fact that it is
          being replaced. */}
      <RouteProgress />
      {children}
    </div>
  );
}

/** Shown while the session resolves. Shaped like the shell, so nothing jumps. */
function BootScreen() {
  return (
    <Frame>
      <Skeleton className="h-full w-[62px] rounded-[16px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Skeleton className="h-[26px] w-64 shrink-0 rounded-[9px]" />
        <Skeleton className="h-[62px] shrink-0 rounded-[20px]" />
        <div className="flex min-h-0 flex-1 gap-3.5">
          <Skeleton className="flex-1 rounded-[20px]" />
          <div className="flex w-[420px] shrink-0 flex-col gap-3.5">
            <Skeleton className="h-[186px] shrink-0 rounded-[11px]" />
            <Skeleton className="flex-1 rounded-[20px]" />
          </div>
        </div>
      </div>
    </Frame>
  );
}
