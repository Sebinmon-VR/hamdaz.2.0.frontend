"use client";

import type { BcdCheckStatus } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/primitives";

const STATUS: Record<BcdCheckStatus, { label: string; tone: Tone }> = {
  pending: { label: "BCD not confirmed", tone: "warn" },
  corrected: { label: "BCD corrected", tone: "positive" },
  confirmed: { label: "BCD confirmed", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
};

export function BcdStatusBadge({ status }: { status: BcdCheckStatus }) {
  const { label, tone } = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={tone}>{label}</Badge>;
}

/** A BCD as the list holds it, shown in the UAE — where BCDs are written. */
export function uaeTime(iso: string | null | undefined): string {
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
