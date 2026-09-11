"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FolderKanban, GaugeCircle, Map as MapIcon, Users } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import type { PortfolioOut, ProjectPage, TeamOut } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  Row,
  RowHead,
  StatBox,
} from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import {
  ProgressBar,
  ProjectStatusBadge,
  RagChip,
  Trend,
} from "@/components/projects/ProjectBits";

/**
 * One team's projects.
 *
 * The same listing as the main screen, pinned to a team — which is what a
 * lead actually wants: not "everything I can read" but "what are my people
 * running, and which of it is late".
 *
 * **An empty list here is not necessarily an empty team.** The backend
 * narrows a team filter to what the caller may read rather than refusing it,
 * so somebody who does not run this team sees only the projects they are on,
 * and somebody on none of them sees nothing at all. Both are honest answers
 * and they look identical, so the screen says which it is.
 */
export default function TeamProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const team = useSWR<TeamOut>(`/teams/${slug}`, { revalidateOnFocus: false });
  const totals = useSWR<PortfolioOut>(withQuery("/projects/portfolio", { team: slug }));
  const listing = useSWR<ProjectPage>(
    withQuery("/projects", { team: slug, include_archived: false, limit: 200 }),
    { keepPreviousData: true },
  );

  const rows = listing.data?.projects ?? [];
  const data = totals.data;
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
        eyebrow={team.data?.name ?? slug}
        title="Projects"
        count={data ? num(data.projects) : undefined}
        actions={
          <>
            <LinkButton href={`/teams/${slug}`} icon={Users}>
              Team
            </LinkButton>
            <LinkButton href={`/teams/${slug}/dashboard`} icon={GaugeCircle}>
              Dashboard
            </LinkButton>
            <LinkButton href="/projects/portfolio" icon={MapIcon}>
              Whole portfolio
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Projects" value={num(data?.projects ?? rows.length)} />
        <StatBox
          label="Average complete"
          value={data ? `${data.average_percent}%` : "—"}
        />
        <StatBox
          label="Overdue work"
          value={num((data?.tasks_overdue ?? 0) + (data?.milestones_overdue ?? 0))}
          tone={
            (data?.tasks_overdue ?? 0) + (data?.milestones_overdue ?? 0) > 0
              ? "danger"
              : undefined
          }
        />
        <StatBox
          label="Needing support"
          value={num(data?.issues_needing_support ?? 0)}
          tone={(data?.issues_needing_support ?? 0) > 0 ? "second" : undefined}
          hint="Escalations raised on this team's projects that somebody above them has to decide."
        />
      </div>

      {(data?.stale_health ?? 0) > 0 && (
        <InlineNotice tone="warn">
          {data!.stale_health} of these have dials nobody has confirmed for a fortnight.
        </InlineNotice>
      )}

      {listing.error ? (
        <ErrorState error={listing.error} onRetry={() => listing.mutate()} />
      ) : listing.isLoading && !listing.data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={6} />
        </Panel>
      ) : sorted.length === 0 ? (
        <Empty
          icon={FolderKanban}
          title="Nothing to show here"
          body="Either this team runs no projects, or none of them is yours to see — the listing is narrowed to what you may read rather than refused, which is why this is a note and not an error."
        />
      ) : (
        <Panel className="py-2">
          <RowHead>
            <span className="micro w-18.5 shrink-0 text-ink-4">Health</span>
            <span className="micro min-w-0 flex-1 text-ink-4">Project</span>
            <span className="micro w-28 shrink-0 text-ink-4">Complete</span>
            <span className="micro hidden w-16 shrink-0 text-right text-ink-4 md:block">
              Open
            </span>
            <span className="micro hidden w-16 shrink-0 text-right text-ink-4 md:block">
              Late
            </span>
            <span className="micro hidden w-20 shrink-0 text-ink-4 sm:block">Target</span>
            <span className="w-24 shrink-0" />
          </RowHead>

          {sorted.map((project) => {
            const late =
              project.rollup.tasks_overdue + project.rollup.milestones_overdue;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Row>
                  <span className="flex w-18.5 shrink-0 items-center gap-1.5">
                    <RagChip value={project.rag_overall} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {project.name}
                    {project.lead && (
                      <span className="ml-2 text-[11.5px] text-ink-4">
                        {project.lead.name}
                      </span>
                    )}
                  </span>
                  <span className="flex w-28 shrink-0 items-center gap-1.5">
                    <ProgressBar
                      percent={project.rollup.percent_complete}
                      rag={project.rag_overall}
                      height={4}
                      className="w-14"
                    />
                    <span className="tnum text-[11px] text-ink-3">
                      {project.rollup.percent_complete}%
                    </span>
                  </span>
                  <span className="tnum hidden w-16 shrink-0 text-right text-[12px] text-ink-3 md:block">
                    {project.rollup.tasks_open}
                  </span>
                  <span
                    className={
                      late > 0
                        ? "tnum hidden w-16 shrink-0 text-right text-[12px] font-semibold text-danger md:block"
                        : "tnum hidden w-16 shrink-0 text-right text-[12px] text-ink-4 md:block"
                    }
                  >
                    {late || "—"}
                  </span>
                  <span className="tnum hidden w-20 shrink-0 text-[11.5px] text-ink-4 sm:block">
                    {project.target_end_on ? dateShort(project.target_end_on) : "—"}
                  </span>
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                    {project.health_stale && <Badge tone="neutral">Stale</Badge>}
                    <Trend value={project.trend_overall} />
                    <ProjectStatusBadge value={project.status} />
                  </span>
                </Row>
              </Link>
            );
          })}
        </Panel>
      )}
    </>
  );
}
