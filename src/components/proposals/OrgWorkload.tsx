"use client";

import clsx from "clsx";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, num, relative } from "@/lib/format";
import { activeOf, type TeamOut, type WorkloadOut } from "@/lib/types";
import { Badge, Panel, PanelHead, RampBar, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";

/**
 * Every team's proposal work, on the overview.
 *
 * The reason it exists: somebody running the business was opening each team's
 * page in turn to answer "who is under water", and by the fourth tab the first
 * was out of date.
 *
 * It is built from one workload call *per team* rather than the single
 * organisation-wide one, and that is deliberate. The org-wide call returns
 * every assignee on the SharePoint Proposals list, which is a different
 * population from the teams in this app — it includes people who were never
 * added to a team, and people who have left one. Asking per team means every
 * figure here belongs to a team by construction, and `scope` comes back saying
 * how many of that team's members it actually matched.
 *
 * What it shows is totals, not tasks. The Proposals endpoints only ever hand a
 * person their own rows, so no view here — administrator or not — can list
 * somebody else's tasks. Per-person figures are a click away on each team's
 * own page; this is the level above that.
 *
 * Admin-only, and that is the backend's rule rather than this component's:
 * `/proposals/workload` is gated there and answers 403 to anyone else. The
 * caller checks the same flag only so an ordinary user is not shown a panel
 * that would fail.
 */
export function OrgWorkload() {
  const teams = useSWR<TeamOut[]>("/teams", {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });

  const live = (teams.data ?? []).filter((team) => !team.archived_at);
  const slugs = live.map((team) => team.slug);

  // One SWR entry covering all the teams, rather than a hook per row: the
  // panel has to sort by which team is under most pressure, and it cannot do
  // that while each row is off fetching its own figures.
  //
  // Each team settles on its own — a team whose workload fails records the
  // failure and the rest still render. One bad team blanking the whole
  // overview would be the worst of both.
  const rolls = useSWR(
    slugs.length > 0 ? ["team-workload", slugs.join(",")] : null,
    async () =>
      Promise.all(
        live.map(async (team) => {
          try {
            return {
              team,
              data: await api.get<WorkloadOut>("/proposals/workload", { team: team.slug }),
              error: null as string | null,
            };
          } catch (caught) {
            return {
              team,
              data: null,
              error: caught instanceof Error ? caught.message : "Could not be read.",
            };
          }
        }),
      ),
    { revalidateOnFocus: false, dedupingInterval: 300_000, shouldRetryOnError: false },
  );

  async function reread() {
    // An ordinary revalidate is handed the same cached figures, so a button
    // that says "re-read" has to actually say so to the backend.
    await rolls.mutate(
      () =>
        Promise.all(
          live.map(async (team) => {
            try {
              return {
                team,
                data: await api.get<WorkloadOut>("/proposals/workload", {
                  team: team.slug,
                  refresh: true,
                }),
                error: null as string | null,
              };
            } catch (caught) {
              return {
                team,
                data: null,
                error: caught instanceof Error ? caught.message : "Could not be read.",
              };
            }
          }),
        ),
      { revalidate: false },
    );
  }

  if (teams.error) {
    return (
      <Panel className="p-5">
        <PanelHead title="Across every team" />
        <ErrorState error={teams.error} onRetry={() => teams.mutate()} className="mt-4" />
      </Panel>
    );
  }
  if (teams.isLoading || (slugs.length > 0 && !rolls.data && !rolls.error)) {
    return <RowsSkeleton rows={4} />;
  }
  if (live.length === 0) {
    return (
      <Panel className="p-5">
        <PanelHead title="Across every team" />
        <Empty title="No teams yet" body="Nothing to summarise until a team exists." className="mt-4" />
      </Panel>
    );
  }

  const rows = [...(rolls.data ?? [])].sort((a, b) => {
    const soon = (b.data?.organisation.due_soon ?? 0) - (a.data?.organisation.due_soon ?? 0);
    if (soon !== 0) return soon;
    return (
      (b.data ? activeOf(b.data.organisation) : 0) - (a.data ? activeOf(a.data.organisation) : 0)
    );
  });

  const totals = rows.reduce(
    (sum, row) => ({
      live: sum.live + (row.data ? activeOf(row.data.organisation) : 0),
      soon: sum.soon + (row.data?.organisation.due_soon ?? 0),
      people: sum.people + (row.data?.person_count ?? 0),
    }),
    { live: 0, soon: 0, people: 0 },
  );
  const cached = rows.find((row) => row.data?.cached)?.data;
  const failed = rows.filter((row) => row.error).length;

  return (
    <Panel className="p-5">
      <PanelHead
        title="Across every team"
        count={live.length}
        hint="One line per team. Open a team for the people behind its figures."
        action={
          <Button size="sm" icon={RefreshCw} loading={rolls.isValidating} onClick={reread}>
            Re-read SharePoint
          </Button>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent" icon={ShieldCheck} title="Only administrators can see this panel">
          Admin view
        </Badge>
        {cached && (
          <span className="text-[11.5px] text-ink-4">
            from a cache built {relative(cached.generated_at)}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl bg-inset px-4 py-3.5">
        {/* Summed across teams, so anybody who belongs to two is in here
            twice. Said in the tooltip rather than left to be discovered by
            someone checking the arithmetic against a team page. */}
        <span title="Summed per team. Anyone who belongs to two teams counts in both.">
          <Stat value={num(totals.live)} label="live across the teams" />
        </span>
        <Stat
          value={num(totals.soon)}
          label="due soon"
          tone="warn"
          delta={totals.soon > 0 ? "soon" : undefined}
        />
        <Stat value={num(live.length)} label={live.length === 1 ? "team" : "teams"} />
        <Stat value={num(totals.people)} label="people carrying work" />
      </div>

      {failed > 0 && (
        <InlineNotice tone="warn" className="mt-4">
          {failed} of {rows.length} teams could not be read. The rest are shown.
        </InlineNotice>
      )}

      <ul className="mt-4 space-y-1.5">
        {rows.map((row) => (
          <TeamRow key={row.team.id} team={row.team} data={row.data} error={row.error} />
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-4">
        Totals only. The Proposals list hands each person their own rows, so nobody —
        administrators included — reads somebody else&rsquo;s tasks through this app. Each
        team&rsquo;s page breaks these same figures down by member.
      </p>
    </Panel>
  );
}

/* ── one team ────────────────────────────────────────────────────────── */

function TeamRow({
  team,
  data,
  error,
}: {
  team: TeamOut;
  data: WorkloadOut | null;
  error: string | null;
}) {
  if (error || !data) {
    return (
      <li className="flex flex-wrap items-center gap-4 rounded-xl bg-inset px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{team.name}</span>
        <span className="text-[12px] text-warn">{error ?? "No figures"}</span>
      </li>
    );
  }

  const org = data.organisation;
  const live = activeOf(org);
  // How much of the team the figures actually cover. A team whose members are
  // largely absent from the Proposals list has a small number for a reason,
  // and that reason is not "they are not busy".
  const missing = data.scope
    ? data.scope.member_count - data.scope.matched_in_sharepoint
    : 0;

  return (
    <li>
      <Link
        href={`/teams/${team.slug}/proposals`}
        className="group flex flex-wrap items-center gap-4 rounded-xl bg-inset px-3 py-2.5 transition hover:bg-panel-2"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
            {team.name}
            <ArrowUpRight
              className="size-3 shrink-0 text-ink-4 opacity-0 transition group-hover:opacity-100"
              strokeWidth={2}
            />
          </p>
          <p className="truncate text-[11px] text-ink-4">
            {data.person_count} carrying work
            {missing > 0 && (
              <span title="Members with no matching rows on the Proposals list">
                {" · "}
                {missing} of {data.scope!.member_count} not on the list
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-5 text-[12.5px]">
          <span className="tnum" title="Not finished, and the bid is still open">
            <strong className={clsx(live === 0 && "text-ink-4")}>{num(live)}</strong>{" "}
            <span className="text-ink-4">live</span>
          </span>
          {org.due_soon > 0 && (
            <span className="tnum text-warn" title={`Due within ${data.soon_days} days`}>
              {org.due_soon} soon
            </span>
          )}
          {/* Not "overdue". The backend means the bid closing date has passed,
              which on this list is mostly an archive — painting it red put
              every team permanently in crisis. */}
          {org.overdue > 0 && (
            <span
              className="tnum text-ink-4"
              title="Not finished, but the bid closed. Counted, not chased."
            >
              {org.overdue} closed
            </span>
          )}
        </div>

        {/* Only the live work is drawn. The closed bids outnumber it many times
            over and made every bar a full-width smear that said nothing. */}
        <div className="w-full sm:w-44">
          <RampBar
            height={20}
            showValues={false}
            segments={[
              { value: org.no_deadline, label: "No deadline" },
              { value: org.later, label: "Later" },
              { value: org.due_soon, label: "Due soon" },
            ]}
          />
        </div>

        <span className="tnum w-20 shrink-0 text-right text-[12px] text-ink-3">
          {org.next_deadline ? dateShort(org.next_deadline) : "—"}
        </span>
      </Link>
    </li>
  );
}
