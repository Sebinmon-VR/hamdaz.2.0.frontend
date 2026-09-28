"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, ExternalLink, Send } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { FollowupOut } from "@/lib/types";
import { Badge, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Textarea } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { FollowupStatusBadge } from "@/components/followups/FollowupBits";

/**
 * The form a person lands on from the "past its due date" mail.
 *
 * Two ways out, and the second is as prominent as the first on purpose: the
 * commonest reason for the mail is a status nobody moved, and somebody who
 * finished on time should be able to say so in one click rather than having
 * to write an explanation for something that did not happen.
 *
 * Their manager and lead read the same page, without the buttons.
 */
export default function FollowupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, mutate } = useSWR<FollowupOut>(`/followups/${id}`, {
    revalidateOnFocus: false,
  });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // The mail's "Mark as false positive" button lands here with
  // ?false-positive=1, and the form opens at that step rather than at the
  // reason box.
  const [claiming, setClaiming] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("false-positive")) setClaiming(true);
  }, []);

  const send = useAction(async () => {
    const next = await api.post<FollowupOut>(`/followups/${id}/reason`, { reason: reason.trim() });
    await mutate(next, { revalidate: false });
  });
  const dismiss = useAction(async () => {
    const next = await api.post<FollowupOut>(`/followups/${id}/false-positive`, {
      note: note.trim() || null,
    });
    await mutate(next, { revalidate: false });
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/followups">Overdue tasks</Link>}
        title={data ? data.task_title : "Overdue task"}
        actions={data ? <FollowupStatusBadge status={data.status} /> : undefined}
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {data.may_answer ? (
              <>
                <Panel className="p-5">
                  <PanelHead
                    title="Why is it not finished?"
                    hint="Your team's manager reads this."
                  />
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                    This task went past its due date and its bid is not marked submitted on the
                    Proposals list. A sentence or two is enough — what is holding it up, and when
                    you expect to submit.
                  </p>
                  {send.error && (
                    <InlineNotice tone="danger" className="mt-3">
                      {send.error}
                    </InlineNotice>
                  )}
                  <Field label="Reason" className="mt-4">
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={5}
                      placeholder="Waiting on the supplier's revised price; expected Thursday."
                    />
                  </Field>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="accent"
                      icon={Send}
                      loading={send.pending}
                      disabled={reason.trim().length < 3}
                      onClick={() => void send.run()}
                    >
                      Send to my manager
                    </Button>
                  </div>
                </Panel>

                <Panel tone="inset" className="p-5">
                  <PanelHead title="Already updated this task?" />
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                    If you have submitted it or updated its submission status, you can ignore the
                    email — or
                    mark this as a false positive so nobody follows it up. Nothing is sent to your
                    manager.
                  </p>
                  {dismiss.error && (
                    <InlineNotice tone="danger" className="mt-3">
                      {dismiss.error}
                    </InlineNotice>
                  )}
                  {claiming ? (
                    <>
                      <Field label="Note (optional)" className="mt-4">
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          placeholder="Completed on Monday; status updated now."
                        />
                      </Field>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button onClick={() => setClaiming(false)}>Cancel</Button>
                        <Button
                          icon={CheckCircle2}
                          loading={dismiss.pending}
                          onClick={() => void dismiss.run()}
                        >
                          Mark as false positive
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4">
                      <Button icon={CheckCircle2} onClick={() => setClaiming(true)}>
                        It is already updated — false positive
                      </Button>
                    </div>
                  )}
                </Panel>
              </>
            ) : (
              <Panel className="p-5">
                <PanelHead title={outcomeTitle(data)} />
                {data.reason && (
                  <blockquote className="mt-3 whitespace-pre-wrap rounded-[14px] bg-panel-2 px-4 py-3 text-[13px] leading-relaxed">
                    {data.reason}
                  </blockquote>
                )}
                {data.resolved_note && (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                    {data.resolved_note}
                  </p>
                )}
                {data.status === "pending" && (
                  <p className="mt-3 text-[12.5px] text-ink-3">
                    Waiting for {data.assignee_name ?? data.assignee_email} to answer.
                  </p>
                )}
                {data.status === "answered" && (
                  <p className="mt-3 text-[12px] text-ink-4">
                    {data.forwarded_at
                      ? `Mailed to the team's manager ${relative(data.forwarded_at)}.`
                      : (data.forward_error ?? "Not mailed.")}
                  </p>
                )}
              </Panel>
            )}
          </div>

          <Panel className="space-y-3 p-5">
            <PanelHead title="The task" />
            <Meta label="Held by">{data.assignee_name ?? data.assignee_email}</Meta>
            {data.end_user && <Meta label="End user">{data.end_user}</Meta>}
            <Meta label="Was due">{dateTime(data.due_at)}</Meta>
            <Meta label="Submission status when asked">{data.status_at_ask ?? "Not set"}</Meta>
            {data.team_name && <Meta label="Team">{data.team_name}</Meta>}
            <Meta label="Asked">
              {data.asked_at
                ? relative(data.asked_at)
                : data.ask_error
                  ? <Badge tone="warn" title={data.ask_error}>Mail not sent</Badge>
                  : "—"}
            </Meta>
            {data.task_url && (
              <a
                href={data.task_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
              >
                <ExternalLink className="size-3.5" />
                Open in SharePoint to update its submission status
              </a>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function outcomeTitle(row: FollowupOut): string {
  switch (row.status) {
    case "answered":
      return `${row.assignee_name ?? "They"} gave a reason`;
    case "false_positive":
      return "Marked as a false positive";
    case "resolved":
      return "Closed without an answer";
    default:
      return "Waiting for an answer";
  }
}
