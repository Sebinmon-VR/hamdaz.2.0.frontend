"use client";

import Link from "next/link";
import useSWR from "swr";
import { CalendarClock, Settings2 } from "lucide-react";
import { relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ReminderOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";
import { ReminderStatusBadge, writeState } from "@/components/reminders/ReminderBits";

/**
 * The status reminders sent to me: tasks due in a couple of days, and where I
 * said each one stands. The settings are /admin/reminders, for a super admin.
 */
export default function RemindersPage() {
  const session = useSession();
  const { data, error, isLoading, mutate } = useSWR<ReminderOut[]>("/reminders/mine", {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Proposals"
        title="Status reminders"
        lead="Tasks due soon that are not yet completed or submitted, and the status you gave."
        actions={
          session.roles.is_super_admin ? (
            <LinkButton href="/admin/reminders" icon={Settings2}>
              Settings
            </LinkButton>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : !data || data.length === 0 ? (
        <Empty
          icon={CalendarClock}
          title="No reminders"
          body="You have not been reminded about any task yet."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => {
            const state = writeState(row);
            return (
              <li key={row.id}>
                <Link href={`/reminders/${row.id}`}>
                  <Panel className="flex flex-wrap items-center gap-3 p-3 transition hover:border-line-strong">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{row.task_title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-4">
                        due {uaeDateTime(row.due_at)} · {row.status_at_ask ?? "status not set"}
                      </p>
                    </div>
                    <span className="text-[11.5px] text-ink-4">reminded {relative(row.created_at)}</span>
                    {state && (
                      <Badge tone={state.tone} title={state.title}>
                        {state.label}
                      </Badge>
                    )}
                    <ReminderStatusBadge status={row.status} />
                  </Panel>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
