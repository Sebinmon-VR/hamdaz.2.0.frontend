"use client";

import { useState } from "react";
import { Lock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { amount, date, decimal } from "@/lib/format";
import type { FxQuoteOut } from "@/lib/types";
import type { BidPackOut } from "@/lib/types";
import { blankCostRow, type BidDraft, type CostRow } from "@/components/quotes/bid";
import {
  Band,
  CellInput,
  Fact,
  Facts,
  Grid,
  GridHead,
  GridRow,
  Num,
  Sheet,
  SheetHead,
  Td,
  Th,
  YellowNote,
} from "@/components/quotes/sheet/Sheet";

/**
 * Sheet 3 — the landed-cost build-up.
 *
 * The workbook's shape exactly: the input assumptions at the top, then a
 * numbered run of cost elements from the supplier's door to the customer's,
 * with the CIF subtotal banded across the middle because that is what duty is
 * charged on, and the totals at the foot.
 *
 * Three rows in the build-up are locked, and they are locked for the same
 * reason the workbook's white cells are formulas: the goods come from the
 * quote's own priced lines, and duty and financing are arithmetic on the rows
 * above them. Typing over any of the three is how a build-up and its
 * assumptions come to disagree.
 *
 * The figure in our own currency is locked too on any row quoted in the
 * supplier's, because the rate above decides it. Storing one number twice is
 * exactly the failure this sheet exists to prevent.
 */

const COLUMNS = "44px minmax(0,1.3fr) minmax(0,0.9fr) 120px 130px minmax(0,0.85fr) 34px";

export function LandedCostSheet({
  bid,
  draft,
  rows,
  currency,
  editable,
  onDraftChange,
  onRowsChange,
}: {
  bid: BidPackOut;
  draft: BidDraft;
  rows: CostRow[];
  currency: string;
  editable: boolean;
  onDraftChange: (patch: Partial<BidDraft>) => void;
  onRowsChange: (next: CostRow[]) => void;
}) {
  const { landed } = bid;
  const foreign = draft.supplier_currency.trim();
  const hasRate = Boolean(draft.fx_rate.trim()) && Boolean(foreign);

  // Zoho's rate, into the cell. The estimate will be converted at this exact
  // figure, so costing the bid at it is what makes the two documents agree.
  const [rateNote, setRateNote] = useState<string | null>(null);
  const zohoRate = useAction(async () =>
    api.get<FxQuoteOut>("/quote-requests/fx-rate", { quote: currency, supplier: foreign }),
  );
  async function useZohoRate() {
    const found = await zohoRate.run();
    if (!found) return;
    onDraftChange({ fx_rate: found.rate });
    setRateNote(
      `Zoho Books: 1 ${found.quote_currency} = ${found.rate} ${found.supplier_currency}` +
        (found.effective_date ? `, effective ${date(found.effective_date)}` : "") +
        ". Save to keep it.",
    );
  }

  const set =
    <K extends keyof BidDraft>(key: K) =>
    (value: string) =>
      onDraftChange({ [key]: value } as Partial<BidDraft>);

  function patch(key: string, change: Partial<CostRow>) {
    onRowsChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  // The server returns the build-up in reading order with the derived rows in
  // their proper places. The stored row behind each one is matched by id so the
  // cells that are editable can be edited in place.
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id as string, r]));
  const unsaved = rows.filter((r) => r.id === null);
  const cifIndex = landed.elements.findIndex((e) => e.stage === "destination");

  return (
    <Sheet>
      <SheetHead
        title="Landed cost build-up"
        subtitle={
          <>
            {draft.incoterm_required || "Supplier's terms"} to{" "}
            {draft.incoterm_place || "the delivery point"} · all figures exclusive of tax
          </>
        }
      />

      <Band>Input assumptions</Band>
      <Facts>
        <Fact label="Supplier currency" note="Leave blank when they quoted in ours.">
          <div className="w-20">
            <CellInput
              value={draft.supplier_currency}
              editable={editable}
              onChange={set("supplier_currency")}
              uppercase
              maxLength={3}
              placeholder="GBP"
            />
          </div>
        </Fact>
        <Fact
          label={`1 ${currency} in ${foreign || "…"}`}
          note="As Zoho Books states it — 1 USD = 3.672501 AED. The rate the bid is costed at, and the one the estimate will be converted at."
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <CellInput
                value={draft.fx_rate}
                editable={editable}
                onChange={set("fx_rate")}
                numeric
                placeholder="3.672501"
              />
            </div>
            {editable && foreign.length === 3 && (
              <button
                type="button"
                onClick={useZohoRate}
                disabled={zohoRate.pending}
                className="inline-flex items-center gap-1 rounded-[4px] border border-line px-2 py-1 text-[11.5px] text-ink-2 hover:border-line-strong disabled:opacity-60"
              >
                <RefreshCw className={zohoRate.pending ? "size-3 animate-spin" : "size-3"} />
                Use Zoho&apos;s rate
              </button>
            )}
            {(rateNote || zohoRate.error) && (
              <span className={zohoRate.error ? "text-[11.5px] text-danger" : "text-[11.5px] text-ink-4"}>
                {zohoRate.error ?? rateNote}
              </span>
            )}
          </div>
        </Fact>
        <Fact
          label="Import duty rate"
          note="Charged on the value at arrival — freight and insurance included, not the goods alone."
        >
          <div className="w-24">
            <CellInput
              value={draft.customs_duty_percent}
              editable={editable}
              onChange={set("customs_duty_percent")}
              numeric
              placeholder="5.0"
            />
          </div>
        </Fact>
        <Fact label="Cost of money, a year">
          <div className="w-24">
            <CellInput
              value={draft.financing_rate_percent}
              editable={editable}
              onChange={set("financing_rate_percent")}
              numeric
              placeholder="7.0"
            />
          </div>
        </Fact>
        <Fact
          label="Days our money is out"
          note="From paying the supplier to being paid. Real whenever they want paying before we are."
        >
          <div className="w-24">
            <CellInput
              value={draft.cash_exposure_days}
              editable={editable}
              onChange={set("cash_exposure_days")}
              numeric
              placeholder="150"
            />
          </div>
        </Fact>
        <Fact label="Markup on landed cost" note="What the bid is built at. See the costing sheet.">
          <div className="w-24">
            <CellInput
              value={draft.target_markup_percent}
              editable={editable}
              onChange={set("target_markup_percent")}
              numeric
              placeholder="45"
            />
          </div>
        </Fact>
      </Facts>

      <Band>Cost elements</Band>
      <Grid columns={COLUMNS}>
        <GridHead>
          <Th align="right">#</Th>
          <Th>Cost element</Th>
          <Th>Basis / source</Th>
          <Th align="right">{foreign || "Quoted"}</Th>
          <Th align="right">{currency}</Th>
          <Th>Notes</Th>
          <Th />
        </GridHead>

        {landed.elements.map((element, index) => {
          const row = element.id ? byId.get(element.id) : undefined;
          const own = editable && Boolean(row);
          const derivedBase =
            own &&
            hasRate &&
            Boolean(row?.amount_source.trim()) &&
            row?.source_currency.trim().toUpperCase() !== currency.toUpperCase() &&
            Boolean(row?.source_currency.trim());

          return (
            <div key={element.id ?? `computed-${element.ref}`}>
              {/* The customs border, banded where it actually falls. Everything
                  above it is what duty is charged on, which a plain list of
                  costs does not show. */}
              {index === cifIndex && cifIndex > 0 && (
                <GridRow strong>
                  <Td />
                  <Td className="col-span-2">Value on arrival — the duty base</Td>
                  <Td />
                  <Td align="right">
                    <Num strong>{amount(landed.cif_subtotal, currency)}</Num>
                  </Td>
                  <Td />
                  <Td />
                </GridRow>
              )}

              <GridRow>
                <Td align="right" muted>
                  <Num muted>{element.ref}</Num>
                </Td>
                <Td wrap>
                  {own ? (
                    <CellInput
                      value={row!.label}
                      editable
                      onChange={(v) => patch(row!.key, { label: v })}
                      placeholder="Air freight to Abu Dhabi"
                    />
                  ) : (
                    <span className="flex items-start gap-1.5">
                      {element.computed && (
                        <Lock
                          className="mt-[3px] size-3 shrink-0 text-ink-4"
                          strokeWidth={2}
                        />
                      )}
                      <span className="min-w-0">{element.label}</span>
                    </span>
                  )}
                </Td>
                <Td wrap muted>
                  {own ? (
                    <CellInput
                      value={row!.basis}
                      editable
                      onChange={(v) => patch(row!.key, { basis: v })}
                      placeholder="Our estimate"
                    />
                  ) : (
                    element.basis ?? "—"
                  )}
                </Td>
                <Td align="right">
                  {own ? (
                    <CellInput
                      value={row!.amount_source}
                      editable
                      numeric
                      align="right"
                      onChange={(v) => patch(row!.key, { amount_source: v })}
                      placeholder="0.00"
                    />
                  ) : element.amount_source ? (
                    <Num muted>{decimal(element.amount_source)}</Num>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </Td>
                <Td align="right">
                  {own && !derivedBase ? (
                    <CellInput
                      value={row!.amount_base}
                      editable
                      numeric
                      align="right"
                      onChange={(v) => patch(row!.key, { amount_base: v })}
                      placeholder="0.00"
                    />
                  ) : (
                    <span>
                      <Num muted={element.computed || derivedBase}>
                        {decimal(element.amount_base)}
                      </Num>
                      {derivedBase && (
                        <span className="ml-1 text-[10px] text-ink-4">at rate</span>
                      )}
                    </span>
                  )}
                </Td>
                <Td wrap muted>
                  {own ? (
                    <CellInput
                      value={row!.notes}
                      editable
                      onChange={(v) => patch(row!.key, { notes: v })}
                      placeholder=""
                    />
                  ) : (
                    element.notes ?? ""
                  )}
                </Td>
                <Td align="center">
                  {own && (
                    <button
                      onClick={() => onRowsChange(rows.filter((r) => r.key !== row!.key))}
                      aria-label={`Remove ${row!.label || "this cost"}`}
                      className="grid size-6 place-items-center rounded-[6px] text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3" strokeWidth={1.8} />
                    </button>
                  )}
                </Td>
              </GridRow>
            </div>
          );
        })}

        {/* Rows typed but not yet saved have no element from the server to
            render against, so they are shown here rather than disappearing
            between keystroke and save. */}
        {unsaved.map((row) => (
          <GridRow key={row.key} tone="warn">
            <Td align="right" muted>
              <Num muted>new</Num>
            </Td>
            <Td wrap>
              <CellInput
                value={row.label}
                editable={editable}
                onChange={(v) => patch(row.key, { label: v })}
                placeholder="What the cost is"
              />
            </Td>
            <Td wrap>
              <CellInput
                value={row.basis}
                editable={editable}
                onChange={(v) => patch(row.key, { basis: v })}
                placeholder="Where it came from"
              />
            </Td>
            <Td align="right">
              <CellInput
                value={row.amount_source}
                editable={editable}
                numeric
                align="right"
                onChange={(v) => patch(row.key, { amount_source: v })}
                placeholder="0.00"
              />
            </Td>
            <Td align="right">
              {hasRate && row.amount_source.trim() ? (
                <span className="text-[10.5px] text-ink-4">on save</span>
              ) : (
                <CellInput
                  value={row.amount_base}
                  editable={editable}
                  numeric
                  align="right"
                  onChange={(v) => patch(row.key, { amount_base: v })}
                  placeholder="0.00"
                />
              )}
            </Td>
            <Td wrap>
              <CellInput
                value={row.notes}
                editable={editable}
                onChange={(v) => patch(row.key, { notes: v })}
              />
            </Td>
            <Td align="center">
              <button
                onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))}
                aria-label="Remove this cost"
                className="grid size-6 place-items-center rounded-[6px] text-ink-4 transition hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3" strokeWidth={1.8} />
              </button>
            </Td>
          </GridRow>
        ))}

        <GridRow strong>
          <Td />
          <Td className="col-span-3">Total landed cost, delivered</Td>
          <Td align="right">
            <Num strong>{amount(landed.total, currency)}</Num>
          </Td>
          <Td muted>excl. tax</Td>
          <Td />
        </GridRow>

        {landed.per_unit && (
          <GridRow>
            <Td />
            <Td className="col-span-3" muted>
              Landed cost per unit, over {decimal(landed.quantity ?? "0", { min: 0 })}
            </Td>
            <Td align="right">
              <Num>{amount(landed.per_unit, currency)}</Num>
            </Td>
            <Td />
            <Td />
          </GridRow>
        )}
      </Grid>

      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2">
          <button
            onClick={() => onRowsChange([...rows, blankCostRow("origin", foreign)])}
            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-ink-4 transition hover:bg-panel-2 hover:text-ink"
          >
            <Plus className="size-3" strokeWidth={2} />
            Cost before arrival
          </button>
          <button
            onClick={() => onRowsChange([...rows, blankCostRow("destination", "")])}
            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-ink-4 transition hover:bg-panel-2 hover:text-ink"
          >
            <Plus className="size-3" strokeWidth={2} />
            Cost after arrival
          </button>
          <span className="ml-auto text-[11px] text-ink-4">
            {decimal(landed.firm_percent, { min: 0 })}% of this is committed — the rest is
            our estimate.
          </span>
        </div>
      )}

      {editable && <YellowNote />}
    </Sheet>
  );
}
