"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { NotebookPen, TriangleAlert } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import type { ReportsOverviewOut } from "@/lib/types";
import {
  Meter,
  PageHead,
  Panel,
  PanelHead,
  StatBox,
} from "@/components/ui/primitives";
import { LinkButton, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import { SeverityBadge } from "@/components/reports/ReportBits";

/**
 * What the reports say together.
 *
 * **Not an admin screen**, and that is the interesting part: the endpoint
 * narrows to whatever the caller may read, so an ordinary person opening this
 * gets their own reports summarised and nobody else's rather than a refusal.
 * The same page answers "how did presales do last month" for a manager and "how
 * have I been doing" for everybody else, which is why it is offered to
 * everybody and why nothing here checks a role.
 *
 * The open issues come first, above the figures. A metric tells you how the
 * month went; an open issue is the thing somebody can act on this afternoon,
 * and burying it under six averages is how a reporting tool becomes a filing
 * cabinet.
 */
export default function ReportsOverviewPage() {
  const [days, setDays] = useState(30);

  const { data, error, mutate } = useSWR<ReportsOverviewOut>(
    withQuery("/reports/overview", { since: daysAgo(days - 1) }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  return (
    <>
      <PageHead
        eyebrow="Reports"
        title="Reporting overview"
        count={data ? `${num(data.reports)} reports` : undefined}
        lead="Narrowed to what you may read — your own, your team's if you run it, everyone's if you run the company."
        meta={data ? `${dateShort(data.since)} – ${dateShort(data.until)}` : undefined}
        actions={
          <LinkButton href="/reports" icon={NotebookPen}>
            All reports
          </LinkButton>
        }
      />

      <PillRail
        value={String(days)}
        onChange={(value) => setDays(Number(value))}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
        ]}
        className="w-fit"
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <PanelSkeleton lines={8} />
      ) : data.reports === 0 ? (
        <Empty
          icon={NotebookPen}
          title="Nothing filed in this window"
          body="Nobody whose reports you can read has filed one in this period. Try a longer one."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <StatBox label="Reports" value={num(data.reports)} />
            <StatBox
              label="People"
              value={num(data.people)}
              hint="Distinct authors who filed at least one."
            />
            <StatBox
              label="Open issues"
              value={num(data.open_issues.length)}
              tone={data.open_issues.length > 0 ? "danger" : undefined}
            />
            <StatBox label="Teams" value={num(data.by_team.length)} />
          </div>

          {/* First, because it is the only part of this screen anybody can do
              something about today. */}
          <Panel className="p-5">
            <PanelHead
              title="What is in the way"
              count={data.open_issues.length || undefined}
              hint="Unresolved, newest period first"
            />
            {data.open_issues.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-ink-4">
                Nothing open. Either it is going well or it is not being written down.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.open_issues.map((issue) => (
                  <li key={issue.id}>
                    <Link
                      href={`/reports/${issue.report_id}`}
                      className="block rounded-[13px] bg-panel-2 px-3.5 py-3 transition hover:bg-panel-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <TriangleAlert
                          className="mt-0.5 size-3.5 shrink-0 text-warn"
                          strokeWidth={2.2}
                        />
                        <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                          {issue.title}
                        </span>
                        <SeverityBadge value={issue.severity} />
                      </div>
                      {issue.detail && (
                        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-3">
                          {issue.detail}
                        </p>
                      )}
                      <p className="mt-1.5 text-[11px] text-ink-4">
                        {issue.team} · {issue.raised_by} · {dateShort(issue.period_start)}
                        {issue.waiting_on && ` · waiting on ${issue.waiting_on}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* The figures, totalled *and* averaged. A total that grows because
              more people filed says nothing about whether the work is going
              well, which is exactly the mistake a single number invites. */}
          {data.metrics.length > 0 && (
            <Panel className="p-5">
              <PanelHead title="The figures" hint="Totalled across reports, and per report" />
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.metrics.map((metric) => (
                  <div key={metric.key} className="rounded-[13px] bg-panel-2 px-3.5 py-3">
                    <p className="micro truncate text-ink-4" title={metric.label}>
                      {metric.label}
                    </p>
                    <p className="fig mt-1 text-[20px]">
                      {num(metric.total)}
                      {metric.unit && (
                        <span className="ml-1 text-[12px] font-normal text-ink-4">
                          {metric.unit}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-4">
                      {metric.average.toFixed(1)} per report over {num(metric.reports)}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking
              title="By team"
              rows={data.by_team.map((row) => ({
                key: row.team_id,
                label: row.team,
                value: row.reports,
                hint: `${num(row.people)} ${row.people === 1 ? "person" : "people"}`,
              }))}
            />
            <Ranking
              title="Who filed"
              rows={data.by_author.map((row) => ({
                key: row.author_id,
                label: row.author,
                value: row.reports,
                hint: row.last_period ?? undefined,
              }))}
            />
          </div>
        </div>
      )}
    </>
  );
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Rows with a bar against the largest — the same ranking the usage screen uses. */
function Ranking({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: number; hint?: string }[];
}) {
  const ordered = [...rows].sort((a, b) => b.value - a.value).slice(0, 10);
  const peak = Math.max(...ordered.map((row) => row.value), 0);

  return (
    <Panel className="p-5">
      <PanelHead title={title} count={rows.length} />
      {ordered.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-ink-4">Nothing yet.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {ordered.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                  {row.label}
                </span>
                {row.hint && (
                  <span className="shrink-0 text-[11px] text-ink-4">{row.hint}</span>
                )}
                <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">
                  {num(row.value)}
                </span>
              </div>
              <Meter value={row.value} max={peak} height={6} className="mt-1.5" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
