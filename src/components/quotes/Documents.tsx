"use client";

import clsx from "clsx";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import type { QuoteDocumentOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";

/**
 * The supplier documents behind a quote, and where each one was filed.
 *
 * Separate from the comparison panel above it on purpose. That panel is about a
 * decision — which offer to price from — and this is about paperwork: what was
 * sent to us, and where a colleague can go and read it. Folding the two
 * together made the comparison carry a column nobody was comparing.
 *
 * A filed document links into the shared library rather than being served from
 * here. That is the point of filing it: the person opening it may not have an
 * account on this system, and their own SharePoint access decides what they can
 * see — which is the right answer, and not one this app should be overriding.
 *
 * An unfiled document is shown too, and says so. It is not an error: filing is
 * switched off in some deployments, and a document that failed to upload is
 * deliberately kept rather than losing the quote it came with. The bytes are in
 * the database either way, so nothing has been lost — only the convenience of
 * the link.
 */
export function Documents({
  documents,
  editable,
}: {
  documents: QuoteDocumentOut[];
  /** Whether this person could still add one. Decides the empty state. */
  editable: boolean;
}) {
  // Shown empty rather than hidden while the quote can still be worked on.
  // Hiding it entirely was the first version and it was wrong: somebody looking
  // for "where are the documents" found nothing at all, and a panel that only
  // exists once you have already succeeded is no help to the person who has
  // not. On a finished quote with nothing attached there is genuinely nothing
  // to say, so it stays hidden there.
  if (documents.length === 0 && !editable) return null;

  const filed = documents.filter((d) => d.drive_url).length;

  return (
    <Panel className="p-5">
      <PanelHead
        title="Supplier documents"
        count={documents.length || undefined}
        hint={
          documents.length === 0
            ? "Whatever is uploaded above appears here, with a link to the copy in the shared library."
            : filed === documents.length
              ? "Filed to the shared library. Opening one uses your own SharePoint access."
              : `${filed} of ${documents.length} filed to the shared library; the rest are held here only.`
        }
      />

      {documents.length === 0 && (
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
          Nothing uploaded against this quote yet. Drop the supplier quotations into
          the panel above — each one is read for its prices, compared against the
          others, and filed to the shared library so a colleague can open the
          original without an account here.
        </p>
      )}

      <div className="mt-4 space-y-1.5">
        {documents.map((doc) => {
          const name = doc.file_name ?? "Untitled document";
          const body = (
            <>
              <FileText
                className={clsx(
                  "size-4 shrink-0",
                  doc.drive_url ? "text-ink-3" : "text-ink-4",
                )}
                strokeWidth={1.8}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{name}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">
                  {doc.supplier_name}
                  {!doc.drive_url && " · held here only"}
                </span>
              </span>
              {doc.is_selected && (
                <Badge tone="accent" icon={CheckCircle2}>
                  Priced from this
                </Badge>
              )}
              {doc.drive_url && (
                <ExternalLink className="size-3.5 shrink-0 text-ink-4" strokeWidth={1.8} />
              )}
            </>
          );

          return doc.drive_url ? (
            <a
              key={doc.supplier_quote_id}
              href={doc.drive_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-[14px] bg-panel-2 px-3.5 py-2.5 transition hover:bg-panel-3"
            >
              {body}
            </a>
          ) : (
            <div
              key={doc.supplier_quote_id}
              className="flex items-center gap-3 rounded-[14px] bg-panel-2/60 px-3.5 py-2.5"
            >
              {body}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
