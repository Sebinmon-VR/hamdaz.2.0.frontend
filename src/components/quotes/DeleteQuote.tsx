"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * Confirming a delete that cannot be undone.
 *
 * Shared by the quote list and the quote itself, so the same guard applies
 * wherever the button is pressed. It would be easy to give the list a lighter
 * confirmation on the grounds that it is "just a row" — but the row and the
 * quote are the same record, and a delete from a list is the one more likely to
 * be a mis-click.
 *
 * **The quote's own reference has to be typed.** Not ceremony: this removes the
 * approval history along with the quote — who agreed to what, and when — and
 * the records most worth keeping are exactly the ones somebody would be annoyed
 * enough to delete. Typing the reference is the difference between deciding and
 * clicking.
 *
 * What is being destroyed is spelled out in counts rather than described
 * vaguely, because "this cannot be undone" is a sentence people have learned to
 * click past, and "12 decisions across 3 passes" is not.
 */
export interface DeletableQuote {
  reference: string | null;
  rfp_number?: string | null;
  title: string;
  revision: number;
  /** Absent on a list row, which has no items loaded. */
  itemCount?: number;
  reviewCount?: number;
}

export function DeleteQuoteDialog({
  open,
  quote,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  quote: DeletableQuote;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  // Falls back to the title when a draft has no reference yet, so the
  // confirmation is always something visible on the screen behind the dialog.
  const phrase = quote.reference ?? quote.rfp_number ?? quote.title;
  const matches = typed.trim().toLowerCase() === phrase.trim().toLowerCase();

  return (
    <Modal
      open={open}
      onClose={() => {
        setTyped("");
        onClose();
      }}
      title="Delete this quote request"
      description="Everything goes with it, and none of it comes back."
      footer={
        <>
          <Button
            onClick={() => {
              setTyped("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            loading={pending}
            disabled={!matches}
            onClick={onConfirm}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        <InlineNotice tone="danger">
          <strong>{quote.title}</strong>
          {quote.itemCount !== undefined ? (
            <>
              {" "}
              — the quote, its {quote.itemCount} priced{" "}
              {quote.itemCount === 1 ? "line" : "lines"}, the supplier comparison behind
              it, every comment, and the approval history
              {quote.reviewCount !== undefined && (
                <>
                  {" "}
                  — {quote.reviewCount}{" "}
                  {quote.reviewCount === 1 ? "decision" : "decisions"}
                </>
              )}{" "}
              across {quote.revision} {quote.revision === 1 ? "pass" : "passes"} — are
              removed for everyone.
            </>
          ) : (
            <>
              {" "}
              — the quote, its priced lines, the supplier comparison behind it, every
              comment and the whole approval history are removed for everyone.
            </>
          )}{" "}
          This cannot be undone.
        </InlineNotice>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Nothing is written to Zoho or SharePoint by this, or ever was — a quote
          deleted here was never in either.
        </p>
        <Field
          label={`Type ${phrase} to confirm`}
          hint="The reference of the quote you are deleting."
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phrase}
          />
        </Field>
      </div>
    </Modal>
  );
}
