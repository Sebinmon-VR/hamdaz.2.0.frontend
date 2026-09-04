"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { QuoteRequestOut, QuotableTaskOut } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { Button, Field, Select } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";
import { QuoteStatusBadge } from "@/components/quotes/QuoteRequestBits";

/**
 * Turning a SharePoint enquiry into a quote.
 *
 * The team is asked for rather than guessed at, even though most people are in
 * one: it decides who can approve the quote afterwards and it cannot be
 * changed once the quote exists. Somebody in two teams picking the wrong one
 * discovers it at the point where nobody can sign their work off.
 *
 * The quote is created from the task rather than from a form, so nothing is
 * retyped — the title, customer and bid closing date come across, and the
 * screen this opens is where the actual work happens.
 *
 * If the enquiry already has a quote this dialog does not quietly make a
 * second one. The picker will not normally offer it, so reaching this state
 * means something is out of date; the existing quote is named, linked, and has
 * to be dismissed deliberately before a duplicate can be raised.
 */
export function RaiseQuoteDialog({
  task,
  onClose,
  onRaised,
}: {
  task: QuotableTaskOut | null;
  onClose: () => void;
  onRaised?: () => void;
}) {
  const session = useSession();
  const router = useRouter();

  const teams = session.teams.map((t) => t.team).filter((t) => !t.archived_at);
  const [team, setTeam] = useState(teams[0]?.slug ?? "");
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);

  // Both sides normalised to null: `task?.id` is undefined while the dialog is
  // shut, and comparing that against a null seed is true on every render, so
  // the reset below would re-enter until React gave up.
  const openFor = task?.id ?? null;
  if (openFor !== seen) {
    setSeen(openFor);
    setConfirmedDuplicate(false);
  }

  const raise = useAction(async () =>
    api.post<QuoteRequestOut>(withQuery("/quote-requests/from-task", { team }), {
      task_id: task!.id,
    }),
  );

  const noTeam = teams.length === 0;
  const existing = task?.quote_request_id ?? null;
  const blocked = existing !== null && !confirmedDuplicate;

  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title={existing ? "This enquiry already has a quote" : "Raise a quote"}
      description={
        existing
          ? "Raising a second one means two different numbers reaching the customer against the same enquiry."
          : "A draft quote against this enquiry. Supplier quotes, the comparison and approval all happen on its own screen."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {existing && (
            <Button variant="accent" onClick={() => router.push(`/quote-requests/${existing}`)}>
              Open the existing quote
            </Button>
          )}
          <Button
            variant={existing ? "danger" : "accent"}
            icon={FileText}
            loading={raise.pending}
            disabled={noTeam || !team || blocked}
            onClick={async () => {
              const made = await raise.run();
              if (made) {
                onRaised?.();
                router.push(`/quote-requests/${made.id}`);
              }
            }}
          >
            {existing ? "Raise a second one anyway" : "Raise it"}
          </Button>
        </>
      }
    >
      {task && (
        <div className="space-y-4 pb-4">
          {raise.error && <InlineNotice tone="danger">{raise.error}</InlineNotice>}

          {noTeam && (
            <InlineNotice tone="warn">
              A quote belongs to a team, because that is what decides who can approve it.
              You are not in one — ask an administrator to add you.
            </InlineNotice>
          )}

          {/* Named, linked, and dismissed by hand. A confirmation that does not
              say which quote it is talking about is not a confirmation. */}
          {existing && (
            <div className="rounded-2xl border border-warn/40 bg-warn-soft/40 p-4">
              <p className="text-[12.5px] font-semibold text-warn">
                Already quoted
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={`/quote-requests/${existing}`}
                  className="text-[13px] font-medium underline underline-offset-2"
                >
                  {task.quote_reference ?? task.quote_title ?? "The existing quote"}
                </Link>
                {task.quote_status && <QuoteStatusBadge status={task.quote_status} />}
              </div>
              <label className="mt-3 flex items-start gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={confirmedDuplicate}
                  onChange={(e) => setConfirmedDuplicate(e.target.checked)}
                  className="mt-0.5"
                />
                I have read{" "}
                {task.quote_reference ?? task.quote_title ?? "the existing quote"} and still
                want a second, separate quote against this enquiry.
              </label>
            </div>
          )}

          <div className="rounded-2xl bg-panel-2 p-4">
            <p className="text-[13.5px] font-medium leading-snug">{task.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
              {task.end_user && <span>{task.end_user}</span>}
              {task.bid_closing_date && (
                <span>
                  <span className="text-ink-4">Bid closes</span> {date(task.bid_closing_date)}
                </span>
              )}
              {task.status && <Badge>{task.status}</Badge>}
            </div>
          </div>

          {teams.length > 1 ? (
            <Field
              label="Team"
              required
              hint="Decides who can approve this quote. It cannot be changed afterwards."
            >
              <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                {teams.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            !noTeam && (
              <p className="text-[12.5px] text-ink-3">
                It will belong to <strong>{teams[0].name}</strong>, whose approvers will
                decide on it.
              </p>
            )
          )}
        </div>
      )}
    </Modal>
  );
}
