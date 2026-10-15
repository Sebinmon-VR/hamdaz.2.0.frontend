"use client";

import clsx from "clsx";
import { useRef, useState, type ReactNode } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Keyboard,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api, apiUrl, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type {
  AnalysisSupplier,
  QuoteDocumentOut,
  QuoteRequestOut,
  SupplierQuoteFailure,
  TypedSupplierQuotesIn,
} from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { Button, Select } from "@/components/ui/controls";
import { InlineNotice, Spinner } from "@/components/ui/feedback";
import { TypedSupplierQuoteDialog } from "@/components/quotes/TypedSupplierQuote";
import { COMPACT_NOTICE, COMPACT_SELECT } from "@/components/quotes/Documents";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx";
const MAX_FILES = 12;
const OFFER_CURRENCIES = [
  "AED", "USD", "EUR", "GBP", "SAR", "QAR", "OMR", "KWD", "BHD", "INR", "CNY", "JPY",
] as const;

/**
 * The first tab: what the suppliers sent, as cards.
 *
 * Every supplier quotation is a card with a picture of its first page, who it
 * is from, what it totals and how many of the lines it covers — so the person
 * pricing the quote sees at a glance which documents are on it, takes off the
 * wrong one and drops in the one that came late. Uploads add to what is
 * there; nothing here replaces an offer already read.
 *
 * Under the cards (``children``) is the line-by-line choice: several
 * suppliers usually quote a job between them, and each line is priced from
 * the one picked for it. The customer's own request sits beside the offers,
 * for the parts and quantities they asked for.
 */
export function SupplierQuotesTab({
  quote,
  editable,
  currency,
  onUpload,
  onTyped,
  onRemoveOffer,
  onChanged,
  children,
}: {
  quote: QuoteRequestOut;
  editable: boolean;
  currency: string;
  /** Reads the files as supplier quotations; returns the ones not added. */
  onUpload: (files: File[], offerCurrency: string | null) => Promise<SupplierQuoteFailure[] | null>;
  onTyped: (body: TypedSupplierQuotesIn) => Promise<void>;
  onRemoveOffer: (supplierQuoteId: string) => Promise<unknown>;
  onChanged: (next: QuoteRequestOut) => unknown;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState<number>(0);
  const [failures, setFailures] = useState<SupplierQuoteFailure[]>([]);
  const [offerCurrency, setOfferCurrency] = useState("");
  const [typing, setTyping] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const documents = quote.documents ?? [];
  const offers = quote.supplier_quotes ?? [];
  const analysed = new Map<string, AnalysisSupplier>(
    (quote.comparison?.suppliers ?? []).map((s) => [s.quote_id, s]),
  );
  const filed = new Map(
    documents
      .filter((d) => d.kind === "supplier_quote" && d.supplier_quote_id)
      .map((d) => [d.supplier_quote_id as string, d]),
  );
  const lineCount = quote.comparison?.item_count ?? 0;

  async function take(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).slice(0, MAX_FILES);
    if (files.length === 0 || !editable) return;
    setBusy(files.length);
    setFailures([]);
    try {
      setFailures((await onUpload(files, offerCurrency || null)) ?? []);
    } catch (caught) {
      setFailures(failuresOf(caught));
    } finally {
      setBusy(0);
    }
  }

  const empty = offers.length === 0 && busy === 0;

  return (
    <div className="space-y-3.5">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[14px] font-semibold">Supplier quotes</span>
          <span className="text-[12px] text-ink-3">
            {offers.length === 0
              ? "Drop every quotation the suppliers sent — several at once."
              : `${num(offers.length)} offer${offers.length === 1 ? "" : "s"} · ${num(lineCount)} line${lineCount === 1 ? "" : "s"} between them`}
          </span>
          {editable && (
            <div className="ml-auto flex items-center gap-2 text-[12.5px] text-ink-3">
              <span className="shrink-0">Offers are in</span>
              <Select
                value={offerCurrency}
                onChange={(e) => setOfferCurrency(e.target.value)}
                className={clsx(COMPACT_SELECT, "w-[210px]!")}
                aria-label="The currency the uploaded offers are in"
              >
                <option value="">whatever the document says</option>
                {OFFER_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <Button size="sm" icon={Keyboard} onClick={() => setTyping(true)}>
                Type one in
              </Button>
            </div>
          )}
        </div>

        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            void take(event.target.files);
            event.target.value = "";
          }}
        />

        <div
          className={clsx(
            "mt-3.5 rounded-[14px] transition",
            over && "bg-accent-soft/50 outline-2 outline-dashed outline-accent",
          )}
          onDragOver={(event) => {
            if (!editable) return;
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void take(event.dataTransfer.files);
          }}
        >
          {empty ? (
            <button
              type="button"
              disabled={!editable}
              onClick={() => input.current?.click()}
              className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line text-ink-3 transition hover:border-accent hover:bg-accent-soft/40 hover:text-ink disabled:opacity-60"
            >
              <Upload className="size-6" strokeWidth={1.6} />
              <span className="text-[14px] font-medium text-ink">
                Drop the supplier quotes here, or choose files
              </span>
              <span className="text-[12px]">
                PDF, Excel, Word or a photo · up to {MAX_FILES} at a time · add more any time
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  quoteId={quote.id}
                  name={offer.supplier_name}
                  document={filed.get(offer.id)}
                  analysed={analysed.get(offer.id)}
                  offerCurrency={offer.currency}
                  currency={currency}
                  lineCount={lineCount}
                  selected={quote.selected_supplier_quote_id === offer.id}
                  onRemove={editable ? () => onRemoveOffer(offer.id) : undefined}
                />
              ))}
              {Array.from({ length: busy }, (_, i) => (
                <div
                  key={`reading-${i}`}
                  className="flex h-[262px] flex-col items-center justify-center gap-2 rounded-[14px] border border-line bg-panel-2 text-[12px] text-ink-3"
                >
                  <Spinner />
                  Reading…
                </div>
              ))}
              {editable && busy === 0 && (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="flex h-[262px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line text-[12.5px] text-ink-3 transition hover:border-accent hover:bg-accent-soft/40 hover:text-ink"
                >
                  <Plus className="size-5" strokeWidth={1.8} />
                  Add more quotes
                  <span className="text-[11px] text-ink-4">or drop them anywhere here</span>
                </button>
              )}
            </div>
          )}
        </div>

        {failures.length > 0 && (
          <InlineNotice tone="warn" className={clsx(COMPACT_NOTICE, "mt-3!")}>
            <ul className="space-y-0.5">
              {failures.map((f, i) => (
                <li key={`${f.file_name}-${i}`}>
                  <span className="font-medium">{f.file_name}</span> — {f.error}
                </li>
              ))}
            </ul>
          </InlineNotice>
        )}
      </Panel>

      <CustomerRequest quote={quote} editable={editable} onChanged={onChanged} />

      {children}

      <TypedSupplierQuoteDialog
        open={typing}
        currency={currency}
        onClose={() => setTyping(false)}
        onSubmit={onTyped}
      />
    </div>
  );
}

/* ── one offer ───────────────────────────────────────────────────────── */

function OfferCard({
  quoteId,
  name,
  document,
  analysed,
  offerCurrency,
  currency,
  lineCount,
  selected,
  onRemove,
}: {
  quoteId: string;
  name: string;
  document: QuoteDocumentOut | undefined;
  analysed: AnalysisSupplier | undefined;
  offerCurrency: string;
  currency: string;
  lineCount: number;
  selected: boolean;
  onRemove?: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const missing = analysed?.missing_items?.length ?? 0;
  const quoted = analysed?.items_quoted ?? 0;

  return (
    <div
      className={clsx(
        "group relative flex h-[262px] flex-col overflow-hidden rounded-[14px] border bg-panel",
        selected ? "border-accent" : "border-line",
      )}
    >
      <Preview quoteId={quoteId} document={document} />

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] font-semibold" title={name}>
            {name}
          </span>
          {document?.drive_url && (
            <a
              href={document.drive_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-ink-4 hover:text-ink"
              title="Open the document"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.8} />
            </a>
          )}
        </div>
        <span className="truncate text-[11px] text-ink-4" title={document?.file_name ?? undefined}>
          {document?.file_name ?? "Typed in"}
        </span>
        <span className="tnum mt-auto text-[15px] font-semibold">
          {analysed?.total != null ? money(analysed.total, currency) : "—"}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {offerCurrency && offerCurrency.toUpperCase() !== currency.toUpperCase() && (
            <Badge tone="info">in {offerCurrency}</Badge>
          )}
          {lineCount > 0 && (
            <Badge tone={missing ? "warn" : "positive"}>
              {num(quoted)} of {num(lineCount)} lines
            </Badge>
          )}
        </div>
      </div>

      {onRemove &&
        (confirming ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-panel/95 p-4 text-center text-[12.5px]">
            <span>
              Remove <span className="font-semibold">{name}</span>? Its prices leave the quote and the
              file leaves the folder.
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setConfirming(false)} disabled={removing}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={removing}
                onClick={async () => {
                  setRemoving(true);
                  try {
                    await onRemove();
                  } finally {
                    setRemoving(false);
                    setConfirming(false);
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title={`Remove ${name}`}
            aria-label={`Remove ${name}`}
            className="absolute right-2 top-2 rounded-full bg-panel/90 p-1.5 text-ink-3 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-danger focus:opacity-100"
          >
            <Trash2 className="size-3.5" strokeWidth={1.8} />
          </button>
        ))}
    </div>
  );
}

/** The first page, as SharePoint draws it; an icon for what it cannot. */
function Preview({ quoteId, document }: { quoteId: string; document?: QuoteDocumentOut }) {
  const [failed, setFailed] = useState(false);
  const type = (document?.content_type ?? "").toLowerCase();
  const name = (document?.file_name ?? "").toLowerCase();
  const Icon = type.startsWith("image/")
    ? ImageIcon
    : /sheet|excel|csv/.test(type) || /\.(xlsx?|csv)$/.test(name)
      ? FileSpreadsheet
      : document
        ? FileText
        : Keyboard;
  const src =
    document?.id && !failed
      ? apiUrl(`/quote-requests/${quoteId}/documents/${document.id}/thumbnail`)
      : null;

  return (
    <div className="relative h-[140px] shrink-0 overflow-hidden border-b border-line bg-panel-2">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- an API image behind the session cookie
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover object-top"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-ink-4">
          <Icon className="size-8" strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}

/* ── the customer's own request ─────────────────────────────────────── */

/**
 * The RFQ the customer sent: what they asked for, beside what the suppliers
 * offered. Read for its dates and terms (suggested on the documents panel),
 * and the reference the lines are checked against.
 */
function CustomerRequest({
  quote,
  editable,
  onChanged,
}: {
  quote: QuoteRequestOut;
  editable: boolean;
  onChanged: (next: QuoteRequestOut) => unknown;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = (quote.documents ?? []).filter((d) => d.kind === "customer_rfq");

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      body.append("kind", "customer_rfq");
      onChanged(await api.upload<QuoteRequestOut>(`/quote-requests/${quote.id}/documents`, body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload it.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(documentId: string) {
    setError(null);
    try {
      onChanged(await api.del<QuoteRequestOut>(`/quote-requests/${quote.id}/documents/${documentId}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove it.");
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] font-semibold">Customer&apos;s request</span>
        <span className="text-[12px] text-ink-3">
          optional · the RFQ or enquiry, for the parts and quantities they asked for
        </span>
        {editable && (
          <Button
            size="sm"
            icon={busy ? undefined : Plus}
            loading={busy}
            className="ml-auto"
            onClick={() => input.current?.click()}
          >
            Add the RFQ
          </Button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.eml,.msg"
          className="hidden"
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {requests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {requests.map((d) => (
            <div
              key={d.id ?? d.file_name}
              className="flex items-center gap-2 rounded-[10px] border border-line bg-panel-2 px-2.5 py-1.5 text-[12px]"
            >
              <FileText className="size-3.5 text-ink-3" strokeWidth={1.8} />
              {d.drive_url ? (
                <a href={d.drive_url} target="_blank" rel="noreferrer" className="hover:underline">
                  {d.file_name}
                </a>
              ) : (
                <span>{d.file_name}</span>
              )}
              {editable && d.id && (
                <button
                  type="button"
                  onClick={() => d.id && remove(d.id)}
                  className="text-ink-4 hover:text-danger"
                  aria-label={`Remove ${d.file_name}`}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <InlineNotice tone="danger" className={COMPACT_NOTICE}>
          {error}
        </InlineNotice>
      )}
    </Panel>
  );
}

function failuresOf(caught: unknown): SupplierQuoteFailure[] {
  if (caught instanceof ApiError) {
    const detail = (caught.detail as { detail?: unknown })?.detail ?? caught.detail;
    if (typeof detail === "string" && detail) return [{ file_name: "Not added", error: detail }];
  }
  return [
    {
      file_name: "Upload",
      error: caught instanceof Error ? caught.message : "The files could not be read.",
    },
  ];
}
