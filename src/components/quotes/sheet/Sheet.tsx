"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The spreadsheet, as a spreadsheet.
 *
 * The bid pack started life as a workbook somebody built by hand, and the
 * people who have to use this already know that workbook: five tabs, a title
 * block at the top of each, banded section headers, numbered cost rows, yellow
 * cells for the things you type and plain ones for the things the sheet works
 * out. Rebuilding that as stacked panels of labelled form fields was a fair
 * translation and the wrong one — it turned a page you *scan* into a page you
 * *scroll*, and it threw away the one piece of interface training everybody
 * already had.
 *
 * So these primitives are deliberately spreadsheet-shaped:
 *
 * * **Dense.** Rows are 28–32px, not 72px form fields with hints underneath.
 *   Everything a sheet of the workbook holds should fit roughly where it fits
 *   in the workbook.
 * * **Yellow means you type here.** The workbook says so in its own header
 *   —"Yellow cells are editable inputs. All other cells are formula-driven" —
 *   and that convention is carried over exactly, via `--warn-soft`, which is a
 *   pale yellow in the light themes and a dark amber in the dark ones.
 * * **Cells, not fields.** An editable cell is a borderless input that fills
 *   its cell. No label above it, no hint below it: the column heading is the
 *   label, the same way it is in Excel.
 *
 * Everything still renders read-only when the quote is not editable, and the
 * yellow simply goes away — which is the honest signal, since there is then
 * nothing to type anywhere.
 */

/* ── the paper ───────────────────────────────────────────────────────── */

export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="lift overflow-hidden rounded-2xl bg-panel">
      {/* Sheets are wide and phones are not. One scroller around the whole
          sheet keeps columns aligned with their headings; the alternative —
          wrapping cells — is what makes a table stop being a table. */}
      <div className="no-bar overflow-x-auto">
        <div className="min-w-[860px]">{children}</div>
      </div>
    </div>
  );
}

/** The heading block every sheet of the workbook opens with. */
export function SheetHead({
  org = "Hamdaztech Technology Services LLC",
  title,
  subtitle,
  note,
}: {
  org?: string;
  title: string;
  subtitle?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="border-b border-line-strong px-5 py-4 text-center">
      <p className="micro text-ink-4">{org}</p>
      <h2 className="mt-1 text-[15px] font-semibold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-[12px] text-ink-2">{subtitle}</p>}
      {note && <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">{note}</p>}
    </div>
  );
}

/** A banded section header — "1. EVENT PARTICULARS". */
export function Band({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div
      className={clsx(
        "border-y border-line px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wide",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-panel-2 text-ink-2",
      )}
    >
      {children}
    </div>
  );
}

/* ── label / value rows ──────────────────────────────────────────────── */

export function Facts({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

/**
 * One row of a label-and-value block.
 *
 * The label column is fixed so that a run of rows reads as a column rather than
 * as a ragged list — which is most of what makes the workbook's summary tab
 * legible at a glance.
 */
export function Fact({
  label,
  children,
  note,
  strong,
  tone,
}: {
  label: string;
  children: ReactNode;
  /** The workbook's right-hand commentary column. */
  note?: ReactNode;
  /** For the one or two rows on a sheet that are the answer. */
  strong?: boolean;
  tone?: "danger" | "positive";
}) {
  return (
    <div
      className={clsx(
        "grid grid-cols-[210px_minmax(0,1fr)] items-stretch border-b border-line last:border-0",
        strong && "bg-accent-soft/35",
      )}
    >
      <div
        className={clsx(
          "flex items-center border-r border-line px-4 py-1.5 text-[12px]",
          strong ? "font-semibold text-ink" : "text-ink-3",
        )}
      >
        {label}
      </div>
      <div
        className={clsx(
          "grid min-w-0 items-stretch",
          note ? "grid-cols-[minmax(0,1fr)_260px]" : "grid-cols-1",
        )}
      >
        <div
          className={clsx(
            "flex min-w-0 items-center px-3 py-1.5 text-[12.5px]",
            strong ? "font-semibold text-ink" : "text-ink",
            tone === "danger" && "text-danger",
            tone === "positive" && "text-positive",
          )}
        >
          {children}
        </div>
        {note && (
          <div className="flex items-center border-l border-line px-3 py-1.5 text-[11px] leading-snug text-ink-4">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the grid ────────────────────────────────────────────────────────── */

export function Grid({
  columns,
  children,
}: {
  /** Any grid-template-columns value — the sheet's own column widths. */
  columns: string;
  children: ReactNode;
}) {
  return (
    <div style={{ "--cols": columns } as React.CSSProperties} className="text-[12.5px]">
      {children}
    </div>
  );
}

export function GridHead({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid border-b border-line-strong bg-panel-2"
      style={{ gridTemplateColumns: "var(--cols)" }}
    >
      {children}
    </div>
  );
}

export function GridRow({
  children,
  tone,
  strong,
  faded,
}: {
  children: ReactNode;
  tone?: "warn" | "danger" | "positive" | "accent";
  /** Totals and subtotals: a heavier rule above, bolder figures. */
  strong?: boolean;
  /** Cleared, superseded — still there, visibly done with. */
  faded?: boolean;
}) {
  return (
    <div
      className={clsx(
        "grid items-stretch border-b border-line last:border-0",
        strong && "border-t-2 border-t-line-strong bg-panel-2/60 font-semibold",
        faded && "opacity-55",
        tone === "warn" && "bg-warn-soft/25",
        tone === "danger" && "bg-danger-soft/30",
        tone === "positive" && "bg-positive-soft/25",
        tone === "accent" && "bg-accent-soft/35",
      )}
      style={{ gridTemplateColumns: "var(--cols)" }}
    >
      {children}
    </div>
  );
}

/** A heading cell. */
export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "border-r border-line px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3 last:border-r-0",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A body cell. */
export function Td({
  children,
  align = "left",
  muted,
  wrap,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  muted?: boolean;
  /** Prose columns wrap; figure columns do not. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start border-r border-line px-2.5 py-1.5 last:border-r-0",
        align === "right" && "justify-end text-right",
        align === "center" && "justify-center text-center",
        muted ? "text-ink-3" : "text-ink",
        wrap ? "leading-snug" : "items-center",
        className,
      )}
    >
      {wrap ? <span className="min-w-0">{children}</span> : children}
    </div>
  );
}

/** A figure. Tabular, right-aligned, never wrapped — as in the workbook. */
export function Num({
  children,
  strong,
  muted,
}: {
  children: ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={clsx(
        "tnum whitespace-nowrap",
        strong && "font-semibold",
        muted && "text-ink-3",
      )}
    >
      {children}
    </span>
  );
}

/* ── the cells you type in ───────────────────────────────────────────── */

/**
 * An editable cell.
 *
 * Yellow, borderless, filling its cell — the workbook's own convention for
 * "this one is yours". When the quote is not editable it renders as plain text,
 * because a disabled input is a control that looks like it should work.
 */
export function CellInput({
  value,
  editable,
  onChange,
  placeholder,
  numeric,
  align,
  uppercase,
  maxLength,
  type,
  /** How the value should read when it is not editable. */
  display,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  align?: "left" | "right";
  uppercase?: boolean;
  maxLength?: number;
  type?: string;
  display?: ReactNode;
}) {
  if (!editable) {
    return (
      <span
        className={clsx(
          "block min-w-0 truncate py-0.5 text-[12.5px]",
          numeric && "tnum",
          align === "right" && "text-right",
          !value && "text-ink-4",
        )}
      >
        {display ?? value ?? ""}
        {!value && !display ? "—" : null}
      </span>
    );
  }

  return (
    <input
      value={value}
      type={type}
      maxLength={maxLength}
      // Text with a numeric keypad, never type="number". A number input
      // round-trips through a float and quietly rewrites the exact decimal the
      // server is expecting — see the line editor for the same rule.
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      placeholder={placeholder}
      className={clsx(
        "w-full min-w-0 rounded-[4px] bg-warn-soft/70 px-1.5 py-1 text-[12.5px] text-ink outline-none",
        "placeholder:text-ink-4/70 focus:bg-warn-soft focus:ring-1 focus:ring-accent",
        numeric && "tnum",
        align === "right" && "text-right",
      )}
    />
  );
}

/** The same, for prose that runs to more than a line. */
export function CellText({
  value,
  editable,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  if (!editable) {
    return (
      <span
        className={clsx(
          "block min-w-0 whitespace-pre-wrap py-0.5 text-[12.5px] leading-snug",
          !value && "text-ink-4",
        )}
      >
        {value || "—"}
      </span>
    );
  }
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        "w-full min-w-0 resize-y rounded-[4px] bg-warn-soft/70 px-1.5 py-1 text-[12.5px] leading-snug text-ink outline-none",
        "placeholder:text-ink-4/70 focus:bg-warn-soft focus:ring-1 focus:ring-accent",
      )}
    />
  );
}

/** A dropdown cell, in the same clothes. */
export function CellSelect({
  value,
  editable,
  onChange,
  options,
  blank = "—",
  required = false,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  blank?: string;
  /** No empty choice. For a cell the quote cannot be without, such as its
      currency — offering "—" there only invites a value the server refuses. */
  required?: boolean;
}) {
  if (!editable) {
    const chosen = options.find((option) => option.value === value);
    return (
      <span className={clsx("block truncate py-0.5 text-[12.5px]", !value && "text-ink-4")}>
        {chosen?.label ?? value ?? blank}
        {!value && !chosen ? blank : null}
      </span>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-[4px] bg-warn-soft/70 px-1.5 py-1 text-[12.5px] text-ink outline-none focus:bg-warn-soft focus:ring-1 focus:ring-accent"
    >
      {!required && <option value="">{blank}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {value && !options.some((option) => option.value === value) && (
        <option value={value}>{value}</option>
      )}
    </select>
  );
}

/** A tick cell — the portal checklist, the "cleared" column. */
export function CellCheck({
  checked,
  editable,
  onChange,
  label,
}: {
  checked: boolean;
  editable: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!editable}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="size-3.5 accent-current disabled:opacity-40"
    />
  );
}

/** The footnote the workbook puts under a sheet that has editable cells. */
export function YellowNote() {
  return (
    <p className="border-t border-line px-4 py-2 text-[11px] text-ink-4">
      <span className="mr-1.5 inline-block size-2.5 translate-y-[1px] rounded-[3px] bg-warn-soft" />
      Yellow cells are yours to fill in. Everything else is worked out from them by the
      server, and cannot be typed over.
    </p>
  );
}
