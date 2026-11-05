"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Country } from "@/lib/payroll";

/**
 * Where you are inside payroll, kept in the URL.
 *
 * Payroll is one page with three tabs. The tab, the month on the pay run, the
 * country and an open employee are query parameters rather than routes, so the
 * module is one tab in the strip (tabs are keyed by pathname) — and a link, a
 * refresh or the back button still lands exactly where you were.
 */

export type PayrollTab = "run" | "employees" | "settings";

export const TABS: PayrollTab[] = ["run", "employees", "settings"];

export interface PayrollPlace {
  tab: PayrollTab;
  /** "2026-11" — the pay run's month. Empty means "the one that needs you". */
  month: string | null;
  country: Country | null;
  /** An open employee, or "new". */
  employee: string | null;
  /** A month by id — what old links and the approval notification carry. */
  run: string | null;
}

export function placeHref(place: Partial<PayrollPlace>): string {
  const q = new URLSearchParams();
  q.set("tab", place.tab ?? "run");
  if (place.month) q.set("month", place.month);
  if (place.country) q.set("country", place.country);
  if (place.employee) q.set("employee", place.employee);
  if (place.run) q.set("run", place.run);
  return `/payroll?${q}`;
}

export type Go = (
  next: Partial<PayrollPlace>,
  options?: { replace?: boolean; scroll?: boolean },
) => void;

export function usePayrollPlace(): PayrollPlace & { go: Go } {
  const params = useSearchParams();
  const router = useRouter();

  const rawTab = params.get("tab");
  const c = params.get("country");
  const tab: PayrollTab = TABS.includes(rawTab as PayrollTab) ? (rawTab as PayrollTab) : "run";
  const month = params.get("month");
  const country: Country | null = c === "AE" || c === "IN" ? c : null;
  const employee = params.get("employee");
  const run = params.get("run");

  /**
   * The month and the country stick until changed; an open employee or a
   * month-by-id is only kept when asked for again.
   */
  const go = useCallback<Go>(
    (next, options) => {
      const href = placeHref({
        tab: next.tab ?? (next.employee ? "employees" : tab),
        month: "month" in next ? next.month : month,
        country: "country" in next ? next.country : country,
        employee: next.employee ?? null,
        run: next.run ?? null,
      });
      const scroll = options?.scroll ?? false;
      if (options?.replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    },
    [router, tab, month, country],
  );

  return useMemo(
    () => ({ tab, month, country, employee, run, go }),
    [tab, month, country, employee, run, go],
  );
}

const STORE = "hamdaz-payroll-place-v2";

/** The last place, so the tab and the rail — both plain `/payroll` — come back to it. */
export function readPlace(): string | null {
  try {
    return sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
}

export function writePlace(query: string): void {
  try {
    sessionStorage.setItem(STORE, query);
  } catch {
    // Not remembering the tab only means starting on the pay run next time.
  }
}
