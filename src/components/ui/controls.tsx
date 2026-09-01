"use client";

import clsx from "clsx";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { forwardRef, useId, type ComponentProps, type ElementType, type ReactNode } from "react";

/* ── buttons ─────────────────────────────────────────────────────────── */

type Variant = "accent" | "highlight" | "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  accent: "bg-accent text-[var(--c-accent-ink)] hover:bg-accent-hover",
  highlight: "bg-highlight text-[var(--c-highlight-ink)] hover:bg-highlight-hover",
  solid: "bg-ink text-[var(--c-canvas)] hover:opacity-90",
  outline: "border border-line bg-panel text-ink-2 hover:border-line-strong hover:text-ink",
  ghost: "text-ink-3 hover:bg-panel-2 hover:text-ink",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

const SIZE: Record<Size, string> = {
  sm: "h-7 px-3 text-[12px] gap-1.5",
  md: "h-9 px-4 text-[13px] gap-2",
  lg: "h-11 px-5 text-[14px] gap-2",
};

// Pills throughout. The reference is built entirely out of them, and at these
// heights a pill is what makes a dense toolbar read as a set of distinct
// targets rather than as one grey bar.
const BUTTON_BASE =
  "inline-flex select-none items-center justify-center rounded-full font-medium transition disabled:pointer-events-none disabled:opacity-40";

interface ButtonProps extends Omit<ComponentProps<"button">, "prefix"> {
  variant?: Variant;
  size?: Size;
  icon?: ElementType;
  loading?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(BUTTON_BASE, VARIANT[variant], SIZE[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="size-3.5" strokeWidth={2.1} />
      )}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "outline",
  size = "md",
  icon: Icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ElementType }) {
  return (
    <Link href={href} className={clsx(BUTTON_BASE, VARIANT[variant], SIZE[size], className)} {...rest}>
      {Icon && <Icon className="size-3.5" strokeWidth={2.1} />}
      {children}
    </Link>
  );
}

/**
 * The toolbar pill from the reference: a rounded button whose icon sits in its
 * own circular well on the left. Used for the two or three primary actions on
 * a screen, where an ordinary button would not carry enough weight.
 */
export function ToolPill({
  icon: Icon,
  href,
  onClick,
  active = false,
  children,
  className,
}: {
  icon: ElementType;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const cls = clsx(
    "inline-flex h-11 select-none items-center gap-2.5 rounded-full border pl-1.5 pr-5 text-[13px] font-medium transition",
    active
      ? "border-transparent bg-panel-3 text-ink"
      : "border-line bg-panel text-ink-2 hover:border-line-strong hover:text-ink",
    className,
  );
  const inner = (
    <>
      <span
        className={clsx(
          "grid size-8 shrink-0 place-items-center rounded-full transition",
          active ? "bg-accent text-[var(--c-accent-ink)]" : "bg-panel-2 text-ink-3",
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** A round icon button. */
export function IconButton({
  icon: Icon,
  label,
  tone = "outline",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & {
  icon: ElementType;
  label: string;
  tone?: Variant;
  size?: "sm" | "md";
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "grid shrink-0 place-items-center rounded-full transition disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        VARIANT[tone],
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.1} />
    </button>
  );
}

/**
 * The cluster of circular icon buttons the reference groups in the middle of
 * its toolbar. One well, several buttons — they read as one control set rather
 * than as loose icons.
 */
export function CircleGroup({
  actions,
  className,
}: {
  actions: {
    icon: ElementType;
    label: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    busy?: boolean;
  }[];
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-panel p-1",
        className,
      )}
    >
      {actions.map(({ icon: Icon, label, onClick, href, disabled, busy }) => {
        const cls =
          "grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-panel-3 hover:text-ink disabled:pointer-events-none disabled:opacity-40";
        if (href) {
          return (
            <Link key={label} href={href} aria-label={label} title={label} className={cls}>
              <Icon className="size-4" strokeWidth={2} />
            </Link>
          );
        }
        return (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled || busy}
            aria-label={label}
            title={label}
            className={cls}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Icon className="size-4" strokeWidth={2} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── the filter rail ─────────────────────────────────────────────────── */

export interface PillOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: ElementType;
}

/**
 * The row of filter pills. One selected pill filled with the brand blue, the
 * rest quiet. Scrolls rather than wraps, because the number of statuses varies
 * by module and a wrapping row changes the page height as you filter.
 */
export function PillRail<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx("no-bar flex gap-1 overflow-x-auto rounded-full bg-panel-2 p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium transition",
              active
                ? "bg-accent text-[var(--c-accent-ink)]"
                : "text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={2.2} />}
            {option.label}
            {option.count !== undefined && (
              <span
                className={clsx(
                  "tnum rounded-full px-1.5 text-[10.5px] font-semibold",
                  active ? "bg-[var(--c-accent-ink)]/15" : "bg-panel-3 text-ink-4",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── inputs ──────────────────────────────────────────────────────────── */

const FIELD_BASE =
  "w-full rounded-2xl border border-line bg-panel-2 px-4 text-[13px] text-ink placeholder:text-ink-4 transition focus:border-accent";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[12px] text-ink-3">
          {label}
          {required && <span className="text-danger">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1.5 block text-[11.5px] text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[11.5px] text-ink-4">{hint}</span>
      )}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(FIELD_BASE, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={clsx(FIELD_BASE, "min-h-24 rounded-[18px] py-3 leading-relaxed", className)}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={clsx(FIELD_BASE, "h-10 appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** Search box with the magnifier inside, and a clear button once it has text. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(FIELD_BASE, "h-10 rounded-full pl-10 pr-9")}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40",
          checked ? "ramp" : "bg-panel-3",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** Multi-select chips, used for the role keys on a team member. */
export function ChipPicker({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option.value)}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition disabled:opacity-40",
              on
                ? "bg-accent text-[var(--c-accent-ink)]"
                : "bg-panel-2 text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            {on && <Check className="size-3.5" strokeWidth={2.6} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
