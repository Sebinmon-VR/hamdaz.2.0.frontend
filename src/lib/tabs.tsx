"use client";

/**
 * Open tabs.
 *
 * The reference keeps several reports open at once along the top, and that
 * turns out to be exactly what an ERP wants: someone deciding a leave request
 * against a team's workload is looking at two screens, and losing their place
 * in one to check the other is the whole friction.
 *
 * A tab is only ever a route. There is no per-tab state to restore — every
 * screen reads its own data from the API and SWR still has it cached — so this
 * is a list of paths and labels, nothing more. That is also why it survives a
 * reload for free.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export interface Tab {
  href: string;
  label: string;
}

interface TabsValue {
  tabs: Tab[];
  active: string;
  close: (href: string) => void;
  closeOthers: (href: string) => void;
}

const TabsContext = createContext<TabsValue | null>(null);

const STORAGE_KEY = "hamdaz-tabs";
/** Enough to be useful, few enough that the strip never needs a scrollbar. */
const MAX_TABS = 8;

/** The tab that always exists and cannot be closed. */
const HOME: Tab = { href: "/dashboard", label: "Overview" };

export function TabsProvider({
  children,
  labelFor,
}: {
  children: ReactNode;
  /** Turns a pathname into something worth reading on a tab. */
  labelFor: (pathname: string) => string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([HOME]);

  // Restore on the client only, so the server and first client render agree.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Tab[];
      if (Array.isArray(parsed) && parsed.length) {
        setTabs([HOME, ...parsed.filter((t) => t?.href && t.href !== HOME.href)]);
      }
    } catch {
      // A corrupt or unavailable store just means starting with one tab.
    }
  }, []);

  // Opening a page opens its tab. Navigating to one already open just selects
  // it, which is what makes the strip stable while you move around.
  useEffect(() => {
    if (!pathname || pathname === HOME.href) return;
    setTabs((current) => {
      if (current.some((t) => t.href === pathname)) return current;
      const next = [...current, { href: pathname, label: labelFor(pathname) }];
      // The oldest non-home tab falls off rather than the strip growing forever.
      return next.length > MAX_TABS ? [HOME, ...next.slice(2)] : next;
    });
  }, [pathname, labelFor]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tabs.filter((t) => t.href !== HOME.href)),
      );
    } catch {
      // Not being able to remember the strip does not stop it working now.
    }
  }, [tabs]);

  const close = useCallback(
    (href: string) => {
      if (href === HOME.href) return;
      setTabs((current) => {
        const index = current.findIndex((t) => t.href === href);
        if (index === -1) return current;
        const next = current.filter((t) => t.href !== href);
        // Closing the tab you are on lands you on its neighbour, not nowhere.
        if (href === pathname) {
          const fallback = next[index - 1] ?? next[0] ?? HOME;
          router.push(fallback.href);
        }
        return next.length ? next : [HOME];
      });
    },
    [pathname, router],
  );

  const closeOthers = useCallback(
    (href: string) => {
      setTabs((current) => current.filter((t) => t.href === href || t.href === HOME.href));
      if (pathname !== href) router.push(href);
    },
    [pathname, router],
  );

  const value = useMemo<TabsValue>(
    () => ({ tabs, active: pathname, close, closeOthers }),
    [tabs, pathname, close, closeOthers],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsValue {
  const value = useContext(TabsContext);
  if (!value) throw new Error("useTabs used outside TabsProvider");
  return value;
}
