"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import {
  amount,
  decimal,
  isZero,
  markupOf,
  quantity,
  priceViaSupplier,
  type QuotePreview,
  type QuotePreviewLine,
  rateFromMarkup,
  sign,
  subExact,
  sumExact,
} from "@/lib/format";
import type { QuoteLineDraft } from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { Button, IconButton } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";
import { Margin } from "@/components/quotes/QuoteRequestBits";

/**
 * What is being sold, at what price, against what it costs.
 *
 * The row reads left to right the way the job is actually priced: what the
 * supplier charges us, what we are adding, what the customer pays. The middle
 * column is an input, not a readout — type 20 and the selling price becomes
 * cost plus twenty percent — because "cost plus twenty" is the decision
 * somebody is making, and asking them to do that multiplication in their head
 * and type the answer is how a price ends up a few cents out.
 *
 * That derivation is the one calculation this file does, and it is deliberate:
 * what it produces is an **input** the user was going to type anyway. The
 * parent may also give this editor an exact local preview of the server's
 * arithmetic. It is visibly marked as a preview and is never persisted until
 * the person presses Save.
 *
 * Cost and price never look alike. `cost_rate` is the cost price — what the
 * supplier charges us — and `rate` is the selling price, what the customer
 * pays. Both stay qualified: neither is ever labelled just "price", because a
 * bare "price" in a quoting tool is the one word that could mean either, and
 * it costs money when it is read as the wrong one.
 */

/** Columns whose width is shared by the head and every row. */
const W = {
  qty: "w-[72px]",
  cost: "w-[112px]",
  margin: "w-[112px]",
  price: "w-[118px]",
  total: "w-[132px]",
} as const;

type MarginMode = "percent" | "amount";

export function LineEditor({
  lines,
  currency,
  editable,
  dirtyIds,
  quote,
  preview,
  targetMarkup,
  fxRate,
  onChange,
  onTargetMarkupChange,
  onComment,
}: {
  lines: QuoteLineDraft[];
  currency: string;
  editable: boolean;
  /** Rows edited since the last save — their server totals are stale. */
  dirtyIds: ReadonlySet<string>;
  quote: {
    sub_total: string;
    total_excl_tax: string;
    tax_total: string;
    total: string;
    discount: string;
    shipping_charge: string;
    adjustment: string;
  };
  /** Exact local totals for unsaved edits; null means render the saved reply. */
  preview?: QuotePreview | null;
  /** The markup the quote was intentionally priced at, before Zoho rounds. */
  targetMarkup?: string | null;
  /** One unit of the quote's currency in the supplier's — "1 USD = 3.672501
      AED" — or null when the quote has no rate. Lets a retyped margin rebuild
      the price the way it was built: in the supplier's currency first. */
  fxRate?: string | null;
  onChange: (lines: QuoteLineDraft[]) => void;
  onTargetMarkupChange?: (markup: string) => void;
  onComment?: (line: QuoteLineDraft) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // One mode for the table rather than one per row: people price a whole quote
  // at a markup, and a column where every cell might mean something different
  // is a column nobody can scan.
  const [mode, setMode] = useState<MarginMode>("percent");
  // Only the focused cell needs its raw text kept, so one slot is enough. It
  // exists so a half-typed "1" on the way to "12.5" is not reformatted out
  // from under the cursor.
  const [typing, setTyping] = useState<{ key: string; text: string } | null>(null);

  function patch(key: string, change: Partial<QuoteLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  function remove(key: string) {
    onChange(lines.filter((line) => line.key !== key));
    if (typing?.key === key) setTyping(null);
  }

  function move(key: string, by: number) {
    const from = lines.findIndex((line) => line.key === key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= lines.length) return;
    const next = [...lines];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function add() {
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChange([
      ...lines,
      {
        key,
        name: "",
        description: null,
        item_code: null,
        brand: null,
        unit: null,
        quantity: "1",
        rate: "0",
        discount: "0",
        tax_name: null,
        tax_percentage: null,
        cost_rate: null,
        source_supplier_quote_id: null,
        line_total: null,
        tax_amount: null,
        total_incl_tax: null,
        supplier_unit_price: null,
        supplier_currency: null,
        margin: null,
        id: null,
      },
    ]);
    setExpanded(key);
  }

  /** What the margin cell shows: the raw text while typing, else derived. */
  function marginText(line: QuoteLineDraft): string {
    if (typing?.key === line.key) return typing.text;
    // A supplier price is marked up and rounded in its own currency before it
    // is converted. The USD rate therefore implies 20.46% even though the
    // intended markup is 20%. Show the decision that was made, not a different
    // percentage reverse-engineered from rounded figures.
    if (
      mode === "percent" &&
      line.supplier_unit_price &&
      line.supplier_currency &&
      targetMarkup?.trim()
    ) {
      return targetMarkup;
    }
    const cost = line.cost_rate?.trim() ? line.cost_rate : "0";
    const derived =
      mode === "percent" ? markupOf(cost, line.rate) : subExact(line.rate, cost);
    return derived ?? "";
  }

  /** Typing a margin rewrites the selling price. Exactly — see lib/format. */
  function setMargin(line: QuoteLineDraft, text: string) {
    setTyping({ key: line.key, text });
    const trimmed = text.trim();
    // Mid-typing states that are not yet a number: leave the price alone
    // rather than flicking it to zero and back.
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return;
    // With no cost price recorded, a margin in currency is still meaningful —
    // it is the whole selling price. A percentage of nothing is not, which is
    // the one combination the cell refuses (see `noBasis`): writing it would
    // silently zero a price somebody had typed by hand.
    const cost = line.cost_rate?.trim() ? line.cost_rate : "0";
    // A price is built where Zoho builds it — on the supplier's own figure, in
    // their currency, rounded there, then converted — whenever the line still
    // knows that figure. Marking up the converted cost instead lands a cent a
    // unit away from the estimate. A line typed by hand has no such figure and
    // is marked up on its cost, to the cent.
    const viaSupplier =
      mode === "percent" && line.supplier_unit_price && line.supplier_currency
        ? priceViaSupplier(
            line.supplier_unit_price,
            trimmed,
            line.supplier_currency === currency ? "1" : (fxRate ?? ""),
            line.supplier_currency,
          )
        : null;
    if (viaSupplier !== null) {
      // The target markup applies to the supplier-priced quote, not just the
      // row that happened to be clicked. Rebuild every source line using the
      // same Zoho order: markup and source-currency rounding, then FX.
      onTargetMarkupChange?.(trimmed);
      onChange(
        lines.map((candidate) => {
          if (!candidate.supplier_unit_price || !candidate.supplier_currency) return candidate;
          const rate = priceViaSupplier(
            candidate.supplier_unit_price,
            trimmed,
            candidate.supplier_currency === currency ? "1" : (fxRate ?? ""),
            candidate.supplier_currency,
          );
          return rate === null ? candidate : { ...candidate, rate };
        }),
      );
      return;
    }
    const next =
      mode === "percent" ? rateFromMarkup(cost, trimmed, 2) : sumExact([cost, trimmed]);
    if (next !== null) patch(line.key, { rate: next });
  }

  const belowCost = lines.filter((line) => sign(preview?.lines[line.key]?.margin ?? line.margin) < 0).length;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span className="text-[15px] font-semibold">Lines</span>
        {belowCost > 0 && (
          <Badge tone="danger" title="Priced under what the supplier charges us">
            {belowCost} below cost
          </Badge>
        )}
        <span className="tnum ml-auto text-[12px] text-ink-3">
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
        {editable && lines.length > 0 && (
          <ModeSwitch mode={mode} currency={currency} onChange={setMode} />
        )}
        {editable && (
          <Button size="sm" icon={Plus} onClick={add}>
            Add line
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="px-5 pb-5">
          <Empty
            title="Nothing priced yet"
            body={
              editable
                ? "Attach the supplier quotes below and choose one, and the lines are priced from it. Or add them by hand."
                : "This quote has no lines on it."
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="flex items-center gap-2 border-y border-line bg-panel-2 px-5 py-2">
                {editable && <span className="w-[52px] shrink-0" />}
                <span className="micro flex-1 text-ink-4">Item</span>
                <span className={clsx("micro shrink-0 text-right text-ink-4", W.qty)}>Qty</span>
                {/* Cost, then what we add, then what they pay — the order the
                    decision is actually made in. */}
                <span className={clsx("micro shrink-0 text-right text-ink-4", W.cost)}>
                  Cost price
                </span>
                <span className={clsx("micro shrink-0 text-right text-ink-4", W.margin)}>
                  {mode === "percent" ? "Markup %" : `Margin ${currency}`}
                </span>
                <span className={clsx("micro shrink-0 text-right text-ink-4", W.price)}>
                  Selling price
                </span>
                <span className={clsx("micro shrink-0 text-right text-ink-4", W.total)}>
                  Line total
                </span>
                {editable && <span className="w-9 shrink-0" />}
              </div>

              {lines.map((line, index) => (
                <LineRow
                  key={line.key}
                  line={line}
                  index={index}
                  last={index === lines.length - 1}
                  currency={currency}
                  editable={editable}
                  mode={mode}
                  dirty={dirtyIds.has(line.key)}
                  preview={preview?.lines[line.key] ?? null}
                  open={expanded === line.key}
                  marginText={marginText(line)}
                  onMargin={(text) => setMargin(line, text)}
                  onMarginBlur={() => setTyping(null)}
                  onToggle={() => setExpanded(expanded === line.key ? null : line.key)}
                  onPatch={(change) => patch(line.key, change)}
                  onRemove={() => remove(line.key)}
                  onMove={(by) => move(line.key, by)}
                  onComment={onComment ? () => onComment(line) : undefined}
                />
              ))}
            </div>
          </div>

          <Totals quote={quote} currency={currency} preview={preview !== null && preview !== undefined} />
        </>
      )}
    </Panel>
  );
}

/** Whether the margin column is read and written as a percentage or an amount. */
function ModeSwitch({
  mode,
  currency,
  onChange,
}: {
  mode: MarginMode;
  currency: string;
  onChange: (mode: MarginMode) => void;
}) {
  return (
    <div
      className="flex items-center rounded-[10px] bg-panel-2 p-0.5"
      role="group"
      aria-label="Margin entered as"
    >
      {(["percent", "amount"] as const).map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={mode === option}
          title={
            option === "percent"
              ? "Margin as a percentage on top of the cost price"
              : `Margin as an amount per unit in ${currency}, on top of the cost price`
          }
          className={clsx(
            "rounded-[8px] px-2.5 py-1 text-[11.5px] font-medium transition",
            mode === option ? "bg-panel text-ink shadow-sm" : "text-ink-4 hover:text-ink-2",
          )}
        >
          {option === "percent" ? "%" : currency}
        </button>
      ))}
    </div>
  );
}

/* ── one line ────────────────────────────────────────────────────────── */

function LineRow({
  line,
  index,
  last,
  currency,
  editable,
  mode,
  dirty,
  preview,
  open,
  marginText,
  onMargin,
  onMarginBlur,
  onToggle,
  onPatch,
  onRemove,
  onMove,
  onComment,
}: {
  line: QuoteLineDraft;
  index: number;
  last: boolean;
  currency: string;
  editable: boolean;
  mode: MarginMode;
  dirty: boolean;
  preview: QuotePreviewLine | null;
  open: boolean;
  marginText: string;
  onMargin: (text: string) => void;
  onMarginBlur: () => void;
  onToggle: () => void;
  onPatch: (change: Partial<QuoteLineDraft>) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
  onComment?: () => void;
}) {
  // A percentage needs something to be a percentage *of*; an amount does not,
  // so only that one combination is refused.
  const noCost =
    line.cost_rate === null || line.cost_rate.trim() === "" || isZero(line.cost_rate);
  const noBasis = mode === "percent" && noCost;
  const calculated = preview ?? {
    line_total: line.line_total,
    tax_amount: line.tax_amount,
    total_incl_tax: line.total_incl_tax,
    margin: line.margin,
  };

  return (
    <div className={clsx("border-b border-line/60", open && "bg-panel-2/40")}>
      <div className="flex items-center gap-2 px-5 py-2">
        {editable && (
          <span className="flex w-[52px] shrink-0 flex-col">
            <button
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label="Move up"
              title="Move up"
              className="grid h-4 place-items-center rounded text-ink-4 transition hover:text-ink disabled:opacity-25"
            >
              <ChevronUp className="size-3.5" strokeWidth={2.2} />
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={last}
              aria-label="Move down"
              title="Move down"
              className="grid h-4 place-items-center rounded text-ink-4 transition hover:text-ink disabled:opacity-25"
            >
              <ChevronDown className="size-3.5" strokeWidth={2.2} />
            </button>
          </span>
        )}

        {/* The name is an input in its own right, so the expander is the
            summary line beneath it rather than a button wrapped around both —
            an <input> inside a <button> is invalid, and in practice means the
            field cannot be focused by clicking it. */}
        <div className="min-w-0 flex-1">
          {editable ? (
            <Cell
              value={line.name}
              onChange={(v) => onPatch({ name: v })}
              placeholder="What is being sold"
              className="font-medium"
            />
          ) : (
            <span className="block truncate text-[13px] font-medium">{line.name || "—"}</span>
          )}
          <button
            onClick={onToggle}
            aria-expanded={open}
            title="Show the rest of this line"
            className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left text-[11px] text-ink-4 transition hover:text-ink-3"
          >
            {line.brand && <span>{line.brand}</span>}
            {line.item_code && <span className="font-mono">{line.item_code}</span>}
            {line.tax_percentage && !isZero(line.tax_percentage) && (
              <span>
                +{decimal(line.tax_percentage, { min: 0 })}% {line.tax_name ?? "tax"}
              </span>
            )}
            {!isZero(line.discount) && <span>&minus;{decimal(line.discount, { min: 0 })}% off</span>}
            {line.source_supplier_quote_id && <span>priced from a supplier quote</span>}
            <span className="underline underline-offset-2">{open ? "less" : "more"}</span>
          </button>
        </div>

        <NumCell
          value={line.quantity}
          suffix={line.unit ?? undefined}
          editable={editable}
          className={W.qty}
          onChange={(v) => onPatch({ quantity: v })}
          display={quantity(line.quantity)}
          label="Quantity"
        />

        <NumCell
          value={line.cost_rate ?? ""}
          editable={editable}
          className={clsx(W.cost, "text-ink-3")}
          onChange={(v) => onPatch({ cost_rate: v === "" ? null : v })}
          display={line.cost_rate === null ? "—" : decimal(line.cost_rate)}
          label="Cost price — what the supplier charges us"
          placeholder="—"
        />

        {/* Type here and the selling price follows. */}
        <NumCell
          value={marginText}
          editable={editable && !noBasis}
          className={clsx(W.margin, "font-medium")}
          onChange={onMargin}
          onBlur={onMarginBlur}
          display={
            noBasis || marginText === ""
              ? "—"
              : mode === "percent"
                ? `${decimal(marginText, { min: 0 })}%`
                : decimal(marginText)
          }
          placeholder={noBasis ? "—" : mode === "percent" ? "%" : currency}
          label={
            noBasis
              ? `No cost price on this line, so a percentage has nothing to work from — switch the toggle to ${currency} to set the margin as an amount`
              : mode === "percent"
                ? "Margin as a percentage on the cost price — sets the selling price"
                : `Margin per unit in ${currency} — sets the selling price`
          }
        />

        <NumCell
          value={line.rate}
          editable={editable}
          className={W.price}
          onChange={(v) => onPatch({ rate: v })}
          display={decimal(line.rate)}
          label="Selling price — what the customer pays"
        />

        {/* During an edit these are an exact local preview. The server remains
            the source of record and only receives values after Save. */}
        <span className={clsx("shrink-0 text-right", W.total)}>
          <span
            className={clsx("tnum block text-[12.5px]", preview ? "font-semibold" : dirty ? "text-ink-4 line-through decoration-ink-4/40" : "font-semibold")}
            title={preview ? "Live preview — saved only when you press Save changes." : dirty ? "Out of date — finish the number to preview its total." : undefined}
          >
            {calculated.line_total === null ? "—" : amount(calculated.line_total, currency)}
          </span>
          <span className="mt-0.5 block text-[10.5px]">
            {preview ? (
              <span className="text-accent">live preview</span>
            ) : dirty ? (
              <span className="text-ink-4">finish number to preview</span>
            ) : calculated.margin === null ? null : (
              <>
                <span className="text-ink-4">makes </span>
                <Margin value={calculated.margin} currency={currency} className="text-[10.5px]" />
              </>
            )}
          </span>
          {/* Zoho's "Tax" and "Amount" columns, under the taxable amount, so a
              line here reads the same as its line on the estimate. */}
          {calculated.tax_amount !== null && !isZero(calculated.tax_amount) && (
            <span className="tnum mt-0.5 block text-[10.5px] text-ink-4">
              + {amount(calculated.tax_amount, currency)} tax ={" "}
              <span className="text-ink-2">{amount(calculated.total_incl_tax, currency)}</span>
            </span>
          )}
        </span>

        {editable && (
          <IconButton
            icon={Trash2}
            label="Delete this line"
            size="sm"
            tone="ghost"
            className="shrink-0 hover:text-danger"
            onClick={onRemove}
          />
        )}
      </div>

      {open && (
        <div className="grid gap-3 px-5 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Description" wide>
            <Cell
              value={line.description ?? ""}
              editable={editable}
              onChange={(v) => onPatch({ description: v || null })}
              placeholder="Longer detail, as it should read on the quote"
            />
          </Detail>
          <Detail label="Item code">
            <Cell
              value={line.item_code ?? ""}
              editable={editable}
              onChange={(v) => onPatch({ item_code: v || null })}
              className="font-mono"
            />
          </Detail>
          <Detail label="Brand">
            <Cell
              value={line.brand ?? ""}
              editable={editable}
              onChange={(v) => onPatch({ brand: v || null })}
            />
          </Detail>
          <Detail label="Unit">
            <Cell
              value={line.unit ?? ""}
              editable={editable}
              onChange={(v) => onPatch({ unit: v || null })}
              placeholder="each, m, kg"
            />
          </Detail>
          <Detail label="Discount %">
            <Cell
              value={line.discount}
              editable={editable}
              numeric
              onChange={(v) => onPatch({ discount: v })}
            />
          </Detail>
          <Detail label="Tax name">
            <Cell
              value={line.tax_name ?? ""}
              editable={editable}
              onChange={(v) => onPatch({ tax_name: v || null })}
              placeholder="VAT"
            />
          </Detail>
          <Detail label="Tax %">
            <Cell
              value={line.tax_percentage ?? ""}
              editable={editable}
              numeric
              onChange={(v) => onPatch({ tax_percentage: v === "" ? null : v })}
            />
          </Detail>
          {onComment && (
            <div className="flex items-end">
              <Button size="sm" icon={MessageSquare} onClick={onComment}>
                Comment on this line
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-[11px] text-ink-4">{label}</span>
      {children}
    </label>
  );
}

/** A borderless text cell that only looks like an input once you are in it. */
function Cell({
  value,
  onChange,
  editable = true,
  placeholder,
  numeric,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  numeric?: boolean;
  className?: string;
}) {
  if (!editable) {
    return (
      <span className={clsx("block truncate text-[12.5px]", !value && "text-ink-4", className)}>
        {value || "—"}
      </span>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      className={clsx(
        "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] outline-none transition placeholder:text-ink-4/70 hover:border-line focus:border-accent focus:bg-panel",
        className,
      )}
    />
  );
}

/**
 * A right-aligned numeric cell.
 *
 * Text with a decimal keypad rather than `type="number"`: a number input round
 * trips its value through a float and will quietly rewrite an exact decimal
 * the server is expecting, which is the one thing this module exists to avoid.
 */
function NumCell({
  value,
  display,
  onChange,
  onBlur,
  editable,
  className,
  suffix,
  label,
  placeholder,
}: {
  value: string;
  display: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  editable: boolean;
  className?: string;
  suffix?: string;
  label: string;
  placeholder?: string;
}) {
  if (!editable) {
    return (
      <span className={clsx("tnum shrink-0 text-right text-[12px]", className)} title={label}>
        {display}
        {suffix ? ` ${suffix}` : ""}
      </span>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      inputMode="decimal"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      className={clsx(
        "tnum shrink-0 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-right text-[12px] outline-none transition hover:border-line focus:border-accent focus:bg-panel",
        className,
      )}
    />
  );
}

/* ── the totals ──────────────────────────────────────────────────────── */

/**
 * Every number here is the server's, rendered from the string it sent. The
 * discount, shipping and adjustment rows appear only when they are non-zero —
 * checked on the digits, so a "0.000" does not draw a row.
 */
function Totals({
  quote,
  currency,
  preview,
}: {
  quote: {
    sub_total: string;
    total_excl_tax: string;
    tax_total: string;
    total: string;
    discount: string;
    shipping_charge: string;
    adjustment: string;
  };
  currency: string;
  preview: boolean;
}) {
  const taxed = !isZero(quote.tax_total);
  return (
    <div className="space-y-1.5 border-t border-line px-5 py-4">
      {preview && (
        <p className="text-[11px] text-accent">Live preview — Save changes to apply it.</p>
      )}
      <Line label="Sub-total" value={quote.sub_total} currency={currency} />
      {!isZero(quote.discount) && (
        <Line label="Discount" value={quote.discount} currency={currency} negate />
      )}
      {!isZero(quote.shipping_charge) && (
        <Line label="Shipping" value={quote.shipping_charge} currency={currency} />
      )}
      {!isZero(quote.adjustment) && (
        <Line label="Adjustment" value={quote.adjustment} currency={currency} />
      )}
      {/* Both totals, when there is tax: a customer reads the one before tax
          and the one they pay, and neither stands in for the other. */}
      {taxed && (
        <Line label="Total before tax" value={quote.total_excl_tax} currency={currency} />
      )}
      {taxed && <Line label="Tax" value={quote.tax_total} currency={currency} />}
      <Line
        label={taxed ? "Total incl. tax" : "Total"}
        value={quote.total}
        currency={currency}
        strong
      />
    </div>
  );
}

function Line({
  label,
  value,
  currency,
  strong,
  negate,
}: {
  label: string;
  value: string;
  currency: string;
  strong?: boolean;
  negate?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={clsx("text-[12.5px]", strong ? "font-semibold" : "text-ink-3")}>
        {label}
      </span>
      <span
        className={clsx(
          "tnum ml-auto",
          strong ? "text-[17px] font-bold" : "text-[12.5px] text-ink-2",
        )}
      >
        {/* A discount is shown as what it takes off, so the sign is written
            here rather than by flipping the value the server sent. */}
        {negate ? "−" : ""}
        {amount(value, currency)}
      </span>
    </div>
  );
}
