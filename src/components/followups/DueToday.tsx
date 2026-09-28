"use client";

import Link from "next/link";
import useSWR from "swr";
import { CalendarClock, ExternalLink, RefreshCw } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import type { DueTodayOut, DueTodayTaskOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { FollowupStatusBadge } from "@/components/followups/FollowupBits";

/**
 * Today's due tasks and where each one stands — no countdown.
 *
 * Each row says one of three things: submitted; reason needed (marked Not
 * Submitted, or past its due time without being submitted); or due later
 * today, with its time in UAE time. Once the question has gone out, the row
 * shows whether it was answered instead.
 *
 * A manager or lead sees every member of the team; anybody else sees their own.
 */
export function DueToday({ team }: { team?: string | null }) {
  const key = withQuery("/followups/due-today", { team: team ?? undefined });
  const { data, error, isLoading, isValidating, mutate } = useSWR<DueTodayOut>(key, {
    revalidateOnFocus: false,
    refreshInterval: 120_000,
    keepPreviousData: true,
  });

  async function refresh() {
    // The team's rows are cached server-side; `refresh` re-reads SharePoint.
    await mutate(
      () =>
        api.get<DueTodayOut>("/followups/due-today", {
          team: team ?? undefined,
          refresh: true,
        }),
      { revalidate: false },
    );
  }

  return (
    <Panel className="p-5">
      <PanelHead
        title="Due today"
        count={data ? data.tasks.filter((t) => !t.finished).length : undefined}
        hint={
          data
            ? data.scope === "team"
              ? `Everyone in ${data.team_name ?? "the team"}, by due time.`
              : "Your own tasks, by due time."
            : undefined
        }
        action={
          <Button size="sm" icon={RefreshCw} loading={isValidating} onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />
      <div className="mt-3">
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <RowsSkeleton rows={4} />
        ) : !data || data.tasks.length === 0 ? (
          <Empty icon={CalendarClock} title="Nothing due today" />
        ) : (
          <ul className="divide-y divide-line">
            {data.tasks.map((task) => (
              <Row
                key={`${task.task_id}-${task.due_at}`}
                task={task}
                showWho={data.scope === "team"}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Row({ task, showWho }: { task: DueTodayTaskOut; showWho: boolean }) {
  const passed = new Date(task.due_at).getTime() <= Date.now();

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{task.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-4">
          {[
            showWho ? task.assignee_name : null,
            `due ${uae(task.due_at)} UAE`,
            task.submission_status ?? "submission status not set",
            task.status,
            task.end_user,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {task.task_url && (
        <a
          href={task.task_url}
          target="_blank"
          rel="noreferrer"
          title="Open in SharePoint"
          className="grid size-7 place-items-center rounded-full text-ink-4 hover:bg-panel-2 hover:text-ink"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
      {task.followup_id && task.followup_status ? (
        // Asked already: what matters now is whether it was answered.
        <Link href={`/followups/${task.followup_id}`}>
          <FollowupStatusBadge status={task.followup_status} />
        </Link>
      ) : task.finished ? (
        <Badge tone="positive">Submitted</Badge>
      ) : task.reason_now || passed ? (
        <Badge
          tone="danger"
          title={
            task.reason_now
              ? "Marked Not Submitted, so the reason is asked for now."
              : "Past its due time and not submitted; the reason is asked for."
          }
        >
          Reason needed
        </Badge>
      ) : (
        <Badge
          tone="neutral"
          title="Not submitted yet; the reason is asked for once the due time passes."
        >
          Due {uae(task.due_at)}
        </Badge>
      )}
    </li>
  );
}

/**
 * A time as it is in the UAE, whatever the viewer's own timezone. The bid
 * closes on the UAE's clock; showing it on a laptop set to India time put
 * every deadline an hour and a half later than it is.
 */
function uae(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
}
