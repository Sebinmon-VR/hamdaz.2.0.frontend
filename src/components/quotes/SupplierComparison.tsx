"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  Pencil,
  Trash2,
  Trophy,
} from "lucide-react";
import { money, num, percent } from "@/lib/format";
import type { AnalysisGroup, AnalysisSupplier, QuoteComparison } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

// The notice primitive is sized for a page; in this panel it sits beside 30px rows.
const COMPACT_NOTICE = "rounded-[10px]! px-3! py-2! text-[11.5px]! leading-snug!";

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
  onRemove,
  onEdit,
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
  /**
   * Takes one supplier's offer off the comparison, with its document. For the
   * offer that was read wrong, typed wrong, or is simply not wanted. Only
   * offered while the quote is editable.
   */
  onRemove?: (supplierQuoteId: string) => Promise<unknown>;
  /**
   * Opens one supplier's offer to correct it — the name, terms, charges and
   * lines. Only offered while the quote is editable.
   */
  onEdit?: (supplierQuoteId: string) => void;
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
      <Panel className="p-4">
        <PanelHead title="Comparison" hint="Nothing has been read out of the attached files yet." />
      </Panel>
    );
  }

  const hasNotices =
    !comparison.all_suppliers_complete || insights.length > 0 || Boolean(error);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 px-4 pt-4">
        <span className="text-[14px] font-semibold">Comparison</span>
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

      {hasNotices && (
        <div className="space-y-2 px-4 pt-3">
          {/* The gaps come before the prices, on purpose. A total that is missing
              lines is not a smaller total, it is a different question. */}
          {!comparison.all_suppliers_complete && (
            <InlineNotice tone="warn" className={COMPACT_NOTICE}>
              Not every supplier quoted every line. A total below can be the lowest only
              because something is missing from it — check the gaps before choosing.
            </InlineNotice>
          )}
          {warnings.map((insight, i) => (
            <InlineNotice key={`w${i}`} tone="warn" className={COMPACT_NOTICE}>
              {insight.message}
            </InlineNotice>
          ))}
          {insights
            .filter((i) => i.severity === "info")
            .map((insight, i) => (
              <p
                key={`i${i}`}
                className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-3"
              >
                <Info className="mt-0.5 size-3.5 shrink-0 text-ink-4" strokeWidth={1.8} />
                {insight.message}
              </p>
            ))}
          {error && (
            <InlineNotice tone="danger" className={COMPACT_NOTICE}>
              {error}
            </InlineNotice>
          )}
        </div>
      )}

      {/* ── the suppliers, side by side ── */}
      <div className="mt-3 overflow-x-auto px-4">
        <div className="flex gap-2.5 pb-3">
          {suppliers.map((supplier) => (
            <SupplierColumn
              key={supplier.quote_id}
              supplier={supplier}
              currency={currency}
              cheapest={supplier.quote_id === cheapestId}
              selected={supplier.quote_id === selectedId}
              canChoose={canChoose}
              onChoose={() => setChoosing(supplier)}
              onRemove={canChoose && onRemove ? () => onRemove(supplier.quote_id) : undefined}
              onEdit={canChoose && onEdit ? () => onEdit(supplier.quote_id) : undefined}
            />
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <Groups groups={groups} currency={currency} supplierCount={suppliers.length} />
      )}

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
 *
 * Dense on purpose: the facts are one line each, and the reader's note — a
 * paragraph — sits behind a toggle, because on a screen with four columns a
 * paragraph in each is what pushes the buttons out of view.
 */
function SupplierColumn({
  supplier,
  currency,
  cheapest,
  selected,
  canChoose,
  onChoose,
  onRemove,
  onEdit,
}: {
  supplier: AnalysisSupplier;
  currency: string;
  cheapest: boolean;
  selected: boolean;
  canChoose: boolean;
  onChoose: () => void;
  onRemove?: () => Promise<unknown>;
  onEdit?: () => void;
}) {
  const gaps = supplier.missing_items?.length ?? 0;
  // Two clicks to remove: the second says what goes with it.
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const note = supplier.extraction_note;
  const noteLabel =
    note && /^read by a model/i.test(note.trim()) ? "Read by a model" : "Reader's note";
  const offBy = supplier.total_mismatch !== null && supplier.total_mismatch !== 0;
  const hasBadges = selected || cheapest || supplier.converted || gaps > 0 || offBy;

  return (
    <div
      className={clsx(
        "flex w-[240px] shrink-0 flex-col rounded-[14px] border p-3",
        selected
          ? "border-positive bg-positive-soft/30"
          : cheapest
            ? "border-second bg-second-soft/25"
            : "border-line bg-panel-2",
      )}
    >
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight"
          title={supplier.supplier_name}
        >
          {supplier.supplier_name}
        </p>
        {selected ? (
          <Check className="size-3.5 shrink-0 text-positive" strokeWidth={2.4} />
        ) : (
          cheapest && <Trophy className="size-3.5 shrink-0 text-second-text" strokeWidth={1.8} />
        )}
      </div>

      <p className="fig mt-1 text-[20px] leading-none">{money(supplier.total, currency)}</p>

      {hasBadges && (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
          {offBy && (
            <Badge
              tone="danger"
              title="Their stated total does not equal the sum of their own lines."
            >
              off by {money(supplier.total_mismatch, currency)}
            </Badge>
          )}
        </div>
      )}

      <dl className="mt-2.5 space-y-0.5 border-t border-line pt-2 text-[11.5px] leading-[18px]">
        <Term label="Delivery" value={supplier.delivery_time} />
        <Term label="Payment" value={supplier.payment_terms} />
        <Term label="Valid" value={supplier.validity} />
        <Term label="Warranty" value={supplier.warranty} />
        <Term label="Incoterms" value={supplier.incoterms} />
        <Term label="Lines" value={`${num(supplier.items_quoted)} of ${num(supplier.line_count)}`} />
      </dl>

      {gaps > 0 && (
        <p
          className="mt-1.5 truncate text-[11.5px] leading-[18px] text-warn"
          title={`Not quoted: ${supplier.missing_items.join(", ")}`}
        >
          Not quoted: {supplier.missing_items.join(", ")}
        </p>
      )}

      {note && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            aria-expanded={noteOpen}
            title={noteOpen ? undefined : note}
            className="inline-flex items-center gap-1 text-[11.5px] leading-[18px] text-ink-4 transition hover:text-ink-2"
          >
            <AlertTriangle className="size-3 shrink-0" strokeWidth={1.8} />
            {noteLabel} · details
            <ChevronDown className={clsx("size-3 transition", noteOpen && "rotate-180")} />
          </button>
          {noteOpen && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
        </div>
      )}

      {canChoose && (
        <Button
          size="sm"
          variant={selected ? undefined : "accent"}
          icon={selected ? undefined : ArrowRight}
          className="mt-3 w-full justify-center"
          onClick={onChoose}
        >
          {selected ? "Re-price from this one" : "Quote from this supplier"}
        </Button>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="mt-1.5 inline-flex items-center gap-1.5 self-start text-[11.5px] leading-[18px] text-ink-3 transition hover:text-ink"
        >
          <Pencil className="size-3" strokeWidth={1.8} />
          Edit this offer
        </button>
      )}
      {onRemove && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-1.5 inline-flex items-center gap-1.5 self-start text-[11.5px] leading-[18px] text-ink-4 transition hover:text-danger"
        >
          <Trash2 className="size-3" strokeWidth={1.8} />
          Remove this offer
        </button>
      )}
      {onRemove && confirming && (
        <div className="mt-2 rounded-[10px] bg-danger-soft/40 px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
          Remove {supplier.supplier_name}&apos;s offer and its document?
          {selected
            ? " The quote is priced from it: the lines stay, but a supplier has to be chosen again before sending."
            : " Its prices leave the comparison."}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={removing}
              onClick={async () => {
                setRemoving(true);
                try {
                  await onRemove();
                } finally {
                  setRemoving(false);
                  setConfirming(false);
                }
              }}
            >
              Remove
            </Button>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One fact, one line: label muted on the left, value on the right, the rest on hover. */
function Term({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="shrink-0 text-ink-4">{label}</dt>
      <dd
        className={clsx("ml-auto min-w-0 truncate text-right", value ? "text-ink-2" : "text-ink-4")}
        title={value ?? undefined}
      >
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
 *
 * One line per row. The coverage ("2 of 3") sits inline after the name, and
 * only when it varies — when one supplier quoted every line it is said once,
 * in the subtitle, rather than on every row. Spread is hidden with a single
 * supplier, where it is always nought.
 */
function Groups({
  groups,
  currency,
  supplierCount,
}: {
  groups: AnalysisGroup[];
  currency: string;
  supplierCount: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, 12);

  const allSingle = groups.every((group) => group.quoted_by === 1);
  const showSpread = supplierCount > 1;
  const head = "micro whitespace-nowrap px-3 py-1.5 font-medium text-ink-4";
  const cell = "whitespace-nowrap px-3 py-1.5 text-[12px] leading-[20px]";

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
        <span className="text-[13px] font-semibold">Line by line</span>
        <span className="text-[11.5px] text-ink-4">
          {allSingle
            ? supplierCount > 1
              ? "one supplier quoted each line · nothing to compare"
              : "one supplier quoted every line"
            : "matched across suppliers · best price shown"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel-2">
              <th className={clsx(head, "pl-4 text-left")}>Item</th>
              <th className={clsx(head, "text-right")}>Qty</th>
              <th className={clsx(head, "text-left")}>Best</th>
              <th className={clsx(head, "text-right")}>Unit</th>
              <th className={clsx(head, "text-right", !showSpread && "pr-4")}>Line</th>
              {showSpread && <th className={clsx(head, "pr-4 text-right")}>Spread</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((group, i) => {
              const short = group.quoted_by < group.supplier_count;
              return (
                <tr key={`${group.label}-${i}`} className="h-8 border-b border-line/60">
                  <td className={clsx(cell, "w-full max-w-0 pl-4")}>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="min-w-0 truncate font-medium text-ink"
                        title={group.note ? `${group.label} — ${group.note}` : group.label}
                      >
                        {group.label}
                      </span>
                      {/* One supplier quoting a line is not a comparison — there
                          is no second price to be better than. Said inline, and
                          only when it differs from line to line. */}
                      {!allSingle && (
                        <span
                          className={clsx(
                            "tnum shrink-0 text-[11px]",
                            short ? "text-warn" : "text-ink-4",
                          )}
                          title={
                            group.single_source
                              ? `Only one supplier quoted this line (${num(group.quoted_by)} of ${num(group.supplier_count)}).`
                              : `Quoted by ${num(group.quoted_by)} of ${num(group.supplier_count)} suppliers.`
                          }
                        >
                          {num(group.quoted_by)} of {num(group.supplier_count)}
                        </span>
                      )}
                      {group.note && (
                        <button
                          type="button"
                          title={group.note}
                          aria-label={`Note: ${group.note}`}
                          className="shrink-0 text-ink-4 hover:text-ink"
                        >
                        <Info
                          className="size-3 shrink-0"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className={clsx(cell, "tnum text-right text-ink-2")}>
                    {num(group.offers[0]?.quantity ?? null)}
                  </td>
                  <td
                    className={clsx(cell, "max-w-[180px] truncate")}
                    title={group.best?.supplier_name}
                  >
                    {group.best?.supplier_name ?? <span className="text-ink-4">—</span>}
                  </td>
                  <td className={clsx(cell, "tnum text-right")}>
                    {money(group.best?.unit_price ?? null, currency)}
                  </td>
                  <td
                    className={clsx(cell, "tnum text-right font-semibold", !showSpread && "pr-4")}
                  >
                    {money(group.best?.line_total ?? null, currency)}
                  </td>
                  {showSpread && (
                    <td className={clsx(cell, "pr-4 text-right")}>
                      {group.spread_pct === null ? (
                        <span className="text-ink-4">—</span>
                      ) : (
                        <span
                          className={clsx(
                            "tnum font-medium",
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
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {groups.length > shown.length && (
        <button
          onClick={() => setAll(true)}
          className="w-full border-t border-line py-1.5 text-[12px] font-medium text-ink-3 transition hover:bg-panel-2 hover:text-ink"
        >
          Show the other {groups.length - shown.length} lines
        </button>
      )}
    </div>
  );
}

/* ── choosing ────────────────────────────────────────────────────────── */

/**
 * Picking a supplier, and saying what margin the quote keeps.
 *
 * The margin is asked for here rather than defaulted silently because it is
 * the only number in the flow that is a decision rather than a fact — every
 * rate on the quote comes out of it: their price ÷ (1 − margin). It stays a
 * string all the way to the request: typing it into a JS number and back is
 * how a 12.5 becomes a 12.499999999999998. The wire field is still called
 * `markup_percent`; the number in it is a margin, a share of the price.
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
  onConfirm: (marginPercent: string) => void;
}) {
  const [margin, setMargin] = useState("0");
  const [seen, setSeen] = useState<string | null>(null);

  // Normalised to null on both sides before comparing. `supplier?.quote_id` is
  // undefined while the dialog is shut, and undefined !== null is true every
  // time — which made this render-phase reset re-enter forever rather than
  // settling on the first pass.
  const openFor = supplier?.quote_id ?? null;
  if (openFor !== seen) {
    setSeen(openFor);
    setMargin("0");
  }

  const gaps = supplier?.missing_items?.length ?? 0;
  // A number under 100: a margin is a share of the price, and a price that is
  // all margin has no cost in it.
  const typed = margin.trim();
  const valid = /^\d*\.?\d*$/.test(typed) && typed !== "" && Number(typed) < 100;

  return (
    <Modal
      open={Boolean(supplier)}
      onClose={onClose}
      title="Quote from this supplier"
      description={
        supplier
          ? `Every line on this quote is priced from ${supplier.supplier_name}'s offer, at the margin below.`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={pending}
            disabled={!valid}
            onClick={() => onConfirm(typed)}
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

          {supplier.currency && supplier.currency.toUpperCase() !== currency.toUpperCase() && (
            <InlineNotice tone="info">
              {supplier.supplier_name} quoted in {supplier.currency}, so the quote switches to{" "}
              {supplier.currency}: the lines are priced in it exactly as written, and anything
              already on the quote — freight, discount, shipping — is restated at Zoho&apos;s
              rate.
            </InlineNotice>
          )}

          <p className="text-[12px] leading-relaxed text-ink-3">
            Choosing also fills the costing in from what is known: the freight this
            supplier quoted, VAT on every line, and on an import the house duty and
            insurance rates. Each lands on the landed cost sheet labelled as what it is,
            to edit or remove.
          </p>

          <Field
            label="Margin"
            required
            hint="The share of the selling price we keep: what the customer pays is this supplier's price ÷ (1 − margin), so 20% on 100 is 125. The server does the arithmetic and sends back the priced lines — leave it at 0 to quote at cost and set the margin line by line afterwards."
          >
            <div className="relative">
              <Input
                value={margin}
                inputMode="decimal"
                onChange={(e) => setMargin(e.target.value)}
                className="pr-9"
                aria-label="Margin percent"
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
