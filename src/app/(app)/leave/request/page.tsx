"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarDays, Send, Users } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, isoDay } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { CalendarOut, LeaveSettingsOut, LeaveType } from "@/lib/types";
import { Avatar, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";
import { LeaveTypeBadge } from "@/components/leave/badges";

const TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "emergency", label: "Emergency" },
  { value: "unpaid", label: "Unpaid" },
];

/**
 * Booking time off.
 *
 * The clash panel on the right is the point of this screen: the rule that
 * decides the request is about how many people are already off, so showing
 * that before submitting turns an automatic rejection into something the
 * person can avoid.
 */
export default function RequestLeavePage() {
  const router = useRouter();
  const settings = useSWR<LeaveSettingsOut>("/leave/settings");

  const [type, setType] = useState<LeaveType>("annual");
  const [start, setStart] = useState(isoDay(new Date()));
  const [end, setEnd] = useState(isoDay(new Date()));
  const [reason, setReason] = useState("");

  const days = useMemo(() => {
    const a = new Date(start);
    const b = new Date(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
    return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  }, [start, end]);

  // Only asked for once the range makes sense, and only over the range itself.
  const clashes = useSWR<CalendarOut>(
    days && days > 0 && days <= 90
      ? withQuery("/leave/calendar", { start, days })
      : null,
  );

  const submit = useAction(async () =>
    api.post("/leave/requests", {
      leave_type: type,
      start_date: start,
      end_date: end,
      reason: reason.trim() || null,
    }),
  );

  const limit = settings.data?.max_concurrent;
  const maxDays = settings.data?.max_days_per_request;

  const busiest = useMemo(() => {
    const entries = Object.entries(clashes.data?.days ?? {});
    if (entries.length === 0) return null;
    return entries.reduce((worst, entry) =>
      entry[1].length > worst[1].length ? entry : worst,
    );
  }, [clashes.data]);

  const wouldBreach =
    limit !== undefined && busiest !== null && busiest[1].length >= limit;

  const tooLong = days !== null && maxDays !== undefined && days > maxDays;
  const invalidRange = days === null;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/leave">Leave</Link>}
        title="Request leave"
        lead={
          settings.data?.auto_decide
            ? "This is decided the moment you submit it, against how many people are already off."
            : "This goes to HR to decide."
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-4">
          <PanelHead title="The request" />

          <div className="mt-4 space-y-4">
            {submit.error && <InlineNotice tone="danger">{submit.error}</InlineNotice>}

            <Field label="Type of leave" required>
              <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
                {TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day off" required>
                <Input
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    // Keeps the range valid rather than letting the person
                    // submit something the backend will refuse.
                    if (end < e.target.value) setEnd(e.target.value);
                  }}
                />
              </Field>
              <Field
                label="Last day off"
                required
                error={invalidRange ? "The last day cannot be before the first." : null}
              >
                <Input
                  type="date"
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>

            {days !== null && (
              <p className="text-[13px] text-ink-3">
                <strong className="text-ink">{days}</strong>{" "}
                {days === 1 ? "day" : "days"} off, inclusive.
                {tooLong && (
                  <span className="text-danger">
                    {" "}
                    That is longer than the {maxDays}-day maximum for one request.
                  </span>
                )}
              </p>
            )}

            <Field
              label="Reason"
              hint="Optional, but it is what HR reads if the request has to be looked at by a person."
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Family holiday, already booked."
              />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="accent"
                icon={Send}
                loading={submit.pending}
                disabled={invalidRange || tooLong}
                onClick={async () => {
                  if ((await submit.run()) !== undefined) router.push("/leave");
                }}
              >
                Submit request
              </Button>
              <Button onClick={() => router.push("/leave")}>Cancel</Button>
              <LeaveTypeBadge type={type} />
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            // Pink only when the request is actually heading for a refusal.
            tone={wouldBreach ? "highlight" : "panel"}
            className="p-4"
          >
            <PanelHead title="Who else is off then" />
            {!days ? (
              <p className="mt-4 text-[13px] text-ink-3">Choose the dates first.</p>
            ) : clashes.isLoading && !clashes.data ? (
              <p className="mt-4 text-[13px] text-ink-3">Checking those days…</p>
            ) : Object.keys(clashes.data?.days ?? {}).length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                Nobody has approved leave over those dates.
              </p>
            ) : (
              <>
                {wouldBreach && (
                  <p className="mt-3 text-[13px] leading-relaxed">
                    {busiest![1].length} people are already off on {date(busiest![0])}, which
                    is the limit of {limit}.{" "}
                    {settings.data?.auto_decide
                      ? "Submitting this now would have it rejected automatically."
                      : "HR will have to weigh this one up."}
                  </p>
                )}
                <ul className="mt-4 space-y-1.5">
                  {Object.entries(clashes.data!.days)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([day, people]) => (
                      <li
                        key={day}
                        className={
                          wouldBreach
                            ? "flex items-center gap-3 rounded-2xl bg-second/8 px-3.5 py-2.5"
                            : "flex items-center gap-3 rounded-xl bg-inset px-2.5 py-1.5"
                        }
                      >
                        <span className="tnum w-16 shrink-0 text-[12.5px] font-medium">
                          {date(day).replace(/ \d{4}$/, "")}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {people.slice(0, 5).map((person) => (
                            <Avatar
                              key={person.user_id}
                              name={person.name}
                              seed={person.user_id}
                              size="xs"
                            />
                          ))}
                        </div>
                        <span className="tnum shrink-0 text-[12.5px] opacity-70">
                          {people.length}
                          {limit ? ` / ${limit}` : ""}
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Panel>

          {settings.data && (
            <Panel className="p-4">
              <PanelHead title="The rules" />
              <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink-2">
                <li className="flex gap-2.5">
                  <Users className="mt-0.5 size-4 shrink-0 text-ink-4" />
                  At most {settings.data.max_concurrent} people off at once, counted
                  across the {settings.data.limit_scope}.
                </li>
                <li className="flex gap-2.5">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-4" />
                  A single request may run to {settings.data.max_days_per_request} days.
                </li>
                <li className="flex gap-2.5">
                  <Send className="mt-0.5 size-4 shrink-0 text-ink-4" />
                  {settings.data.auto_decide
                    ? "Requests are decided automatically; HR can override an automatic rejection."
                    : "Every request is decided by HR."}
                </li>
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
