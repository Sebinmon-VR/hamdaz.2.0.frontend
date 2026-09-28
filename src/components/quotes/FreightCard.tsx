"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Truck } from "lucide-react";
import { amount } from "@/lib/format";
import { TRADE_DIRECTIONS, type QuoteRequestOut } from "@/lib/types";
import { Input, Select } from "@/components/ui/controls";
import { Panel } from "@/components/ui/primitives";
import { COMPACT_FIELD, COMPACT_SELECT } from "@/components/quotes/Documents";
import type { BidDraft } from "@/components/quotes/bid";

/**
 * The freight form: which way the goods travel and what it costs to move them.
 *
 * The automatic path already has an answer to most of this — the freight on
 * the supplier's quotation becomes a cost row, and an offer handed over abroad
 * (EXW, FOB, CIF…) reads as an import and gets duty at the house rate. This
 * card is the manual answer for when that reading is wrong, or the documents
 * said nothing: a figure typed here replaces the automatic one, and a blank
 * box hands it back.
 *
 * It sits under the upload card and shares its column, so the two together
 * are as tall as the lines beside them and no taller. The card keeps its own
 * height; the document list above it is what gives way, scrolling inside its
 * card rather than stretching the row.
 */
export function FreightCard({
  quote,
  draft,
  editable,
  currency,
  onChange,
  className,
}: {
  quote: QuoteRequestOut;
  draft: BidDraft;
  editable: boolean;
  /** The quote's own currency. */
  currency: string;
  onChange: (patch: Partial<BidDraft>) => void;
  className?: string;
}) {
  const set =
    <K extends keyof BidDraft>(key: K) =>
    (value: string) =>
      onChange({ [key]: value } as Partial<BidDraft>);

  // Only the two currencies the bid holds a rate between. Anything else could
  // not be converted honestly, and the server would add nothing for it.
  const supplierCurrency = (quote.supplier_currency ?? "").toUpperCase();
  const currencies = [
    currency,
    ...(supplierCurrency && supplierCurrency !== currency
      ? [supplierCurrency]
      : []),
  ];
  const chargeCurrency = draft.freight_currency || currency;

  const detected = TRADE_DIRECTIONS.find(
    (d) => d.value === quote.trade_direction_detected,
  );
  const autoLabel = detected
    ? `Automatic — ${detected.label.toLowerCase()}`
    : "Automatic";

  // What the build-up currently holds for each, so a blank box says what it
  // is standing back for rather than looking like zero.
  const elements = quote.bid?.landed.elements ?? [];
  const seededFreight = elements.find((e) => e.label.startsWith("Freight"));
  const autoDuty = quote.bid?.landed.customs_duty;

  return (
    <Panel className={clsx("flex shrink-0 flex-col p-5", className)}>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[14px]">
        <Truck className="size-3.5 self-center text-ink-4" strokeWidth={2.1} />
        <span className="font-semibold">Freight</span>
        <span
          className="min-w-0 truncate text-[11.5px] text-ink-4"
          title={quote.trade_direction_reason ?? undefined}
        >
          · import / export and its charges
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <F
          label="Import / export"
          hint={
            (quote.trade_direction_reason ??
              "Nothing on the documents says the goods cross a border.") +
            " Choose one to overrule the reading; duty and insurance follow it."
          }
        >
          <Select
            value={draft.trade_direction}
            disabled={!editable}
            onChange={(e) => set("trade_direction")(e.target.value)}
            className={COMPACT_SELECT}
            aria-label="Import or export"
          >
            <option value="">{autoLabel}</option>
            {TRADE_DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value} title={d.hint}>
                {d.label}
              </option>
            ))}
          </Select>
        </F>

        <F
          label="Currency"
          hint={
            supplierCurrency && supplierCurrency !== currency
              ? `The charges below, in ${currency} or the supplier's ${supplierCurrency} — converted at the bid's rate.`
              : `The charges below, in ${currency}. The supplier's currency appears here once the bid has one.`
          }
        >
          <Select
            value={chargeCurrency}
            disabled={!editable}
            onChange={(e) =>
              set("freight_currency")(
                e.target.value === currency ? "" : e.target.value,
              )
            }
            className={COMPACT_SELECT}
            aria-label="Currency of the freight charges"
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </F>

        <F
          label="Freight charges"
          hint="Replaces the freight from the supplier's quotation. Blank leaves theirs standing."
          suffix={chargeCurrency}
        >
          <Input
            value={draft.freight_charges}
            disabled={!editable}
            inputMode="decimal"
            onChange={(e) => set("freight_charges")(e.target.value)}
            placeholder={
              seededFreight
                ? `Auto ${amount(seededFreight.amount_base, currency)}`
                : "0.00"
            }
            className={clsx(COMPACT_FIELD, "tnum pr-12!")}
          />
        </F>

        <F
          label="Documentation charges"
          hint="Certificates of origin, legalisation, the clearing agent's paperwork."
          suffix={chargeCurrency}
        >
          <Input
            value={draft.documentation_charges}
            disabled={!editable}
            inputMode="decimal"
            onChange={(e) => set("documentation_charges")(e.target.value)}
            placeholder="0.00"
            className={clsx(COMPACT_FIELD, "tnum pr-12!")}
          />
        </F>

        <F
          label="Duty charges"
          hint="The duty as a figure. Replaces the duty rate on the value at arrival. Blank uses the rate."
          suffix={chargeCurrency}
        >
          <Input
            value={draft.duty_charges}
            disabled={!editable}
            inputMode="decimal"
            onChange={(e) => set("duty_charges")(e.target.value)}
            placeholder={
              autoDuty && Number(autoDuty) > 0 && !draft.duty_charges
                ? `Auto ${amount(autoDuty, currency)}`
                : "0.00"
            }
            className={clsx(COMPACT_FIELD, "tnum pr-12!")}
          />
        </F>

        <F
          label="Duty rate"
          hint="Of the value at arrival, freight included. Used only when no duty figure is entered."
          suffix="%"
        >
          <Input
            value={draft.customs_duty_percent}
            disabled={!editable || Boolean(draft.duty_charges.trim())}
            inputMode="decimal"
            onChange={(e) => set("customs_duty_percent")(e.target.value)}
            className={clsx(COMPACT_FIELD, "tnum pr-8!")}
          />
        </F>
      </div>
    </Panel>
  );
}

/** A dense labelled control; the hint is its tooltip, not a line of type. */
function F({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0" title={hint}>
      <span className="mb-0.5 flex h-4 items-center truncate text-[11.5px] text-ink-3">
        {label}
      </span>
      <span className="relative block">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-4">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
