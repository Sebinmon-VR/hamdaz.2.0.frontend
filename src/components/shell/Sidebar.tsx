"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, X } from "lucide-react";
import { buildNav, isActive } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { Avatar, Panel, PanelAdd, PanelHead } from "@/components/ui/primitives";
import { Wordmark } from "@/components/shell/Wordmark";

/**
 * The rail: a column of stacked panels rather than one long list.
 *
 * The reference groups its left-hand tools into separate rounded panels, and
 * that grouping is what makes a rail with this many entries readable. Here the
 * groups are the ones the backend already defines — what you do, who you work
 * with, and what you administer — plus your own teams pinned at the bottom,
 * because team-scoped screens are the ones people navigate to by name.
 *
 * Its contents come from the viewer's effective access, so nobody is ever
 * shown a link that would 403.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const pathname = usePathname();
  const groups = buildNav(session);
  const teams = session.teams.filter((t) => !t.team.archived_at);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={clsx(
          "fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col gap-2 overflow-y-auto bg-canvas p-2 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-2 lg:hidden">
          <Wordmark />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto grid size-8 place-items-center rounded-full text-ink-3 hover:bg-panel-2"
          >
            <X className="size-4" />
          </button>
        </div>

        {groups.map((group) => (
          <Panel key={group.label} className="p-2.5">
            <PanelHead title={group.label} className="px-1.5 pb-2" />
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex h-9 items-center gap-2.5 rounded-full pl-1.5 pr-3 text-[12.5px] transition",
                        active
                          ? "bg-panel-3 font-medium text-ink"
                          : "text-ink-3 hover:bg-panel-2 hover:text-ink",
                      )}
                    >
                      <span
                        className={clsx(
                          "grid size-6 shrink-0 place-items-center rounded-full transition",
                          active
                            ? "bg-accent text-[var(--c-accent-ink)]"
                            : "bg-panel-2 text-ink-4",
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="shrink-0 rounded-full bg-panel-2 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-4">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

        {teams.length > 0 && (
          <Panel className="p-2.5">
            <PanelHead
              title="My teams"
              count={teams.length}
              className="px-1.5 pb-2"
              action={
                session.roles.is_admin && <PanelAdd href="/teams" label="All teams" />
              }
            />
            <ul className="space-y-0.5">
              {teams.map(({ team, role_keys }) => {
                const href = `/teams/${team.slug}`;
                const active = pathname.startsWith(href);
                return (
                  <li key={team.id}>
                    <Link
                      href={href}
                      onClick={onClose}
                      className={clsx(
                        "flex h-9 items-center gap-2.5 rounded-full pl-1.5 pr-3 text-[12.5px] transition",
                        active
                          ? "bg-panel-3 font-medium text-ink"
                          : "text-ink-3 hover:bg-panel-2 hover:text-ink",
                      )}
                    >
                      <Avatar name={team.name} seed={team.id} size="sm" className="size-6" />
                      <span className="min-w-0 flex-1 truncate">{team.name}</span>
                      {role_keys.includes("team_lead") && (
                        <Crown
                          className="size-3 shrink-0 text-highlight-text"
                          strokeWidth={2.2}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        <div className="grow" />
      </aside>
    </>
  );
}
