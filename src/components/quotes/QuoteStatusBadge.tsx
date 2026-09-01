import { humanise } from "@/lib/format";
import { Badge, type Tone } from "@/components/ui/primitives";

/**
 * Zoho's estimate statuses, coloured consistently.
 *
 * The status strings come from Zoho and are not an enum we control, so this
 * matches on what it knows and falls through to neutral. `sub_status` is
 * Zoho's own second axis (a sent quote can also be "viewed"), shown only when
 * it says something the main status does not.
 */
const TONES: Record<string, Tone> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  accepted: "positive",
  declined: "danger",
  expired: "warn",
  invoiced: "accent",
};

export function QuoteStatusBadge({
  status,
  subStatus,
}: {
  status: string | null;
  subStatus?: string | null;
}) {
  if (!status) return <Badge>Unknown</Badge>;
  const key = status.toLowerCase();
  const showSub = subStatus && subStatus.toLowerCase() !== key;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Badge tone={TONES[key] ?? "neutral"}>{humanise(status)}</Badge>
      {showSub && <Badge>{humanise(subStatus!)}</Badge>}
    </span>
  );
}
