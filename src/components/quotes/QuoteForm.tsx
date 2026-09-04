"use client";

import clsx from "clsx";
import { amount, date } from "@/lib/format";
import type { QuoteRequestOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Input, Textarea } from "@/components/ui/controls";
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
  };
}

export function QuoteForm({
  draft,
  currency,
  editable,
  onChange,
  onComment,
  commentCounts,
}: {
  draft: QuoteFormDraft;
  currency: string;
  editable: boolean;
  onChange: (patch: Partial<QuoteFormDraft>) => void;
  onComment: (field: keyof QuoteFormDraft, label: string) => void;
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
    <div className="space-y-3.5">
      <Panel className="p-5">
        <PanelHead title="Customer" />
        <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <F {...field("customer_name", "Customer")} required />
          <F {...field("contact_person", "Contact person")} />
          <F {...field("reference_number", "Their reference")} />
          <F {...field("cf_portal", "Portal")} hint="Where the enquiry came from." />
        </div>
      </Panel>

      <Panel className="p-5">
        <PanelHead title="Dates and terms" />
        <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <F {...field("quote_date", "Quote date")} type="date" />
          <F {...field("expiry_date", "Valid until")} type="date" />
          {/* The deadline that actually matters — kept beside the other dates
              rather than buried with the custom fields it technically is. */}
          <F
            {...field("cf_bcd", "Bid closing date")}
            type="date"
            hint="The customer's deadline. This is the date the work is timed against."
          />
          <F {...field("place_of_supply", "Place of supply")} />
          <F {...field("payment_terms", "Payment terms")} placeholder="30 days net" />
          <F {...field("delivery_terms", "Delivery terms")} placeholder="4–6 weeks, DDP site" />
        </div>
      </Panel>

      <Panel className="p-5">
        <PanelHead title="What it says" />
        <div className="mt-4 space-y-4">
          <F {...field("subject", "Subject")} placeholder="What the quote is for, in a line" />
          <F {...field("notes", "Notes")} multiline hint="Shown to the customer." />
          <F
            {...field("terms", "Terms and conditions")}
            multiline
            hint="Printed at the foot of the estimate."
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <PanelHead
          title="Adjustments"
          hint="Applied by the server to the line totals — the figures below the lines are its answer, not this screen's."
        />
        <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-3">
          <F {...field("discount", "Discount")} numeric suffix="%" />
          <F {...field("shipping_charge", "Shipping")} numeric suffix={currency} />
          <F
            {...field("adjustment", "Adjustment")}
            numeric
            suffix={currency}
            hint="Negative to take money off."
          />
        </div>
      </Panel>
    </div>
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
  placeholder,
  multiline,
  numeric,
  suffix,
  required,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  onComment: () => void;
  comments: number;
  type?: string;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  suffix?: string;
  required?: boolean;
}) {
  const head = (
    <span className="mb-1.5 flex items-center gap-1 text-[12px] text-ink-3">
      {label}
      {required && <span className="text-danger">*</span>}
      <CommentOn count={comments} onClick={onComment} className="ml-auto" />
    </span>
  );

  if (!editable) {
    return (
      <div className={clsx(multiline && "sm:col-span-2")}>
        {head}
        <p
          className={clsx(
            "text-[13px] leading-relaxed",
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
    <div className={clsx(multiline && "sm:col-span-2")}>
      {head}
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div className="relative">
          <Input
            value={value}
            type={type}
            inputMode={numeric ? "decimal" : undefined}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={clsx(numeric && "tnum pr-14", suffix && !numeric && "pr-14")}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-ink-4">
              {suffix}
            </span>
          )}
        </div>
      )}
      {hint && <span className="mt-1.5 block text-[11.5px] text-ink-4">{hint}</span>}
    </div>
  );
}
