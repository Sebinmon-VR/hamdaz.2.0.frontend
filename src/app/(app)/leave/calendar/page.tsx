"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { withQuery } from "@/lib/api";
import { date, isoDay } from "@/lib/format";
import type { CalendarOut, LeaveSettingsOut } from "@/lib/types";
import { Avatar, Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { PersonHover } from "@/components/people/PersonHover";
import { Button, PillRail } from "@/components/ui/controls";
import { ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { LeaveTypeBadge } from "@/components/leave/badges";

type Span = "14" | "30" | "60";

/**
 * Who is off, as a strip of days rather than a month grid.
 *
 * A month grid would be mostly empty — the backend only returns days somebody
 * is actually off — and the question people bring here is "can I take next
 * week", which is read along a line, not out of a square.
 */
export default function LeaveCalendarPage() {
  const [offset, setOffset] = useState(0);
  const [span, setSpan] = useState<Span>("30");

  const days = Number(span);
  const start = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset * days);
    return d;
  }, [offset, days]);

  const settings = useSWR<LeaveSettingsOut>("/leave/settings");
  const calendar = useSWR<CalendarOut>(
    withQuery("/leave/calendar", { start: isoDay(start), days }),
  );

  const limit = settings.data?.max_concurrent ?? 0;

  // Every day in the window, not just the ones with somebody off — the empty
  // days are the answer to "when can I go", so they have to be visible.
  const grid = useMemo(() => {
    const out: { day: string; people: CalendarOut["days"][string] }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = isoDay(d);
      out.push({ day: key, people: calendar.data?.days?.[key] ?? [] });
    }
    return out;
  }, [start, days, calendar.data]);

  const busiest = grid.reduce((max, row) => Math.max(max, row.people.length), 0);
  const today = isoDay(new Date());

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Leave"
        title="Who is off"
        lead={
          limit
            ? `Approved leave only. At most ${limit} people may be off at once, so a full day is one to plan around.`
            : "Approved leave only — plans, not proposals."
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button icon={ChevronLeft} onClick={() => setOffset(offset - 1)}>
              Earlier
            </Button>
            <Button onClick={() => setOffset(0)} disabled={offset === 0}>
              Today
            </Button>
            <Button icon={ChevronRight} onClick={() => setOffset(offset + 1)}>
              Later
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={span}
          onChange={(next) => {
            setSpan(next);
            setOffset(0);
          }}
          options={[
            { value: "14", label: "Fortnight" },
            { value: "30", label: "30 days" },
            { value: "60", label: "60 days" },
          ]}
        />
        <span className="text-[12.5px] text-ink-3">
          {date(start)} – {date(grid[grid.length - 1]?.day)}
        </span>
      </div>

      {calendar.error ? (
        <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} />
      ) : calendar.isLoading && !calendar.data ? (
        <RowsSkeleton rows={8} />
      ) : (
        <Panel className="p-4">
          <PanelHead
            title="Day by day"
            hint={`Busiest day in this window: ${busiest} ${busiest === 1 ? "person" : "people"}`}
          />

          <ul className="mt-5 space-y-1">
            {grid.map(({ day, people }) => {
              const full = limit > 0 && people.length >= limit;
              const isToday = day === today;
              const weekend = [0, 6].includes(new Date(day).getDay());
              return (
                <li
                  key={day}
                  className={clsx(
                    "flex min-h-11 flex-wrap items-center gap-3 rounded-2xl px-3.5 py-2",
                    full
                      ? "bg-highlight text-second-ink"
                      : people.length > 0
                        ? "bg-inset"
                        : weekend
                          ? "bg-transparent opacity-45"
                          : "bg-transparent",
                    isToday && !full && "ring-1 ring-accent",
                  )}
                >
                  <span
                    className={clsx(
                      "tnum w-28 shrink-0 text-[12.5px]",
                      isToday ? "font-semibold" : "font-medium",
                    )}
                  >
                    {new Intl.DateTimeFormat("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }).format(new Date(day))}
                    {isToday && <span className="ml-1.5 text-accent-text">today</span>}
                  </span>

                  {people.length === 0 ? (
                    <span className="text-[12.5px] text-ink-4">Everyone in</span>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {people.map((person) => (
                          <span
                            key={`${day}-${person.user_id}`}
                            className={clsx(
                              "inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px]",
                              full ? "bg-second/10" : "bg-panel",
                            )}
                          >
                            <PersonHover userId={person.user_id} name={person.name}>
                              <Avatar name={person.name} seed={person.user_id} size="xs" />
                            </PersonHover>
                            {person.name}
                          </span>
                        ))}
                      </div>
                      <span className="tnum shrink-0 text-[12px] font-semibold">
                        {people.length}
                        {limit ? ` / ${limit}` : ""}
                      </span>
                      {full && <Badge tone="neutral">At the limit</Badge>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-[12px] text-ink-4">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-highlight" /> At the limit
            </span>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-inset ring-1 ring-line" /> Somebody off
            </span>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full ring-1 ring-accent" /> Today
            </span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              <LeaveTypeBadge type="annual" />
              <LeaveTypeBadge type="sick" />
              <LeaveTypeBadge type="emergency" />
              <LeaveTypeBadge type="unpaid" />
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
}
