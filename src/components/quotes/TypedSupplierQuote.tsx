"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CURRENCIES } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { QuoteIn, TypedSupplierQuotesIn } from "@/lib/types";
import { Button, Field, Input, Select } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * A supplier's quote, typed in.
 *
 * For the offer that arrived as a photograph, a screenshot of a web shop's
 * basket, or a price read out over the phone — anything the document reader
 * cannot read, now that there is no model behind it. What is typed here goes
 * into exactly the shape an uploaded document is read into, so the comparison
 * and the pricing that follow neither know nor care which way it arrived.
 *
 * Every number stays the string the user typed. The server parses it; putting
 * it through a JavaScript number first is how 12.5 becomes 12.499999999999998.
 */

interface LineDraft {
  key: string;
  description: string;
  part_number: string;
  quantity: string;
  unit_price: string;
}

let counter = 0;
function blankLine(): LineDraft {
  counter += 1;
  return { key: `typed-${counter}`, description: "", part_number: "", quantity: "1", unit_price: "" };
}

const NUMERIC = /^\d*\.?\d*$/;

export function TypedSupplierQuoteDialog({
  open,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** The quote's own currency, offered as the default. */
  currency: string;
  onClose: () => void;
  /** Resolves once attached; throws with the server's own message otherwise. */
  onSubmit: (body: TypedSupplierQuotesIn) => Promise<unknown>;
}) {
  const [supplier, setSupplier] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [cur, setCur] = useState(currency);
  const [validity, setValidity] = useState("");
  const [delivery, setDelivery] = useState("");
  const [payment, setPayment] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);

  const send = useAction(async () => {
    const quote: QuoteIn = {
      supplier_name: supplier.trim(),
      quote_number: quoteNumber.trim() || null,
      currency: cur,
      validity: validity.trim() || null,
      delivery_time: delivery.trim() || null,
      payment_terms: payment.trim() || null,
      source: "manual",
      items: lines
        .filter((line) => line.description.trim())
        .map((line) => ({
          description: line.description.trim(),
          part_number: line.part_number.trim() || null,
          quantity: line.quantity.trim() || "1",
          unit_price: line.unit_price.trim() || "0",
        })),
    };
    await onSubmit({ quotes: [quote] });
    return true as const;
  });

  const priced = lines.filter((line) => line.description.trim());
  const valid =
    supplier.trim().length > 0 &&
    priced.length > 0 &&
    priced.every(
      (line) =>
        NUMERIC.test(line.quantity.trim()) &&
        NUMERIC.test(line.unit_price.trim()) &&
        line.unit_price.trim() !== "",
    );

  function patch(key: string, change: Partial<LineDraft>) {
    setLines((was) => was.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Type in a supplier's quote"
      description="For an offer that came as a photograph, a screenshot or a phone call. It is compared and priced exactly like an uploaded document."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={send.pending}
            disabled={!valid}
            onClick={async () => {
              const done = await send.run();
              if (done) {
                setLines([blankLine()]);
                setSupplier("");
                setQuoteNumber("");
                onClose();
              }
            }}
          >
            Attach {priced.length || ""} line{priced.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {send.error && <InlineNotice tone="danger">{send.error}</InlineNotice>}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier" required className="sm:col-span-2">
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="router-switch.com"
            />
          </Field>
          <Field label="Their currency">
            <Select value={cur} onChange={(e) => setCur(e.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Their reference">
            <Input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} />
          </Field>
          <Field label="Validity">
            <Input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="30 days" />
          </Field>
          <Field label="Delivery">
            <Input value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="5–10 working days" />
          </Field>
          <Field label="Payment terms" className="sm:col-span-3">
            <Input value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="100% in advance by card" />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] text-ink-3">Lines, as they charge them</span>
            <Button size="sm" icon={Plus} onClick={() => setLines((was) => [...was, blankLine()])}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-[14px] bg-panel-2 p-2.5 sm:grid-cols-[1fr_130px_70px_110px_36px]"
              >
                <Input
                  value={line.description}
                  onChange={(e) => patch(line.key, { description: e.target.value })}
                  placeholder="HPE 2.4TB SAS 12G 10K SFF HDD"
                  className="h-10"
                />
                <Input
                  value={line.part_number}
                  onChange={(e) => patch(line.key, { part_number: e.target.value })}
                  placeholder="Part no."
                  className="h-10"
                />
                <Input
                  value={line.quantity}
                  inputMode="decimal"
                  onChange={(e) => patch(line.key, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="h-10"
                  aria-label="Quantity"
                />
                <Input
                  value={line.unit_price}
                  inputMode="decimal"
                  onChange={(e) => patch(line.key, { unit_price: e.target.value })}
                  placeholder={`Unit ${cur}`}
                  className="h-10"
                  aria-label="Unit price"
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
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-4">
            Unit price in the supplier&apos;s currency, before VAT. Freight and other charges go
            on the landed cost sheet, not here.
          </p>
        </div>
      </div>
    </Modal>
  );
}
