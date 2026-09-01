"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateShort, num, relative } from "@/lib/format";
import type { WorkloadOut } from "@/lib/types";
import { Avatar, Panel, PageHead, PanelHead, RampBar, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";

/**
 * A team's proposal workload.
 *
 * Not a task list — the tasks themselves are personal, and the backend will
 * only ever hand a person their own. What a team screen can honestly show is
 * the aggregate: who is carrying how much, and how much of it is late.
 */
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
        lead="Counted across this team's members only. People on the Proposals list who are not in the team are excluded."
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
            <Stat value={num(data.organisation.open)} label="open across the team" />
            <Stat
              value={num(data.organisation.overdue)}
              label="overdue"
              tone="danger"
              delta={data.organisation.overdue > 0 ? "late" : undefined}
            />
            <Stat
              value={num(data.organisation.due_soon)}
              label={`due within ${data.soon_days} days`}
              tone="warn"
            />
            <Stat value={num(data.person_count)} label="people carrying work" />
          </Panel>

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
                      <span className="tnum">
                        <strong>{person.open}</strong>{" "}
                        <span className="text-ink-4">open</span>
                      </span>
                      {person.overdue > 0 && (
                        <span className="tnum font-semibold text-danger">
                          {person.overdue} overdue
                        </span>
                      )}
                      {person.due_soon > 0 && (
                        <span className="tnum text-warn">{person.due_soon} soon</span>
                      )}
                    </div>

                    <div className="w-full sm:w-44">
                      <RampBar
                        height={22}
                        showValues={false}
                        segments={[
                          { value: person.no_deadline, label: "No deadline" },
                          { value: person.later, label: "Later" },
                          { value: person.due_soon, label: "Due soon" },
                          { value: person.overdue, label: "Overdue" },
                        ]}
                      />
                    </div>

                    <span className="tnum w-20 shrink-0 text-right text-[12.5px] text-ink-3">
                      {person.next_deadline ? dateShort(person.next_deadline) : "—"}
                    </span>
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
