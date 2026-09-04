"use client";

import clsx from "clsx";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Search, Upload, X } from "lucide-react";
import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ElementType,
  type ReactNode,
} from "react";

/* ── buttons ─────────────────────────────────────────────────────────── */

type Variant = "accent" | "second" | "highlight" | "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  accent: "bg-accent text-accent-ink font-bold hover:bg-accent-hover",
  second: "bg-second text-second-ink font-bold hover:opacity-90",
  // The pre-redesign name for the second brand colour.
  highlight: "bg-second text-second-ink font-bold hover:opacity-90",
  solid: "bg-solid text-on-solid font-semibold hover:opacity-90",
  outline: "border border-line text-ink-2 hover:border-line-strong hover:text-ink",
  ghost: "text-ink-3 hover:bg-panel-2 hover:text-ink",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[12px] gap-1.5",
  md: "h-10 px-5 text-[13px] gap-2",
  lg: "h-11 px-6 text-[13.5px] gap-2",
};

// Pills throughout. At these heights a pill is what makes a dense toolbar read
// as a set of distinct targets rather than one grey bar.
const BASE =
  "inline-flex select-none items-center justify-center rounded-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-40";

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
      className={clsx(BASE, VARIANT[variant], SIZE[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="size-3.5" strokeWidth={2.2} />
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
    <Link href={href} className={clsx(BASE, VARIANT[variant], SIZE[size], className)} {...rest}>
      {Icon && <Icon className="size-3.5" strokeWidth={2.2} />}
      {children}
    </Link>
  );
}

/**
 * The toolbar pill: a rounded button whose icon sits in its own circular well.
 * For the two or three primary actions on a screen, where an ordinary button
 * would not carry enough weight.
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
    "inline-flex h-12 select-none items-center gap-3 rounded-[13px] pl-1.5 pr-5 text-[13px] font-medium transition",
    active ? "bg-panel-3 text-ink" : "lift bg-panel text-ink-2 hover:text-ink",
    className,
  );
  const inner = (
    <>
      <span
        className={clsx(
          "grid size-9 shrink-0 place-items-center rounded-full transition",
          active ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-3",
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
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
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} />
    </button>
  );
}

/**
 * The cluster of circular buttons the reference groups in its toolbar. One
 * well, several buttons — they read as one control set rather than loose icons.
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
    <div className={clsx("lift inline-flex items-center gap-1 rounded-[13px] bg-panel p-1", className)}>
      {actions.map(({ icon: Icon, label, onClick, href, disabled, busy }) => {
        const cls =
          "grid size-9 place-items-center rounded-full text-ink-3 transition hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";
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
 * Filter pills in a single well, the selected one filled with the accent.
 * Scrolls rather than wraps — the number of statuses varies by module, and a
 * wrapping row changes the page height as you filter.
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
      className={clsx("no-bar flex gap-1 overflow-x-auto rounded-[14px] bg-panel-2 p-1", className)}
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
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[12.5px] transition",
              active
                ? "bg-accent font-bold text-accent-ink"
                : "font-medium text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={2.2} />}
            {option.label}
            {option.count !== undefined && (
              <span className={clsx("tnum text-[10.5px]", active ? "opacity-65" : "text-ink-4")}>
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

const FIELD =
  "w-full rounded-2xl bg-panel-2 px-4 text-[13px] text-ink placeholder:text-ink-4 border border-transparent transition focus:border-accent";

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
        <span className="mb-2 flex items-center gap-1 text-[12px] text-ink-3">
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
  return <input ref={ref} className={clsx(FIELD, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={clsx(FIELD, "min-h-24 rounded-[20px] py-3 leading-relaxed", className)}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={clsx(FIELD, "h-11 appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** The dropdown-shaped filter pill from the reference's filter row. */
export function FilterPill({
  label,
  value,
  icon: Icon = ChevronDown,
  onClick,
  className,
}: {
  label: string;
  value?: string;
  icon?: ElementType;
  /**
   * Required on purpose. This renders a full button with a chevron, so one
   * without a handler is indistinguishable from a working filter — the Quotes
   * screen shipped an "All customers" pill that did nothing but sat between
   * two controls that did, and people clicked it.
   */
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "lift inline-flex h-10 min-w-[150px] items-center gap-3 rounded-[13px] bg-panel px-4 text-[12.5px] transition hover:text-ink",
        value ? "text-ink-2" : "text-ink-3",
        className,
      )}
    >
      {value ?? label}
      <Icon className="ml-auto size-3.5 text-ink-4" strokeWidth={2} />
    </button>
  );
}

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
        className={clsx(FIELD, "h-10 rounded-[13px] pl-10 pr-10")}
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

/**
 * A drop target for files.
 *
 * Lifted out of the comparison screen, which had this markup inline, when the
 * quoting module needed the same thing — two hand-rolled uploaders drift, and
 * the second one is always the one missing the detail that makes the first
 * work. That detail here is resetting `value` after a pick: without it the
 * same file cannot be chosen twice, so a failed upload cannot be retried.
 */
export function FileDrop({
  onFiles,
  accept,
  busy,
  hint,
  label = "Choose files, or drop them here",
  className,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  busy?: boolean;
  hint?: string;
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        className={clsx(
          "flex w-full flex-col items-center justify-center rounded-[14px] border border-dashed px-6 py-8 text-center transition",
          busy || over
            ? "border-accent bg-accent-soft"
            : "border-line hover:border-accent hover:bg-accent-soft/40",
        )}
      >
        <span className="mb-2.5 grid size-10 place-items-center rounded-2xl bg-panel-2 text-ink-3">
          <Upload className={clsx("size-4", busy && "animate-pulse")} strokeWidth={1.8} />
        </span>
        <span className="text-[13px] font-medium">{busy ? "Reading…" : label}</span>
        {hint && <span className="mt-1 max-w-sm text-[11.5px] text-ink-4">{hint}</span>}
      </button>
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
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40",
          checked ? "bg-accent" : "bg-panel-3",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 size-5 rounded-full transition-all",
            checked ? "left-[22px] bg-accent-ink" : "left-0.5 bg-ink-4",
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
              "inline-flex h-9 items-center gap-1.5 rounded-[13px] px-4 text-[12.5px] transition disabled:opacity-40",
              on
                ? "bg-accent font-bold text-accent-ink"
                : "bg-panel-2 font-medium text-ink-3 hover:bg-panel-3 hover:text-ink",
            )}
          >
            {on && <Check className="size-3.5" strokeWidth={2.8} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
