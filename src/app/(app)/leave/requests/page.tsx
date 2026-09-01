"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Inbox, Mail, MailWarning, ShieldAlert, X } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { LeaveRequestOut } from "@/lib/types";
import { Avatar, Badge, Panel, PageHead, Stat } from "@/components/ui/primitives";
import { Button, Field, PillRail, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { LeaveStatusBadge, LeaveTypeBadge } from "@/components/leave/badges";

type Queue = "pending" | "rejected" | "approved" | "all";

/**
 * HR's queue.
 *
 * Only reachable by the HR team — the backend enforces that, and the nav only
 * offers it to members of the team named in the leave settings. Rejecting
 * requires a note because a rejection without one is the thing people escalate.
 */
export default function LeaveQueuePage() {
  const session = useSession();
  const [queue, setQueue] = useState<Queue>("pending");
  const [deciding, setDeciding] = useState<{
    request: LeaveRequestOut;
    action: "approve" | "reject";
  } | null>(null);

  const key = withQuery("/leave/requests", {
    status: queue === "all" ? undefined : queue,
    // A rejected request that has already passed is history, not work.
    upcoming_only: queue === "rejected" || undefined,
  });
  const { data, error, isLoading, mutate } = useSWR<LeaveRequestOut[]>(key);

  if (!session.isHr) {
    return (
      <Empty
        icon={ShieldAlert}
        title="HR only"
        body="Deciding leave is limited to the HR team. If that should include you, an administrator can add you to it."
      />
    );
  }

  const rows = data ?? [];
  const autoRejected = rows.filter((r) => r.decided_by === "system");

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Leave · HR"
        title="Requests to decide"
        lead="Approving here can go over the concurrency limit — that is what the emergency override is for."
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={queue}
          onChange={setQueue}
          options={[
            { value: "pending", label: "Waiting" },
            { value: "rejected", label: "Rejected, still ahead" },
            { value: "approved", label: "Approved" },
            { value: "all", label: "Everything" },
          ]}
        />
      </div>

      {queue === "pending" && rows.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(rows.length)} label="waiting on you" />
          <Stat
            value={num(rows.reduce((sum, r) => sum + r.days, 0))}
            label="days requested in total"
          />
          <Stat
            value={num(rows.filter((r) => (r.conflicting_count ?? 0) > 0).length)}
            label="clash with someone else"
            tone="warn"
          />
        </Panel>
      )}

      {queue === "rejected" && autoRejected.length > 0 && (
        <InlineNotice tone="warn">
          {autoRejected.length} of these were rejected by the concurrency rule rather than
          by a person. Approving one is an override, and the requester is told so.
        </InlineNotice>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Inbox}
          title={queue === "pending" ? "Nothing to decide" : "Nothing here"}
          body={
            queue === "pending"
              ? "Every request has been dealt with, automatically or by a person."
              : "No requests fall into this filter."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((request) => (
            <li key={request.id}>
              <Panel
                tone={request.status === "pending" ? "highlight" : "panel"}
                className="p-5"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar name={request.user_name} seed={request.user_id} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{request.user_name}</p>
                    <p className="mt-0.5 text-[12.5px] opacity-70">
                      {request.user_email} · asked {relative(request.created_at)}
                    </p>
                    <p className="mt-3 text-[14px] font-medium">
                      {date(request.start_date)} – {date(request.end_date)}
                      <span className="ml-2 font-normal opacity-70">
                        {request.days} {request.days === 1 ? "day" : "days"}
                      </span>
                    </p>
                    {request.reason && (
                      <p className="mt-2 text-[13px] leading-relaxed opacity-80">
                        {request.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <LeaveTypeBadge type={request.leave_type} />
                      <LeaveStatusBadge status={request.status} />
                    </div>
                    {request.conflicting_count !== null && (
                      <span className="text-[12px] opacity-70">
                        {request.conflicting_count} others off on the busiest day
                      </span>
                    )}
                    {request.emergency_override && (
                      <Badge tone="warn">Approved over the limit</Badge>
                    )}
                    {request.notify_error ? (
                      <Badge tone="danger" icon={MailWarning}>
                        HR email failed
                      </Badge>
                    ) : (
                      request.notified_at && (
                        <Badge icon={Mail}>Notified {relative(request.notified_at)}</Badge>
                      )
                    )}
                  </div>
                </div>

                {request.decided_at && (
                  <p className="mt-4 border-t border-current/10 pt-3 text-[12px] opacity-70">
                    Decided by{" "}
                    {request.decided_by === "system"
                      ? "the concurrency rule"
                      : (request.decided_by ?? "HR")}{" "}
                    {relative(request.decided_at)}
                    {request.decision_note ? ` — ${request.decision_note}` : ""}
                  </p>
                )}

                {(request.status === "pending" ||
                  (request.status === "rejected" && request.decided_by === "system")) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-current/10 pt-4">
                    <Button
                      variant="accent"
                      size="sm"
                      icon={Check}
                      onClick={() => setDeciding({ request, action: "approve" })}
                    >
                      {request.status === "rejected" ? "Override and approve" : "Approve"}
                    </Button>
                    {request.status === "pending" && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={X}
                        onClick={() => setDeciding({ request, action: "reject" })}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <DecideDialog
        deciding={deciding}
        onClose={() => setDeciding(null)}
        onDone={() => {
          setDeciding(null);
          mutate();
        }}
      />
    </div>
  );
}

function DecideDialog({
  deciding,
  onClose,
  onDone,
}: {
  deciding: { request: LeaveRequestOut; action: "approve" | "reject" } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [seenFor, setSeenFor] = useState<string | undefined>();

  // Reset whenever a different request is opened.
  if (deciding?.request.id !== seenFor) {
    setSeenFor(deciding?.request.id);
    setNote("");
    setEmergency(false);
  }

  const decide = useAction(async () => {
    const { request, action } = deciding!;
    return action === "approve"
      ? api.post(`/leave/requests/${request.id}/approve`, {
          note: note.trim() || null,
          emergency,
        })
      : api.post(`/leave/requests/${request.id}/reject`, { note: note.trim() });
  });

  const approving = deciding?.action === "approve";
  const clashes = (deciding?.request.conflicting_count ?? 0) > 0;

  return (
    <Modal
      open={Boolean(deciding)}
      onClose={onClose}
      title={
        approving
          ? `Approve ${deciding?.request.user_name}'s leave`
          : `Reject ${deciding?.request.user_name}'s leave`
      }
      description={
        deciding
          ? `${date(deciding.request.start_date)} – ${date(deciding.request.end_date)}, ${
              deciding.request.days
            } ${deciding.request.days === 1 ? "day" : "days"}.`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={approving ? "accent" : "danger"}
            icon={approving ? Check : X}
            loading={decide.pending}
            disabled={!approving && !note.trim()}
            onClick={async () => {
              if ((await decide.run()) !== undefined) onDone();
            }}
          >
            {approving ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {decide.error && <InlineNotice tone="danger">{decide.error}</InlineNotice>}

        {approving && clashes && (
          <InlineNotice tone="warn">
            {deciding!.request.conflicting_count} other people are already off on the
            busiest day of this range. Approving anyway needs the override below.
          </InlineNotice>
        )}

        <Field
          label={approving ? "Note" : "Why it is being rejected"}
          required={!approving}
          hint={
            approving
              ? "Optional. The requester sees this."
              : "The requester sees this, so it is worth a sentence."
          }
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              approving ? "Fine, enjoy it." : "Two people from the same team are already off."
            }
            autoFocus
          />
        </Field>

        {approving && (
          <Toggle
            checked={emergency}
            onChange={setEmergency}
            label="Override the concurrency limit"
            hint="Approves this even though it takes the day over the maximum. Recorded on the request."
          />
        )}
      </div>
    </Modal>
  );
}
