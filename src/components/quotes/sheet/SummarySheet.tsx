"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { CURRENCIES, amount, date, decimal } from "@/lib/format";
import type { BidPackOut, QuoteIn, QuoteRequestOut, SupplierQuoteRow } from "@/lib/types";
import { quoteInOf } from "@/components/quotes/SupplierQuoteEditor";
import { SEVERITY } from "@/components/quotes/bid";
import type { BidDraft } from "@/components/quotes/bid";
import {
  Band,
  CellInput,
  CellSelect,
  CellText,
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
 * Sheet 1 — the bid summary.
 *
 * The workbook's front page, and the only one most people read: what the
 * enquiry is, what we are recommending, and what has to be cleared before it
 * can go. Three banded sections, in that order, because that is the order the
 * question gets asked in.
 *
 * The red flags at the bottom are not typed here. They are the compliance rows
 * marked urgent, ordered worst-first by the server — the same single list the
 * matrix holds, read from the other end. Two lists of the same problems
 * disagree within a week, and then "have the red flags been cleared" has two
 * answers.
 */

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const MODES = ["Air", "Sea", "Road", "Rail", "Courier"];

export function SummarySheet({
  quote,
  bid,
  draft,
  editable,
  onChange,
  currency,
  currencyEditable,
  onCurrency,
  onOpenCompliance,
  onEditOffer,
  offer,
  onSaveOffer,
}: {
  quote: QuoteRequestOut;
  bid: BidPackOut | null | undefined;
  draft: BidDraft;
  editable: boolean;
  onChange: (patch: Partial<BidDraft>) => void;
  /** The quote's currency. Not part of the bid draft: it belongs to the quote
      itself, and the estimate form edits the same value. */
  currency: string;
  /** Its own permission: the sheet freezes when the quote goes up, this cell
      does not. Nothing here converts, so the code is a label, not a term. */
  currencyEditable: boolean;
  onCurrency: (value: string) => void;
  onOpenCompliance: () => void;
  /** Opens the chosen supplier's offer to correct it. The three offer rows
      are read from that offer, so that is where they are changed. */
  onEditOffer?: () => void;
  /** The chosen supplier's offer as stored, and how to save a change to it. */
  offer?: SupplierQuoteRow | null;
  onSaveOffer?: (body: QuoteIn) => Promise<unknown>;
}) {
  const offerEditable = editable && Boolean(offer && onSaveOffer);
  const set =
    <K extends keyof BidDraft>(key: K) =>
    (value: string) =>
      onChange({ [key]: value } as Partial<BidDraft>);

  const cell = (key: keyof BidDraft, extra: Record<string, unknown> = {}) => ({
    value: String(draft[key] ?? ""),
    editable,
    onChange: set(key) as (value: string) => void,
    ...extra,
  });

  const quantity = bid?.landed.quantity;
  const supplier = supplierOf(quote);
  const flags = bid?.red_flags ?? [];

  return (
    <Sheet>
      <SheetHead
        title="Bid summary — compliance & costing"
        subtitle={
          <>
            {draft.rfp_number || "No event number"}
            {draft.line_item_ref ? ` · ${draft.line_item_ref}` : ""}
            {quote.revision > 1 ? ` · Pass ${quote.revision}` : ""}
            {quote.cf_bcd ? ` · closes ${date(quote.cf_bcd)}` : ""}
          </>
        }
      />

      {/* ── 1 ── */}
      <Band>1. Event particulars</Band>
      <Facts>
        <Fact label="Event / RFP no.">
          <CellInput {...cell("rfp_number")} placeholder="RFP 6000149233" />
        </Fact>
        <Fact label="Buying entity">
          <CellInput {...cell("buying_entity")} placeholder="Who is actually buying" />
        </Fact>
        <Fact label="Line item">
          <CellInput {...cell("line_item_ref")} placeholder="3.13.5 — CLOTH" />
        </Fact>
        <Fact label="Our bid reference">
          <CellInput {...cell("bid_reference")} />
        </Fact>
        <Fact label="Bid validity (days)">
          <div className="w-28">
            <CellInput {...cell("bid_validity_days")} placeholder="90" />
          </div>
        </Fact>
        <Fact
          label="Quantity"
          note={quantity ? undefined : bid?.landed.per_unit_note ?? undefined}
        >
          <Num muted={!quantity}>
            {quantity
              ? `${decimal(quantity, { min: 0 })} ${unitOf(quote)}`
              : `${quote.items.length} lines`}
          </Num>
        </Fact>
        <Fact label="Class / manufacturer no.">
          <CellInput {...cell("manufacturer_class_no")} />
        </Fact>
        <Fact label="Manufacturer">
          <CellInput {...cell("manufacturer_name")} />
        </Fact>
        <Fact label="Manufacturer part no.">
          <CellInput {...cell("manufacturer_part_number")} />
        </Fact>
        <Fact
          label="Incoterm required"
          note="The term the RFP demands. The gap between it and the supplier's own is the freight, duty and documentation."
        >
          <div className="flex w-full min-w-0 items-center gap-2">
            <div className="w-28 shrink-0">
              <CellSelect
                value={draft.incoterm_required}
                editable={editable}
                onChange={set("incoterm_required")}
                options={INCOTERMS.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <CellInput {...cell("incoterm_place")} placeholder="Named place" />
            </div>
          </div>
        </Fact>
        <Fact
          label="Ship to, as stated"
          note={
            conflicting(draft)
              ? "Conflicts with the Incoterm location above. Raise a clarification — it is a real cost difference."
              : undefined
          }
          tone={conflicting(draft) ? "danger" : undefined}
        >
          <CellInput {...cell("ship_to")} />
        </Fact>
        <Fact
          label="Requested delivery date"
          note={
            elapsed(draft.requested_delivery_date)
              ? "Already elapsed. Declare the realistic lead time as a deviation."
              : undefined
          }
          tone={elapsed(draft.requested_delivery_date) ? "danger" : undefined}
        >
          <div className="w-44">
            <CellInput
              {...cell("requested_delivery_date")}
              type="date"
              display={date(draft.requested_delivery_date)}
            />
          </div>
        </Fact>
        {/* The currency the whole bid is stated in — every figure on every
            sheet, and the one the customer sees. Switching it converts them
            all at Zoho's rate and saves at once. */}
        <Fact label="Bid currency" note="Switching converts every figure at Zoho Books' rate, to the cent.">
          <div className="w-28">
            <CellSelect
              value={currency}
              editable={currencyEditable}
              onChange={onCurrency}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
              required
            />
          </div>
        </Fact>
        <Fact
          label="Offer in hand"
          note={
            offerEditable
              ? "The supplier this quote is priced from. Saved to their offer as you leave each box."
              : "The supplier this quote is priced from."
          }
        >
          {supplier && offerEditable && offer ? (
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1">
                <OfferCell
                  value={offer.supplier_name}
                  placeholder="Supplier name"
                  onSave={(v) => onSaveOffer!(quoteInOf(offer, { supplier_name: v }))}
                  required
                />
              </span>
              <span className="min-w-0 flex-1">
                <OfferCell
                  value={offer.payment_terms ?? ""}
                  placeholder="Payment terms"
                  onSave={(v) => onSaveOffer!(quoteInOf(offer, { payment_terms: v || null }))}
                />
              </span>
              {onEditOffer && (
                <button
                  type="button"
                  onClick={onEditOffer}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 text-[11.5px] font-medium text-ink-3 transition hover:bg-panel-2 hover:text-ink"
                  title="Every other field: lines, charges, currency, delivery, warranty"
                >
                  <Pencil className="size-3" strokeWidth={1.8} />
                  Lines &amp; charges
                </button>
              )}
            </span>
          ) : supplier ? (
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {supplier.name}
                {supplier.terms ? ` — ${supplier.terms}` : ""}
              </span>
              {onEditOffer && (
                <button
                  type="button"
                  onClick={onEditOffer}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 text-[11.5px] font-medium text-ink-3 transition hover:bg-panel-2 hover:text-ink"
                  title="Correct the supplier's name, terms, validity, charges and lines"
                >
                  <Pencil className="size-3" strokeWidth={1.8} />
                  Edit offer
                </button>
              )}
            </span>
          ) : (
            <span className="text-ink-4">
              No supplier chosen yet — the quote has no priced lines.
            </span>
          )}
        </Fact>
        <Fact
          label="Offer basis"
          note={
            offerEditable
              ? "Their stated total, in their currency, and their Incoterm. Blank total: the sum of their lines."
              : undefined
          }
        >
          {supplier && offerEditable && offer ? (
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="shrink-0 text-[12px] text-ink-4">{offer.currency}</span>
              <span className="w-40 shrink-0">
                <OfferCell
                  value={offer.quoted_total ?? ""}
                  placeholder={supplier.basis ?? "Their total"}
                  numeric
                  onSave={(v) => onSaveOffer!(quoteInOf(offer, { quoted_total: v || null }))}
                />
              </span>
              <span className="w-32 shrink-0">
                <OfferCell
                  value={offer.incoterms ?? ""}
                  placeholder="Incoterm"
                  onSave={(v) => onSaveOffer!(quoteInOf(offer, { incoterms: v || null }))}
                />
              </span>
            </span>
          ) : supplier ? (
            <span className="truncate">
              {supplier.basis ?? "—"}
              {supplier.incoterms ? ` ${supplier.incoterms}` : ""}
            </span>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </Fact>
        <Fact
          label="Offer validity"
          note={
            draft.bid_validity_days
              ? `We are offering ${draft.bid_validity_days} days. Check theirs covers it.`
              : undefined
          }
        >
          {supplier && offerEditable && offer ? (
            <OfferCell
              value={offer.validity ?? ""}
              placeholder="30 days from the date of issue"
              onSave={(v) => onSaveOffer!(quoteInOf(offer, { validity: v || null }))}
            />
          ) : (
            <span className={supplier?.validity ? "" : "text-ink-4"}>
              {supplier?.validity ?? "—"}
            </span>
          )}
        </Fact>
      </Facts>

      {/* ── 2 ── */}
      <Band>2. Recommended bid position</Band>
      <Facts>
        <Fact label="Technical verdict">
          <CellText
            value={draft.technical_verdict}
            editable={editable}
            onChange={set("technical_verdict")}
            placeholder="Fully compliant — the offer is from the specified manufacturer, against the specified part number."
          />
        </Fact>
        <Fact label="Commercial verdict">
          <CellText
            value={draft.commercial_verdict}
            editable={editable}
            onChange={set("commercial_verdict")}
            placeholder="Conditionally biddable — deviations priceable or curable. See the compliance matrix."
          />
        </Fact>
        <Fact
          label="Total landed cost"
          note={
            bid
              ? `${decimal(bid.landed.firm_percent, { min: 0 })}% of it committed; the rest is our estimate.`
              : undefined
          }
        >
          {bid ? (
            <span>
              <Num strong>{amount(bid.landed.total, currency)}</Num>
              {bid.landed.per_unit && (
                <span className="ml-2 text-ink-3">
                  (<Num muted>{amount(bid.landed.per_unit, currency)}</Num> each)
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </Fact>
        <Fact label="Recommended margin" note="Share of the selling price: price = landed cost ÷ (1 − margin).">
          <div className="w-28">
            <CellInput {...cell("target_markup_percent")} numeric placeholder="45" />
          </div>
        </Fact>
        <Fact
          label="Recommended bid price"
          strong
          note={
            bid?.bid_total_is_suggested
              ? "This is the ladder's answer. Nobody has decided a price yet — type one on the costing sheet."
              : bid?.gross_margin_percent
                ? `Margin ${decimal(bid.gross_margin_percent, { min: 1 })}% on the landed cost, before tax.`
                : undefined
          }
        >
          {bid ? (
            <span>
              <Num strong>{amount(bid.bid_total, currency)}</Num>
              {bid.bid_unit_price && (
                <span className="ml-2 font-normal text-ink-3">
                  (<Num muted>{amount(bid.bid_unit_price, currency)}</Num> each)
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </Fact>
        <Fact
          label="Mode of shipment"
          note="Drives the freight line on the landed cost, and on a late enquiry it is often what recovers the date."
        >
          <div className="w-36">
            <CellSelect
              value={draft.mode_of_shipment}
              editable={editable}
              onChange={set("mode_of_shipment")}
              options={MODES.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </Fact>
        <Fact label="Delivery to declare" note="Calendar days from the order, all in.">
          <div className="w-28">
            <CellInput {...cell("delivery_days")} numeric placeholder="45" />
          </div>
        </Fact>
        <Fact
          label="Country of origin"
          note="Where the goods are made. On a specified-brand line this is the manufacturer's country — never default it to ours."
        >
          <div className="w-20">
            <CellInput {...cell("country_of_origin")} uppercase maxLength={2} placeholder="GB" />
          </div>
        </Fact>
      </Facts>

      {/* ── 3 ── */}
      <Band tone={flags.some((f) => !f.resolved) ? "danger" : undefined}>
        3. Clear before submission
      </Band>
      {flags.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-ink-4">
          Nothing flagged. A row on the compliance matrix joins this list when somebody
          sets its urgency.{" "}
          <button
            onClick={onOpenCompliance}
            className="underline underline-offset-2 transition hover:text-ink"
          >
            Open the matrix
          </button>
        </p>
      ) : (
        <Grid columns="90px minmax(0,1fr) 130px">
          <GridHead>
            <Th>Severity</Th>
            <Th>Issue and required action</Th>
            <Th>Owner</Th>
          </GridHead>
          {flags.map((flag) => (
            <GridRow
              key={flag.id}
              faded={flag.resolved}
              tone={
                flag.resolved
                  ? "positive"
                  : flag.severity === "stopper" || flag.severity === "critical"
                    ? "danger"
                    : flag.severity === "high" || flag.severity === "medium"
                      ? "warn"
                      : undefined
              }
            >
              <Td>
                <span
                  className={
                    flag.resolved
                      ? "text-positive"
                      : SEVERITY[flag.severity].tone === "danger"
                        ? "text-danger"
                        : SEVERITY[flag.severity].tone === "warn"
                          ? "text-warn"
                          : "text-ink-3"
                  }
                >
                  {flag.resolved ? "Cleared" : SEVERITY[flag.severity].label}
                </span>
              </Td>
              <Td wrap>
                {flag.ref && <span className="tnum mr-1.5 text-ink-3">{flag.ref}</span>}
                <span className={flag.resolved ? "line-through" : ""}>{flag.issue}</span>
                {flag.action && !flag.resolved && (
                  <span className="mt-0.5 block text-ink-3">{flag.action}</span>
                )}
              </Td>
              <Td muted>{flag.owner ?? "—"}</Td>
            </GridRow>
          ))}
        </Grid>
      )}

      {editable && <YellowNote />}
    </Sheet>
  );
}

/* ── reading the chosen supplier off the comparison ──────────────────── */

/**
 * The offer this quote is priced from, as the summary wants to state it.
 *
 * Read off the comparison the quote already carries rather than fetched: it is
 * the same analysis the requester picked from, and a second round trip to
 * restate it would be a second answer waiting to disagree. Matched on
 * `quote_id`, which is what the analysis calls the supplier quote's id.
 */
function supplierOf(quote: QuoteRequestOut): {
  name: string;
  basis: string | null;
  validity: string | null;
  incoterms: string | null;
  terms: string | null;
} | null {
  const id = quote.selected_supplier_quote_id;
  if (!id) return null;
  const found = quote.comparison?.suppliers?.find((s) => s.quote_id === id);
  if (!found) return null;
  return {
    name: found.supplier_name,
    // Their own quoted figure in their own currency, which is what "offer
    // basis" means on the workbook — not our converted version of it.
    basis:
      found.quoted_total !== null
        ? `${found.currency} ${decimal(String(found.quoted_total))}`
        : found.total !== null
          ? `${found.currency} ${decimal(String(found.total))}`
          : null,
    validity: found.validity,
    incoterms: found.incoterms,
    terms: found.payment_terms,
  };
}

/**
 * A cell of the chosen supplier's offer. It saves to the offer itself when the
 * box is left with a changed value — the offer is its own record, not part of
 * the quote's draft — and says so if the save is refused.
 */
function OfferCell({
  value,
  placeholder,
  numeric,
  required,
  onSave,
}: {
  value: string;
  placeholder?: string;
  numeric?: boolean;
  required?: boolean;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  useEffect(() => setText(value), [value]);
  async function commit() {
    const next = text.trim();
    if (next === value.trim()) return;
    if (required && !next) {
      setText(value);
      return;
    }
    if (numeric && next && !/^\d*\.?\d*$/.test(next)) {
      setState("Numbers only.");
      return;
    }
    setState("saving");
    try {
      await onSave(next);
      setState("saved");
    } catch (err) {
      setState(err instanceof Error ? err.message : "Not saved.");
    }
  }
  const failed = state !== "idle" && state !== "saving" && state !== "saved";
  return (
    <span className="block w-full min-w-0">
      <input
        value={text}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "saving") setState("idle");
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`h-[30px] w-full min-w-0 rounded-[8px] bg-warn-soft/50 px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-accent/40 ${numeric ? "tnum text-right" : ""} ${failed ? "ring-2 ring-danger/50" : ""}`}
      />
      {state === "saving" && <span className="text-[10.5px] text-ink-4">Saving…</span>}
      {state === "saved" && <span className="text-[10.5px] text-positive">Saved to the offer</span>}
      {failed && <span className="text-[10.5px] text-danger">{state}</span>}
    </span>
  );
}

function unitOf(quote: QuoteRequestOut): string {
  const units = new Set(quote.items.map((i) => (i.unit ?? "").trim()).filter(Boolean));
  return units.size === 1 ? [...units][0] : "";
}

/**
 * Ship-to and the Incoterm place disagreeing is the single most common
 * clarification on these enquiries, and it is a real cost difference rather
 * than a typo. Compared loosely, because the two are written by different
 * people on different pages of the same document.
 */
function conflicting(draft: BidDraft): boolean {
  const ship = draft.ship_to.trim().toLowerCase();
  const place = draft.incoterm_place.trim().toLowerCase();
  if (!ship || !place) return false;
  return !place.includes(ship) && !ship.includes(place);
}

function elapsed(value: string): boolean {
  if (!value) return false;
  // Compared as dates, not timestamps: a delivery date is a day, and a date
  // asked for today has not elapsed.
  return value.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
