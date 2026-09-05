"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, ExternalLink, Paperclip, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { TaskAttachmentOut, TaskOut } from "@/lib/types";
import { Button } from "@/components/ui/controls";
import { InlineNotice, Skeleton } from "@/components/ui/feedback";

/**
 * The files on a proposal task.
 *
 * SharePoint list items carry attachments, and until the backend grew these
 * endpoints there was no way to see them here at all — a task with a spec
 * attached looked identical to one without, so people went to SharePoint to
 * find out. `has_attachments` now answers that on every row, and this panel
 * lists what is actually there.
 *
 * **Who gets an answer.** The backend's rule is the assignee or a global
 * admin, and it refuses everybody else with a **404 rather than a 403** —
 * deliberately, because "there is a task 412 and you may not see it" is itself
 * information about the pipeline. So a 404 here is not an error to report: it
 * is the expected answer for a team lead reading a colleague's row, and it is
 * shown as the SharePoint link instead. That link resolves against the
 * viewer's *own* SharePoint access, so it works for exactly the people who
 * should already be able to open the item.
 *
 * A 503 is different again — the backend raises it when the tenant has not
 * granted the permission these calls need, and its message names the grant.
 * That is a configuration answer for an administrator, not a failure to retry.
 */
export function TaskAttachments({ task }: { task: TaskOut }) {
  const key = `/proposals/tasks/${task.id}/attachments`;
  const { data, error, isLoading, mutate } = useSWR<TaskAttachmentOut[]>(key, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [busy, setBusy] = useState<string | null>(null);

  const upload = useAction(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    // The endpoint answers with the new list, so the panel is correct without
    // a second round trip.
    const next = await api.upload<TaskAttachmentOut[]>(key, form);
    await mutate(next, { revalidate: false });
    return next;
  });

  const remove = useAction(async (fileName: string) => {
    setBusy(fileName);
    try {
      await api.del(`${key}/${encodeURIComponent(fileName)}`);
      await mutate(
        (current) => (current ?? []).filter((f) => f.file_name !== fileName),
        { revalidate: false },
      );
      return true;
    } finally {
      setBusy(null);
    }
  });

  const refused = error instanceof ApiError && error.missing;
  const unconfigured = error instanceof ApiError && error.status === 503;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="micro flex items-center gap-1.5 text-ink-4">
          <Paperclip className="size-3" strokeWidth={2} />
          Attachments
          {data && data.length > 0 && <span className="tnum">{data.length}</span>}
        </p>

        {/* Uploading is offered only once the list has been read, which is the
            same thing as the backend having accepted this viewer for this
            task — there is no second permission to check. */}
        {data && (
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[13px] border border-line px-3 text-[12px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink">
            <Upload className="size-3.5" strokeWidth={2} />
            {upload.pending ? "Uploading…" : "Add a file"}
            <input
              type="file"
              className="hidden"
              disabled={upload.pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Cleared so choosing the same file twice fires again.
                e.target.value = "";
                if (file) void upload.run(file);
              }}
            />
          </label>
        )}
      </div>

      {upload.error && (
        <InlineNotice tone="danger" className="mb-2">
          {upload.error}
        </InlineNotice>
      )}
      {remove.error && (
        <InlineNotice tone="danger" className="mb-2">
          {remove.error}
        </InlineNotice>
      )}

      {isLoading ? (
        <Skeleton className="h-9 w-full rounded-xl" />
      ) : unconfigured ? (
        // The backend's own words: it names the exact grant an administrator
        // has to make, which is more use than "something went wrong".
        <InlineNotice tone="warn">{(error as ApiError).message}</InlineNotice>
      ) : refused ? (
        <AttachmentLink task={task} />
      ) : error ? (
        <InlineNotice tone="warn">
          The file list could not be read. {(error as ApiError).message}
        </InlineNotice>
      ) : !data || data.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">
          {task.has_attachments
            ? "SharePoint says this item has files, but none came back."
            : "Nothing attached."}
        </p>
      ) : (
        <ul className="space-y-1">
          {data.map((file) => (
            <li
              key={file.file_name}
              className="flex items-center gap-2 rounded-xl bg-inset px-3 py-2"
            >
              <Paperclip className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{file.file_name}</span>
              {/* Absolute, and pointing at Hamdaz rather than SharePoint —
                  the ERP session is what authorises the fetch, so no
                  SharePoint token ever reaches the browser. */}
              <a
                href={file.download_url}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-panel-3 hover:text-ink"
                title={`Download ${file.file_name}`}
              >
                <Download className="size-3.5" strokeWidth={2} />
              </a>
              <button
                type="button"
                onClick={() => void remove.run(file.file_name)}
                disabled={busy === file.file_name}
                title={`Remove ${file.file_name}`}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                <Trash2 className="size-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The fallback for somebody the task is not assigned to. */
function AttachmentLink({ task }: { task: TaskOut }) {
  if (!task.has_attachments) {
    return <p className="text-[12.5px] text-ink-4">Nothing attached.</p>;
  }
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-4">
      This task has files, and they are listed here only for the person it is assigned to.
      {task.attachments_url && (
        <>
          {" "}
          <a
            href={task.attachments_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 underline transition hover:text-ink"
          >
            Open them in SharePoint
            <ExternalLink className="size-3" />
          </a>
          , which uses your own access rather than the app&rsquo;s.
        </>
      )}
    </p>
  );
}

/** A row marker, so a task with files is obvious before it is opened. */
export function AttachmentMark({ task }: { task: TaskOut }) {
  if (!task.has_attachments) return null;
  return (
    <Paperclip
      className="size-3.5 shrink-0 text-ink-4"
      strokeWidth={2}
      aria-label="Has attachments"
    />
  );
}
