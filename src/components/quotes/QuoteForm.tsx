"use client";

import type { ReactNode } from "react";

import clsx from "clsx";
import { CURRENCIES, amount, date } from "@/lib/format";
import type { QuoteRequestOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { CommentOn } from "@/components/quotes/Discussion";

/**
 * The estimate as Zoho will want it.
 *
 * Every field here maps one-for-one onto a Zoho estimate field, which is why
 * they are grouped by what they are for rather than by what type they are —
 * somebody filling this in is thinking "what are the terms", not "which of
 * these are strings".
 *
 * The three money fields at the bottom are inputs, not outputs. They are sent
 * to the server, which applies them and returns the totals; nothing here works
 * out what they do to the total, and the totals are drawn by the line table
 * from the server's own answer.
 */

/** The editable half of a quote, held as strings exactly as typed. */
export interface QuoteFormDraft {
  customer_name: string;
  contact_person: string;
  reference_number: string;
  quote_date: string;
  expiry_date: string;
  place_of_supply: string;
  payment_terms: string;
  delivery_terms: string;
  cf_bcd: string;
  cf_portal: string;
  subject: string;
  notes: string;
  terms: string;
  discount: string;
  shipping_charge: string;
  adjustment: string;
  /** One tax on the total before tax. Blank means none. */
  tax_name: string;
  tax_percentage: string;
  /** Our own reference for the quote, and who is selling it. */
  reference: string;
  salesperson_name: string;
  /** "Yes" when several suppliers quote the same requirement. */
  multiple_supplier_quotes: string;
}

export function draftOf(quote: QuoteRequestOut): QuoteFormDraft {
  return {
    customer_name: quote.customer_name ?? "",
    contact_person: quote.contact_person ?? "",
    reference_number: quote.reference_number ?? "",
    // The API sends dates as YYYY-MM-DD, which is what <input type="date">
    // wants, so an ISO timestamp is trimmed rather than round-tripped through
    // a Date — that would shift the day in any timezone behind UTC.
    quote_date: (quote.quote_date ?? "").slice(0, 10),
    expiry_date: (quote.expiry_date ?? "").slice(0, 10),
    place_of_supply: quote.place_of_supply ?? "",
    payment_terms: quote.payment_terms ?? "",
    delivery_terms: quote.delivery_terms ?? "",
    cf_bcd: quote.cf_bcd ?? "",
    cf_portal: quote.cf_portal ?? "",
    subject: quote.subject ?? "",
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
    discount: quote.discount ?? "0",
    shipping_charge: quote.shipping_charge ?? "0",
    adjustment: quote.adjustment ?? "0",
    tax_name: quote.tax_name ?? "",
    tax_percentage: quote.tax_percentage ?? "",
    reference: quote.reference ?? "",
    salesperson_name: quote.salesperson_name ?? "",
    multiple_supplier_quotes: quote.multiple_supplier_quotes ? "Yes" : "No",
  };
}

/*
 * The dense box. The controls in `ui/controls` are 44px tall with 16px side
 * padding, which is right for a form on its own and wrong for thirty fields
 * in one card. There is no tailwind-merge here, so a plain `h-[30px]` beside
 * the primitive's `h-11` would be decided by stylesheet order; the trailing
 * `!` is what makes the compact size win regardless.
 */
const DENSE = "h-[30px]! rounded-[10px]! px-2.5! text-[12.5px]!";
// The select keeps room on the right for the chevron the primitive draws there.
const DENSE_SELECT = "h-[30px]! rounded-[10px]! px-2.5! pr-8! text-[12.5px]!";
const DENSE_AREA = "min-h-0! rounded-[10px]! px-2.5! py-1! text-[12.5px]! leading-snug!";
// A flowing row rather than a grid: fields fill each line edge to edge and
// wrap, so a group of five is one full line rather than four and a hole.
const GRID = "flex flex-wrap gap-x-3 gap-y-2";

export function QuoteForm({
  draft,
  currency,
  currencyEditable,
  onCurrency,
  editable,
  onChange,
  onComment,
  commentCounts,
  embedded = false,
  title,
  onTitle,
}: {
  draft: QuoteFormDraft;
  currency: string;
  /** Inside one card with other things: groups under small headings, no panels. */
  embedded?: boolean;
  /** The quote's title, edited here beside the customer when embedded. */
  title?: string;
  onTitle?: (value: string) => void;
  /** Its own permission, and its own save. Submitting freezes the rest of the
      quote; the currency stays correctable because nothing here converts. */
  currencyEditable: boolean;
  onCurrency: (value: string) => void;
  editable: boolean;
  onChange: (patch: Partial<QuoteFormDraft>) => void;
  onComment: (field: string, label: string) => void;
  /** Open comments per field name, so a discussed field says so. */
  commentCounts: Record<string, number>;
}) {
  const set =
    <K extends keyof QuoteFormDraft>(key: K) =>
    (value: string) =>
      onChange({ [key]: value } as Partial<QuoteFormDraft>);

  const field = (key: keyof QuoteFormDraft, label: string) => ({
    label,
    value: draft[key],
    editable,
    onChange: set(key),
    comments: commentCounts[key] ?? 0,
    onComment: () => onComment(key, label),
  });

  return (
    <div className={embedded ? "space-y-3.5" : "space-y-3"}>
      <Group embedded={embedded} title="Customer">
        {embedded && onTitle !== undefined && (
          <F
            label="Title"
            value={title ?? ""}
            editable={editable}
            onChange={onTitle}
            comments={0}
            onComment={() => onComment("title", "Title")}
            placeholder="What this quote is for"
            required
          />
        )}
        <F {...field("customer_name", "Customer")} required />
        <F {...field("contact_person", "Contact person")} />
        <F {...field("reference_number", "Their reference")} />
        <F {...field("reference", "Our reference")} />
        <F {...field("salesperson_name", "Salesperson")} />
        <F {...field("cf_portal", "Portal")} hint="Where the enquiry came from." />
        <F
          {...field("multiple_supplier_quotes", "Several supplier quotes")}
          options={["No", "Yes"]}
          hint="Yes: a supplier has to be chosen from the comparison before sending."
        />
      </Group>

      <Group embedded={embedded} title="Dates and terms">
        <F {...field("quote_date", "Quote date")} type="date" />
        <F {...field("expiry_date", "Valid until")} type="date" />
        {/* The deadline that actually matters — kept beside the other dates
            rather than buried with the custom fields it technically is. */}
        <F
          {...field("cf_bcd", "Bid closing date")}
          type="date"
          hint="The customer's deadline. This is the date the work is timed against."
        />
        {/* The currency the whole quote is in — its lines, its adjustments
            and the figure that reaches the customer. Changing it converts and
            saves at once, which is the one hint that stays visible: it changes
            what somebody does with the picker. */}
        <F
          label="Currency"
          value={currency}
          editable={currencyEditable}
          onChange={onCurrency}
          options={CURRENCIES}
          comments={commentCounts.currency ?? 0}
          onComment={() => onComment("currency", "Currency")}
          warn="Switching converts every figure at Zoho Books' rate and saves at once."
        />
        <F {...field("place_of_supply", "Place of supply")} />
        <F {...field("payment_terms", "Payment terms")} placeholder="30 days net" />
        <F {...field("delivery_terms", "Delivery terms")} placeholder="4–6 weeks, DDP site" />
      </Group>

      <Group embedded={embedded} title="What it says">
        <F {...field("subject", "Subject")} placeholder="What the quote is for, in a line" wide />
        <F {...field("notes", "Notes")} multiline hint="Shown to the customer." />
        <F
          {...field("terms", "Terms and conditions")}
          multiline
          hint="Printed at the foot of the estimate."
        />
      </Group>

      <Group
        embedded={embedded}
        title="Adjustments and tax"
        hint="Applied by the server to the line totals. The tax goes on once, on the total before tax."
      >
        <F {...field("discount", "Discount")} numeric suffix="%" />
        <F {...field("shipping_charge", "Shipping")} numeric suffix={currency} />
        <F
          {...field("adjustment", "Adjustment")}
          numeric
          suffix={currency}
          hint="Negative to take money off."
        />
        <F
          {...field("tax_name", "Tax")}
          placeholder="VAT"
          hint="Applied once to the total before tax — after the discount, shipping and adjustment. Not per line."
        />
        <F
          {...field("tax_percentage", "Tax rate")}
          numeric
          suffix="%"
          hint="Blank for no tax. Filled in at the house rate when a supplier is chosen."
        />
      </Group>
    </div>
  );
}

/* ── one group of fields ─────────────────────────────────────────────── */

/**
 * One card or several: the same groups either way. Embedded, a group is a
 * small heading over its fields; on its own, a panel with a head. A group's
 * hint is a tooltip on the heading, not a line of type under it.
 *
 * At module scope on purpose: a component defined inside the form's render
 * is a new type every render, so React would unmount and remount every
 * field in it on each keystroke — and the field being typed in would lose
 * focus after one character.
 */
function Group({
  embedded,
  title: heading,
  hint,
  children,
}: {
  embedded: boolean;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return embedded ? (
    <section>
      <span className="micro block text-ink-4" title={hint}>
        {heading}
      </span>
      <div className={clsx("mt-1.5", GRID)}>{children}</div>
    </section>
  ) : (
    <Panel className="p-4">
      <PanelHead title={heading} hint={hint} />
      <div className={clsx("mt-3", GRID)}>{children}</div>
    </Panel>
  );
}

/* ── one field ───────────────────────────────────────────────────────── */

function F({
  label,
  value,
  editable,
  onChange,
  onComment,
  comments,
  type,
  hint,
  warn,
  placeholder,
  multiline,
  numeric,
  suffix,
  required,
  wide,
  options,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  onComment: () => void;
  comments: number;
  type?: string;
  /** What the field is for. A tooltip on the label, not a line under the box. */
  hint?: string;
  /** The one kind of hint that stays visible: it changes what the control does. */
  warn?: string;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  suffix?: string;
  required?: boolean;
  /** Two columns wide, like a multiline field. */
  wide?: boolean;
  /** A fixed set of values. Renders a picker instead of a free text box. */
  options?: readonly string[];
}) {
  // The comment button appears when the pointer is over the field, or stays
  // when somebody has already commented — a discussed field should say so
  // without being hovered.
  const head = (
    <span
      className="mb-0.5 flex h-4 items-center gap-1 text-[11.5px] text-ink-3"
      title={[hint, warn].filter(Boolean).join(" ")}
    >
      {label}
      {required && <span className="text-danger">*</span>}
      <CommentOn
        count={comments}
        onClick={onComment}
        className={clsx(
          "ml-auto",
          !comments && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        )}
      />
    </span>
  );
  const box = clsx(
    "group min-w-0 grow",
    multiline || wide ? "basis-[380px] grow-[3]" : "basis-[170px]",
  );

  if (!editable) {
    return (
      <div className={box}>
        {head}
        <p
          className={clsx(
            "text-[13px] leading-snug",
            value ? "text-ink" : "text-ink-4",
            multiline && "whitespace-pre-wrap",
          )}
        >
          {!value
            ? "—"
            : type === "date"
              ? date(value)
              : numeric && suffix && suffix !== "%"
                ? amount(value, suffix)
                : numeric
                  ? `${value}${suffix ?? ""}`
                  : value}
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      {head}
      {options ? (
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={DENSE_SELECT}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : multiline ? (
        <Textarea
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={DENSE_AREA}
        />
      ) : (
        <div className="relative">
          <Input
            value={value}
            type={type}
            inputMode={numeric ? "decimal" : undefined}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={clsx(DENSE, numeric && "tnum", suffix && "pr-12!")}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-4">
              {suffix}
            </span>
          )}
        </div>
      )}
      {warn && <span className="sr-only">{warn}</span>}
    </div>
  );
}
