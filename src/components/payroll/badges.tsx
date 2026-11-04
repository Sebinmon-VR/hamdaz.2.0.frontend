import { Badge } from "@/components/ui/primitives";
import { COUNTRY_NAME, STATUS, type Country, type RunStatus } from "@/lib/payroll";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function CountryBadge({ country }: { country: Country }) {
  return <Badge tone={country === "AE" ? "accent" : "second"}>{COUNTRY_NAME[country]}</Badge>;
}
