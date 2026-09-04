"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { date as fmtDate, isoDay } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui/controls";

export interface Range {
  start: string | null;
  end: string | null;
}

export const EMPTY_RANGE: Range = { start: null, end: null };

/**
 * A date range for the quote list.
 *
 * The backend takes `date_start` and `date_end` as inclusive YYYY-MM-DD, so
 * that is exactly what this produces — no timezone conversion anywhere, since
 * a quote's date is a calendar day rather than an instant.
 *
 * The presets are the ranges people actually ask for out loud. The two inputs
 * underneath exist because somebody eventually wants a range no preset covers.
 */
export function DateRange({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Range>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = Boolean(value.start || value.end);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "lift inline-flex h-10 min-w-[150px] items-center gap-3 rounded-full px-4 text-[12.5px] transition",
          active ? "bg-accent text-accent-ink font-semibold" : "bg-panel text-ink-3 hover:text-ink",
        )}
      >
        {label(value)}
        {active ? (
          <span
            role="button"
            aria-label="Clear the date range"
            onClick={(e) => {
              e.stopPropagation();
              onChange(EMPTY_RANGE);
              setOpen(false);
            }}
            className="ml-auto grid size-4 place-items-center rounded-full opacity-70 transition hover:opacity-100"
          >
            <X className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <CalendarDays className="ml-auto size-3.5 text-ink-4" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div className="rise absolute left-0 top-[calc(100%+8px)] z-30 w-[300px] rounded-[20px] border border-line bg-panel p-4 shadow-[var(--shadow-float)]">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const range = preset.build();
                  onChange(range);
                  setOpen(false);
                }}
                className="rounded-full bg-panel-2 px-3 py-1.5 text-[11.5px] font-medium text-ink-2 transition hover:bg-panel-3 hover:text-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="From">
              <Input
                type="date"
                value={draft.start ?? ""}
                max={draft.end ?? undefined}
                onChange={(e) => setDraft({ ...draft, start: e.target.value || null })}
                className="h-9"
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={draft.end ?? ""}
                min={draft.start ?? undefined}
                onChange={(e) => setDraft({ ...draft, end: e.target.value || null })}
                className="h-9"
              />
            </Field>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                onChange(EMPTY_RANGE);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="accent"
              className="flex-1"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function label(range: Range): string {
  if (!range.start && !range.end) return "Any date";
  if (range.start && !range.end) return `From ${fmtDate(range.start)}`;
  if (!range.start && range.end) return `To ${fmtDate(range.end)}`;
  return `${fmtDate(range.start)} – ${fmtDate(range.end)}`;
}

/** Both ends inclusive, matching what the backend does with them. */
const PRESETS: { label: string; build: () => Range }[] = [
  {
    label: "Last 30 days",
    build: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return { start: isoDay(start), end: isoDay(end) };
    },
  },
  {
    label: "This month",
    build: () => {
      const now = new Date();
      return {
        start: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "This quarter",
    build: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: isoDay(new Date(now.getFullYear(), q * 3, 1)),
        end: isoDay(new Date(now.getFullYear(), q * 3 + 3, 0)),
      };
    },
  },
  {
    label: "This year",
    build: () => {
      const year = new Date().getFullYear();
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    },
  },
];
