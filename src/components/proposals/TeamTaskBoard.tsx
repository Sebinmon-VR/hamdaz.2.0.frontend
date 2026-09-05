"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ListChecks,
  Users,
  UserX,
} from "lucide-react";
import { dateShort, isoDay, num, truncate } from "@/lib/format";
import type { ColumnOut, MemberTasksOut, TaskOut, TeamTasksOut } from "@/lib/types";
import {
  Avatar,
  Badge,
  Panel,
  PanelHead,
  RampBar,
  Stat,
} from "@/components/ui/primitives";
import { Button, PillRail, SearchInput, Select } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";
import { DueChip } from "@/components/widgets";
import {
  classify,
  TaskDetail,
  TaskFacts,
  type Kind,
} from "@/components/proposals/TaskList";

/**
 * A team's proposal work, by person, with every row openable.
 *
 * The aggregate that used to be the whole of this screen answered "who is
 * carrying how much" and stopped there — a lead could see that somebody had
 * eleven live bids and had no way to find out which. This is the same shape
 * with the rows attached underneath, so the number and the thing it counts are
 * one click apart rather than in two different systems.
 *
 * One filter rail governs the whole board rather than one per person. A lead
 * asking "what is due this week" means across the team; making them set the
 * same filter eight times, once per card, would be asking them to do the join
 * the screen exists to do.
 *
 * Rows stay read-only here exactly as they are on *My tasks*: SharePoint is
 * the system of record and the backend only reads it. Every row offers the way
 * out to the real item rather than pretending a lead can edit somebody's work
 * from a summary screen.
 */

type Filter = "all" | "live" | "due_soon" | "overdue" | "closed" | "done";

/**
 * How the same filtered rows are laid out.
 *
 * One set of rows, three questions. *By person* answers "who is carrying what",
 * which is the reason a lead opens the screen. *Split* answers "walk me through
 * them" — a list beside the detail, so triaging forty rows is not forty modals
 * opened and closed. *Calendar* answers "what lands when", which neither of the
 * other two can show because both sort by deadline without ever showing the
 * gaps between them.
 */
type View = "people" | "split" | "calendar";

/** A task with the two things every view of it needs worked out once. */
interface Row {
  task: TaskOut;
  days: number | null;
  kind: Kind;
}

/** The same row, carrying who holds it — what the flat views work from. */
type OwnedRow = Row & { member: MemberTasksOut };

function daysUntil(raw: string | null): number | null {
  if (!raw) return null;
  const days = Math.round(
    (new Date(raw).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  return Number.isNaN(days) ? null : days;
}

/** Members whose team role is worth showing beside their name. */
const ROLE_LABEL: Record<string, string> = {
  team_lead: "Lead",
  team_manager: "Manager",
  approver: "Approver",
};

export function TeamTaskBoard({
  data,
  includeFinished,
  onIncludeFinished,
  loadingFinished,
}: {
  data: TeamTasksOut;
  /** Whether the finished rows have been asked for yet. */
  includeFinished: boolean;
  /** Ask the page to fetch them. Called when a filter needs rows it lacks. */
  onIncludeFinished: () => void;
  loadingFinished: boolean;
}) {
  const [view, setView] = useState<View>("people");
  const [filter, setFilter] = useState<Filter>("live");
  const [status, setStatus] = useState("any");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<TaskOut | null>(null);

  // The real choice list from SharePoint rather than whatever happens to
  // appear in this team's rows — a status nobody here currently holds is still
  // a status worth being able to filter to. Deduped by SWR with the identical
  // call on My tasks, so opening both costs one request.
  const columns = useSWR<ColumnOut[]>("/proposals/columns", {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
    shouldRetryOnError: false,
  });
  const statuses =
    columns.data?.find((c) => c.name === "Status" || c.display_name === "Status")?.choices ?? [];

  const soonDays = data.soon_days;

  // Classified once for the whole board. The counts on the filter rail and the
  // rows inside every card are then the same objects, so a pill saying "4" and
  // a card showing three cannot happen.
  const byMember = useMemo(() => {
    return data.members.map((member) => {
      const rows: Row[] = member.tasks
        .map((task) => {
          const days = daysUntil(task.deadline ?? task.due_date);
          return { task, days, kind: classify(task, days, soonDays) };
        })
        // No deadline sorts last, and a closed bid after everything live: it is
        // the least urgent thing on the list however old it is.
        .sort((a, b) => {
          const parked = Number(a.kind === "closed") - Number(b.kind === "closed");
          if (parked !== 0) return parked;
          return (a.days ?? Infinity) - (b.days ?? Infinity);
        });
      const counts = { live: 0, due: 0, overdue: 0, closed: 0, done: 0 };
      for (const row of rows) counts[row.kind] += 1;
      return { member, rows, counts };
    });
  }, [data.members, soonDays]);

  /**
   * The team's totals, summed from the rows on screen rather than read from
   * `active_count` and friends on the response.
   *
   * Both are right, and that was the problem: the server decides "live" from
   * its own reading of a deadline and the filter rail decides it from
   * `classify` here, so the headline said 10 while the Live pill said 11 and
   * neither was wrong. A screen that disagrees with itself is not trusted on
   * any of its numbers, so everything visible now comes from one count of one
   * set of rows. Only `total` — everything ever assigned, including the
   * finished rows this screen never fetches — still comes from the server.
   */
  const totals = useMemo(() => {
    const sum = { live: 0, due: 0, overdue: 0, closed: 0, done: 0 };
    for (const { counts } of byMember) {
      for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] += counts[key];
    }
    return sum;
  }, [byMember]);

  const counts = useMemo(
    () => ({
      // From the server, so both are right before the finished rows land —
      // and stay right after. A pill that reads 0 until you click it teaches
      // people the number is meaningless.
      all: data.total,
      done: data.total - data.open_count,
      // "Live" is everything not finished whose bid has not closed — the due
      // and overdue rows are part of it, not alternatives to it.
      live: totals.live + totals.due + totals.overdue,
      due_soon: totals.due,
      overdue: totals.overdue,
      closed: totals.closed,
    }),
    [data.total, data.open_count, totals],
  );

  /** Filters that cannot be answered from the open rows alone. */
  const needsFinished = (next: Filter) => next === "done" || next === "all";

  function choose(next: Filter) {
    setFilter(next);
    if (!includeFinished && needsFinished(next)) onIncludeFinished();
  }

  // Only while a filter is showing rows it has not received yet.
  const awaiting = !includeFinished && needsFinished(filter);

  const needle = search.trim().toLowerCase();
  // A search or a status is the viewer looking for something in particular, so
  // people it cannot be are dropped. The urgency pills are not: "who has
  // nothing due this week" is a real answer and needs the empty cards to say
  // it.
  const narrowing = needle !== "" || status !== "any";

  const shown = useMemo(() => {
    const matches = ({ task, kind }: Row) => {
      if (filter === "live" && !(kind === "live" || kind === "due" || kind === "overdue")) {
        return false;
      }
      if (filter === "due_soon" && kind !== "due") return false;
      if (filter === "overdue" && kind !== "overdue") return false;
      if (filter === "closed" && kind !== "closed") return false;
      if (filter === "done" && kind !== "done") return false;
      if (status !== "any" && task.status !== status) return false;
      if (!needle) return true;
      return [task.title, task.end_user, task.quote_no, task.status]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    };

    return byMember
      .map(({ member, rows, counts }) => ({ member, rows: rows.filter(matches), counts }))
      .filter(({ rows }) => !narrowing || rows.length > 0);
  }, [byMember, filter, status, needle, narrowing]);

  /** Every filtered row with its owner, soonest deadline first. */
  const flat = useMemo(
    () =>
      shown
        .flatMap(({ member, rows }) => rows.map((row) => ({ ...row, member })))
        .sort((a, b) => {
          const parked = Number(a.kind === "closed") - Number(b.kind === "closed");
          if (parked !== 0) return parked;
          return (a.days ?? Infinity) - (b.days ?? Infinity);
        }),
    [shown],
  );

  // While narrowing, everything left is a hit and hiding it behind a chevron
  // would make the viewer open each card to find what they searched for.
  const isOpen = (id: string) => narrowing || expanded.has(id);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtering = filter !== "all" || narrowing;
  const allOpen = shown.length > 0 && shown.every(({ member }) => isOpen(member.user_id));

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
        <Stat value={num(counts.live)} label="live across the team" />
        <Stat
          value={num(counts.due_soon)}
          label={`due within ${soonDays} days`}
          tone="warn"
        />
        {/* Not "overdue": the backend means the bid closing date has passed,
            which on this list is an archive rather than late work. Calling it
            late put every team permanently in the red. */}
        <Stat value={num(counts.closed)} label="bids since closed" />
        <Stat value={num(data.member_count)} label="people in this team" />
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={view}
          onChange={setView}
          options={[
            { value: "people", label: "By person", icon: Users },
            { value: "split", label: "Split", icon: Columns2 },
            { value: "calendar", label: "Calendar", icon: CalendarRange },
          ]}
        />
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
        {view === "people" && shown.length > 0 && !narrowing && (
          <Button
            size="sm"
            icon={allOpen ? ChevronDown : ChevronRight}
            onClick={() =>
              setExpanded(
                allOpen ? new Set() : new Set(shown.map(({ member }) => member.user_id)),
              )
            }
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}
        <PillRail
          value={filter}
          onChange={choose}
          options={[
            { value: "live", label: "Live", count: counts.live },
            { value: "due_soon", label: `Next ${soonDays} days`, count: counts.due_soon },
            { value: "overdue", label: "Overdue", count: counts.overdue },
            { value: "closed", label: "Bid closed", count: counts.closed },
            { value: "done", label: "Finished", count: counts.done },
            { value: "all", label: "Everything", count: counts.all },
          ]}
        />
      </div>

      {awaiting && (
        <p className="text-[12px] text-ink-4">
          {loadingFinished
            ? `Fetching the ${num(counts.done)} finished rows…`
            : `The ${num(counts.done)} finished rows are still loading.`}
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          icon={ListChecks}
          title="Nothing here"
          body={
            narrowing
              ? "Nobody in this team has a task matching that search under this filter."
              : "No task in this team falls into this filter."
          }
        />
      ) : view === "split" ? (
        <SplitView rows={flat} />
      ) : view === "calendar" ? (
        <CalendarView rows={flat} soonDays={soonDays} onOpenTask={setOpen} />
      ) : (
        <ul className="space-y-2">
          {shown.map(({ member, rows, counts: carrying }) => (
            <li key={member.user_id}>
              <MemberCard
                member={member}
                rows={rows}
                carrying={carrying}
                filtering={filtering}
                includeFinished={includeFinished}
                soonDays={soonDays}
                open={isOpen(member.user_id)}
                // Toggling while narrowing would fight the auto-expand above
                // and read as a broken chevron, so the card hides it instead.
                onToggle={narrowing ? undefined : () => toggle(member.user_id)}
                onOpenTask={setOpen}
              />
            </li>
          ))}
        </ul>
      )}

      <TaskDetail task={open} onClose={() => setOpen(null)} quotable={false} />
    </div>
  );
}

function MemberCard({
  member,
  rows,
  carrying,
  filtering,
  includeFinished,
  soonDays,
  open,
  onToggle,
  onOpenTask,
}: {
  member: MemberTasksOut;
  /** Their rows under the current filter. */
  rows: Row[];
  /** Their counts across every row they hold, whatever the filter says. */
  carrying: Record<Kind, number>;
  /** Whether any filter is narrowing the board at all. */
  filtering: boolean;
  /** Whether the finished rows have been fetched — changes the denominator. */
  includeFinished: boolean;
  soonDays: number;
  open: boolean;
  onToggle?: () => void;
  onOpenTask: (task: TaskOut) => void;
}) {
  const roles = member.role_keys.map((key) => ROLE_LABEL[key]).filter(Boolean);

  // Drawn from the rows on screen rather than from the member's own totals,
  // because the totals count everything assigned and the bar sits above a
  // filtered list. A bar disagreeing with the rows under it is worse than no
  // bar at all.
  const buckets = rows.reduce(
    (acc, row) => {
      if (row.kind === "due") acc.due += 1;
      else if (row.kind === "overdue") acc.overdue += 1;
      else if (row.kind === "live") acc.live += 1;
      return acc;
    },
    { live: 0, due: 0, overdue: 0 },
  );

  return (
    <Panel className={clsx("overflow-hidden", filtering && rows.length === 0 && "opacity-55")}>
      <div
        className={clsx(
          "flex flex-wrap items-center gap-4 px-4 py-3",
          onToggle && "cursor-pointer transition hover:bg-panel-2",
        )}
        onClick={onToggle}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        aria-expanded={onToggle ? open : undefined}
        onKeyDown={
          onToggle
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        {onToggle && (
          <ChevronRight
            className={clsx("size-4 shrink-0 text-ink-4 transition", open && "rotate-90")}
            aria-hidden
          />
        )}
        <Avatar name={member.name} seed={member.email} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[14px] font-medium">
            {member.name}
            {roles.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
          </p>
          <p className="truncate text-[11.5px] text-ink-4">{member.email}</p>
        </div>

        {/* What they are carrying, and it deliberately does not move as the
            filter changes — "how loaded is this person" is not a question the
            filter is asking. Counted here rather than read from the response
            so it agrees with the pills above; see `totals`. The chip beside it
            is what answers the filter. */}
        <div className="flex items-center gap-5 text-[13px]">
          <span className="tnum" title="Not finished and the bid is still open">
            <strong>{carrying.live + carrying.due + carrying.overdue}</strong>{" "}
            <span className="text-ink-4">live</span>
          </span>
          {carrying.due > 0 && <span className="tnum text-warn">{carrying.due} soon</span>}
          {/* Not "overdue": the bid closing date has passed, which on this
              list is an archive rather than late work. Calling it late put
              every person permanently in the red. */}
          {carrying.closed > 0 && (
            <span
              className="tnum text-ink-4"
              title="Not finished, but the bid closed. Counted, not chased."
            >
              {carrying.closed} closed
            </span>
          )}
        </div>

        {/* The filter's effect, made visible without opening the card. Without
            this, choosing "Bid closed" changed nothing on screen — every card
            was shut, so the only thing the pills moved was a hidden list. */}
        {filtering && (
          <Badge tone={rows.length === 0 ? "neutral" : "accent"}>
            {rows.length === 0 ? "none match" : `${rows.length} match`}
          </Badge>
        )}

        <div className="w-full sm:w-40">
          <RampBar
            height={22}
            showValues={false}
            segments={[
              { value: buckets.live, label: "Live" },
              { value: buckets.due, label: `Due within ${soonDays} days` },
              { value: buckets.overdue, label: "Overdue" },
            ]}
          />
        </div>

        <span className="tnum w-20 shrink-0 text-right text-[12.5px] text-ink-3">
          {member.next_deadline ? dateShort(member.next_deadline) : "—"}
        </span>
      </div>

      {open && (
        <div className="border-t border-line px-4 py-3">
          {!member.in_sharepoint ? (
            <Empty
              icon={UserX}
              title="Not on the Proposals list"
              body={`Nothing in SharePoint is assigned to ${member.email}, so nothing could ever appear here. If that is wrong, whoever maintains the Proposals list needs to add them to it.`}
            />
          ) : rows.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-3">
              Nothing of theirs falls into this filter.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(({ task }) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="flex w-full flex-wrap items-center gap-3 rounded-xl bg-inset px-3 py-2 text-left transition hover:bg-panel-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{task.title}</p>
                      <p className="truncate text-[11.5px] text-ink-4">
                        {[task.end_user, task.quote_no].filter(Boolean).join(" · ") ||
                          "No end user recorded"}
                      </p>
                    </div>
                    {task.status && <Badge>{task.status}</Badge>}
                    {task.priority && (
                      <Badge tone={/high|urgent/i.test(task.priority) ? "danger" : "neutral"}>
                        {task.priority}
                      </Badge>
                    )}
                    <DueChip due={task.deadline ?? task.due_date} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* "4 of 58" read as though 54 rows were being withheld by the
              filter. Until the finished rows are fetched they genuinely are
              not here, so the denominator is the open count and the rest is
              named separately rather than folded into one misleading ratio. */}
          <p className="mt-3 text-[11.5px] text-ink-4">
            Showing {rows.length} of {includeFinished ? member.total : member.open_count}
            {includeFinished
              ? " assigned to them"
              : member.total > member.open_count
                ? ` open · ${member.total - member.open_count} finished not loaded`
                : " open"}{" "}
            ·{" "}
            <Link href={`/admin/users/${member.user_id}`} className="underline">
              their profile
            </Link>
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ── split ───────────────────────────────────────────────────────────── */

/**
 * The list beside the record, still grouped by person.
 *
 * The per-person view opens a task in a modal, which is right when the answer
 * is one task and wrong when the job is triage: forty rows meant forty modals
 * opened, read and dismissed, with no way to compare the one just read against
 * the next. Here the list stays put and only the right-hand pane changes.
 *
 * The grouping is kept because losing it lost the thing this screen is for. A
 * flat deadline order answers "what is next" but not "whose", and "whose" is
 * the question a lead brought to the page — so the headings stay, and within
 * each person the rows keep their deadline order.
 *
 * The pane sticks to the viewport rather than to the top of the list, because
 * the list is what scrolls and a detail that scrolls away with it is a detail
 * nobody reads past the tenth row.
 */
function SplitView({ rows }: { rows: OwnedRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Grouped in the order people first appear, which is the board's own order:
  // busiest on live work first. Re-sorting here would disagree with the view
  // the reader just switched away from.
  const groups = useMemo(() => {
    const out: { member: MemberTasksOut; rows: OwnedRow[] }[] = [];
    const index = new Map<string, number>();
    for (const row of rows) {
      const at = index.get(row.member.user_id);
      if (at === undefined) {
        index.set(row.member.user_id, out.length);
        out.push({ member: row.member, rows: [row] });
      } else {
        out[at].rows.push(row);
      }
    }
    return out;
  }, [rows]);

  // Looked up rather than held: the rows are rebuilt whenever a filter changes,
  // and a stored copy would keep showing a task the filter has just excluded.
  const selected = rows.find((r) => r.task.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
        {groups.map(({ member, rows: theirs }) => (
          <div key={member.user_id}>
            <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-panel/95 px-1 py-1.5 backdrop-blur">
              <Avatar name={member.name} seed={member.email} size="xs" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                {member.name}
              </span>
              <span className="tnum text-[11px] text-ink-4">{theirs.length}</span>
            </div>

            <ul className="mt-1 space-y-1.5">
              {theirs.map(({ task, kind }) => {
                const active = selected?.task.id === task.id;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      className={clsx(
                        "w-full rounded-xl px-3 py-2 text-left transition",
                        active ? "bg-accent text-accent-ink" : "bg-inset hover:bg-panel-3",
                      )}
                    >
                      <p className="truncate text-[13px] font-medium">{task.title}</p>
                      <p
                        className={clsx(
                          "mt-0.5 truncate text-[11.5px]",
                          active ? "opacity-75" : "text-ink-4",
                        )}
                      >
                        {task.end_user ?? "No end user recorded"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <DueChip due={task.deadline ?? task.due_date} />
                        {kind === "closed" && (
                          <span
                            className={clsx(
                              "text-[11px]",
                              active ? "opacity-75" : "text-ink-4",
                            )}
                          >
                            parked
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Panel className="h-fit p-5 lg:sticky lg:top-4">
        {selected ? (
          <>
            <PanelHead
              title={truncate(selected.task.title, 70)}
              hint={`Carried by ${selected.member.name}`}
            />
            <div className="mt-4">
              <TaskFacts task={selected.task} />
            </div>
          </>
        ) : (
          <Empty title="Nothing selected" body="Pick a task from the list." />
        )}
      </Panel>
    </div>
  );
}

/* ── calendar ────────────────────────────────────────────────────────── */

/** Monday first. The UAE weekend is Saturday and Sunday, so they end the row. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Chips drawn in a cell before the rest become a "+n more". */
const PER_CELL = 3;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The Monday on or before a date — where the first row of the grid begins. */
function weekStart(date: Date): Date {
  const d = new Date(date);
  // getDay is Sunday-first; shift so Monday is 0 and Sunday is 6.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * A month, as a month.
 *
 * Keyed on `deadline` — the bid closing date falling back to the due date, the
 * same date every other view sorts by.
 *
 * A grid rather than a list of days, because the shape of a month is the point:
 * "everything closes in one week and then nothing for three" is visible at a
 * glance here and invisible in a sorted list, where those rows sit adjacent to
 * the quiet ones and read identically.
 *
 * Days from the neighbouring months are drawn rather than left blank, so the
 * weeks are whole and a bid closing on the 1st does not appear to have no
 * run-up. They are dimmed, and they still show their bids — hiding a task
 * because the grid happens to start on the 3rd would be losing work to a
 * layout decision.
 */
function CalendarView({
  rows,
  soonDays,
  onOpenTask,
}: {
  rows: OwnedRow[];
  soonDays: number;
  onOpenTask: (task: TaskOut) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const month = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }, [offset]);

  const byDay = useMemo(() => {
    const map = new Map<string, OwnedRow[]>();
    for (const row of rows) {
      const raw = row.task.deadline ?? row.task.due_date;
      if (!raw) continue;
      const key = isoDay(new Date(raw));
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [rows]);

  const weeks = useMemo(() => {
    const first = weekStart(startOfMonth(month));
    const out: { day: string; inMonth: boolean; rows: OwnedRow[] }[][] = [];
    const cursor = new Date(first);
    // Six rows always: a month that needs five would otherwise change height
    // as you page through, which makes the whole panel jump.
    for (let w = 0; w < 6; w++) {
      const week: { day: string; inMonth: boolean; rows: OwnedRow[] }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = isoDay(cursor);
        week.push({
          day: key,
          inMonth: cursor.getMonth() === month.getMonth(),
          rows: byDay.get(key) ?? [],
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(week);
    }
    return out;
  }, [month, byDay]);

  const today = isoDay(new Date());

  // Counted off the cells actually drawn, not off a month. The grid runs from
  // the Monday before the 1st to the Sunday after the last, so "this month"
  // would have quietly excluded the spill days it is showing — a hint that
  // disagrees with the thing underneath it is worse than no hint.
  const inGrid = weeks.flat().reduce((n, cell) => n + cell.rows.length, 0);
  const undated = rows.filter((r) => !(r.task.deadline ?? r.task.due_date)).length;
  const outside = rows.length - inGrid;

  return (
    <Panel className="p-4">
      <PanelHead
        title={new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
        }).format(month)}
        hint={`${inGrid} ${inGrid === 1 ? "bid closes" : "bids close"} in view`}
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon={ChevronLeft} onClick={() => setOffset((o) => o - 1)}>
              Prev
            </Button>
            {offset !== 0 && (
              <Button size="sm" onClick={() => setOffset(0)}>
                Today
              </Button>
            )}
            <Button size="sm" onClick={() => setOffset((o) => o + 1)}>
              Next
            </Button>
          </div>
        }
      />

      {outside > 0 && (
        <p className="mt-3 text-[11.5px] text-ink-4">
          {outside} not in this month
          {undated > 0 ? `, ${undated} of them with no date at all` : ""} — page through, or
          use another view to see them.
        </p>
      )}

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <div key={label} className="pb-1 text-center micro text-ink-4">
            {label}
          </div>
        ))}

        {weeks.flat().map(({ day, inMonth, rows: dayRows }) => {
          const isToday = day === today;
          const days = Math.round(
            (new Date(day).getTime() - new Date(today).getTime()) / 86_400_000,
          );
          const pressing = dayRows.length > 0 && days >= 0 && days <= soonDays;
          const open = expandedDay === day;
          const visible = open ? dayRows : dayRows.slice(0, PER_CELL);

          return (
            <div
              key={day}
              className={clsx(
                "min-h-24 rounded-xl p-1.5 transition",
                pressing ? "bg-warn-soft" : dayRows.length > 0 ? "bg-inset" : "bg-panel-2/40",
                !inMonth && "opacity-45",
                isToday && "ring-1 ring-accent",
              )}
            >
              <div className="flex items-baseline justify-between px-0.5">
                <span
                  className={clsx(
                    "tnum text-[11.5px]",
                    isToday ? "font-bold text-accent-text" : "font-medium text-ink-3",
                  )}
                >
                  {new Date(day).getDate()}
                </span>
                {dayRows.length > 0 && (
                  <span className="tnum text-[10px] text-ink-4">{dayRows.length}</span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {visible.map(({ task, member }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    title={`${task.title} — ${member.name}`}
                    className="flex w-full items-center gap-1 rounded-md bg-panel px-1 py-0.5 text-left transition hover:bg-panel-3"
                  >
                    <Avatar name={member.name} seed={member.email} size="xs" className="size-4 text-[7px]" />
                    <span className="truncate text-[10.5px] leading-tight">{task.title}</span>
                  </button>
                ))}

                {dayRows.length > PER_CELL && (
                  <button
                    type="button"
                    onClick={() => setExpandedDay(open ? null : day)}
                    className="w-full rounded-md px-1 text-left text-[10px] text-ink-4 underline hover:text-ink-2"
                  >
                    {open ? "show less" : `+${dayRows.length - PER_CELL} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
