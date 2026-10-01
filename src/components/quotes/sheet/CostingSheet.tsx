"use client";

import { amount, decimal, divideExact, multiplyExact, roundExact, subExact } from "@/lib/format";
import type { BidPackOut, QuoteLineDraft, QuoteRequestOut } from "@/lib/types";
import type { BidDraft } from "@/components/quotes/bid";
import {
  Band,
  CellCheck,
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
 * Sheet 4 — the costing sheet.
 *
 * What we are selling, at what, and what that leaves. Then the two blocks that
 * make this sheet worth having at all:
 *
 * **Margin sensitivity** — the same landed cost at the neighbouring margins,
 * so the person deciding sees what a move is worth rather than asking for each
 * one. Each rung is priced as the lines are, cost ÷ (1 − margin), and the
 * markup on cost it amounts to is shown beside it because a buyer who sees the
 * supplier's price sees that number: a 45% margin is an 82% markup.
 *
 * **Price-disclosure exposure** — what the buyer will make of our price once
 * they can see the supplier's, which on these tenders they very often can.
 * Most of the apparent uplift is freight, duty and the cost of paying a
 * supplier months before anybody pays us. That has to be anticipated here and
 * answered with a breakdown, because the alternative is answering it live in a
 * clarification with the clock running.
 */

const LINE_COLUMNS = "72px minmax(0,1fr) 64px 76px 116px 116px 130px";
const LADDER_COLUMNS = "110px 130px 140px 110px minmax(0,1fr)";

export function CostingSheet({
  quote,
  bid,
  draft,
  editable,
  onChange,
  lines,
  onLinesChange,
}: {
  quote: QuoteRequestOut;
  bid: BidPackOut;
  draft: BidDraft;
  editable: boolean;
  onChange: (patch: Partial<BidDraft>) => void;
  /** The quote's lines as being edited — the same drafts the quote tab edits,
      so a change here and a change there are one change, saved together. */
  lines?: QuoteLineDraft[];
  onLinesChange?: (next: QuoteLineDraft[]) => void;
}) {
  const editLines = editable && lines !== undefined && onLinesChange !== undefined;
  const patchLine = (key: string, change: Partial<QuoteLineDraft>) =>
    onLinesChange?.((lines ?? []).map((l) => (l.key === key ? { ...l, ...change } : l)));
  const currency = quote.currency;
  const { landed } = bid;

  const set =
    <K extends keyof BidDraft>(key: K) =>
    (value: string) =>
      onChange({ [key]: value } as Partial<BidDraft>);

  return (
    <Sheet>
      <SheetHead
        title="Costing sheet"
        subtitle={
          <>
            {draft.line_item_ref || quote.title} · all figures in {currency}, exclusive of
            tax
          </>
        }
      />

      {/* ── what is being sold ── */}
      <Grid columns={LINE_COLUMNS}>
        <GridHead>
          <Th>Line</Th>
          <Th>Description</Th>
          <Th>UoM</Th>
          <Th align="right">Qty</Th>
          <Th align="right">Unit cost</Th>
          <Th align="right">Unit sell</Th>
          <Th align="right">Total sell</Th>
        </GridHead>

        {editLines && (lines ?? []).length > 0 ? (
          (lines ?? []).map((line, index) => (
            <GridRow key={line.key}>
              <Td muted>
                <Num muted>{draft.line_item_ref || index + 1}</Num>
              </Td>
              <Td wrap>
                <CellInput value={line.name} editable onChange={(v) => patchLine(line.key, { name: v })} />
              </Td>
              <Td>
                <CellInput value={line.unit ?? ""} editable onChange={(v) => patchLine(line.key, { unit: v || null })} />
              </Td>
              <Td align="right">
                <CellInput value={line.quantity} editable numeric align="right" onChange={(v) => patchLine(line.key, { quantity: v })} />
              </Td>
              <Td align="right">
                <CellInput value={line.cost_rate ?? ""} editable numeric align="right" onChange={(v) => patchLine(line.key, { cost_rate: v || null })} placeholder="—" />
              </Td>
              <Td align="right">
                <CellInput value={line.rate} editable numeric align="right" onChange={(v) => patchLine(line.key, { rate: v })} />
              </Td>
              <Td align="right">
                <Num strong>{lineTotal(line)}</Num>
              </Td>
            </GridRow>
          ))
        ) : quote.items.length === 0 ? (
          <GridRow>
            <Td />
            <Td muted wrap>
              Nothing priced yet. Choose a supplier on the quote tab and the lines arrive
              with their costs.
            </Td>
            <Td />
            <Td />
            <Td />
            <Td />
            <Td />
          </GridRow>
        ) : (
          quote.items.map((item, index) => (
            <GridRow key={item.id}>
              <Td muted>
                <Num muted>{draft.line_item_ref || index + 1}</Num>
              </Td>
              <Td wrap>{item.name}</Td>
              <Td muted>{item.unit ?? "—"}</Td>
              <Td align="right">
                <Num>{decimal(item.quantity, { min: 0 })}</Num>
              </Td>
              <Td align="right">
                <Num muted>{item.cost_rate ? decimal(item.cost_rate) : "—"}</Num>
              </Td>
              <Td align="right">
                <Num>{decimal(item.rate)}</Num>
              </Td>
              <Td align="right">
                <Num strong>{decimal(item.line_total)}</Num>
              </Td>
            </GridRow>
          ))
        )}

        <GridRow strong>
          <Td />
          <Td className="col-span-5">Total landed cost</Td>
          <Td align="right">
            <Num strong>{decimal(landed.total)}</Num>
          </Td>
        </GridRow>
        <GridRow>
          <Td />
          <Td className="col-span-5" muted>
            Gross margin
          </Td>
          <Td align="right">
            <Num>{decimal(bid.gross_margin)}</Num>
          </Td>
        </GridRow>
        <GridRow>
          <Td />
          <Td className="col-span-5" muted>
            Gross margin, on the landed cost, before tax
          </Td>
          <Td align="right">
            <Num>
              {bid.gross_margin_percent
                ? `${decimal(bid.gross_margin_percent, { min: 1 })}%`
                : "—"}
            </Num>
          </Td>
        </GridRow>
      </Grid>

      {/* ── the price going in ── */}
      <Band>Recommended submission price</Band>
      <Facts>
        <Fact
          label="Unit price to enter"
          strong
          note="The rounded figure somebody decided on. Leave it blank and the ladder below answers instead."
        >
          <div className="w-40">
            <CellInput
              value={draft.submission_unit_price}
              editable={editable}
              onChange={set("submission_unit_price")}
              numeric
              placeholder={
                bid.target?.unit_sell ? decimal(bid.target.unit_sell) : "0.00"
              }
            />
          </div>
        </Fact>
        <Fact
          label="Or the whole bid"
          note="For a bid priced as a package rather than per unit. This one wins."
        >
          <div className="w-40">
            <CellInput
              value={draft.submission_total}
              editable={editable}
              onChange={set("submission_total")}
              numeric
              placeholder={decimal(bid.bid_total)}
            />
          </div>
        </Fact>
        <Fact
          label="Total bid value"
          strong
          note={
            bid.bid_total_is_suggested
              ? "Nobody has decided a price — this is the ladder's answer at the margin above."
              : undefined
          }
        >
          <Num strong>{amount(bid.bid_total, currency)}</Num>
        </Fact>
      </Facts>

      {/* ── the ladder ── */}
      <Band>Margin sensitivity</Band>
      <Grid columns={LADDER_COLUMNS}>
        <GridHead>
          <Th align="right">Margin</Th>
          <Th align="right">Unit sell</Th>
          <Th align="right">Total sell</Th>
          <Th align="right">Markup on cost</Th>
          <Th />
        </GridHead>
        {bid.scenarios.map((scenario) => (
          <GridRow key={scenario.margin_percent} tone={scenario.is_target ? "accent" : undefined}>
            <Td align="right">
              <Num strong={scenario.is_target}>
                {decimal(scenario.margin_percent, { min: 0 })}%
              </Num>
            </Td>
            <Td align="right">
              <Num muted={!scenario.is_target}>
                {scenario.unit_sell ? decimal(scenario.unit_sell) : "—"}
              </Num>
            </Td>
            <Td align="right">
              <Num strong={scenario.is_target}>{decimal(scenario.total_sell)}</Num>
            </Td>
            <Td align="right">
              <Num muted>{decimal(scenario.markup_percent, { min: 1 })}%</Num>
            </Td>
            <Td muted wrap>
              {scenario.is_target ? "This bid — the margin set on the landed cost sheet." : ""}
            </Td>
          </GridRow>
        ))}
      </Grid>

      {/* ── what the buyer sees ── */}
      <Band tone={bid.disclosure.disclosed ? "danger" : undefined}>
        Price-disclosure exposure
      </Band>
      <Facts>
        <Fact
          label="Supplier's quotation attached"
          note="Turn this on when the RFP makes the principal's own quotation a mandatory attachment."
        >
          <label className="flex items-center gap-2 text-[12.5px]">
            <CellCheck
              checked={draft.discloses_principal_price}
              editable={editable}
              onChange={(next) => onChange({ discloses_principal_price: next })}
              label="The RFP requires the supplier's quotation to be attached"
            />
            <span className={draft.discloses_principal_price ? "text-ink" : "text-ink-3"}>
              {draft.discloses_principal_price
                ? "Yes — the buyer will see what we paid"
                : "No"}
            </span>
          </label>
        </Fact>

        {bid.disclosure.disclosed && (
          <>
            <Fact label="What they paid, visible to the buyer">
              <Num>{amount(bid.disclosure.principal_value, currency)}</Num>
            </Fact>
            <Fact label="What we are bidding">
              <Num>{amount(bid.disclosure.bid_value, currency)}</Num>
            </Fact>
            <Fact
              label="Apparent uplift"
              tone="danger"
              note="What the difference looks like before anything explains it."
            >
              <Num strong>
                {bid.disclosure.apparent_uplift_percent
                  ? `${decimal(bid.disclosure.apparent_uplift_percent, { min: 0 })}%`
                  : "—"}
              </Num>
            </Fact>
            <Fact
              label="Of which recoverable cost"
              note="Freight, duty, documentation, clearance and financing — not margin."
            >
              <Num>{amount(bid.disclosure.recoverable_cost, currency)}</Num>
            </Fact>
            <Fact label="True margin retained" strong>
              <Num strong>
                {bid.disclosure.true_margin_percent
                  ? `${decimal(bid.disclosure.true_margin_percent, { min: 1 })}%`
                  : "—"}
              </Num>
            </Fact>
            <Fact label="What to do about it">
              <span className="block py-1 text-[12px] leading-relaxed text-ink-2">
                Submit the landed-cost build-up as the price breakdown, so the uplift reads
                as cost recovery rather than margin. Cleaner still: ask the supplier to
                re-quote on delivered terms, so the freight and duty sit inside their price
                and never surface as ours.
              </span>
            </Fact>
          </>
        )}
      </Facts>

      {editable && <YellowNote />}
    </Sheet>
  );
}

/** A line being edited: quantity × rate, less its discount, exactly. */
function lineTotal(line: QuoteLineDraft): string {
  const gross = multiplyExact(line.quantity.trim() || "0", line.rate.trim() || "0");
  if (gross === null) return "—";
  const off = line.discount.trim() && line.discount.trim() !== "0"
    ? divideExact(multiplyExact(gross, line.discount.trim()) ?? "0", "100", 6)
    : "0";
  const net = off === null ? null : subExact(gross, off);
  return net === null ? "—" : decimal(roundExact(net, 2));
}
