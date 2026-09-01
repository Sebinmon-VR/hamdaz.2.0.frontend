"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { ExternalLink, Flame, ListChecks } from "lucide-react";
import { date, humanise, truncate } from "@/lib/format";
import type { TaskOut } from "@/lib/types";
import { Badge, Panel, Meta } from "@/components/ui/primitives";
import { PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, Modal } from "@/components/ui/feedback";
import { DueChip } from "@/components/widgets";

type Filter = "all" | "overdue" | "due_soon" | "open" | "done";

/**
 * A list of SharePoint proposal tasks.
 *
 * Ordered by deadline rather than by anything SharePoint returns, because the
 * only question anyone opens this screen with is "what is closest to late".
 * Rows are read-only: SharePoint is where this work actually happens, and the
 * backend is read-only over it — so every row offers the way out to the real
 * item rather than pretending to be editable.
 */
export function TaskList({ tasks, soonDays = 7 }: { tasks: TaskOut[]; soonDays?: number }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<TaskOut | null>(null);

  const withDays = useMemo(
    () =>
      tasks
        .map((task) => {
          const raw = task.deadline ?? task.due_date;
          const days = raw
            ? Math.round(
                (new Date(raw).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
                  86_400_000,
              )
            : null;
          return { task, days: Number.isNaN(days as number) ? null : days };
        })
        // No deadline sorts last: an undated task is not more urgent than a
        // dated one, whatever its position in the list.
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity)),
    [tasks],
  );

  const counts = useMemo(
    () => ({
      all: withDays.length,
      open: withDays.filter((r) => r.task.is_open).length,
      overdue: withDays.filter((r) => r.task.is_open && r.days !== null && r.days < 0).length,
      due_soon: withDays.filter(
        (r) => r.task.is_open && r.days !== null && r.days >= 0 && r.days <= soonDays,
      ).length,
      done: withDays.filter((r) => !r.task.is_open).length,
    }),
    [withDays, soonDays],
  );

  const needle = search.trim().toLowerCase();
  const rows = withDays.filter(({ task, days }) => {
    if (filter === "open" && !task.is_open) return false;
    if (filter === "done" && task.is_open) return false;
    if (filter === "overdue" && !(task.is_open && days !== null && days < 0)) return false;
    if (
      filter === "due_soon" &&
      !(task.is_open && days !== null && days >= 0 && days <= soonDays)
    ) {
      return false;
    }
    if (!needle) return true;
    return [task.title, task.end_user, task.quote_no, task.status, task.assigned_to_name]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search title, end user, quote number"
          className="w-full max-w-sm"
        />
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Open", count: counts.open },
            { value: "overdue", label: "Overdue", count: counts.overdue, icon: Flame },
            { value: "due_soon", label: `Next ${soonDays} days`, count: counts.due_soon },
            { value: "done", label: "Closed", count: counts.done },
            { value: "all", label: "Everything", count: counts.all },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Empty
          icon={ListChecks}
          title="Nothing here"
          body={
            needle
              ? "No task matches that search under this filter."
              : "No tasks fall into this filter."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ task, days }) => {
            const late = task.is_open && days !== null && days < 0;
            return (
              <li key={task.id}>
                <Panel
                  // The most-overdue item is the one the page exists for, and
                  // it is always first after the sort.
                  tone={late && rows[0].task.id === task.id ? "highlight" : "panel"}
                  className="cursor-pointer p-3 transition hover:border-line-strong"
                  onClick={() => setOpen(task)}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{task.title}</p>
                      <p
                        className={clsx(
                          "mt-0.5 truncate text-[12px]",
                          late && rows[0].task.id === task.id ? "opacity-70" : "text-ink-4",
                        )}
                      >
                        {[task.end_user, task.quote_no, task.assigned_to_name]
                          .filter(Boolean)
                          .join(" · ") || "No end user recorded"}
                      </p>
                    </div>
                    {task.status && <Badge>{task.status}</Badge>}
                    {task.priority && (
                      <Badge tone={/high|urgent/i.test(task.priority) ? "danger" : "neutral"}>
                        {task.priority}
                      </Badge>
                    )}
                    <DueChip due={task.deadline ?? task.due_date} />
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <TaskDetail task={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function TaskDetail({ task, onClose }: { task: TaskOut | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      width="lg"
      title={task ? truncate(task.title, 80) : "Task"}
      description="Read-only. SharePoint is where this list is actually maintained."
      footer={
        task?.web_url && (
          <a
            href={task.web_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[13.5px] font-medium text-[var(--c-accent-ink)]"
          >
            <ExternalLink className="size-4" />
            Open in SharePoint
          </a>
        )
      }
    >
      {task && (
        <div className="space-y-5 pb-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Meta label="Status">{task.status ?? "—"}</Meta>
            <Meta label="Priority">{task.priority ?? "—"}</Meta>
            <Meta label="Assigned to">{task.assigned_to_name ?? "—"}</Meta>
            <Meta label="End user">{task.end_user ?? "—"}</Meta>
            <Meta label="Quote no.">{task.quote_no ?? "—"}</Meta>
            <Meta label="Submission">{task.submission_status ?? "—"}</Meta>
            <Meta label="Start">{date(task.start_date)}</Meta>
            <Meta label="Due">{date(task.due_date)}</Meta>
            <Meta label="Bid closes">{date(task.bid_closing_date)}</Meta>
            <Meta label="Type">{task.current_type ?? "—"}</Meta>
            <Meta label="Order status">{task.order_status ?? "—"}</Meta>
            <Meta label="Negotiation">{task.negotiation ?? "—"}</Meta>
          </dl>

          {task.remarks && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
                Remarks
              </p>
              <p className="whitespace-pre-wrap rounded-2xl bg-inset p-4 text-[13px] leading-relaxed">
                {task.remarks}
              </p>
            </div>
          )}
          {task.working_notes && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
                Working notes
              </p>
              <p className="whitespace-pre-wrap rounded-2xl bg-inset p-4 text-[13px] leading-relaxed">
                {task.working_notes}
              </p>
            </div>
          )}

          <p className="text-[11.5px] text-ink-4">
            Last changed {date(task.modified_at)} · created {date(task.created_at)} ·{" "}
            {humanise(task.is_open ? "open" : "closed")}
          </p>
        </div>
      )}
    </Modal>
  );
}
