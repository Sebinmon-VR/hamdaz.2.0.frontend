"use client";

/**
 * The vocabulary of the projects module, in one place.
 *
 * Five closed sets — a project's status, a health dial, a dial's trend, a
 * milestone's standing against its own date, and how far along a task is —
 * plus the two composite pieces that draw them: the dial grid and the
 * milestone timeline.
 *
 * They live here rather than in each screen because a project is read in six
 * places (the board, the list, one project, the plan, the portfolio, and a
 * filed status report) and a schedule that is amber on one of them and red on
 * another is worse than no colour at all. One definition, six callers — and
 * the sixth, the report, is drawing a *snapshot* rather than the live project,
 * which is exactly why every function here takes plain values rather than a
 * project.
 */

import clsx from "clsx";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { dateShort, humanise } from "@/lib/format";
import { Badge, type Tone } from "@/components/ui/primitives";

/* ── a health dial ───────────────────────────────────────────────────── */

/**
 * What each colour *means*, never the colour itself.
 *
 * A dial that says "Amber" makes the reader do the translation, and the two
 * people either side of a status report translate it differently. The words
 * are the verdict; the colour is only how it is drawn.
 */
export const RAG_LABELS: Record<string, string> = {
  green: "On track",
  amber: "At risk",
  red: "Off track",
  grey: "Not assessed",
};

const RAG_TONE: Record<string, Tone> = {
  green: "positive",
  amber: "warn",
  red: "danger",
  grey: "neutral",
};

/** The raw colour, for a dot or a bar that is not a badge. */
export const RAG_COLOR: Record<string, string> = {
  green: "var(--positive)",
  amber: "var(--warn)",
  red: "var(--danger)",
  grey: "var(--ink-4)",
};

export function RagBadge({ value, title }: { value: string | null; title?: string }) {
  const key = value ?? "grey";
  return (
    <Badge tone={RAG_TONE[key] ?? "neutral"} title={title}>
      {RAG_LABELS[key] ?? humanise(key)}
    </Badge>
  );
}

/**
 * The verdict as a filled block, for a listing.
 *
 * The same drawing as a dial on a status report, shrunk to a row — a column
 * of these is the thing you scan down a project list for, and a column of
 * dots makes you look up what each one meant.
 */
export function RagChip({
  value,
  word = true,
  className,
}: {
  value: string | null;
  /** Dropped where the column is too narrow for it and the colour must carry. */
  word?: boolean;
  className?: string;
}) {
  const key = value ?? "grey";
  const label = RAG_LABELS[key] ?? humanise(key);
  const hollow = key === "grey";
  return (
    <span
      title={label}
      className={clsx(
        "inline-flex h-[17px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold uppercase tracking-[0.04em]",
        word ? "px-2" : "w-7",
        hollow && "border-[1.5px] border-ink-4 bg-panel-3 text-ink-3",
        className,
      )}
      style={hollow ? undefined : { background: RAG_COLOR[key], color: "var(--on-rag)" }}
    >
      {word ? label : <span className="sr-only">{label}</span>}
    </span>
  );
}

/**
 * The colour alone, as a dot.
 *
 * For a row where the word would be the fourth piece of text competing for the
 * same glance — a portfolio table, a board card's corner. Never on its own
 * where it is the only signal: the title carries what it means.
 */
export function RagDot({
  value,
  size = 10,
  className,
}: {
  value: string | null;
  size?: number;
  className?: string;
}) {
  const key = value ?? "grey";
  return (
    <span
      title={RAG_LABELS[key] ?? key}
      aria-label={RAG_LABELS[key] ?? key}
      className={clsx("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: RAG_COLOR[key],
        // Grey is an absence rather than a state, so it is drawn hollow. A
        // solid grey dot in a column of solid dots reads as a fourth verdict.
        boxShadow: key === "grey" ? "inset 0 0 0 99px var(--panel-3)" : undefined,
        border: key === "grey" ? "1.5px solid var(--ink-4)" : undefined,
      }}
    />
  );
}

/* ── which way it is moving ──────────────────────────────────────────── */

const TREND_ICON: Record<string, LucideIcon> = {
  improving: ArrowUpRight,
  steady: Minus,
  declining: ArrowDownRight,
};

export const TREND_LABELS: Record<string, string> = {
  improving: "Improving",
  steady: "Steady",
  declining: "Declining",
};

/**
 * The chevron beside a dial.
 *
 * Worth showing separately from the colour because they say different things:
 * amber-improving is a project being recovered and amber-declining is a
 * project about to go red, and a manager reading a portfolio should spend
 * their attention on the second.
 */
export function Trend({ value, className }: { value: string | null; className?: string }) {
  const key = value ?? "steady";
  const Icon = TREND_ICON[key] ?? Minus;
  return (
    <span
      title={TREND_LABELS[key] ?? key}
      className={clsx(
        "inline-flex items-center",
        key === "improving" && "text-positive",
        key === "declining" && "text-danger",
        key === "steady" && "text-ink-4",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
    </span>
  );
}

/* ── where a project is in its life ──────────────────────────────────── */

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  done: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Status is not health, and the colours keep them apart.
 *
 * A project can be active and red, or on hold and green — one says whether
 * work is happening, the other whether it is going well. So status never
 * borrows the RAG palette: `on_hold` is neutral rather than amber, because a
 * deliberately paused project is not a project at risk.
 */
const PROJECT_STATUS_TONE: Record<string, Tone> = {
  planned: "neutral",
  active: "accent",
  on_hold: "neutral",
  done: "positive",
  cancelled: "neutral",
};

export function ProjectStatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={PROJECT_STATUS_TONE[value] ?? "neutral"}>
      {PROJECT_STATUS_LABELS[value] ?? humanise(value)}
    </Badge>
  );
}

/* ── how far along one task is ───────────────────────────────────────── */

/**
 * The same five words the reports module uses, and deliberately so: the
 * backend keeps the two vocabularies identical so a project task landing on a
 * status report carries its own state across unchanged.
 */
export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

const TASK_STATUS_TONE: Record<string, Tone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "danger",
  done: "positive",
  dropped: "neutral",
};

export function TaskStatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={TASK_STATUS_TONE[value] ?? "neutral"}>
      {TASK_STATUS_LABELS[value] ?? humanise(value)}
    </Badge>
  );
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * Only `critical` is coloured, and `medium` draws nothing at all.
 *
 * Every task has a priority, so a badge on every row is a badge on no row. The
 * default is silent and the top of the scale is loud, which is the only part
 * anybody scans for.
 */
export function PriorityBadge({ value }: { value: string }) {
  if (value === "medium") return null;
  return (
    <Badge tone={value === "critical" ? "danger" : value === "high" ? "warn" : "neutral"}>
      {PRIORITY_LABELS[value] ?? humanise(value)}
    </Badge>
  );
}

/* ── a milestone against its own date ────────────────────────────────── */

export const MILESTONE_STATE_LABELS: Record<string, string> = {
  done: "Done",
  due: "Due this week",
  overdue: "Overdue",
  upcoming: "Ahead",
  undated: "No date",
};

const MILESTONE_STATE_TONE: Record<string, Tone> = {
  done: "positive",
  due: "warn",
  overdue: "danger",
  upcoming: "neutral",
  undated: "neutral",
};

export function MilestoneStateBadge({ value }: { value: string | null }) {
  const key = value ?? "undated";
  return (
    <Badge tone={MILESTONE_STATE_TONE[key] ?? "neutral"}>
      {MILESTONE_STATE_LABELS[key] ?? humanise(key)}
    </Badge>
  );
}

export const PLAN_LABELS: Record<string, string> = {
  on_plan: "On plan",
  off_plan_no_impact: "Moved, no impact",
  off_plan_impact: "Moved, knock-on impact",
};

/**
 * Only the two off-plan markers are drawn.
 *
 * "On plan" is the default and the majority, and a row of green "on plan"
 * chips would bury the one milestone whose slip pushed something else — which
 * is the distinction the three markers exist to make.
 */
export function PlanBadge({ value }: { value: string | null }) {
  if (!value || value === "on_plan") return null;
  return (
    <Badge tone={value === "off_plan_impact" ? "danger" : "warn"}>
      {PLAN_LABELS[value] ?? humanise(value)}
    </Badge>
  );
}

/* ── the five dials ──────────────────────────────────────────────────── */

export interface Dial {
  key: string;
  label: string;
  rag: string;
  trend: string;
  suggested?: string | null;
  suggested_reason?: string | null;
  differs?: boolean;
}

/**
 * The dial grid — the block at the top of every status report.
 *
 * Each tile carries the lead's colour, the direction it is moving, and, where
 * anything can compute one, what the dates or the budget would have said. The
 * suggestion is drawn *underneath* and only when it disagrees: agreement is
 * not news, and a tile that argued with its own lead on every project would
 * teach people to ignore the line.
 *
 * `onSet` turns it into a control. Without it — on a filed report, or for
 * somebody who does not run the project — it is a read-only block, which is
 * the same component rather than a second one that could drift.
 */
export function Dials({
  dials,
  onSet,
  disabled,
  className,
}: {
  dials: Dial[];
  onSet?: (key: string, patch: { rag?: string; trend?: string }) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5", className)}>
      {dials.map((dial) => (
        <DialTile key={dial.key} dial={dial} onSet={onSet} disabled={disabled} />
      ))}
    </div>
  );
}

/**
 * One dial: the verdict as a filled block, the direction as a chevron.
 *
 * The controls are behind the block rather than beside it. Five dials with a
 * palette and a trend row each put thirty-five live controls on the page, and
 * at that density nothing is read first — a status report is a thing people
 * look at far more often than they change, so the reading state is the one
 * that gets the room.
 */
function DialTile({
  dial,
  onSet,
  disabled,
}: {
  dial: Dial;
  onSet?: (key: string, patch: { rag?: string; trend?: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Dismissed the way every other transient surface in the app is: a click
  // anywhere else, or Escape. Without both, a picker left open behind a save
  // is a stale control sitting over live values.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const word = RAG_LABELS[dial.rag] ?? dial.rag;
  const hollow = dial.rag === "grey" || !dial.rag;

  const block = (
    <span
      className={clsx(
        "flex h-[30px] items-center rounded-[9px] px-2.5 text-[12px] font-bold uppercase tracking-[0.04em]",
        hollow && "border-[1.5px] border-ink-4 bg-panel-3 text-ink-2",
      )}
      style={hollow ? undefined : { background: RAG_COLOR[dial.rag], color: "var(--on-rag)" }}
    >
      {word}
    </span>
  );

  return (
    <div ref={box} className="relative rounded-[15px] bg-panel-2 p-3.5">
      <div className="flex items-center gap-2">
        <span className="micro min-w-0 flex-1 truncate text-ink-4">{dial.label}</span>
        <Trend value={dial.trend} />
      </div>

      <div className="mt-2.5">
        {onSet ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((was) => !was)}
            aria-expanded={open}
            aria-label={`${dial.label}: ${word}. Change it.`}
            className={clsx(
              "block w-full text-left transition disabled:opacity-40",
              !disabled && "hover:opacity-90",
              open && "ring-2 ring-accent ring-offset-2 ring-offset-panel-2 rounded-[9px]",
            )}
          >
            {block}
          </button>
        ) : (
          block
        )}
      </div>

      {dial.differs && dial.suggested_reason && (
        <p
          className="mt-2 text-[10.5px] leading-relaxed text-ink-4"
          title="What the dates or the budget would say. A suggestion, never a value."
        >
          The rows say{" "}
          <span className="font-semibold">
            {(RAG_LABELS[dial.suggested ?? "grey"] ?? "").toLowerCase()}
          </span>{" "}
          — {dial.suggested_reason}.
        </p>
      )}

      {open && onSet && (
        <div className="absolute inset-x-2 top-[calc(100%-6px)] z-20 rounded-[15px] border border-line-strong bg-panel-3 p-3 shadow-[var(--shadow-float)]">
          <p className="micro text-ink-4">Set {dial.label.toLowerCase()} to</p>
          <div className="mt-2 flex gap-1.5">
            {(["green", "amber", "red", "grey"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={RAG_LABELS[value]}
                aria-pressed={dial.rag === value}
                title={RAG_LABELS[value]}
                onClick={() => onSet(dial.key, { rag: value })}
                className={clsx(
                  "h-8 flex-1 rounded-[9px] transition",
                  value === "grey" && "border-[1.5px] border-ink-4 bg-panel-2",
                  dial.rag === value
                    ? "ring-2 ring-ink ring-offset-2 ring-offset-panel-3"
                    : "opacity-70 hover:opacity-100",
                )}
                style={value === "grey" ? undefined : { background: RAG_COLOR[value] }}
              />
            ))}
          </div>

          <p className="micro mt-3 text-ink-4">Moving</p>
          <div className="mt-2 flex gap-1.5">
            {(["improving", "steady", "declining"] as const).map((value) => {
              const Icon = TREND_ICON[value] ?? Minus;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={TREND_LABELS[value]}
                  aria-pressed={dial.trend === value}
                  title={TREND_LABELS[value]}
                  onClick={() => onSet(dial.key, { trend: value })}
                  className={clsx(
                    "grid h-7 flex-1 place-items-center rounded-[9px] transition",
                    dial.trend === value
                      ? "bg-solid text-on-solid"
                      : "bg-panel-2 text-ink-4 hover:text-ink",
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2.4} />
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11.5px] font-medium text-ink-3 transition hover:text-ink"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── the month axis, shared by both charts ───────────────────────────── */

interface Axis {
  span: number;
  months: { key: string; label: string; year: number; left: number; width: number }[];
  years: { year: number; left: number; width: number }[];
  /** Where a date sits across the axis, 0–100, or null if it has none. */
  at: (value: string | null | undefined) => number | null;
  todayAt: number | null;
}

/**
 * A row of calendar months spanning the dates it is given.
 *
 * Two charts draw on this — one project's milestones, and every project at
 * once — and they have to agree about where June is, so the arithmetic lives
 * here rather than twice.
 *
 * Both ends widen to whole months: a plan starting on the 20th must still
 * begin at that month's edge, or the first bar hangs off the front of its own
 * column. Widths are measured in real time rather than divided equally, so a
 * 28-day month is genuinely narrower than a 31-day one and every bar sits
 * exactly over the months it spans.
 */
function monthAxis(stamps: number[]): Axis {
  if (!stamps.length) {
    return { span: 0, months: [], years: [], at: () => null, todayAt: null };
  }

  const start = new Date(Math.min(...stamps));
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Math.max(...stamps));
  end.setMonth(end.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);

  const first = start.getTime();
  const last = end.getTime();
  const span = last - first;

  const at = (value: string | null | undefined): number | null => {
    if (!value || span <= 0) return null;
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.min(100, ((t - first) / span) * 100));
  };

  const months: Axis["months"] = [];
  const cursor = new Date(first);
  while (cursor.getTime() < last) {
    const from = cursor.getTime();
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    const to = Math.min(next.getTime(), last);
    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleString(undefined, { month: "short" }),
      year: cursor.getFullYear(),
      left: ((from - first) / span) * 100,
      width: ((to - from) / span) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const years = months.reduce<Axis["years"]>((acc, month) => {
    const open = acc[acc.length - 1];
    if (open && open.year === month.year) {
      open.width += month.width;
      return acc;
    }
    acc.push({ year: month.year, left: month.left, width: month.width });
    return acc;
  }, []);

  const today = Date.now();
  const todayAt =
    span > 0 && today >= first && today <= last ? at(new Date(today).toISOString()) : null;

  return { span, months, years, at, todayAt };
}

/** The month and year bands, drawn above whichever chart is asking. */
function AxisHead({ axis }: { axis: Axis }) {
  return (
    <div>
      <div className="relative h-3">
        {axis.years.map((year) => (
          <span
            key={year.year}
            className="micro absolute whitespace-nowrap text-ink-4"
            style={{ left: `${year.left}%`, width: `${year.width}%` }}
          >
            {year.year}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-3">
        {axis.months.map((month) => (
          <span
            key={month.key}
            className="absolute overflow-hidden text-center text-[8.5px] font-bold uppercase tracking-[0.06em] text-ink-4"
            style={{ left: `${month.left}%`, width: `${month.width}%` }}
          >
            {month.width >= 3.2 ? month.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The gridlines, the baseline and today — the ground every bar sits on. */
function AxisGround({ axis }: { axis: Axis }) {
  return (
    <>
      {axis.months.map((month) => (
        <span
          key={month.key}
          aria-hidden
          className="absolute inset-y-0 w-px bg-line"
          style={{ left: `${month.left}%` }}
        />
      ))}
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      {axis.todayAt !== null && (
        <span
          aria-hidden
          title="Today"
          className="absolute inset-y-0 w-px bg-ink-3"
          style={{ left: `${axis.todayAt}%` }}
        />
      )}
    </>
  );
}

/* ── the plan, on a timeline ─────────────────────────────────────────── */

export interface TimelineMilestone {
  id: string;
  name: string;
  owner_name?: string | null;
  start_on?: string | null;
  due_on: string | null;
  done_on?: string | null;
  baseline_due_on?: string | null;
  percent_complete: number;
  plan?: string | null;
  state?: string | null;
  is_key?: boolean;
  slip_days?: number | null;
  note?: string | null;
}

/**
 * The milestone timeline.
 *
 * A row per milestone with a bar drawn across the plan's own span, which is
 * the one chart on a status report people actually read. Two things it does
 * that a plain bar chart would not:
 *
 * **The baseline is drawn as well as the current date**, as a hollow marker at
 * the point the plan first put the milestone. The gap between the two is the
 * slip, and a chart that redrew itself around each reschedule would erase the
 * only evidence that anything moved.
 *
 * **The fill is completion, not elapsed time.** A bar that filled with the
 * calendar would show every overdue milestone as finished.
 *
 * With no dates anywhere it degrades to a list rather than drawing an empty
 * axis — a plan sketched to names only is a real state, not a broken one.
 */
export function Timeline({
  milestones,
  onOpen,
  className,
}: {
  milestones: TimelineMilestone[];
  /** Makes each row a button. Omitted on a filed report, which is a record. */
  onOpen?: (id: string) => void;
  className?: string;
}) {
  const dated = milestones.filter((m) => m.due_on || m.start_on || m.baseline_due_on);
  const stamps = dated.flatMap((m) =>
    [m.start_on, m.due_on, m.baseline_due_on, m.done_on]
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime())
      .filter((n) => !Number.isNaN(n)),
  );

  const axis = monthAxis(stamps);
  const { span, months, at, todayAt } = axis;

  /* The five columns, shared by the header and every row so they line up. */
  const cols = "lg:grid-cols-[200px_minmax(0,1fr)_44px_14px_92px]";

  if (milestones.length === 0) {
    return (
      <p className={clsx("text-[12.5px] text-ink-4", className)}>
        No milestones on the plan yet.
      </p>
    );
  }

  return (
    <div className={className}>
      {/* The axis, drawn once. Below lg the columns collapse and it goes with
          them — a sixteen-month ruler in a phone-width column is a smear. */}
      {span > 0 && (
        <div className={clsx("hidden items-end gap-x-3 border-b border-line px-2.5 pb-1.5 lg:grid", cols)}>
          <span className="micro text-ink-4">Milestone</span>
          <AxisHead axis={axis} />
          <span className="micro text-right text-ink-4">PoC</span>
          <span />
          <span className="micro text-ink-4">Owner</span>
        </div>
      )}

      <div className="mt-1 space-y-px">
        {milestones.map((stone) => {
          const startPct = at(stone.start_on) ?? at(stone.due_on) ?? 0;
          const duePct = at(stone.due_on);
          const basePct = at(stone.baseline_due_on);
          const width = duePct !== null ? Math.max(1.8, duePct - startPct) : 0;
          const late = stone.state === "overdue";
          const done = stone.state === "done";
          const colour = done ? "var(--positive)" : late ? "var(--danger)" : "var(--accent)";
          const slipped =
            basePct !== null && duePct !== null && Math.abs(basePct - duePct) > 0.5;

          const Wrapper = onOpen ? "button" : "div";
          return (
            <Wrapper
              key={stone.id}
              {...(onOpen ? { type: "button" as const, onClick: () => onOpen(stone.id) } : {})}
              className={clsx(
                "w-full rounded-[11px] px-2.5 py-2 text-left transition",
                onOpen && "hover:bg-panel-2",
              )}
            >
              <div className={clsx("grid items-center gap-x-3 gap-y-2", cols)}>
                {/* name */}
                <div className="flex min-w-0 items-center gap-2">
                  {stone.is_key && (
                    <span
                      title="A key milestone"
                      className="inline-block size-1.5 shrink-0 rotate-45 bg-accent"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                    {stone.name}
                  </span>
                  {/* The right-hand columns, folded back in when there are none. */}
                  <span className="flex shrink-0 items-center gap-2 lg:hidden">
                    <span className="tnum text-[11px] font-semibold text-ink-2">
                      {stone.percent_complete}%
                    </span>
                    <MilestoneStateBadge value={stone.state ?? null} />
                  </span>
                </div>

                {/* the track */}
                {span > 0 ? (
                  <div className="relative h-[22px]">
                    <AxisGround axis={axis} />
                    {duePct !== null && (
                      <span
                        className="absolute top-1/2 h-[15px] -translate-y-1/2 overflow-hidden rounded-full"
                        style={{
                          left: `${startPct}%`,
                          width: `${width}%`,
                          background: `color-mix(in oklab, ${colour} 24%, transparent)`,
                        }}
                      >
                        {/* Completion, not elapsed time — see above. */}
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, stone.percent_complete))}%`,
                            background: colour,
                          }}
                        />
                      </span>
                    )}
                    {stone.is_key && duePct !== null && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-ink"
                        style={{ left: `${duePct}%` }}
                      />
                    )}
                    {slipped && (
                      <span
                        title={`The plan first said ${dateShort(stone.baseline_due_on)}`}
                        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-ink-4"
                        style={{ left: `${basePct}%` }}
                      />
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-ink-4">No date on the plan</span>
                )}

                <span className="tnum hidden text-right text-[11px] font-semibold text-ink-2 lg:block">
                  {stone.percent_complete}%
                </span>
                <span className="hidden justify-self-center lg:block">
                  <RagDot
                    value={done ? "green" : late ? "red" : stone.state === "due" ? "amber" : "grey"}
                    size={9}
                    className={undefined}
                  />
                </span>
                <span className="hidden truncate text-[11px] text-ink-3 lg:block">
                  {stone.owner_name ?? "Unassigned"}
                </span>
              </div>

              {/* Anything that needs a sentence rather than a column. */}
              {(slipped ||
                stone.done_on ||
                stone.note ||
                (stone.plan && stone.plan !== "on_plan")) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-4 lg:ml-[212px]">
                  <span className="tnum">
                    {stone.start_on ? `${dateShort(stone.start_on)} – ` : ""}
                    {stone.due_on ? dateShort(stone.due_on) : "no date"}
                  </span>
                  {typeof stone.slip_days === "number" && stone.slip_days !== 0 && (
                    <span className={stone.slip_days > 0 ? "text-warn" : "text-positive"}>
                      {stone.slip_days > 0
                        ? `${stone.slip_days} days later than planned`
                        : `${Math.abs(stone.slip_days)} days earlier than planned`}
                    </span>
                  )}
                  {stone.done_on && <span>done {dateShort(stone.done_on)}</span>}
                  <PlanBadge value={stone.plan ?? null} />
                  {stone.note && (
                    <span className="w-full whitespace-pre-wrap text-ink-3">{stone.note}</span>
                  )}
                </div>
              )}
            </Wrapper>
          );
        })}
      </div>

      {/* What the drawing means, said once under it. */}
      {span > 0 && (
        <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-2.5 pt-2.5 lg:flex">
          <Key swatch={<span className="h-2 w-4 rounded-full bg-positive" />} label="Done" />
          <Key swatch={<span className="h-2 w-4 rounded-full bg-accent" />} label="In progress" />
          <Key swatch={<span className="h-2 w-4 rounded-full bg-danger" />} label="Overdue" />
          <Key
            swatch={<span className="size-2.5 rotate-45 rounded-[2px] bg-ink" />}
            label="Key milestone"
          />
          <Key
            swatch={
              <span className="size-2.5 rounded-full border-2 border-dashed border-ink-4" />
            }
            label="Where the plan first put it"
          />
          <Key swatch={<span className="h-3 w-px bg-ink-3" />} label="Today" />
        </div>
      )}
    </div>
  );
}

/** One entry in the timeline's key. */
function Key({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span className="micro text-ink-4">{label}</span>
    </span>
  );
}

/* ── every project on one axis ───────────────────────────────────────── */

export interface RoadmapProject {
  id: string;
  name: string;
  code?: string | null;
  lead?: string | null;
  team?: string | null;
  rag: string | null;
  percent_complete: number;
  start_on: string | null;
  target_end_on: string | null;
  /**
   * Diamonds along the bar. A filed report carries each project's milestones
   * and draws them; the live listing does not fetch them, and the bar alone
   * is still the answer to "when does this land".
   */
  marks?: { id: string; on: string | null; done: boolean; name: string }[];
}

/**
 * A listing row, as a bar.
 *
 * Typed structurally rather than against `ProjectSummaryOut` so this file
 * keeps taking plain values — the same reason everything else here does. Four
 * screens draw this chart and none of them should be writing the mapping out
 * again and getting one field subtly different.
 */
export function toRoadmap(project: {
  id: string;
  name: string;
  code?: string | null;
  lead?: { name: string } | null;
  team?: string | null;
  rag_overall: string | null;
  start_on: string | null;
  target_end_on: string | null;
  rollup: { percent_complete: number };
}): RoadmapProject {
  return {
    id: project.id,
    name: project.name,
    code: project.code ?? null,
    lead: project.lead?.name ?? null,
    team: project.team ?? null,
    rag: project.rag_overall,
    percent_complete: project.rollup.percent_complete,
    start_on: project.start_on,
    target_end_on: project.target_end_on,
  };
}

/** Worst first, then soonest, then by name — the order a manager reads in. */
const RAG_RANK: Record<string, number> = { red: 0, amber: 1, grey: 2, green: 3 };

/**
 * Every project as one bar on a shared axis.
 *
 * The counterpart to `Timeline`: that one draws the milestones inside a
 * project, this one draws the projects themselves and never descends to their
 * work. A manager asking "what is running, and when does it land" is asking
 * about nine rows, not nine hundred — the moment tasks appear here it stops
 * answering that question.
 *
 * The bar is the project's span filled by its completion, so a bar that is
 * mostly empty with today's line past its middle is a project behind, read
 * without arithmetic.
 */
export function Roadmap({
  projects,
  onOpen,
  groupByTeam = false,
  className,
}: {
  projects: RoadmapProject[];
  /** Makes each row a button. Omitted on a filed report, which is a record. */
  onOpen?: (id: string) => void;
  groupByTeam?: boolean;
  className?: string;
}) {
  const stamps = projects
    .flatMap((project) => [
      project.start_on,
      project.target_end_on,
      ...(project.marks ?? []).map((mark) => mark.on),
    ])
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((n) => !Number.isNaN(n));

  const axis = monthAxis(stamps);
  const cols = "lg:grid-cols-[236px_minmax(0,1fr)_84px_42px]";

  const order = (list: RoadmapProject[]) =>
    [...list].sort(
      (a, b) =>
        (RAG_RANK[a.rag ?? "grey"] ?? 4) - (RAG_RANK[b.rag ?? "grey"] ?? 4) ||
        (a.target_end_on ?? "9999").localeCompare(b.target_end_on ?? "9999") ||
        a.name.localeCompare(b.name),
    );

  // One unnamed group when the caller does not want them split by team, so
  // the rendering below has a single shape rather than two.
  const groups = groupByTeam
    ? [...new Map(projects.map((p) => [p.team ?? "", p.team ?? "No team"])).entries()]
        .map(([key, name]) => ({
          key,
          name,
          rows: order(projects.filter((p) => (p.team ?? "") === key)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [{ key: "", name: "", rows: order(projects) }];

  if (projects.length === 0) {
    return <p className={clsx("text-[12.5px] text-ink-4", className)}>No projects to draw.</p>;
  }

  if (axis.span <= 0) {
    return (
      <p className={clsx("text-[12.5px] text-ink-4", className)}>
        None of these has a start or a target date, so there is nothing to put on an axis
        yet.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className={clsx("hidden items-end gap-x-3 border-b border-line px-2.5 pb-1.5 lg:grid", cols)}>
        <span className="micro text-ink-4">Project</span>
        <AxisHead axis={axis} />
        <span className="micro text-ink-4">Target</span>
        <span className="micro text-right text-ink-4">Done</span>
      </div>

      {groups.map((group) => (
        <div key={group.key}>
          {groupByTeam && (
            <div className="flex items-center gap-2.5 px-2.5 pb-1 pt-3">
              <span className="micro text-accent">{group.name}</span>
              <span className="h-px flex-1 bg-line" />
              <span className="tnum text-[10px] text-ink-4">
                {group.rows.length} {group.rows.length === 1 ? "project" : "projects"}
              </span>
            </div>
          )}

          <div className="mt-1 space-y-px">
            {group.rows.map((project) => {
              const startAt = axis.at(project.start_on);
              const endAt = axis.at(project.target_end_on);
              const left = startAt ?? endAt ?? 0;
              const width = endAt !== null ? Math.max(1.8, endAt - left) : 1.8;
              const colour = RAG_COLOR[project.rag ?? "grey"] ?? "var(--ink-4)";
              const unassessed = !project.rag || project.rag === "grey";

              const Wrapper = onOpen ? "button" : "div";
              return (
                <Wrapper
                  key={project.id}
                  {...(onOpen
                    ? { type: "button" as const, onClick: () => onOpen(project.id) }
                    : {})}
                  className={clsx(
                    "w-full rounded-[11px] px-2.5 py-2 text-left transition",
                    onOpen && "hover:bg-panel-2",
                  )}
                >
                  <div className={clsx("grid items-center gap-x-3 gap-y-2", cols)}>
                    <div className="flex min-w-0 items-center gap-2">
                      <RagChip value={project.rag} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">
                          {project.name}
                        </span>
                        {(project.lead || project.code) && (
                          <span className="micro truncate text-ink-4">
                            {[project.code, project.lead].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="relative h-[26px]">
                      <AxisGround axis={axis} />
                      <span
                        className="absolute top-1/2 h-[17px] -translate-y-1/2 overflow-hidden rounded-full"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: unassessed
                            ? "transparent"
                            : `color-mix(in oklab, ${colour} 22%, transparent)`,
                          border: unassessed ? "1px dashed var(--ink-4)" : undefined,
                        }}
                      >
                        {!unassessed && (
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(100, project.percent_complete))}%`,
                              background: colour,
                            }}
                          />
                        )}
                      </span>
                      {(project.marks ?? []).map((mark) => {
                        const markAt = axis.at(mark.on);
                        if (markAt === null) return null;
                        return (
                          <span
                            key={mark.id}
                            title={mark.name}
                            className={clsx(
                              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]",
                              !mark.done && "border-[1.5px] border-ink-4 bg-panel-3",
                            )}
                            style={{
                              left: `${markAt}%`,
                              background: mark.done ? "var(--positive)" : undefined,
                            }}
                          />
                        );
                      })}
                    </div>

                    <span className="tnum hidden text-[11px] text-ink-3 lg:block">
                      {project.target_end_on ? dateShort(project.target_end_on) : "—"}
                    </span>
                    <span className="tnum hidden text-right text-[11px] font-semibold text-ink-2 lg:block">
                      {project.percent_complete}%
                    </span>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-2.5 pt-2.5 lg:flex">
        <Key
          swatch={
            <span className="h-2 w-5 overflow-hidden rounded-full bg-accent/25">
              <span className="block h-full w-1/2 rounded-full bg-accent" />
            </span>
          }
          label="Span, filled by completion"
        />
        <Key
          swatch={<span className="size-2.5 rotate-45 rounded-[2px] bg-positive" />}
          label="Milestone met"
        />
        <Key
          swatch={
            <span className="size-2.5 rotate-45 rounded-[2px] border-[1.5px] border-ink-4 bg-panel-3" />
          }
          label="Still to come"
        />
        <Key swatch={<span className="h-3 w-px bg-ink-3" />} label="Today" />
      </div>
    </div>
  );
}

/* ── how far along, as a bar ─────────────────────────────────────────── */

/**
 * A completion bar coloured by health rather than by how full it is.
 *
 * The percentage and the RAG are two different claims and both belong on a
 * project card; colouring the bar by its own value would invent a third that
 * nobody made — 40% is not amber.
 */
export function ProgressBar({
  percent,
  rag,
  height = 6,
  className,
}: {
  percent: number;
  rag?: string | null;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={clsx("overflow-hidden rounded-full bg-panel-3", className)}
      style={{ height }}
      role="img"
      aria-label={`${percent}% complete`}
    >
      <div
        className="grow-in h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: rag ? RAG_COLOR[rag] ?? "var(--accent)" : "var(--accent)",
        }}
      />
    </div>
  );
}

/* ── the progress log ────────────────────────────────────────────────── */

export const UPDATE_KIND_LABELS: Record<string, string> = {
  task: "Task",
  health: "Health",
  milestone: "Milestone",
  issue: "Issue",
  note: "Note",
};

const UPDATE_KIND_TONE: Record<string, Tone> = {
  task: "accent",
  health: "info",
  milestone: "second",
  issue: "warn",
  note: "neutral",
};

export function UpdateKindBadge({ value }: { value: string }) {
  return (
    <Badge tone={UPDATE_KIND_TONE[value] ?? "neutral"}>
      {UPDATE_KIND_LABELS[value] ?? humanise(value)}
    </Badge>
  );
}

/**
 * "+15%" — the movement itself, which is the part of a log entry worth
 * reading first. Zero renders nothing: an entry that moved no number is a note
 * about why, and printing "0%" against it would suggest the work went nowhere
 * rather than that nothing numeric was claimed.
 */
export function Delta({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span
      className={clsx(
        "tnum shrink-0 text-[11.5px] font-bold",
        value > 0 ? "text-positive" : "text-danger",
      )}
    >
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

/* ── the empty-ish states a project screen shares ────────────────────── */

/** A labelled figure inside a project panel, dense enough for six in a row. */
export function Tally({
  label,
  value,
  tone,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "warn" | "danger" | "positive";
  title?: string;
}) {
  return (
    <div title={title} className="min-w-0">
      <p
        className={clsx(
          "fig text-[19px]",
          tone === "danger" && "text-danger",
          tone === "warn" && "text-warn",
          tone === "positive" && "text-positive",
        )}
      >
        {value}
      </p>
      <p className="micro mt-0.5 truncate text-ink-4">{label}</p>
    </div>
  );
}
