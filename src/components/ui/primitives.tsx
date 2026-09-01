import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { avatarHue, initials } from "@/lib/format";

/* ── surfaces ────────────────────────────────────────────────────────── */

/**
 * A panel floating on the canvas.
 *
 * Everything in this app lives in one. Borders are almost invisible by
 * design — the separation comes from the panel being lighter than the canvas
 * behind it, not from a drawn line, which is what stops a screen full of
 * panels reading as a grid of boxes.
 */
export function Panel({
  tone = "panel",
  className,
  children,
  ...rest
}: ComponentProps<"div"> & {
  tone?: "panel" | "inset" | "accent" | "highlight" | "bare";
}) {
  return (
    <div
      className={clsx(
        "relative rounded-[20px] border",
        tone === "panel" && "border-line bg-panel shadow-[var(--shadow-panel)]",
        tone === "inset" && "border-transparent bg-inset",
        tone === "bare" && "border-line bg-transparent",
        tone === "accent" && "border-transparent bg-accent text-[var(--c-accent-ink)]",
        tone === "highlight" &&
          "border-transparent bg-highlight text-[var(--c-highlight-ink)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The hero panel: the one panel per screen that carries the headline numbers.
 *
 * It gets a soft blue→pink aura bled in from the top-right corner. That is the
 * only decorative gradient in the app; every other use of the ramp encodes a
 * value.
 */
export function HeroPanel({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "relative isolate overflow-hidden rounded-[20px] border border-line bg-panel",
        className,
      )}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[520px] rounded-full opacity-[0.16] blur-3xl"
        style={{
          background:
            "conic-gradient(from 200deg, var(--c-accent), var(--c-highlight), var(--c-accent))",
        }}
      />
      {children}
    </div>
  );
}

/** Panel header: a title, an optional count, and a slot on the right. */
export function PanelHead({
  title,
  count,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-2.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-[13.5px] font-medium text-ink">{title}</h2>
        {count !== undefined && (
          <span className="tnum shrink-0 text-[12px] text-ink-4">{count}</span>
        )}
      </div>
      {hint && <p className="min-w-0 truncate text-[12px] text-ink-4">{hint}</p>}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

/** The small circular "+" that heads a panel in the reference layout. */
export function PanelAdd({
  onClick,
  href,
  label,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
}) {
  const className =
    "grid size-6 place-items-center rounded-full border border-line text-ink-3 transition hover:border-line-strong hover:text-ink";
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        <Plus className="size-3.5" strokeWidth={2.2} />
      </Link>
    );
  }
  return (
    <button onClick={onClick} aria-label={label} title={label} className={className}>
      <Plus className="size-3.5" strokeWidth={2.2} />
    </button>
  );
}

/** The circular "open this" affordance in a panel's top-right corner. */
export function OpenCorner({
  href,
  label,
  tone = "panel",
}: {
  href: string;
  label: string;
  tone?: "panel" | "filled";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-7 shrink-0 place-items-center rounded-full border transition",
        tone === "filled"
          ? "border-current/20 hover:bg-current/10"
          : "border-line text-ink-3 hover:border-line-strong hover:text-ink",
      )}
    >
      <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
    </Link>
  );
}

/* ── labels ──────────────────────────────────────────────────────────── */

export type Tone =
  | "neutral"
  | "accent"
  | "highlight"
  | "positive"
  | "warn"
  | "danger"
  | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-panel-3 text-ink-2",
  accent: "bg-accent-soft text-accent-text",
  highlight: "bg-highlight-soft text-highlight-text",
  positive: "bg-positive-soft text-positive",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** A rounded pill label, set small on a lifted well. */
export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium leading-none",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/**
 * The leading-glyph chip — the reference's `A` for text, `#` for a number, an
 * icon for a date. Reused here for role keys, leave types and anything that
 * reads better with a glyph than with a colour alone.
 */
export function TypeChip({
  glyph,
  label,
  tone = "neutral",
  onClick,
  className,
}: {
  glyph: ReactNode;
  label: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 min-w-0 items-center gap-2 rounded-full bg-panel-2 pl-1 pr-3 text-left text-[12px] text-ink-2 transition",
        onClick && "hover:bg-panel-3 hover:text-ink",
        className,
      )}
    >
      <span
        className={clsx(
          "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
          TONE_CLASS[tone],
        )}
      >
        {glyph}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Tag>
  );
}

/** A key/value pair — the workhorse of every detail panel. */
export function Meta({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("min-w-0", className)}>
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/* ── people ──────────────────────────────────────────────────────────── */

const AVATAR_SIZE = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-9 text-[12px]",
  lg: "size-12 text-[15px]",
};

/**
 * There are no photographs in this system — Graph is read for names, not
 * images — so an avatar is initials on a colour derived from the person's own
 * identifier. Same person, same colour everywhere, with nothing stored.
 */
export function Avatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  seed?: string;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  const hue = avatarHue(seed ?? name ?? "?");
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        AVATAR_SIZE[size],
        className,
      )}
      style={{
        background: `oklch(0.78 0.13 ${hue})`,
        color: `oklch(0.26 0.09 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping faces with a trailing "+n", as in the reference's header. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  onAdd,
}: {
  people: { name: string; id?: string }[];
  max?: number;
  size?: keyof typeof AVATAR_SIZE;
  onAdd?: { href: string; label: string };
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((person, i) => (
        <Avatar
          key={person.id ?? `${person.name}-${i}`}
          name={person.name}
          seed={person.id ?? person.name}
          size={size}
          className="-ml-2 ring-2 ring-[var(--c-panel)] first:ml-0"
        />
      ))}
      {rest > 0 && (
        <span
          className={clsx(
            "tnum -ml-2 inline-grid place-items-center rounded-full bg-panel-3 font-semibold text-ink-3 ring-2 ring-[var(--c-panel)]",
            AVATAR_SIZE[size],
          )}
        >
          +{rest}
        </span>
      )}
      {onAdd && (
        <Link
          href={onAdd.href}
          aria-label={onAdd.label}
          title={onAdd.label}
          className={clsx(
            "-ml-2 inline-grid place-items-center rounded-full border border-line-strong bg-panel text-ink-3 ring-2 ring-[var(--c-panel)] transition hover:text-ink",
            AVATAR_SIZE[size],
          )}
        >
          <Plus className="size-3" strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

/* ── numbers ─────────────────────────────────────────────────────────── */

/**
 * The hero figure: an oversized light-weight number with a small two-line
 * label beside it — the "17 % / Total Funnel Conversion" pairing from the
 * reference. Used for the three or four numbers a screen is actually about.
 */
export function Figure({
  value,
  unit,
  label,
  sub,
  size = "md",
  className,
}: {
  value: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = { sm: "text-[28px]", md: "text-[40px]", lg: "text-[54px]" }[size];
  return (
    <div className={clsx("flex items-baseline gap-2.5", className)}>
      <span className={clsx("figure text-ink", scale)}>{value}</span>
      {unit && <span className="text-[17px] font-light text-ink-3">{unit}</span>}
      <span className="flex min-w-0 max-w-36 flex-col leading-tight">
        <span className="text-[11.5px] text-ink-3">{label}</span>
        {sub && <span className="text-[11.5px] text-ink-4">{sub}</span>}
      </span>
    </div>
  );
}

/** A compact figure for summary strips, where four or five sit in a row. */
export function Stat({
  value,
  label,
  delta,
  tone = "neutral",
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline gap-2", className)}>
      <span className="figure text-[26px] text-ink">{value}</span>
      <span className="flex min-w-0 max-w-32 flex-col gap-0.5 leading-tight">
        {delta !== undefined && delta !== null && (
          <span
            className={clsx(
              "tnum inline-flex w-fit items-center rounded-full px-1.5 py-px text-[9.5px] font-semibold",
              TONE_CLASS[tone],
            )}
          >
            {delta}
          </span>
        )}
        <span className="text-[11.5px] text-ink-3">{label}</span>
      </span>
    </div>
  );
}

/** A colour sampled from the blue→pink ramp at 0–1. */
export function rampAt(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  return `color-mix(in oklab, var(--c-highlight) ${(clamped * 100).toFixed(1)}%, var(--c-accent))`;
}

export interface Segment {
  value: number;
  label?: string;
  /** Overrides the ramp for a segment that means something categorical. */
  color?: string;
}

/**
 * The signature chart: a stacked bar with fully rounded ends whose segments
 * are slices of the one blue→pink ramp, each printing its own value inside.
 *
 * Segments take their colour from their position along the row rather than
 * from a category, so the bar reads left to right as one scale. A segment too
 * narrow to hold its number drops it — an unreadable label is worse than none.
 */
export function RampBar({
  segments,
  total,
  height = 40,
  showValues = true,
  className,
}: {
  segments: Segment[];
  /** The scale the bar is drawn against. Defaults to the sum of its parts. */
  total?: number;
  height?: number;
  showValues?: boolean;
  className?: string;
}) {
  const live = segments.filter((s) => s.value > 0);
  const sum = live.reduce((acc, s) => acc + s.value, 0);
  const scale = total && total > 0 ? total : sum;

  if (live.length === 0 || scale <= 0) {
    return (
      <div className={clsx("rounded-full bg-inset", className)} style={{ height }} aria-hidden />
    );
  }

  // Each segment takes the slice of the ramp matching where it sits, so two
  // adjacent segments continue the gradient rather than restarting it.
  let cursor = 0;
  return (
    <div
      className={clsx("flex gap-1", className)}
      style={{ height }}
      role="img"
      aria-label={live.map((s) => `${s.label ?? "value"}: ${s.value}`).join(", ")}
    >
      {live.map((segment, i) => {
        const from = cursor / scale;
        cursor += segment.value;
        const to = cursor / scale;
        const width = (segment.value / scale) * 100;
        return (
          <div
            key={i}
            title={segment.label ? `${segment.label}: ${segment.value}` : undefined}
            className={clsx("bar-seg grow", !segment.color && "ramp")}
            style={{
              width: `${width}%`,
              background: segment.color,
              ["--ramp-a" as string]: segment.color ? undefined : rampAt(from),
              ["--ramp-b" as string]: segment.color ? undefined : rampAt(to),
              animationDelay: `${i * 60}ms`,
            }}
          >
            {showValues && width > 7 && (
              <span
                className="px-2 text-[12px] font-semibold"
                style={{ color: "var(--c-accent-ink)" }}
              >
                {segment.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A single-value meter — a proportion of one thing, on the same ramp. */
export function Meter({
  value,
  max,
  height = 6,
  className,
}: {
  value: number;
  max: number;
  height?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={clsx("overflow-hidden rounded-full bg-inset", className)} style={{ height }}>
      <div
        className="ramp grow h-full rounded-full"
        style={{ width: `${pct}%`, ["--ramp-b" as string]: rampAt(pct / 100) }}
      />
    </div>
  );
}

/* ── page heading ────────────────────────────────────────────────────── */

/**
 * Every screen opens with one of these, so they all sit on the same grid. The
 * title is set large and light, the way the reference sets its panel titles —
 * a label for the screen, not a banner.
 */
export function PageHead({
  eyebrow,
  title,
  lead,
  actions,
  faces,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  faces?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11.5px] text-ink-4">{eyebrow}</p>}
        <h1 className="hero-title truncate text-[34px] text-ink">{title}</h1>
        {lead && (
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">{lead}</p>
        )}
      </div>
      {(actions || faces) && (
        <div className="flex flex-wrap items-center gap-2">
          {faces}
          {actions}
        </div>
      )}
    </header>
  );
}
