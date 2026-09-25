"use client";

import clsx from "clsx";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, MessageSquare, Plus, Trash2 } from "lucide-react";
import {
  amount,
  decimal,
  isZero,
  marginOf,
  multiplyExact,
  quantity,
  divideExact,
  roundExact,
  type QuotePreview,
  type QuotePreviewLine,
  rateFromMargin,
  sign,
  subExact,
  sumExact,
} from "@/lib/format";
import type { CostElementOut, QuoteLineDraft } from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { Button, Field, Input, Textarea } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";
import { Margin } from "@/components/quotes/QuoteRequestBits";

/**
 * What is being sold, at what price, against what it costs.
 *
 * A sheet, not a form. The table holds no inputs: ten lines are ten short
 * rows of figures that read like a price list — what the supplier charges,
 * what it costs landed, the margin kept, what the customer pays, what the
 * line comes to. Clicking a row opens the one place a line is edited: a
 * dialog with every field, the margin, and the working of its price with
 * the line's own numbers in it. Nothing about a line is lost; it is just not
 * all on the page at once.
 *
 * The margin is an input, not a readout: type 20 and the selling price
 * becomes the landed cost ÷ 0.8. That derivation is the one calculation this
 * file does, and it is deliberate: what it produces is an **input** the user
 * was going to type anyway. The parent may also give this editor an exact
 * local preview of the server's arithmetic. It is marked as a preview and is
 * never persisted until the person presses Save.
 *
 * Cost and price never look alike. `cost_rate` is the cost price — what the
 * supplier charges us — and `rate` is the selling price, what the customer
 * pays. Both stay qualified: a bare "price" in a quoting tool is the one word
 * that could mean either, and it costs money when it is read as the wrong one.
 */

type MarginMode = "percent" | "amount";

/** One row of the build-up, as this line carries it: its share, per unit. */
interface LandedPart {
  label: string;
  basis: string | null;
  amount: string;
}

/** A figure to the cent, with thousands, or a dash. */
function cents(value: string | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : decimal(roundExact(value, 2) ?? value);
}

export function LineEditor({
  lines,
  currency,
  editable,
  dirtyIds,
  quote,
  preview,
  targetMargin,
  fxRate,
  landedUplift,
  landedElements,
  costTotal,
  landedTotal,
  grossProfit,
  grossMarginPercent,
  onChange,
  onTargetMarginChange,
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
    /** One rate on the total before tax; the footer names it. */
    tax_name: string | null;
    tax_percentage: string | null;
  };
  /** Exact local totals for unsaved edits; null means render the saved reply. */
  preview?: QuotePreview | null;
  /** The margin the quote was intentionally priced at — a share of the
      selling price — before Zoho rounds. */
  targetMargin?: string | null;
  /** One unit of the quote's currency in the supplier's — "1 USD = 3.672501
      AED" — or null when the quote has no rate. */
  fxRate?: string | null;
  /**
   * Landed cost ÷ goods cost, from the server: the share of freight,
   * insurance, duty and bank charges each line carries on top of its cost. A
   * price is built on cost × this, so the margin typed is the gross margin.
   * "1" (or null) when nothing is landed.
   */
  landedUplift?: string | null;
  /** Σ cost × quantity over the costed lines — exact, live while editing. */
  costTotal?: string | null;
  /**
   * The rows of the landed-cost build-up, from the server: freight, insurance,
   * duty, bank charges, each with its amount and its basis. A line's landed
   * cost is its price plus its share of each, in proportion to what it cost.
   */
  landedElements?: CostElementOut[] | null;
  /** The server's landed cost, gross profit and gross margin, as saved. */
  landedTotal?: string | null;
  grossProfit?: string | null;
  grossMarginPercent?: string | null;
  onChange: (lines: QuoteLineDraft[]) => void;
  onTargetMarginChange?: (margin: string) => void;
  onComment?: (line: QuoteLineDraft) => void;
}) {
  void fxRate;
  // The line whose details are open, by key. One at a time, on purpose.
  const [expanded, setExpanded] = useState<string | null>(null);
  // One mode for the table rather than one per row: people price a whole quote
  // at a margin, and a column where every cell might mean something different
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
    if (expanded === key) setExpanded(null);
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
        cost_rate: null,
        source_supplier_quote_id: null,
        line_total: null,
        supplier_unit_price: null,
        supplier_currency: null,
        margin: null,
        id: null,
      },
    ]);
    setExpanded(key);
  }

  /**
   * How a line's landed cost got there: its share of each row on the Landed
   * cost tab, per unit. A row is paid on the shipment, so the line that is a
   * fifth of the goods carries a fifth of it: row × (this cost ÷ all costs).
   */
  function landedPartsOf(line: QuoteLineDraft): LandedPart[] {
    const cost = line.cost_rate?.trim();
    if (!cost || isZero(cost) || !costTotal || isZero(costTotal) || !landedElements) return [];
    const parts: LandedPart[] = [];
    for (const element of landedElements) {
      if (element.is_principal || isZero(element.amount_base)) continue;
      const product = multiplyExact(element.amount_base, cost);
      const share = product === null ? null : divideExact(product, costTotal, 2);
      if (share === null) continue;
      parts.push({ label: element.label, basis: element.basis, amount: share });
    }
    return parts;
  }

  /** A line's cost with its share of the landing costs on top. */
  function landedCostOf(line: QuoteLineDraft): string {
    const cost = line.cost_rate?.trim() ? line.cost_rate : "0";
    const uplift = landedUplift?.trim() || "1";
    return multiplyExact(cost, uplift) ?? cost;
  }

  /** What the margin cell shows: the raw text while typing, else derived. */
  function marginText(line: QuoteLineDraft): string {
    if (typing?.key === line.key) return typing.text;
    const cost = line.cost_rate?.trim() ? line.cost_rate : "0";
    // As a percentage the margin is over the landed cost — what the price
    // was built on — so a quote priced at 20% reads 20 here, not 24.
    const derived =
      mode === "percent" ? marginOf(landedCostOf(line), line.rate) : subExact(line.rate, cost);
    // A supplier price is priced and rounded in its own currency before it is
    // converted. The USD rate therefore implies 20.46% even though the
    // intended margin is 20%. Show the decision that was made, not a different
    // percentage reverse-engineered from rounded figures — unless the stored
    // figure is plainly not this line's margin at all. A line priced before
    // the margin rule changed carries the old markup here, and 25 over a line
    // that keeps 20% would be a lie; the line's own margin is then shown.
    if (
      mode === "percent" &&
      line.supplier_unit_price &&
      line.supplier_currency &&
      targetMargin?.trim() &&
      derived !== null &&
      Math.abs(Number(derived) - Number(targetMargin)) <= 1
    ) {
      return targetMargin;
    }
    return derived ?? "";
  }

  /**
   * The price a margin makes of a costed line: its landed cost ÷ (1 − margin),
   * rounded as Zoho rounds an item price in this currency — the whole dirham
   * for AED, the cent otherwise. The same arithmetic the server does when a
   * supplier is chosen, so the two agree to the cent.
   */
  function priceAtMargin(line: QuoteLineDraft, percent: string): string | null {
    return rateFromMargin(landedCostOf(line), percent, currency.toUpperCase() === "AED" ? 0 : 2);
  }

  /** Every costed line at one margin: the one number that prices the quote. */
  function repriceCostedLines(percent: string): boolean {
    const repriced = lines.map((candidate) => {
      if (!candidate.cost_rate?.trim() || isZero(candidate.cost_rate)) return candidate;
      const rate = priceAtMargin(candidate, percent);
      return rate === null ? candidate : { ...candidate, rate };
    });
    if (repriced.every((line, i) => line === lines[i])) return false;
    onTargetMarginChange?.(percent);
    onChange(repriced);
    return true;
  }

  // The header's margin cell keeps its raw text while it is being typed, for
  // the same reason a line's does: "2" on the way to "25" must not be
  // reformatted out from under the cursor.
  const [headerTyping, setHeaderTyping] = useState<string | null>(null);
  const costed = lines.some((line) => line.cost_rate?.trim() && !isZero(line.cost_rate));
  // Where a line's landed cost comes from: the quote's landed total over its
  // cost of goods, so the freight, insurance, duty and bank charges are
  // shared out in proportion to what each line cost — the way the costing
  // report shares them.
  const landedNote =
    landedTotal && costTotal && landedUplift && landedUplift !== "1"
      ? `Landed cost ${amount(landedTotal, currency)} ÷ cost of goods ${amount(costTotal, currency)} = ${decimal(landedUplift, { min: 0 })}. Each line carries that share of the freight, insurance, duty and bank charges on the Landed cost tab.`
      : null;
  const withLanded = landedNote !== null;

  function setQuoteMargin(text: string) {
    setHeaderTyping(text);
    const trimmed = text.trim();
    if (trimmed === "" || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) return;
    if (Number(trimmed) >= 100) return;
    repriceCostedLines(trimmed);
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
    // As a percentage: this line alone, on its landed cost — the header's
    // margin box is the one that prices the whole quote. As an amount: added
    // to the cost, as typed.
    const next =
      mode === "percent"
        ? Number(trimmed) < 100
          ? priceAtMargin(line, trimmed)
          : null
        : sumExact([cost, trimmed]);
    if (next !== null) patch(line.key, { rate: next });
  }

  const belowCost = lines.filter(
    (line) => sign(preview?.lines[line.key]?.margin ?? line.margin) < 0,
  ).length;

  return (
    <Panel className="overflow-hidden">
      {/* ── the head: what this is, and the one number that prices it ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <span className="text-[14px] font-semibold">Lines</span>
        <span className="tnum text-[12px] text-ink-4">{lines.length}</span>
        {belowCost > 0 && (
          <Badge tone="danger" title="Priced under what the supplier charges us">
            {belowCost} below cost
          </Badge>
        )}
        {preview && (
          <span className="text-[11.5px] text-accent">Live preview — save to apply</span>
        )}
        <div className="flex-1" />
        {costed && mode === "percent" && (editable || targetMargin?.trim()) && (
          <label
            className="flex items-center gap-1.5 text-[12.5px] text-ink-3"
            title="The gross margin, on every line with a cost: selling price = landed cost ÷ (1 − margin). A line's landed cost is its cost plus its share of freight, insurance, duty and bank charges."
          >
            <span>Margin</span>
            <input
              value={headerTyping ?? targetMargin ?? ""}
              onChange={(e) => setQuoteMargin(e.target.value)}
              onBlur={() => setHeaderTyping(null)}
              disabled={!editable}
              inputMode="decimal"
              placeholder="20"
              aria-label="Margin on every costed line, as a share of the selling price"
              className="tnum w-14 rounded-lg border border-line bg-panel px-2 py-1 text-right text-[13px] font-semibold text-ink outline-none transition focus:border-accent disabled:border-transparent"
            />
            <span>%</span>
          </label>
        )}
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
        <div className="px-4 pb-5">
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
          {/* Ten rows tall at most — the head and ten 44px rows — and the rest
              scroll inside the card, so a forty-line quote is no taller on
              the page than a ten-line one. The head stays put while they do. */}
          <div className="max-h-[478px] overflow-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col />
                <col className="w-14" />
                <col className="w-24" />
                {withLanded && <col className="w-24" />}
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr className="border-y border-line/70 bg-panel-2/70 text-left">
                  <Th>Item</Th>
                  <Th right>Qty</Th>
                  <Th right title="What the supplier charges us, per unit">
                    Cost
                  </Th>
                  {withLanded && (
                    <Th right title={landedNote ?? undefined}>
                      Landed
                    </Th>
                  )}
                  <Th
                    right
                    title={
                      mode === "percent"
                        ? "Share of the selling price kept after the landed cost. Selling price = landed cost ÷ (1 − margin)."
                        : `Per unit, in ${currency}, on top of the cost`
                    }
                  >
                    {mode === "percent" ? "Margin" : `Margin ${currency}`}
                  </Th>
                  <Th right title="What the customer pays, per unit">
                    Price
                  </Th>
                  <Th right>Total</Th>
                  <Th right>
                    <span className="sr-only">More</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <SheetRow
                    key={line.key}
                    line={line}
                    number={index + 1}
                    last={index === lines.length - 1}
                    currency={currency}
                    editable={editable}
                    mode={mode}
                    withLanded={withLanded}
                    dirty={dirtyIds.has(line.key)}
                    preview={preview?.lines[line.key] ?? null}
                    open={expanded === line.key}
                    marginText={marginText(line)}
                    landed={landedCostOf(line)}
                    landedUplift={landedUplift ?? null}
                    landedNote={landedNote}
                    landedParts={landedPartsOf(line)}
                    onMargin={(text) => setMargin(line, text)}
                    onMarginBlur={() => setTyping(null)}
                    onToggle={() => setExpanded(expanded === line.key ? null : line.key)}
                    onPatch={(change) => patch(line.key, change)}
                    onRemove={() => remove(line.key)}
                    onMove={(by) => move(line.key, by)}
                    onComment={onComment ? () => onComment(line) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Totals
            quote={quote}
            currency={currency}
            preview={preview !== null && preview !== undefined}
            costTotal={costTotal ?? null}
            landedTotal={landedTotal ?? null}
            grossProfit={grossProfit ?? null}
            grossMarginPercent={grossMarginPercent ?? null}
          />
        </>
      )}

    </Panel>
  );
}

function Th({
  children,
  right,
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  title?: string;
}) {
  return (
    <th
      className={clsx(
        "micro sticky top-0 z-10 bg-panel-2 px-3 py-2 font-normal text-ink-4 shadow-[inset_0_-1px_0_var(--line)]",
        right && "text-right",
      )}
      title={title}
      scope="col"
    >
      {children}
    </th>
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
              ? "Margin as a share of the selling price"
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

/* ── one row of the sheet ────────────────────────────────────────────── */

function SheetRow({
  line,
  number,
  last,
  currency,
  editable,
  mode,
  withLanded,
  dirty,
  preview,
  open,
  marginText,
  landed,
  landedUplift,
  landedNote,
  landedParts,
  onMargin,
  onMarginBlur,
  onToggle,
  onPatch,
  onRemove,
  onMove,
  onComment,
}: {
  line: QuoteLineDraft;
  number: number;
  last: boolean;
  currency: string;
  editable: boolean;
  mode: MarginMode;
  withLanded: boolean;
  dirty: boolean;
  preview: QuotePreviewLine | null;
  open: boolean;
  marginText: string;
  landed: string;
  landedUplift: string | null;
  landedNote: string | null;
  landedParts: LandedPart[];
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
  const uplifted = !noCost && Boolean(landedUplift?.trim()) && landedUplift!.trim() !== "1";
  const calculated = preview ?? { line_total: line.line_total, margin: line.margin };
  const belowCost = sign(calculated.margin) < 0;
  const meta = [line.brand, line.item_code].filter(Boolean).join(" · ");

  // Two figures that are worked out rather than stored can still be typed
  // into: typing goes back through the same arithmetic to the input it came
  // from. The raw text is kept while the cell is being edited, so "2,9" on
  // the way to "2,900" is not reformatted out from under the cursor.
  const [landedTyping, setLandedTyping] = useState<string | null>(null);
  const [totalTyping, setTotalTyping] = useState<string | null>(null);

  /** Typing the landed cost sets the cost price: cost = landed ÷ (landed ÷ goods). */
  function setLanded(text: string) {
    setLandedTyping(text);
    const typed = text.trim();
    if (typed === "" || typed === "." || !/^\d*\.?\d*$/.test(typed)) return;
    const uplift = landedUplift?.trim() || "1";
    const cost = uplift === "1" ? typed : divideExact(typed, uplift, 4);
    if (cost !== null) onPatch({ cost_rate: cost });
  }

  /** Typing the line total sets the selling price: rate = (total + discount) ÷ qty. */
  function setTotal(text: string) {
    setTotalTyping(text);
    const typed = text.trim();
    if (typed === "" || typed === "." || !/^\d*\.?\d*$/.test(typed)) return;
    const qty = line.quantity.trim() || "1";
    if (isZero(qty)) return;
    const gross = sumExact([typed, line.discount.trim() || "0"]);
    const rate = gross === null ? null : divideExact(gross, qty, 4);
    if (rate !== null) onPatch({ rate });
  }

  const landedShown = noCost ? "" : (roundExact(landed, 2) ?? landed);
  const totalShown =
    calculated.line_total === null
      ? ""
      : (roundExact(calculated.line_total, 2) ?? calculated.line_total);
  const columns = withLanded ? 8 : 7;

  return (
    <>
      <tr
        className={clsx(
          "group h-11 border-b border-line/40 transition hover:bg-panel-2/40",
          open && "bg-panel-2/40",
        )}
      >
        <td className="px-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="tnum w-5 shrink-0 text-[11px] text-ink-4">{number}</span>
            <EditableCell
              value={line.name}
              display={line.name || "Untitled line"}
              editable={editable}
              onChange={(v) => onPatch({ name: v })}
              label="Item — what is being sold"
              placeholder="What is being sold"
              className={clsx("text-ink", !line.name && "text-ink-4")}
            />
            {meta && (
              <span className="hidden shrink-0 truncate text-[11px] text-ink-4 md:inline">
                {meta}
              </span>
            )}
            {!isZero(line.discount) && (
              <span className="shrink-0 text-[11px] text-ink-4">
                −{decimal(line.discount, { min: 0 })}%
              </span>
            )}
          </span>
        </td>
        <td className="px-2">
          <EditableCell
            value={line.quantity}
            display={quantity(line.quantity)}
            editable={editable}
            numeric
            onChange={(v) => onPatch({ quantity: v })}
            label="Quantity"
          />
        </td>
        <td className="px-2">
          <EditableCell
            value={line.cost_rate ?? ""}
            display={noCost ? "—" : cents(line.cost_rate)}
            editable={editable}
            numeric
            muted
            onChange={(v) => onPatch({ cost_rate: v === "" ? null : v })}
            label="Cost price — what the supplier charges us, per unit"
            placeholder="—"
          />
        </td>
        {withLanded && (
          <td className="px-2">
            <EditableCell
              value={landedTyping ?? landedShown}
              display={noCost ? "—" : cents(landed)}
              editable={editable}
              numeric
              muted
              onChange={setLanded}
              onDone={() => setLandedTyping(null)}
              label={
                noCost
                  ? "Landed cost — type it and the cost price is set from it"
                  : `Landed cost per unit: ${cents(line.cost_rate)} supplier price${landedParts
                      .map((part) => ` + ${decimal(part.amount)} ${part.label.toLowerCase()}`)
                      .join("")} = ${decimal(landedShown)}. Typing it sets the cost price to landed ÷ ${decimal(landedUplift ?? "1", { min: 0 })}.`
              }
              placeholder="—"
            />
          </td>
        )}
        <td className="px-2">
          <EditableCell
            value={marginText}
            display={
              noBasis || marginText === ""
                ? "—"
                : mode === "percent"
                  ? `${decimal(marginText, { min: 0 })}%`
                  : decimal(marginText)
            }
            editable={editable && !noBasis}
            numeric
            strong
            onChange={onMargin}
            onDone={onMarginBlur}
            label={
              noBasis
                ? `No cost price on this line, so a percentage has nothing to work from — switch the toggle to ${currency} to set the margin as an amount`
                : mode === "percent"
                  ? "Margin as a share of the selling price — selling price = landed cost ÷ (1 − margin)"
                  : `Margin per unit in ${currency} — sets the selling price`
            }
            placeholder={noBasis ? "—" : mode === "percent" ? "%" : currency}
          />
        </td>
        <td className="px-2">
          <EditableCell
            value={line.rate}
            display={cents(line.rate)}
            editable={editable}
            numeric
            danger={belowCost}
            onChange={(v) => onPatch({ rate: v })}
            label="Selling price — what the customer pays, per unit"
          />
        </td>
        <td className="px-2">
          <EditableCell
            value={totalTyping ?? totalShown}
            display={
              calculated.line_total === null ? "—" : amount(calculated.line_total, currency)
            }
            editable={editable}
            numeric
            strong
            muted={dirty && !preview}
            onChange={setTotal}
            onDone={() => setTotalTyping(null)}
            label={`Line total — quantity × selling price, less the line's discount. Typing it sets the selling price.${
              preview
                ? " Live preview — saved when you press Save changes."
                : dirty
                  ? " Out of date — finish the number to preview it."
                  : ""
            }`}
            placeholder="—"
          />
        </td>
        <td className="px-1 text-right">
          <button
            onClick={onToggle}
            aria-expanded={open}
            title={
              open ? "Hide the rest of this line" : "The rest of this line, and how its price is built"
            }
            className="grid size-7 place-items-center rounded-lg text-ink-4 transition hover:bg-panel-2 hover:text-ink"
          >
            <ChevronDown className={clsx("size-4 transition", open && "rotate-180")} strokeWidth={2} />
          </button>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-line/60 bg-panel-2/40">
          <td colSpan={columns} className="px-4 pb-4 pt-2">
            <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[1fr_minmax(280px,340px)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Description" className="sm:col-span-2">
                  <Textarea
                    value={line.description ?? ""}
                    disabled={!editable}
                    rows={2}
                    onChange={(e) => onPatch({ description: e.target.value || null })}
                    placeholder="Longer detail, as it should read on the quote"
                  />
                </Field>
                <Field label="Item code">
                  <Input
                    value={line.item_code ?? ""}
                    disabled={!editable}
                    className="font-mono"
                    onChange={(e) => onPatch({ item_code: e.target.value || null })}
                  />
                </Field>
                <Field label="Brand">
                  <Input
                    value={line.brand ?? ""}
                    disabled={!editable}
                    onChange={(e) => onPatch({ brand: e.target.value || null })}
                  />
                </Field>
                <Field label="Unit">
                  <Input
                    value={line.unit ?? ""}
                    disabled={!editable}
                    onChange={(e) => onPatch({ unit: e.target.value || null })}
                    placeholder="each, m, kg"
                  />
                </Field>
                <Field label="Discount %">
                  <Input
                    value={line.discount}
                    disabled={!editable}
                    inputMode="decimal"
                    className="tnum text-right"
                    onChange={(e) => onPatch({ discount: e.target.value })}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  {editable && (
                    <>
                      <Button size="sm" icon={ArrowUp} disabled={number === 1} onClick={() => onMove(-1)}>
                        Move up
                      </Button>
                      <Button size="sm" icon={ArrowDown} disabled={last} onClick={() => onMove(1)}>
                        Move down
                      </Button>
                      <Button size="sm" variant="danger" icon={Trash2} onClick={onRemove}>
                        Delete line
                      </Button>
                    </>
                  )}
                  {onComment && (
                    <Button size="sm" icon={MessageSquare} onClick={onComment}>
                      Comment on this line
                    </Button>
                  )}
                  {line.source_supplier_quote_id && (
                    <span className="text-[11px] text-ink-4">Priced from a supplier quote</span>
                  )}
                </div>
              </div>

              {/* ── how the price is built, with this line's numbers ── */}
              <div className="rounded-2xl bg-panel px-4 py-3">
                <span className="micro text-ink-4">How the price is built</span>
                {noCost ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-4">
                    No cost price on this line, so there is no margin to work out. The selling
                    price is whatever is typed.
                  </p>
                ) : (
                  <dl className="tnum mt-2 space-y-1 text-[12px]">
                    <Step label="Supplier price" value={cents(line.cost_rate)} />
                    {uplifted &&
                      landedParts.map((part, i) => (
                        <Step
                          key={`${part.label}-${i}`}
                          label={`+ ${part.label}`}
                          note={part.basis ? `${part.basis}, this line's share` : "this line's share"}
                          value={decimal(part.amount)}
                        />
                      ))}
                    {uplifted && <Step label="= Landed cost" value={decimal(landedShown)} strong />}
                    {mode === "percent" ? (
                      <Step
                        label={`÷ (1 − ${marginText ? decimal(marginText, { min: 0 }) : "…"}% margin)`}
                        note="the margin is a share of the selling price"
                        value=""
                      />
                    ) : (
                      <Step label="+ margin per unit" value={marginText ? decimal(marginText) : "—"} />
                    )}
                    <Step label="= Selling price" value={cents(line.rate)} strong />
                    {calculated.margin !== null && (
                      <div className="flex items-baseline gap-3 border-t border-line/60 pt-1.5 text-[11.5px]">
                        <dt className="text-ink-4">Makes, over {quantity(line.quantity)}</dt>
                        <dd className="ml-auto">
                          <Margin value={calculated.margin} currency={currency} className="text-[11.5px]" />
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {uplifted && landedNote && (
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-4">{landedNote}</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * A cell that is text until it is clicked, and an input only while it is
 * being edited — so a sheet of forty lines is a sheet, not a form. At rest
 * it shows the formatted figure; in edit it shows the raw value, selected, so
 * a click-and-type replaces it. Enter, Tab or clicking away ends the edit.
 * Text with a decimal keypad rather than `type="number"`: a number input
 * round trips its value through a float and will quietly rewrite an exact
 * decimal the server is expecting.
 */
function EditableCell({
  value,
  display,
  editable,
  numeric,
  strong,
  muted,
  danger,
  className,
  label,
  placeholder,
  onChange,
  onDone,
}: {
  value: string;
  display: string;
  editable: boolean;
  numeric?: boolean;
  strong?: boolean;
  muted?: boolean;
  danger?: boolean;
  className?: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const look = clsx(
    "block w-full min-w-0 truncate rounded-md px-2 py-1 text-[13px] text-ink-2",
    numeric ? "tnum text-right" : "text-left",
    strong && "font-medium text-ink",
    muted && "text-ink-3",
    danger && "text-danger",
    className,
  );
  if (!editing) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => setEditing(true)}
        title={label}
        aria-label={label}
        className={clsx(look, editable && "cursor-text transition hover:bg-panel-2")}
      >
        {display}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        setEditing(false);
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
      inputMode={numeric ? "decimal" : undefined}
      aria-label={label}
      placeholder={placeholder}
      className={clsx(look, "border border-accent bg-panel text-ink outline-none")}
    />
  );
}

function Step({
  label,
  note,
  value,
  strong,
}: {
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={clsx("flex items-baseline gap-3", strong && "font-semibold")}>
      <dt className={clsx("min-w-0", strong ? "text-ink" : "text-ink-3")}>
        {label}
        {note && <span className="text-ink-4"> — {note}</span>}
      </dt>
      <dd className="ml-auto shrink-0">{value}</dd>
    </div>
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
  costTotal,
  landedTotal,
  grossProfit,
  grossMarginPercent,
}: {
  quote: {
    sub_total: string;
    total_excl_tax: string;
    tax_total: string;
    total: string;
    discount: string;
    shipping_charge: string;
    adjustment: string;
    /** One rate on the total before tax; the footer names it. */
    tax_name: string | null;
    tax_percentage: string | null;
  };
  currency: string;
  preview: boolean;
  costTotal: string | null;
  landedTotal: string | null;
  grossProfit: string | null;
  grossMarginPercent: string | null;
}) {
  const taxed = !isZero(quote.tax_total);
  const costed = costTotal !== null && !isZero(costTotal);
  // The landed cost is only worth a row of its own when something has been
  // added to the goods; otherwise it is the cost total again.
  const landedDiffers = landedTotal !== null && costTotal !== null && landedTotal !== costTotal;
  const asSaved = preview ? " (as saved)" : "";
  return (
    <div className="grid gap-x-10 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-2">
      {/* ── what it costs us, and what is left ── */}
      <dl className="space-y-0.5 text-[12px]">
        {costed ? (
          <>
            <Row label="Cost of goods" value={amount(costTotal!, currency)} />
            {landedDiffers && (
              <Row label="Landed cost" note="with freight, insurance, duty, bank charges" value={amount(landedTotal!, currency)} />
            )}
            {grossProfit !== null && (
              <Row label={`Gross profit${asSaved}`} note="before tax − landed" value={amount(grossProfit, currency)} />
            )}
            {grossMarginPercent !== null && (
              <Row label={`Gross margin${asSaved}`} note="profit ÷ price" value={`${decimal(grossMarginPercent, { min: 1 })}%`} strong />
            )}
          </>
        ) : (
          <span className="text-ink-4">No cost on these lines, so no margin to show.</span>
        )}
      </dl>

      {/* ── what the customer pays ── */}
      <dl className="space-y-0.5 text-[12px]">
        <Row label="Sub-total" value={amount(quote.sub_total, currency)} />
        {!isZero(quote.discount) && (
          <Row label="Discount" value={`− ${amount(quote.discount, currency)}`} />
        )}
        {!isZero(quote.shipping_charge) && (
          <Row label="Shipping" value={amount(quote.shipping_charge, currency)} />
        )}
        {!isZero(quote.adjustment) && (
          <Row label="Adjustment" value={amount(quote.adjustment, currency)} />
        )}
        {taxed && <Row label="Before tax" value={amount(quote.total_excl_tax, currency)} />}
        {taxed && (
          <Row
            label={`${quote.tax_name || "Tax"}${
              quote.tax_percentage ? ` ${decimal(quote.tax_percentage, { min: 0 })}%` : ""
            }`}
            note="on the total before tax"
            value={amount(quote.tax_total, currency)}
          />
        )}
        <Row label={taxed ? "Total incl. tax" : "Total"} value={amount(quote.total, currency)} strong big />
      </dl>
    </div>
  );
}

function Row({
  label,
  note,
  value,
  strong,
  big,
}: {
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className={clsx("min-w-0 truncate", strong ? "font-semibold text-ink" : "text-ink-3")}>
        {label}
        {note && <span className="text-ink-4"> · {note}</span>}
      </dt>
      <dd className={clsx("tnum ml-auto shrink-0", strong && "font-semibold", big && "text-[15px]")}>
        {value}
      </dd>
    </div>
  );
}
