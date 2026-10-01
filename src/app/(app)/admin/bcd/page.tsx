"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarCheck, FlaskConical, Play, Save, ShieldCheck } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { BcdCheckOut, BcdRunOut, BcdSettingsOut, MyTasksOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";
import { BcdStatusBadge, uaeTime } from "@/components/bcd/BcdBits";

/**
 * The BCD check's settings, its open checks, and a way to try it.
 *
 * A new task's BCD is the time it was assigned until somebody reads the real
 * one from Ariba. While this is on, such a task is held — no reminders, no
 * "why is it late" — and its assignee is asked, the team lead copied; two
 * working hours later, the managers, approvers and super admins. Super admins
 * only; the backend refuses everyone else too.
 */
const KEY = "/bcd-checks/settings";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function BcdSettingsPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return <Empty icon={ShieldCheck} title="Super admins only" body="The BCD check's settings are kept to super admins." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="BCD checks"
        lead="Hold a new task until its real bid closing date is set, and ask for it."
      />
      <Summary />
      <SettingsCard />
      <TryCard />
      <Checks />
    </div>
  );
}

function useSettings() {
  return useSWR<BcdSettingsOut>(KEY, { revalidateOnFocus: false });
}

function Summary() {
  const { data, error, mutate } = useSettings();
  const [report, setReport] = useState<BcdRunOut | null>(null);
  const run = useAction(async () => {
    setReport(await api.post<BcdRunOut>("/bcd-checks/run"));
    await mutate();
  });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;
  const facts: [string, React.ReactNode][] = [
    ["BCD check", data.enabled ? <Badge tone="positive">On</Badge> : <Badge tone="danger">Off</Badge>],
    ["Team", data.team_name ?? "Nobody (set it in the follow-up settings)"],
    ["Working hours", `${data.work_start}–${data.work_end} ${data.timezone === "Asia/Kolkata" ? "India time" : data.timezone}, ${data.work_days.map((d) => DAYS[d]).join(" ")}`],
    ["Asks", "The assignee, team lead in CC"],
    ["CC on every task", data.team_leads.join(", ") || "No team lead"],
    [`After ${data.escalate_after_minutes / 60} working h`, data.escalate_to.join(", ") || "Nobody"],
  ];
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[16px] font-semibold tracking-tight">At a glance</h2>
        <Button icon={Play} loading={run.pending} onClick={() => void run.run()}>
          Run Now
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <dt className="w-40 shrink-0 text-ink-4">{label}</dt>
            <dd className="min-w-0 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {!data.enabled && (
        <InlineNotice tone="info" className="mt-4">
          Off: nobody is asked and nothing is held. Switched on, only tasks created from then on
          are checked — the backlog is left alone.
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
          Read {report.tasks_read} tasks: {report.found} new placeholder{report.found === 1 ? "" : "s"},{" "}
          {report.asked} asked, {report.escalated} escalated, {report.resolved} resolved.
          {report.errors.length > 0 && ` Problems: ${report.errors.join("; ")}`}
        </InlineNotice>
      )}
      <p className="mt-3 text-[11.5px] text-ink-4">
        {data.last_run_at ? `Last run ${relative(data.last_run_at)}.` : "Not run yet."} Run Now runs
        straight away, outside working hours too. The team is the{" "}
        <Link href="/admin/followups" className="underline">
          follow-up&apos;s
        </Link>
        .
      </p>
    </Panel>
  );
}

function SettingsCard() {
  const { data, mutate } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("18:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [hours, setHours] = useState("2");
  const [emails, setEmails] = useState<string[]>([]);
  const [word, setWord] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setStart(data.work_start);
    setEnd(data.work_end);
    setDays(data.work_days);
    setHours(String(data.escalate_after_minutes / 60));
    setEmails(data.only_emails);
    setWord(data.only_title_contains);
  }, [data]);
  const save = useAction(async () => {
    setSaved(false);
    const next = await api.patch<BcdSettingsOut>(KEY, {
      enabled,
      work_start: start,
      work_end: end,
      work_days: days,
      escalate_after_minutes: Math.round(Number(hours) * 60),
      only_emails: emails,
      only_title_contains: word,
    });
    await mutate(next, { revalidate: false });
    setSaved(true);
  });
  if (!data) return null;
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight">Settings</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-4">Working hours are India time.</p>
        </div>
        <Button variant="accent" icon={Save} loading={save.pending} onClick={() => void save.run()}>
          Save
        </Button>
      </div>
      {save.error && <InlineNotice tone="danger" className="mt-3">{save.error}</InlineNotice>}
      {saved && !save.error && <InlineNotice tone="positive" className="mt-3">Saved.</InlineNotice>}
      <div className="mt-5 space-y-4">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Check new tasks' BCDs"
          hint="On: tasks created from now with a placeholder BCD are held and asked about. Off: nothing is held."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Working day starts">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Working day ends">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="To the managers after (working hours)">
            <Input value={hours} inputMode="decimal" onChange={(e) => setHours(e.target.value)} />
          </Field>
        </div>
        <Field label="Working days">
          <div className="flex flex-wrap gap-3">
            {DAYS.map((name, index) => (
              <label key={name} className="flex items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={days.includes(index)}
                  onChange={(e) =>
                    setDays((was) => (e.target.checked ? [...was, index].sort() : was.filter((d) => d !== index)))
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Only these people, for a trial (empty: the whole team)">
          <RecipientList addresses={emails} onChange={setEmails} />
        </Field>
        <Field label="Only tasks whose title contains, for a trial">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="test" />
        </Field>
      </div>
    </Panel>
  );
}

function TryCard() {
  const router = useRouter();
  const mine = useSWR<MyTasksOut>(withQuery("/proposals/my-tasks", { open_only: false, limit: 500 }), {
    revalidateOnFocus: false,
  });
  const [taskId, setTaskId] = useState("");
  const tasks = useMemo(
    () => [...(mine.data?.tasks ?? [])].sort((a, b) => Number(/test/i.test(b.title)) - Number(/test/i.test(a.title))),
    [mine.data],
  );
  useEffect(() => {
    if (!taskId && tasks.length && /test/i.test(tasks[0].title)) setTaskId(tasks[0].id);
  }, [taskId, tasks]);
  const go = useAction(async () => {
    const made = await api.post<BcdCheckOut>("/bcd-checks/try", { task_id: taskId });
    router.push(`/bcd/${made.id}`);
  });
  return (
    <Panel className="p-5">
      <PanelHead
        title="Try it on one of my tasks"
        hint="Asks you about the task's BCD now, from and to your own mailbox — the team lead is not copied."
      />
      {go.error && <InlineNotice tone="danger" className="mt-3">{go.error}</InlineNotice>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Task" className="min-w-0 flex-1">
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">{mine.isLoading ? "Loading your tasks…" : "Choose one of your tasks"}</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="accent" icon={FlaskConical} loading={go.pending} disabled={!taskId} onClick={() => void go.run()}>
          Send Test
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-4">
        The escalation follows on Run Now once the working time set above has passed — to you only.
      </p>
    </Panel>
  );
}

function Checks() {
  const { data, error, mutate } = useSWR<BcdCheckOut[]>("/bcd-checks", { revalidateOnFocus: false });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;
  const open = data.filter((c) => c.status === "pending").length;
  return (
    <Panel className="p-5">
      <PanelHead title={`BCDs to confirm (${open})`} hint="Open first, then the latest closed." />
      {data.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-4">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/bcd/${c.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <CalendarCheck className="size-4 shrink-0 text-ink-4" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{c.task_title}</p>
                  <p className="truncate text-[12px] text-ink-4">
                    {c.assignee_name ?? c.assignee_email} · assigned {uaeTime(c.task_created_at)}
                    {c.escalated_at ? " · sent to the managers" : c.asked_at ? " · asked" : " · waiting for working hours"}
                  </p>
                </div>
                <BcdStatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
