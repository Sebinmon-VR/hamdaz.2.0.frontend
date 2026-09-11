"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Activity, ShieldAlert } from "lucide-react";
import { withQuery } from "@/lib/api";
import { date, dateTime, num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ProjectActivityOut, WindowGrain } from "@/lib/types";
import {
  Avatar,
  PageHead,
  Panel,
  PanelHead,
  StatBox,
} from "@/components/ui/primitives";
import { Input, PillRail, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import {
  Delta,
  TaskStatusBadge,
  UPDATE_KIND_LABELS,
  UpdateKindBadge,
} from "@/components/projects/ProjectBits";

/**
 * What moved, over a period.
 *
 * This is day-wise, week-wise, monthly and yearly reporting in one screen,
 * because on the backend they are one query with different bounds. Nothing
 * here computes a window: a grain and a day inside the period go up, and the
 * dates that were actually used come back — so the heading prints the period
 * that was covered rather than the one somebody meant.
 *
 * It is the counterpart to every other project screen, which show a *state*.
 * A project with nothing in this list is not necessarily stalled, but it is
 * the one worth asking about — which is why the per-project tally at the
 * bottom exists at all.
 */
export default function ProjectActivityPage() {
  const session = useSession();
  const [grain, setGrain] = useState<WindowGrain>("week");
  const [on, setOn] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [team, setTeam] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [kind, setKind] = useState("");

  const ready = grain !== "custom" || (since && until);
  const { data, error, isLoading, mutate } = useSWR<ProjectActivityOut>(
    session.can("projects") && ready
      ? withQuery("/projects/activity", {
          grain,
          on: grain === "custom" ? undefined : on || undefined,
          since: grain === "custom" ? since : undefined,
          until: grain === "custom" ? until : undefined,
          team: team || undefined,
          mine_only: mineOnly || undefined,
          kind: kind || undefined,
        })
      : null,
    { keepPreviousData: true },
  );

  if (!session.can("projects")) {
    return (
      <>
        <PageHead eyebrow="Projects" title="What moved" />
        <Empty
          icon={ShieldAlert}
          title="Not your module yet"
          body="Projects has not been granted to a team you are on. An administrator grants it under Team access."
        />
      </>
    );
  }

  const counts = Object.entries(data?.counts ?? {}).sort((a, b) => b[1] - a[1]);
  // Which projects the movement was in — the tally that turns a list of
  // entries into "these three moved and those two did not".
  const byProject = new Map<string, { name: string; count: number }>();
  for (const update of data?.updates ?? []) {
    const held = byProject.get(update.project_id);
    byProject.set(update.project_id, {
      name: update.project_name || "—",
      count: (held?.count ?? 0) + 1,
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Projects"
        title="What moved"
        lead={data?.label ?? "Day, week, month, quarter or year — the same question, different bounds."}
        count={data ? num(data.updates.length) : undefined}
        meta={data ? `${date(data.since)} – ${date(data.until)}` : undefined}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <PillRail
          value={grain}
          onChange={(next) => setGrain(next as WindowGrain)}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "quarter", label: "Quarter" },
            { value: "year", label: "Year" },
            { value: "custom", label: "Between two dates" },
          ]}
        />

        {grain === "custom" ? (
          <>
            <Input
              type="date"
              value={since}
              onChange={(event) => setSince(event.target.value)}
              className="w-40"
              aria-label="From"
            />
            <Input
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="w-40"
              aria-label="To"
            />
          </>
        ) : (
          <Input
            type="date"
            value={on}
            onChange={(event) => setOn(event.target.value)}
            className="w-44"
            aria-label="Any day inside the period"
            title="Any day inside the period. Empty is today."
          />
        )}

        <Select
          value={team}
          onChange={(event) => setTeam(event.target.value)}
          className="w-44"
          aria-label="Team"
        >
          <option value="">Every team</option>
          {session.teams.map((entry) => (
            <option key={entry.team.id} value={entry.team.slug}>
              {entry.team.name}
            </option>
          ))}
        </Select>

        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="w-40"
          aria-label="Kind of movement"
        >
          <option value="">Everything</option>
          {Object.entries(UPDATE_KIND_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>

        <Toggle checked={mineOnly} onChange={setMineOnly} label="Only mine" />
      </div>

      {grain === "custom" && !ready && (
        <p className="text-[12.5px] text-ink-4">
          A period between two dates needs both ends.
        </p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={8} />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <StatBox label="Entries" value={num(data.updates.length)} />
            <StatBox label="Projects in view" value={num(data.projects)} />
            <StatBox
              label="Projects that moved"
              value={num(byProject.size)}
              tone={byProject.size < data.projects ? "second" : undefined}
              hint="The gap between this and the line above is the list of projects nobody wrote anything about."
            />
            <StatBox label="Covering" value={data.label} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Panel className="p-5">
              <PanelHead
                title="Every movement"
                count={data.updates.length || undefined}
                hint="Newest first"
              />
              {data.updates.length === 0 ? (
                <Empty
                  className="mt-4"
                  icon={Activity}
                  title="Nothing was recorded"
                  body="No progress was written down in this period on any project you can see. That is either a quiet period or a period nobody wrote about, and only the team knows which."
                />
              ) : (
                <ul className="mt-4 space-y-2">
                  {data.updates.map((update) => (
                    <li key={update.id} className="rounded-[13px] bg-panel-2 px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <UpdateKindBadge value={update.kind} />
                        <Link
                          href={`/projects/${update.project_id}`}
                          className="min-w-0 flex-1 truncate text-[12.5px] text-ink hover:underline"
                        >
                          {update.subject ?? update.project_name}
                        </Link>
                        <Delta value={update.percent_delta} />
                        {update.status_after && (
                          <TaskStatusBadge value={update.status_after} />
                        )}
                      </div>
                      {update.body && (
                        <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                          {update.body}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        {update.author && (
                          <Avatar
                            name={update.author.name}
                            seed={update.author.id}
                            size="xs"
                          />
                        )}
                        <span
                          className="min-w-0 truncate text-[11px] text-ink-4"
                          title={dateTime(update.created_at)}
                        >
                          {[
                            update.author?.name,
                            update.project_name,
                            relative(update.created_at),
                            update.hours ? `${update.hours}h` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel className="p-5">
                <PanelHead title="By kind" hint="What sort of movement it was" />
                {counts.length === 0 ? (
                  <p className="mt-4 text-[12.5px] text-ink-4">Nothing to count.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {counts.map(([key, count]) => (
                      <li key={key} className="flex items-center gap-2.5 text-[13px]">
                        <UpdateKindBadge value={key} />
                        <span className="min-w-0 flex-1 truncate text-ink-3">
                          {UPDATE_KIND_LABELS[key] ?? key}
                        </span>
                        <span className="tnum font-semibold">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel className="p-5">
                <PanelHead
                  title="By project"
                  count={byProject.size || undefined}
                  hint="Only the ones that moved"
                />
                {byProject.size === 0 ? (
                  <p className="mt-4 text-[12.5px] text-ink-4">None moved.</p>
                ) : (
                  <ul className="mt-4 space-y-1.5">
                    {[...byProject.entries()]
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([id, entry]) => (
                        <li key={id}>
                          <Link
                            href={`/projects/${id}`}
                            className="flex items-center gap-2.5 rounded-[11px] bg-panel-2 px-3 py-2 text-[12.5px] transition hover:bg-panel-3"
                          >
                            <span className="min-w-0 flex-1 truncate text-ink-2">
                              {entry.name}
                            </span>
                            <span className="tnum shrink-0 font-semibold">
                              {entry.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
