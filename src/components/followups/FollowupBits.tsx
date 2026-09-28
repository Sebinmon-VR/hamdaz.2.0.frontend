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
