"use client";

import clsx from "clsx";
import { useState } from "react";
import { FileWarning, Keyboard, Paperclip } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { SupplierQuoteFailure, TypedSupplierQuotesIn } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Select } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";
import { TypedSupplierQuoteDialog } from "@/components/quotes/TypedSupplierQuote";
import {
  COMPACT_BUTTON,
  COMPACT_NOTICE,
  COMPACT_SELECT,
  DropStrip,
} from "@/components/quotes/Documents";

/** What the endpoint takes, and how many at a time. */
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx";
const MAX_FILES = 12;

/** The currencies suppliers quote this business in, most common first. */
const OFFER_CURRENCIES = [
  "AED", "USD", "EUR", "GBP", "SAR", "QAR", "OMR", "KWD", "BHD", "INR", "CNY", "JPY",
] as const;

/**
 * The drop zone for what suppliers sent back — and, beside it, the way in for
 * what cannot be dropped.
 *
 * Documents are read with no model behind them: a PDF, a spreadsheet or a
 * Word file with a price table in it reads in a moment and costs nothing. A
 * photograph or a screenshot has no text to read, so the endpoint declines it
 * and says to type it in — and the typing happens here, in a dialog that
 * produces exactly the shape a document is read into.
 *
 * The important behaviour here is that a failure is partial. The endpoint
 * reads twelve files at a time and keeps every one it could parse, naming the
 * rest in its error — so treating the response as either "worked" or "failed"
 * would throw away good work and tell somebody to upload twelve files again
 * when one of them was a photograph of a fax.
 *
 * So the names come out of the error and stay on screen until the next
 * attempt, and the server's own words are shown rather than a summary of
 * them: it knows whether a file was encrypted, empty or simply not a quote,
 * and that is the difference between "try again" and "ring the supplier".
 */
export function SupplierUpload({
  attached,
  editable,
  currency,
  onUpload,
  onTyped,
  embedded = false,
}: {
  attached: number;
  editable: boolean;
  /** Inside another panel: no panel or heading of its own. */
  embedded?: boolean;
  /** The quote's own currency, offered as the default when typing one in. */
  currency: string;
  /** Attaches a typed-in quote. Throws with the server's message on refusal. */
  onTyped: (body: TypedSupplierQuotesIn) => Promise<unknown>;
  /**
   * Resolves to the failures the server reported, or throws. It has to throw
   * the original ApiError rather than a message about it — the per-file names
   * are in its `detail`, and a wrapper would flatten them into one sentence.
   */
  onUpload: (
    files: File[],
    /** The currency the offers are in, when the person says; null to read it off the document. */
    currency: string | null,
  ) => Promise<SupplierQuoteFailure[] | null>;
}) {
  // What currency the files are in. Blank means "whatever the document says",
  // which is right for a quotation with a currency on every line and wrong
  // for a screenshot or a scan that names it nowhere — that one used to be
  // taken in the quote's own currency and priced as dirhams.
  const [offerCurrency, setOfferCurrency] = useState("");
  const [failures, setFailures] = useState<SupplierQuoteFailure[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState<number | null>(null);
  // Owned here rather than passed in, so the spinner is tied to the same call
  // whose error this component is the one to interpret.
  const [pending, setPending] = useState(false);
  const [typing, setTyping] = useState(false);

  const body = (
    <>
      {!embedded && (
        <PanelHead
          title="Supplier quotes"
          count={attached || undefined}
          action={
            editable ? (
              <Button size="sm" icon={Keyboard} className={COMPACT_BUTTON} onClick={() => setTyping(true)}>
                Type one in
              </Button>
            ) : undefined
          }
        />
      )}

      <TypedSupplierQuoteDialog
        open={typing}
        currency={currency}
        onClose={() => setTyping(false)}
        onSubmit={onTyped}
      />

      {tooMany !== null && (
        <InlineNotice tone="warn" className={COMPACT_NOTICE}>
          {tooMany} files is more than the {MAX_FILES} this reads at once. The first{" "}
          {MAX_FILES} were sent — drop the rest in afterwards.
        </InlineNotice>
      )}

      {fatal && (
        <InlineNotice tone="danger" className={COMPACT_NOTICE}>
          {fatal}
        </InlineNotice>
      )}

      {/* Named, with the reason, and kept beside the drop zone so the retry is
          in the same place as the complaint. */}
      {failures.length > 0 && (
        <div className="mt-2 rounded-[10px] border border-warn/40 bg-warn-soft/40 px-2.5 py-2">
          <p
            className="flex items-center gap-1.5 text-[11.5px] font-semibold text-warn"
            title="Everything else was attached. Fix these and drop them in again."
          >
            <FileWarning className="size-3.5 shrink-0" strokeWidth={2} />
            {failures.length} file{failures.length === 1 ? "" : "s"} could not be read
          </p>
          <ul className="mt-1 space-y-0.5">
            {failures.map((failure, i) => (
              <li key={`${failure.file_name}-${i}`} className="text-[11.5px] leading-snug">
                <span className="font-medium">{failure.file_name}</span>
                <span className="text-ink-3"> — {failure.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0">These offers are in</span>
            <span className="min-w-0 flex-1">
              <Select
                value={offerCurrency}
                onChange={(e) => setOfferCurrency(e.target.value)}
                className={COMPACT_SELECT}
                aria-label="The currency the uploaded offers are in"
                title="The quote takes the supplier's currency. Leave it on “whatever the document says” for a quotation with a currency on every line; name it for a scan or a screenshot."
              >
                <option value="">whatever the document says</option>
                {OFFER_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </span>
          </label>
          {embedded && (
            <Button
              size="sm"
              icon={Keyboard}
              className={clsx(COMPACT_BUTTON, "shrink-0")}
              title="A photo or a screenshot has nothing to read; type its lines in instead"
              onClick={() => setTyping(true)}
            >
              Type one in
            </Button>
          )}
        </div>
      )}

      {editable ? (
        <DropStrip
          className="mt-1.5"
          accept={ACCEPT}
          busy={pending}
          title={`PDF, spreadsheet or Word, read on the spot; up to ${MAX_FILES} at a time. A photo or a scan is read by OCR where that is installed; otherwise type it in.`}
          onFiles={async (files) => {
            setFailures([]);
            setFatal(null);
            setTooMany(files.length > MAX_FILES ? files.length : null);
            setPending(true);
            try {
              const failed = await onUpload(files.slice(0, MAX_FILES), offerCurrency || null);
              if (failed?.length) setFailures(failed);
            } catch (caught) {
              // The backend writes its refusals for people to read, so the
              // detail is shown as-is rather than replaced with our own words.
              const named = namedFailures(caught);
              if (named.length > 0) setFailures(named);
              else {
                setFatal(
                  caught instanceof ApiError || caught instanceof Error
                    ? caught.message
                    : "The upload failed.",
                );
              }
            } finally {
              setPending(false);
            }
          }}
        />
      ) : (
        attached === 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
            <Paperclip className="size-3.5 shrink-0 text-ink-4" strokeWidth={1.8} />
            Nothing attached, and this quote is no longer editable.
          </p>
        )
      )}
    </>
  );

  return embedded ? <div>{body}</div> : <Panel className="p-4">{body}</Panel>;
}

/**
 * Pulls per-file failures out of whatever the API sent.
 *
 * The endpoint reports them in `detail`, which is a list of objects when it
 * can be and a sentence naming the files when it cannot. Both are handled
 * because the sentence is still the most useful thing available — better a
 * whole message under the "could not be read" heading than a generic error.
 */
function namedFailures(caught: unknown): SupplierQuoteFailure[] {
  if (!(caught instanceof ApiError)) return [];
  const detail = (caught.detail as { detail?: unknown })?.detail ?? caught.detail;

  if (Array.isArray(detail)) {
    const rows = detail
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        file_name: String(entry.file_name ?? entry.filename ?? entry.name ?? "A file"),
        error: String(entry.error ?? entry.reason ?? entry.msg ?? "Could not be read."),
      }));
    if (rows.length > 0) return rows;
  }

  const failed = (detail as { failed?: unknown })?.failed;
  if (Array.isArray(failed)) {
    return failed.map((entry: Record<string, unknown>) => ({
      file_name: String(entry?.file_name ?? "A file"),
      error: String(entry?.error ?? "Could not be read."),
    }));
  }

  // A 400 whose message names the files. Kept whole — it is written to be read.
  if (typeof detail === "string" && detail) {
    return [{ file_name: "Some files", error: detail }];
  }
  return [];
}

export { MAX_FILES };
