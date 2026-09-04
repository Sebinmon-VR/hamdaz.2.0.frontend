"use client";

import clsx from "clsx";
import { amount, isZero, sign } from "@/lib/format";
import { EDITABLE_STATUSES, type QuoteStatus, type ReviewAction } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/primitives";

/**
 * The shared vocabulary of the quoting module.
 *
 * A quote's status is the whole screen's subject, so it is worth being exact
 * about what each one means to the person reading it — "pending_approval" is
 * the machine's word, "waiting on an approver" is the answer to the question
 * they actually have.
 */

export const QUOTE_STATUS: Record<
  QuoteStatus,
  { label: string; tone: Tone; hint: string }
> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    hint: "Not sent for approval yet. Only you see it.",
  },
  pending_approval: {
    label: "Waiting on approval",
    tone: "warn",
    hint: "Sent. An approver on this team has to decide.",
  },
  changes_requested: {
    label: "Sent back",
    tone: "second",
    hint: "An approver wants changes. Edit it and send it again.",
  },
  approved: {
    label: "Approved",
    tone: "positive",
    hint: "Cleared. It now waits to be created in Zoho.",
  },
  rejected: {
    label: "Rejected",
    tone: "danger",
    hint: "Turned down. The review below says why.",
  },
  in_negotiation: {
    label: "In negotiation",
    tone: "info",
    hint: "The customer came back. Editable again, as the next pass.",
  },
  created_in_zoho: {
    label: "In Zoho",
    tone: "accent",
    hint: "The real quote exists in Zoho Books now.",
  },
};

export const REVIEW_ACTION: Record<ReviewAction, { label: string; tone: Tone }> = {
  approve: { label: "Approved", tone: "positive" },
  reject: { label: "Rejected", tone: "danger" },
  rework: { label: "Sent back", tone: "second" },
  comment: { label: "Commented", tone: "neutral" },
  negotiate: { label: "Reopened to negotiate", tone: "info" },
};

/** What a finished round ended as, for the history rail. */
export const REVISION_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  approve: { label: "Approved", tone: "positive" },
  reject: { label: "Rejected", tone: "danger" },
  rework: { label: "Sent back", tone: "second" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export function canEdit(status: QuoteStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const spec = QUOTE_STATUS[status];
  return (
    <span title={spec.hint}>
      <Badge tone={spec.tone}>{spec.label}</Badge>
    </span>
  );
}

/**
 * What a line makes, coloured by whether it is worth signing.
 *
 * `margin` is the profit on the whole line in currency — quantity times the
 * gap between the selling price and the cost price — not a percentage. It was
 * rendered here as a percentage for a while, which turned a line making
 * AED 4,000 into a claim of "4,000.0%" and made the column meaningless.
 *
 * Only drawn where a supplier cost sits behind the line: without one there is
 * no margin to report, and a zero would read as "we make nothing" rather than
 * "we do not know yet".
 */
export function Margin({
  value,
  currency,
  className,
}: {
  value: string | null;
  currency: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <span className={clsx("text-ink-4", className)} title="No supplier cost behind this line">
        —
      </span>
    );
  }
  const negative = sign(value) < 0;
  return (
    <span
      className={clsx(
        "tnum font-semibold",
        negative ? "text-danger" : isZero(value) ? "text-ink-3" : "text-positive",
        className,
      )}
      title={
        negative
          ? "This line sells for less than the supplier charges us."
          : isZero(value)
            ? "This line sells at exactly what it costs."
            : undefined
      }
    >
      {amount(value, currency)}
    </span>
  );
}
