"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { NotebookPen, Plus, TrendingUp } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ReportPage as ReportPageOut } from "@/lib/types";
import { Avatar, PageHead, Panel, Row, RowHead, StatBox } from "@/components/ui/primitives";
import { LinkButton, PillRail, SearchInput, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import {
  CADENCE_OPTIONS,
  CadenceBadge,
  ReportStatusBadge,
  ScopeBadge,
} from "@/components/reports/ReportBits";

/**
 * What has been filed, and what is still a draft.
 *
 * The listing is **already narrowed by the backend** to what this person may
 * read — their own, plus their team's if they run it, plus everybody's if they
 * run the company — so there is no permission logic on this screen and there
 * must not be: the filters here narrow further, never wider, and a team whose
 * reports somebody cannot read comes back empty rather than refused.
 *
 * "Mine" is the default view for the same reason the leave screen opens on your
 * own: most people come here to file today's report, not to read somebody
 * else's. A manager who came for the other thing turns it off once and the
 * whole team appears.
 *
 * A draft is nobody's but its author's, which is worth knowing before reading
 * the list: nothing anybody else has half-written will be in here.
 */
export default function ReportsPage() {
  const session = useSession();
  const [mine, setMine] = useState(true);
  const [cadence, setCadence] = useState<string>("all");
  // Three kinds of report share this list now, and they answer different
  // questions — "did my people file" and "how is the Hydra project doing" are
  // not the same errand. Filtering by scope is the cheapest way to ask one of
  // them at a time, and it is a backend parameter rather than a client filter
  // so the count in the header stays honest.
  const [scope, setScope] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, error, isLoading, mutate } = useSWR<ReportPageOut>(
    withQuery("/reports", {
      mine: mine || undefined,
      cadence: cadence === "all" ? undefined : cadence,
      scope: scope === "all" ? undefined : scope,
      status: status === "all" ? undefined : status,
      limit: 100,
    }),
    { keepPreviousData: true },
  );

  const all = data?.reports ?? [];
  const needle = search.trim().toLowerCase();
  const rows = all.filter(
    (report) =>
      !needle ||
      report.team.toLowerCase().includes(needle) ||
      report.author_name.toLowerCase().includes(needle) ||
      (report.project_name?.toLowerCase().includes(needle) ?? false) ||
      report.period_label.toLowerCase().includes(needle),
  );

  const drafts = all.filter((report) => report.status === "draft").length;
  const openIssues = all.reduce((sum, report) => sum + report.open_issue_count, 0);
  const unread = all.filter(
    (report) =>
      report.status === "submitted" &&
      report.author_id !== session.user.id &&
      !report.read_by_me,
  ).length;

  return (
    <>
      <PageHead
        title="Reports"
        count={data ? num(data.total) : undefined}
        actions={
          <>
            <Toggle checked={mine} onChange={setMine} label="Mine" />
            <LinkButton href="/reports/overview" icon={TrendingUp}>
              Overview
            </LinkButton>
            <LinkButton href="/reports/new" variant="accent" icon={Plus}>
              File a report
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="In this list" value={num(all.length)} />
        <StatBox
          label="Still a draft"
          value={num(drafts)}
          tone={drafts > 0 ? "second" : undefined}
          hint="A draft is yours alone until you file it — nobody else can see one."
        />
        <StatBox
          label="Open issues"
          value={num(openIssues)}
          tone={openIssues > 0 ? "danger" : undefined}
          hint="Across every report in this list. The part a manager is meant to act on."
        />
        <StatBox
          label="Not read yet"
          value={num(unread)}
          hint="Filed by somebody else and not yet opened by you."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Team, person, project or period"
          className="w-full max-w-xs"
        />
        <PillRail
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Everything" },
            { value: "team", label: "Own work" },
            { value: "project", label: "Projects" },
            { value: "portfolio", label: "Portfolios" },
          ]}
        />
        <PillRail
          value={cadence}
          onChange={setCadence}
          options={[{ value: "all", label: "Any cadence" }, ...CADENCE_OPTIONS]}
        />
        <PillRail
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "draft", label: "Drafts" },
            { value: "submitted", label: "Filed" },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <Empty
          icon={NotebookPen}
          title={mine ? "You have not filed one yet" : "Nothing to read"}
          body={
            mine
              ? "A report takes a minute: your Proposals tasks are pulled in for you, and you say where each one stands."
              : "Nobody whose reports you can read has filed one in this view. Drafts never appear here — they belong to their author until filed."
          }
          action={
            <LinkButton href="/reports/new" variant="accent" icon={Plus}>
              File a report
            </LinkButton>
          }
        />
      ) : (
        <Panel className="py-2">
          <RowHead>
            <span className="w-6 shrink-0" />
            <span className="micro min-w-0 flex-1 text-ink-4">Period</span>
            <span className="micro hidden w-40 shrink-0 text-ink-4 sm:block">
              Team or project
            </span>
            <span className="micro hidden w-20 shrink-0 text-ink-4 md:block">Tasks</span>
            <span className="micro hidden w-24 shrink-0 text-ink-4 md:block">Issues</span>
            <span className="micro w-24 shrink-0 text-ink-4">Filed</span>
            <span className="w-[7rem] shrink-0" />
          </RowHead>

          {rows.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <Row>
                <Avatar name={report.author_name} seed={report.author_id} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {report.period_label}
                  <span className="ml-2 text-[11.5px] text-ink-4">
                    {report.author_name}
                  </span>
                </span>
                {/* The project where there is one: on a status report the
                    team is the least identifying thing about it, and six
                    reports from the same team in a week are otherwise six
                    identical rows. */}
                <span
                  className="hidden w-40 shrink-0 truncate text-[12px] text-ink-3 sm:block"
                  title={report.project_name ? `${report.team} · ${report.project_name}` : report.team}
                >
                  {report.project_name ?? report.team}
                </span>
                <span className="tnum hidden w-20 shrink-0 text-[12px] text-ink-3 md:block">
                  {num(report.task_count)}
                </span>
                <span className="hidden w-24 shrink-0 text-[12px] md:block">
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
