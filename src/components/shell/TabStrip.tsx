"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useTabs } from "@/lib/tabs";

/**
 * The open screens, kept along the top.
 *
 * An ERP is a job of holding two things in mind at once — deciding a leave
 * request against a team's workload, checking a quote while building a
 * comparison — and losing your place in one to look at the other is the whole
 * friction. A tab is only ever a route, so the strip costs nothing to keep.
 */
export function TabStrip() {
  const router = useRouter();
  const { tabs, active, close } = useTabs();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={() => router.back()}
        aria-label="Back"
        title="Back"
        className="grid size-[30px] shrink-0 place-items-center rounded-[10px] text-ink-4 transition hover:bg-panel-2 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
      </button>

      <nav
        aria-label="Open screens"
        className="no-bar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const on = tab.href === active;
          // Overview is where a closed tab falls back to, so it stays put.
          const closable = tabs.length > 1 && tab.href !== "/dashboard";
          return (
            <span
              key={tab.href}
              className={clsx(
                // Chips, not browser tabs: at 26px they read as a list of
                // places rather than as a second navigation.
                "group flex h-[26px] shrink-0 items-center rounded-[9px] transition",
                on
                  ? "bg-panel-2 font-semibold text-ink"
                  : "text-ink-3 hover:bg-panel-2 hover:text-ink-2",
                closable ? "pl-3 pr-0.5" : "px-3",
              )}
            >
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className="max-w-[150px] truncate text-[11.5px]"
              >
                {tab.label}
              </Link>
              {closable && (
                <button
                  onClick={() => close(tab.href)}
                  aria-label={`Close ${tab.label}`}
                  className="ml-1.5 grid size-5 place-items-center rounded-md text-ink-4 transition hover:bg-panel-3 hover:text-ink"
                >
                  <X className="size-2.5" strokeWidth={3} />
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
