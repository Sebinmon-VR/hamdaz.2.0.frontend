"use client";

/**
 * A filed report, read.
 *
 * Rendered from the payload's own `sections` list rather than from six
 * hardcoded blocks, which is the whole point of the backend sending it: the
 * frame is fixed, but the questions inside it are a template a super admin
 * points each team at, and a screen that knew the questions would be a screen
 * that had to be redeployed whenever presales wanted one more.
 *
 * So this walks the sections in the order given, draws each according to its
 * `kind` — prose, rows, figures — and hangs the team's own `fields` inside
 * whichever section they name. A section with nothing in it is dropped rather
 * than shown empty: a report is read by somebody scanning for what happened,
 * and six headings with three answers under them reads as a form that was
 * ignored rather than a period that was quiet.
 *
 * It is also used inside the assistant, where a report is one of the things a
 * tool result can turn into. That is the reason it takes a plain `ReportOut`
 * and holds no state, no fetching and no routing of its own.
 */

import clsx from "clsx";
import { ExternalLink, Paperclip } from "lucide-react";
import { date, humanise } from "@/lib/format";
import type { ReportOut, ReportSectionOut, TaskLineOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import {
  CompletionBadge,
  MetricTile,
  SeverityBadge,
} from "@/components/reports/ReportBits";

export function ReportView({
  report,
  className,
  compact = false,
}: {
  report: ReportOut;
  className?: string;
  /** Inside an assistant answer, where the panel is already in a bubble. */
  compact?: boolean;
}) {
  return (
    <div className={clsx(compact ? "space-y-2.5" : "space-y-4", className)}>
      {report.sections.map((section) => (
        <Section key={section.key} section={section} report={report} compact={compact} />
      ))}
    </div>
  );
}

function Section({
  section,
  report,
  compact,
}: {
  section: ReportSectionOut;
  report: ReportOut;
  compact: boolean;
}) {
  const fields = report.fields.filter((field) => field.section === section.key);
  const answered = fields.filter((field) => filled(report.answers[field.key]));

  const prose =
    section.key === "overview"
      ? report.overview
      : section.key === "remarks"
        ? report.remarks
        : section.key === "summary"
          ? report.summary
          : null;

  const empty =
    section.kind === "prose"
      ? !prose?.trim() && answered.length === 0
      : section.key === "tasks"
        ? report.tasks.length === 0 && answered.length === 0
        : section.key === "issues"
          ? report.issues.length === 0 && answered.length === 0
          : report.metrics.length === 0 && answered.length === 0;

  if (empty) return null;

  return (
    <Panel className={compact ? "p-3.5" : "p-5"}>
      <PanelHead
        title={section.name}
        count={
          section.key === "tasks"
            ? report.tasks.length
            : section.key === "issues"
              ? report.issues.length || undefined
              : undefined
        }
      />

      <div className="mt-3.5 space-y-3.5">
        {prose?.trim() && (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
            {prose.trim()}
          </p>
        )}

        {section.key === "tasks" && report.tasks.length > 0 && (
          <TaskTable tasks={report.tasks} />
        )}

        {section.key === "issues" && report.issues.length > 0 && (
          <ul className="space-y-2">
            {report.issues.map((issue) => (
              <li
                key={issue.id}
                className={clsx(
                  "rounded-[13px] px-3.5 py-3",
                  issue.resolved ? "bg-panel-2 opacity-70" : "bg-panel-2",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={clsx(
                      "min-w-0 flex-1 text-[13px] font-medium text-ink",
                      issue.resolved && "line-through",
                    )}
                  >
                    {issue.title}
                  </span>
                  <SeverityBadge value={issue.severity} />
                </div>
                {issue.detail && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                    {issue.detail}
                  </p>
                )}
                {issue.waiting_on && (
                  <p className="mt-1.5 text-[11.5px] text-ink-4">
                    Waiting on {issue.waiting_on}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {section.kind === "figures" && report.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {report.metrics.map((metric) => (
              <MetricTile
                key={metric.key}
                label={metric.label}
                unit={metric.unit}
                effective={metric.effective}
                computed={metric.computed}
                edited={metric.edited}
              />
            ))}
          </div>
        )}

        {/* The team's own questions, wherever the template put them. */}
        {answered.length > 0 && (
          <dl className="grid gap-2.5 sm:grid-cols-2">
            {answered.map((field) => (
              <div key={field.key} className="rounded-[13px] bg-panel-2 px-3.5 py-2.5">
                <dt className="micro text-ink-4">{field.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-ink-2">
                  {answerText(report.answers[field.key])}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Panel>
  );
}

/* ── the work itself ─────────────────────────────────────────────────── */

/**
 * The task rows.
 *
 * A table rather than a list of cards, because the columns are the point: how
 * far along, and by when. Cards would put those two facts in a different place
 * on every row, which is exactly the scan this section exists to support.
 *
 * It scrolls inside its own box on a narrow screen. A report is read on a
 * phone as often as not, and a table that widens the page is one where the
 * first column — the only one that identifies the row — is the part that
 * scrolls away.
 */
function TaskTable({ tasks }: { tasks: TaskLineOut[] }) {
  return (
    <div className="no-bar -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="micro text-ink-4">
            <th className="px-2 pb-1 font-medium">What</th>
            <th className="w-28 px-2 pb-1 font-medium">Where it stands</th>
            <th className="w-24 px-2 pb-1 font-medium">Deadline</th>
            <th className="w-16 px-2 pb-1 text-right font-medium">Done</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="bg-panel-2">
              <td className="rounded-l-[11px] px-2.5 py-2 align-top">
                <div className="flex items-start gap-1.5">
                  <span className="min-w-0 text-[12.5px] text-ink">{task.title}</span>
                  {task.link && (
                    <a
                      href={task.link}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in SharePoint"
                      className="mt-0.5 shrink-0 text-ink-4 transition hover:text-ink"
                    >
                      <ExternalLink className="size-3" strokeWidth={2.2} />
                    </a>
                  )}
                  {task.has_attachments && (
                    <Paperclip
                      className="mt-0.5 size-3 shrink-0 text-ink-4"
                      strokeWidth={2.2}
                    />
                  )}
                </div>
                {/* What the list says, next to what the author says. Two
                    different claims, and the gap between them is often the
                    most useful thing on the row. */}
                {(task.status || task.end_user || task.quote_no) && (
                  <p className="mt-1 truncate text-[11px] text-ink-4">
                    {[task.status && humanise(task.status), task.end_user, task.quote_no]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {task.note && (
                  <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-3">
                    {task.note}
                  </p>
                )}
              </td>
              <td className="px-2.5 py-2 align-top">
                <CompletionBadge value={task.completion} />
              </td>
              <td className="tnum px-2.5 py-2 align-top text-[11.5px] text-ink-3">
                {task.deadline ? date(task.deadline) : "—"}
              </td>
              <td className="tnum rounded-r-[11px] px-2.5 py-2 text-right align-top text-[11.5px] text-ink-3">
                {task.percent_complete === null ? "—" : `${task.percent_complete}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function answerText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
