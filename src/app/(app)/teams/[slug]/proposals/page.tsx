"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateShort, num, relative } from "@/lib/format";
import { activeOf } from "@/lib/types";
import type { WorkloadOut } from "@/lib/types";
import {
  Avatar,
  Badge,
  Panel,
  PageHead,
  PanelHead,
  RampBar,
  Stat,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";

/**
 * A team's proposal workload.
 *
 * Not a task list — the tasks themselves are personal, and the backend will
 * only ever hand a person their own. What a team screen can honestly show is
 * the aggregate: who is carrying how much live work, and what is due.
 *
 * The number that leads is the *live* one. `open` on this endpoint means "not
 * finished", which on the Proposals list is mostly an archive of bids that
 * closed months ago — leading with it, and painting its bulk red as "overdue",
 * described a crisis that was not happening.
 */
const NO_STATUS = "(no status)";

export default function TeamProposalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const { data, error, isLoading, isValidating, mutate } = useSWR<WorkloadOut>(
    withQuery("/proposals/workload", { team: slug }),
    { revalidateOnFocus: false },
  );

  async function refresh() {
    // The backend caches this aggregate across every admin, so an ordinary
    // revalidate would hand back the same cached numbers. `refresh=true` is
    // what forces a fresh sweep of the SharePoint list.
    await mutate(
      () => api.get<WorkloadOut>("/proposals/workload", { team: slug, refresh: true }),
      { revalidate: false },
    );
  }

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href={`/teams/${slug}`}>Team</Link>}
        title="Proposal workload"
        lead="This team's members only."
        actions={
          <Button icon={RefreshCw} loading={isValidating} onClick={refresh}>
            Re-read SharePoint
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : !data ? null : (
        <>
          {data.cached && (
            <p className="text-[12px] text-ink-4">
              From a cache built {relative(data.generated_at)}
              {data.age_seconds !== undefined ? ` (${data.age_seconds}s old)` : ""}.
            </p>
          )}

          <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
            <Stat value={num(activeOf(data.organisation))} label="live across the team" />
            <Stat
              value={num(data.organisation.due_soon)}
              label={`due within ${data.soon_days} days`}
              tone="warn"
              delta={data.organisation.due_soon > 0 ? "soon" : undefined}
            />
            {/* Not "overdue": the backend means the bid closing date has
                passed, which on this list is an archive rather than late
                work. Calling it late put every team permanently in the red. */}
            <Stat value={num(data.organisation.overdue)} label="bids since closed" />
            <Stat value={num(data.person_count)} label="people carrying work" />
          </Panel>

          {data.scope && (
            <p className="text-[12px] text-ink-4">
              {data.scope.matched_in_sharepoint} of {data.scope.member_count} members
              matched on the Proposals list
              {data.row_count !== null && data.row_count !== undefined
                ? ` · ${num(data.row_count)} rows read`
                : ""}
              .
            </p>
          )}

          {data.scope && data.scope.members_without_sharepoint.length > 0 && (
            <InlineNotice tone="warn">
              {data.scope.members_without_sharepoint.length} of{" "}
              {data.scope.member_count} members are not on the Proposals list, so nothing
              is counted for them: {data.scope.members_without_sharepoint.join(", ")}.
            </InlineNotice>
          )}

          <Panel className="p-4">
            <PanelHead title="By person" count={data.people.length} />
            {data.people.length === 0 ? (
              <Empty
                title="Nothing assigned"
                body="No rows on the Proposals list belong to anyone in this team."
                className="mt-5"
              />
            ) : (
              <ul className="mt-3 space-y-1.5">
                {data.people.map((person) => (
                  <li
                    key={person.lookup_id ?? person.name}
                    className="flex flex-wrap items-center gap-4 rounded-xl bg-inset px-3 py-2"
                  >
                    <Avatar
                      name={person.name}
                      seed={person.lookup_id ?? person.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{person.name}</p>
                      <p className="truncate text-[11.5px] text-ink-4">
                        {person.email ?? "No email on the list"}
                      </p>
                    </div>

                    <div className="flex items-center gap-5 text-[13px]">
                      <span className="tnum" title="Not finished and the bid is still open">
                        <strong>{activeOf(person)}</strong>{" "}
                        <span className="text-ink-4">live</span>
                      </span>
                      {person.due_soon > 0 && (
                        <span className="tnum text-warn">{person.due_soon} soon</span>
                      )}
                      {person.overdue > 0 && (
                        <span
                          className="tnum text-ink-4"
                          title="Not finished, but the bid closed. Counted, not chased."
                        >
                          {person.overdue} closed
                        </span>
                      )}
                    </div>

                    {/* Only the live work is drawn. Including the closed bids
                        made every bar a full-width smear that said nothing —
                        they outnumber live rows twenty to one. */}
                    <div className="w-full sm:w-44">
                      <RampBar
                        height={22}
                        showValues={false}
                        segments={[
                          { value: person.no_deadline, label: "No deadline" },
                          { value: person.later, label: "Later" },
                          { value: person.due_soon, label: "Due soon" },
                        ]}
                      />
                    </div>

                    <span className="tnum w-20 shrink-0 text-right text-[12.5px] text-ink-3">
                      {person.next_deadline ? dateShort(person.next_deadline) : "—"}
                    </span>

                    {/* SharePoint's own status values, which the bar cannot
                        show because it groups by deadline instead.

                        The unstatused rows are already in here under the key
                        "(no status)"; `person.no_status` is those same rows
                        counted a second time, so rendering both showed every
                        person the same number twice. Marked, not repeated. */}
                    {Object.keys(person.by_status).length > 0 && (
                      <div className="flex w-full flex-wrap gap-1.5 pl-11">
                        {Object.entries(person.by_status)
                          .sort((a, b) => b[1] - a[1])
                          .map(([status, count]) => (
                            <Badge
                              key={status}
                              tone={status === NO_STATUS ? "warn" : "neutral"}
                            >
                              {status === NO_STATUS ? "No status" : status} {count}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.excluded && data.excluded.people > 0 && (
            <p className="text-[12px] leading-relaxed text-ink-4">
              Excluded from these figures: {data.excluded.rows} rows belonging to{" "}
              {data.excluded.people} people outside this team
              {data.excluded.names.length > 0
                ? ` (${data.excluded.names.slice(0, 5).join(", ")}${
                    data.excluded.names.length > 5 ? "…" : ""
                  })`
                : ""}
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
