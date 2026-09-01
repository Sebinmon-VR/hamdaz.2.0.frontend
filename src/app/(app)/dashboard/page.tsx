"use client";

import useSWR from "swr";
import Link from "next/link";
import { CalendarPlus, ListChecks, Plane, RefreshCw, Users } from "lucide-react";
import { withQuery } from "@/lib/api";
import { date as fmtDate, daysAway, isoDay, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type {
  CalendarOut,
  DashboardOut,
  LeaveSummaryOut,
  MyTasksOut,
} from "@/lib/types";
import {
  AvatarStack,
  Badge,
  Figure,
  HeroPanel,
  OpenCorner,
  Panel,
  PanelHead,
  RampBar,
  rampAt,
} from "@/components/ui/primitives";
import { CircleGroup, LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import { NoWidgets, Widget, WidgetGrid } from "@/components/widgets";

/**
 * Overview.
 *
 * There is no personal dashboard on the backend — dashboards belong to teams.
 * So this is two things: one hero panel assembled from the viewer's own leave
 * and proposal figures, then each of their teams' dashboards in turn. That
 * matches how the data actually works rather than inventing an aggregate the
 * backend cannot support.
 */
export default function DashboardPage() {
  const session = useSession();
  const today = isoDay(new Date());

  const dashboards = useSWR<DashboardOut[]>("/dashboards/me");
  const leave = useSWR<LeaveSummaryOut>(session.can("leave") ? "/leave/summary/me" : null);
  const offToday = useSWR<CalendarOut>(
    session.can("leave") ? withQuery("/leave/calendar", { start: today, days: 1 }) : null,
  );
  // The slowest call in the app — it sweeps the SharePoint list. It lives on
  // this screen alone rather than in the shell, so opening any other page does
  // not wait behind it.
  const tasks = useSWR<MyTasksOut>(
    session.can("proposals", "my_tasks")
      ? withQuery("/proposals/my-tasks", { open_only: true, limit: 300 })
      : null,
    { dedupingInterval: 120_000 },
  );

  const firstName = session.user.display_name.split(" ")[0];
  const away = offToday.data?.days?.[today] ?? [];

  // Open tasks bucketed by how close they are to late. Ordered least to most
  // urgent so the pink end of the ramp is the overdue end.
  const buckets = (() => {
    const out = { later: 0, week: 0, today: 0, overdue: 0, undated: 0 };
    for (const task of tasks.data?.tasks ?? []) {
      const days = daysAway(task.deadline ?? task.due_date);
      if (days === null) out.undated += 1;
      else if (days < 0) out.overdue += 1;
      else if (days === 0) out.today += 1;
      else if (days <= 7) out.week += 1;
      else out.later += 1;
    }
    return out;
  })();

  const totalOpen = tasks.data?.open_count ?? 0;

  return (
    <>
      <HeroPanel className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11.5px] text-ink-4">{fmtDate(today)}</p>
            <h1 className="hero-title mt-1 text-[44px] text-ink">{firstName}</h1>
          </div>

          <div className="flex items-center gap-2">
            {away.length > 0 && (
              <span className="flex items-center gap-2 rounded-full bg-panel-2 py-1 pl-1 pr-3.5 text-[12px] text-ink-2">
                <AvatarStack
                  people={away.map((p) => ({ name: p.name, id: p.user_id }))}
                  size="xs"
                  max={4}
                />
                <Plane className="size-3.5 text-ink-4" strokeWidth={2} />
                {away.length === 1 ? `${away[0].name} is off` : `${away.length} off today`}
              </span>
            )}
            <CircleGroup
              actions={[
                {
                  icon: RefreshCw,
                  label: "Reload these figures",
                  busy: tasks.isValidating || leave.isValidating,
                  onClick: () => {
                    tasks.mutate();
                    leave.mutate();
                    offToday.mutate();
                    dashboards.mutate();
                  },
                },
                { icon: ListChecks, label: "My proposal tasks", href: "/proposals/my-tasks" },
                { icon: Users, label: "Teams", href: "/teams" },
              ]}
            />
            {session.can("leave") && (
              <LinkButton href="/leave/request" variant="accent" icon={CalendarPlus}>
                Request leave
              </LinkButton>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-baseline gap-x-12 gap-y-6">
          {session.can("proposals", "my_tasks") && (
            <Figure
              value={num(totalOpen)}
              label="Open proposal tasks"
              sub={
                tasks.data && !tasks.data.in_sharepoint
                  ? "You are not on the list"
                  : buckets.overdue > 0
                    ? `${buckets.overdue} already late`
                    : "None late"
              }
            />
          )}
          {leave.data && (
            <>
              <Figure
                value={num(leave.data.days_approved)}
                unit="d"
                label="Leave approved"
                sub={`${leave.data.approved} requests`}
              />
              <Figure
                value={num(leave.data.pending)}
                label="Awaiting a decision"
                sub={leave.data.pending > 0 ? "With HR now" : "Nothing outstanding"}
              />
            </>
          )}
          <Figure value={num(session.teams.length)} label="Teams" sub="You belong to" />
        </div>

        {/* The one chart on this screen: everything open, laid along a single
            scale from "no deadline" to "already late". */}
        {session.can("proposals", "my_tasks") && totalOpen > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12px] text-ink-3">Open work by how close it is to late</span>
              <Link
                href="/proposals/my-tasks"
                className="text-[12px] text-ink-4 transition hover:text-ink"
              >
                All tasks
              </Link>
            </div>
            <RampBar
              height={44}
              segments={[
                { value: buckets.undated, label: "No deadline" },
                { value: buckets.later, label: "Later than a week" },
                { value: buckets.week, label: "Within a week" },
                { value: buckets.today, label: "Due today" },
                { value: buckets.overdue, label: "Overdue" },
              ]}
            />
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {[
                ["No deadline", buckets.undated, 0],
                ["Later", buckets.later, 0.25],
                ["This week", buckets.week, 0.5],
                ["Today", buckets.today, 0.75],
                ["Overdue", buckets.overdue, 1],
              ].map(([label, value, stop]) => (
                <span
                  key={label as string}
                  className="flex items-center gap-1.5 text-[11.5px] text-ink-4"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: rampAt(stop as number) }}
                  />
                  {label as string}
                  <span className="tnum text-ink-3">{value as number}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {session.teams.length === 0 && (
          <p className="mt-8 max-w-xl text-[12.5px] leading-relaxed text-ink-3">
            You do not belong to a team yet, so there is not much here. What you can reach
            comes from the teams you are in — an administrator can add you to one.
          </p>
        )}
      </HeroPanel>

      {session.teams.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-2 p-2.5">
          <PanelHead title="My teams" count={session.teams.length} className="px-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {session.teams.map(({ team, role_keys }) => (
              <Link
                key={team.id}
                href={`/teams/${team.slug}`}
                className="inline-flex h-8 items-center gap-2 rounded-full bg-panel-2 px-3.5 text-[12.5px] text-ink-2 transition hover:bg-panel-3 hover:text-ink"
              >
                {team.name}
                {role_keys.includes("team_lead") && <Badge tone="highlight">Lead</Badge>}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {dashboards.error ? (
        <ErrorState error={dashboards.error} onRetry={() => dashboards.mutate()} />
      ) : dashboards.isLoading && !dashboards.data ? (
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
        dashboards.data.map((dashboard) => (
          <section key={dashboard.team_id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 px-1 pt-2">
              <h2 className="hero-title text-[22px] text-ink">{dashboard.name}</h2>
              {!dashboard.meta.configured && (
                <Badge tone="neutral">Default widgets — no saved layout</Badge>
              )}
              <OpenCorner
                href={`/teams/${dashboard.slug}/dashboard`}
                label={`Open the ${dashboard.name} dashboard`}
              />
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
        ))
      )}
    </>
  );
}
