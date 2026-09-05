"use client";

import { useState } from "react";
import useSWR from "swr";
import { Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { bytes, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { HrDocumentKind, HrDocumentOut, HrMetaOut, MemberOut } from "@/lib/types";
import { Button, Field, FileDrop, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";
import { PeoplePicker } from "@/components/hr/PeoplePicker";

/**
 * Filing a document against somebody.
 *
 * A multipart POST, so it goes through `api.upload` rather than the JSON
 * helpers — the browser has to set the multipart boundary itself, which it
 * only does when nothing sets Content-Type.
 *
 * `kind` is a label rather than a schema: every kind is stored identically, so
 * the list here can be whatever `/hr/meta` says without this dialog needing to
 * know what a visa is. That is also why an unfamiliar kind is not an error.
 *
 * The one thing worth deliberating over is the visibility toggle. It defaults
 * to shared, matching the backend, because most of what HR files — a contract,
 * an offer letter, a payslip — is the employee's own document and withholding
 * it by default would be the wrong instinct baked into a default. A warning
 * note is worth withholding; the toggle says which case this is in plain words
 * rather than as a checkbox labelled "visible".
 */

/** The extensions `app/hr/documents.py` accepts. An allowlist, not a filter. */
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv,.rtf";

/** Matches MAX_FILE_BYTES on the backend, so the refusal happens before upload. */
const MAX_BYTES = 15 * 1_048_576;

export function UploadDocumentDialog({
  open,
  userId,
  userName,
  onClose,
  onUploaded,
}: {
  open: boolean;
  /** Fixed when opened from somebody's own file; otherwise picked in here. */
  userId?: string;
  userName?: string | null;
  onClose: () => void;
  onUploaded: (document: HrDocumentOut) => void;
}) {
  const meta = useSWR<HrMetaOut>(open ? "/hr/meta" : null, { revalidateOnFocus: false });

  const [person, setPerson] = useState<MemberOut | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<HrDocumentKind>("other");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [visible, setVisible] = useState(true);

  const target = userId ?? person?.user_id;
  const tooBig = Boolean(file && file.size > MAX_BYTES);

  const upload = useAction(async () => {
    const form = new FormData();
    form.append("file", file!);
    form.append("kind", kind);
    form.append("visible_to_employee", String(visible));
    // Empty strings would be sent as empty form fields and parsed as empty
    // strings, not as absent — a title of "" reads as a document with no name
    // rather than one the backend should name from the file.
    if (title.trim()) form.append("title", title.trim());
    if (note.trim()) form.append("note", note.trim());
    if (issuedOn) form.append("issued_on", issuedOn);
    if (expiresOn) form.append("expires_on", expiresOn);
    return api.upload<HrDocumentOut>(`/hr/people/${target}/documents`, form);
  });

  function reset() {
    setPerson(null);
    setFile(null);
    setKind("other");
    setTitle("");
    setNote("");
    setIssuedOn("");
    setExpiresOn("");
    setVisible(true);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={userName ? `File a document for ${userName}` : "File a document"}
      description="Stored in Hamdaz and downloadable by HR. Nothing is sent anywhere."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Upload}
            loading={upload.pending}
            disabled={!file || !target || tooBig}
            onClick={async () => {
              const created = await upload.run();
              if (created) {
                reset();
                onUploaded(created);
              }
            }}
          >
            File it
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-4">
        {upload.error && <InlineNotice tone="danger">{upload.error}</InlineNotice>}

        {!userId && (
          <div>
            <p className="mb-2 text-[12px] text-ink-3">Who it is about</p>
            <PeoplePicker
              selected={person ? [person.user_id] : []}
              onToggle={(member) =>
                setPerson((current) => (current?.user_id === member.user_id ? null : member))
              }
            />
          </div>
        )}

        {file ? (
          <div className="flex items-center gap-3 rounded-[14px] bg-panel-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{file.name}</span>
              <span className="block text-[11.5px] text-ink-4">{bytes(file.size)}</span>
            </span>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setFile(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <FileDrop
            accept={ACCEPT}
            label="Choose a document, or drop it here"
            hint="PDF, Word, Excel, an image, or plain text. Up to 15 MB."
            onFiles={(files) => setFile(files[0] ?? null)}
          />
        )}

        {tooBig && (
          <InlineNotice tone="danger">
            That file is {bytes(file!.size)}. The limit is 15 MB — it would be refused.
          </InlineNotice>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" hint="A label. Every kind is stored the same way.">
            <Select value={kind} onChange={(e) => setKind(e.target.value as HrDocumentKind)}>
              {(meta.data?.document_kinds ?? ["other"]).map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" hint="Left blank, the file name is used.">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Employment contract 2026"
            />
          </Field>
          <Field label="Issued on">
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </Field>
          <Field
            label="Expires on"
            hint="What the expiry list watches. Left blank, it never expires."
          >
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
        </div>

        <Field label="Note" hint="Context for HR. The employee sees this if the document is shared.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Toggle
          checked={visible}
          onChange={setVisible}
          label="The employee may read this"
          hint="On, it appears in their own HR record. Off, they cannot see that it exists at all — asking for it by id gets a 404, not a refusal. Their manager never sees it either way."
        />
      </div>
    </Modal>
  );
}
