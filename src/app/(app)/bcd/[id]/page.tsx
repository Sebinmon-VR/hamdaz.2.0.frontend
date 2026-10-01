"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarCheck, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { BcdCheckOut, BcdFormOut } from "@/lib/types";
import { Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { BcdStatusBadge, uaeTime } from "@/components/bcd/BcdBits";

/**
 * Where the "Confirm the BCD" mail lands.
 *
 * Two ways out. Usually the BCD is wrong — it is the moment the task was
 * assigned — and is corrected in SharePoint, on the task's own edit form; this
 * page sees the change when it is opened again (or within five minutes). Now
 * and then the date shown is right, and one press says so.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function BcdCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const valid = UUID.test(id);
  const { data, error, isLoading, mutate } = useSWR<BcdFormOut>(valid ? `/bcd-checks/${id}` : null, {
    revalidateOnFocus: true,
  });
  // The mail's "The BCD Is Correct" lands here with ?confirm=1.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("confirm")) setAsked(true);
  }, []);

  const confirm = useAction(async () => {
    await api.post<BcdCheckOut>(`/bcd-checks/${id}/confirm`);
    await mutate();
  });

  const check = data?.check;
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/admin/bcd">BCD checks</Link>}
        title={check ? check.task_title : "BCD check"}
        actions={check ? <BcdStatusBadge status={check.status} /> : undefined}
      />
      {!valid ? (
        <Empty icon={CalendarCheck} title="This link is incomplete" body="It does not point at a BCD check." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading || !data || !check ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel className="p-5">
            {check.status === "pending" ? (
              <>
                <PanelHead
                  title="Is this task's BCD right?"
                  hint="It was set to the time the task was assigned."
                />
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                  The flow that creates tasks fills the BCD with the moment of assignment. Read the
                  real closing date from Ariba and set it on the task in SharePoint. Until it is
                  set, the reminders and follow-ups wait for this task.
                </p>
                {data.task_error && (
                  <InlineNotice tone="warn" className="mt-3">
                    {data.task_error}
                  </InlineNotice>
                )}
                {confirm.error && (
                  <InlineNotice tone="danger" className="mt-3">
                    {confirm.error}
                  </InlineNotice>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {check.edit_url && (
                    <a
                      href={check.edit_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-medium text-accent-ink"
                    >
                      <ExternalLink className="size-4" />
                      Correct the BCD in SharePoint
                    </a>
                  )}
                  {check.may_confirm && (
                    <Button
                      variant={asked ? "accent" : undefined}
                      icon={CheckCircle2}
                      loading={confirm.pending}
                      onClick={() => void confirm.run()}
                    >
                      The BCD Is Correct
                    </Button>
                  )}
                  <Button icon={RefreshCw} onClick={() => void mutate()}>
                    I&apos;ve Changed It — Check Again
                  </Button>
                </div>
              </>
            ) : (
              <>
                <PanelHead title="Done" hint={check.resolved_at ? relative(check.resolved_at) : undefined} />
                <p className="mt-2 text-[13px] leading-relaxed">{check.resolved_note}</p>
                <p className="mt-2 text-[12px] text-ink-4">
                  The reminders and follow-ups use this task&apos;s BCD from now on.
                </p>
              </>
            )}
          </Panel>

          <Panel className="space-y-3 p-5">
            <PanelHead title="The task" />
            <Meta label="Assigned to">{check.assignee_name ?? check.assignee_email}</Meta>
            <Meta label="Assigned">{uaeTime(check.task_created_at)}</Meta>
            <Meta label="BCD on the list now">
              {data.still_placeholder === false
                ? `${data.current_bcd ?? "—"} (a real date)`
                : data.still_placeholder
                  ? "Not changed yet"
                  : "—"}
            </Meta>
            <Meta label="Asked">{check.asked_at ? relative(check.asked_at) : "Waiting for working hours"}</Meta>
            {check.escalated_at && <Meta label="Sent to the managers">{relative(check.escalated_at)}</Meta>}
            {check.task_url && (
              <LinkButton href={check.task_url} icon={ExternalLink}>
                Open in SharePoint
              </LinkButton>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
