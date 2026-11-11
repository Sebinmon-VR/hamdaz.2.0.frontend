import type { WebsiteEnquiryStatus } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";

/** In the order an enquiry moves through them, which is the order they are offered in. */
export const STATUSES: { value: WebsiteEnquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "spam", label: "Spam" },
];

const TONE: Record<WebsiteEnquiryStatus, "accent" | "info" | "second" | "positive" | "neutral" | "danger"> = {
  // "New" is the one that wants somebody, so it is the one in the accent.
  new: "accent",
  contacted: "info",
  qualified: "second",
  won: "positive",
  lost: "neutral",
  spam: "danger",
};

export function StatusBadge({ status }: { status: WebsiteEnquiryStatus }) {
  return <Badge tone={TONE[status]}>{STATUSES.find((s) => s.value === status)?.label ?? status}</Badge>;
}

/**
 * Where the visit came from, in a few words. A Google click id means an ad
 * even when the campaign tags are missing, which is the case worth knowing.
 */
export function cameFrom(attribution: Record<string, string>, referrer: string | null): string | null {
  const source = attribution.utm_source ?? (attribution.gclid ? "google ads" : null);
  if (source) {
    return [source, attribution.utm_medium, attribution.utm_campaign].filter(Boolean).join(" / ");
  }
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer;
  }
}
