"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { labelFor } from "@/lib/nav";
import { SessionProvider, useLoadSession } from "@/lib/session";
import { TabsProvider } from "@/lib/tabs";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { Wordmark } from "@/components/shell/Wordmark";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

/**
 * Everything behind sign-in renders inside this.
 *
 * The session is loaded once here rather than per page, so a navigation never
 * re-asks who the viewer is. A 401 on that first load is the one error the
 * shell handles itself: the cookie has expired, and the only useful response
 * is to send the person back to sign in — remembering where they were so they
 * land there rather than on the dashboard.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        // Re-entering a screen through a tab should be instant. Within the
        // dedupe window SWR serves the cached answer and skips the request
        // entirely, which is what makes the tab strip feel free.
        dedupingInterval: 30_000,
        keepPreviousData: true,
        // A failure here is usually a real one — a 403, or SharePoint being
        // down — so hammering it three times helps nobody.
        errorRetryCount: 1,
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
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    if (unauthorised) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorised, router, pathname]);

  if (unauthorised) return <BootScreen />;

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Wordmark />
          </div>
          <ErrorState error={error} onRetry={() => location.reload()} />
        </div>
      </main>
    );
  }

  if (loading || !session) return <BootScreen />;

  return (
    <SessionProvider session={session}>
      <TabsProvider labelFor={labelFor}>
        <div className="min-h-dvh bg-canvas">
          <Sidebar open={navOpen} onClose={closeNav} />
          <div className="flex min-h-dvh flex-col lg:pl-[236px]">
            <Topbar onOpenNav={() => setNavOpen(true)} />
            <main className="min-w-0 flex-1 px-3 pb-4 sm:px-4">
              <div className="mx-auto w-full max-w-[1560px] space-y-3">{children}</div>
            </main>
          </div>
        </div>
      </TabsProvider>
    </SessionProvider>
  );
}

/** Shown while the session resolves. Shaped like the shell, so nothing jumps. */
function BootScreen() {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="fixed inset-y-0 left-0 hidden w-[236px] flex-col gap-2 p-2 lg:flex">
        {[5, 3, 3].map((rows, panel) => (
          <div key={panel} className="rounded-[20px] border border-line bg-panel p-2.5">
            <Skeleton className="mb-2 ml-1.5 h-3 w-20" />
            <div className="space-y-1">
              {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="lg:pl-[236px]">
        <div className="flex h-16 items-center gap-3 px-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-10 w-40 rounded-full" />
          <Skeleton className="h-10 w-32 rounded-full" />
          <div className="grow" />
          <Skeleton className="size-10 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-[1560px] space-y-3 px-4">
          <Skeleton className="h-44 rounded-[20px]" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-[20px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
