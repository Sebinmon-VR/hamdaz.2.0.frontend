"use client";

/**
 * Payroll's compact controls.
 *
 * The app's primitives are sized for a form on its own — 44px fields, pill
 * buttons, floating panels. Payroll is a dense business screen, built like
 * the payroll products people already know: one flat surface, thin dividers,
 * 32px controls, tables. There is no tailwind-merge, so the primitives' sizes
 * are overridden with trailing `!`.
 */

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { Button, Input, LinkButton, Select, Textarea } from "@/components/ui/controls";

const BOX =
  "h-8! rounded-md! border-line! bg-panel! px-2.5! text-[13px]! focus:border-accent! disabled:bg-panel-2! disabled:text-ink-3!";

export function TextBox({ className, ...rest }: ComponentProps<"input">) {
  return <Input className={clsx(BOX, className)} {...rest} />;
}

export function SelectBox({ className, ...rest }: ComponentProps<"select">) {
  return <Select className={clsx(BOX, "pr-8!", className)} {...rest} />;
}

export function AreaBox({ className, ...rest }: ComponentProps<"textarea">) {
  return (
    <Textarea
      className={clsx(
        "min-h-16! rounded-md! border-line! bg-panel! px-2.5! py-1.5! text-[13px]! focus:border-accent!",
        className,
      )}
      {...rest}
    />
  );
}

type BtnProps = ComponentProps<typeof Button>;

/** A 32px, square-cornered button. */
export function Btn({ className, ...rest }: BtnProps) {
  return <Button size="sm" className={clsx("rounded-md! px-3!", className)} {...rest} />;
}

export function BtnLink({ className, ...rest }: ComponentProps<typeof LinkButton>) {
  return <LinkButton size="sm" className={clsx("rounded-md! px-3!", className)} {...rest} />;
}

/** A square icon button, for month arrows and row actions. */
export function IconBtn({
  icon: Icon,
  label,
  bare,
  className,
  ...rest
}: ComponentProps<"button"> & { icon: ElementType; label: string; bare?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-panel-2 hover:text-ink disabled:opacity-40",
        !bare && "border",
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" strokeWidth={2} />
    </button>
  );
}

export function MonthArrows({
  label,
  onMove,
}: {
  label: string;
  onMove: (by: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <IconBtn icon={ChevronLeft} label="Previous month" onClick={() => onMove(-1)} />
      <h2 className="min-w-[9.5rem] text-center text-[15px] font-semibold text-ink">{label}</h2>
      <IconBtn icon={ChevronRight} label="Next month" onClick={() => onMove(1)} />
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-64 max-w-full">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-line bg-panel pl-8 pr-7 text-[13px] text-ink outline-none placeholder:text-ink-4 focus:border-accent!"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center text-ink-4 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** A label over its field, for the side panels. */
export function Labeled({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={clsx("block min-w-0", className)}>
      <span className="mb-1 block text-[12px] font-medium text-ink-2">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-4">{hint}</span>}
    </label>
  );
}

/** A settings row: what it is on the left, the control on the right. */
export function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-10 gap-y-1.5 border-b border-line py-3.5 last:border-b-0 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-4">{hint}</p>}
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </div>
  );
}

/** The one flat surface a payroll screen sits on. */
export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-xl border border-line bg-panel", className)}>{children}</div>;
}

export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5", className)}>
      {children}
    </div>
  );
}

export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
  right,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-4">
      <div role="tablist" className="no-bar flex min-w-0 gap-6 overflow-x-auto">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={clsx(
                "relative flex h-11 shrink-0 items-center gap-1.5 text-[13px] transition",
                active ? "font-semibold text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {o.label}
              {o.count !== undefined && <span className="tnum text-[11px] text-ink-4">{o.count}</span>}
              {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Headline figures in a row, divided by rules rather than boxed. */
export function Stats({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 border-b border-line sm:flex sm:divide-x sm:divide-line">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 py-2.5 sm:pr-8">
          <p className="text-[11px] uppercase tracking-wide text-ink-4">{item.label}</p>
          <p
            className={clsx(
              "tnum mt-0.5 truncate text-[15px] font-semibold",
              item.strong ? "text-positive" : "text-ink",
            )}
            title={item.value}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** A one-line notice across the surface: a rule of colour, not a block. */
export function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "positive";
  children: ReactNode;
}) {
  const tones = {
    info: "border-l-info! bg-info-soft/60 text-ink-2",
    warn: "border-l-warn! bg-warn-soft/60 text-ink-2",
    danger: "border-l-danger! bg-danger-soft/60 text-danger",
    positive: "border-l-positive! bg-positive-soft/60 text-ink-2",
  };
  return (
    <div className={clsx("border-b border-l-[3px] px-4 py-2 text-[12.5px] leading-relaxed", tones[tone])}>
      {children}
    </div>
  );
}

export const TH =
  "border-b border-line bg-panel-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-4";
export const TD = "border-b border-line px-3 py-2";
