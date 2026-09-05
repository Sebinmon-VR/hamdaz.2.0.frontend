"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { avatarHue, initials } from "@/lib/format";
import { FetchDot } from "@/components/shell/RouteProgress";
import { FitText } from "@/components/ui/FitText";
import { NextMeeting } from "@/components/meetings/NextMeeting";

/* ── surfaces ────────────────────────────────────────────────────────── */

/**
 * A panel on the app surface.
 *
 * A block, in the shell's terms: 20px corners, no border, floating on the app
 * ground. How it separates from that ground is the one thing that differs
 * between modes and it is decided once, by `--lift` — nothing in dark, a soft
 * shadow in light, because in light the ground and the block are both pale.
 *
 * `tone="sheet"` is the record surface — white on dark, a tinted well on
 * light. `tone="slab"` is the older inverted list surface, kept because two
 * dozen screens are built on it. Those are tones rather than one-off classes
 * because they are the design's structural moves, not decoration.
 */
export function Panel({
  tone = "panel",
  className,
  children,
  ...rest
}: ComponentProps<"div"> & {
  tone?:
    | "panel"
    | "inset"
    | "sheet"
    | "slab"
    | "well"
    | "accent"
    | "second"
    | "highlight"
    | "bare";
}) {
  return (
    <div
      className={clsx(
        "relative rounded-[20px]",
        tone === "panel" && "lift bg-panel",
        tone === "inset" && "bg-panel-2",
        tone === "sheet" && "on-sheet lift bg-sheet text-sheet-ink",
        tone === "slab" && "bg-slab text-slab-ink shadow-[var(--slab-shadow)]",
        tone === "well" && "bg-well text-well-ink",
        tone === "accent" && "bg-accent text-accent-ink",
        (tone === "second" || tone === "highlight") && "bg-second text-second-ink",
        tone === "bare" && "border border-line",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The block carrying a screen's headline numbers.
 *
 * It used to wear a decorative accent aura. It does not any more: the accent
 * now has exactly one job on a screen — the slab naming the one thing that
 * matters — and a second, fainter use of it downstream made that job harder
 * to read rather than easier.
 */
export function HeroPanel({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={clsx("lift relative isolate overflow-hidden rounded-[20px] bg-panel", className)}
      {...rest}
    >
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
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
        {count !== undefined && (
          <span className="tnum shrink-0 text-[12px] text-ink-4">{count}</span>
        )}
      </div>
      {hint && <p className="min-w-0 truncate text-[12px] text-ink-4">{hint}</p>}
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** The small circular "+" that heads a panel. */
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
    "grid size-7 place-items-center rounded-full border border-line text-ink-3 transition hover:border-line-strong hover:text-ink";
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

/** The circular "open this" affordance in a panel's corner. */
export function OpenCorner({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      <ArrowUpRight className="size-3.5" strokeWidth={2} />
    </Link>
  );
}

/* ── labels ──────────────────────────────────────────────────────────── */

export type Tone =
  | "neutral"
  | "accent"
  | "second"
  | "highlight"
  | "positive"
  | "warn"
  | "danger"
  | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-panel-3 text-ink-2",
  accent: "bg-accent-soft text-accent-text",
  // "highlight" is what the screens called the second brand colour before the
  // redesign renamed it. Both spellings resolve here.
  second: "bg-second-soft text-second-text",
  highlight: "bg-second-soft text-second-text",
  positive: "bg-positive-soft text-positive",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: ElementType;
  children: ReactNode;
  className?: string;
  /** A badge is a compression of something longer; this is the longer thing. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium leading-none",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/** A solid pill in the accent — for the one status per row that is "now". */
export function SolidBadge({
  tone = "accent",
  children,
  className,
}: {
  tone?: "accent" | "second";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold leading-none",
        tone === "accent" ? "bg-accent text-accent-ink" : "bg-second text-second-ink",
        className,
      )}
    >
      {children}
    </span>
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
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

/* ── people ──────────────────────────────────────────────────────────── */

const AVATAR_SIZE = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-[10.5px]",
  md: "size-10 text-[12.5px]",
  lg: "size-14 text-[16px]",
};

/**
 * There are no photographs in this system — Graph is read for names, not
 * images — so an avatar is initials on a colour derived from the person's own
 * identifier. The gradient is what keeps a wall of them from looking like flat
 * pastel stickers. Same person, same colour everywhere, nothing stored.
 */
export function Avatar({
  name,
  seed,
  size = "md",
  ring,
  className,
}: {
  name: string | null | undefined;
  seed?: string;
  size?: keyof typeof AVATAR_SIZE;
  /** Ring colour, for stacks that overlap. */
  ring?: string;
  className?: string;
}) {
  const hue = avatarHue(seed ?? name ?? "?");
  // There is no tailwind-merge here, so a `size-*` in className does not beat
  // the preset — both classes land and stylesheet order decides, which meant
  // every call site that tried to shrink an avatar silently got the default.
  // Dropping the preset when className already sets the box (or the type) is
  // the fix, and it fixes every call site at once rather than one at a time.
  const overrides = className ?? "";
  const sized = /(^|\s)size-[[\d]/.test(overrides);
  const typed = /(^|\s)text-[[\w]/.test(overrides);
  const preset = AVATAR_SIZE[size]
    .split(" ")
    .filter((cls) => !(sized && cls.startsWith("size-")) && !(typed && cls.startsWith("text-")))
    .join(" ");
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-bold",
        preset,
        className,
      )}
      style={{
        background: `linear-gradient(145deg, oklch(0.82 0.11 ${hue}), oklch(0.66 0.11 ${hue}))`,
        color: `oklch(0.26 0.08 ${hue})`,
        boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping faces with a trailing "+n". */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  ring = "var(--panel)",
  onAdd,
}: {
  people: { name: string; id?: string }[];
  max?: number;
  size?: keyof typeof AVATAR_SIZE;
  ring?: string;
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
          ring={ring}
          className="-ml-2.5 first:ml-0"
        />
      ))}
      {rest > 0 && (
        <span
          className={clsx(
            "tnum -ml-2.5 inline-grid place-items-center rounded-full bg-panel-3 font-bold text-ink-3",
            AVATAR_SIZE[size],
          )}
          style={{ boxShadow: `0 0 0 2.5px ${ring}` }}
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
            "-ml-2.5 inline-grid place-items-center rounded-full border border-line-strong bg-panel text-ink-3 transition hover:text-ink",
            AVATAR_SIZE[size],
          )}
          style={{ boxShadow: `0 0 0 2.5px ${ring}` }}
        >
          <Plus className="size-3" strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

/* ── numbers ─────────────────────────────────────────────────────────── */

/**
 * A headline number under a micro-label.
 *
 * The label is 9px uppercase at wide tracking and the number is heavy and
 * tight; the contrast between those two settings is the hierarchy, so neither
 * needs a rule, a box or a colour to be told apart from body text.
 */
export function Figure({
  value,
  prefix,
  unit,
  label,
  sub,
  tone,
  size = "md",
  className,
}: {
  value: ReactNode;
  /** Set small and quiet before the number — a currency, usually. */
  prefix?: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  /** Colours the number itself. Reserved for the one figure that is a problem. */
  tone?: "accent" | "second";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = { sm: "text-[22px]", md: "text-[30px]", lg: "text-[40px]" }[size];
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      {label && <span className="micro text-ink-4">{label}</span>}
      <span className="flex items-baseline gap-1.5">
        {prefix && <span className="fig text-[15px] text-ink-3">{prefix}</span>}
        <span
          className={clsx(
            "fig",
            scale,
            tone === "accent" && "text-accent",
            tone === "second" && "text-second",
            !tone && "text-ink",
          )}
        >
          {value}
        </span>
        {unit && <span className="fig text-[15px] text-ink-3">{unit}</span>}
        {sub && <span className="ml-2 text-[11.5px] font-normal text-ink-4">{sub}</span>}
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
    <div className={clsx("flex items-baseline gap-2.5", className)}>
      <span className="fig text-[24px] text-ink">{value}</span>
      <span className="flex min-w-0 max-w-36 flex-col gap-1 leading-tight">
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
        <span className="micro text-ink-4">{label}</span>
      </span>
    </div>
  );
}

/** A colour sampled from the accent → second ramp at 0–1. */
export function rampAt(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  return `color-mix(in oklab, var(--second) ${(clamped * 100).toFixed(1)}%, var(--accent))`;
}

export interface Segment {
  value: number;
  label?: string;
  /** Overrides the ramp for a segment that means something categorical. */
  color?: string;
}

/**
 * The signature chart: a stacked bar with fully rounded ends whose segments
 * are slices of one accent → second ramp, each printing its own value inside.
 *
 * Segments take their colour from their position along the row rather than
 * from a category, so the bar reads left to right as one scale. Where a series
 * has an urgency order it is laid out least-urgent first, which puts the
 * second colour — the one that already means "now" — at the late end.
 *
 * A segment too narrow to hold its number drops it; an unreadable label is
 * worse than none.
 */
export function RampBar({
  segments,
  total,
  height = 40,
  showValues = true,
  className,
}: {
  segments: Segment[];
  /** The scale to draw against. Defaults to the sum of the parts. */
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
      <div
        className={clsx("rounded-full bg-panel-3", className)}
        style={{ height }}
        aria-hidden
      />
    );
  }

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
            className="grow-in grid place-items-center rounded-full"
            style={{
              width: `${width}%`,
              background:
                segment.color ??
                `linear-gradient(90deg, ${rampAt(from)}, ${rampAt(to)})`,
              animationDelay: `${i * 60}ms`,
            }}
          >
            {showValues && width > 7 && height >= 22 && (
              <span
                className="tnum px-2 text-[12px] font-bold"
                style={{ color: "var(--on-accent)" }}
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
  height = 10,
  className,
}: {
  value: number;
  max: number;
  height?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={clsx("overflow-hidden rounded-full bg-panel-3", className)}
      style={{ height }}
    >
      <div
        className="grow-in h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, var(--accent), ${rampAt(pct / 100)})`,
        }}
      />
    </div>
  );
}

/* ── the command bar ─────────────────────────────────────────────────── */

/**
 * Every screen opens with one of these, and it is a block rather than a
 * heading: the display title, the route as a path, the screen's actions, and
 * whatever it wants to say about where its data came from.
 *
 * The title is here rather than in the shell on purpose. It is the one piece
 * of chrome that is genuinely per-screen — the shell would have to be told
 * about it by every route, which is a coupling that buys nothing — and having
 * it scroll away with `sticky` costs the screen no vertical room at all.
 *
 * The path is read off the URL rather than passed in, so no screen has to
 * remember to declare where it lives.
 */
export function PageHead({
  eyebrow,
  title,
  count,
  lead,
  actions,
  faces,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  count?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  faces?: ReactNode;
  /** What this screen wants to say about its data — "214 rows · 0.9 s". */
  meta?: ReactNode;
}) {
  return (
    // One row, always.
    //
    // This wrapped, and a header that becomes two rows tall on a long title
    // pushes every screen down and jumps as you navigate. `truncate` was
    // already on the title and did nothing: a flex item defaults to
    // `min-width: auto`, so it refuses to shrink below its text and the
    // overflow rule never gets a chance — the row grew instead and wrapped.
    // `min-w-0` is what lets it shrink, and the ellipsis follows from that.
    //
    // Deliberately *not* `overflow-hidden`: the schedule strip's popover hangs
    // below this element, and clipping the row would clip that with it. The
    // shrink rules are what keep the content inside, not a clip.
    <header className="lift sticky top-0 z-20 flex items-center gap-x-2.5 rounded-[20px] bg-panel px-4 py-2.5 sm:px-5">
      {/* Shrinks to fit rather than ending in an ellipsis. A cut-off title
          says less than the same words a point smaller, and it is the element
          that tells you which screen you are on — so it gives up size, not
          words. Flex shrinks every flexible item in proportion, and the higher
          factor is what makes the title absorb the squeeze rather than dragging
          the schedule strip and breadcrumb down with it.

          It stays an `h1`: this is the page's heading, and a pair of spans is
          not. FitText only manages the size inside it. */}
      <h1 className="display min-w-0 shrink-[4]">
        <FitText max={26} min={15}>
          {title}
        </FitText>
      </h1>

      <span className="mx-1 hidden h-6 w-px shrink-0 bg-line sm:block" />

      <PathPill />

      {/* The palette is bound to the window; this is the affordance that says
          so, since a shortcut nobody knows about saves nobody anything. */}
      <button
        onClick={() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
          )
        }
        aria-label="Search everything"
        className="flex h-[26px] shrink-0 items-center gap-2 rounded-[9px] bg-panel-2 px-2.5 text-ink-3 transition hover:text-ink"
      >
        <Search className="size-3.5" strokeWidth={2} />
        <kbd className="micro hidden text-ink-4 sm:block">⌘K</kbd>
      </button>

      {count !== undefined && (
        <span className="tnum flex h-[26px] shrink-0 items-center rounded-[9px] bg-panel-2 px-2.5 text-[11.5px] font-medium text-ink-2">
          {count}
        </span>
      )}

      {eyebrow && (
        <span className="hidden min-w-0 shrink truncate whitespace-nowrap text-[11.5px] text-ink-4 xl:block">
          {eyebrow}
        </span>
      )}

      {lead && (
        <span className="hidden min-w-0 max-w-[420px] shrink truncate whitespace-nowrap text-[11.5px] text-ink-3 xl:block">
          {lead}
        </span>
      )}

      {/* The controls. The group itself can give ground — otherwise the strip
          inside it never yields, because a `shrink-0` parent sizes to its
          content and its children are never asked to compress. So the group
          shrinks, everything that must stay clickable is pinned, and the
          schedule strip is the one thing left that absorbs it. A half-cut
          button is worse than a shortened timeline. */}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="shrink-0">
          <FetchDot />
        </span>
        {meta && (
          <span className="micro hidden shrink-0 text-ink-4 lg:block">{meta}</span>
        )}
        {/* Every screen, because the whole value of a reminder is being where
            you already are. It draws nothing when the calendar is clear, so
            the bar is unchanged on a day with no meetings. */}
        <NextMeeting />
        {faces && <span className="flex shrink-0 items-center">{faces}</span>}
        {actions && (
          <span className="flex shrink-0 items-center gap-2">{actions}</span>
        )}
      </div>
    </header>
  );
}

/**
 * The route, as a path. The last segment is the screen you are on; the ones
 * before it are its parents and are links where a parent route exists.
 *
 * Ids are dropped rather than shown: a UUID in a breadcrumb tells nobody
 * anything and pushes the readable part off the end of the pill.
 */
function PathPill() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).filter((part) => !ID.test(part));
  if (parts.length === 0) return null;

  return (
    <span className="hidden h-[26px] min-w-0 items-center gap-1.5 rounded-[9px] bg-panel-2 px-2.5 md:flex">
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        const href = "/" + parts.slice(0, index + 1).join("/");
        return (
          <span key={href} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <span className="text-ink-4">/</span>}
            {last ? (
              <span className="truncate text-[11.5px] font-semibold text-ink">{part}</span>
            ) : (
              <Link
                href={href}
                className="truncate text-[11.5px] text-ink-3 transition hover:text-ink"
              >
                {part}
              </Link>
            )}
          </span>
        );
      })}
    </span>
  );
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$/i;

/* ── the accent slab ─────────────────────────────────────────────────── */

/**
 * The one thing on a screen that matters most, said in accent.
 *
 * There is at most one per screen, and that scarcity is the whole point: an
 * accent used twice stops meaning "this one". It runs off the right edge of
 * its column — only the leading corners are cut — because a slab that stops
 * neatly inside the gutter reads as another card.
 */
export function AccentSlab({
  label,
  title,
  value,
  sub,
  bleed = true,
  className,
}: {
  label: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  /** Off when the slab sits inside something, where a bleed reads as a bug. */
  bleed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex shrink-0 flex-col justify-center gap-2.5 bg-accent px-6 py-6 text-accent-ink",
        bleed
          ? "-mr-3 rounded-l-[24px] pr-10 sm:-mr-4"
          : "rounded-[20px]",
        className,
      )}
    >
      <span className="micro">{label}</span>
      <span className="display text-[38px] leading-[0.94] sm:text-[46px]">{title}</span>
      {(value || sub) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {value && <span className="tnum text-[19px] font-bold">{value}</span>}
          {sub && <span className="micro">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ── dense rows ──────────────────────────────────────────────────────── */

/**
 * One line in a working list: 33px tall, 11px corners, no separators.
 *
 * `selected` inverts it rather than tinting it — white on dark, ink on light.
 * That is the design's one selection idiom: the row that matters breaks its
 * surface, so it reads first without a border, a bar or an accent.
 */
export function Row({
  selected,
  className,
  children,
  ...rest
}: ComponentProps<"div"> & { selected?: boolean }) {
  return (
    <div
      className={clsx(
        "mx-2 flex h-[33px] items-center gap-2.5 rounded-[11px] px-2.5 transition",
        selected ? "bg-row text-row-ink" : "hover:bg-panel-2",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The column headings above a `Row` list. */
export function RowHead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("mx-2 flex h-8 items-center gap-2.5 px-2.5", className)}>
      {children}
    </div>
  );
}

/** A small labelled number in its own tile — the 3-up and 4-up strips. */
export function StatBox({
  label,
  value,
  tone,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "second" | "danger";
  /** Where the number came from. A tooltip, not a third line of type. */
  hint?: string;
  className?: string;
}) {
  return (
    <div
      title={hint}
      className={clsx(
        "lift flex flex-col justify-center gap-1.5 rounded-2xl bg-panel px-4 py-3",
        className,
      )}
    >
      <span className="micro text-ink-4">{label}</span>
      <span
        className={clsx(
          "fig text-[24px]",
          tone === "second" && "text-second",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
    </div>
  );
}
