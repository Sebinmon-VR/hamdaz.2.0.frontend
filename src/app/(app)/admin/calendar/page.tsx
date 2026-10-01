"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarDays, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";
import { uaeTime } from "@/components/bcd/BcdBits";

/**
 * The task calendar: each open task's BCD as an event in its holder's Outlook
 * calendar, shown as free, with Outlook's reminder ahead of it. It writes into
 * people's calendars, so it is a super admin's switch — and a trial narrows it
 * to named people and a title word first.
 */
interface CalendarSettings {
  enabled: boolean;
  reminder_minutes: number;
  only_emails: string[];
  only_title_contains: string;
  last_run_at: string | null;
  last_error: string | null;
  team_name: string | null;
}

interface SyncReport {
  ran: boolean;
  tasks_read: number;
  created: number;
  updated: number;
  moved: number;
  removed: number;
  skipped_placeholder: number;
  errors: string[];
}

interface CalendarEvent {
  id: string;
  task_id: string;
  task_title: string;
  user_name: string | null;
  bcd_at: string;
  reminder_minutes: number;
  synced_at: string | null;
  last_error: string | null;
}

const KEY = "/task-calendar/settings";

export default function TaskCalendarPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return <Empty icon={ShieldCheck} title="Super admins only" body="The task calendar writes into people's calendars." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Task calendar"
        lead="Each open task's bid closing time, in its holder's Outlook calendar, with a reminder ahead of it."
      />
      <SettingsCard />
      <Events />
    </div>
  );
}

function SettingsCard() {
  const { data, error, mutate } = useSWR<CalendarSettings>(KEY, { revalidateOnFocus: false });
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState("2");
  const [emails, setEmails] = useState<string[]>([]);
  const [word, setWord] = useState("");
  const [saved, setSaved] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setDays(String(data.reminder_minutes / 1440));
    setEmails(data.only_emails);
    setWord(data.only_title_contains);
  }, [data]);
  const save = useAction(async () => {
    setSaved(false);
    await mutate(
      await api.patch<CalendarSettings>(KEY, {
        enabled,
        reminder_minutes: Math.round(Number(days) * 1440),
        only_emails: emails,
        only_title_contains: word,
      }),
      { revalidate: false },
    );
    setSaved(true);
  });
  const sync = useAction(async () => {
    setReport(await api.post<SyncReport>("/task-calendar/sync"));
    await mutate();
    await globalThis.dispatchEvent?.(new Event("task-calendar-synced"));
  });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={4} />;
  const trial = emails.length > 0 || word.trim() !== "";
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight">
            Settings {data.enabled ? <Badge tone="positive">On</Badge> : <Badge tone="danger">Off</Badge>}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-4">
            The people are the{" "}
            <Link href="/admin/followups" className="underline">
              follow-up&apos;s team
            </Link>
            {data.team_name ? ` (${data.team_name})` : ""}. Tasks whose BCD is still the assignment
            time get no event until it is set.
          </p>
        </div>
        <Button icon={RefreshCw} loading={sync.pending} onClick={() => void sync.run()}>
          Sync Now
        </Button>
        <Button variant="accent" icon={Save} loading={save.pending} onClick={() => void save.run()}>
          Save
        </Button>
      </div>
      {save.error && <InlineNotice tone="danger" className="mt-3">{save.error}</InlineNotice>}
      {saved && !save.error && <InlineNotice tone="positive" className="mt-3">Saved.</InlineNotice>}
      {sync.error && <InlineNotice tone="danger" className="mt-3">{sync.error}</InlineNotice>}
      {report && (
        <InlineNotice tone="info" className="mt-3">
          Read {report.tasks_read} tasks: {report.created} added, {report.updated} moved in time,{" "}
          {report.moved} moved to a new holder, {report.removed} removed, {report.skipped_placeholder} waiting
          for a real BCD.
          {report.errors.length > 0 && ` Problems: ${report.errors.join("; ")}`}
        </InlineNotice>
      )}
      {!trial && enabled && (
        <InlineNotice tone="warn" className="mt-3">
          No trial filter: every person in the team gets their tasks in their calendar.
        </InlineNotice>
      )}
      <div className="mt-5 space-y-4">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Keep the calendars in step"
          hint="On: every ten minutes. Off: nothing is written; Sync Now still works."
        />
        <Field label="Outlook reminder, days before the BCD">
          <Input value={days} inputMode="decimal" onChange={(e) => setDays(e.target.value)} className="max-w-40" />
        </Field>
        <Field label="Only these people, for a trial (empty: the whole team)">
          <RecipientList addresses={emails} onChange={setEmails} />
        </Field>
        <Field label="Only tasks whose title contains, for a trial">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="test" />
        </Field>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-4">
        {data.last_run_at ? `Last synced ${relative(data.last_run_at)}.` : "Not synced yet."}
        {data.last_error ? ` Last problem: ${data.last_error}` : ""}
      </p>
    </Panel>
  );
}

function Events() {
  const { data, error, mutate } = useSWR<CalendarEvent[]>("/task-calendar/events", { revalidateOnFocus: true });
  useEffect(() => {
    const again = () => void mutate();
    globalThis.addEventListener?.("task-calendar-synced", again);
    return () => globalThis.removeEventListener?.("task-calendar-synced", again);
  }, [mutate]);
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;
  return (
    <Panel className="p-5">
      <PanelHead title={`Events in calendars (${data.length})`} hint="Soonest BCD first." />
      {data.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-4">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <CalendarDays className="size-4 shrink-0 text-ink-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{e.task_title}</p>
                <p className="truncate text-[12px] text-ink-4">
                  {e.user_name ?? "—"} · BCD {uaeTime(e.bcd_at)} · reminder {e.reminder_minutes / 1440} day
                  {e.reminder_minutes === 1440 ? "" : "s"} before
                </p>
              </div>
              {e.last_error && (
                <Badge tone="danger" title={e.last_error}>
                  Problem
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
