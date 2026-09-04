"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Ban, Trophy } from "lucide-react";
import { ApiError, withQuery } from "@/lib/api";
import { date, num } from "@/lib/format";
import {
  activeOf,
  FACTOR_KEYS,
  type EntryOut,
  type HeldLabelOut,
  type PersonLabelsOut,
  type RunOut,
  type WorkloadOut,
} from "@/lib/types";
import {
  Badge,
  Figure,
  Meta,
  Meter,
  Panel,
  PanelHead,
  StatBox,
} from "@/components/ui/primitives";
import { InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * The three things about a person that live outside their account record: what
 * they are carrying, what the assignment policy makes of them, and where they
 * would land in the next ranking.
 *
 * Each panel fetches independently and paints when it lands. That matters
 * because two of the three read SharePoint live and one reads Entra — putting
 * them behind tabs would have hidden the slow ones rather than made them fast,
 * and the whole point of a profile is not having to go and look in four places.
 */

/* ── what they are carrying ──────────────────────────────────────────── */

/**
 * Their row out of the org-wide proposal workload.
 *
 * There is no per-person endpoint — `/proposals/workload` returns everybody in
 * one sweep and the backend caches it across admins, so asking for the whole
 * thing and picking one row costs nothing extra and is usually already warm.
 */
export function ProposalWork({ email, name }: { email: string; name: string }) {
  const { data, error, isLoading } = useSWR<WorkloadOut>("/proposals/workload", {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const person = data?.people.find(
    (p) =>
      (p.email && email && p.email.toLowerCase() === email.toLowerCase()) ||
      p.name.toLowerCase() === name.toLowerCase(),
  );

  return (
    <Panel className="p-4">
      <PanelHead
        title="Proposal work"
        hint={data ? `read from SharePoint · ${num(data.row_count ?? 0)} rows` : undefined}
      />

      {error ? (
        <InlineNotice tone="warn" className="mt-4">
          {(error as ApiError).forbidden
            ? "Proposal counts are visible to administrators only."
            : "The Proposals list could not be read."}
        </InlineNotice>
      ) : isLoading ? (
        <PanelSkeleton lines={3} className="mt-4" />
      ) : !person ? (
        <p className="mt-4 text-[13px] text-ink-3">
          Nothing on the Proposals list is assigned to them.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {/* Live, not open: `open` counts the closed-bid archive too, and
                on this list that is most of it. */}
            <StatBox label="Live" value={num(activeOf(person))} />
            <StatBox
              label={`Due in ${data?.soon_days ?? 7}d`}
              value={num(person.due_soon)}
              tone={person.due_soon > 0 ? "second" : undefined}
            />
            <StatBox label="Bids closed" value={num(person.overdue)} />
            <StatBox label="Finished" value={num(person.completed)} />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Meta label="On the list">{num(person.total)} rows</Meta>
            <Meta label="Next deadline">
              {person.next_deadline ? date(person.next_deadline) : "None dated"}
            </Meta>
            <Meta label="Undated">{num(person.no_deadline)}</Meta>
          </dl>

          {Object.keys(person.by_status).length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
              {Object.entries(person.by_status)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <Badge key={status} tone={status === "(no status)" ? "warn" : "neutral"}>
                    {status === "(no status)" ? "No status" : status} {count}
                  </Badge>
                ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── what the policy makes of them ───────────────────────────────────── */

/** The labels they hold, which is what the assignment policy reads. */
export function LabelsHeld({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR<PersonLabelsOut[]>("/labels/people", {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const person = data?.find((p) => p.user_id === userId);

  return (
    <Panel className="p-4">
      <PanelHead
        title="Labels"
        count={person?.labels.length ?? 0}
        action={
          <Link href="/assignment/labels" className="text-[11.5px] text-ink-4 hover:text-ink">
            Manage
          </Link>
        }
      />

      {error ? (
        <p className="mt-4 text-[13px] text-ink-3">Labels could not be read.</p>
      ) : isLoading ? (
        <PanelSkeleton lines={2} className="mt-4" />
      ) : !person || person.labels.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-3">
          None held, so the policy falls back to its default capacity for them.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {person.labels.map((label: HeldLabelOut) => (
              // A derived label carries its reason — the honest answer to
              // "why does she have this" is a date, not a person.
              <span key={label.key} title={label.reason ?? undefined}>
                <Badge tone={label.source === "derived" ? "accent" : "neutral"}>
                  {label.name}
                  {label.expires_at ? ` to ${date(label.expires_at)}` : ""}
                </Badge>
              </span>
            ))}
          </div>
          {person.joined_on && (
            <p className="mt-4 text-[11.5px] text-ink-4">
              Counted as joining on {date(person.joined_on)}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── where they would land ───────────────────────────────────────────── */

/**
 * Their position in each of their teams' next ranking.
 *
 * One panel per team because the ranking is per team by design — the backend
 * refuses an organisation-wide one, on the grounds that scoring everybody at
 * once would put every team into a queue they do not share.
 */
export function RankingStanding({
  userId,
  teams,
}: {
  userId: string;
  teams: { slug: string; name: string }[];
}) {
  // Each of these is a live SharePoint read, so only the first team's is asked
  // for on open. The rest are a click, and the click is honest about what it
  // costs rather than the page quietly making four sweeps nobody asked for.
  const [also, setAlso] = useState<string[]>([]);
  if (teams.length === 0) return null;
  const shown = teams.filter((t, i) => i === 0 || also.includes(t.slug));
  const rest = teams.filter((t) => !shown.includes(t));

  return (
    <>
      {shown.map((team) => (
        <TeamStanding key={team.slug} userId={userId} team={team} />
      ))}
      {rest.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-[12.5px] text-ink-3">
            Also in {rest.map((t) => t.name).join(", ")}.
          </span>
          <button
            onClick={() => setAlso(teams.map((t) => t.slug))}
            className="ml-auto h-8 rounded-[11px] bg-panel-2 px-3 text-[12px] font-medium transition hover:bg-panel-3"
          >
            Rank there too
          </button>
        </Panel>
      )}
    </>
  );
}

function TeamStanding({
  userId,
  team,
}: {
  userId: string;
  team: { slug: string; name: string };
}) {
  const { data, error, isLoading } = useSWR<RunOut>(
    withQuery("/analytics/preview", { team: team.slug }),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  // A 409 is the backend saying this team inherits the organisation default
  // rather than holding a policy of its own — a setup answer, not a failure.
  const noPolicy = error instanceof ApiError && error.status === 409;
  const entry = data?.entries.find((e) => e.user_id === userId);

  return (
    <Panel className="p-4">
      <PanelHead
        title={`Priority in ${team.name}`}
        hint={data ? `${num(data.entries.length)} considered` : undefined}
        action={
          <Link
            href={`/assignment/user-analytics?team=${team.slug}`}
            className="text-[11.5px] text-ink-4 hover:text-ink"
          >
            See everyone
          </Link>
        }
      />

      {noPolicy ? (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
          This team has no assignment policy of its own, so nobody in it is ranked.{" "}
          <Link href="/assignment/policy" className="underline underline-offset-2">
            Give it one
          </Link>
          .
        </p>
      ) : error ? (
        <p className="mt-4 text-[13px] text-ink-3">This ranking could not be read.</p>
      ) : isLoading ? (
        <PanelSkeleton lines={3} className="mt-4" />
      ) : !entry ? (
        <p className="mt-4 text-[13px] text-ink-3">
          They do not appear on the Proposals list, so they are not ranked here.
        </p>
      ) : (
        <Standing entry={entry} nextUp={data?.next_up ?? null} />
      )}
    </Panel>
  );
}

function Standing({ entry, nextUp }: { entry: EntryOut; nextUp: string | null }) {
  const factors = FACTOR_KEYS.map((key) => ({ key, ...(entry.factors[key] ?? {}) })).filter(
    (f) => f.weight !== undefined,
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-5">
        {entry.excluded ? (
          <Figure
            label="Not available"
            value={<Ban className="size-7" />}
            size="sm"
            tone="second"
            sub={entry.excluded_reason ?? undefined}
          />
        ) : (
          <>
            <Figure
              label="Position"
              value={entry.priority_score ?? "—"}
              sub={
                entry.display_name === nextUp
                  ? "next in line"
                  : entry.priority_score === 1
                    ? "top of the queue"
                    : undefined
              }
              tone={entry.priority_score === 1 ? "accent" : undefined}
            />
            <Figure label="Score" value={entry.weighted_score ?? "—"} size="sm" />
            <Figure label="Active" value={num(entry.active_tasks)} size="sm" />
            <Figure
              label="Waited"
              value={
                entry.days_since_last_assign === null
                  ? "never"
                  : `${entry.days_since_last_assign}d`
              }
              size="sm"
            />
          </>
        )}
        {entry.priority_score === 1 && !entry.excluded && (
          <Badge tone="accent" icon={Trophy}>
            Next up
          </Badge>
        )}
      </div>

      {factors.length > 0 && (
        <div className="mt-6 space-y-3.5 border-t border-line pt-4">
          {factors.map((factor) => (
            <div key={factor.key}>
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-medium">{FACTOR_LABEL[factor.key]}</span>
                <span className="tnum ml-auto text-[12px] text-ink-3">
                  {factor.raw !== undefined ? factor.raw : "—"} raw
                </span>
                <span className="tnum w-12 text-right text-[12px] font-semibold">
                  {factor.normalised?.toFixed(2) ?? "—"}
                </span>
              </div>
              <Meter value={factor.normalised ?? 0} max={1} className="mt-1.5" />
            </div>
          ))}
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Meta label="Share">×{entry.capacity}</Meta>
        <Meta label="Work per share">{entry.effective_load}</Meta>
        <Meta label="Most at once">{entry.max_open ?? "no limit"}</Meta>
        <Meta label="Last given">
          {entry.last_assigned_on ? date(entry.last_assigned_on) : "never"}
        </Meta>
      </dl>
    </>
  );
}

const FACTOR_LABEL: Record<string, string> = {
  load_vs_capacity: "Load against capacity",
  open_task_count: "Active task count",
  days_since_last_assign: "Days since last assigned",
};

/* ── the gate ────────────────────────────────────────────────────────── */

/**
 * Who may look at somebody else's profile.
 *
 * This is a **UI gate, not a security boundary**, and the distinction matters:
 * `GET /users/{ref}` and `GET /access/users/{user_id}` take `CurrentUser` with
 * no role check, so any signed-in person can still read either with a fetch.
 * `/proposals/workload` is properly gated with `AdminUser` and will refuse.
 *
 * Until those two endpoints take an admin dependency the honest description of
 * this is that it keeps colleagues out of each other's records, not that it
 * secures them.
 */
export function mayViewProfile(
  session: { roles: { is_admin: boolean; is_super_admin: boolean }; user: { id: string } },
  targetId: string,
): boolean {
  return session.roles.is_admin || session.user.id === targetId;
}

export function ProfileRefused({ className }: { className?: string }) {
  return (
    <Panel className={clsx("p-8 text-center", className)}>
      <p className="text-[15px] font-semibold">Not yours to see</p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-3">
        A colleague&apos;s record — their roles, their teams, what they are carrying and
        where they sit in the assignment order — is visible to administrators only.
      </p>
      <Link
        href="/directory"
        className="mt-5 inline-flex h-9 items-center rounded-[13px] bg-panel-2 px-4 text-[12.5px] font-medium transition hover:bg-panel-3"
      >
        Back to the directory
      </Link>
    </Panel>
  );
}
