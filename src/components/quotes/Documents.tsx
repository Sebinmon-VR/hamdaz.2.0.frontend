"use client";

import clsx from "clsx";
import { useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { bytes, date, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import {
  UPLOAD_KINDS,
  type ApplySuggestionsIn,
  type DocumentKind,
  type DocumentSuggestion,
  type QuoteDocumentOut,
  type QuoteRequestOut,
} from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Input, Select, Toggle } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/** The 30px field, over the primitives' 44px one. */
export const COMPACT_FIELD = "h-[30px]! rounded-[10px]! px-2.5! text-[12.5px]!";
export const COMPACT_SELECT = "h-[34px]! rounded-[10px]! px-3! pr-8! text-[13px]!";
/** The small notice, over the primitives' padded one. */
export const COMPACT_NOTICE = "mt-2 rounded-[10px]! px-3! py-2! text-[11.5px]! leading-snug!";
/** The 28px button, over the primitives' 32px "sm". */
export const COMPACT_BUTTON = "h-7! px-2.5! text-[11.5px]!";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx";

/**
 * Every document behind a quote, filed with the task in the shared library.
 *
 * The customer's RFQ, the end user's PO, a courier quote, a datasheet: anything
 * that belongs with the quote is dropped here with a kind, filed into the
 * task's own folder in the Proposal Team Channel library, and listed with a
 * link a colleague can open with their own access. Supplier quotations have
 * their own path, because they are read into prices and compared; they still
 * appear in this list once filed.
 *
 * What a document says arrives as **suggestions** beside it — an RFQ's
 * reference and closing date, a courier quote's freight figure — with the
 * value, the page it came from and what the quote says now. Nothing is
 * written onto the quote until somebody ticks it and presses Apply. A field
 * that is already filled in is left alone unless "replace what is there" is
 * on, because overwriting a typed answer is a decision, not a convenience.
 *
 * The library is the store. An upload that cannot be filed fails and says
 * why, rather than being kept somewhere nobody will look.
 */
export function Documents({
  quote,
  editable,
  onChanged,
  embedded = false,
  kind: controlledKind,
  showUpload = true,
  showList = true,
}: {
  quote: QuoteRequestOut;
  editable: boolean;
  onChanged: (next: QuoteRequestOut) => void;
  /** Inside another panel: no panel or heading of its own. */
  embedded?: boolean;
  /** The kind decided outside; the picker here is then hidden. */
  kind?: DocumentKind;
  /** The drop zone, and the list of what is filed, can be shown apart. */
  showUpload?: boolean;
  showList?: boolean;
}) {
  const documents = quote.documents ?? [];
  // People's uploads apart from what the system generated.
  const uploaded = documents.filter((d) => d.kind !== "costing_report");
  const reports = documents.filter((d) => d.kind === "costing_report");
  const [ownKind, setOwnKind] = useState<DocumentKind>("customer_rfq");
  const kind = controlledKind ?? ownKind;
  const [notes, setNotes] = useState("");

  const upload = useAction(async (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    form.append("kind", kind);
    if (notes.trim()) form.append("notes", notes.trim());
    const next = await api.upload<QuoteRequestOut>(`/quote-requests/${quote.id}/documents`, form);
    onChanged(next);
    setNotes("");
    return next;
  });

  const remove = useAction(async (documentId: string) => {
    const next = await api.del<QuoteRequestOut>(
      `/quote-requests/${quote.id}/documents/${documentId}`,
    );
    onChanged(next);
    return next;
  });

  if (documents.length === 0 && !editable) return null;
  if (embedded && !showUpload && documents.length === 0) return null;

  const filed = documents.filter((d) => d.drive_url).length;
  const chosen = UPLOAD_KINDS.find((k) => k.value === kind);

  const body = (
    <>
      {!embedded && (
        <PanelHead
          title="Documents"
          count={documents.length || undefined}
          hint={
            documents.length > 0 && filed !== documents.length
              ? `${filed} of ${documents.length} filed`
              : undefined
          }
          action={
            quote.drive_folder_url ? (
              <a
                href={quote.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                title="The task's folder in the shared library, opened with your own SharePoint access"
                className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 transition hover:text-ink"
              >
                <FolderOpen className="size-3.5" strokeWidth={1.8} />
                Open folder
              </a>
            ) : undefined
          }
        />
      )}

      {showUpload && quote.filing_error && (
        <InlineNotice tone="warn" className={COMPACT_NOTICE}>
          {quote.filing_error}
        </InlineNotice>
      )}
      {showUpload && upload.error && (
        <InlineNotice tone="danger" className={COMPACT_NOTICE}>
          {upload.error}
        </InlineNotice>
      )}
      {showList && remove.error && (
        <InlineNotice tone="danger" className={COMPACT_NOTICE}>
          {remove.error}
        </InlineNotice>
      )}

      {editable && showUpload && (
        <div className={embedded ? "mt-2" : "mt-3"}>
          <div
            className={clsx(
              "grid gap-x-2 gap-y-1.5",
              controlledKind === undefined && "sm:grid-cols-2",
            )}
          >
            {controlledKind === undefined && (
              <Select
                value={kind}
                onChange={(e) => setOwnKind(e.target.value as DocumentKind)}
                className={COMPACT_SELECT}
                aria-label="What is it"
                title={chosen?.hint}
              >
                {UPLOAD_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            )}
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={COMPACT_FIELD}
              placeholder="Note, optional"
              aria-label="Note, optional"
              title="Kept with the file, e.g. “Revision 2, received by email on the 20th”"
            />
          </div>
          <DropStrip
            className="mt-1.5"
            accept={ACCEPT}
            busy={upload.pending}
            busyLabel="Filing…"
            title={
              embedded
                ? "PDF, image, spreadsheet or Word. Filed into the task's folder in SharePoint and read for what it can tell the quote."
                : "PDF, image, spreadsheet or Word. Filed into the task's folder in SharePoint and read for what it can tell the quote. Supplier quotations go in their own panel."
            }
            onFiles={(files) => upload.run(files)}
          />
        </div>
      )}

      {documents.length === 0 && editable && showList && (
        <p
          className="mt-2 text-[11.5px] text-ink-4"
          title="The RFQ gives the reference, the closing date, the tax and the terms, offered as suggestions you can apply. The lines themselves come from the supplier's quotation, never from here."
        >
          Nothing filed yet. Start with the customer&apos;s RFQ.
        </p>
      )}

      {showList && documents.length > 0 && (
        <div className={embedded ? "mt-2" : "mt-3"}>
          {/* What people filed, then — under a line of its own — what the
              system generated: the selling & costing report sent with each
              approval request, filed in the same folder. */}
          <div className="divide-y divide-line">
            {uploaded.map((doc) => (
              <DocumentRow
                key={doc.id ?? `legacy-${doc.supplier_quote_id}`}
                doc={doc}
                quote={quote}
                editable={editable}
                onChanged={onChanged}
                onRemove={doc.id ? () => remove.run(doc.id!) : undefined}
                removing={remove.pending}
              />
            ))}
          </div>
          {reports.length > 0 && (
            <>
              <div className="mt-2 flex items-center gap-2 border-t-2 border-line pt-2">
                <span className="micro text-ink-4">Sent with the approval request</span>
                <span className="text-[10.5px] text-ink-4">
                  · generated by the system, one per pass, filed in the same folder
                </span>
              </div>
              <div className="divide-y divide-line">
                {reports.map((doc) => (
                  <DocumentRow
                    key={doc.id ?? `legacy-${doc.supplier_quote_id}`}
                    doc={doc}
                    quote={quote}
                    editable={editable}
                    onChanged={onChanged}
                    onRemove={doc.id ? () => remove.run(doc.id!) : undefined}
                    removing={remove.pending}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  return embedded ? <div>{body}</div> : <Panel className="p-4">{body}</Panel>;
}

/* ── the drop strip ──────────────────────────────────────────────────── */

/**
 * A one-line drop target, 64px tall. What it accepts goes in the title rather
 * than under the label: the strip sits in a 360px column, and a sentence about
 * file types was most of what the old box showed.
 */
export function DropStrip({
  onFiles,
  accept,
  busy,
  label = "Drop files here, or choose",
  busyLabel = "Reading…",
  title,
  className,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  busy?: boolean;
  label?: string;
  busyLabel?: string;
  /** The accepted types and the rest of the small print, shown on hover. */
  title?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        title={title}
        onClick={() => input.current?.click()}
        disabled={busy}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        className={clsx(
          "flex h-24 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed px-3 text-[13px] transition disabled:opacity-60",
          busy || over
            ? "border-accent bg-accent-soft text-ink"
            : "border-line text-ink-3 hover:border-accent hover:bg-accent-soft/40 hover:text-ink",
        )}
      >
        <Upload className={clsx("size-4 shrink-0", busy && "animate-pulse")} strokeWidth={1.8} />
        <span className="truncate">{busy ? busyLabel : label}</span>
      </button>
    </div>
  );
}

/* ── one document ────────────────────────────────────────────────────── */

const KIND_TONE: Partial<
  Record<DocumentKind, "accent" | "info" | "second" | "positive" | "neutral">
> = {
  supplier_quote: "accent",
  customer_rfq: "info",
  end_user_po: "second",
  freight_quote: "info",
  costing_report: "positive",
};

const ROW_ICON =
  "grid size-6 shrink-0 place-items-center rounded-[7px] text-ink-4 transition hover:bg-panel-2 hover:text-ink disabled:opacity-40";

const SMALL_BADGE = "shrink-0 px-1.5! py-[2px]! text-[10.5px]!";

function DocumentRow({
  doc,
  quote,
  editable,
  onChanged,
  onRemove,
  removing,
}: {
  doc: QuoteDocumentOut;
  quote: QuoteRequestOut;
  editable: boolean;
  onChanged: (next: QuoteRequestOut) => void;
  onRemove?: () => void;
  removing: boolean;
}) {
  const name = doc.file_name ?? "Untitled document";
  // Anything a person uploaded can be removed while the quote is still theirs.
  // The costing report is the system's and is replaced on the next send.
  const deletable = editable && onRemove && doc.kind !== "costing_report";
  const [confirming, setConfirming] = useState(false);
  const pending = Object.entries(doc.suggestions ?? {}).filter(([, s]) => !s.applied);
  // A row with something still to apply opens on its own; the rest stay folded.
  const [open, setOpen] = useState(pending.length > 0);

  // The second line of the old row, now the tooltip and the expanded detail.
  const meta = [
    doc.supplier_name ?? doc.kind_label,
    doc.revision ? `pass ${doc.revision}` : null,
    doc.size ? bytes(doc.size) : null,
    doc.uploaded_by_name,
    doc.created_at ? relative(doc.created_at) : null,
    doc.drive_url ? null : "not filed",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="py-0.5">
      <div className="flex h-[38px] items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          className={clsx(ROW_ICON, "-ml-1")}
        >
          <ChevronRight
            className={clsx("size-3.5 transition-transform", open && "rotate-90")}
            strokeWidth={2}
          />
        </button>
        <FileText
          className={clsx("size-3.5 shrink-0", doc.drive_url ? "text-ink-3" : "text-ink-4")}
          strokeWidth={1.8}
        />
        {doc.drive_url ? (
          <a
            href={doc.drive_url}
            target="_blank"
            rel="noreferrer"
            title={`${name} · ${meta}`}
            className="min-w-0 flex-1 truncate text-[12.5px] text-ink underline-offset-2 hover:underline"
          >
            {name}
          </a>
        ) : (
          <span
            title={`${name} · ${meta}`}
            className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2"
          >
            {name}
          </span>
        )}
        {doc.is_selected && (
          <Badge tone="accent" icon={CheckCircle2} title="Priced from this" className={SMALL_BADGE}>
            Priced
          </Badge>
        )}
        <Badge
          tone={KIND_TONE[doc.kind] ?? "neutral"}
          title={[meta, doc.notes].filter(Boolean).join(" · ")}
          className={clsx(SMALL_BADGE, "max-w-[112px]")}
        >
          <span className="truncate">{doc.kind_label}</span>
        </Badge>
        {doc.id && pending.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={`${pending.length} suggestion${pending.length === 1 ? "" : "s"} read from this document`}
            aria-label={`${pending.length} suggestions to apply`}
            className="tnum inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold text-accent"
          >
            <Sparkles className="size-3" strokeWidth={2.2} />
            {pending.length}
          </button>
        )}
        {doc.drive_url && (
          <a
            href={doc.drive_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${name} in SharePoint`}
            title="Open in SharePoint"
            className={ROW_ICON}
          >
            <ExternalLink className="size-3.5" strokeWidth={1.8} />
          </a>
        )}
        {deletable && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={removing}
            aria-label={`Remove ${name}`}
            title="Remove from the quote and from the folder"
            className={clsx(ROW_ICON, "hover:bg-danger-soft! hover:text-danger!")}
          >
            <Trash2 className="size-3.5" strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* A second click, with the consequence spelled out. A supplier quote
          takes its prices with it, which is not something to lose to a slip. */}
      {deletable && confirming && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] bg-danger-soft/40 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-2">
          <span className="min-w-0 flex-1">
            Remove <span className="font-medium">{name}</span> from the quote and the SharePoint
            folder?
            {doc.kind === "supplier_quote" &&
              " Its prices leave the comparison too" +
                (doc.is_selected ? ", and a supplier has to be chosen again before sending." : ".")}
          </span>
          <Button
            size="sm"
            variant="danger"
            loading={removing}
            className={COMPACT_BUTTON}
            onClick={() => {
              onRemove?.();
              setConfirming(false);
            }}
          >
            Remove
          </Button>
          <Button size="sm" className={COMPACT_BUTTON} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      )}

      {open && (
        <div className="mb-1.5 pl-6">
          <p className="truncate text-[11.5px] text-ink-4" title={meta}>
            {meta}
          </p>
          {doc.notes && (
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{doc.notes}</p>
          )}
          {doc.id && pending.length > 0 && (
            <Suggestions
              quoteId={quote.id}
              documentId={doc.id}
              entries={pending}
              editable={editable}
              onChanged={onChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── what the document proposes ──────────────────────────────────────── */

function Suggestions({
  quoteId,
  documentId,
  entries,
  editable,
  onChanged,
}: {
  quoteId: string;
  documentId: string;
  entries: [string, DocumentSuggestion][];
  editable: boolean;
  onChanged: (next: QuoteRequestOut) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(entries.map(([k]) => k)));
  const [overwrite, setOverwrite] = useState(false);

  const apply = useAction(async () => {
    const body: ApplySuggestionsIn = { fields: [...picked], overwrite };
    const next = await api.post<QuoteRequestOut>(
      `/quote-requests/${quoteId}/documents/${documentId}/apply`,
      body,
    );
    onChanged(next);
    return next;
  });

  const toggle = (key: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mt-1.5 rounded-[10px] border border-line px-2.5 py-2">
      <p className="micro flex items-center gap-1.5 text-ink-3">
        <Sparkles className="size-3 text-accent" strokeWidth={2.2} />
        Read from this document
      </p>
      <ul className="mt-1.5 space-y-1">
        {entries.map(([key, s]) => {
          const conflict =
            s.current !== null && s.current !== undefined && s.current !== 0 && s.current !== "";
          return (
            <li key={key} className="flex items-start gap-2 text-[12px] leading-snug">
              <input
                type="checkbox"
                checked={picked.has(key)}
                disabled={!editable}
                onChange={() => toggle(key)}
                className="mt-[3px] size-3.5 accent-current"
                aria-label={`Apply ${s.label}`}
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink-3">{s.label}: </span>
                <span className="font-medium text-ink">{describe(key, s)}</span>
                {s.source && <span className="ml-1.5 text-[11px] text-ink-4">{s.source}</span>}
                {conflict && (
                  <span
                    className="ml-1.5 text-[11px] text-warn"
                    title="The quote already says this. Only replaced with “Replace what is there” on."
                  >
                    now {String(s.current)}
                    {key === "items" ? " lines" : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="sm"
            variant="accent"
            loading={apply.pending}
            disabled={picked.size === 0}
            className={COMPACT_BUTTON}
            onClick={() => apply.run()}
          >
            Apply {picked.size === entries.length ? "all" : picked.size}
          </Button>
          <div className="min-w-0 flex-1">
            <Toggle checked={overwrite} onChange={setOverwrite} label="Replace what is there" />
          </div>
          {apply.error && <span className="w-full text-[11.5px] text-danger">{apply.error}</span>}
        </div>
      )}
    </div>
  );
}

function describe(key: string, s: DocumentSuggestion): string {
  if (key === "items") {
    const items = Array.isArray(s.value) ? s.value : [];
    const first = items[0] as { name?: string } | undefined;
    const count = `${items.length} item${items.length === 1 ? "" : "s"}`;
    return first?.name ? `${count}, starting with ${first.name}` : count;
  }
  if (key === "freight") {
    const money = `${s.currency ? `${s.currency} ` : ""}${String(s.value)}`;
    return `${money}${s.carrier ? ` from ${s.carrier}` : ""}${s.transit ? `, ${s.transit}` : ""}`;
  }
  if (key === "cf_bcd" || key === "requested_delivery_date" || key === "po_date") {
    return date(String(s.value));
  }
  return String(s.value);
}
