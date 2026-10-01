"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarClock, FlaskConical, PenLine, Play, Save, ShieldCheck, Users } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { MyTasksOut, ReminderOut, ReminderRunOut, ReminderSettingsOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";
import { uaeDateTime } from "@/components/followups/FollowupBits";
import { ReminderStatusBadge, writeState } from "@/components/reminders/ReminderBits";

/**
 * The status reminder's settings. Super admins only — the backend refuses
 * every change here to anybody else as well.
 *
 * Who is watched, whose mailbox reminds and the testing address are the
 * overdue follow-up's settings; this page narrows them for a trial, sets the
 * time, and holds the one switch that lets answers reach SharePoint.
 */
const KEY = "/reminders/settings";

export default function ReminderSettingsPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldCheck}
        title="Super admins only"
        body="The status reminder's settings are kept to super admins."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Status reminders"
        lead="Before a task is due, ask its holder where it stands — and let them update it."
        actions={<LinkButton href="/reminders">Open status reminders</LinkButton>}
      />
      <Summary />
      <TimingCard />
      <WriteCard />
      <TrialCard />
      <TryCard />
      <Recent />
    </div>
  );
}

function useSettings() {
  return useSWR<ReminderSettingsOut>(KEY, { revalidateOnFocus: false });
}

function useSave() {
  const { mutate } = useSettings();
  const [saved, setSaved] = useState(false);
  const action = useAction(async (changes: Partial<ReminderSettingsOut>) => {
    setSaved(false);
    await mutate(await api.patch<ReminderSettingsOut>(KEY, changes), { revalidate: false });
    setSaved(true);
  });
  return { ...action, saved };
}

function Card({
  icon: Icon,
  title,
  lead,
  children,
  onSave,
  save,
}: {
  icon: typeof Users;
  title: string;
  lead: string;
  children: ReactNode;
  onSave?: () => void;
  save?: ReturnType<typeof useSave>;
}) {
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
          <Icon className="size-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-4">{lead}</p>
        </div>
        {onSave && (
          <Button variant="accent" icon={Save} loading={save?.pending} onClick={onSave}>
            Save
          </Button>
        )}
      </div>
      {save?.error && (
        <InlineNotice tone="danger" className="mt-4">
          {save.error}
        </InlineNotice>
      )}
      {save?.saved && !save.error && (
        <InlineNotice tone="positive" className="mt-4">
          Saved.
        </InlineNotice>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </Panel>
  );
}

/* ── at a glance ─────────────────────────────────────────────────────── */

function Summary() {
  const { data, error, mutate } = useSettings();
  const [report, setReport] = useState<ReminderRunOut | null>(null);
  const run = useAction(async () => {
    setReport(await api.post<ReminderRunOut>("/reminders/run"));
    await mutate();
  });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;
  const zone = data.timezone === "Asia/Dubai" ? "UAE time" : data.timezone === "Asia/Kolkata" ? "India time" : data.timezone;
  const facts: [string, ReactNode][] = [
    ["Reminders", data.enabled ? <Badge tone="positive">On</Badge> : <Badge tone="danger">Off</Badge>],
    ["Writes to SharePoint", data.write_sharepoint ? <Badge tone="positive">On</Badge> : <Badge tone="warn">Off — kept here only</Badge>],
    ["Team", data.team_name ?? "Nobody (set it in the follow-up settings)"],
    ["Sent", `Once a day at ${data.ask_time} ${zone ?? ""}`],
    ["Reminds about", `Tasks due within ${data.days_before} day${data.days_before === 1 ? "" : "s"}`],
    ["Emails go to", data.test_mail_to ? `${data.test_mail_to} only (testing)` : "The real people"],
  ];
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[16px] font-semibold tracking-tight">At a glance</h2>
        <Button icon={Play} loading={run.pending} onClick={() => void run.run()}>
          Run Now
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <dt className="w-40 shrink-0 text-ink-4">{label}</dt>
            <dd className="min-w-0 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {!data.test_mail_to && (data.only_emails.length === 0 && !data.only_title_contains) && (
        <InlineNotice tone="warn" className="mt-4">
          No trial filter and no testing address: Run Now reminds the whole team for real.
        </InlineNotice>
      )}
      {data.last_error && (
        <InlineNotice tone="warn" className="mt-3">
          The last run said: {data.last_error}
        </InlineNotice>
      )}
      {run.error && (
        <InlineNotice tone="danger" className="mt-3">
          {run.error}
        </InlineNotice>
      )}
      {report && (
        <InlineNotice tone="info" className="mt-3">
          Read {report.tasks_read} tasks for {report.people} {report.people === 1 ? "person" : "people"}:{" "}
          {report.asked} reminded, {report.closed} closed.
          {report.errors.length > 0 && ` Problems: ${report.errors.join("; ")}`}
        </InlineNotice>
      )}
      <p className="mt-3 text-[11.5px] text-ink-4">
        {data.last_run_at ? `Last run ${relative(data.last_run_at)}.` : "Not run yet."} Run Now
        reminds straight away and does not count as the day&apos;s run. The team, the sender and the
        testing address are the{" "}
        <Link href="/admin/followups" className="underline">
          follow-up settings
        </Link>
        &apos;.
      </p>
    </Panel>
  );
}

/* ── when ─────────────────────────────────────────────────────────────── */

function TimingCard() {
  const { data } = useSettings();
  const save = useSave();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("10:00");
  const [days, setDays] = useState("2");
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setTime(data.ask_time);
    setDays(String(data.days_before));
  }, [data]);
  if (!data) return null;
  return (
    <Card
      icon={CalendarClock}
      title="When to remind"
      lead="Once a day, each person gets one email listing their tasks due soon."
      save={save}
      onSave={() => void save.run({ enabled, ask_time: time, days_before: Number(days) })}
    >
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        label="Send reminders"
        hint="Off, nothing is sent; Run Now and Try it still work."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Time of day">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Days before the due date">
          <Input type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

/* ── the write ────────────────────────────────────────────────────────── */

function WriteCard() {
  const { data } = useSettings();
  const save = useSave();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (data) setOn(data.write_sharepoint);
  }, [data]);
  if (!data) return null;
  return (
    <Card
      icon={PenLine}
      title="Write answers to SharePoint"
      lead="Whether what people change on the form is written to the task on the Proposals list."
      save={save}
      onSave={() => void save.run({ write_sharepoint: on })}
    >
      <Toggle
        checked={on}
        onChange={setOn}
        label="Write to the Proposals list"
        hint="On: Status, Submission Status, Remarks and Working notes are updated on the task — only the ones the person changed. Off: the answer is kept here, showing what it would have written."
      />
      {on && (
        <InlineNotice tone="warn">
          This changes the live Proposals list the team works from, and the change shows the app as
          its author. Try it on a task of your own first.
        </InlineNotice>
      )}
    </Card>
  );
}

/* ── a trial ──────────────────────────────────────────────────────────── */

function TrialCard() {
  const { data } = useSettings();
  const save = useSave();
  const [emails, setEmails] = useState<string[]>([]);
  const [word, setWord] = useState("");
  useEffect(() => {
    if (!data) return;
    setEmails(data.only_emails);
    setWord(data.only_title_contains);
  }, [data]);
  if (!data) return null;
  return (
    <Card
      icon={Users}
      title="Narrow it for a trial"
      lead={`Of the follow-up's team${data.team_name ? ` (${data.team_name})` : ""}, remind only these people, and only about these tasks.`}
      save={save}
      onSave={() => void save.run({ only_emails: emails, only_title_contains: word })}
    >
      <Field label="Only these people (empty: the whole team)">
        <RecipientList addresses={emails} onChange={setEmails} />
      </Field>
      <Field label="Only tasks whose title contains">
        <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="test" />
      </Field>
    </Card>
  );
}

/* ── try it on one of my tasks ────────────────────────────────────────── */

function TryCard() {
  const router = useRouter();
  const mine = useSWR<MyTasksOut>(withQuery("/proposals/my-tasks", { open_only: false, limit: 500 }), {
    revalidateOnFocus: false,
  });
  const [taskId, setTaskId] = useState("");
  const tasks = useMemo(
    () =>
      [...(mine.data?.tasks ?? [])].sort(
        (a, b) => Number(/test/i.test(b.title)) - Number(/test/i.test(a.title)),
      ),
    [mine.data],
  );
  useEffect(() => {
    if (!taskId && tasks.length && /test/i.test(tasks[0].title)) setTaskId(tasks[0].id);
  }, [taskId, tasks]);
  const go = useAction(async () => {
    const made = await api.post<ReminderOut>("/reminders/try", { task_id: taskId });
    router.push(`/reminders/${made.id}`);
  });
  return (
    <Panel className="p-5">
      <PanelHead
        title="Try it on one of my tasks"
        hint="Reminds you about the task now, from and to your own mailbox, whatever its due date."
      />
      {go.error && (
        <InlineNotice tone="danger" className="mt-3">
          {go.error}
        </InlineNotice>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Task" className="min-w-0 flex-1">
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">{mine.isLoading ? "Loading your tasks…" : "Choose one of your tasks"}</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.status ? ` — ${t.status}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="accent" icon={FlaskConical} loading={go.pending} disabled={!taskId} onClick={() => void go.run()}>
          Send Test
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-4">
        Answering it writes to the task only while &ldquo;Write to the Proposals list&rdquo; is on.
      </p>
    </Panel>
  );
}

/* ── the latest ───────────────────────────────────────────────────────── */

function Recent() {
  const { data, error, mutate } = useSWR<ReminderOut[]>("/reminders/recent", { revalidateOnFocus: false });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;
  return (
    <Panel className="p-5">
      <PanelHead title="Latest reminders" hint="Newest first, with what each answer did." />
      {data.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-4">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data.map((row) => {
            const state = writeState(row);
            return (
              <li key={row.id}>
                <Link href={`/reminders/${row.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{row.task_title}</p>
                    <p className="truncate text-[12px] text-ink-4">
                      {row.assignee_name ?? row.assignee_email} · due {uaeDateTime(row.due_at)}
                      {Object.keys(row.changes).length > 0 &&
                        ` · changed ${Object.keys(row.changes).join(", ")}`}
                    </p>
                  </div>
                  {state && (
                    <Badge tone={state.tone} title={state.title}>
                      {state.label}
                    </Badge>
                  )}
                  <ReminderStatusBadge status={row.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
