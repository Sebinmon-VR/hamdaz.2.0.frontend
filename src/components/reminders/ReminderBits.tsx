"use client";

import type { ReminderColumn, ReminderOut, ReminderStatus } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/primitives";

const STATUS: Record<ReminderStatus, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for an update", tone: "warn" },
  answered: { label: "Updated", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
};

export function ReminderStatusBadge({ status }: { status: ReminderStatus }) {
  const { label, tone } = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={tone}>{label}</Badge>;
}

/** The Proposals columns by the names people know them by. */
export const COLUMN_LABEL: Record<ReminderColumn, string> = {
  Status: "Status",
  SubmissionStatus: "Submission status",
  Remarks: "Remarks",
  WorkingNotes: "Working notes",
};

/** What became of an answer: on the list, kept here, or refused there. */
export function writeState(row: ReminderOut): { label: string; tone: Tone; title?: string } | null {
  if (row.status !== "answered") return null;
  if (Object.keys(row.changes).length === 0) return { label: "Confirmed as it was", tone: "info" };
  if (row.written_at) return { label: "Written to SharePoint", tone: "positive" };
  if (row.write_error) return { label: "SharePoint refused", tone: "danger", title: row.write_error };
  return {
    label: "Kept here only",
    tone: "warn",
    title: "Writing to SharePoint was switched off when this was answered.",
  };
}
