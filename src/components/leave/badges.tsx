import { Ban, Check, Clock, Plane, Stethoscope, Wallet, X, Zap } from "lucide-react";
import { humanise } from "@/lib/format";
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
  emergency: { tone: "danger", icon: Zap },
  unpaid: { tone: "neutral", icon: Wallet },
};

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
