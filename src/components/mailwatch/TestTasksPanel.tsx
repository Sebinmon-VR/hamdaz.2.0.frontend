"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronUp, ExternalLink, FlaskConical, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { MailWatchTestTaskOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";

/**
 * The test list: the tasks new tenders would have created on the Proposals
 * list, kept here while assignment is tested. The Proposals list is never
 * written; each row shows the exact fields a create would send.
 */
export function TestTasksPanel() {
  const { data, error, isLoading, mutate } = useSWR<MailWatchTestTaskOut[]>("/mailwatch/test-tasks");
  return (
    <Panel className="space-y-3 p-4">
      <PanelHead
        title="Test tasks"
        hint={data ? `${data.length} kept` : undefined}
      />
      <InlineNotice tone="warn">
        Each task is created in the list chosen in the Teams panel above — the Proposals Test list unless changed.
      </InlineNotice>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={4} />
      ) : !data?.length ? (
        <Empty
          icon={FlaskConical}
          title="No test tasks yet"
          body="Switch on “Assign each new tender”, or open a new-tender mail and choose Assign now."
        />
      ) : (
        <ul className="divide-y divide-line">
          {data.map((t) => (
            <TestTaskRow key={t.id} task={t} onRemoved={() => mutate()} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TestTaskRow({ task, onRemoved }: { task: MailWatchTestTaskOut; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const remove = useAction(async () => {
    await api.del(`/mailwatch/test-tasks/${task.id}`);
    onRemoved();
  });
  const post = useAction(async () => {
    await api.post(`/mailwatch/mails/${task.mail_id}/teams`);
    onRemoved();
  });
  const found = task.action === "match_found";
  // A match found is shown as a stage change is: it follows the earlier task.
  const staged = task.action === "stage_change" || found;
  return (
    <li className="space-y-1.5 py-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="warn">Testing</Badge>
        <Badge tone={staged ? "info" : "positive"}>
          {found
            ? "New task · match found"
            : staged
              ? `${(task.previous_stage ?? "?").toUpperCase()} → ${task.current_type ?? ""}`
              : "New task"}
        </Badge>
        {task.current_type && <Badge>{task.current_type}</Badge>}
        <span className="font-medium">{task.title}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-ink-3">
        <span>
          Assigned to <b className="text-ink">{task.assigned_to_name ?? "—"}</b>
        </span>
        <span>{task.assign_reason}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
        {task.list_item_url ? (
          <a
            href={task.list_item_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent"
          >
            <ExternalLink size={13} />
            {task.list_item_url.includes("/sites/Test/") ? "Proposals Test" : "Proposals"} item {task.list_item_id}
          </a>
        ) : task.list_error ? (
          <span className="text-danger">Not created in the list: {task.list_error}</span>
        ) : (
          <span className="text-ink-4">Kept here only — not in any list</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-ink-4">
        <span>{task.end_user ?? "—"}</span>
        <span>Made {relative(task.created_at)}</span>
        <span>
          {task.teams_posted_at
            ? `Card posted ${uaeDateTime(task.teams_posted_at)}`
            : task.teams_error
              ? `Card not posted: ${task.teams_error}`
              : "Card not posted yet"}
        </span>
        <button className="inline-flex items-center gap-1 text-accent" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {open ? "Hide fields" : "Fields it would send"}
        </button>
        <Button size="sm" variant="outline" icon={Send} loading={post.pending} onClick={() => post.run()}>
          {task.teams_posted_at ? "Post card again" : "Post card"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          loading={remove.pending}
          onClick={() => {
            if (window.confirm("Remove this test task? Its item is deleted from the Proposals Test list; an item in the real list stays. Its mail can then be assigned again.")) remove.run();
          }}
        >
          Remove
        </Button>
      </div>
      {[remove, post].map(
        (a, i) => a.error && <InlineNotice key={i} tone="danger">{a.error}</InlineNotice>,
      )}
      {open && (
        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="space-y-1 rounded-md bg-panel-2 p-2">
            {Object.entries(task.fields).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-36 shrink-0 font-mono text-[11.5px] text-ink-4">{k}</dt>
                <dd className="min-w-0 break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {staged ? (
            <div className="rounded-md bg-panel-2 p-2 text-ink-3">
              Follows <b className="text-ink">{task.previous_title ?? "the earlier task"}</b> (
              {(task.previous_stage ?? "").toUpperCase()}), item {task.previous_item_id ?? "—"}.
            </div>
          ) : (
            <ol className="space-y-1 rounded-md bg-panel-2 p-2">
              {task.standing.map((p) => (
                <li key={p.rank} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={p.rank === 1 ? "font-semibold text-positive" : "text-ink-4"}>#{p.rank}</span>
                  <span className={p.rank === 1 ? "font-medium" : ""}>{p.name ?? "—"}</span>
                  {(p.labels ?? []).map((l) => (
                    <Badge key={l}>{l}</Badge>
                  ))}
                  <span className="ml-auto text-right text-ink-4">
                    {p.active} active · {p.open} open
                    <br />
                    Capacity {p.capacity ?? "—"} · {p.limit != null ? `Limit ${p.limit} open` : "No limit"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
