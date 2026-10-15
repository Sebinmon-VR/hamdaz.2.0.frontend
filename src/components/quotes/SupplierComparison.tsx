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

/** Two part numbers that are the same part, however they are spaced or cased. */
function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(a).length > 0 && key(a) === key(b);
}

/** What the line-by-line table already says on every row, so not said twice. */
const LINE_BY_LINE_SAYS = new Set(["incomplete", "single_source", "split_award"]);

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
  lines = [],
  onChooseLines,
  onRemove,
  onEdit,
  pending,
  error,
  linesOnly = false,
  priceLabel = "Price from these choices",
}: {
  comparison: QuoteComparison;
  currency: string;
  selectedId: string | null;
  /**
   * Just the choosing, line by line — for the supplier quotes tab, where the
   * offers are already on screen as cards above it.
   */
  linesOnly?: boolean;
  /** What the button that prices the quote from the choices says. */
  priceLabel?: string;
  /**
   * Whether the lines currently on the quote were touched by hand. Choosing
   * replaces every one of them, so the warning has to be specific about it.
   */
  hasEdits: boolean;
  canChoose: boolean;
  /**
   * The quote's lines as they stand: which offer each was priced from. The
   * table opens on those choices, and every supplier carrying a line shows
   * as in use — a quote is often priced from several.
   */
  lines?: { name: string; item_code: string | null; source_supplier_quote_id: string | null }[];
  /**
   * Prices the quote line by line, each line from the offer row picked for it
   * — the comparison's item ids, in line order. One supplier rarely quotes
   * everything; without this the lines nobody chose were typed in by hand.
   */
  onChooseLines?: (picks: string[], markupPercent: string) => Promise<unknown>;
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
  const [choosingLines, setChoosingLines] = useState(false);

  const suppliers = comparison.suppliers ?? [];
  const groups = comparison.groups ?? [];

  // The row picked for each line, by group index. A line only one supplier
  // quoted has nothing to decide and starts picked; a line several quoted
  // starts empty — which supplier wins it is the user's call, not ours.
  // "" means leave the line out.
  const [picked, setPicked] = useState<Record<number, string>>({});
  // The suppliers the quote's lines are priced from now.
  const inUse = new Map<string, number>();
  for (const line of lines) {
    const source = line.source_supplier_quote_id;
    if (source) inUse.set(source, (inUse.get(source) ?? 0) + 1);
  }
  const pickFor = (index: number): string | undefined => {
    if (index in picked) return picked[index];
    const offers = groups[index]?.offers.filter((o) => o.item_id) ?? [];
    // The row this line is already priced from, when it is on the quote.
    const current = offers.find((o) =>
      lines.some(
        (line) =>
          line.source_supplier_quote_id === o.quote_id &&
          (sameCode(line.item_code, o.part_number) || line.name.trim() === o.description.trim()),
      ),
    );
    if (current) return current.item_id;
    return offers.length === 1 ? offers[0].item_id : undefined;
  };
  // Every line this supplier quoted, picked from them in one go.
  const useForAll = (quoteId: string) =>
    setPicked((p) => {
      const next = { ...p };
      groups.forEach((group, index) => {
        const offer = group.offers.find((o) => o.quote_id === quoteId && o.item_id);
        if (offer?.item_id) next[index] = offer.item_id;
      });
      return next;
    });
  const pickable =
    canChoose && Boolean(onChooseLines) && groups.some((g) => g.offers.some((o) => o.item_id));
  const picks = groups.map((_, i) => pickFor(i));
  const undecided = picks.filter((p) => p === undefined).length;
  const chosenIds = picks.filter((p): p is string => Boolean(p));
  // Only what is worth reading. "Read without AI" says how a file was read,
  // not anything about the offer. And when choosing line by line, the gaps
  // and the one-supplier lines are what the table already shows on every row.
  const insights = (comparison.insights ?? []).filter(
    (i) =>
      !(i.kind === "extraction" && /read without ai/i.test(i.message)) &&
      !(linesOnly && LINE_BY_LINE_SAYS.has(i.kind)),
  );
  // One notice for every line only one supplier quoted, not one per line.
  const singles = insights.filter((i) => i.kind === "single_source").length;
  const warnings = insights.filter((i) => i.severity === "warning" && i.kind !== "single_source");
  const cheapestId = comparison.cheapest_supplier?.quote_id ?? null;

  if (suppliers.length === 0) {
    return (
      <Panel className="p-4">
        <PanelHead title="Comparison" hint="Nothing has been read out of the attached files yet." />
      </Panel>
    );
  }

  const gapsNotice = !comparison.all_suppliers_complete && !linesOnly;
  const hasNotices = gapsNotice || insights.length > 0 || Boolean(error);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 px-4 pt-4">
        <span className="text-[14px] font-semibold">
          {linesOnly ? "Choose a supplier for each line" : "Comparison"}
        </span>
        <span className="text-[12px] text-ink-3">
          {num(suppliers.length)} supplier{suppliers.length === 1 ? "" : "s"} ·{" "}
          {num(comparison.item_count)} line{comparison.item_count === 1 ? "" : "s"}
        </span>
        {inUse.size > 0 && (
          <Badge tone="positive" icon={Check}>
            Priced from{" "}
            {suppliers
              .filter((s) => inUse.has(s.quote_id))
              .map((s) => s.supplier_name)
              .join(", ") || "a supplier"}
          </Badge>
        )}
      </div>

      {hasNotices && (
        <div className="space-y-2 px-4 pt-3">
          {/* The gaps come before the prices, on purpose. A total that is missing
              lines is not a smaller total, it is a different question. */}
          {gapsNotice && (
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
          {singles > 0 && (
            <InlineNotice tone="warn" className={COMPACT_NOTICE}>
              Only one supplier quoted {singles === 1 ? "one line" : `${singles} lines`}, so
              there is no competing price for {singles === 1 ? "it" : "them"}.
            </InlineNotice>
          )}
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
      {!linesOnly && (
        <div className="mt-3 overflow-x-auto px-4">
          <div className="flex gap-2.5 pb-3">
            {suppliers.map((supplier) => (
              <SupplierColumn
                key={supplier.quote_id}
                supplier={supplier}
                currency={currency}
                cheapest={supplier.quote_id === cheapestId}
                inUse={inUse.get(supplier.quote_id) ?? 0}
                onUseForAll={pickable ? () => useForAll(supplier.quote_id) : undefined}
                onRemove={canChoose && onRemove ? () => onRemove(supplier.quote_id) : undefined}
                onEdit={canChoose && onEdit ? () => onEdit(supplier.quote_id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div className={clsx(linesOnly && "mt-3")}>
          <Groups
            groups={groups}
            currency={currency}
            supplierCount={suppliers.length}
            picking={
              pickable
                ? {
                    pickFor,
                    onPick: (index, itemId) => setPicked((p) => ({ ...p, [index]: itemId })),
                    undecided,
                    chosen: chosenIds.length,
                    onPrice: () => setChoosingLines(true),
                    label: priceLabel,
                  }
                : undefined
            }
          />
        </div>
      )}

      <ChooseLinesDialog
        open={choosingLines}
        groups={groups}
        picks={picks}
        hasPriced={selectedId !== null || hasEdits}
        pending={pending}
        error={error}
        onClose={() => setChoosingLines(false)}
        onConfirm={async (markup) => {
          if (!onChooseLines) return;
          const done = await onChooseLines(chosenIds, markup);
          if (done !== undefined) setChoosingLines(false);
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
  inUse,
  onUseForAll,
  onRemove,
  onEdit,
}: {
  supplier: AnalysisSupplier;
  currency: string;
  cheapest: boolean;
  /** How many of the quote's lines are priced from this supplier. */
  inUse: number;
  /** Picks every line this supplier quoted, on the table below. */
  onUseForAll?: () => void;
  onRemove?: () => Promise<unknown>;
  onEdit?: () => void;
}) {
  const gaps = supplier.missing_items?.length ?? 0;
  const selected = inUse > 0;
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
          {selected && (
            <Badge tone="positive">
              In use · {num(inUse)} line{inUse === 1 ? "" : "s"}
            </Badge>
          )}
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

      {/* Choosing is per line, on the table below; this only fills the
          table with every line this supplier quoted. */}
      {onUseForAll && (
        <Button size="sm" className="mt-3 w-full justify-center" onClick={onUseForAll}>
          Pick all their lines below
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
  picking,
}: {
  groups: AnalysisGroup[];
  currency: string;
  supplierCount: number;
  /** Present while the quote can be priced line by line from these offers. */
  picking?: {
    pickFor: (index: number) => string | undefined;
    onPick: (index: number, itemId: string) => void;
    undecided: number;
    chosen: number;
    onPrice: () => void;
    label: string;
  };
}) {
  const [all, setAll] = useState(false);
  // Every line is shown while picking: a choice hidden behind "show more"
  // is a line priced without anybody having looked at it.
  const shown = all || picking ? groups : groups.slice(0, 12);

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
        {picking && (
          <div className="ml-auto flex items-center gap-2.5">
            <span className={clsx("text-[11.5px]", picking.undecided ? "text-warn" : "text-ink-4")}>
              {picking.undecided
                ? `Choose a supplier for ${picking.undecided} more line${picking.undecided === 1 ? "" : "s"}`
                : `${num(picking.chosen)} line${picking.chosen === 1 ? "" : "s"} chosen`}
            </span>
            <Button
              size="sm"
              variant="accent"
              icon={ArrowRight}
              disabled={picking.undecided > 0 || picking.chosen === 0}
              onClick={picking.onPrice}
            >
              {picking.label}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel-2">
              <th className={clsx(head, "pl-4 text-left")}>Item</th>
              <th className={clsx(head, "text-right")}>Qty</th>
              <th className={clsx(head, "text-left")}>{picking ? "Supplier" : "Best"}</th>
              <th className={clsx(head, "text-right")}>Unit</th>
              <th className={clsx(head, "text-right", !showSpread && "pr-4")}>Line</th>
              {showSpread && <th className={clsx(head, "pr-4 text-right")}>Spread</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((group, i) => {
              const short = group.quoted_by < group.supplier_count;
              const pick = picking?.pickFor(i);
              const offer = picking
                ? group.offers.find((o) => o.item_id && o.item_id === pick)
                : undefined;
              const unitPrice = picking ? (offer?.unit_price ?? null) : (group.best?.unit_price ?? null);
              const lineTotal = picking ? (offer?.line_total ?? null) : (group.best?.line_total ?? null);
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
                    {num((offer ?? group.offers[0])?.quantity ?? null)}
                  </td>
                  {picking ? (
                    <td className={clsx(cell, "py-1")}>
                      <div className="relative">
                        <select
                          value={pick ?? "choose"}
                          onChange={(e) => picking.onPick(i, e.target.value)}
                          aria-label={`Supplier for ${group.label}`}
                          className={clsx(
                            "h-7 w-[220px] appearance-none truncate rounded-[8px] border bg-panel pl-2 pr-7 text-[12px] outline-none focus:border-accent",
                            pick === undefined ? "border-warn text-warn" : "border-line text-ink",
                          )}
                        >
                          {pick === undefined && (
                            <option value="choose" disabled>
                              Choose a supplier…
                            </option>
                          )}
                          {group.offers
                            .filter((o) => o.item_id)
                            .map((o) => (
                              <option key={o.item_id} value={o.item_id}>
                                {o.supplier_name} · {money(o.unit_price, currency)}
                                {o.is_best && group.offers.length > 1 ? " · cheapest" : ""}
                              </option>
                            ))}
                          <option value="">Leave this line out</option>
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-ink-3"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      </div>
                    </td>
                  ) : (
                    <td
                      className={clsx(cell, "max-w-[180px] truncate")}
                      title={group.best?.supplier_name}
                    >
                      {group.best?.supplier_name ?? <span className="text-ink-4">—</span>}
                    </td>
                  )}
                  <td className={clsx(cell, "tnum text-right")}>{money(unitPrice, currency)}</td>
                  <td
                    className={clsx(cell, "tnum text-right font-semibold", !showSpread && "pr-4")}
                  >
                    {money(lineTotal, currency)}
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

/* ── choosing line by line ───────────────────────────────────────────── */

/**
 * Pricing the quote from the rows picked on the line-by-line table, several
 * suppliers on one quote. Says which supplier each line comes from before
 * anything is replaced, and asks for the margin, as choosing one supplier does.
 */
function ChooseLinesDialog({
  open,
  groups,
  picks,
  hasPriced,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  groups: AnalysisGroup[];
  picks: (string | undefined)[];
  hasPriced: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (marginPercent: string) => void;
}) {
  const [margin, setMargin] = useState("0");
  const typed = margin.trim();
  const valid = /^\d*\.?\d*$/.test(typed) && typed !== "" && Number(typed) < 100;

  const bySupplier = new Map<string, number>();
  let left = 0;
  groups.forEach((group, i) => {
    const offer = group.offers.find((o) => o.item_id && o.item_id === picks[i]);
    if (!offer) {
      left += 1;
      return;
    }
    bySupplier.set(offer.supplier_name, (bySupplier.get(offer.supplier_name) ?? 0) + 1);
  });
  const lines = [...bySupplier.values()].reduce((a, b) => a + b, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Price from these choices"
      description={`${lines} line${lines === 1 ? "" : "s"}, each priced from the supplier chosen for it, at the margin below.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={pending}
            disabled={!valid || lines === 0}
            onClick={() => onConfirm(typed)}
          >
            Price {lines} line{lines === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        {hasPriced && (
          <InlineNotice tone="warn">
            This replaces every line on the quote with the lines chosen here. Any cost or price
            typed on the current lines will be gone.
          </InlineNotice>
        )}
        <ul className="space-y-1 rounded-2xl bg-panel-2 p-4 text-[12.5px]">
          {[...bySupplier.entries()].map(([name, count]) => (
            <li key={name} className="flex justify-between gap-4">
              <span className="truncate font-medium">{name}</span>
              <span className="tnum text-ink-3">
                {count} line{count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
          {left > 0 && (
            <li className="flex justify-between gap-4 text-ink-4">
              <span>Left out</span>
              <span className="tnum">
                {left} line{left === 1 ? "" : "s"}
              </span>
            </li>
          )}
        </ul>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Each line&apos;s cost is that supplier&apos;s price as written, converted at Zoho&apos;s
          rate when it is in another currency. The terms and costing are filled in from the
          supplier carrying most of the cost; freight the others quoted is added as its own row.
        </p>
        <Field
          label="Margin"
          required
          hint="The share of the selling price we keep: price = cost ÷ (1 − margin), so 20% on 100 is 125."
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
    </Modal>
  );
}

