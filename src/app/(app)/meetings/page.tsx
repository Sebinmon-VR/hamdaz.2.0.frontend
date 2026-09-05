"use client";

import clsx from "clsx";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
  MapPin,
  RefreshCw,
  Users,
  Video,
} from "lucide-react";
import { withQuery } from "@/lib/api";
import { date as fmtDate, humanise, isoDay, num } from "@/lib/format";
import type { AttendeeOut, MeetingDetailOut, MeetingOut, MeetingPage } from "@/lib/types";
import { Avatar, Badge, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, Modal, PanelSkeleton } from "@/components/ui/feedback";

/**
 * The calendar, as a page.
 *
 * The popover on the tab row answers "what is next" without costing anybody
 * their screen. This answers everything else — a week at a glance, a search
 * across subjects and people, an invitation read in full — and it is a page
 * rather than a bigger popover for a specific reason: those are things you sit
 * with for minutes, and this app makes pages first-class in its tab strip. A
 * popover that grew into a calendar would be a page in a costume, one that
 * cannot be linked to, bookmarked, or kept open beside a proposal.
 *
 * Reads the caller's own mailbox and only theirs — no request names a person,
 * so there is no view of a colleague's calendar to get wrong.
 */

type View = "agenda" | "calendar";

/** Days drawn at once in the calendar view. Two working weeks, plus weekends. */
const SPAN = 14;

export default function MeetingsPage() {
  return (
    // useSearchParams needs a boundary; the page is otherwise fully client.
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <Meetings />
    </Suspense>
  );
}

function Meetings() {
  const params = useSearchParams();
  const [view, setView] = useState<View>("agenda");
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  // Deep-linked from the reminder popover, so "View" lands on the invitation.
  const [openId, setOpenId] = useState<string | null>(params.get("open"));

  const start = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset * SPAN);
    return d;
  }, [offset]);

  const end = useMemo(() => {
    const d = new Date(start);
    d.setDate(d.getDate() + SPAN - 1);
    return d;
  }, [start]);

  const key = withQuery("/meetings", {
    start: isoDay(start),
    end: isoDay(end),
    search: search.trim() || undefined,
    limit: 250,
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR<MeetingPage>(key, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const meetings = (data?.meetings ?? []).filter((m) => !m.is_cancelled);

  // Grouped by day, in the order the days fall — the calendar draws every day
  // in the window and the agenda draws only the ones with something on them,
  // but both want the same map.
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingOut[]>();
    for (const meeting of meetings) {
      if (!meeting.start) continue;
      const day = isoDay(new Date(meeting.start));
      map.set(day, [...(map.get(day) ?? []), meeting]);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
    }
    return map;
  }, [meetings]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < SPAN; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push(isoDay(d));
    }
    return out;
  }, [start]);

  const today = isoDay(new Date());

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="You"
        title="Meetings"
        lead="Your own calendar. Nobody else's is readable here."
        count={data ? num(meetings.length) : undefined}
        actions={
          <Button icon={RefreshCw} loading={isValidating} onClick={() => mutate()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={view}
          onChange={setView}
          options={[
            { value: "agenda" as const, label: "Agenda", icon: List },
            { value: "calendar" as const, label: "Calendar", icon: CalendarRange },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search subject, location or person"
          className="w-full max-w-sm"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" icon={ChevronLeft} onClick={() => setOffset((o) => o - 1)}>
            Earlier
          </Button>
          {offset !== 0 && (
            <Button size="sm" onClick={() => setOffset(0)}>
              Today
            </Button>
          )}
          <Button size="sm" onClick={() => setOffset((o) => o + 1)}>
            Later
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-ink-4">
        {fmtDate(isoDay(start))} – {fmtDate(isoDay(end))}
        {data && ` · ${num(data.total)} in this window`}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={8} />
      ) : meetings.length === 0 ? (
        <Empty
          icon={CalendarRange}
          title="Nothing in this window"
          body={
            search
              ? "No meeting matches that search in these two weeks."
              : "Your calendar is clear for these two weeks."
          }
        />
      ) : view === "calendar" ? (
        <CalendarGrid days={days} byDay={byDay} today={today} onOpen={setOpenId} />
      ) : (
        <Agenda days={days} byDay={byDay} today={today} onOpen={setOpenId} />
      )}

      <MeetingDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* ── agenda ──────────────────────────────────────────────────────────── */

/** Only the days with something on them — a list of empty days is not a list. */
function Agenda({
  days,
  byDay,
  today,
  onOpen,
}: {
  days: string[];
  byDay: Map<string, MeetingOut[]>;
  today: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {days
        .filter((day) => (byDay.get(day) ?? []).length > 0)
        .map((day) => (
          <Panel key={day} className="p-4">
            <PanelHead
              title={new Intl.DateTimeFormat("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(day))}
              hint={day === today ? "today" : undefined}
              count={(byDay.get(day) ?? []).length}
            />
            <ul className="mt-3 space-y-1.5">
              {(byDay.get(day) ?? []).map((meeting) => (
                <li key={meeting.event_id}>
                  <MeetingBar meeting={meeting} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </Panel>
        ))}
    </div>
  );
}

function MeetingBar({
  meeting,
  onOpen,
}: {
  meeting: MeetingOut;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-3 py-2.5">
      <span className="tnum w-24 shrink-0 text-[12.5px] font-medium">
        {meeting.is_all_day
          ? "All day"
          : `${clockOf(meeting.start)} – ${clockOf(meeting.end)}`}
      </span>

      <button
        type="button"
        onClick={() => onOpen(meeting.event_id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-[13.5px] font-medium">{meeting.subject}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-ink-4">
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
      </button>

      <span className="flex shrink-0 items-center gap-2">
        <ResponseBadge response={meeting.my_response} />
        <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-4">
          <Users className="size-3" strokeWidth={2} />
          {meeting.attendee_count}
        </span>
        {meeting.is_online && meeting.join_url && (
          <a
            href={meeting.join_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-[11.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            Join
          </a>
        )}
      </span>
    </div>
  );
}

/* ── calendar ────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function CalendarGrid({
  days,
  byDay,
  today,
  onOpen,
}: {
  days: string[];
  byDay: Map<string, MeetingOut[]>;
  today: string;
  onOpen: (id: string) => void;
}) {
  // The window starts on whatever day it starts on, so the first row is padded
  // to line the columns up under their weekday. Without this a Wednesday start
  // puts Wednesday under "Mon".
  const lead = (new Date(days[0]).getDay() + 6) % 7;

  return (
    <Panel className="p-4">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <div key={label} className="pb-1 text-center micro text-ink-4">
            {label}
          </div>
        ))}

        {Array.from({ length: lead }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map((day) => {
          const rows = byDay.get(day) ?? [];
          const isToday = day === today;
          const weekend = [0, 6].includes(new Date(day).getDay());
          return (
            <div
              key={day}
              className={clsx(
                "min-h-28 rounded-xl p-1.5",
                rows.length > 0 ? "bg-inset" : weekend ? "bg-panel-2/40 opacity-60" : "bg-panel-2/40",
                isToday && "ring-1 ring-accent",
              )}
            >
              <div className="flex items-baseline justify-between px-0.5">
                <span
                  className={clsx(
                    "tnum text-[11.5px]",
                    isToday ? "font-bold text-accent-text" : "font-medium text-ink-3",
                  )}
                >
                  {new Date(day).getDate()}
                </span>
                {rows.length > 0 && (
                  <span className="tnum text-[10px] text-ink-4">{rows.length}</span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {rows.slice(0, 3).map((meeting) => (
                  <button
                    key={meeting.event_id}
                    type="button"
                    onClick={() => onOpen(meeting.event_id)}
                    title={`${meeting.subject} — ${clockOf(meeting.start)}`}
                    className="block w-full truncate rounded-md bg-panel px-1 py-0.5 text-left text-[10.5px] leading-tight transition hover:bg-panel-3"
                  >
                    <span className="tnum text-ink-4">
                      {meeting.is_all_day ? "" : `${clockOf(meeting.start)} `}
                    </span>
                    {meeting.subject}
                  </button>
                ))}
                {rows.length > 3 && (
                  <p className="px-1 text-[10px] text-ink-4">+{rows.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── one meeting ─────────────────────────────────────────────────────── */

function MeetingDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, error } = useSWR<MeetingDetailOut>(id ? `/meetings/${encodeURIComponent(id)}` : null, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const people = (data?.attendees ?? []).filter((a) => !a.is_resource);
  const rooms = (data?.attendees ?? []).filter((a) => a.is_resource);

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      width="lg"
      title={data ? data.subject : "Meeting"}
      description={
        data
          ? `${fmtDate(data.start)} · ${clockOf(data.start)} – ${clockOf(data.end)}`
          : "Reading the invitation."
      }
      footer={
        <>
          {data?.web_link && (
            <a
              href={data.web_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-line px-4 text-[13px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              <ExternalLink className="size-3.5" />
              Open in Outlook
            </a>
          )}
          {data?.is_online && data.join_url && (
            <a
              href={data.join_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-[13px] bg-accent px-5 text-[13px] font-bold text-accent-ink transition hover:bg-accent-hover"
            >
              <Video className="size-3.5" strokeWidth={2.4} />
              Join
            </a>
          )}
        </>
      }
    >
      {error ? (
        <p className="pb-4 text-[13px] text-ink-3">
          This meeting could not be read. It may have been cancelled or removed from your
          calendar.
        </p>
      ) : !data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="space-y-5 pb-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Meta label="When">
              {data.is_all_day ? "All day" : `${clockOf(data.start)} – ${clockOf(data.end)}`}
            </Meta>
            <Meta label="Where">
              {data.is_online
                ? data.online_provider ?? "Online"
                : data.location ?? "—"}
            </Meta>
            <Meta label="Organiser">{data.organizer?.name ?? "—"}</Meta>
            <Meta label="Your reply">{humanise(data.my_response)}</Meta>
            <Meta label="Repeats">{data.is_recurring ? "Yes" : "No"}</Meta>
            <Meta label="Importance">{humanise(data.importance ?? "normal")}</Meta>
          </dl>

          {data.body_preview && (
            <div>
              <p className="mb-1.5 micro text-ink-4">Invitation</p>
              <p className="whitespace-pre-wrap rounded-2xl bg-inset p-4 text-[13px] leading-relaxed">
                {data.body_preview}
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 micro text-ink-4">
              Who is on it · {people.length}
            </p>
            <ul className="space-y-1">
              {people.map((person) => (
                <li
                  key={person.email ?? person.name}
                  className="flex items-center gap-2.5 rounded-xl bg-inset px-3 py-2"
                >
                  <Avatar
                    name={person.name}
                    seed={person.email ?? person.name}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {person.name}
                      {person.is_organizer && (
                        <span className="ml-1.5 text-[11px] font-normal text-ink-4">
                          organiser
                        </span>
                      )}
                    </span>
                    {person.email && (
                      <span className="block truncate text-[11px] text-ink-4">
                        {person.email}
                      </span>
                    )}
                  </span>
                  {person.kind === "optional" && <Badge tone="neutral">Optional</Badge>}
                  <ResponseBadge response={person.response} />
                </li>
              ))}
            </ul>
          </div>

          {rooms.length > 0 && (
            <div>
              {/* Listed apart because a room is not a person: counting it as
                  one makes a two-person meeting look like three. */}
              <p className="mb-2 micro text-ink-4">Rooms and equipment</p>
              <div className="flex flex-wrap gap-1.5">
                {rooms.map((room) => (
                  <Badge key={room.email ?? room.name} tone="neutral">
                    {room.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── bits ────────────────────────────────────────────────────────────── */

function clockOf(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/**
 * How somebody answered.
 *
 * `none` is not rendered at all: Graph returns it for the organiser and for
 * events with no invitation, and a badge reading "None" beside the person who
 * called the meeting is noise. `notResponded` *is* rendered, because that is
 * the one worth chasing.
 */
function ResponseBadge({ response }: { response: AttendeeOut["response"] }) {
  if (response === "none" || response === "organizer") return null;
  const tone =
    response === "accepted"
      ? "positive"
      : response === "declined"
        ? "danger"
        : response === "tentativelyAccepted"
          ? "warn"
          : "neutral";
  const label =
    response === "tentativelyAccepted"
      ? "Maybe"
      : response === "notResponded"
        ? "No reply"
        : humanise(response);
  return <Badge tone={tone}>{label}</Badge>;
}
