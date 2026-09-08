"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, ListTree, Radio, Sliders, TrendingUp } from "lucide-react";

/**
 * The five screens the assistant's administration is made of.
 *
 * They are one job split across five pages — switch it on, decide what it may
 * do, decide who gets it, watch what it did, see what it cost — and each is a
 * step somebody takes in roughly that order the first time. So they carry a
 * strip naming all five rather than each being an island reached from the rail.
 *
 * Only two of them are on the rail, deliberately: five near-identical rows there
 * would crowd out everything else an administrator does. This is where the other
 * three live.
 */

const PAGES = [
  { href: "/admin/assistant", label: "Settings", icon: Sliders },
  { href: "/admin/assistant/permissions", label: "Permissions", icon: ListTree },
  { href: "/admin/assistant/access", label: "Access rules", icon: KeyRound },
  { href: "/admin/assistant/runs", label: "Runs", icon: Radio },
  { href: "/admin/assistant/analytics", label: "Usage & cost", icon: TrendingUp },
] as const;

export function AssistantAdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Assistant administration"
      className="no-bar flex gap-1 overflow-x-auto rounded-[14px] bg-panel-2 p-1"
    >
      {PAGES.map((page) => {
        // An exact match, not a prefix: "/admin/assistant" is the parent of
        // every other entry here, and as a prefix it would be selected on all
        // five at once.
        const on = pathname === page.href;
        const Icon = page.icon;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={on ? "page" : undefined}
            className={clsx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[12.5px] transition",
              on
                ? "bg-accent font-bold text-accent-ink"
                : "font-medium text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.2} />
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
