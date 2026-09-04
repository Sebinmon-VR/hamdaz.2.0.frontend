"use client";

import { useState } from "react";
import { FileWarning, Paperclip } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { SupplierQuoteFailure } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/** What the endpoint takes, and how many at a time. */
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx";
const MAX_FILES = 12;

/**
 * The drop zone for what suppliers sent back.
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
  onUpload,
}: {
  attached: number;
  editable: boolean;
  /**
   * Resolves to the failures the server reported, or throws. It has to throw
   * the original ApiError rather than a message about it — the per-file names
   * are in its `detail`, and a wrapper would flatten them into one sentence.
   */
  onUpload: (files: File[]) => Promise<SupplierQuoteFailure[] | null>;
}) {
  const [failures, setFailures] = useState<SupplierQuoteFailure[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState<number | null>(null);
  // Owned here rather than passed in, so the spinner is tied to the same call
  // whose error this component is the one to interpret.
  const [pending, setPending] = useState(false);

  return (
    <Panel className="p-5">
      <PanelHead
        title="Supplier quotes"
        count={attached || undefined}
        hint={
          attached === 0
            ? "What the suppliers sent, read into lines you can compare."
            : "Read and compared below. Choosing one is what prices this quote."
        }
      />

      {tooMany !== null && (
        <InlineNotice tone="warn" className="mt-4">
          {tooMany} files is more than the {MAX_FILES} this reads at once. The first{" "}
          {MAX_FILES} were sent — drop the rest in afterwards.
        </InlineNotice>
      )}

      {fatal && (
        <InlineNotice tone="danger" className="mt-4">
          {fatal}
        </InlineNotice>
      )}

      {/* Named, with the reason, and kept beside the drop zone so the retry is
          in the same place as the complaint. */}
      {failures.length > 0 && (
        <div className="mt-4 rounded-[14px] border border-warn/40 bg-warn-soft/40 p-3.5">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-warn">
            <FileWarning className="size-3.5 shrink-0" strokeWidth={2} />
            {failures.length} file{failures.length === 1 ? "" : "s"} could not be read
          </p>
          <p className="mt-1 text-[11.5px] text-ink-3">
            Everything else was attached. Fix these and drop them in again.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {failures.map((failure, i) => (
              <li key={`${failure.file_name}-${i}`} className="text-[12px] leading-relaxed">
                <span className="font-medium">{failure.file_name}</span>
                <span className="text-ink-3"> — {failure.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable ? (
        <FileDrop
          className="mt-4"
          accept={ACCEPT}
          busy={pending}
          hint={`PDF, image, spreadsheet or Word. Up to ${MAX_FILES} at a time.`}
          onFiles={async (files) => {
            setFailures([]);
            setFatal(null);
            setTooMany(files.length > MAX_FILES ? files.length : null);
            setPending(true);
            try {
              const failed = await onUpload(files.slice(0, MAX_FILES));
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
          <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-3">
            <Paperclip className="size-3.5 shrink-0 text-ink-4" strokeWidth={1.8} />
            Nothing attached, and this quote is no longer editable.
          </p>
        )
      )}
    </Panel>
  );
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
