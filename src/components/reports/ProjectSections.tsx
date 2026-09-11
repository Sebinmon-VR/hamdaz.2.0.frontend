"use client";

/**
 * The three sections a project status report adds.
 *
 * `dials`, `timeline` and `projects` are drawn from the report's own
 * `project_lines` — a snapshot taken when the draft was opened, never a live
 * read of the project. That is the whole reason a filed report means anything
 * six months later, and it is why nothing here fetches: the figures are on the
 * report, frozen, and following `project_id` is how somebody reaches the
 * version that has moved on since.
 *
 * The author owns exactly three boxes per project — key activities, the
 * management action required, and a note — and the backend refuses everything
 * else, so the editor here offers nothing else. A report whose numbers could
 * be typed over would be a record of what somebody wished the project said.
 */

import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { date, dateShort, money, num } from "@/lib/format";
import type {
  ReportProjectLineOut,
  ReportProjectNoteIn,
} from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Field, Textarea } from "@/components/ui/controls";
import {
  Dials,
  ProgressBar,
  ProjectStatusBadge,
  RagChip,
  Roadmap,
  Tally,
  Timeline,
  Trend,
} from "@/components/projects/ProjectBits";

/* ── the five dials ──────────────────────────────────────────────────── */

/**
 * A project report has exactly one line, so the dials read from it directly.
 * The health here is the project's own — the report does not hold a second
 * opinion about it, which is what keeps the report and the board from
 * disagreeing about how something is doing.
 */
export function ReportDials({ line }: { line: ReportProjectLineOut }) {
  const dials = [
    { key: "overall", label: "Overall", rag: line.rag_overall, trend: line.trend_overall },
    { key: "scope", label: "Scope", rag: line.rag_scope, trend: line.trend_scope },
    { key: "cost", label: "Costs", rag: line.rag_cost, trend: line.trend_cost },
    { key: "schedule", label: "Schedule", rag: line.rag_schedule, trend: line.trend_schedule },
    { key: "benefits", label: "Benefits", rag: line.rag_benefits, trend: line.trend_benefits },
  ].map((dial) => ({
    ...dial,
    rag: dial.rag ?? "grey",
    trend: dial.trend ?? "steady",
  }));

  return (
    <div className="space-y-3.5">
      <Dials dials={dials} />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[15px] bg-panel-2 px-4 py-3">
        <div className="min-w-[9rem] flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="micro text-ink-4">Complete</span>
            <span className="tnum text-[13px] font-semibold">{line.percent_complete}%</span>
          </div>
          <ProgressBar
            percent={line.percent_complete}
            rag={line.rag_overall}
            className="mt-1.5"
          />
        </div>
        <Tally label="Tasks open" value={num(line.tasks_open)} />
        <Tally
          label="Overdue"
          value={num(line.tasks_overdue)}
          tone={line.tasks_overdue > 0 ? "danger" : undefined}
        />
        <Tally
          label="Blocked"
          value={num(line.tasks_blocked)}
          tone={line.tasks_blocked > 0 ? "warn" : undefined}
        />
        <Tally
          label="Milestones late"
          value={num(line.milestones_overdue)}
          tone={line.milestones_overdue > 0 ? "danger" : undefined}
        />
        {/* The two figures that make a report about its *period* rather than
            about the running total — read from the project's log between the
            report's own dates. */}
        <Tally
          label="Finished this period"
          value={num(line.tasks_completed_in_period)}
          tone="positive"
          title="Work completed inside the window this report covers, not the total."
        />
        <Tally
          label="Updates"
          value={num(line.updates_in_period)}
          title="How many times anybody recorded movement in this period."
        />
      </div>

      {(line.budget_amount || line.spend_amount) && (
        <p className="text-[11.5px] text-ink-4">
          {money(line.spend_amount, line.currency)} spent of{" "}
          {money(line.budget_amount, line.currency)} at {line.percent_complete}% complete.
        </p>
      )}
    </div>
  );
}

/* ── the plan ────────────────────────────────────────────────────────── */

export function ReportTimeline({ line }: { line: ReportProjectLineOut }) {
  if (line.milestones.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-4">
        No milestones were on the plan when this was filed.
      </p>
    );
  }
  return <Timeline milestones={line.milestones} />;
}

/* ── the portfolio table ─────────────────────────────────────────────── */

/**
 * One row per project — what makes a report cover a whole portfolio rather
 * than one project.
 *
 * Sorted red first, then amber, then unassessed, then green. A portfolio
 * printed alphabetically buries the one project the reader came for, and the
 * unassessed rows sit above the greens deliberately: a project nobody has
 * judged is not a project that is fine.
 */
export function PortfolioTable({ lines }: { lines: ReportProjectLineOut[] }) {
  const order: Record<string, number> = { red: 0, amber: 1, grey: 2, green: 3 };
  const rows = [...lines].sort(
    (a, b) =>
      (order[a.rag_overall ?? "grey"] ?? 4) - (order[b.rag_overall ?? "grey"] ?? 4) ||
      a.name.localeCompare(b.name),
  );

  return (
    <>
      {/* The same drawing the projects screen uses, over the frozen figures.
          A filed report carries each project's milestones, so the diamonds are
          real here rather than a bar on its own. */}
      <Roadmap
        className="mb-5"
        projects={rows.map((line) => ({
          id: line.id,
          name: line.name,
          code: line.code,
          lead: line.lead_name,
          rag: line.rag_overall,
          percent_complete: line.percent_complete,
          start_on: line.start_on,
          target_end_on: line.target_end_on,
          marks: (line.milestones ?? []).map((stone) => ({
            id: stone.id,
            on: stone.due_on,
            done: stone.state === "done",
            name: stone.name,
          })),
        }))}
      />
      <PortfolioRows rows={rows} />
    </>
  );
}

/** The table underneath the chart — the numbers the bars cannot carry. */
function PortfolioRows({ rows }: { rows: ReportProjectLineOut[] }) {
  return (
    <div className="no-bar -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[46rem] border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="micro text-ink-4">
            <th className="px-2 pb-1 font-medium">Project</th>
            <th className="w-24 px-2 pb-1 font-medium">Status</th>
            <th className="w-28 px-2 pb-1 font-medium">Health</th>
            <th className="w-32 px-2 pb-1 font-medium">Complete</th>
            <th className="w-16 px-2 pb-1 text-right font-medium">Open</th>
            <th className="w-16 px-2 pb-1 text-right font-medium">Late</th>
            <th className="w-16 px-2 pb-1 text-right font-medium">Issues</th>
            <th className="w-24 px-2 pb-1 text-right font-medium">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.id} className="bg-panel-2 align-top">
              <td className="rounded-l-[11px] px-2.5 py-2">
                <div className="flex items-start gap-1.5">
                  <span className="min-w-0 text-[12.5px] font-medium text-ink">
                    {line.name}
                  </span>
                  {/* The row is a snapshot; this is the way to the version
                      that has moved on. Null once the project is gone, and
                      the row still reads — which is the point of a copy. */}
                  {line.project_id && (
                    <Link
                      href={`/projects/${line.project_id}`}
                      title="Open the project as it is now"
                      className="mt-0.5 shrink-0 text-ink-4 transition hover:text-ink"
                    >
                      <ArrowUpRight className="size-3" strokeWidth={2.2} />
                    </Link>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-4">
                  {[line.code, line.lead_name].filter(Boolean).join(" · ") || "No lead named"}
                </p>
                {line.activities && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-3">
                    {line.activities}
                  </p>
                )}
                {line.action_required && (
                  <p className="mt-1.5 rounded-[9px] bg-warn-soft px-2 py-1.5 text-[11.5px] leading-relaxed text-warn">
                    <span className="font-semibold">Needs a decision: </span>
                    {line.action_required}
                  </p>
                )}
              </td>
              <td className="px-2.5 py-2">
                {line.status ? <ProjectStatusBadge value={line.status} /> : "—"}
              </td>
              <td className="px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <RagChip value={line.rag_overall} />
                  <Trend value={line.trend_overall} />
                </span>
              </td>
              <td className="px-2.5 py-2">
                <span className="tnum text-[11.5px] text-ink-2">
                  {line.percent_complete}%
                </span>
                <ProgressBar
                  percent={line.percent_complete}
                  rag={line.rag_overall}
                  height={4}
                  className="mt-1"
                />
              </td>
              <td className="tnum px-2.5 py-2 text-right text-[11.5px] text-ink-3">
                {line.tasks_open}
              </td>
              <td
                className={clsx(
                  "tnum px-2.5 py-2 text-right text-[11.5px]",
                  line.tasks_overdue > 0 ? "font-semibold text-danger" : "text-ink-3",
                )}
              >
                {line.tasks_overdue}
              </td>
              <td
                className={clsx(
                  "tnum px-2.5 py-2 text-right text-[11.5px]",
                  line.issues_open > 0 ? "font-semibold text-warn" : "text-ink-3",
                )}
              >
                {line.issues_open}
              </td>
              <td className="tnum rounded-r-[11px] px-2.5 py-2 text-right text-[11.5px] text-ink-3">
                {line.target_end_on ? dateShort(line.target_end_on) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── the header a single-project report gets instead of a table ──────── */

/**
 * One project's identity, above its dials.
 *
 * A portfolio report shows this as a table row; a project report shows it as
 * a header, because a one-row table is a header that has been made harder to
 * read.
 */
export function ProjectLineHead({ line }: { line: ReportProjectLineOut }) {
  return (
    <Panel tone="inset" className="p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[15px] font-semibold tracking-tight text-ink">{line.name}</span>
        {line.code && <Badge tone="neutral">{line.code}</Badge>}
        {line.status && <ProjectStatusBadge value={line.status} />}
        {line.project_id && (
          <Link
            href={`/projects/${line.project_id}`}
            className="ml-auto text-[11.5px] text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            Open it as it is now
          </Link>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-4">
        {[
          line.lead_name && `Led by ${line.lead_name}`,
          line.start_on && `started ${date(line.start_on)}`,
          line.target_end_on && `target ${date(line.target_end_on)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </Panel>
  );
}

/* ── what the author actually types ──────────────────────────────────── */

/**
 * The three prose boxes on one project line.
 *
 * Everything countable beside them came from the project and is not editable
 * — a project whose figures are wrong is fixed in the project and the draft
 * re-opened, which is a slower path deliberately: it keeps a report honest
 * about a system it claims to be quoting.
 */
export function ProjectNotes({
  line,
  value,
  onChange,
  single,
}: {
  line: ReportProjectLineOut;
  value: ReportProjectNoteIn;
  onChange: (patch: ReportProjectNoteIn) => void;
  /** True on a single-project report, where the project's name is already the heading. */
  single?: boolean;
}) {
  return (
    <div className="rounded-[15px] bg-panel-2 p-3.5">
      {!single && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <RagChip value={line.rag_overall} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {line.name}
          </span>
          <span className="tnum shrink-0 text-[11.5px] text-ink-4">
            {line.percent_complete}% · {line.tasks_open} open
          </span>
        </div>
      )}

      <div className="space-y-3">
        <Field
          label="Key activities this period"
          hint="What was actually done. The counts beside this say how much; only you can say what."
        >
          <Textarea
            value={value.activities ?? ""}
            onChange={(event) => onChange({ activities: event.target.value || null })}
            className="min-h-20"
            maxLength={8000}
          />
        </Field>
        <Field
          label="Management action required"
          hint="What somebody above you has to decide. Often the only part that is read."
        >
          <Textarea
            value={value.action_required ?? ""}
            onChange={(event) => onChange({ action_required: event.target.value || null })}
            className="min-h-16"
            maxLength={8000}
          />
        </Field>
        <Field label="Anything else" hint="Only if it needs saying.">
          <Textarea
            value={value.note ?? ""}
            onChange={(event) => onChange({ note: event.target.value || null })}
            className="min-h-16"
            maxLength={8000}
          />
        </Field>
      </div>
    </div>
  );
}

/* ── reading the prose back ──────────────────────────────────────────── */

/** The author's words on a single-project report, once it is filed. */
export function ProjectNarrative({ line }: { line: ReportProjectLineOut }) {
  const parts = [
    { label: "Key activities", body: line.activities },
    { label: "Management action required", body: line.action_required, urgent: true },
    { label: "Also", body: line.note },
  ].filter((part) => part.body?.trim());

  if (parts.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {parts.map((part) => (
        <div
          key={part.label}
          className={clsx(
            "rounded-[13px] px-3.5 py-2.5",
            part.urgent ? "bg-warn-soft" : "bg-panel-2",
          )}
        >
          <p className={clsx("micro", part.urgent ? "text-warn" : "text-ink-4")}>
            {part.label}
          </p>
          <p
            className={clsx(
              "mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed",
              part.urgent ? "text-warn" : "text-ink-2",
            )}
          >
            {part.body}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Shown in place of the three sections when a report has no project lines. */
export function NoProjectLines({ scope }: { scope: string }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-4">
      {scope === "portfolio"
        ? "No projects were readable on this team when the draft was opened, so this report covers none. A portfolio report only ever carries what its author could see."
        : "This report carries no project snapshot."}
    </p>
  );
}
