"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  CalendarX,
  Download,
  Eye,
  EyeOff,
  FolderLock,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { api, apiUrl, withQuery } from "@/lib/api";
import { bytes, date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  HrDocumentKind,
  HrDocumentOut,
  HrMetaOut,
  HrPerformanceOut,
  HrReviewOut,
} from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { PerformanceCard, ScorePill } from "@/components/hr/Score";
import { ReviewStatusBadge } from "@/components/hr/badges";
import { UploadDocumentDialog } from "@/components/hr/UploadDocumentDialog";
import { DeleteRecord } from "@/components/hr/DeleteRecord";

export default function PersonFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HrOnly>
      <PersonFile id={id} />
    </HrOnly>
  );
}

/**
 * Everything HR holds on one person.
 *
 * The name comes from the performance endpoint rather than from the documents,
 * because that one answers for anybody with a local record while the document
 * list is empty for most people — a screen that could only name somebody once
 * they had a contract on file would be blank exactly when HR needs it, on the
 * day they are filing the first thing.
 *
 * The reviews below are read through `?subject_id=`, which only HR may pass.
 * That is a filter and not a permission on the backend, so this screen never
 * relies on it for privacy: the whole route is behind `HrOnly` already.
 */
function PersonFile({ id }: { id: string }) {
  const router = useRouter();
  const performance = useSWR<HrPerformanceOut>(`/hr/people/${id}/performance`);
  const documents = useSWR<HrDocumentOut[]>(withQuery("/hr/documents", { user_id: id }));
  const reviews = useSWR<HrReviewOut[]>(withQuery("/hr/reviews", { subject_id: id }), {
    revalidateOnFocus: false,
  });

  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<HrDocumentOut | null>(null);

  if (performance.error) {
    return <ErrorState error={performance.error} onRetry={() => performance.mutate()} />;
  }
  if (!performance.data) return <PanelSkeleton lines={7} />;

  const name = performance.data.user_name ?? "Unknown";
  const files = documents.data ?? [];
  const expired = files.filter((d) => d.expired);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · People"
        title={name}
        count={documents.data ? `${files.length} on file` : undefined}
        faces={<Avatar name={name} seed={id} size="sm" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="accent" icon={Upload} onClick={() => setUploading(true)}>
              File a document
            </Button>
            {/* The leaver-erasure endpoint. Scoped to what HR holds *about*
                them; it deliberately does not touch the user account, which is
                the teams module's business. */}
            <DeleteRecord
              path={`/hr/people/${id}/hr-data`}
              title={`everything HR holds about ${name}`}
              label="Erase HR record"
              confirmWord={name}
              destroys={
                <>
                  <p>
                    Every document filed against them
                    {files.length > 0 ? ` — all ${files.length} of them` : ""}, contracts and
                    offer letters included.
                  </p>
                  <p>Every review written <strong>about</strong> them, submitted ones included.</p>
                  <p className="text-ink-3">
                    Reviews they <strong>wrote about colleagues</strong> are kept — those are
                    records about somebody else, and erasing a leaver should not quietly
                    remove half the evidence behind another person&rsquo;s appraisal.
                  </p>
                  <p className="text-ink-3">
                    Their Hamdaz account is <strong>not</strong> touched. Deactivating
                    somebody is done from their team, not here.
                  </p>
                </>
              }
              onDeleted={() => router.push("/hr/people")}
            />
          </div>
        }
      />

      {expired.length > 0 && (
        <InlineNotice tone="danger">
          {expired.length} {expired.length === 1 ? "document has" : "documents have"} already
          expired: {expired.map((d) => d.title).join(", ")}.
        </InlineNotice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="Documents" count={files.length} />

            {documents.error ? (
              <ErrorState error={documents.error} onRetry={() => documents.mutate()} />
            ) : documents.isLoading && !documents.data ? (
              <RowsSkeleton rows={4} />
            ) : files.length === 0 ? (
              <Empty
                icon={FolderLock}
                title="Nothing on file"
                className="mt-4"
                body="No contract, offer letter or identity document has been filed against this person yet."
                action={
                  <Button variant="accent" icon={Upload} onClick={() => setUploading(true)}>
                    File a document
                  </Button>
                }
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {files.map((document) => (
                  <li key={document.id}>
                    <DocumentRow
                      document={document}
                      onEdit={() => setEditing(document)}
                      onChanged={() => documents.mutate()}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <PanelHead
              title="Reviews about them"
              count={reviews.data?.length ?? 0}
              hint="Every nomination, whatever state it is in."
            />
            {reviews.error ? (
              <ErrorState error={reviews.error} onRetry={() => reviews.mutate()} />
            ) : reviews.isLoading && !reviews.data ? (
              <RowsSkeleton rows={3} />
            ) : (reviews.data ?? []).length === 0 ? (
              <Empty
                icon={Star}
                title="Nobody has been asked to review them"
                className="mt-4"
                body="Nominations are made inside a review cycle."
              />
            ) : (
              <ul className="mt-4 space-y-1.5">
                {(reviews.data ?? []).map((review) => (
                  <li key={review.id}>
                    <Link href={`/hr/reviews/${review.cycle_id}`} className="block">
                      <Panel tone="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            {review.reviewer_name ?? "Unknown reviewer"}
                            <span className="ml-2 text-[11.5px] font-normal opacity-70">
                              {humanise(review.relation)}
                            </span>
                          </span>
                          <span className="block truncate text-[11.5px] opacity-70">
                            {review.cycle_name ?? "Unknown cycle"}
                            {review.submitted_at
                              ? ` · submitted ${relative(review.submitted_at)}`
                              : ""}
                          </span>
                        </span>
                        <ScorePill percent={review.score_percent} />
                        <ReviewStatusBadge status={review.status} />
                      </Panel>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="h-fit p-5">
          <PanelHead
            title="Performance"
            hint="Submitted reviews only, across every cycle."
          />
          <PerformanceCard className="mt-5" performance={performance.data} />
        </Panel>
      </div>

      <UploadDocumentDialog
        open={uploading}
        userId={id}
        userName={name}
        onClose={() => setUploading(false)}
        onUploaded={() => {
          setUploading(false);
          documents.mutate();
        }}
      />

      <EditDocumentDialog
        document={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          documents.mutate();
        }}
      />
    </div>
  );
}

function DocumentRow({
  document,
  onEdit,
  onChanged,
}: {
  document: HrDocumentOut;
  onEdit: () => void;
  onChanged: () => void;
}) {
  return (
    <>
      <Panel tone="inset" className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{document.title}</p>
            <p className="mt-0.5 truncate text-[11.5px] opacity-70">
              {document.file_name} · {bytes(document.size_bytes)}
              {document.uploaded_by_name ? ` · filed by ${document.uploaded_by_name}` : ""}
            </p>
            {document.note && (
              <p className="mt-2 text-[12.5px] leading-relaxed opacity-80">{document.note}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone="neutral">{humanise(document.kind)}</Badge>
            {document.expired ? (
              <Badge tone="danger" icon={CalendarX}>
                Expired {date(document.expires_on)}
              </Badge>
            ) : (
              document.expires_on && (
                <Badge tone="warn" icon={CalendarX}>
                  Expires {date(document.expires_on)}
                </Badge>
              )
            )}
            {document.visible_to_employee ? (
              <Badge tone="info" icon={Eye} title="Appears in the employee's own HR record.">
                Shared
              </Badge>
            ) : (
              <Badge
                tone="neutral"
                icon={EyeOff}
                title="The person it is about cannot see that this exists."
              >
                Private
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-current/10 pt-3">
          <a
            href={apiUrl(`/hr/documents/${document.id}/download`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-[13px] border border-line px-3.5 text-[12px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            <Download className="size-3.5" strokeWidth={2.2} />
            Download
          </a>
          <Button size="sm" icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
          {/* Filing a document is HR's routine work; destroying one is not,
              and the backend moved this to a super admin for that reason —
              the file here is often the only copy anybody can produce later.
              HR now sees no Delete at all rather than one that 403s. */}
          <DeleteRecord
            path={`/hr/documents/${document.id}`}
            title={document.title}
            destroys={
              <>
                <p>
                  The file itself — {document.file_name}, {bytes(document.size_bytes)}. There
                  is no copy anywhere else in Hamdaz.
                </p>
                {document.visible_to_employee && (
                  <p>It is shared, so it also disappears from their own HR record.</p>
                )}
              </>
            }
            onDeleted={onChanged}
          />
          <span className="ml-auto text-[11.5px] opacity-60">
            {document.issued_on ? `Issued ${date(document.issued_on)} · ` : ""}
            filed {relative(document.created_at)}
          </span>
        </div>
      </Panel>

    </>
  );
}

/** Editing the details around a document. The file itself cannot be replaced. */
function EditDocumentDialog({
  document,
  onClose,
  onSaved,
}: {
  document: HrDocumentOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = useSWR<HrMetaOut>(document ? "/hr/meta" : null, { revalidateOnFocus: false });
  const [draft, setDraft] = useState<HrDocumentOut | null>(null);
  const [seenFor, setSeenFor] = useState<string | undefined>();

  // Re-seed whenever a different document is opened, the way the leave queue's
  // decide dialog does — a dialog reused across rows that keeps the previous
  // row's values is a dialog that eventually saves them to the wrong record.
  if (document?.id !== seenFor) {
    setSeenFor(document?.id);
    setDraft(document);
  }

  const save = useAction(async () =>
    api.patch<HrDocumentOut>(`/hr/documents/${document!.id}`, {
      kind: draft!.kind,
      title: draft!.title.trim(),
      note: draft!.note?.trim() || null,
      issued_on: draft!.issued_on || null,
      expires_on: draft!.expires_on || null,
      visible_to_employee: draft!.visible_to_employee,
    }),
  );

  function set<K extends keyof HrDocumentOut>(key: K, value: HrDocumentOut[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      title="Edit the details"
      description={document ? document.file_name : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!draft?.title.trim()}
            onClick={async () => {
              if (await save.run()) onSaved();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4 pb-4">
          {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind">
              <Select
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value as HrDocumentKind)}
              >
                {(meta.data?.document_kinds ?? [draft.kind]).map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" required>
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Issued on">
              <Input
                type="date"
                value={draft.issued_on ?? ""}
                onChange={(e) => set("issued_on", e.target.value || null)}
              />
            </Field>
            <Field label="Expires on" hint="Clearing this makes it never expire.">
              <Input
                type="date"
                value={draft.expires_on ?? ""}
                onChange={(e) => set("expires_on", e.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Note">
            <Textarea value={draft.note ?? ""} onChange={(e) => set("note", e.target.value)} />
          </Field>

          <Toggle
            checked={draft.visible_to_employee}
            onChange={(next) => set("visible_to_employee", next)}
            label="The employee may read this"
            hint="Turning it off takes the document out of their own HR record. They are not told either way."
          />

          <p className="text-[11.5px] text-ink-4">
            The file itself cannot be replaced — {bytes(draft.size_bytes)} of {draft.file_name}. Delete this and file the new one if the document has changed, so
            the old version does not quietly become the new one.
          </p>
        </div>
      )}
    </Modal>
  );
}
