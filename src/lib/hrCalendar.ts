/* HR's holiday and notice calendar. Transcribed from app/hr/calendar_router.py. */

export type CalendarKind = "holiday" | "notice";
/** "all", or payroll's country code for one office. */
export type Office = "all" | "AE" | "IN";

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  title: string;
  starts_on: string;
  ends_on: string;
  days: number;
  details: string | null;
  office: Office;
  office_label: string;
  show_from: string;
  popup: boolean;
  /** On dashboards today. */
  showing: boolean;
  /** Whether the viewer has had the pop-up. Only on /upcoming. */
  seen: boolean | null;
  /** How many people have had the pop-up. HR only. */
  seen_count: number | null;
  created_by_name: string | null;
  updated_at: string;
}

export interface Upcoming {
  today: string;
  /** The viewer's office from payroll; null when they are not on payroll. */
  office: Office | null;
  showing: CalendarEntry[];
  next_holiday: CalendarEntry | null;
}

export interface CalendarEntryIn {
  kind: CalendarKind;
  title: string;
  starts_on: string;
  ends_on: string | null;
  details: string | null;
  office: Office;
  show_from: string | null;
  popup: boolean;
}

export const KIND_LABEL: Record<CalendarKind, string> = {
  holiday: "Holiday",
  notice: "Notice",
};

export const OFFICES: { value: Office; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "AE", label: "UAE office" },
  { value: "IN", label: "India office" },
];

/** The backend's HOLIDAY_LEAD_DAYS. */
export const HOLIDAY_LEAD_DAYS = 14;

/** A bare YYYY-MM-DD as a local date. `new Date("2026-12-02")` is UTC midnight. */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const d = parseDay(value);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from `from` to `to`, both bare dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** What the form fills in when HR has not picked a day: the backend's own default. */
export function defaultShowFrom(kind: CalendarKind, startsOn: string, today: string): string {
  if (kind === "holiday") return addDays(startsOn, -HOLIDAY_LEAD_DAYS);
  return startsOn < today ? startsOn : today;
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const YEAR = new Intl.DateTimeFormat("en-GB", { year: "numeric" });

/** "Tue 2 Dec", or "Tue 2 Dec – Wed 3 Dec", with the year when asked. */
export function rangeLabel(start: string, end: string, withYear = false): string {
  const a = DAY.format(parseDay(start)).replace(",", "");
  const tail = withYear ? ` ${YEAR.format(parseDay(end))}` : "";
  if (start === end) return `${a}${tail}`;
  return `${a} – ${DAY.format(parseDay(end)).replace(",", "")}${tail}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "2 Dec", "2–3 Dec", "30 Dec – 2 Jan": no weekday, for tight lists. */
export function rangeShort(start: string, end: string): string {
  if (start === end) return DAY_MONTH.format(parseDay(start));
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8))}–${DAY_MONTH.format(parseDay(end))}`;
  }
  return `${DAY_MONTH.format(parseDay(start))} – ${DAY_MONTH.format(parseDay(end))}`;
}

/** "Today", "Tomorrow", "in 8 days", "On now", "Ended". */
export function whenLabel(entry: Pick<CalendarEntry, "starts_on" | "ends_on">, today: string): string {
  const until = daysBetween(today, entry.starts_on);
  if (until > 1) return `in ${until} days`;
  if (until === 1) return "Tomorrow";
  if (until === 0) return "Today";
  return daysBetween(today, entry.ends_on) >= 0 ? "On now" : "Ended";
}
