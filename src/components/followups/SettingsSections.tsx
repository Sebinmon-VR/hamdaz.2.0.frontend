"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { CalendarClock, FlaskConical, Mail, Play, Save, Users } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { FollowupSettingsOut, FollowupSweepOut, TeamOut } from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Toggle } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";

/**
 * The follow-up's settings, one concern to a card.
 *
 * Each card saves only its own fields, so changing when people are asked
 * never also re-sends who is watched. They share one read of the settings.
 */

const KEY = "/followups/settings";

export function useFollowupSettings() {
  return useSWR<FollowupSettingsOut>(KEY, { revalidateOnFocus: false });
}

/** "India time" for the report's zone, as the Reports card names it. */
function zoneName(zone: string): string {
  if (zone === "Asia/Kolkata") return "India time";
  if (zone === "Asia/Dubai") return "UAE time";
  return zone;
}

/** A card: a heading that says what it decides, its fields, and its Save. */
function Section({
  icon: Icon,
  title,
  lead,
  children,
  onSave,
  saving,
  error,
  saved,
}: {
  icon: typeof Users;
  title: string;
  lead: string;
  children: ReactNode;
  onSave?: () => void;
  saving?: boolean;
  error?: string | null;
  saved?: boolean;
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
          <Button variant="accent" icon={Save} loading={saving} onClick={onSave}>
            Save
          </Button>
        )}
      </div>
      {error && (
        <InlineNotice tone="danger" className="mt-4">
          {error}
        </InlineNotice>
      )}
      {saved && !error && (
        <InlineNotice tone="positive" className="mt-4">
          Saved.
        </InlineNotice>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </Panel>
  );
}

/** Saves a slice of the settings and shows "Saved" until the next edit. */
function useSave() {
  const { mutate } = useFollowupSettings();
  const [saved, setSaved] = useState(false);
  const action = useAction(async (changes: Partial<FollowupSettingsOut>) => {
    setSaved(false);
    const next = await api.patch<FollowupSettingsOut>(KEY, changes);
    await mutate(next, { revalidate: false });
    setSaved(true);
  });
  return { ...action, saved, clearSaved: () => setSaved(false) };
}

/* ── the summary at the top ──────────────────────────────────────────── */

export function StatusSummary() {
  const { data, error, mutate } = useFollowupSettings();
  const [sweep, setSweep] = useState<FollowupSweepOut | null>(null);
  const run = useAction(async () => {
    setSweep(await api.post<FollowupSweepOut>("/followups/run"));
    await mutate();
  });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={3} />;

  const zone = zoneName(data.digest_timezone);
  const facts: [string, ReactNode][] = [
    ["Follow-up", data.enabled ? <Badge tone="positive">On</Badge> : <Badge tone="danger">Off</Badge>],
    ["Team", data.team_name ?? "Nobody"],
    [
      "People are asked",
      data.ask_mode === "daily"
        ? `Once a day at ${data.ask_time} ${zone}`
        : `${data.grace_minutes} min after each due time`,
    ],
    [
      "Managers get",
      !data.notify_managers_by_email
        ? "In-app notices only"
        : data.ask_mode === "daily"
          ? `One report per person at ${data.digest_time} ${zone}`
          : "Each reason as it is given",
    ],
    ["End-of-day report", data.digest_enabled ? `${data.digest_time} ${zone}` : "Off"],
    ["Emails go to", data.test_mail_to ? `${data.test_mail_to} only (testing)` : "The real people"],
  ];
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[16px] font-semibold tracking-tight">At a glance</h2>
        <Button icon={Play} loading={run.pending} onClick={() => void run.run()}>
          Run Check Now
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <dt className="w-36 shrink-0 text-ink-4">{label}</dt>
            <dd className="min-w-0 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {data.test_mail_to && (
        <InlineNotice tone="warn" className="mt-4">
          Testing: every follow-up email is sent from and to {data.test_mail_to}, not the real
          people. Clear it under Emails &amp; testing when the trial is done.
        </InlineNotice>
      )}
      {data.last_error && (
        <InlineNotice tone="warn" className="mt-3">
          The last check said: {data.last_error}
        </InlineNotice>
      )}
      {run.error && (
        <InlineNotice tone="danger" className="mt-3">
          {run.error}
        </InlineNotice>
      )}
      {sweep && (
        <InlineNotice tone="info" className="mt-3">
          Checked {sweep.tasks_read} tasks for {sweep.people}{" "}
          {sweep.people === 1 ? "person" : "people"}: {sweep.asked} asked, {sweep.resolved} closed.
          {sweep.errors.length > 0 && ` Problems: ${sweep.errors.join("; ")}`}
        </InlineNotice>
      )}
      <p className="mt-3 text-[11.5px] text-ink-4">
        {data.last_run_at ? `Last checked ${relative(data.last_run_at)}.` : "Not checked yet."}{" "}
        {data.ask_mode === "daily" &&
          "Run Check Now asks straight away and does not count as the day's batch."}
      </p>
    </Panel>
  );
}

/* ── who is watched ──────────────────────────────────────────────────── */

export function WatchSection() {
  const { data } = useFollowupSettings();
  const allTeams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });
  const teams = useMemo(() => (allTeams.data ?? []).filter((t) => !t.archived_at), [allTeams.data]);
  const [enabled, setEnabled] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [titleWord, setTitleWord] = useState("");
  const save = useSave();

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setTeamId(data.team_id ?? "");
    setEmails(data.only_emails);
    setTitleWord(data.only_title_contains);
  }, [data]);

  if (!data) return <PanelSkeleton lines={4} />;
  return (
    <Section
      icon={Users}
      title="Who is watched"
      lead="Whose overdue tasks are followed up. Narrow it to a few people or test tasks while trying it out."
      saving={save.pending}
      error={save.error}
      saved={save.saved}
      onSave={() =>
        void save.run({
          enabled,
          team_id: teamId || null,
          only_emails: emails,
          only_title_contains: titleWord,
        })
      }
    >
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        label="Follow up overdue tasks"
        hint={
          data.watch_from
            ? `On since ${dateTime(data.watch_from)} — nothing due earlier is asked about.`
            : "Switching it on starts from that moment. Nothing already overdue is asked about."
        }
      />
      <Field label="Team" hint="Its members' tasks are watched, and its managers get the reasons.">
        <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Nobody</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Only these people" hint="Empty means the whole team.">
          <RecipientList addresses={emails} onChange={setEmails} />
        </Field>
        <Field label="Only titles containing" hint="Empty means every task.">
          <Input value={titleWord} onChange={(e) => setTitleWord(e.target.value)} placeholder="e.g. test" />
        </Field>
      </div>
    </Section>
  );
}

/* ── when to ask ─────────────────────────────────────────────────────── */

export function TimingSection() {
  const { data } = useFollowupSettings();
  const [askMode, setAskMode] = useState<"after_due" | "daily">("daily");
  const [askTime, setAskTime] = useState("16:00");
  const [grace, setGrace] = useState("20");
  const save = useSave();

  useEffect(() => {
    if (!data) return;
    setAskMode(data.ask_mode === "daily" ? "daily" : "after_due");
    setAskTime(data.ask_time);
    setGrace(String(data.grace_minutes));
  }, [data]);

  if (!data) return <PanelSkeleton lines={3} />;
  const zone = zoneName(data.digest_timezone);
  return (
    <Section
      icon={CalendarClock}
      title="When to ask"
      lead="When people are emailed for the reason a task went past its due time."
      saving={save.pending}
      error={save.error}
      saved={save.saved}
      onSave={() =>
        void save.run(
          askMode === "daily"
            ? { ask_mode: askMode, ask_time: askTime }
            : { ask_mode: askMode, grace_minutes: Number(grace) || 0 },
        )
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Choice
          selected={askMode === "daily"}
          onSelect={() => setAskMode("daily")}
          title="Once a day, at a set time"
          body="Each person gets one email listing everything overdue by then. Tasks due later that day are asked the next day, in a separate “carried over” list."
        />
        <Choice
          selected={askMode === "after_due"}
          onSelect={() => setAskMode("after_due")}
          title="After each task's due time"
          body="One email per task, a few minutes after it falls due."
        />
      </div>
      {askMode === "daily" ? (
        <Field
          label={`Ask at (${zone})`}
          hint={`Must be before the end-of-day report at ${data.digest_time}, so people can answer first.`}
        >
          <Input type="time" value={askTime} onChange={(e) => setAskTime(e.target.value)} />
        </Field>
      ) : (
        <Field label="Minutes after the due time">
          <Input value={grace} inputMode="numeric" onChange={(e) => setGrace(e.target.value)} />
        </Field>
      )}
    </Section>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={
        selected
          ? "rounded-[16px] border-2 border-accent bg-accent-soft p-4 text-left"
          : "rounded-[16px] border-2 border-line p-4 text-left transition hover:border-line-strong"
      }
    >
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mt-1 text-[12.5px] text-ink-3">{body}</p>
    </button>
  );
}

/* ── emails & testing ────────────────────────────────────────────────── */

export function EmailSection() {
  const { data } = useFollowupSettings();
  const [managersByEmail, setManagersByEmail] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMailTo, setTestMailTo] = useState("");
  const save = useSave();

  useEffect(() => {
    if (!data) return;
    setManagersByEmail(data.notify_managers_by_email);
    setTesting(!!data.test_mail_to);
    setTestMailTo(data.test_mail_to ?? "");
  }, [data]);

  if (!data) return <PanelSkeleton lines={3} />;
  const zone = zoneName(data.digest_timezone);
  return (
    <Section
      icon={Mail}
      title="Emails & testing"
      lead="What the managers receive, and where every follow-up email goes while it is being tried out."
      saving={save.pending}
      error={save.error}
      saved={save.saved}
      onSave={() => {
        const address = testing ? testMailTo.trim() || null : null;
        // Turning testing off is the moment real people start getting mail.
        if (
          data.test_mail_to &&
          !address &&
          !window.confirm(
            "Turn testing off? From now on the follow-up emails go to the real people — the asks to each person and the reports to their managers.",
          )
        )
          return;
        void save.run({ notify_managers_by_email: managersByEmail, test_mail_to: address });
      }}
    >
      <Toggle
        checked={managersByEmail}
        onChange={setManagersByEmail}
        label="Email the reasons to the team's managers"
        hint={
          data.ask_mode === "daily"
            ? `At ${data.digest_time} ${zone}, one report per person: every task they were asked about that day, with the reasons given and the ones not answered. Off, managers are told in the app only.`
            : "As each reason is given. Off, managers are told in the app only."
        }
      />
      <div
        className={
          testing
            ? "rounded-[16px] border-2 border-dashed border-warn p-4"
            : "rounded-[16px] border-2 border-dashed border-line p-4"
        }
      >
        <div className="flex items-center gap-2">
          <FlaskConical className={testing ? "size-4 text-warn" : "size-4 text-ink-4"} strokeWidth={2.2} />
          <p className="text-[14px] font-semibold">Testing</p>
          {data.test_mail_to ? (
            <Badge tone="warn">On — emails go to {data.test_mail_to}</Badge>
          ) : (
            <Badge tone="positive">Off — emails go to the real people</Badge>
          )}
        </div>
        <div className="mt-3">
          <Toggle
            checked={testing}
            onChange={setTesting}
            label="Send every follow-up email to one address only"
            hint="On: the asks and the reports to managers are sent from and to the address below, marked with who they were meant for. Off: they go to the real people. Press Save after switching."
          />
        </div>
        {testing && (
          <Input
            className="mt-3"
            type="email"
            value={testMailTo}
            onChange={(e) => setTestMailTo(e.target.value)}
            placeholder="sebin@hamdaz.com"
          />
        )}
      </div>
    </Section>
  );
}
