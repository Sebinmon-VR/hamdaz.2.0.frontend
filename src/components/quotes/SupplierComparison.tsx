"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Info,
  Trophy,
} from "lucide-react";
import { money, num, percent } from "@/lib/format";
import type { AnalysisGroup, AnalysisSupplier, QuoteComparison } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * The comparison, where the choosing happens.
 *
 * This is deliberately not a page. A comparison that ends in itself leaves the
 * quote with nothing on it — there are no lines to approve until somebody
 * picks a supplier, and picking is what creates them. So every supplier column
 * carries the button that ends the comparison, and the analysis is arranged
 * around that decision rather than around the numbers.
 *
 * The order is the backend's and it is deliberate: whether these totals mean
 * the same thing comes before what they are. A supplier who left three lines
 * out is not cheap, and showing their total first would say otherwise.
 *
 * Money here comes from the comparison analysis, which computes in floats and
 * sends numbers — unlike the quote's own totals, which are exact decimal
 * strings and are never parsed. `money` is right for this payload and wrong
 * for those; see the decimals section of `lib/format`.
 */
export function SupplierComparison({
  comparison,
  currency,
  selectedId,
  hasEdits,
  canChoose,
  onChoose,
  pending,
  error,
}: {
  comparison: QuoteComparison;
  currency: string;
  selectedId: string | null;
  /**
   * Whether the lines currently on the quote were touched by hand. Choosing
   * replaces every one of them, so the warning has to be specific about it.
   */
  hasEdits: boolean;
  canChoose: boolean;
  onChoose: (supplierQuoteId: string, markupPercent: string) => Promise<unknown>;
  pending: boolean;
  error: string | null;
}) {
  const [choosing, setChoosing] = useState<AnalysisSupplier | null>(null);

  const suppliers = comparison.suppliers ?? [];
  const groups = comparison.groups ?? [];
  const insights = comparison.insights ?? [];
  const warnings = insights.filter((i) => i.severity === "warning");
  const cheapestId = comparison.cheapest_supplier?.quote_id ?? null;

  if (suppliers.length === 0) {
    return (
      <Panel className="p-5">
        <PanelHead title="Comparison" />
        <p className="mt-3 text-[13px] text-ink-3">
          Nothing has been read out of the attached files yet.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 pb-1 pt-5">
        <span className="text-[15px] font-semibold">Comparison</span>
        <span className="text-[12px] text-ink-3">
          {num(suppliers.length)} supplier{suppliers.length === 1 ? "" : "s"} ·{" "}
          {num(comparison.item_count)} line{comparison.item_count === 1 ? "" : "s"}
        </span>
        {selectedId && (
          <Badge tone="positive" icon={Check}>
            Priced from{" "}
            {suppliers.find((s) => s.quote_id === selectedId)?.supplier_name ?? "a supplier"}
          </Badge>
        )}
      </div>

      <div className="space-y-3 px-5 pt-4">
        {/* The gaps come before the prices, on purpose. A total that is missing
            lines is not a smaller total, it is a different question. */}
        {!comparison.all_suppliers_complete && (
          <InlineNotice tone="warn">
            Not every supplier quoted every line. A total below can be the lowest only
            because something is missing from it — check the gaps column before choosing.
          </InlineNotice>
        )}
        {warnings.map((insight, i) => (
          <InlineNotice key={`w${i}`} tone="warn">
            {insight.message}
          </InlineNotice>
        ))}
        {insights
          .filter((i) => i.severity === "info")
          .map((insight, i) => (
            <p key={`i${i}`} className="flex items-start gap-2 text-[12.5px] text-ink-3">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-4" strokeWidth={1.8} />
              {insight.message}
            </p>
          ))}
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      </div>

      {/* ── the suppliers, side by side ── */}
      <div className="mt-4 overflow-x-auto px-5 pb-1">
        <div className="flex gap-3 pb-2">
          {suppliers.map((supplier) => (
            <SupplierColumn
              key={supplier.quote_id}
              supplier={supplier}
              currency={currency}
              cheapest={supplier.quote_id === cheapestId}
              selected={supplier.quote_id === selectedId}
              canChoose={canChoose}
              onChoose={() => setChoosing(supplier)}
            />
          ))}
        </div>
      </div>

      {groups.length > 0 && <Groups groups={groups} currency={currency} />}

      <ChooseDialog
        supplier={choosing}
        currency={currency}
        hasEdits={hasEdits}
        replacing={selectedId !== null && choosing?.quote_id !== selectedId}
        lineCount={comparison.item_count}
        pending={pending}
        error={error}
        onClose={() => setChoosing(null)}
        onConfirm={async (markup) => {
          if (!choosing) return;
          const done = await onChoose(choosing.quote_id, markup);
          if (done !== undefined) setChoosing(null);
        }}
      />
    </Panel>
  );
}

/* ── one supplier ────────────────────────────────────────────────────── */

/**
 * A supplier's offer as a column.
 *
 * Everything that qualifies the total sits under it — what they left out,
 * whether their own stated total agrees with their lines, whether we converted
 * their currency to compare it, and anything the reader flagged while
 * extracting. Those are the things that decide whether the number above is
 * comparable with the one in the next column.
 */
function SupplierColumn({
  supplier,
  currency,
  cheapest,
  selected,
  canChoose,
  onChoose,
}: {
  supplier: AnalysisSupplier;
  currency: string;
  cheapest: boolean;
  selected: boolean;
  canChoose: boolean;
  onChoose: () => void;
}) {
  const gaps = supplier.missing_items?.length ?? 0;

  return (
    <div
      className={clsx(
        "flex w-[268px] shrink-0 flex-col rounded-[16px] border p-4",
        selected
          ? "border-positive bg-positive-soft/30"
          : cheapest
            ? "border-second bg-second-soft/25"
            : "border-line bg-panel-2",
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug">
          {supplier.supplier_name}
        </p>
        {selected ? (
          <Check className="size-4 shrink-0 text-positive" strokeWidth={2.4} />
        ) : (
          cheapest && <Trophy className="size-4 shrink-0 text-second-text" strokeWidth={1.8} />
        )}
      </div>

      <p className="fig mt-2 text-[24px] leading-none">{money(supplier.total, currency)}</p>

      <div className="mt-1 flex flex-wrap gap-1.5">
        {selected && <Badge tone="positive">Chosen</Badge>}
        {cheapest && !selected && <Badge tone="second">Cheapest</Badge>}
        {/* Converted from their own currency. Without this the total looks
            native and two columns look directly comparable when they are not. */}
        {supplier.converted && (
          <Badge tone="info" title={`Converted at ${supplier.fx_rate}`}>
            from {supplier.currency} @ {supplier.fx_rate}
          </Badge>
        )}
        {gaps > 0 && <Badge tone="warn">{gaps} line{gaps === 1 ? "" : "s"} missing</Badge>}
        {supplier.total_mismatch !== null && supplier.total_mismatch !== 0 && (
          <Badge
            tone="danger"
            title="Their stated total does not equal the sum of their own lines."
          >
            off by {money(supplier.total_mismatch, currency)}
          </Badge>
        )}
      </div>

      <dl className="mt-3.5 space-y-1.5 border-t border-line pt-3 text-[12px]">
        <Term label="Delivery" value={supplier.delivery_time} />
        <Term label="Payment" value={supplier.payment_terms} />
        <Term label="Valid" value={supplier.validity} />
        <Term label="Warranty" value={supplier.warranty} />
        <Term label="Incoterms" value={supplier.incoterms} />
        <Term label="Lines" value={`${num(supplier.items_quoted)} of ${num(supplier.line_count)}`} />
      </dl>

      {gaps > 0 && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-warn">
          Not quoted: {supplier.missing_items.slice(0, 4).join(", ")}
          {gaps > 4 ? ` and ${gaps - 4} more` : ""}
        </p>
      )}

      {supplier.extraction_note && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-4">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.8} />
          {supplier.extraction_note}
        </p>
      )}

      {canChoose && (
        <Button
          variant={selected ? undefined : "accent"}
          icon={selected ? undefined : ArrowRight}
          className="mt-3.5 w-full justify-center"
          onClick={onChoose}
        >
          {selected ? "Re-price from this one" : "Quote from this supplier"}
        </Button>
      )}
    </div>
  );
}

function Term({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-ink-4">{label}</dt>
      <dd className={clsx("ml-auto text-right", value ? "text-ink-2" : "text-ink-4")}>
        {value || "not stated"}
      </dd>
    </div>
  );
}

/* ── the matched lines ───────────────────────────────────────────────── */

/**
 * The same item across every supplier that quoted it.
 *
 * `spread_pct` is the reason this table is worth reading line by line rather
 * than trusting the totals: a big spread on one line is usually somebody
 * having quoted a different thing, not a bargain.
 */
function Groups({ groups, currency }: { groups: AnalysisGroup[]; currency: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, 12);

  return (
    <div className="mt-5 border-t border-line pt-1">
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-[13px] font-semibold">Line by line</span>
        <span className="text-[11.5px] text-ink-4">
          matched across suppliers · best price highlighted
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel-2">
              <th className="micro px-5 py-2 text-left font-medium text-ink-4">Item</th>
              <th className="micro px-3 py-2 text-right font-medium text-ink-4">Qty</th>
              <th className="micro px-3 py-2 text-left font-medium text-ink-4">Best</th>
              <th className="micro px-3 py-2 text-right font-medium text-ink-4">Unit</th>
              <th className="micro px-3 py-2 text-right font-medium text-ink-4">Line</th>
              <th className="micro px-5 py-2 text-right font-medium text-ink-4">Spread</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((group, i) => (
              <tr key={`${group.label}-${i}`} className="border-b border-line/60 align-top">
                <td className="px-5 py-2.5">
                  <p className="text-[12.5px] font-medium leading-snug">{group.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {/* One supplier quoting a line is not a comparison — there
                        is no second price to be better than. */}
                    {group.single_source && <Badge tone="warn">only one supplier</Badge>}
                    <span className="text-[11px] text-ink-4">
                      quoted by {num(group.quoted_by)} of {num(group.supplier_count)}
                    </span>
                  </div>
                  {group.note && (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-4">{group.note}</p>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-[12px] text-ink-2">
                  {num(group.offers[0]?.quantity ?? null)}
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  {group.best?.supplier_name ?? <span className="text-ink-4">—</span>}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-[12px]">
                  {money(group.best?.unit_price ?? null, currency)}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-[12.5px] font-semibold">
                  {money(group.best?.line_total ?? null, currency)}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {group.spread_pct === null ? (
                    <span className="text-[12px] text-ink-4">—</span>
                  ) : (
                    <span
                      className={clsx(
                        "tnum text-[12px] font-medium",
                        group.spread_pct >= 40
                          ? "text-danger"
                          : group.spread_pct >= 15
                            ? "text-warn"
                            : "text-ink-3",
                      )}
                      title={
                        group.spread_pct >= 40
                          ? "A gap this wide usually means the suppliers quoted different things."
                          : undefined
                      }
                    >
                      {percent(group.spread_pct, 0)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {groups.length > shown.length && (
        <button
          onClick={() => setAll(true)}
          className="w-full border-t border-line py-2.5 text-[12px] font-medium text-ink-3 transition hover:bg-panel-2 hover:text-ink"
        >
          Show the other {groups.length - shown.length} lines
        </button>
      )}
    </div>
  );
}

/* ── choosing ────────────────────────────────────────────────────────── */

/**
 * Picking a supplier, and saying what we add to their price.
 *
 * The markup is asked for here rather than defaulted silently because it is
 * the only number in the flow that is a decision rather than a fact — every
 * rate on the quote comes out of it. It stays a string all the way to the
 * request: typing it into a JS number and back is how a 12.5 becomes a
 * 12.499999999999998.
 */
function ChooseDialog({
  supplier,
  currency,
  hasEdits,
  replacing,
  lineCount,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  supplier: AnalysisSupplier | null;
  currency: string;
  hasEdits: boolean;
  replacing: boolean;
  lineCount: number;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (markupPercent: string) => void;
}) {
  const [markup, setMarkup] = useState("0");
  const [seen, setSeen] = useState<string | null>(null);

  // Normalised to null on both sides before comparing. `supplier?.quote_id` is
  // undefined while the dialog is shut, and undefined !== null is true every
  // time — which made this render-phase reset re-enter forever rather than
  // settling on the first pass.
  const openFor = supplier?.quote_id ?? null;
  if (openFor !== seen) {
    setSeen(openFor);
    setMarkup("0");
  }

  const gaps = supplier?.missing_items?.length ?? 0;
  const valid = /^\d*\.?\d*$/.test(markup.trim()) && markup.trim() !== "";

  return (
    <Modal
      open={Boolean(supplier)}
      onClose={onClose}
      title="Quote from this supplier"
      description={
        supplier
          ? `Every line on this quote is priced from ${supplier.supplier_name}'s offer, plus the markup below.`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={pending}
            disabled={!valid}
            onClick={() => onConfirm(markup.trim())}
          >
            Price it from {supplier?.supplier_name ?? "this supplier"}
          </Button>
        </>
      }
    >
      {supplier && (
        <div className="space-y-4 pb-4">
          {error && <InlineNotice tone="danger">{error}</InlineNotice>}

          {/* Choosing replaces every line. Somebody who has spent an hour
              editing them deserves to be told that before, not after. */}
          {(hasEdits || replacing) && (
            <InlineNotice tone="warn">
              {replacing
                ? `This quote is already priced from another supplier. Choosing ${supplier.supplier_name} throws away all ${lineCount === 1 ? "its line" : `${lineCount} of its lines`} and builds them again from this offer.`
                : "The lines on this quote have been edited by hand. Choosing a supplier replaces every one of them — those edits will be gone."}
            </InlineNotice>
          )}

          {gaps > 0 && (
            <InlineNotice tone="warn">
              {supplier.supplier_name} did not quote {gaps} line{gaps === 1 ? "" : "s"}:{" "}
              {supplier.missing_items.slice(0, 5).join(", ")}
              {gaps > 5 ? ", and more" : ""}. Those lines will have no cost behind them.
            </InlineNotice>
          )}

          <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-2xl bg-panel-2 p-4 text-[12.5px]">
            <span>
              <span className="text-ink-4">Their total</span>{" "}
              <span className="tnum font-semibold">{money(supplier.total, currency)}</span>
            </span>
            <span>
              <span className="text-ink-4">Delivery</span> {supplier.delivery_time ?? "not stated"}
            </span>
            <span>
              <span className="text-ink-4">Payment</span> {supplier.payment_terms ?? "not stated"}
            </span>
          </div>

          <Field
            label="Markup"
            required
            hint="Added to what this supplier charges us, to get what the customer pays. The server does the arithmetic and sends back the priced lines — leave it at 0 to quote at cost and mark the lines up by hand afterwards."
          >
            <div className="relative">
              <Input
                value={markup}
                inputMode="decimal"
                onChange={(e) => setMarkup(e.target.value)}
                className="pr-9"
                aria-label="Markup percent"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-ink-4">
                %
              </span>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
