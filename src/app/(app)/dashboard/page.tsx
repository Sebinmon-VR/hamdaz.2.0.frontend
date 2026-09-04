"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowUpRight,
  CalendarPlus,
  ExternalLink,
  ListChecks,
  Plane,
  RefreshCw,
  Users,
} from "lucide-react";
import { withQuery } from "@/lib/api";
import { date as fmtDate, daysAway, isoDay, num, truncate } from "@/lib/format";
import { useProgressive } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  CalendarOut,
  DashboardOut,
  LeaveSummaryOut,
  MyTasksOut,
  TaskOut,
} from "@/lib/types";
import {
  Avatar,
  AvatarStack,
  Badge,
  Figure,
  HeroPanel,
  Panel,
  PageHead,
  RampBar,
  SolidBadge,
  rampAt,
} from "@/components/ui/primitives";
import { CircleGroup, LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import { NoWidgets, Widget, WidgetGrid } from "@/components/widgets";
import { OrgWorkload } from "@/components/proposals/OrgWorkload";

/**
 * Overview.
 *
 * There is no personal dashboard on the backend — dashboards belong to teams.
 * So this is a hero panel assembled from the viewer's own leave and proposal
 * figures, the slab holding what needs them, and then each of their teams'
 * dashboards in turn. That matches how the data actually works rather than
 * inventing an aggregate the backend cannot supply.
 */
export default function DashboardPage() {
  const session = useSession();
  const today = isoDay(new Date());
  const [picked, setPicked] = useState<string | null>(null);

  // Renders from Postgres immediately, then fills in the Entra- and
  // SharePoint-backed widgets once those answer.
  const dashboards = useProgressive<DashboardOut[]>("/dashboards/me");
  const leave = useSWR<LeaveSummaryOut>(session.can("leave") ? "/leave/summary/me" : null);
  const offToday = useSWR<CalendarOut>(
    session.can("leave") ? withQuery("/leave/calendar", { start: today, days: 1 }) : null,
  );
  // The slowest call in the app — it sweeps the SharePoint list. It lives on
  // this screen alone rather than in the shell, so opening any other page does
  // not wait behind it.
  // open_only=false so `tasks` carries the closed ones too. `total` counts
  // everything assigned either way, but the closed rows are what let this
  // screen show "12 of 47" rather than just "12".
  const tasks = useSWR<MyTasksOut>(
    session.can("proposals", "my_tasks")
      ? withQuery("/proposals/my-tasks", { open_only: false, limit: 500 })
      : null,
    { dedupingInterval: 120_000 },
  );

  const firstName = session.user.display_name.split(" ")[0];
  const away = offToday.data?.days?.[today] ?? [];
  // Only the open rows are bucketed — a completed task has no urgency left.
  const open = useMemo(
    () => bucket((tasks.data?.tasks ?? []).filter((t) => t.is_open)),
    [tasks.data],
  );
  const assigned = tasks.data?.total ?? 0;
  const closed = Math.max(0, assigned - (tasks.data?.open_count ?? 0));
  const selected = open.sorted.find((t) => t.id === picked) ?? open.sorted[0];

  return (
    <>
      <PageHead
        eyebrow={fmtDate(today)}
        title={`Good morning, ${firstName}`}
        faces={
          away.length > 0 && (
            <span className="lift flex h-10 items-center gap-2.5 rounded-full bg-panel py-1 pl-1 pr-4 text-[12px] text-ink-2">
              <AvatarStack
                people={away.map((p) => ({ name: p.name, id: p.user_id }))}
                size="sm"
                max={3}
              />
              <Plane className="size-3.5 text-ink-4" strokeWidth={2} />
              {away.length === 1 ? `${away[0].name} is off` : `${away.length} off today`}
            </span>
          )
        }
        actions={
          <>
            <CircleGroup
              actions={[
                {
                  icon: RefreshCw,
                  label: "Reload these figures",
                  busy:
                    tasks.isValidating || leave.isValidating || dashboards.isValidating,
                  onClick: () => {
                    tasks.mutate();
                    leave.mutate();
                    offToday.mutate();
                    dashboards.mutate();
                  },
                },
                { icon: ListChecks, label: "My proposals", href: "/proposals/my-tasks" },
                { icon: Users, label: "Teams", href: "/teams" },
              ]}
            />
            {session.can("leave") && (
              <LinkButton href="/leave/request" variant="accent" size="lg" icon={CalendarPlus}>
                Request leave
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.58fr_1fr]">
        <HeroPanel className="p-7">
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            {session.can("proposals", "my_tasks") && (
              <>
                <Figure
                  label="Proposal tasks assigned"
                  value={num(assigned)}
                  sub={
                    tasks.data && !tasks.data.in_sharepoint
                      ? "not on the list"
                      : `${num(closed)} closed`
                  }
                />
                <Figure
                  label="Live right now"
                  value={num(open.total)}
                  sub={
                    open.closed > 0
                      ? `${num(open.closed)} bids since closed`
                      : "nothing parked"
                  }
                />
              </>
            )}
            {open.overdue > 0 && (
              <Figure label="Actually late" value={num(open.overdue)} tone="second" />
            )}
            {leave.data && (
              <Figure
                label="Awaiting a decision"
                value={num(leave.data.pending)}
                sub={leave.data.pending > 0 ? "with HR now" : "nothing outstanding"}
              />
            )}
          </div>

          {/* Everything open, laid on one scale from "no deadline" through to
              "already late". The ramp is the legend; there is nothing else to
              look up. */}
          {open.total > 0 && (
            <div className="mt-8">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[12px] text-ink-3">
                  Live work, by how close it is to late
                </span>
                <Link
                  href="/proposals/my-tasks"
                  className="text-[12px] text-ink-4 transition hover:text-ink"
                >
                  All tasks
                </Link>
              </div>
              <RampBar
                height={40}
                segments={[
                  { value: open.undated, label: "No deadline" },
                  { value: open.later, label: "Later" },
                  { value: open.week, label: "This week" },
                  { value: open.today, label: "Due today" },
                  { value: open.overdue, label: "Overdue" },
                ]}
              />
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {[
                  ["No deadline", open.undated, 0],
                  ["Later", open.later, 0.28],
                  ["This week", open.week, 0.55],
                  ["Today", open.today, 0.8],
                  ["Overdue", open.overdue, 1],
                ].map(([label, value, stop]) => (
                  <span
                    key={label as string}
                    className="flex items-center gap-2 text-[11.5px] text-ink-3"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: rampAt(stop as number) }}
                    />
                    {label as string}
                    <span className="tnum text-ink-4">{value as number}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {session.teams.length === 0 && (
            <p className="mt-8 max-w-xl text-[12.5px] leading-relaxed text-ink-3">
              You do not belong to a team yet, so there is not much here. What you can
              reach comes from the teams you are in — an administrator can add you to one.
            </p>
          )}
        </HeroPanel>

        {/* leave */}
        <Panel className="relative p-7">
          <Link
            href="/leave"
            aria-label="Open my leave"
            className="absolute right-6 top-6 grid size-8 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            <ArrowUpRight className="size-3.5" strokeWidth={2} />
          </Link>

          <Figure
            label="Leave approved this year"
            value={num(leave.data?.days_approved ?? 0)}
            unit="days"
            sub={leave.data ? `${leave.data.approved} requests` : undefined}
          />

          <div className="mt-7 grid grid-cols-3 gap-2.5">
            {[
              { value: num(leave.data?.pending ?? 0), label: "Awaiting HR", lead: true },
              { value: num(session.teams.length), label: "Teams you are in", lead: false },
              { value: num(away.length), label: "People off today", lead: false },
            ].map((tile, i) => (
              <div
                key={tile.label}
                className={clsx(
                  "flex h-28 flex-col justify-between rounded-[20px] p-4",
                  i === 0 ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-2",
                )}
              >
                <span className="fig text-[22px]">{tile.value}</span>
                <span className="text-[11.5px] leading-tight opacity-75">{tile.label}</span>
              </div>
            ))}
          </div>

          <LinkButton
            href="/leave/calendar"
            variant="solid"
            className="mt-5 w-full"
            icon={ExternalLink}
          >
            See who is off
          </LinkButton>
        </Panel>
      </div>

      {/* ── the slab: what needs you ──────────────────────────────── */}
      {session.can("proposals", "my_tasks") && open.sorted.length > 0 && (
        <Panel tone="slab" className="grid gap-5 p-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="min-w-0">
            <div className="flex items-center gap-3 px-2 pb-3.5">
              <span className="text-[16px] font-semibold">Needs you</span>
              {open.overdue > 0 && <SolidBadge tone="second">{open.overdue} late</SolidBadge>}
              {/* The live count, not every row: the parked ones sort last and
                  are not what this panel is for. */}
              <span className="tnum ml-auto text-[12px] text-slab-ink-3">
                {open.total}
              </span>
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {open.sorted.slice(0, 12).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selected?.id === task.id}
                  onSelect={() => setPicked(task.id)}
                />
              ))}
            </div>
          </div>

          {selected && <TaskDetail task={selected} />}
        </Panel>
      )}

      {/* ── every team, for the people who run them ───────────────── */}
      {/* Admin-only, and the backend says so: /proposals/workload is gated
          there and answers 403 to anyone else. This check exists so an
          ordinary user is not shown a panel that would only fail — it is not
          the protection, because nothing running in a browser can be. */}
      {session.roles.is_admin && <OrgWorkload />}

      {/* ── team dashboards ───────────────────────────────────────── */}
      {dashboards.error ? (
        <ErrorState error={dashboards.error} onRetry={() => dashboards.mutate()} />
      ) : dashboards.isLoading ? (
        <WidgetGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sm:col-span-6 xl:col-span-4">
              <PanelSkeleton />
            </div>
          ))}
        </WidgetGrid>
      ) : !dashboards.data || dashboards.data.length === 0 ? (
        <Empty
          title="No team dashboards yet"
          body="Dashboards belong to teams. Once you are in a team that has one configured, it appears here."
        />
      ) : (
        <>
          {dashboards.partial && (
            <p className="px-1 text-[11.5px] text-ink-4">
              Showing what is held locally — the cards that read Entra and SharePoint are
              still on their way.
            </p>
          )}
          {dashboards.data.map((dashboard) => (
          <section key={dashboard.team_id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 px-1 pt-3">
              <h2 className="fig text-[24px]">{dashboard.name}</h2>
              {!dashboard.meta.configured && (
                <Badge tone="neutral">Default widgets — no saved layout</Badge>
              )}
              <Link
                href={`/teams/${dashboard.slug}/dashboard`}
                aria-label={`Open the ${dashboard.name} dashboard`}
                className="grid size-8 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink"
              >
                <ArrowUpRight className="size-3.5" strokeWidth={2} />
              </Link>
            </div>
            {dashboard.widgets.length === 0 ? (
              <NoWidgets slug={dashboard.slug} />
            ) : (
              <WidgetGrid>
                {dashboard.widgets.map((widget) => (
                  <Widget key={widget.key} widget={widget} teamSlug={dashboard.slug} />
                ))}
              </WidgetGrid>
            )}
          </section>
          ))}
        </>
      )}
    </>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: TaskOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const days = daysAway(task.deadline ?? task.due_date);
  const late = days !== null && days < 0;

  return (
    <button
      onClick={onSelect}
      className={clsx(
        "flex h-[58px] w-full items-center gap-3.5 rounded-full px-4 text-left transition",
        selected ? "bg-slab-row ring-[1.5px] ring-[var(--accent)]" : "hover:bg-slab-row",
      )}
    >
      <Avatar
        name={task.end_user ?? task.title}
        seed={task.id}
        size="sm"
        className="size-9"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-semibold">
          {truncate(task.title, 38)}
        </span>
        <span className="truncate text-[11.5px] text-slab-ink-3">
          {task.end_user ?? task.status ?? "No end user"}
        </span>
      </span>
      <span className="ml-auto shrink-0">
        {days === null ? (
          <Badge tone="neutral">No date</Badge>
        ) : late ? (
          <SolidBadge tone="second">{Math.abs(days)}d late</SolidBadge>
        ) : days === 0 ? (
          <SolidBadge tone="accent">Today</SolidBadge>
        ) : (
          <Badge tone="neutral">in {days}d</Badge>
        )}
      </span>
    </button>
  );
}

function TaskDetail({ task }: { task: TaskOut }) {
  const days = daysAway(task.deadline ?? task.due_date);

  return (
    <div className="flex min-w-0 flex-col rounded-[16px] bg-well p-6 text-well-ink">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">Task</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <span className="fig text-[22px]">{truncate(task.title, 40)}</span>
            {days !== null && days < 0 && (
              <SolidBadge tone="second">{Math.abs(days)}d late</SolidBadge>
            )}
          </div>
        </div>
        {task.web_url && (
          <a
            href={task.web_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in SharePoint"
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-well-tile text-well-ink-2 transition hover:text-well-ink"
          >
            <ArrowUpRight className="size-4" strokeWidth={2} />
          </a>
        )}
      </div>

      <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">End user</p>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-[10px] font-extrabold text-accent-ink">
              {(task.end_user ?? "??").slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-[14px] font-semibold">
              {task.end_user ?? "Not recorded"}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">Assigned</p>
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar
              name={task.assigned_to_name ?? "You"}
              seed={task.assigned_to_name ?? task.id}
              size="sm"
              className="size-7"
            />
            <span className="truncate text-[13px] font-medium">
              {task.assigned_to_name ?? "You"}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">Bid closes</p>
          <p className="fig mt-2 text-[20px]">{fmtDate(task.bid_closing_date)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "Status", value: task.status ?? "—" },
          { label: "Priority", value: task.priority ?? "—" },
          { label: "Due", value: fmtDate(task.due_date) },
          { label: "Quote no.", value: task.quote_no ?? "—" },
        ].map((tile) => (
          <div
            key={tile.label}
            className="flex h-[86px] flex-col justify-between rounded-[14px] bg-well-tile p-3.5"
          >
            <span className="truncate text-[15px] font-medium">{tile.value}</span>
            <span className="text-[11px] leading-tight text-well-ink-3">{tile.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-5 rounded-full bg-well-tile py-3.5 pl-6 pr-3.5">
        <div className="min-w-0">
          <p className="text-[10.5px] text-well-ink-3">Submission</p>
          <p className="mt-1 truncate text-[15px] font-medium">
            {task.submission_status ?? "Not started"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <LinkButton href="/proposals/my-tasks" variant="accent" icon={ListChecks}>
            All my tasks
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

/* ── bucketing ───────────────────────────────────────────────────────── */

/**
 * Split open work by how close it is to late — with the closed bids taken out
 * first.
 *
 * A deadline here is the bid closing date before it is anything else, so an
 * open row whose deadline has passed has usually just had its bid close. Those
 * are not late; they are parked. Counting them as overdue meant everybody's
 * dashboard opened on a large red number that no action would ever reduce.
 *
 * `total` is therefore the live count, and `closed` is reported beside it
 * rather than folded into it.
 */
function bucket(tasks: TaskOut[]) {
  const out = { undated: 0, later: 0, week: 0, today: 0, overdue: 0, closed: 0, total: 0 };
  const today = new Date().setHours(0, 0, 0, 0);
  const withDays = tasks.map((task) => ({
    task,
    days: daysAway(task.deadline ?? task.due_date),
    parked:
      task.bid_closing_date !== null &&
      task.bid_closing_date !== undefined &&
      new Date(task.bid_closing_date).setHours(0, 0, 0, 0) < today,
  }));

  for (const { days, parked } of withDays) {
    if (parked) {
      out.closed += 1;
      continue;
    }
    out.total += 1;
    if (days === null) out.undated += 1;
    else if (days < 0) out.overdue += 1;
    else if (days === 0) out.today += 1;
    else if (days <= 7) out.week += 1;
    else out.later += 1;
  }

  // Closest to late first, with the parked rows after everything live — an
  // undated task is not more urgent than a dated one, and a closed bid is not
  // more urgent than either.
  const sorted = withDays
    .sort((a, b) => {
      const parked = Number(a.parked) - Number(b.parked);
      if (parked !== 0) return parked;
      return (a.days ?? Infinity) - (b.days ?? Infinity);
    })
    .map((row) => row.task);

  return { ...out, sorted };
}
