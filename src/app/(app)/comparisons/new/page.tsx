"use client";

import clsx from "clsx";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileUp,
  Plus,
  Save,
  Scale,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { bytes, money } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  AnalysisOut,
  ComparisonOut,
  ExtractionFailure,
  ExtractionOut,
  ItemIn,
  QuoteIn,
} from "@/lib/types";
import { Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/controls";
import { Empty, InlineNotice, Modal } from "@/components/ui/feedback";
import { AnalysisView } from "@/components/comparison/AnalysisView";

/** Kept in step with MAX_UPLOADS and MAX_FILE_BYTES on the backend. */
const MAX_FILES = 12;
const MAX_BYTES = 20 * 1_048_576;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.csv,.docx";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "INR"];

/**
 * Building a comparison.
 *
 * Three steps, in this order because each depends on the last being right:
 * read the documents, check what was read, then compare. The middle step is
 * not optional and not collapsible — the extractor is a model reading a PDF,
 * and a misread unit price is the one mistake that costs real money here.
 * Nothing is written until Save.
 */
export default function NewComparisonPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("AED");

  const [quotes, setQuotes] = useState<QuoteIn[]>([]);
  const [failed, setFailed] = useState<ExtractionFailure[]>([]);
  const [preview, setPreview] = useState<AnalysisOut | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const extract = useAction(async (list: FileList) => {
    const form = new FormData();
    for (const file of Array.from(list)) form.append("files", file);
    form.append("currency", currency);
    const result = await api.upload<ExtractionOut>("/comparisons/extract", form);
    // Appended, not replaced: quotes usually arrive in more than one batch.
    setQuotes((current) => [...current, ...result.quotes]);
    setFailed((current) => [...current, ...(result.failed ?? [])]);
    setPreview(null);
    return result;
  });

  const analyse = useAction(async () => {
    const result = await api.post<AnalysisOut>("/comparisons/analyse", {
      currency,
      quotes,
    });
    setPreview(result);
    return result;
  });

  const save = useAction(async () =>
    api.post<ComparisonOut>("/comparisons", {
      title: title.trim(),
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      currency,
      quotes,
    }),
  );

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFileError(null);
    if (quotes.length + list.length > MAX_FILES) {
      setFileError(`At most ${MAX_FILES} quotes in one comparison.`);
      return;
    }
    const tooBig = Array.from(list).find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setFileError(
        `${tooBig.name} is ${bytes(tooBig.size)} — the limit is ${bytes(MAX_BYTES)}.`,
      );
      return;
    }
    extract.run(list);
  }

  function update(index: number, patch: Partial<QuoteIn>) {
    setPreview(null);
    setQuotes((current) =>
      current.map((quote, i) => (i === index ? { ...quote, ...patch } : quote)),
    );
  }

  const canAnalyse = quotes.length >= 2 && quotes.every((q) => q.supplier_name.trim());
  const canSave = canAnalyse && title.trim().length > 0;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/comparisons">Comparisons</Link>}
        title="New comparison"
        lead="Upload the supplier quotes, check what was read out of them, then compare. Nothing is saved until you say so."
        actions={
          <Button
            variant="accent"
            icon={Save}
            loading={save.pending}
            disabled={!canSave}
            onClick={async () => {
              const result = await save.run();
              if (result) router.push(`/comparisons/${result.id}`);
            }}
          >
            Save comparison
          </Button>
        }
      />

      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* ── step 1 ── */}
          <Panel className="p-4">
            <PanelHead
              title="1. The documents"
              count={quotes.length ? `${quotes.length} read` : undefined}
              action={
                quotes.length > 0 && (
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      setQuotes((current) => [...current, blankQuote(currency)])
                    }
                  >
                    Enter one by hand
                  </Button>
                )
              }
            />

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files);
                // Lets the same file be chosen again after a failure.
                e.target.value = "";
              }}
            />

            <button
              onClick={() => inputRef.current?.click()}
              disabled={extract.pending}
              className={clsx(
                "mt-5 flex w-full flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition",
                extract.pending
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:border-accent hover:bg-accent-soft/40",
              )}
            >
              <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-inset text-ink-3">
                {extract.pending ? (
                  <Sparkles className="size-5 animate-pulse" />
                ) : (
                  <FileUp className="size-5" strokeWidth={1.9} />
                )}
              </span>
              <span className="text-[15px] font-medium">
                {extract.pending ? "Reading the quotes…" : "Add supplier quotes"}
              </span>
              <span className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
                {extract.pending
                  ? "Each document is read separately, so one bad scan does not cost the others."
                  : `PDF, image, XLSX, CSV or DOCX. Up to ${MAX_FILES} files, ${bytes(MAX_BYTES)} each.`}
              </span>
            </button>

            {(fileError || extract.error) && (
              <InlineNotice tone="danger" className="mt-4">
                {fileError ?? extract.error}
              </InlineNotice>
            )}

            {failed.length > 0 && (
              <div className="mt-4 space-y-2">
                {failed.map((failure, i) => (
                  <InlineNotice key={`${failure.file_name}-${i}`} tone="warn">
                    <strong>{failure.file_name}</strong> could not be read: {failure.error}
                  </InlineNotice>
                ))}
              </div>
            )}
          </Panel>

          {/* ── step 2 ── */}
          {quotes.length > 0 && (
            <Panel className="p-4">
              <PanelHead
                title="2. Check what was read"
                hint="The extractor is a model reading a document. Correct anything it got wrong before comparing."
              />
              <div className="mt-3 space-y-2">
                {quotes.map((quote, index) => (
                  <QuoteEditor
                    key={index}
                    quote={quote}
                    comparisonCurrency={currency}
                    onChange={(patch) => update(index, patch)}
                    onRemove={() => {
                      setPreview(null);
                      setQuotes((current) => current.filter((_, i) => i !== index));
                    }}
                  />
                ))}
              </div>
            </Panel>
          )}

          {/* ── step 3 ── */}
          {preview && (
            <div className="space-y-4">
              <PanelHead
                title="3. The comparison"
                hint="A preview. Nothing is stored until you save."
              />
              <AnalysisView analysis={preview.analysis} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHead title="About this comparison" />
            <div className="mt-3 space-y-3">
              <Field label="Title" required>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Switchgear for the Sharjah plant"
                />
              </Field>
              <Field label="Reference" hint="An RFQ or project number, if there is one.">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="RFQ-2026-0142"
                />
              </Field>
              <Field
                label="Comparison currency"
                hint="Every quote is converted to this using the rate you set on it."
              >
                <Select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setPreview(null);
                  }}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the next person should know about this bid."
                />
              </Field>
            </div>
          </Panel>

          <Panel className="p-4">
            <PanelHead title="Compare" />
            {analyse.error && (
              <InlineNotice tone="danger" className="mt-4">
                {analyse.error}
              </InlineNotice>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              {quotes.length < 2
                ? "At least two suppliers are needed before there is anything to compare."
                : "Matching equivalent lines across suppliers is a judgement call, so this step asks the model to do it and takes a few seconds."}
            </p>
            <Button
              variant="accent"
              icon={Scale}
              className="mt-4 w-full"
              loading={analyse.pending}
              disabled={!canAnalyse}
              onClick={() => analyse.run()}
            >
              {preview ? "Compare again" : "Compare"}
            </Button>
            {!canSave && quotes.length >= 2 && (
              <p className="mt-3 text-[12px] text-ink-4">
                Give the comparison a title to save it.
              </p>
            )}
          </Panel>

          {quotes.length === 0 && (
            <Empty
              icon={Scale}
              title="Nothing yet"
              body="Add at least two supplier quotes. They can be uploaded, or typed in by hand if you only have a number over the phone."
              action={
                <Button
                  icon={Plus}
                  onClick={() => setQuotes([blankQuote(currency)])}
                >
                  Enter one by hand
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function blankQuote(currency: string): QuoteIn {
  return {
    supplier_name: "",
    currency,
    fx_rate: "1",
    source: "manual",
    items: [{ description: "", quantity: "1", unit_price: "0" }],
  };
}

/**
 * One supplier's quote, editable.
 *
 * Collapsed to a summary by default: with six suppliers open at once the page
 * is unreadable, and the common case is that the extraction was right and only
 * needs a glance.
 */
function QuoteEditor({
  quote,
  comparisonCurrency,
  onChange,
  onRemove,
}: {
  quote: QuoteIn;
  comparisonCurrency: string;
  onChange: (patch: Partial<QuoteIn>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!quote.supplier_name);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const items = quote.items ?? [];
  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0),
    0,
  );
  const needsRate = quote.currency !== comparisonCurrency;

  function setItem(index: number, patch: Partial<ItemIn>) {
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  return (
    <Panel tone="inset" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-panel text-ink-3 transition hover:text-ink"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={clsx("size-4 transition-transform", open && "rotate-180")}
          />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium">
            {quote.supplier_name || "Unnamed supplier"}
          </p>
          <p className="truncate text-[11.5px] text-ink-4">
            {[
              quote.file_name ?? "Entered by hand",
              `${items.length} lines`,
              quote.quote_number,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {needsRate && (
          <Badge tone={Number(quote.fx_rate ?? 1) === 1 ? "warn" : "info"}>
            {quote.currency} × {quote.fx_rate ?? "1"}
          </Badge>
        )}
        <span className="tnum text-[14px] font-semibold">
          {money(quote.quoted_total ?? itemsTotal, quote.currency)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label="Remove this quote"
          onClick={() => setConfirmRemove(true)}
        />
      </div>

      {quote.extraction_note && (
        <InlineNotice tone="warn" className="mx-4 mb-4">
          {quote.extraction_note}
        </InlineNotice>
      )}

      {open && (
        <div className="space-y-5 border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Supplier" required>
              <Input
                value={quote.supplier_name}
                onChange={(e) => onChange({ supplier_name: e.target.value })}
                placeholder="Who quoted"
              />
            </Field>
            <Field label="Quote number">
              <Input
                value={quote.quote_number ?? ""}
                onChange={(e) => onChange({ quote_number: e.target.value })}
              />
            </Field>
            <Field label="Quote date">
              <Input
                type="date"
                value={quote.quote_date ?? ""}
                onChange={(e) => onChange({ quote_date: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={quote.currency ?? comparisonCurrency}
                onChange={(e) => onChange({ currency: e.target.value })}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Rate to ${comparisonCurrency}`}
              hint={
                needsRate
                  ? "No rate is fetched for you — set the one this bid was priced at."
                  : "Same currency, so this stays 1."
              }
            >
              <Input
                inputMode="decimal"
                disabled={!needsRate}
                value={quote.fx_rate ?? "1"}
                onChange={(e) => onChange({ fx_rate: e.target.value })}
              />
            </Field>
            <Field label="Printed total" hint="What the document says, before any correction.">
              <Input
                inputMode="decimal"
                value={quote.quoted_total ?? ""}
                onChange={(e) => onChange({ quoted_total: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Delivery">
              <Input
                value={quote.delivery_time ?? ""}
                onChange={(e) => onChange({ delivery_time: e.target.value })}
              />
            </Field>
            <Field label="Payment terms">
              <Input
                value={quote.payment_terms ?? ""}
                onChange={(e) => onChange({ payment_terms: e.target.value })}
              />
            </Field>
            <Field label="Validity">
              <Input
                value={quote.validity ?? ""}
                onChange={(e) => onChange({ validity: e.target.value })}
              />
            </Field>
            <Field label="Incoterms">
              <Input
                value={quote.incoterms ?? ""}
                onChange={(e) => onChange({ incoterms: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount">
              <Input
                inputMode="decimal"
                value={quote.discount ?? ""}
                onChange={(e) => onChange({ discount: e.target.value })}
              />
            </Field>
            <Field label="Freight">
              <Input
                inputMode="decimal"
                value={quote.freight ?? ""}
                onChange={(e) => onChange({ freight: e.target.value })}
              />
            </Field>
            <Field label="Tax">
              <Input
                inputMode="decimal"
                value={quote.tax ?? ""}
                onChange={(e) => onChange({ tax: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-ink-2">
                Lines ({items.length})
              </p>
              <Button
                size="sm"
                icon={Plus}
                onClick={() =>
                  onChange({
                    items: [...items, { description: "", quantity: "1", unit_price: "0" }],
                  })
                }
              >
                Add a line
              </Button>
            </div>

            <div className="space-y-1.5">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_72px_100px_32px] items-center gap-2"
                >
                  <Input
                    className="h-10"
                    value={item.description}
                    placeholder="What is being priced"
                    onChange={(e) => setItem(index, { description: e.target.value })}
                  />
                  <Input
                    className="h-10 text-right"
                    inputMode="decimal"
                    value={item.quantity ?? ""}
                    placeholder="Qty"
                    onChange={(e) => setItem(index, { quantity: e.target.value })}
                  />
                  <Input
                    className="h-10 text-right"
                    inputMode="decimal"
                    value={item.unit_price ?? ""}
                    placeholder="Unit"
                    onChange={(e) => setItem(index, { unit_price: e.target.value })}
                  />
                  <button
                    onClick={() =>
                      onChange({ items: items.filter((_, i) => i !== index) })
                    }
                    aria-label={`Remove line ${index + 1}`}
                    className="grid size-8 place-items-center rounded-full text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-right text-[12.5px] text-ink-3">
              Lines add up to{" "}
              <strong className="tnum text-ink">
                {money(itemsTotal, quote.currency)}
              </strong>
              {quote.quoted_total &&
                Math.abs(Number(quote.quoted_total) - itemsTotal) > 0.01 && (
                  <span className="text-warn">
                    {" "}
                    — the printed total says {money(quote.quoted_total, quote.currency)}
                  </span>
                )}
            </p>
          </div>
        </div>
      )}

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove this quote?"
        description={`${quote.supplier_name || "This supplier"} and its ${items.length} lines will be dropped from the comparison. Nothing has been saved yet, so the original file is untouched.`}
        footer={
          <>
            <Button onClick={() => setConfirmRemove(false)}>Keep it</Button>
            <Button variant="danger" icon={Trash2} onClick={onRemove}>
              Remove
            </Button>
          </>
        }
      />
    </Panel>
  );
}
