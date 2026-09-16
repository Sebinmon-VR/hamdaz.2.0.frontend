"use client";

import { amount, decimal } from "@/lib/format";
import type { BidPackOut, QuoteRequestOut } from "@/lib/types";
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
 * **Markup sensitivity** — the same landed cost at the neighbouring positions,
 * so the person deciding sees what a move is worth rather than asking for each
 * one. Markup and margin are shown side by side because they are not the same
 * number: a 45% markup is a 31% margin, and reading one as the other is how a
 * bid goes in cheaper than anybody intended.
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
}: {
  quote: QuoteRequestOut;
  bid: BidPackOut;
  draft: BidDraft;
  editable: boolean;
  onChange: (patch: Partial<BidDraft>) => void;
}) {
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

        {quote.items.length === 0 ? (
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
            Gross margin, as a share of the sale
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
              ? "Nobody has decided a price — this is the ladder's answer at the markup above."
              : undefined
          }
        >
          <Num strong>{amount(bid.bid_total, currency)}</Num>
        </Fact>
      </Facts>

      {/* ── the ladder ── */}
      <Band>Markup sensitivity</Band>
      <Grid columns={LADDER_COLUMNS}>
        <GridHead>
          <Th align="right">Markup on cost</Th>
          <Th align="right">Unit sell</Th>
          <Th align="right">Total sell</Th>
          <Th align="right">Margin</Th>
          <Th />
        </GridHead>
        {bid.scenarios.map((scenario) => (
          <GridRow key={scenario.markup_percent} tone={scenario.is_target ? "accent" : undefined}>
            <Td align="right">
              <Num strong={scenario.is_target}>
                {decimal(scenario.markup_percent, { min: 0 })}%
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
              <Num muted>{decimal(scenario.margin_percent, { min: 1 })}%</Num>
            </Td>
            <Td muted wrap>
              {scenario.is_target ? "This bid — the markup set on the landed cost sheet." : ""}
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
