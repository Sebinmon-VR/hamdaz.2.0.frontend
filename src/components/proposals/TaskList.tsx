"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, FileText, Flame, ListChecks } from "lucide-react";
import { date, humanise, truncate } from "@/lib/format";
import type { ColumnOut, TaskOut } from "@/lib/types";
import { Badge, Panel, Meta } from "@/components/ui/primitives";
import { LinkButton, PillRail, SearchInput, Select } from "@/components/ui/controls";
import { Empty, Modal } from "@/components/ui/feedback";
import { DueChip } from "@/components/widgets";
import { AttachmentMark, TaskAttachments } from "@/components/proposals/TaskAttachments";

type Filter = "all" | "live" | "due_soon" | "overdue" | "closed" | "done";

/**
 * What a row actually is.
 *
 * `deadline` leads with the bid closing date, so an open row whose deadline
 * has passed is usually a closed bid rather than late work — and the two need
 * different reactions: one is an archive, the other is a phone call. They are
 * told apart by whether a bid closing date is the thing that passed.
 *
 *   done    finished, whatever its dates
 *   closed  not finished, but the bid closed — parked, not urgent
 *   overdue not finished, no bid closing date, and its due date passed
 *   due     not finished, still open, deadline within `soonDays`
 *   live    not finished, still open, nothing pressing
 */
export type Kind = "done" | "closed" | "overdue" | "due" | "live";

export function classify(task: TaskOut, days: number | null, soonDays: number): Kind {
  if (!task.is_open) return "done";
  if (task.bid_closing_date) {
    const closed =
      new Date(task.bid_closing_date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
    if (closed) return "closed";
  }
  if (days === null) return "live";
  if (days < 0) return "overdue";
  return days <= soonDays ? "due" : "live";
}

/**
 * A list of SharePoint proposal tasks.
 *
 * Ordered by deadline rather than by anything SharePoint returns, because the
 * only question anyone opens this screen with is "what is closest to late".
 *
 * The rows stay read-only: SharePoint is where this work actually happens and
 * the backend is read-only over it, so every row offers the way out to the
 * real item rather than pretending to be editable.
 *
 * Quoting is deliberately a link out rather than a button here. This list has
 * no idea whether an enquiry has already been quoted — that join only exists
 * on the quoting side — so raising one from this screen could silently make a
 * second quote against a bid that already has one. The quoting picker knows,
 * and shows the existing quote instead of offering to duplicate it.
 */
export function TaskList({ tasks, soonDays = 7 }: { tasks: TaskOut[]; soonDays?: number }) {
  const [filter, setFilter] = useState<Filter>("live");
  const [status, setStatus] = useState<string>("any");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<TaskOut | null>(null);

  // The real choice list from SharePoint rather than whatever happens to
  // appear in this person's own rows — a status nobody currently holds is
  // still a status worth being able to filter to.
  const columns = useSWR<ColumnOut[]>("/proposals/columns", {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
    shouldRetryOnError: false,
  });
  const statuses =
    columns.data
      ?.find((c) => c.name === "Status" || c.display_name === "Status")
      ?.choices ?? [];

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
          const clean = Number.isNaN(days as number) ? null : days;
          return { task, days: clean, kind: classify(task, clean, soonDays) };
        })
        // No deadline sorts last: an undated task is not more urgent than a
        // dated one, whatever its position in the list.
        // A closed bid sorts after everything live, however old it is: it is
        // the least urgent thing on the list, not the most.
        .sort((a, b) => {
          const parked = Number(a.kind === "closed") - Number(b.kind === "closed");
          if (parked !== 0) return parked;
          return (a.days ?? Infinity) - (b.days ?? Infinity);
        }),
    [tasks, soonDays],
  );

  const counts = useMemo(() => {
    const by = { done: 0, closed: 0, overdue: 0, due: 0, live: 0 };
    for (const row of withDays) by[row.kind] += 1;
    return {
      all: withDays.length,
      // "Live" is everything not finished whose bid has not closed — the due
      // and overdue rows are part of it, not alternatives to it.
      live: by.live + by.due + by.overdue,
      due_soon: by.due,
      overdue: by.overdue,
      closed: by.closed,
      done: by.done,
    };
  }, [withDays]);

  const needle = search.trim().toLowerCase();
  const rows = withDays.filter(({ task, kind }) => {
    if (filter === "live" && !(kind === "live" || kind === "due" || kind === "overdue")) {
      return false;
    }
    if (filter === "due_soon" && kind !== "due") return false;
    if (filter === "overdue" && kind !== "overdue") return false;
    if (filter === "closed" && kind !== "closed") return false;
    if (filter === "done" && kind !== "done") return false;
    if (status !== "any" && task.status !== status) return false;
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
        {statuses.length > 0 && (
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full max-w-44"
            aria-label="Status"
          >
            <option value="any">Any status</option>
            {statuses.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </Select>
        )}
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "live", label: "Live", count: counts.live },
            { value: "due_soon", label: `Next ${soonDays} days`, count: counts.due_soon },
            // Genuinely late: no bid closing date, and the due date passed.
            // Usually empty, which is the point — it used to hold the whole
            // archive and so meant nothing.
            { value: "overdue", label: "Overdue", count: counts.overdue, icon: Flame },
            { value: "closed", label: "Bid closed", count: counts.closed },
            { value: "done", label: "Finished", count: counts.done },
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
                    <AttachmentMark task={task} />
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

/**
 * Exported because the team board opens the same rows, and a task has to read
 * identically whoever is looking at it. A lead comparing what they see against
 * what the person carrying it sees, and finding two different sets of fields,
 * would have no way to know which one SharePoint actually holds.
 */
export function TaskDetail({
  task,
  onClose,
  /**
   * Whether to offer the way into quoting. False on the team board: the
   * picker raises a quote for whoever is signed in, so offering it on a
   * colleague's row would invite a lead to start a quote against a bid
   * somebody else is carrying, under their own name. Reading somebody's work
   * is what this screen is for; taking it over is not.
   */
  quotable = true,
}: {
  task: TaskOut | null;
  onClose: () => void;
  quotable?: boolean;
}) {
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      width="lg"
      title={task ? truncate(task.title, 80) : "Task"}
      description={
        quotable
          ? "The enquiry as SharePoint holds it. Editing happens there; pricing it happens here."
          : "The enquiry as SharePoint holds it. Read-only — editing happens there."
      }
      footer={
        <>
          {task?.web_url && (
            <a
              href={task.web_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-line px-4 text-[13px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              <ExternalLink className="size-3.5" />
              Open in SharePoint
            </a>
          )}
          {/* Goes to the quoting picker rather than raising from here, so the
              existing quote against this enquiry — if there is one — is seen
              before a second gets made. */}
          {quotable && task?.is_open && (
            <LinkButton href="/quote-requests/new" variant="accent" icon={FileText}>
              Quote this enquiry
            </LinkButton>
          )}
        </>
      }
    >
      {task && <TaskFacts task={task} />}
    </Modal>
  );
}


/**
 * One task's fields, laid out the same wherever they are read.
 *
 * Split out of the modal so the team board's split view can show them in a
 * pane rather than over the top of the list. Sharing the component rather than
 * writing a second layout is the point: a lead comparing what they see against
 * what the person carrying the work sees, and finding two different sets of
 * fields, has no way to know which one SharePoint actually holds.
 */
export function TaskFacts({ task }: { task: TaskOut }) {
  return (
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

          <TaskAttachments task={task} />

          <p className="text-[11.5px] text-ink-4">
            Last changed {date(task.modified_at)} · created {date(task.created_at)} ·{" "}
            {humanise(task.is_open ? "open" : "closed")}
          </p>
        </div>
  );
}
