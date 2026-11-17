import { Ban, Check, Clock, Coffee, Plane, Stethoscope, Wallet, X, Zap } from "lucide-react";
import { date, humanise } from "@/lib/format";
import { Badge, type Tone } from "@/components/ui/primitives";

/**
 * Leave type and status, given a consistent colour everywhere they appear.
 *
 * Both arrive from the backend as free strings rather than enums on the wire,
 * so both fall back to a neutral badge for anything unrecognised instead of
 * throwing or rendering blank.
 */

const TYPES: Record<string, { tone: Tone; icon: typeof Plane }> = {
  annual: { tone: "accent", icon: Plane },
  sick: { tone: "info", icon: Stethoscope },
  casual: { tone: "positive", icon: Coffee },
  emergency: { tone: "danger", icon: Zap },
  unpaid: { tone: "neutral", icon: Wallet },
};

/** "2 Dec – 4 Dec · 3 days", or "2 Dec · half day (morning)". */
export function leaveSpan(request: {
  start_date: string;
  end_date: string;
  days: number;
  half_day?: string | null;
}): { dates: string; length: string } {
  if (request.half_day) {
    return { dates: date(request.start_date), length: `half day (${request.half_day})` };
  }
  const dates =
    request.start_date === request.end_date
      ? date(request.start_date)
      : `${date(request.start_date)} – ${date(request.end_date)}`;
  return { dates, length: `${request.days} ${request.days === 1 ? "day" : "days"}` };
}

export function LeaveTypeBadge({ type }: { type: string }) {
  const spec = TYPES[type];
  return (
    <Badge tone={spec?.tone ?? "neutral"} icon={spec?.icon}>
      {humanise(type)}
    </Badge>
  );
}

const STATUSES: Record<string, { tone: Tone; icon: typeof Check; label?: string }> = {
  pending: { tone: "warn", icon: Clock, label: "Awaiting a decision" },
  approved: { tone: "positive", icon: Check },
  rejected: { tone: "danger", icon: X },
  cancelled: { tone: "neutral", icon: Ban },
};

export function LeaveStatusBadge({ status }: { status: string }) {
  const spec = STATUSES[status];
  return (
    <Badge tone={spec?.tone ?? "neutral"} icon={spec?.icon}>
      {spec?.label ?? humanise(status)}
    </Badge>
  );
}
