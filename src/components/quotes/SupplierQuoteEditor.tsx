"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CURRENCIES } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { QuoteIn, SupplierChargeIn, SupplierQuoteRow } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * One supplier's offer, every field of it, put right.
 *
 * For the offer the reader got wrong or a person typed wrong: a misspelt
 * supplier, a price, a term, a charge it missed. Saved in place — the offer
 * keeps its document and, if it was chosen, its choice — and the comparison is
 * worked out again. The quote's own lines are not repriced by this; choosing
 * the supplier again does that.
 *
 * Numbers stay the strings typed. The server parses them.
 */

const CHARGE_KINDS: [string, string][] = [
  ["clearance", "Customs clearance"],
  ["duty", "Customs duty"],
  ["handling", "Handling"],
  ["packing", "Packing"],
  ["insurance", "Insurance"],
  ["documentation", "Documentation"],
  ["installation", "Installation"],
  ["bank", "Bank charges"],
  ["freight", "Freight"],
  ["other", "Other"],
];

const NUMERIC = /^-?\d*\.?\d*$/;

interface LineDraft {
  key: string;
  description: string;
  part_number: string;
  brand: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  lead_time: string;
}

interface ChargeDraft {
  key: string;
  kind: string;
  label: string;
  amount: string;
  percent: string;
  percent_of: string;
  included: boolean;
}

let counter = 0;
const nextKey = () => `sq-${(counter += 1)}`;
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const orNull = (v: string) => (v.trim() ? v.trim() : null);

function blankLine(): LineDraft {
  return {
    key: nextKey(), description: "", part_number: "", brand: "", unit: "",
    quantity: "1", unit_price: "", line_total: "", lead_time: "",
  };
}

function blankCharge(): ChargeDraft {
  return { key: nextKey(), kind: "handling", label: "", amount: "", percent: "", percent_of: "goods", included: false };
}

type Head = Record<
  | "supplier_name" | "quote_number" | "quote_date" | "currency" | "fx_rate" | "validity"
  | "delivery_time" | "payment_terms" | "warranty" | "incoterms" | "contact" | "notes"
  | "discount" | "freight" | "tax" | "quoted_total" | "extraction_note",
  string
>;

function headOf(row: SupplierQuoteRow): Head {
  return {
    supplier_name: row.supplier_name,
    quote_number: text(row.quote_number),
    quote_date: text(row.quote_date),
    currency: row.currency,
    fx_rate: text(row.fx_rate),
    validity: text(row.validity),
    delivery_time: text(row.delivery_time),
    payment_terms: text(row.payment_terms),
    warranty: text(row.warranty),
    incoterms: text(row.incoterms),
    contact: text(row.contact),
    notes: text(row.notes),
    discount: text(row.discount),
    freight: text(row.freight),
    tax: text(row.tax),
    quoted_total: text(row.quoted_total),
    extraction_note: text(row.extraction_note),
  };
}

/**
 * A stored offer as the save body, every field as it is — so a caller that
 * changes one field (the Summary sheet's cells) sends the rest unchanged.
 */
export function quoteInOf(row: SupplierQuoteRow, change: Partial<QuoteIn> = {}): QuoteIn {
  return {
    supplier_name: row.supplier_name,
    quote_number: row.quote_number,
    quote_date: row.quote_date,
    currency: row.currency,
    fx_rate: text(row.fx_rate) || "1",
    validity: row.validity,
    delivery_time: row.delivery_time,
    payment_terms: row.payment_terms,
    warranty: row.warranty,
    incoterms: row.incoterms,
    contact: row.contact,
    notes: row.notes,
    discount: row.discount,
    freight: row.freight,
    tax: row.tax,
    quoted_total: row.quoted_total,
    extraction_note: row.extraction_note,
    charges: (row.charges ?? []).map((c) => ({
      kind: c.kind,
      label: c.label ?? "",
      amount: c.amount === null || c.amount === undefined ? null : String(c.amount),
      percent: c.percent === null || c.percent === undefined ? null : String(c.percent),
      percent_of: c.percent_of ?? "goods",
      included: Boolean(c.included),
    })),
    items: row.items
      .filter((i) => (i.description ?? "").trim())
      .map((i) => ({
        description: (i.description ?? "").trim(),
        part_number: i.part_number,
        brand: i.brand,
        unit: i.unit,
        quantity: text(i.quantity) || "1",
        unit_price: text(i.unit_price) || "0",
        line_total: i.line_total,
        lead_time: i.lead_time,
      })),
    ...change,
  };
}

export function SupplierQuoteEditor({
  row,
  quoteCurrency,
  onClose,
  onSave,
}: {
  /** The offer to correct; null keeps the dialog closed. */
  row: SupplierQuoteRow | null;
  /** The quote's own currency: an offer in it needs no rate. */
  quoteCurrency: string;
  onClose: () => void;
  /** Resolves once saved; throws with the server's own message otherwise. */
  onSave: (supplierQuoteId: string, body: QuoteIn) => Promise<unknown>;
}) {
  const [head, setHead] = useState<Head | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [charges, setCharges] = useState<ChargeDraft[]>([]);

  useEffect(() => {
    if (!row) return;
    setHead(headOf(row));
    setLines(
      row.items.length
        ? row.items.map((item) => ({
            key: nextKey(),
            description: text(item.description),
            part_number: text(item.part_number),
            brand: text(item.brand),
            unit: text(item.unit),
            quantity: text(item.quantity) || "1",
            unit_price: text(item.unit_price),
            line_total: text(item.line_total),
            lead_time: text(item.lead_time),
          }))
        : [blankLine()],
    );
    setCharges(
      (row.charges ?? []).map((c) => ({
        key: nextKey(),
        kind: c.kind || "other",
        label: text(c.label),
        amount: text(c.amount),
        percent: text(c.percent),
        percent_of: c.percent_of || "goods",
        included: Boolean(c.included),
      })),
    );
  }, [row]);

  const save = useAction(async () => {
    if (!row || !head) return;
    const body: QuoteIn = {
      supplier_name: head.supplier_name.trim(),
      quote_number: orNull(head.quote_number),
      quote_date: orNull(head.quote_date),
      currency: head.currency,
      fx_rate: head.currency === quoteCurrency ? "1" : head.fx_rate.trim() || "1",
      validity: orNull(head.validity),
      delivery_time: orNull(head.delivery_time),
      payment_terms: orNull(head.payment_terms),
      warranty: orNull(head.warranty),
      incoterms: orNull(head.incoterms),
      contact: orNull(head.contact),
      notes: orNull(head.notes),
      discount: orNull(head.discount),
      freight: orNull(head.freight),
      tax: orNull(head.tax),
      quoted_total: orNull(head.quoted_total),
      extraction_note: orNull(head.extraction_note),
      charges: charges.map(
        (c): SupplierChargeIn => ({
          kind: c.kind,
          label: c.label.trim(),
          amount: orNull(c.amount),
          percent: orNull(c.percent),
          percent_of: c.percent_of,
          included: c.included,
        }),
      ),
      items: lines
        .filter((line) => line.description.trim())
        .map((line) => ({
          description: line.description.trim(),
          part_number: orNull(line.part_number),
          brand: orNull(line.brand),
          unit: orNull(line.unit),
          quantity: line.quantity.trim() || "1",
          unit_price: line.unit_price.trim() || "0",
          line_total: orNull(line.line_total),
          lead_time: orNull(line.lead_time),
        })),
    };
    await onSave(row.id, body);
    return true as const;
  });

  if (!row || !head) return null;

  const set = (key: keyof Head) => (value: string) => setHead((h) => (h ? { ...h, [key]: value } : h));
  const priced = lines.filter((line) => line.description.trim());
  const numbersOk =
    priced.every(
      (l) =>
        NUMERIC.test(l.quantity.trim()) && NUMERIC.test(l.unit_price.trim()) && NUMERIC.test(l.line_total.trim()),
    ) &&
    charges.every((c) => NUMERIC.test(c.amount.trim()) && NUMERIC.test(c.percent.trim())) &&
    (["fx_rate", "discount", "freight", "tax", "quoted_total"] as const).every((k) => NUMERIC.test(head[k].trim()));
  const valid = head.supplier_name.trim().length > 0 && priced.length > 0 && numbersOk;
  const foreign = head.currency !== quoteCurrency;

  const patchLine = (key: string, change: Partial<LineDraft>) =>
    setLines((was) => was.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const patchCharge = (key: string, change: Partial<ChargeDraft>) =>
    setCharges((was) => was.map((c) => (c.key === key ? { ...c, ...change } : c)));

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={`Edit ${row.supplier_name}'s offer`}
      description="Correct anything that was read or typed wrong. The comparison is worked out again; choose the supplier again to reprice the quote's own lines."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!valid}
            onClick={async () => {
              if (await save.run()) onClose();
            }}
          >
            Save Offer
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        {!numbersOk && <InlineNotice tone="warn">Numbers only in the price, quantity, rate and charge boxes.</InlineNotice>}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier" required className="sm:col-span-2">
            <Input value={head.supplier_name} onChange={(e) => set("supplier_name")(e.target.value)} />
          </Field>
          <Field label="Their reference">
            <Input value={head.quote_number} onChange={(e) => set("quote_number")(e.target.value)} />
          </Field>
          <Field label="Quote date">
            <Input value={head.quote_date} onChange={(e) => set("quote_date")(e.target.value)} placeholder="2026-10-01" />
          </Field>
          <Field label="Their currency">
            <Select value={head.currency} onChange={(e) => set("currency")(e.target.value)}>
              {((CURRENCIES as readonly string[]).includes(head.currency)
                ? [...CURRENCIES]
                : [head.currency, ...CURRENCIES]
              ).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Rate (1 ${head.currency} in ${quoteCurrency})`}>
            <Input
              value={foreign ? head.fx_rate : "1"}
              disabled={!foreign}
              inputMode="decimal"
              onChange={(e) => set("fx_rate")(e.target.value)}
              placeholder="Left at 1, Zoho's rate is used"
            />
          </Field>
          <Field label="Validity">
            <Input value={head.validity} onChange={(e) => set("validity")(e.target.value)} />
          </Field>
          <Field label="Delivery">
            <Input value={head.delivery_time} onChange={(e) => set("delivery_time")(e.target.value)} />
          </Field>
          <Field label="Incoterms">
            <Input value={head.incoterms} onChange={(e) => set("incoterms")(e.target.value)} />
          </Field>
          <Field label="Payment terms" className="sm:col-span-2">
            <Input value={head.payment_terms} onChange={(e) => set("payment_terms")(e.target.value)} />
          </Field>
          <Field label="Warranty">
            <Input value={head.warranty} onChange={(e) => set("warranty")(e.target.value)} />
          </Field>
          <Field label="Contact" className="sm:col-span-3">
            <Input value={head.contact} onChange={(e) => set("contact")(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Discount">
            <Input value={head.discount} inputMode="decimal" onChange={(e) => set("discount")(e.target.value)} />
          </Field>
          <Field label="Freight">
            <Input value={head.freight} inputMode="decimal" onChange={(e) => set("freight")(e.target.value)} />
          </Field>
          <Field label="Tax">
            <Input value={head.tax} inputMode="decimal" onChange={(e) => set("tax")(e.target.value)} />
          </Field>
          <Field label="Their stated total">
            <Input value={head.quoted_total} inputMode="decimal" onChange={(e) => set("quoted_total")(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] text-ink-3">Lines, as they charge them ({head.currency})</span>
            <Button size="sm" icon={Plus} onClick={() => setLines((was) => [...was, blankLine()])}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="space-y-2 rounded-[14px] bg-panel-2 p-2.5">
                <div className="grid gap-2 sm:grid-cols-[1fr_36px]">
                  <Input
                    value={line.description}
                    onChange={(e) => patchLine(line.key, { description: e.target.value })}
                    placeholder="Description"
                    className="h-10"
                  />
                  <button
                    onClick={() => setLines((was) => was.filter((l) => l.key !== line.key))}
                    disabled={lines.length === 1}
                    aria-label="Remove this line"
                    className="grid size-10 place-items-center rounded-[13px] text-ink-4 transition hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-7">
                  <Input value={line.part_number} onChange={(e) => patchLine(line.key, { part_number: e.target.value })} placeholder="Part no." className="h-10" />
                  <Input value={line.brand} onChange={(e) => patchLine(line.key, { brand: e.target.value })} placeholder="Brand" className="h-10" />
                  <Input value={line.unit} onChange={(e) => patchLine(line.key, { unit: e.target.value })} placeholder="Unit" className="h-10" />
                  <Input value={line.quantity} inputMode="decimal" onChange={(e) => patchLine(line.key, { quantity: e.target.value })} placeholder="Qty" aria-label="Quantity" className="h-10" />
                  <Input value={line.unit_price} inputMode="decimal" onChange={(e) => patchLine(line.key, { unit_price: e.target.value })} placeholder="Unit price" aria-label="Unit price" className="h-10" />
                  <Input value={line.line_total} inputMode="decimal" onChange={(e) => patchLine(line.key, { line_total: e.target.value })} placeholder="Line total" aria-label="Line total" title="As printed on their quote. Blank: quantity × unit price." className="h-10" />
                  <Input value={line.lead_time} onChange={(e) => patchLine(line.key, { lead_time: e.target.value })} placeholder="Lead time" className="h-10" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] text-ink-3">Charges on top of the lines</span>
            <Button size="sm" icon={Plus} onClick={() => setCharges((was) => [...was, blankCharge()])}>
              Add charge
            </Button>
          </div>
          {charges.length === 0 ? (
            <p className="text-[12px] text-ink-4">None.</p>
          ) : (
            <div className="space-y-2">
              {charges.map((c) => (
                <div key={c.key} className="grid items-center gap-2 rounded-[14px] bg-panel-2 p-2.5 sm:grid-cols-[150px_1fr_100px_80px_90px_auto_36px]">
                  <Select value={c.kind} onChange={(e) => patchCharge(c.key, { kind: e.target.value })} className="h-10">
                    {(CHARGE_KINDS.some(([k]) => k === c.kind) ? CHARGE_KINDS : [[c.kind, c.kind] as [string, string], ...CHARGE_KINDS]).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input value={c.label} onChange={(e) => patchCharge(c.key, { label: e.target.value })} placeholder="As they wrote it" className="h-10" />
                  <Input value={c.amount} inputMode="decimal" onChange={(e) => patchCharge(c.key, { amount: e.target.value })} placeholder="Amount" className="h-10" />
                  <Input value={c.percent} inputMode="decimal" onChange={(e) => patchCharge(c.key, { percent: e.target.value })} placeholder="%" className="h-10" />
                  <Select value={c.percent_of} onChange={(e) => patchCharge(c.key, { percent_of: e.target.value })} className="h-10" aria-label="Percent of">
                    <option value="goods">of goods</option>
                    <option value="cif">of CIF</option>
                  </Select>
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
                    <input type="checkbox" checked={c.included} onChange={(e) => patchCharge(c.key, { included: e.target.checked })} />
                    Included
                  </label>
                  <button
                    onClick={() => setCharges((was) => was.filter((x) => x.key !== c.key))}
                    aria-label="Remove this charge"
                    className="grid size-10 place-items-center rounded-[13px] text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notes">
            <Textarea value={head.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} />
          </Field>
          <Field label="Reader's note (clear it once checked)">
            <Textarea value={head.extraction_note} onChange={(e) => set("extraction_note")(e.target.value)} rows={3} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
