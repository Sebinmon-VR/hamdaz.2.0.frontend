"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { Mail, Paperclip, Search } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import type { MailboxMessageOut, QuoteRequestOut } from "@/lib/types";
import { Button, Input } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

/**
 * Pick the supplier's email out of your own mailbox and file it with the quote.
 *
 * Only ever your own mailbox: the server reads the signed-in person's and
 * nobody else's. The message is filed as the original .eml in the task's
 * folder, and when the quote goes for approval it is in the mail as a
 * formatted card, with the original attached.
 */
export function SupplierEmailPicker({
  quote,
  open,
  onClose,
  onChanged,
}: {
  quote: QuoteRequestOut;
  open: boolean;
  onClose: () => void;
  onChanged: (next: QuoteRequestOut) => void;
}) {
  const [query, setQuery] = useState(quote.supplier_name ?? "");
  const [asked, setAsked] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailboxMessageOut[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    setLoading(true);
    setError(null);
    setAsked(q);
    try {
      setMessages(
        await api.get<MailboxMessageOut[]>(`/quote-requests/${quote.id}/mailbox`, {
          q: q.trim() || undefined,
        }),
      );
    } catch (caught) {
      setMessages([]);
      setError(caught instanceof Error ? caught.message : "Your mailbox could not be read.");
    } finally {
      setLoading(false);
    }
  }

  // The first look is the supplier's name, when the quote has one.
  useEffect(() => {
    if (open && asked === null) void search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function attach(message: MailboxMessageOut) {
    setAttaching(message.id);
    setError(null);
    try {
      const next = await api.post<QuoteRequestOut>(
        `/quote-requests/${quote.id}/supplier-emails`,
        { message_id: message.id },
      );
      onChanged(next);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email could not be attached.");
    } finally {
      setAttaching(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Attach the supplier's email"
      description="From your own mailbox. It is filed with the quote and goes to the approvers with the approval request, formatted in the mail and attached as the original."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Supplier, sender or subject"
          aria-label="Search your mailbox"
          autoFocus
        />
        <Button type="submit" icon={Search} loading={loading}>
          Search
        </Button>
      </form>

      {error && (
        <InlineNotice tone="danger" className="mt-3">
          {error}
        </InlineNotice>
      )}

      <div className="mt-3 max-h-[420px] divide-y divide-line overflow-y-auto">
        {messages?.length === 0 && !loading && !error && (
          <p className="py-6 text-center text-[12.5px] text-ink-4">
            Nothing in your mailbox matches{asked ? ` “${asked}”` : ""}.
          </p>
        )}
        {messages?.map((m) => (
          <div key={m.id} className="flex items-start gap-3 py-2.5">
            <Mail className="mt-0.5 size-4 shrink-0 text-ink-4" strokeWidth={1.8} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium">
                  {m.from_name || m.from_address || "Unknown sender"}
                </span>
                {m.received && (
                  <span className="shrink-0 text-[11px] text-ink-4">{relative(m.received)}</span>
                )}
                {m.has_attachments && (
                  <Paperclip
                    className="size-3 shrink-0 text-ink-4"
                    strokeWidth={2}
                    aria-label="Has attachments"
                  />
                )}
              </div>
              <p className="truncate text-[12.5px] text-ink-2">{m.subject}</p>
              <p className="line-clamp-2 text-[11.5px] leading-snug text-ink-4">{m.preview}</p>
            </div>
            <Button
              size="sm"
              variant="accent"
              className={clsx("shrink-0")}
              loading={attaching === m.id}
              disabled={attaching !== null && attaching !== m.id}
              onClick={() => attach(m)}
            >
              Attach
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
