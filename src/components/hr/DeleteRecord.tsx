"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { HrRemovedOut } from "@/lib/types";
import { Button, Field, Input } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * Destroying an HR record.
 *
 * Every one of these is a super admin's call and nobody else's — not HR's, not
 * the CEO's. The backend's `PURGE_ADMINS` is a single role for a stated
 * reason: the records an organisation is asked to produce years later are
 * exactly the ones the person a complaint is about most wants gone. This
 * component renders **nothing at all** for anyone else, rather than offering a
 * button that 403s, because a disabled Delete on a personnel file invites the
 * question "who do I ask" and the answer is meant to be nobody.
 *
 * The confirmation is deliberately heavier than a yes/no:
 *
 * - `destroys` spells out the cascade in the caller's own words, because the
 *   blast radius is never visible from the thing being clicked. Deleting one
 *   opening takes every application to it and every CV with it.
 * - `alternative` names the reversible thing that is almost always wanted
 *   instead — closing an opening, closing a cycle — since somebody reaching
 *   for Delete usually wants "stop this", not "erase this".
 * - `confirmWord` demands the record's own name be typed where the deletion
 *   cascades. Muscle memory gets past a single confirm button; it does not get
 *   past typing a title.
 *
 * On success the panel reports the backend's own `summary` sentence rather
 * than one assembled here, so what the user reads is the server's account of
 * what it actually destroyed.
 */
export function DeleteRecord({
  path,
  title,
  destroys,
  alternative,
  confirmWord,
  label = "Delete",
  onDeleted,
}: {
  /** The DELETE path, e.g. `/hr/openings/{id}`. */
  path: string;
  /** Names the record in the dialog's heading — "this job opening". */
  title: string;
  /** What goes with it. One line per kind of thing destroyed. */
  destroys: ReactNode;
  /** The reversible thing to do instead, where there is one. */
  alternative?: ReactNode;
  /**
   * Require this typed back before the button arms. Use the record's own
   * name, and only where deleting it cascades — asking for it on a single
   * document would train people to type without reading.
   */
  confirmWord?: string;
  label?: string;
  /** Given what was destroyed. Navigate away here; the record has gone. */
  onDeleted: (removed: HrRemovedOut) => void;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const remove = useAction(async () => {
    const removed = await api.del<HrRemovedOut>(path);
    setOpen(false);
    setTyped("");
    onDeleted(removed);
    return removed;
  });

  // Not a disabled button: see the note above.
  if (!session.roles.is_super_admin) return null;

  const armed = !confirmWord || typed.trim() === confirmWord.trim();

  return (
    <>
      <Button icon={Trash2} variant="danger" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped("");
        }}
        title={`Delete ${title}?`}
        description="This cannot be undone, and nothing here is archived first."
        footer={
          <>
            <Button
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={remove.pending}
              disabled={!armed}
              onClick={() => remove.run()}
            >
              {label}
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-4">
          {remove.error && <InlineNotice tone="danger">{remove.error}</InlineNotice>}

          <div>
            <p className="micro text-ink-4">What this destroys</p>
            <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
              {destroys}
            </div>
          </div>

          {alternative && (
            <InlineNotice tone="info">{alternative}</InlineNotice>
          )}

          {confirmWord && (
            <Field
              label="Type its name to confirm"
              hint={confirmWord}
              required
            >
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmWord}
                autoComplete="off"
              />
            </Field>
          )}
        </div>
      </Modal>
    </>
  );
}
