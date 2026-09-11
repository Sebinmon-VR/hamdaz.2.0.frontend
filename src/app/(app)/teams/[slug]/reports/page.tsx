"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { GaugeCircle, ListChecks, NotebookPen, Users } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ReportPage as ReportPageOut, TeamOut } from "@/lib/types";
import { Avatar, PageHead, Panel, Row, RowHead, StatBox } from "@/components/ui/primitives";
import { LinkButton, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import {
  CADENCE_OPTIONS,
  CadenceBadge,
  ReportStatusBadge,
  ScopeBadge,
} from "@/components/reports/ReportBits";

/**
 * One team's reports.
 *
 * The same listing as the main screen, pinned to a team — which is what a lead
 * actually wants on a Monday: not "everything I can read" but "did my six
 * people file, and what did they say".
 *
 * **An empty list here is not necessarily an empty team.** The backend narrows
 * a team filter to what the caller may read rather than refusing it, so
 * somebody who does not run this team sees only their own reports for it, and
 * somebody who runs none of it sees nothing at all. That is the honest answer
 * — there are none *they* can see — but it would read as "nobody filed", so
 * the screen says which of the two it is.
 */
export default function TeamReportsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const session = useSession();
  const [cadence, setCadence] = useState("all");

  const team = useSWR<TeamOut>(slug ? `/teams/${slug}` : null, {
    revalidateOnFocus: false,
  });

  const { data, error, isLoading, mutate } = useSWR<ReportPageOut>(
    slug
      ? withQuery("/reports", {
          team: slug,
          cadence: cadence === "all" ? undefined : cadence,
          limit: 100,
        })
      : null,
    { keepPreviousData: true },
  );

  const rows = data?.reports ?? [];
  const mineOnly =
    rows.length > 0 && rows.every((report) => report.author_id === session.user.id);
  const openIssues = rows.reduce((sum, report) => sum + report.open_issue_count, 0);
  const people = new Set(rows.map((report) => report.author_id)).size;

  return (
    <>
      <PageHead
        eyebrow={team.data?.name ?? slug}
        title="Reports"
        count={data ? num(data.total) : undefined}
        actions={
          <>
            <LinkButton href={`/teams/${slug}`} icon={Users}>
              Team
            </LinkButton>
            <LinkButton href={`/teams/${slug}/dashboard`} icon={GaugeCircle}>
              Dashboard
            </LinkButton>
            <LinkButton href="/reports/new" variant="accent" icon={NotebookPen}>
              File one
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Filed" value={num(rows.length)} />
        <StatBox label="People" value={num(people)} />
        <StatBox
          label="Open issues"
          value={num(openIssues)}
          tone={openIssues > 0 ? "danger" : undefined}
        />
        <StatBox
          label="Tasks covered"
          value={num(rows.reduce((sum, report) => sum + report.task_count, 0))}
        />
      </div>

      <PillRail
        value={cadence}
        onChange={setCadence}
        options={[{ value: "all", label: "Any cadence" }, ...CADENCE_OPTIONS]}
        className="w-fit"
      />

      {mineOnly && (
        <p className="text-[12px] leading-relaxed text-ink-4">
          Only your own reports for this team are shown. Reading a colleague&rsquo;s takes a
          manager or lead role on the team — the backend narrows the list rather than
          refusing it, which is why this is a note and not an error.
        </p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <Empty
          icon={ListChecks}
          title="Nothing to read here"
          body="Either nobody on this team has filed in this view, or none of what they filed is yours to read. Drafts never appear — they belong to their author until filed."
        />
      ) : (
        <Panel className="py-2">
          <RowHead>
            <span className="w-6 shrink-0" />
            <span className="micro min-w-0 flex-1 text-ink-4">Period</span>
            <span className="micro hidden w-40 shrink-0 text-ink-4 sm:block">Who</span>
            <span className="micro hidden w-20 shrink-0 text-ink-4 md:block">Tasks</span>
            <span className="micro hidden w-20 shrink-0 text-ink-4 md:block">Issues</span>
            <span className="micro w-24 shrink-0 text-ink-4">Filed</span>
            <span className="w-[7rem] shrink-0" />
          </RowHead>

          {rows.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <Row>
                <Avatar name={report.author_name} seed={report.author_id} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {report.period_label}
                  {report.project_name && (
                    <span className="ml-2 text-[11.5px] text-ink-4">
                      {report.project_name}
                    </span>
                  )}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-[12px] text-ink-3 sm:block">
                  {report.author_name}
                </span>
                <span className="tnum hidden w-20 shrink-0 text-[12px] text-ink-3 md:block">
                  {num(report.task_count)}
                </span>
                <span className="hidden w-20 shrink-0 text-[12px] md:block">
                  {report.open_issue_count > 0 ? (
                    <span className="tnum font-semibold text-danger">
                      {num(report.open_issue_count)}
                    </span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </span>
                <span className="w-24 shrink-0 truncate text-[11.5px] text-ink-4">
                  {report.submitted_at
                    ? relative(report.submitted_at)
                    : dateShort(report.period_end)}
                </span>
                <span className="flex w-[7rem] shrink-0 justify-end gap-1.5">
                  <ScopeBadge value={report.scope} />
                  <CadenceBadge value={report.cadence} />
                  <ReportStatusBadge value={report.status} />
                </span>
              </Row>
            </Link>
          ))}
        </Panel>
      )}
    </>
  );
}
