"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarClock, CheckCircle2, ExternalLink, Send } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { ReminderColumn, ReminderFields, ReminderFormOut, ReminderOut } from "@/lib/types";
import { Badge, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, LinkButton, Select, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";
import { COLUMN_LABEL, ReminderStatusBadge, writeState } from "@/components/reminders/ReminderBits";

/**
 * The form a person lands on from the "Status update needed" mail.
 *
 * It shows the task's four columns as the Proposals list has them *now* —
 * Status, Submission Status, Remarks, Working notes — every one editable, a
 * blank column as a blank box. What they change is written to the task when
 * writing is switched on, and kept here either way. Leaving everything as it
 * is and pressing Confirm is an answer too: "it is right as it stands".
 *
 * Their manager and lead read the same page, without the form.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY: Required<ReminderFields> = {
  status: "",
  submission_status: "",
  remarks: "",
  working_notes: "",
};

export default function ReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const valid = UUID.test(id);
  const { data, error, isLoading, mutate } = useSWR<ReminderFormOut>(
    valid ? `/reminders/${id}` : null,
    { revalidateOnFocus: false },
  );

  // What the list said when the form opened, and what the person makes of it.
  const seen = useMemo<Required<ReminderFields>>(
    () =>
      data?.task
        ? {
            status: data.task.status,
            submission_status: data.task.submission_status,
            remarks: data.task.remarks,
            working_notes: data.task.working_notes,
          }
        : EMPTY,
    [data?.task],
  );
  const [values, setValues] = useState<Required<ReminderFields>>(EMPTY);
  useEffect(() => setValues(seen), [seen]);
  const set = (key: keyof ReminderFields) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const changed = (Object.keys(EMPTY) as (keyof ReminderFields)[]).some(
    (k) => values[k].trim() !== seen[k].trim(),
  );

  const send = useAction(async () => {
    await api.post<ReminderOut>(`/reminders/${id}/answer`, { values, seen });
    await mutate();
  });

  const row = data?.reminder;
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/reminders">Status reminders</Link>}
        title={row ? row.task_title : "Status reminder"}
        actions={row ? <ReminderStatusBadge status={row.status} /> : undefined}
      />

      {!valid ? (
        <Empty
          icon={CalendarClock}
          title="This link is incomplete"
          body="It does not point at a reminder. Open your reminders to find the one you want."
          action={<LinkButton href="/reminders">Open Status Reminders</LinkButton>}
        />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading || !data || !row ? (
        <PanelSkeleton lines={8} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {row.may_answer ? (
              <Panel className="p-5">
                <PanelHead
                  title="Where does this task stand?"
                  hint={`Due ${uaeDateTime(row.due_at)}`}
                />
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                  This is the task as it is on the Proposals list now. Update anything that has
                  changed — the status, the submission status, the remarks or the working notes —
                  and press Update Status. If it is all right as it is, press Confirm.
                </p>
                {data.task_error || !data.task ? (
                  <InlineNotice tone="danger" className="mt-4">
                    {data.task_error ?? "The task could not be read."}{" "}
                    <button className="underline" onClick={() => void mutate()}>
                      Try again
                    </button>
                  </InlineNotice>
                ) : (
                  <>
                    <InlineNotice tone={data.task.writes_to_sharepoint ? "info" : "warn"} className="mt-4">
                      {data.task.writes_to_sharepoint
                        ? "What you change here is written to the task on the Proposals list."
                        : "Your answer is saved here. Writing it to the Proposals list is switched off for now, so the task itself is not changed."}
                    </InlineNotice>
                    {send.error && (
                      <InlineNotice tone="danger" className="mt-3">
                        {send.error}
                      </InlineNotice>
                    )}
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Status">
                        <Select value={values.status} onChange={(e) => set("status")(e.target.value)}>
                          {!seen.status && <option value="">Not set</option>}
                          {withCurrent(data.task.status_choices, seen.status).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Submission status">
                        <Select
                          value={values.submission_status}
                          onChange={(e) => set("submission_status")(e.target.value)}
                        >
                          {!seen.submission_status && <option value="">Not set</option>}
                          {withCurrent(data.task.submission_choices, seen.submission_status).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Remarks">
                        <Textarea
                          value={values.remarks}
                          onChange={(e) => set("remarks")(e.target.value)}
                          rows={5}
                        />
                      </Field>
                      <Field label="Working notes">
                        <Textarea
                          value={values.working_notes}
                          onChange={(e) => set("working_notes")(e.target.value)}
                          rows={5}
                        />
                      </Field>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      {changed && (
                        <Button onClick={() => setValues(seen)} disabled={send.pending}>
                          Undo Changes
                        </Button>
                      )}
                      <Button
                        variant="accent"
                        icon={changed ? Send : CheckCircle2}
                        loading={send.pending}
                        onClick={() => void send.run()}
                      >
                        {changed ? "Update Status" : "Confirm — No Change"}
                      </Button>
                    </div>
                  </>
                )}
              </Panel>
            ) : (
              <Outcome row={row} />
            )}
          </div>

          <Panel className="space-y-3 p-5">
            <PanelHead title="The task when reminded" />
            <Meta label="Held by">{row.assignee_name ?? row.assignee_email}</Meta>
            {row.end_user && <Meta label="End user">{row.end_user}</Meta>}
            <Meta label="Due">{uaeDateTime(row.due_at)}</Meta>
            <Meta label="Status">{row.status_at_ask ?? "Not set"}</Meta>
            <Meta label="Submission status">{row.submission_at_ask ?? "Not set"}</Meta>
            <Meta label="Reminded">
              {row.asked_at ? (
                relative(row.asked_at)
              ) : row.ask_error ? (
                <Badge tone="warn" title={row.ask_error}>
                  Mail not sent
                </Badge>
              ) : (
                "—"
              )}
            </Meta>
            {row.task_url && (
              <a
                href={row.task_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
              >
                <ExternalLink className="size-3.5" />
                Open in SharePoint
              </a>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

/** The list's choices, plus the task's current value if the list no longer has it. */
function withCurrent(choices: string[], current: string): string[] {
  return current && !choices.includes(current) ? [current, ...choices] : choices;
}

/** An answered or closed reminder, as anybody allowed to see it reads it. */
function Outcome({ row }: { row: ReminderOut }) {
  const state = writeState(row);
  const changes = Object.entries(row.changes) as [ReminderColumn, string][];
  return (
    <Panel className="p-5">
      <PanelHead
        title={
          row.status === "answered"
            ? `${row.assignee_name ?? "They"} updated the status`
            : row.status === "closed"
              ? "Closed without an answer"
              : "Waiting for an update"
        }
        hint={row.answered_at ? relative(row.answered_at) : undefined}
      />
      {state && (
        <div className="mt-3">
          <Badge tone={state.tone} title={state.title}>
            {state.label}
          </Badge>
        </div>
      )}
      {changes.length > 0 && (
        <dl className="mt-4 space-y-3">
          {changes.map(([column, value]) => (
            <div key={column}>
              <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-4">
                {COLUMN_LABEL[column] ?? column}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
                {value || <span className="text-ink-4">(cleared)</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {row.write_error && (
        <InlineNotice tone="danger" className="mt-4">
          SharePoint refused the update: {row.write_error}
        </InlineNotice>
      )}
      {row.closed_note && <p className="mt-3 text-[12.5px] text-ink-3">{row.closed_note}</p>}
      {row.status === "pending" && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Waiting for {row.assignee_name ?? row.assignee_email} to answer.
        </p>
      )}
    </Panel>
  );
}
