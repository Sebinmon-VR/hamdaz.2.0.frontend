"use client";

import useSWR from "swr";
import { RefreshCw, UserX } from "lucide-react";
import { withQuery } from "@/lib/api";
import { num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { MyTasksOut } from "@/lib/types";
import { Panel, PageHead, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { TaskList } from "@/components/proposals/TaskList";

export default function MyTasksPage() {
  const session = useSession();
  // Everything, not just open — the filter rail on the list needs the closed
  // ones to count them, and one sweep of the list is cheaper than two.
  const { data, error, isLoading, isValidating, mutate } = useSWR<MyTasksOut>(
    withQuery("/proposals/my-tasks", { open_only: false, limit: 500 }),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Proposals"
        title="My tasks"
        lead="Your enquiries, soonest deadline first. Quoting starts under Quote requests."
        actions={
          <Button
            icon={RefreshCw}
            loading={isValidating}
            onClick={() => mutate()}
          >
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={7} />
      ) : !data ? null : !data.in_sharepoint ? (
        <Empty
          icon={UserX}
          title="You are not on the Proposals list"
          body={`Nothing in SharePoint is assigned to ${data.email}, so there is nothing here to quote for. If that is wrong, whoever maintains the Proposals list needs to add you to it.`}
        />
      ) : (
        <>
          <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
            <Stat value={num(data.open_count)} label="open" />
            <Stat value={num(data.total - data.open_count)} label="closed" />
            <Stat value={num(data.total)} label="assigned in total" />
          </Panel>
          <TaskList tasks={data.tasks} workflows={session.can("workflows")} />
        </>
      )}
    </div>
  );
}
