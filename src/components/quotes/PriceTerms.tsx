import clsx from "clsx";

import { amount, decimal } from "@/lib/format";
import type { BidPackOut } from "@/lib/types";

/**
 * The four terms behind every price, with this quote's own figures in them,
 * as one strip: cost, selling price, gross profit, gross margin, each with
 * its formula under its name.
 *
 * Cost is the landed cost — everything it takes to deliver, not just what
 * the supplier charges. Selling price is the total before VAT. Gross profit
 * is what is left once the cost is recovered, and gross margin is that as a
 * share of the selling price. The lines are priced on the landed cost, so
 * the margin typed in the Lines header is this margin, to the rounding of a
 * cent a line — unless the landed cost has moved since, which the strip
 * says underneath.
 *
 * Every figure is the server's. Nothing is calculated here.
 */
export function PriceTerms({
  bid,
  sellingPrice,
  totalInclTax,
  taxLabel,
  targetMargin,
  currency,
  className,
}: {
  bid: BidPackOut;
  /** The total before tax, as the server sent it. */
  sellingPrice: string;
  /** The total the customer pays, with the tax on it. */
  totalInclTax: string;
  /** "VAT 5%", or whatever the quote carries. */
  taxLabel: string;
  /** The margin the lines were priced at, when one is set. */
  targetMargin: string | null;
  currency: string;
  className?: string;
}) {
  const margin = bid.gross_margin_percent
    ? `${decimal(bid.gross_margin_percent, { min: 1 })}%`
    : "—";
  // Priced at one margin, keeping another: the landed cost moved after the
  // lines were priced (a freight row edited, duty changed). Half a point is
  // rounding — ten lines each rounded to a cent — and anything more is not.
  const drifted =
    targetMargin?.trim() &&
    bid.gross_margin_percent &&
    Math.abs(Number(bid.gross_margin_percent) - Number(targetMargin)) > 0.5;
  return (
    <div className={clsx("rounded-2xl bg-panel", className)}>
      <div className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Term
          name="Cost"
          symbol="C"
          formula="C = total landed cost"
          figure={amount(bid.landed.total, currency)}
          note="Everything it takes to deliver: the supplier's price, freight, insurance, duty, bank charges. The build-up is on the Landed cost tab."
        />
        <Term
          name="Selling price"
          symbol="SP"
          formula="SP = C ÷ (1 − M%)"
          figure={amount(sellingPrice, currency)}
          note={`The price quoted to the customer, before VAT. With ${taxLabel}: ${amount(totalInclTax, currency)}.`}
        />
        <Term
          name="Gross profit"
          symbol="GP"
          formula="GP = SP − C"
          figure={amount(bid.gross_margin, currency)}
          note="What remains once the full cost has been recovered."
        />
        <Term
          name="Gross margin"
          symbol="M%"
          formula="M% = GP ÷ SP"
          figure={margin}
          note="Gross profit as a share of the selling price — the margin typed in the Lines header."
          warn={Boolean(drifted)}
        />
      </div>
      {drifted && (
        <p className="border-t border-line px-4 py-1.5 text-[11.5px] text-warn">
          The lines were priced at {decimal(targetMargin!, { min: 0 })}% but the landed cost has
          changed since. Type the margin again in the Lines header to re-price.
        </p>
      )}
    </div>
  );
}

function Term({
  name,
  symbol,
  formula,
  figure,
  note,
  warn,
}: {
  name: string;
  symbol: string;
  formula: string;
  figure: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3" title={note}>
      <span className="block text-[12px] font-medium text-ink-2">
        {name} <span className="text-ink-4">({symbol})</span>
      </span>
      <span className={clsx("fig tnum mt-1 block text-[19px] leading-none", warn && "text-warn")}>
        {figure}
      </span>
      <span className="mt-1.5 block truncate text-[11.5px] text-ink-4">{formula}</span>
    </div>
  );
}
