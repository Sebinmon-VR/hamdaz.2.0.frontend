"use client";

/**
 * The vocabulary of the intake, in one place.
 *
 * The pipeline has three separate closed sets — where a message got to, what it
 * was about, and what was done — and they are easy to confuse when read as raw
 * keys. Naming and colouring them once means the log, the detail view and the
 * console all say the same word for the same thing.
 */

import clsx from "clsx";
import { Badge, type Tone } from "@/components/ui/primitives";

/* ── where a message got to ──────────────────────────────────────────── */

export const STATUS_LABELS: Record<string, string> = {
  received: "Waiting",
  classified: "Read",
  actioned: "Done",
  ignored: "Ignored",
  // Not "simulated": it decided everything and simply did not write, and the
  // plainest way to say that is to say what did not happen.
  simulated: "Not written",
  failed: "Failed",
};

/**
 * "Simulated" is deliberately `info` rather than a warning.
 *
 * With writing switched off, a simulated message is the system working exactly
 * as intended — the decision made in full and the payload recorded, with only
 * the last step withheld. Colouring it as a problem would teach an
 * administrator to turn writing on to make the amber go away, which is the one
 * thing this screen must not encourage.
 */
const STATUS_TONE: Record<string, Tone> = {
  received: "neutral",
  classified: "accent",
  actioned: "positive",
  ignored: "neutral",
  simulated: "info",
  failed: "danger",
};

export function IntakeStatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={STATUS_TONE[value] ?? "neutral"}>{STATUS_LABELS[value] ?? value}</Badge>
  );
}

/* ── what it was about ───────────────────────────────────────────────── */

export const CATEGORY_LABELS: Record<string, string> = {
  tender: "Tender",
  proposal: "Proposal",
  negotiation: "Negotiation",
  order: "Order",
  general: "General",
  unknown: "Not sure",
};

/** Only the two that can bring new work in are given the accent. */
const CATEGORY_TONE: Record<string, Tone> = {
  tender: "accent",
  proposal: "accent",
  negotiation: "info",
  order: "info",
  general: "neutral",
  unknown: "warn",
};

export function CategoryBadge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <Badge tone={CATEGORY_TONE[value] ?? "neutral"}>
      {CATEGORY_LABELS[value] ?? value}
    </Badge>
  );
}

/* ── what was done ───────────────────────────────────────────────────── */

export const ACTION_LABELS: Record<string, string> = {
  none: "Nothing",
  created_task: "Task created",
  reopened_notice: "Reopened, person told",
  negotiation_notice: "Person told",
  marked_negotiation: "Task ticked, person told",
  order_notice: "Person told",
  duplicate: "Already have it",
};

/**
 * The two outcomes that reached outside this system are the accented ones.
 *
 * Raising a task and marking a task's Negotiation column are the only actions
 * that change something in SharePoint — and the second matters more than its
 * size suggests, because a flow watching that column fires on it. Telling
 * somebody in the app is a smaller thing and reads as one.
 */
export function ActionBadge({ value }: { value: string }) {
  if (value === "none") return null;
  const reachedOut = value === "created_task" || value === "marked_negotiation";
  return (
    <Badge tone={reachedOut ? "positive" : "neutral"}>{ACTION_LABELS[value] ?? value}</Badge>
  );
}

/* ── a confidence ────────────────────────────────────────────────────── */

/**
 * A score, with the threshold it was judged against.
 *
 * The number alone says nothing — 0.62 is a confident match under one setting
 * and a rejected one under another — so the bar draws the threshold as a line
 * and the colour follows which side of it the score fell. This is the whole
 * reason a wrong decision is diagnosable from this screen rather than from the
 * server logs.
 */
export function Confidence({
  value,
  threshold,
  label,
}: {
  value: number | null;
  threshold?: number;
  label?: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-[11.5px] text-ink-4">not scored</span>;
  }
  const pct = Math.max(0, Math.min(1, value));
  const under = threshold !== undefined && value < threshold;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        {label && <span className="text-[11.5px] text-ink-4">{label}</span>}
        <span
          className={clsx(
            "tnum text-[12.5px] font-semibold",
            under ? "text-warn" : "text-ink",
          )}
        >
          {(pct * 100).toFixed(0)}%
        </span>
        {under && <span className="text-[11px] text-warn">not sure enough to act</span>}
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: under ? "var(--warn)" : "var(--accent)",
          }}
        />
        {threshold !== undefined && (
          <span
            aria-hidden
            title={`Threshold ${(threshold * 100).toFixed(0)}%`}
            className="absolute inset-y-0 w-px bg-ink-3"
            style={{ left: `${Math.max(0, Math.min(1, threshold)) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
