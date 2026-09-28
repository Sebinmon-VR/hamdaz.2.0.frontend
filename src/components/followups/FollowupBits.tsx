"use client";

import type { FollowupStatus } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/primitives";

const STATUS: Record<FollowupStatus, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for a reason", tone: "warn" },
  answered: { label: "Reason given", tone: "info" },
  false_positive: { label: "False positive", tone: "positive" },
  resolved: { label: "Closed", tone: "neutral" },
  no_response: { label: "Not responded", tone: "danger" },
};

export function FollowupStatusBadge({ status }: { status: FollowupStatus }) {
  const { label, tone } = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * A date and time as it is in the UAE, whatever the viewer's own timezone —
 * the deadlines are the UAE's, and a laptop on India time moved them.
 */
export function uaeDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return (
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    }) + " UAE"
  );
}
