"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  CalendarClock,
  ChevronRight,
  Expand,
  MapPin,
  Users,
  Video,
} from "lucide-react";
import { withQuery } from "@/lib/api";
import { useNow } from "@/components/shell/Clock";
import { avatarHue, initials, isoDay } from "@/lib/format";
import type { MeetingOut, MeetingPage } from "@/lib/types";

/**
 * What is next in the calendar, on every screen.
 *
 * The reminder is the point: a meeting you are not thinking about is the one
 * you are late for, and nothing in this app said a word about the calendar
 * until now. So it lives on the tab row rather than on a page — a reminder you
 * have to navigate to has already failed.
 *
 * It is a **button and a popover**, not a page, for the near-term question.
 * "What is next, and am I late" is asked mid-task, and answering it should not
 * cost the screen somebody is working on. Browsing a week, searching, reading
 * an invitation in full — those are page work, and they live at /meetings,
 * where they can be opened in a tab like everything else here.
 */

/** Below this, joining is the only thing anybody wants to do. */
const IMMINENT_MINUTES = 10;

/** A block narrower than this cannot hold a face, so it holds nothing. */
const MIN_BLOCK = 34;

/** How long it runs, in minutes — what sizes its block on the strip. */
function durationMinutes(meeting: MeetingOut): number {
  if (!meeting.start || !meeting.end) return 30;
  const ms = new Date(meeting.end).getTime() - new Date(meeting.start).getTime();
  return Math.max(15, Math.round(ms / 60_000));
}

function minutesUntil(start: string | null, now: Date): number | null {
  if (!start) return null;
  const ms = new Date(start).getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
}

/**
 * When it is, said the way a person would.
 *
 * Relative while that is the useful reading — "in 25m" is what you act on —
 * and a weekday and time once it is not, because "in 2d" tells nobody whether
 * they need to prepare tonight.
 */
function whenLabel(start: string | null, minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < -1) return `started ${Math.abs(minutes)}m ago`;
  if (minutes <= 1) return "now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 12) return `in ${hours}h ${minutes % 60}m`;
  if (!start) return `in ${Math.round(hours / 24)}d`;
  const when = new Date(start);
  const tomorrow = minutes < 60 * 36 && isTomorrow(when);
  return tomorrow
    ? `tomorrow ${timeOf(start)}`
    : `${new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(when)} ${timeOf(start)}`;
}

function isTomorrow(when: Date): boolean {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return isoDay(t) === isoDay(when);
}

function timeOf(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function NextMeeting() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A minute is the finest resolution any of this needs — the countdown is in
  // minutes and the join window is ten of them.
  const now = useNow(60_000);

  // A week, not today and tomorrow.
  //
  // Two days looked like the right scope for a reminder and was not: by six in
  // the evening everything today has finished, tomorrow is often empty, and
  // the chip disappeared — which reads as broken rather than as "nothing
  // left". A reminder that vanishes exactly when you would check it is worse
  // than none. Seven days always has a next thing to name, and the label says
  // which day when it is not this one.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);

  const { data } = useSWR<MeetingPage>(
    withQuery("/meetings", {
      // `isoDay` reads the local parts. `toISOString()` here was a real bug:
      // it converts local midnight to UTC, which for any timezone ahead of it
      // lands on the *previous* day — so the window started a day early and
      // ended a day early with it.
      start: isoDay(today),
      end: isoDay(horizon),
      meetings_only: true,
      limit: 50,
    }),
    // Polled, because the whole value is being current. Cheap: Graph is read
    // per request and this is one small window, not the whole calendar.
    { refreshInterval: 300_000, revalidateOnFocus: true, shouldRetryOnError: false },
  );

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    // Deferred a frame so the click that opened it does not close it again.
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", away);
      document.addEventListener("keydown", escape);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const live = (data?.meetings ?? [])
    .filter((m) => !m.is_cancelled && m.my_response !== "declined")
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

  // A meeting running right now is still "next" — it is the one you should be
  // in, so it is not filtered out until it has actually finished.
  const upcoming = live.filter((m) =>
    m.end ? new Date(m.end).getTime() > now.getTime() : true,
  );
  const next = upcoming[0] ?? null;

  // The strip draws one day: the day the next meeting falls on. Once today is
  // finished that is a later day, and the date pill says which — the point of
  // the pill is that the strip never has to pretend it means today.
  const day = next?.start ? isoDay(new Date(next.start)) : isoDay(today);
  const dayRows = live.filter((m) => m.start && isoDay(new Date(m.start)) === day);
  const isToday = day === isoDay(now);

  // Nothing to remind anybody of. An empty box on every screen would be noise.
  if (!data || !next || dayRows.length === 0) return null;

  return (
    <div ref={box} className="relative hidden min-w-0 shrink md:block">
      <div className="flex h-[30px] w-full max-w-[min(30vw,420px)] items-center gap-1.5 rounded-full bg-panel-2 pl-2.5 pr-1">
        {/* The mark, in place of the words "Your schedule". An icon says what
            this is in a fraction of the width, and the width is the scarce
            thing on this row — every character spent labelling the strip is a
            character taken off the meeting it is about. */}
        <CalendarClock className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} aria-hidden />

        {/* Which day. The strip shows the day the next meeting falls on, which
            by the evening is a later one — so this has to name it rather than
            let the row be read as today. */}
        <span className="flex h-[22px] shrink-0 items-center rounded-full bg-panel px-2 text-[11px] font-medium text-ink-2">
          {isToday
            ? "Today"
            : new Intl.DateTimeFormat("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(new Date(day))}
        </span>

        {/* What it actually is. A row of durations told you the shape of the
            day and never what any of it was about — "30m" is not a reminder of
            anything. Truncates rather than pushes, so a long subject shortens
            the name instead of squeezing the blocks off the end. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={next.subject}
          className="min-w-0 shrink truncate whitespace-nowrap text-left text-[11.5px] font-medium text-ink transition hover:text-ink-2"
        >
          {next.subject}
        </button>

        {/* The day itself. Blocks grow with their duration, so a two-hour
            workshop reads as one and a stand-up as a sliver — a row of equal
            chips would have said every meeting costs the same. The times
            between them are the boundaries, as on a real schedule. */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {dayRows.slice(0, 3).map((meeting, index) => {
            const until = minutesUntil(meeting.start, now);
            const ended = meeting.end
              ? new Date(meeting.end).getTime() <= now.getTime()
              : false;
            const running = !ended && until !== null && until <= 0;
            const length = durationMinutes(meeting);

            return (
              <span key={meeting.event_id} className="flex min-w-0 items-center gap-1">
                {index > 0 && (
                  <span className="tnum hidden shrink-0 text-[10px] text-ink-4 lg:block">
                    {timeOf(meeting.start)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  title={`${meeting.subject} — ${timeOf(meeting.start)}, ${length} min`}
                  style={{ flexGrow: length, flexBasis: MIN_BLOCK }}
                  className={clsx(
                    "flex h-[22px] min-w-0 items-center gap-1 rounded-full px-1.5 transition",
                    ended
                      ? "bg-panel-3 text-ink-4 opacity-60"
                      : running
                        ? "bg-second text-second-ink"
                        : "bg-accent text-accent-ink hover:bg-accent-hover",
                  )}
                >
                  {meeting.organizer && (
                    <Face
                      name={meeting.organizer.name}
                      seed={meeting.organizer.email ?? meeting.organizer.name}
                    />
                  )}
                  <span className="tnum truncate text-[10px] font-bold">
                    {running ? "now" : `${length}m`}
                  </span>
                </button>
              </span>
            );
          })}
          {dayRows.length > 3 && (
            <span className="tnum shrink-0 text-[10px] text-ink-4">
              +{dayRows.length - 3}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open the schedule"
          className="grid size-[22px] shrink-0 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
        >
          <Expand className="size-3" strokeWidth={2.2} />
        </button>
      </div>

      {open && (
        <div className="rise absolute right-0 top-[38px] z-50 w-[340px] rounded-[18px] bg-panel p-2 shadow-[var(--shadow-float)] ring-1 ring-line">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[12px] font-semibold">
              {isToday ? "Today" : "Next up"}
              <span className="ml-1.5 font-normal text-ink-4">
                {whenLabel(next.start, minutesUntil(next.start, now))}
              </span>
            </span>
            <Link
              href="/meetings"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11.5px] text-ink-4 transition hover:text-ink"
            >
              All meetings
              <ChevronRight className="size-3" />
            </Link>
          </div>

          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {upcoming.slice(0, 6).map((meeting) => (
              <li key={meeting.event_id}>
                <MeetingRow meeting={meeting} now={now} onGo={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MeetingRow({
  meeting,
  now,
  onGo,
}: {
  meeting: MeetingOut;
  now: Date;
  onGo: () => void;
}) {
  const minutes = minutesUntil(meeting.start, now);
  const imminent = minutes !== null && minutes <= IMMINENT_MINUTES;

  return (
    <div className="rounded-[13px] bg-inset px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="tnum w-20 shrink-0 pt-0.5 text-[12px] font-medium">
          {meeting.is_all_day ? "all day" : dayTime(meeting.start)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium">{meeting.subject}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-ink-4">
            {meeting.is_online ? (
              <Video className="size-3 shrink-0" strokeWidth={2} />
            ) : meeting.location ? (
              <MapPin className="size-3 shrink-0" strokeWidth={2} />
            ) : null}
            {meeting.is_online
              ? meeting.online_provider ?? "Online"
              : meeting.location ?? "No location"}
            {meeting.organizer && ` · ${meeting.organizer.name}`}
          </p>
        </div>
        <span className={clsx("tnum shrink-0 text-[11px]", imminent ? "text-second" : "text-ink-4")}>
          {whenLabel(meeting.start, minutes)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* Faces rather than a number: "who is on this" is answered at a
            glance, and the count alone never was. Rooms are excluded by the
            backend, so everybody here is a person. */}
        <span className="flex items-center -space-x-1.5">
          {[meeting.organizer]
            .filter((a): a is NonNullable<typeof a> => Boolean(a))
            .map((person) => (
              <Face
                key={person.email ?? person.name}
                name={person.name}
                seed={person.email ?? person.name}
              />
            ))}
          {meeting.attendee_count > 1 && (
            <span className="grid size-6 place-items-center rounded-full bg-panel-3 text-[9px] font-semibold text-ink-3 ring-2 ring-[var(--panel-2)]">
              +{meeting.attendee_count - 1}
            </span>
          )}
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          {/* Joining is offered only when it is nearly time. A Join button on
              a meeting four hours out is a button that gets clicked by
              mistake, and Teams will happily let somebody sit in an empty
              call. */}
          {meeting.is_online && meeting.join_url && imminent ? (
            <a
              href={meeting.join_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent px-3 text-[11.5px] font-bold text-accent-ink transition hover:bg-accent-hover"
            >
              <Video className="size-3" strokeWidth={2.4} />
              Join
            </a>
          ) : (
            <Link
              href={`/meetings?open=${encodeURIComponent(meeting.event_id)}`}
              onClick={onGo}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium text-ink-3 transition hover:bg-panel-3 hover:text-ink"
            >
              <Users className="size-3" strokeWidth={2} />
              View
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * A face, without reaching for the shared Avatar.
 *
 * `PageHead` renders this component and lives in the UI primitives, so
 * importing `Avatar` back from there would make a primitive depend on a
 * feature — a cycle that happens to work today because both sides are
 * functions, and breaks the moment either does anything at module scope. The
 * hue and initials come from `lib/format`, which is where Avatar gets them
 * too, so the two stay identical without the dependency.
 */
function Face({ name, seed }: { name: string; seed: string }) {
  const hue = avatarHue(seed);
  return (
    <span
      aria-hidden
      className="grid size-[18px] shrink-0 place-items-center rounded-full text-[8px] font-bold ring-2 ring-[var(--panel-2)]"
      style={{
        background: `linear-gradient(145deg, oklch(0.82 0.11 ${hue}), oklch(0.66 0.11 ${hue}))`,
        color: `oklch(0.26 0.08 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** "09:30" today, "Mon 09:30" otherwise — a week of bare times reads as one day. */
function dayTime(value: string | null): string {
  if (!value) return "";
  const when = new Date(value);
  if (isoDay(when) === isoDay(new Date())) return timeOf(value);
  return `${new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(when)} ${timeOf(value)}`;
}
