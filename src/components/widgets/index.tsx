"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CircleAlert,
  Crown,
  Layers,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { dateShort, humanise, num, relative } from "@/lib/format";
import { activeOf } from "@/lib/types";
import type {
  DirectorySnapshotData,
  LeaveQueueData,
  MyLeaveData,
  MyProposalTasksData,
  MyStandingData,
  ProposalWorkloadData,
  RecentMembersData,
  RenderedWidget,
  RoleBreakdownData,
  TeamMembersData,
  TeamModulesData,
  TeamSummaryData,
  Unavailable,
  WhoIsOffData,
} from "@/lib/types";
import { Avatar, AvatarStack, Badge, Panel, RampBar, Stat } from "@/components/ui/primitives";
import { Empty } from "@/components/ui/feedback";

/* ── layout ──────────────────────────────────────────────────────────── */

/**
 * Widget sizes come from the backend registry, and the grid honours them.
 * Twelve columns on a wide screen: small is a quarter, medium a third, large a
 * half, full the width — which is what the registry's four names mean.
 */
const SPAN: Record<string, string> = {
  small: "sm:col-span-6 xl:col-span-3",
  medium: "sm:col-span-6 xl:col-span-4",
  large: "sm:col-span-12 xl:col-span-6",
  full: "col-span-full",
};

/**
 * The widget grid.
 *
 * Twelve columns, and the registry's four sizes are a quarter, a third, a half
 * and the width. Mixing thirds and quarters is what makes it look broken: a
 * quarter beside a third leaves five columns, which the next third does not
 * fill, so every dashboard ended up with ragged holes down its right-hand
 * side. `grid-flow-dense` fixes that by letting a later, smaller widget
 * backfill a gap an earlier one could not use — the order shifts a little, but
 * nothing on a dashboard depends on reading order, whereas the holes were
 * visible on every screen.
 *
 * The other half of the problem was height: cards in the same row are as tall
 * as the tallest, and a short one that did not stretch left a step in the
 * bottom edge. `h-full` on the frame makes every card fill its row.
 */
export function WidgetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-flow-dense grid-cols-1 gap-3.5 sm:grid-cols-12">
      {children}
    </div>
  );
}

/** The frame every widget shares: title, module tag, body, optional footer. */
function Frame({
  title,
  module,
  action,
  children,
  tone = "panel",
  className,
}: {
  title: string;
  module?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "panel" | "highlight";
  className?: string;
}) {
  return (
    <Panel tone={tone} className={clsx("flex h-full flex-col p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold tracking-tight">{title}</h3>
          {module && (
            <p
              className={clsx(
                "mt-0.5 text-[11px] font-medium uppercase tracking-[0.09em]",
                tone === "highlight" ? "opacity-60" : "text-ink-4",
              )}
            >
              {humanise(module)}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </Panel>
  );
}

function Unready({ reason }: { reason: string }) {
  return (
    <div className="flex h-full items-center gap-2.5 rounded-2xl bg-inset px-4 py-4 text-[13px] text-ink-3">
      <CircleAlert className="size-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0">{reason}</span>
    </div>
  );
}

function isUnavailable(data: unknown): data is Unavailable {
  return Boolean(data) && (data as Unavailable).available === false;
}

/* ── the switchboard ─────────────────────────────────────────────────── */

/**
 * One rendered widget. The backend decides which widgets exist and in what
 * order; this decides what each one looks like. A key with no renderer here
 * still shows — as its raw numbers — rather than vanishing, so adding a widget
 * on the backend is never a silent no-op on the frontend.
 */
export function Widget({ widget, teamSlug }: { widget: RenderedWidget; teamSlug?: string }) {
  const span = SPAN[widget.size] ?? SPAN.medium;

  if (widget.error) {
    return (
      <div className={span}>
        <Frame title={widget.title} module={widget.module}>
          <Unready reason={widget.error} />
        </Frame>
      </div>
    );
  }

  if (isUnavailable(widget.data)) {
    return (
      <div className={span}>
        <Frame title={widget.title} module={widget.module}>
          <Unready reason={widget.data.reason} />
        </Frame>
      </div>
    );
  }

  return (
    <div className={span}>
      <Body widget={widget} teamSlug={teamSlug} />
    </div>
  );
}

function Body({ widget, teamSlug }: { widget: RenderedWidget; teamSlug?: string }) {
  const { key, title, module, data } = widget;

  switch (key) {
    case "team_summary":
      return <TeamSummary title={title} module={module} data={data as TeamSummaryData} />;
    case "my_standing":
      return <MyStanding title={title} module={module} data={data as MyStandingData} />;
    case "team_members":
      return (
        <TeamMembers
          title={title}
          module={module}
          data={data as TeamMembersData}
          teamSlug={teamSlug}
        />
      );
    case "role_breakdown":
      return <RoleBreakdown title={title} module={module} data={data as RoleBreakdownData} />;
    case "recent_members":
      return <RecentMembers title={title} module={module} data={data as RecentMembersData} />;
    case "team_modules":
      return <TeamModules title={title} module={module} data={data as TeamModulesData} />;
    case "directory_snapshot":
      return (
        <DirectorySnapshot title={title} module={module} data={data as DirectorySnapshotData} />
      );
    case "my_proposal_tasks":
      return <MyProposalTasks title={title} module={module} data={data as MyProposalTasksData} />;
    case "proposal_workload":
      return (
        <ProposalWorkload
          title={title}
          module={module}
          data={data as ProposalWorkloadData}
          teamSlug={teamSlug}
        />
      );
    case "my_leave":
      return <MyLeave title={title} module={module} data={data as MyLeaveData} />;
    case "who_is_off":
      return <WhoIsOff title={title} module={module} data={data as WhoIsOffData} />;
    case "leave_queue":
      return <LeaveQueue title={title} module={module} data={data as LeaveQueueData} />;
    default:
      return (
        <Frame title={title} module={module}>
          <pre className="max-h-48 overflow-auto rounded-2xl bg-inset p-3 text-[11.5px] leading-relaxed text-ink-3">
            {JSON.stringify(data, null, 2)}
          </pre>
        </Frame>
      );
  }
}

/* ── teams ───────────────────────────────────────────────────────────── */

function TeamSummary({ title, module, data }: WidgetProps<TeamSummaryData>) {
  return (
    <Frame
      title={title}
      module={module}
      action={<Open href={`/teams/${data.slug}`} label={`Open ${data.name}`} />}
    >
      <p className="text-[22px] font-semibold leading-tight tracking-tight">{data.name}</p>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-3">
        {data.description || "No description."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge icon={Users}>{data.member_count} members</Badge>
        {data.archived && <Badge tone="warn">Archived</Badge>}
        {data.leads.length > 0 && (
          <Badge tone="accent" icon={Crown}>
            {data.leads.join(", ")}
          </Badge>
        )}
      </div>
    </Frame>
  );
}

function MyStanding({ title, module, data }: WidgetProps<MyStandingData>) {
  return (
    <Frame title={title} module={module} tone={data.is_lead ? "highlight" : "panel"}>
      {data.is_member ? (
        <>
          <p className="text-[15px] font-medium">{data.display_name}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.role_keys.map((key) => (
              <span
                key={key}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                  data.is_lead ? "bg-second/10" : "bg-inset text-ink-2",
                )}
              >
                {humanise(key)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">You are not a member of this team.</p>
      )}
    </Frame>
  );
}

function TeamMembers({
  title,
  module,
  data,
  teamSlug,
}: WidgetProps<TeamMembersData> & { teamSlug?: string }) {
  return (
    <Frame
      title={title}
      module={module}
      action={
        teamSlug && <Open href={`/teams/${teamSlug}/members`} label="Manage members" />
      }
    >
      {data.members.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nobody has been added yet.</p>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {data.members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center gap-3 rounded-2xl px-1 py-2"
            >
              <Avatar name={member.display_name} seed={member.user_id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{member.display_name}</p>
                <p className="truncate text-[11.5px] text-ink-4">{member.email}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {member.role_keys.slice(0, 2).map((key) => (
                  <Badge key={key} tone={key === "team_lead" ? "accent" : "neutral"}>
                    {humanise(key)}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.total > data.showing && (
        <p className="mt-3 text-[12px] text-ink-4">
          Showing {data.showing} of {data.total}.
        </p>
      )}
    </Frame>
  );
}

function RoleBreakdown({ title, module, data }: WidgetProps<RoleBreakdownData>) {
  const entries = Object.entries(data.counts).sort((a, b) => b[1] - a[1]);
  return (
    <Frame title={title} module={module}>
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-3">No roles held here yet.</p>
      ) : (
        <>
          <RampBar
            className="mb-4"
            height={28}
            segments={entries.map(([key, count]) => ({
              value: count,
              label: humanise(key),
            }))}
          />
          <ul className="space-y-2">
            {entries.map(([key, count]) => (
              <li key={key} className="flex items-center justify-between text-[13px]">
                <span className="text-ink-2">{humanise(key)}</span>
                <span className="tnum font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

function RecentMembers({ title, module, data }: WidgetProps<RecentMembersData>) {
  return (
    <Frame title={title} module={module}>
      {data.members.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nobody has joined recently.</p>
      ) : (
        <ul className="space-y-3">
          {data.members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-3">
              <Avatar name={member.display_name} seed={member.user_id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{member.display_name}</p>
                <p className="text-[11.5px] text-ink-4">{relative(member.joined_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function TeamModules({ title, module, data }: WidgetProps<TeamModulesData>) {
  return (
    <Frame title={title} module={module}>
      {data.count === 0 ? (
        <p className="text-[13px] text-ink-3">
          This team has not been granted any modules yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.modules.map((m) => (
            <li key={m.key} className="rounded-xl bg-inset px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 shrink-0 text-ink-3" />
                <span className="text-[13.5px] font-medium">{m.name}</span>
                {m.all_pages && (
                  <Badge tone="accent" className="ml-auto">
                    All pages
                  </Badge>
                )}
              </div>
              {!m.all_pages && (
                <p className="mt-1.5 pl-5.5 text-[11.5px] text-ink-4">
                  {m.pages.map(humanise).join(" · ") || "No pages"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/* ── directory ───────────────────────────────────────────────────────── */

function DirectorySnapshot({ title, module, data }: WidgetProps<DirectorySnapshotData>) {
  if (isUnavailable(data)) {
    return (
      <Frame title={title} module={module}>
        <Unready reason={data.reason} />
      </Frame>
    );
  }
  const departments = Object.entries(data.departments).slice(0, 6);
  const top = departments[0]?.[1] ?? 1;
  return (
    <Frame
      title={title}
      module={module}
      action={<Open href="/directory" label="Open directory" />}
    >
      <Stat value={num(data.headcount)} label="people in Entra" />
      <ul className="mt-5 space-y-2.5">
        {departments.map(([name, count]) => (
          <li key={name}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate text-ink-2">{name}</span>
              <span className="tnum shrink-0 font-medium text-ink-3">{count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-inset">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(count / top) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/* ── proposals ───────────────────────────────────────────────────────── */

function MyProposalTasks({ title, module, data }: WidgetProps<MyProposalTasksData>) {
  if (isUnavailable(data)) {
    return (
      <Frame title={title} module={module}>
        <Unready reason={data.reason} />
      </Frame>
    );
  }
  if (!data.in_sharepoint) {
    return (
      <Frame title={title} module={module}>
        <Unready reason="Your account is not on the SharePoint Proposals list, so nothing is assigned to you there." />
      </Frame>
    );
  }
  return (
    <Frame
      title={title}
      module={module}
      action={<Open href="/proposals/my-tasks" label="All my tasks" />}
    >
      <Stat value={num(data.open_count)} label="open now" />
      {data.tasks.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-3">Nothing open. </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {data.tasks.map((task) => (
            <li key={task.id}>
              {/* The row names a task, so it goes to that task. It used to go
                  to the generic list, where the default filter re-sorted
                  everything and you had to find the same row again, open it,
                  and then click the SharePoint link inside — four clicks to a
                  URL this payload already carried. */}
              <Link
                href={task.web_url ?? "/proposals/my-tasks"}
                target={task.web_url ? "_blank" : undefined}
                rel={task.web_url ? "noreferrer" : undefined}
                className="flex items-center gap-3 rounded-xl bg-inset px-2.5 py-1.5 transition hover:bg-panel-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{task.title}</p>
                  <p className="truncate text-[11.5px] text-ink-4">
                    {[task.end_user, task.status].filter(Boolean).join(" · ") || "No status"}
                  </p>
                </div>
                <DueChip due={task.due_date} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function ProposalWorkload({
  title,
  module,
  data,
  teamSlug,
}: WidgetProps<ProposalWorkloadData> & { teamSlug?: string }) {
  if (isUnavailable(data)) {
    return (
      <Frame title={title} module={module}>
        <Unready reason={data.reason} />
      </Frame>
    );
  }
  const org = data.organisation;
  return (
    <Frame
      title={title}
      module={module}
      action={
        teamSlug && <Open href={`/teams/${teamSlug}/proposals`} label="Team proposals" />
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {/* `open` counts everything not finished, most of which is bids
            that closed months ago; `overdue` is that closed pile, not late
            work. Leading with the live figure is the only honest reading. */}
        <Stat value={num(activeOf(org))} label="live" />
        <Stat
          value={num(org.due_soon)}
          label={`due in ${data.soon_days}d`}
          tone="warn"
          delta={org.due_soon > 0 ? "soon" : undefined}
        />
        <Stat value={num(org.overdue)} label="bids closed" />
        <Stat value={num(data.person_count)} label="people" />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-4">
              <th className="pb-1 font-medium">Person</th>
              <th className="pb-1 text-right font-medium">Live</th>
              <th className="pb-1 text-right font-medium">Due soon</th>
              <th className="pb-1 text-right font-medium">Closed</th>
              <th className="pb-1 pl-4 font-medium">Split</th>
              <th className="pb-1 text-right font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((person) => (
              <tr key={person.lookup_id ?? person.name} className="text-[13px]">
                <td className="rounded-l-2xl bg-inset py-2.5 pl-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={person.name} seed={person.lookup_id ?? person.name} size="xs" />
                    <span className="truncate font-medium">{person.name}</span>
                  </div>
                </td>
                <td className="tnum bg-inset py-2.5 text-right font-semibold">
                  {activeOf(person)}
                </td>
                <td
                  className={clsx(
                    "tnum bg-inset py-2.5 text-right",
                    person.due_soon > 0 && "font-semibold text-warn",
                  )}
                >
                  {person.due_soon}
                </td>
                <td className="tnum bg-inset py-2.5 text-right text-ink-4">
                  {person.overdue}
                </td>
                <td className="w-40 bg-inset py-2.5 pl-4">
                  <RampBar
                    height={20}
                    showValues={false}
                    // Live work only — the closed bids outnumber it twenty
                    // to one and turned every bar into the same full smear.
                    segments={[
                      { value: person.no_deadline, label: "No deadline" },
                      { value: person.later, label: "Later" },
                      { value: person.due_soon, label: "Due soon" },
                    ]}
                  />
                </td>
                <td className="tnum rounded-r-2xl bg-inset py-2.5 pr-3.5 text-right text-ink-3">
                  {person.next_deadline ? dateShort(person.next_deadline) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.excluded?.people > 0 && (
        <p className="mt-3 text-[12px] text-ink-4">
          {data.excluded.people} people and {data.excluded.rows} rows are outside this team&apos;s
          scope and are not counted.
        </p>
      )}
    </Frame>
  );
}

/* ── leave ───────────────────────────────────────────────────────────── */

function MyLeave({ title, module, data }: WidgetProps<MyLeaveData>) {
  return (
    <Frame title={title} module={module} action={<Open href="/leave" label="My leave" />}>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Stat value={num(data.days_approved)} label="days approved" />
        <Stat
          value={num(data.pending)}
          label="awaiting a decision"
          tone="warn"
          delta={data.pending > 0 ? "open" : undefined}
        />
      </div>
      {data.upcoming.length > 0 ? (
        <ul className="mt-5 space-y-1.5">
          {data.upcoming.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-inset px-2.5 py-1.5 text-[13px]"
            >
              <CalendarClock className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate">
                {dateShort(item.start_date)} – {dateShort(item.end_date)}
              </span>
              <Badge tone={item.status === "approved" ? "positive" : "warn"}>
                {humanise(item.status)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[13px] text-ink-3">Nothing booked ahead.</p>
      )}
      {data.auto_decide && (
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
          Requests decide themselves against a limit of {data.max_concurrent} people off at once.
        </p>
      )}
    </Frame>
  );
}

function WhoIsOff({ title, module, data }: WidgetProps<WhoIsOffData>) {
  const days = Object.entries(data.calendar).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Frame
      title={title}
      module={module}
      action={<Open href="/leave/calendar" label="Full calendar" />}
    >
      {days.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          Nobody is booked off in the next {data.days} days.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {days.slice(0, 8).map(([day, people]) => {
            const full = data.full_days.includes(day);
            return (
              <li
                key={day}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl px-3.5 py-2.5",
                  full ? "bg-warn-soft" : "bg-inset",
                )}
              >
                <span className="tnum w-16 shrink-0 text-[12.5px] font-medium">
                  {dateShort(day)}
                </span>
                <AvatarStack
                  people={people.map((p) => ({ name: p.name, id: p.user_id }))}
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">
                  {people.map((p) => p.name.split(" ")[0]).join(", ")}
                </span>
                {full && <Badge tone="warn">At the limit</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

function LeaveQueue({ title, module, data }: WidgetProps<LeaveQueueData>) {
  if (isUnavailable(data)) {
    return (
      <Frame title={title} module={module}>
        <Unready reason={data.reason} />
      </Frame>
    );
  }
  return (
    <Frame
      title={title}
      module={module}
      tone={data.pending_count > 0 ? "highlight" : "panel"}
      action={
        <Open
          href="/leave/requests"
          label="Decide requests"
          tone={data.pending_count > 0 ? "highlight" : "panel"}
        />
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Stat value={num(data.pending_count)} label="waiting on HR" />
        {data.auto_rejected_upcoming > 0 && (
          <Stat
            value={num(data.auto_rejected_upcoming)}
            label="auto-rejected, still ahead"
            tone="warn"
          />
        )}
      </div>
      {data.requests.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {data.requests.map((request) => (
            <li
              key={request.id}
              className={clsx(
                "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px]",
                data.pending_count > 0 ? "bg-second/8" : "bg-inset",
              )}
            >
              <Avatar name={request.name} size="xs" />
              <span className="min-w-0 flex-1 truncate font-medium">{request.name}</span>
              <span className="shrink-0 opacity-70">
                {dateShort(request.start_date)} · {request.days}d
              </span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────── */

interface WidgetProps<T> {
  title: string;
  module: string;
  data: T;
}

function Open({
  href,
  label,
  tone = "panel",
}: {
  href: string;
  label: string;
  tone?: "panel" | "highlight";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-full border transition",
        tone === "highlight"
          ? "border-second/15 hover:bg-second/10"
          : "border-line bg-panel-2 text-ink-3 hover:border-accent hover:text-ink",
      )}
    >
      <ArrowUpRight className="size-4" strokeWidth={2.2} />
    </Link>
  );
}

/** Colours a due date by how close it is — the only ranking that matters here. */
export function DueChip({ due }: { due: string | null }) {
  if (!due) return <Badge tone="neutral">No date</Badge>;
  const days = Math.round(
    (new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (Number.isNaN(days)) return <Badge tone="neutral">No date</Badge>;
  if (days < 0) return <Badge tone="danger">{Math.abs(days)}d late</Badge>;
  if (days === 0) return <Badge tone="highlight">Today</Badge>;
  if (days <= 7) return <Badge tone="warn">In {days}d</Badge>;
  return <Badge tone="neutral">{dateShort(due)}</Badge>;
}

/** Used by the dashboard pages when a team has no widgets configured. */
export function NoWidgets({ slug }: { slug?: string }) {
  return (
    <Empty
      icon={Building2}
      title="This dashboard is empty"
      body={
        slug
          ? "No widgets have been enabled for this team yet. An administrator can choose them from the widget catalogue."
          : "No widgets have been enabled yet."
      }
    />
  );
}
