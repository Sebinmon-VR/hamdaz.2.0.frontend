"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ArrowUpRight, CalendarHeart, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import {
  KIND_LABEL,
  rangeLabel,
  whenLabel,
  type CalendarEntry,
  type Upcoming,
} from "@/lib/hrCalendar";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Modal } from "@/components/ui/feedback";

const UPCOMING = "/hr/calendar/upcoming";

/**
 * HR's holidays and notices on the dashboard: a "Coming up" card, and a
 * one-time pop-up for anything new.
 *
 * The backend decides what is showing (each entry has a window, and an office)
 * and who has already had the pop-up, so this does no date logic of its own.
 * If the call fails it renders nothing, because a missing holiday card should
 * not break the dashboard.
 */
export function HrAnnouncements() {
  const up = useSWR<Upcoming>(UPCOMING, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // What is open in the dialog: the unseen pop-ups, or one row someone clicked.
  const [opened, setOpened] = useState<CalendarEntry[] | null>(null);
  const [closed, setClosed] = useState(false);

  const data = up.data;
  if (!data) return null;

  const unseen = data.showing.filter((e) => e.popup && !e.seen);
  const dialog = opened ?? (!closed && unseen.length > 0 ? unseen : null);

  const close = () => {
    const shown = dialog ?? [];
    setOpened(null);
    setClosed(true);
    const ids = shown.filter((e) => !e.seen).map((e) => e.id);
    if (ids.length === 0) return;
    // Optimistic: the card stops counting them as new straight away. A failed
    // write only means the pop-up comes back on the next visit.
    void up.mutate(
      { ...data, showing: data.showing.map((e) => (ids.includes(e.id) ? { ...e, seen: true } : e)) },
      false,
    );
    api.post("/hr/calendar/seen", { ids }).catch(() => undefined);
  };

  const rows = data.showing;
  const next = data.next_holiday;

  return (
    <>
      {(rows.length > 0 || next) && (
        <section className="rounded-xl border border-line bg-panel">
          <header className="flex items-center gap-2 border-b border-line px-4 py-2">
            <CalendarHeart className="size-4 text-ink-3" strokeWidth={2} />
            <h2 className="text-[13px] font-semibold text-ink">Coming up</h2>
            <Link
              href="/hr/calendar"
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 transition hover:text-ink"
            >
              All holidays
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </Link>
          </header>
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id}>
                <EntryRow entry={e} today={data.today} onOpen={() => setOpened([e])} />
              </li>
            ))}
            {next && (
              <li>
                <EntryRow entry={next} today={data.today} muted onOpen={() => setOpened([next])} />
              </li>
            )}
          </ul>
        </section>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        width="md"
        title={dialogTitle(dialog ?? [])}
        footer={
          <Button variant="accent" size="sm" onClick={close}>
            Got it
          </Button>
        }
      >
        <ul className="divide-y divide-line pb-3">
          {(dialog ?? []).map((e) => (
            <li key={e.id} className="py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={e.kind === "holiday" ? "accent" : "info"}>{KIND_LABEL[e.kind]}</Badge>
                <span className="text-[12.5px] text-ink-2">
                  {rangeLabel(e.starts_on, e.ends_on, true)}
                  {e.days > 1 && <span className="text-ink-4"> · {e.days} days</span>}
                </span>
                <span className="ml-auto text-[12px] text-ink-4">{whenLabel(e, data.today)}</span>
              </div>
              <p className="mt-1.5 text-[15px] font-semibold text-ink">{e.title}</p>
              {e.details && (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                  {e.details}
                </p>
              )}
              {e.office !== "all" && (
                <p className="mt-1 text-[11.5px] text-ink-4">For the {e.office_label}</p>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function dialogTitle(entries: CalendarEntry[]): string {
  if (entries.length === 0) return "From HR";
  if (entries.every((e) => e.kind === "holiday")) {
    return entries.length === 1 ? "Holiday coming up" : "Holidays coming up";
  }
  if (entries.every((e) => e.kind === "notice")) return "Notice from HR";
  return "From HR";
}

function EntryRow({
  entry: e,
  today,
  muted,
  onOpen,
}: {
  entry: CalendarEntry;
  today: string;
  muted?: boolean;
  onOpen: () => void;
}) {
  const when = whenLabel(e, today);
  const now = when === "Today" || when === "On now";
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-panel-2/60"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-2 text-ink-3">
        {e.kind === "holiday" ? (
          <CalendarHeart className="size-3.5" strokeWidth={2} />
        ) : (
          <Megaphone className="size-3.5" strokeWidth={2} />
        )}
      </span>
      <span className="w-36 shrink-0 text-[12.5px] text-ink-2 max-sm:hidden">
        {rangeLabel(e.starts_on, e.ends_on)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx("block truncate text-[13px]", muted ? "text-ink-3" : "font-medium text-ink")}>
          {muted && <span className="text-ink-4">Next holiday · </span>}
          {e.title}
          {e.popup && e.seen === false && (
            <span className="ml-2 align-middle text-[10.5px] font-semibold uppercase tracking-wide text-accent-text">
              New
            </span>
          )}
        </span>
        {e.details && !muted && (
          <span className="block truncate text-[11.5px] text-ink-4">{e.details}</span>
        )}
        <span className="block text-[11.5px] text-ink-4 sm:hidden">
          {rangeLabel(e.starts_on, e.ends_on)}
        </span>
      </span>
      {e.office !== "all" && (
        <span className="shrink-0 text-[11.5px] text-ink-4 max-md:hidden">{e.office_label}</span>
      )}
      <span
        className={clsx(
          "tnum w-20 shrink-0 text-right text-[12px]",
          now ? "font-semibold text-accent-text" : "text-ink-3",
        )}
      >
        {when}
      </span>
    </button>
  );
}
