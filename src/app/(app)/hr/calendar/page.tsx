"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR, { mutate as mutateKey } from "swr";
import { CalendarHeart, ChevronLeft, ChevronRight, Megaphone, Trash2 } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { isoDay } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { isHrViewer } from "@/lib/hr";
import {
  KIND_LABEL,
  OFFICES,
  addDays,
  defaultShowFrom,
  rangeLabel,
  rangeShort,
  whenLabel,
  type CalendarEntry,
  type CalendarEntryIn,
  type CalendarKind,
  type Office,
} from "@/lib/hrCalendar";
import { useSession } from "@/lib/session";
import { Badge, PageHead } from "@/components/ui/primitives";
import { Toggle } from "@/components/ui/controls";
import { PanelSkeleton } from "@/components/ui/feedback";
import { Drawer } from "@/components/payroll/Drawer";
import {
  AreaBox,
  Btn,
  IconBtn,
  Labeled,
  MonthArrows,
  Note,
  SelectBox,
  Stats,
  Surface,
  TD,
  TextBox,
  TH,
  UnderlineTabs,
} from "@/components/payroll/ui";

type KindTab = CalendarKind | "all";

/** What the side panel is doing: changing an entry, or adding one. */
interface Editing {
  entry?: CalendarEntry;
  kind: CalendarKind;
  date?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Public holidays and HR notices.
 *
 * Everybody can open it to see the year's holidays. HR also adds and changes
 * entries here. Each entry shows on everybody's dashboard from its "show from"
 * day until it ends, as a card and, once per person, as a pop-up.
 */
export default function HrCalendarPage() {
  const session = useSession();
  const hr = isHrViewer(session);
  const today = isoDay(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [tab, setTab] = useState<KindTab>("all");
  const [office, setOffice] = useState<Office>("all");
  const [editing, setEditing] = useState<Editing | null>(null);

  const list = useSWR<CalendarEntry[]>(withQuery("/hr/calendar", { year: cursor.year }));
  const all = list.data ?? [];
  // "UAE office" means what a UAE person gets: everyone's entries plus theirs.
  const forOffice = all.filter((e) => office === "all" || e.office === "all" || e.office === office);
  const rows = forOffice.filter((e) => tab === "all" || e.kind === tab);
  const holidays = forOffice.filter((e) => e.kind === "holiday");
  const holidayDays = holidays.reduce((n, e) => n + daysInYear(e, cursor.year), 0);
  const next = holidays.find((e) => e.starts_on > today);

  const moveMonth = (by: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const saved = () => {
    void list.mutate();
    void mutateKey("/hr/calendar/upcoming");
  };

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Calendar"
        title="Holidays & notices"
        actions={
          hr && (
            <div className="flex gap-2">
              <Btn icon={Megaphone} onClick={() => setEditing({ kind: "notice" })}>
                Post notice
              </Btn>
              <Btn variant="accent" icon={CalendarHeart} onClick={() => setEditing({ kind: "holiday" })}>
                Add holiday
              </Btn>
            </div>
          )
        }
      />

      <Surface>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "All", count: list.data ? forOffice.length : undefined },
            { value: "holiday", label: "Holidays", count: list.data ? holidays.length : undefined },
            {
              value: "notice",
              label: "Notices",
              count: list.data ? forOffice.length - holidays.length : undefined,
            },
          ]}
          right={
            <>
              <SelectBox
                aria-label="Office"
                value={office}
                onChange={(ev) => setOffice(ev.target.value as Office)}
                className="w-36!"
              >
                <option value="all">All offices</option>
                <option value="AE">UAE office</option>
                <option value="IN">India office</option>
              </SelectBox>
              <div className="flex items-center gap-1">
                <IconBtn
                  icon={ChevronLeft}
                  label="Previous year"
                  onClick={() => setCursor((c) => ({ ...c, year: c.year - 1 }))}
                />
                <span className="tnum w-12 text-center text-[13px] font-semibold text-ink">
                  {cursor.year}
                </span>
                <IconBtn
                  icon={ChevronRight}
                  label="Next year"
                  onClick={() => setCursor((c) => ({ ...c, year: c.year + 1 }))}
                />
              </div>
            </>
          }
        />
        {list.data && (
          <Stats
            items={[
              {
                label: `Holidays in ${cursor.year}`,
                value: `${holidays.length} · ${holidayDays} ${holidayDays === 1 ? "day" : "days"}`,
              },
              {
                label: "Next holiday",
                value: next ? `${next.title} · ${rangeLabel(next.starts_on, next.ends_on)}` : "—",
              },
              {
                label: "On dashboards now",
                value: String(forOffice.filter((e) => e.showing).length),
              },
            ]}
          />
        )}
        {hr && (
          <Note>
            A holiday shows on dashboards two weeks before it and a notice from the day it is
            posted. Each one stays there until its last day. Who is in which office comes from
            payroll. People not on payroll see every office&rsquo;s entries.
          </Note>
        )}

        <div className="grid lg:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="border-b border-line lg:border-b-0 lg:border-r">
            <MonthGrid
              year={cursor.year}
              month={cursor.month}
              entries={forOffice}
              today={today}
              hr={hr}
              onMove={moveMonth}
              onPick={(day, entry) =>
                setEditing(entry ? { entry, kind: entry.kind } : { kind: "holiday", date: day })
              }
            />
          </div>

          <div className="min-w-0">
            {list.error ? (
              <Note tone="danger">{list.error.message}</Note>
            ) : !list.data ? (
              <PanelSkeleton lines={6} className="p-4" />
            ) : rows.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-ink-3">
                <p>Nothing for {cursor.year} yet.</p>
                {hr && (
                  <p className="mt-1 text-ink-4">
                    Add the year&rsquo;s public holidays. Each one shows on everyone&rsquo;s dashboard
                    two weeks ahead.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr>
                      <th className={TH}>When</th>
                      <th className={TH}>Name</th>
                      <th className={TH}>Type</th>
                      <th className={TH}>Office</th>
                      <th className={TH}>On dashboards</th>
                      {hr && <th className={clsx(TH, "text-right!")}>Seen by</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const past = e.ends_on < today;
                      return (
                        <tr
                          key={e.id}
                          onClick={hr ? () => setEditing({ entry: e, kind: e.kind }) : undefined}
                          className={clsx(hr && "cursor-pointer hover:bg-panel-2/50")}
                        >
                          <td className={clsx(TD, "whitespace-nowrap", past ? "text-ink-4" : "text-ink-2")}>
                            {rangeLabel(e.starts_on, e.ends_on)}
                            {e.days > 1 && (
                              <span className="block text-[11.5px] text-ink-4">{e.days} days</span>
                            )}
                          </td>
                          <td className={TD}>
                            <span className={clsx("block font-medium", past ? "text-ink-3" : "text-ink")}>
                              {e.title}
                            </span>
                            {e.details && (
                              <span className="block max-w-md truncate text-[11.5px] text-ink-4">
                                {e.details}
                              </span>
                            )}
                          </td>
                          <td className={TD}>
                            <Badge tone={e.kind === "holiday" ? "accent" : "info"}>
                              {KIND_LABEL[e.kind]}
                            </Badge>
                          </td>
                          <td className={clsx(TD, "text-ink-3")}>{e.office_label}</td>
                          <td className={clsx(TD, "text-ink-3")}>
                            {e.showing ? (
                              <Badge tone="positive">Showing now</Badge>
                            ) : past ? (
                              "Ended"
                            ) : (
                              `From ${rangeLabel(e.show_from, e.show_from)}`
                            )}
                            {e.popup && !past && (
                              <span className="block text-[11px] text-ink-4">with pop-up</span>
                            )}
                          </td>
                          {hr && (
                            <td className={clsx(TD, "tnum text-right text-ink-3")}>
                              {e.popup ? (e.seen_count ?? 0) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Surface>

      {editing && (
        <EntryDrawer
          key={editing.entry?.id ?? `new-${editing.kind}-${editing.date ?? ""}`}
          editing={editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={() => {
            saved();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Days of an entry that fall inside one year, for the year's total. */
function daysInYear(e: CalendarEntry, year: number): number {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const start = e.starts_on < first ? first : e.starts_on;
  const end = e.ends_on > last ? last : e.ends_on;
  if (end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) n += 1;
  return n;
}

/* ── the month ───────────────────────────────────────────────────────── */

function MonthGrid({
  year,
  month,
  entries,
  today,
  hr,
  onMove,
  onPick,
}: {
  year: number;
  month: number;
  entries: CalendarEntry[];
  today: string;
  hr: boolean;
  onMove: (by: number) => void;
  onPick: (day: string, entry: CalendarEntry | undefined) => void;
}) {
  const { cells, byDay, inMonth } = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const count = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
    const days = Array.from({ length: count }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`);
    const first = days[0];
    const last = days[days.length - 1];
    const map = new Map<string, CalendarEntry[]>();
    const seen: CalendarEntry[] = [];
    for (const e of entries) {
      if (e.ends_on < first || e.starts_on > last) continue;
      seen.push(e);
      const from = e.starts_on < first ? first : e.starts_on;
      const to = e.ends_on > last ? last : e.ends_on;
      for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, [...(map.get(d) ?? []), e]);
    }
    const grid: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
    while (grid.length % 7 !== 0) grid.push(null);
    return { cells: grid, byDay: map, inMonth: seen };
  }, [year, month, entries]);

  return (
    <div className="p-4">
      <MonthArrows label={`${MONTHS[month]} ${year}`} onMove={onMove} />
      <div className="mt-3 grid grid-cols-7 text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} className="h-9" />;
          const on = byDay.get(day) ?? [];
          const holiday = on.find((e) => e.kind === "holiday");
          const notice = on.some((e) => e.kind === "notice");
          const weekend = i % 7 >= 5;
          // Only HR acts on a day. The tooltip with the day's entries is for everyone.
          const clickable = hr;
          return (
            <button
              key={day}
              type="button"
              aria-disabled={!clickable}
              title={on.map((e) => e.title).join("\n") || undefined}
              onClick={() => clickable && onPick(day, holiday ?? on[0])}
              className={clsx(
                "relative grid h-9 place-items-center rounded-md text-[12.5px] transition",
                holiday
                  ? "bg-accent-soft font-semibold text-accent-text"
                  : weekend
                    ? "text-ink-4"
                    : "text-ink-2",
                clickable && !holiday && "hover:bg-panel-2",
                day === today && "ring-1 ring-inset ring-[var(--accent)]",
                !clickable && "cursor-default",
              )}
            >
              {Number(day.slice(8))}
              {notice && (
                <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-info" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-ink-4">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent-soft" /> Holiday
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-info" /> Notice
        </span>
      </div>

      {inMonth.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line text-[12.5px]">
          {inMonth.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 py-1.5">
              <span className="tnum w-20 shrink-0 text-ink-4">
                {rangeShort(e.starts_on, e.ends_on)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{e.title}</span>
              <span className="shrink-0 text-[11px] text-ink-4">{whenLabel(e, today)}</span>
            </li>
          ))}
        </ul>
      )}
      {hr && <p className="mt-3 text-[11px] text-ink-4">Click a day to add a holiday on it.</p>}
    </div>
  );
}

/* ── add / change ────────────────────────────────────────────────────── */

function EntryDrawer({
  editing,
  today,
  onClose,
  onSaved,
}: {
  editing: Editing;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const e = editing.entry;
  const [kind, setKind] = useState<CalendarKind>(e?.kind ?? editing.kind);
  const [title, setTitle] = useState(e?.title ?? "");
  const [start, setStart] = useState(e?.starts_on ?? editing.date ?? "");
  const [end, setEnd] = useState(e && e.ends_on !== e.starts_on ? e.ends_on : "");
  const [office, setOffice] = useState<Office>(e?.office ?? "all");
  const [details, setDetails] = useState(e?.details ?? "");
  // Until HR picks a day, "show from" follows the first day and the type.
  const [showFrom, setShowFrom] = useState(e?.show_from ?? "");
  const [showTouched, setShowTouched] = useState(Boolean(e));
  const [popup, setPopup] = useState(e?.popup ?? true);

  const lastDay = end || start;
  const show = showTouched ? showFrom : start ? defaultShowFrom(kind, start, today) : "";
  const moved =
    e !== undefined && (start !== e.starts_on || lastDay !== e.ends_on || office !== e.office);
  const badOrder = Boolean(end && start && end < start);
  const neverShows = Boolean(show && lastDay && show > lastDay);
  const audience =
    office === "all" ? "everyone's" : `the ${OFFICES.find((o) => o.value === office)?.label}'s`;

  const save = useAction(() => {
    const body: CalendarEntryIn = {
      kind,
      title: title.trim(),
      starts_on: start,
      ends_on: end || null,
      details: details.trim() || null,
      office,
      show_from: show || null,
      popup,
    };
    return e
      ? api.put<CalendarEntry>(`/hr/calendar/${e.id}`, body)
      : api.post<CalendarEntry>("/hr/calendar", body);
  });
  // True only on success, so the caller can tell a refusal from a 204.
  const remove = useAction(async () => {
    await api.del<void>(`/hr/calendar/${e?.id}`);
    return true;
  });

  const noun = kind === "holiday" ? "holiday" : "notice";

  return (
    <Drawer
      open
      onClose={onClose}
      title={e ? e.title : kind === "holiday" ? "Add a holiday" : "Post a notice"}
      subtitle={
        e
          ? `${KIND_LABEL[e.kind]} · ${e.office_label}${e.created_by_name ? ` · added by ${e.created_by_name}` : ""}`
          : undefined
      }
      footer={
        <>
          <Btn
            type="button"
            variant="accent"
            loading={save.pending}
            disabled={!title.trim() || !start || badOrder || neverShows}
            onClick={async () => {
              if (await save.run()) onSaved();
            }}
          >
            {e ? "Save" : kind === "holiday" ? "Add holiday" : "Post notice"}
          </Btn>
          <Btn type="button" onClick={onClose}>
            Cancel
          </Btn>
          {e && (
            <Btn
              type="button"
              variant="danger"
              icon={Trash2}
              className="ml-auto"
              loading={remove.pending}
              onClick={async () => {
                if (!window.confirm(`Delete "${e.title}"? It comes off every dashboard.`)) return;
                if (await remove.run()) onSaved();
              }}
            >
              Delete
            </Btn>
          )}
        </>
      }
    >
      {/* Not a <form>: the shared Toggle is a button with no type, and inside
          a form it would submit it. */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Type" required>
            <SelectBox value={kind} onChange={(ev) => setKind(ev.target.value as CalendarKind)}>
              <option value="holiday">Holiday: the office is closed</option>
              <option value="notice">Notice: anything else</option>
            </SelectBox>
          </Labeled>
          <Labeled label="For" required>
            <SelectBox value={office} onChange={(ev) => setOffice(ev.target.value as Office)}>
              {OFFICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectBox>
          </Labeled>
        </div>
        <Labeled label="Name" required>
          <TextBox
            required
            maxLength={200}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder={kind === "holiday" ? "UAE National Day" : "Office closes at 1 pm"}
            autoFocus={!e}
          />
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label={kind === "holiday" ? "First day" : "Date"} required>
            <TextBox type="date" required value={start} onChange={(ev) => setStart(ev.target.value)} />
          </Labeled>
          <Labeled label={kind === "holiday" ? "Last day" : "Until"} hint="Leave blank for one day.">
            <TextBox
              type="date"
              value={end}
              min={start || undefined}
              onChange={(ev) => setEnd(ev.target.value)}
            />
          </Labeled>
        </div>
        <Labeled label="Details">
          <AreaBox
            maxLength={4000}
            value={details}
            onChange={(ev) => setDetails(ev.target.value)}
            placeholder={
              kind === "holiday"
                ? "Optional. For example: the office reopens on Thursday 4 December."
                : "What people should know."
            }
          />
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled
            label="Show on dashboards from"
            hint={kind === "holiday" ? "Two weeks before, unless you pick a day." : "Today, unless you pick a day."}
          >
            <TextBox
              type="date"
              value={show}
              max={lastDay || undefined}
              onChange={(ev) => {
                setShowFrom(ev.target.value);
                setShowTouched(true);
              }}
            />
          </Labeled>
        </div>
        <div className="border-t border-line pt-3">
          <Toggle
            checked={popup}
            onChange={setPopup}
            label="Also show it as a pop-up"
            hint="Once for each person, the first time they open the dashboard while it is showing."
          />
        </div>

        {start && show && !badOrder && !neverShows && (
          <p className="text-[12px] text-ink-3">
            On {audience} dashboards from {rangeLabel(show, show, true)} until{" "}
            {rangeLabel(lastDay, lastDay, true)}.
          </p>
        )}
        {badOrder && <Note tone="warn">The last day is before the first day.</Note>}
        {neverShows && (
          <Note tone="warn">
            It would start showing after its last day, so nobody would see it.
          </Note>
        )}
        {moved && (e?.seen_count ?? 0) > 0 && popup && (
          <Note>New dates or a different office: everyone gets this {noun}&rsquo;s pop-up again.</Note>
        )}
        {save.error && <Note tone="danger">{save.error}</Note>}
        {remove.error && <Note tone="danger">{remove.error}</Note>}
      </div>
    </Drawer>
  );
}
