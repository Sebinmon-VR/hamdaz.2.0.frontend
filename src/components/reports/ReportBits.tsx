"use client";

/**
 * The small pieces every reports screen shares.
 *
 * They live here rather than in each page because a report is read in four
 * places — your own list, a team's, the detail screen, and inside an assistant
 * answer — and a severity that is amber on one of them and red on another is
 * worse than no colour at all. One definition, four callers.
 */

import clsx from "clsx";
import { Badge, type Tone } from "@/components/ui/primitives";

/* ── how far along a task row is ─────────────────────────────────────── */

/**
 * The author's claim about a row, not SharePoint's status.
 *
 * Kept as a closed list on the backend precisely so it can be counted, and the
 * labels are repeated here rather than fetched: they are five words that have
 * not changed since the module shipped, and a request to learn them would put a
 * spinner in front of a badge.
 */
export const COMPLETION_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

const COMPLETION_TONE: Record<string, Tone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "danger",
  done: "positive",
  dropped: "neutral",
};

export function CompletionBadge({ value }: { value: string }) {
  return (
    <Badge tone={COMPLETION_TONE[value] ?? "neutral"}>
      {COMPLETION_LABELS[value] ?? value}
    </Badge>
  );
}

/* ── how bad an issue is ─────────────────────────────────────────────── */

export const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  blocked: "Blocked",
};

/**
 * Four levels, three colours — "high" and "blocked" are both red.
 *
 * Deliberate. A manager scanning a page of issues is looking for the ones to
 * act on today, and splitting that group across two hues to preserve a rank
 * that is already written next to it would make the scan slower, not more
 * precise. The word carries the distinction; the colour carries the urgency.
 */
const SEVERITY_TONE: Record<string, Tone> = {
  low: "neutral",
  medium: "warn",
  high: "danger",
  blocked: "danger",
};

export function SeverityBadge({ value }: { value: string }) {
  return (
    <Badge tone={SEVERITY_TONE[value] ?? "neutral"}>
      {SEVERITY_LABELS[value] ?? value}
    </Badge>
  );
}

/* ── the report itself ───────────────────────────────────────────────── */

export const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  ad_hoc: "Ad hoc",
};

export function CadenceBadge({ value }: { value: string }) {
  return <Badge tone="neutral">{CADENCE_LABELS[value] ?? value}</Badge>;
}

/**
 * Draft or filed.
 *
 * Worth a badge rather than a word because the two are not two stages of one
 * thing: a draft is nobody's but its author's — a manager cannot see it at all
 * — and filing it is what makes it a record. Somebody looking at their own list
 * needs to be able to tell in one pass which of these anybody else has read.
 */
export function ReportStatusBadge({ value }: { value: string }) {
  return value === "submitted" ? (
    <Badge tone="positive">Filed</Badge>
  ) : (
    <Badge tone="warn">Draft</Badge>
  );
}

/* ── a metric, however it was arrived at ─────────────────────────────── */

/**
 * The figure that counts, with the fact that somebody moved it.
 *
 * A computed number and a corrected one are different kinds of evidence, and
 * the backend keeps both for exactly that reason — so the corrected case shows
 * what the rows actually said underneath rather than quietly replacing it.
 */
export function MetricTile({
  label,
  unit,
  effective,
  computed,
  edited,
  className,
}: {
  label: string;
  unit?: string | null;
  effective: string | null;
  computed?: string | null;
  edited?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-[13px] bg-panel-2 px-3.5 py-3", className)}>
      <p className="micro truncate text-ink-4" title={label}>
        {label}
      </p>
      <p className="fig mt-1 text-[20px]">
        {effective ?? "—"}
        {unit && <span className="ml-1 text-[12px] font-normal text-ink-4">{unit}</span>}
      </p>
      {edited && computed !== null && computed !== undefined && (
        <p className="mt-0.5 text-[10.5px] text-ink-4">Rows said {computed}</p>
      )}
    </div>
  );
}
