"use client";

import clsx from "clsx";
import { useState } from "react";
import { Mail, Plus } from "lucide-react";
import { Button, Select } from "@/components/ui/controls";
import { Panel } from "@/components/ui/primitives";
import { COMPACT_BUTTON, COMPACT_SELECT, Documents } from "@/components/quotes/Documents";
import { SupplierEmailPicker } from "@/components/quotes/SupplierEmailPicker";
import { SupplierUpload } from "@/components/quotes/SupplierUpload";
import {
  UPLOAD_KINDS,
  type DocumentKind,
  type QuoteRequestOut,
  type SupplierQuoteFailure,
  type TypedSupplierQuotesIn,
} from "@/lib/types";

type What = "supplier_quote" | DocumentKind;

/**
 * One place to drop a file, whatever it is.
 *
 * A dropdown says what the file is — a supplier quotation by default, since
 * that is what prices the quote — and the file then goes down the path that
 * kind has always gone down: a supplier quotation through the comparison
 * reader, with the currency choice and "Type one in"; anything else through
 * the documents filing, read for what it can tell the quote. Under the box,
 * everything filed so far, with what each document suggests.
 *
 * Once the quote is sent it is frozen, but supporting documents are not:
 * "Add more files" files an addendum, a datasheet or a certificate without
 * pulling the quote back. Supplier quotations are not offered there, because
 * they reprice what the approvers are deciding.
 */
export function UploadBox({
  quote,
  editable,
  currency,
  onTyped,
  onSupplierUpload,
  onDocumentsChanged,
  className,
}: {
  quote: QuoteRequestOut;
  editable: boolean;
  currency: string;
  onTyped: (body: TypedSupplierQuotesIn) => Promise<unknown>;
  onSupplierUpload: (
    files: File[],
    currency: string | null,
  ) => Promise<SupplierQuoteFailure[] | null>;
  onDocumentsChanged: (next: QuoteRequestOut) => void;
  className?: string;
}) {
  const [what, setWhat] = useState<What>("supplier_quote");
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const mayAdd = !editable && Boolean(quote.may_add_documents);
  const offers = quote.comparison?.suppliers?.length ?? 0;
  const filed = quote.documents?.length ?? 0;
  // What the chosen kind does with the file. On the select's title rather than
  // printed under it: in a 360px column that sentence was a third of the box.
  const hint =
    what === "supplier_quote"
      ? "Read into priced lines and compared. Choosing one is what prices this quote."
      : (UPLOAD_KINDS.find((k) => k.value === what)?.hint ?? "");

  return (
    <Panel className={clsx("flex flex-col p-5", className)}>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[14px]">
        <span className="font-semibold">Documents</span>
        {(offers > 0 || filed > 0) && (
          <span className="tnum text-[11.5px] text-ink-4">
            · {offers} offer{offers === 1 ? "" : "s"} · {filed} filed
          </span>
        )}
      </div>

      {editable && (
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="shrink-0">This file is a</span>
          <span className="min-w-0 flex-1">
            <Select
              value={what}
              onChange={(e) => setWhat(e.target.value as What)}
              className={COMPACT_SELECT}
              title={hint}
            >
              <option value="supplier_quote">Supplier quotation</option>
              {UPLOAD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </span>
        </label>
      )}

      {(editable || mayAdd) && (
        <>
          <Button
            size="sm"
            icon={Mail}
            className={clsx(COMPACT_BUTTON, "mt-3 self-start")}
            title="Pick the supplier's email from your own mailbox. It goes to the approvers with the approval request."
            onClick={() => setPicking(true)}
          >
            Attach supplier email
          </Button>
          <SupplierEmailPicker
            quote={quote}
            open={picking}
            onClose={() => setPicking(false)}
            onChanged={onDocumentsChanged}
          />
        </>
      )}

      {mayAdd &&
        (adding ? (
          <div className="mt-2">
            <Documents
              embedded
              showList={false}
              quote={quote}
              editable
              onChanged={onDocumentsChanged}
            />
            <p className="mt-1.5 text-[11.5px] text-ink-4">
              Filed with the task. It changes nothing on the quote the approvers are deciding.
            </p>
          </div>
        ) : (
          <Button
            size="sm"
            icon={Plus}
            className={clsx(COMPACT_BUTTON, "mt-3 self-start")}
            title="File another document with this quote: an RFQ addendum, a datasheet, a certificate. Supplier quotations need the quote to be editable."
            onClick={() => setAdding(true)}
          >
            Add more files
          </Button>
        ))}

      {mayAdd ? null : what === "supplier_quote" ? (
        <SupplierUpload
          embedded
          attached={offers}
          editable={editable}
          currency={currency}
          onTyped={onTyped}
          onUpload={onSupplierUpload}
        />
      ) : (
        <Documents
          embedded
          kind={what}
          showList={false}
          quote={quote}
          editable={editable}
          onChanged={onDocumentsChanged}
        />
      )}

      {/* What is filed, scrolling inside the card rather than stretching it:
          the card is as tall as the lines beside it, no taller. */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        <Documents
          embedded
          showUpload={false}
          quote={quote}
          editable={editable}
          onChanged={onDocumentsChanged}
        />
      </div>
    </Panel>
  );
}
