"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { api, ApiError, withQuery } from "@/lib/api";
import { num, relative } from "@/lib/format";
import type { TeamTasksOut } from "@/lib/types";
import { PageHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { TeamTaskBoard } from "@/components/proposals/TeamTaskBoard";

/**
 * A team's proposal work, member by member.
 *
 * This screen used to be counts only, and said so: "not a task list — the
 * tasks themselves are personal, and the backend will only ever hand a person
 * their own". That was true of the API as it stood, and it made the page
 * honest rather than good — a lead could see that somebody was carrying eleven
 * live bids and had nowhere to go to find out which eleven.
 *
 * `/proposals/team-tasks` is the deliberate, authorised widening the proposals
 * router anticipated, so the page now shows the rows. What has *not* widened is
 * who the rows belong to: the backend derives the people from this team's
 * membership, so this is still the team's own work and nobody else's.
 *
 * It also replaces the admin-only `/proposals/workload` this page used to
 * read. That endpoint answers 403 to a team lead, which meant the one screen
 * named after their team was the one screen they could not open.
 *
 * The number that leads is the *live* one. "Open" on this list means "not
 * finished", which is mostly an archive of bids that closed months ago —
 * leading with it, and painting its bulk red as "overdue", described a crisis
 * that was not happening.
 */
export default function TeamProposalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  /**
   * Finished rows are fetched only once somebody asks for them.
   *
   * The difference is not small: on a seven-person team the open rows are 137
   * and 96 KB, and everything is 943 and 637 KB, because completed bids going
   * back years outnumber live work roughly seven to one. The analytics module
   * next door refuses to ship ~400 KB of rows to a browser and is right to.
   *
   * So the screen opens on the open rows and loads the rest when the viewer
   * picks a filter that needs them. **The counts do not wait for it** —
   * `total` and `open_count` are computed server-side across everything
   * assigned, so "Everything 943" and "Finished 806" are honest from the first
   * paint whether or not those rows have arrived. What the fetch adds is the
   * ability to list them, not the ability to count them.
   */
  const [includeFinished, setIncludeFinished] = useState(false);

  const key = withQuery("/proposals/team-tasks", {
    team: slug,
    open_only: !includeFinished,
    limit: 500,
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR<TeamTasksOut>(key, {
    revalidateOnFocus: false,
    // The open-row answer stays on screen while the fuller one loads, rather
    // than the board blanking and redrawing on a filter click.
    keepPreviousData: true,
  });

  async function refresh() {
    // The backend caches this per team, so an ordinary revalidate would hand
    // back the same rows. `refresh=true` is what forces a fresh read.
    await mutate(
      () =>
        api.get<TeamTasksOut>("/proposals/team-tasks", {
          team: slug,
          open_only: !includeFinished,
          limit: 500,
          refresh: true,
        }),
      { revalidate: false },
    );
  }

  const forbidden = error instanceof ApiError && error.forbidden;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href={`/teams/${slug}`}>Team</Link>}
        title="Proposal work"
        lead="This team's members only, soonest deadline first."
        actions={
          <Button icon={RefreshCw} loading={isValidating} onClick={refresh}>
            Re-read SharePoint
          </Button>
        }
      />

      {forbidden ? (
        // The backend's own wording, not a guess at it: this page is open to
        // the team's lead or manager and to administrators, and the message
        // that comes back names exactly that.
        <InlineNotice tone="warn">{(error as ApiError).message}</InlineNotice>
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : !data ? null : (
        <>
          {data.cached && (
            <p className="text-[12px] text-ink-4">
              From a cache built {relative(data.generated_at)}
              {data.age_seconds ? ` (${data.age_seconds}s old)` : ""}.
            </p>
          )}

          <p className="text-[12px] text-ink-4">
            {data.scope.matched_in_sharepoint} of {data.scope.member_count} members matched on
            the Proposals list · {num(data.total)} rows assigned to them
            {includeFinished ? "" : `, of which ${num(data.open_count)} are still open`}.
          </p>

          {data.scope.members_without_sharepoint.length > 0 && (
            <InlineNotice tone="warn">
              {data.scope.members_without_sharepoint.length} of {data.scope.member_count}{" "}
              members are not on the Proposals list, so nothing is counted for them:{" "}
              {data.scope.members_without_sharepoint.join(", ")}.
            </InlineNotice>
          )}

          {data.members.length === 0 ? (
            <Empty
              title="This team has no members"
              body="Add somebody to the team and their proposal work will appear here."
            />
          ) : (
            <TeamTaskBoard
              data={data}
              includeFinished={includeFinished}
              onIncludeFinished={() => setIncludeFinished(true)}
              loadingFinished={includeFinished && isValidating}
            />
          )}
        </>
      )}
    </div>
  );
}
