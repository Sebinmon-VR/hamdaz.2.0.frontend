"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, ShieldAlert } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { PortfolioOut, ProjectPage } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  PanelHead,
  RampBar,
  StatBox,
} from "@/components/ui/primitives";
import { LinkButton, Select } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import {
  PROJECT_STATUS_LABELS,
  ProgressBar,
  ProjectStatusBadge,
  RAG_COLOR,
  RAG_LABELS,
  RagDot,
  Roadmap,
  toRoadmap,
  Trend,
} from "@/components/projects/ProjectBits";

/**
 * Every project at a glance.
 *
 * Two calls rather than one: the totals come from `/projects/portfolio`,
 * which is a set of figures, and the table from the listing. Keeping them
 * apart is what lets the figures answer for *everything* readable while the
 * table pages — a portfolio of ninety projects should still be able to say
 * how many are red without sending ninety rows.
 *
 * **It is narrowed, not refused.** An ordinary member opening this gets a
 * portfolio of their own projects rather than a 403, which is the honest
 * answer to "how is everything going" from where they stand — and the note
 * below says which of the two they are looking at, because the numbers alone
 * cannot.
 */
export default function PortfolioPage() {
  const session = useSession();
  const [team, setTeam] = useState("");

  const router = useRouter();
  const totals = useSWR<PortfolioOut>(
    session.can("projects")
      ? withQuery("/projects/portfolio", { team: team || undefined })
      : null,
  );
  const listing = useSWR<ProjectPage>(
    session.can("projects")
      ? withQuery("/projects", { team: team || undefined, limit: 200 })
      : null,
    { keepPreviousData: true },
  );

  if (!session.can("projects")) {
    return (
      <>
        <PageHead eyebrow="Projects" title="Portfolio" />
        <Empty
          icon={ShieldAlert}
          title="Not your module yet"
          body="Projects has not been granted to a team you are on. An administrator grants it under Team access."
        />
      </>
    );
  }

  const data = totals.data;
  const rows = listing.data?.projects ?? [];
  const order = ["red", "amber", "green", "grey"];
  // Red, then amber, then unassessed, then green — and unassessed above green
  // deliberately: a project nobody has judged is not a project that is fine.
  const rank: Record<string, number> = { red: 0, amber: 1, grey: 2, green: 3 };
  const sorted = [...rows].sort(
    (a, b) =>
      (rank[a.rag_overall] ?? 4) - (rank[b.rag_overall] ?? 4) ||
      (a.target_end_on ?? "9999").localeCompare(b.target_end_on ?? "9999") ||
      a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHead
        eyebrow="Projects"
        title="Portfolio"
        lead="Everything you can see, worst health first."
        count={data ? num(data.projects) : undefined}
        actions={
          <>
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
            <LinkButton href="/projects" icon={FolderKanban}>
              All projects
            </LinkButton>
          </>
        }
      />

      {totals.error ? (
        <ErrorState error={totals.error} onRetry={() => totals.mutate()} />
      ) : !data ? (
        <PanelSkeleton lines={8} />
      ) : data.projects === 0 ? (
        <Empty
          icon={FolderKanban}
          title="Nothing to roll up"
          body="No project you can see falls in this view. A portfolio is narrowed to what you may read rather than refused, so an empty one usually means you are not on any."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6">
            <StatBox label="Projects" value={num(data.projects)} />
            <StatBox label="Average complete" value={`${data.average_percent}%`} />
            <StatBox
              label="Milestones late"
              value={num(data.milestones_overdue)}
              tone={data.milestones_overdue > 0 ? "danger" : undefined}
            />
            <StatBox
              label="Tasks late"
              value={num(data.tasks_overdue)}
              tone={data.tasks_overdue > 0 ? "danger" : undefined}
            />
            <StatBox
              label="Issues open"
              value={num(data.issues_open)}
              tone={data.issues_open > 0 ? "second" : undefined}
            />
            <StatBox
              label="Needing support"
              value={num(data.issues_needing_support)}
              tone={data.issues_needing_support > 0 ? "second" : undefined}
              hint="Escalations somebody above the project has to decide."
            />
          </div>

          {data.stale_health > 0 && (
            <InlineNotice tone="warn">
              {data.stale_health} of these {data.stale_health === 1 ? "has" : "have"} dials
              nobody has confirmed for a fortnight. Read every colour below with that in
              mind — this is the number to check before believing any of the others.
            </InlineNotice>
          )}

          {/* The whole portfolio on one axis. The rollups above say how much
              and how late; this says when, which is the question a portfolio
              is usually opened to answer. */}
          {(listing.data?.projects.length ?? 0) > 0 && (
            <Panel className="px-2 py-4">
              <div className="px-2.5 pb-3">
                <PanelHead
                  title="Timeline"
                  count={listing.data?.projects.length}
                  hint="One bar per project, grouped by team"
                />
              </div>
              <Roadmap
                projects={(listing.data?.projects ?? []).map(toRoadmap)}
                groupByTeam={!team}
                onOpen={(id) => router.push(`/projects/${id}`)}
              />
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <PanelHead title="Health" hint="What their leads say" />
              <RampBar
                className="mt-4"
                height={28}
                segments={order
                  .map((key) => ({
                    value: data.by_rag[key] ?? 0,
                    label: RAG_LABELS[key],
                    color: RAG_COLOR[key],
                  }))
                  .filter((segment) => segment.value > 0)}
              />
              <ul className="mt-3 space-y-2">
                {order
                  .filter((key) => (data.by_rag[key] ?? 0) > 0)
                  .map((key) => (
                    <li key={key} className="flex items-center gap-2 text-[13px]">
                      <RagDot value={key} size={9} />
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        {RAG_LABELS[key]}
                      </span>
                      <span className="tnum font-semibold">{data.by_rag[key]}</span>
                    </li>
                  ))}
              </ul>
            </Panel>

            <Panel className="p-5">
              <PanelHead title="Where they are" hint="Status is not health" />
              <ul className="mt-4 space-y-2">
                {Object.entries(data.by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => (
                    <li key={key} className="flex items-center gap-2.5 text-[13px]">
                      <ProjectStatusBadge value={key} />
                      <span className="min-w-0 flex-1 truncate text-ink-3">
                        {PROJECT_STATUS_LABELS[key] ?? key}
                      </span>
                      <span className="tnum font-semibold">{count}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
                A project can be active and red, or on hold and green. One says whether
                work is happening, the other whether it is going well — which is why they
                are two rows of figures rather than one.
              </p>
            </Panel>
          </div>

          <Panel className="p-5">
            <PanelHead
              title="Every project"
              count={sorted.length}
              hint="Red first, then amber, then the ones nobody has judged"
            />
            {listing.error ? (
              <ErrorState className="mt-4" error={listing.error} onRetry={() => listing.mutate()} />
            ) : (
              <div className="no-bar -mx-1 mt-4 overflow-x-auto px-1">
                <table className="w-full min-w-[48rem] border-separate border-spacing-y-1 text-left">
                  <thead>
                    <tr className="micro text-ink-4">
                      <th className="px-2 pb-1 font-medium">Project</th>
                      <th className="w-28 px-2 pb-1 font-medium">Team</th>
                      <th className="w-24 px-2 pb-1 font-medium">Status</th>
                      <th className="w-32 px-2 pb-1 font-medium">Complete</th>
                      <th className="w-16 px-2 pb-1 text-right font-medium">Open</th>
                      <th className="w-16 px-2 pb-1 text-right font-medium">Late</th>
                      <th className="w-16 px-2 pb-1 text-right font-medium">Issues</th>
                      <th className="w-24 px-2 pb-1 text-right font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((project) => {
                      const late =
                        project.rollup.tasks_overdue + project.rollup.milestones_overdue;
                      return (
                        <tr key={project.id} className="bg-panel-2">
                          <td className="rounded-l-[11px] px-2.5 py-2">
                            <Link
                              href={`/projects/${project.id}`}
                              className="flex items-start gap-2"
                            >
                              <span className="mt-1">
                                <RagDot value={project.rag_overall} />
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[12.5px] font-medium text-ink">
                                    {project.name}
                                  </span>
                                  {project.health_stale && (
                                    <Badge
                                      tone="neutral"
                                      title="Nobody has confirmed the dials for a fortnight."
                                    >
                                      Stale
                                    </Badge>
                                  )}
                                </span>
                                <span className="block truncate text-[11px] text-ink-4">
                                  {[project.code, project.lead?.name]
                                    .filter(Boolean)
                                    .join(" · ") || "No lead named"}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-2.5 py-2 text-[11.5px] text-ink-3">
                            {project.team}
                          </td>
                          <td className="px-2.5 py-2">
                            <ProjectStatusBadge value={project.status} />
                          </td>
                          <td className="px-2.5 py-2">
                            <span className="flex items-center gap-1.5">
                              <span className="tnum text-[11.5px] text-ink-2">
                                {project.rollup.percent_complete}%
                              </span>
                              <Trend value={project.trend_overall} />
                            </span>
                            <ProgressBar
                              percent={project.rollup.percent_complete}
                              rag={project.rag_overall}
                              height={4}
                              className="mt-1"
                            />
                          </td>
                          <td className="tnum px-2.5 py-2 text-right text-[11.5px] text-ink-3">
                            {project.rollup.tasks_open}
                          </td>
                          <td
                            className={
                              late > 0
                                ? "tnum px-2.5 py-2 text-right text-[11.5px] font-semibold text-danger"
                                : "tnum px-2.5 py-2 text-right text-[11.5px] text-ink-3"
                            }
                          >
                            {late || "—"}
                          </td>
                          <td
                            className={
                              project.rollup.issues_open > 0
                                ? "tnum px-2.5 py-2 text-right text-[11.5px] font-semibold text-warn"
                                : "tnum px-2.5 py-2 text-right text-[11.5px] text-ink-3"
                            }
                          >
                            {project.rollup.issues_open || "—"}
                          </td>
                          <td className="tnum rounded-r-[11px] px-2.5 py-2 text-right text-[11.5px] text-ink-3">
                            {project.target_end_on ? dateShort(project.target_end_on) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
