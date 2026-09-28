"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlarmClock, FlaskConical, Play, Save } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  FollowupOut,
  FollowupSettingsOut,
  FollowupSweepOut,
  MyTasksOut,
  TeamOut,
} from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton, RowsSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";
import { FollowupStatusBadge, uaeDateTime } from "@/components/followups/FollowupBits";
import { DueToday } from "@/components/followups/DueToday";
import { DigestPanel } from "@/components/followups/DigestPanel";

/**
 * Tasks that went past their due date, and the reasons given.
 *
 * *Mine* is what everybody sees: the questions sent to them. *Team* appears
 * for the managers and leads of a team — the reasons their people gave, which
 * is who the reasons are for. The settings sit at the foot for a super admin,
 * because what is watched decides who gets mailed, and that is not a team's
 * call to make.
 */
export default function FollowupsPage() {
  const session = useSession();
  const overseen = session.teams.filter(
    (t) =>
      !t.team.archived_at &&
      (session.roles.is_admin ||
        t.role_keys.includes("team_manager") ||
        t.role_keys.includes("team_lead")),
  );
  const [view, setView] = useState<string>("mine");
  const teamSlug = view.startsWith("team:") ? view.slice(5) : null;

  const key = teamSlug ? withQuery("/followups/team", { team: teamSlug }) : "/followups/mine";
  const { data, error, isLoading, mutate } = useSWR<FollowupOut[]>(key, {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Proposals"
        title="Overdue tasks"
        lead="Tasks that went past their due date without the bid being submitted, and why."
      />

      {/* Today's dues with a live countdown: the team's for its managers and
          leads, the viewer's own for everybody else. Follows the team picked
          below; on "Sent to me" it is the watched team. */}
      <DueToday team={teamSlug} />

      {overseen.length > 0 && (
        <PillRail
          value={view}
          onChange={setView}
          options={[
            { value: "mine", label: "Sent to me" },
            ...overseen.map((t) => ({ value: `team:${t.team.slug}`, label: t.team.name })),
          ]}
        />
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : !data || data.length === 0 ? (
        <Empty
          icon={AlarmClock}
          title="Nothing overdue"
          body={
            teamSlug
              ? "Nobody in this team has been asked about a late task."
              : "You have not been asked about any late task."
          }
        />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={row.id}>
              <Link href={`/followups/${row.id}`}>
                <Panel className="flex flex-wrap items-center gap-3 p-3 transition hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{row.task_title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-4">
                      {[
                        teamSlug ? (row.assignee_name ?? row.assignee_email) : null,
                        `due ${uaeDateTime(row.due_at)}`,
                        row.status_at_ask ?? "not submitted",
                        row.reason ? `“${row.reason}”` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-[11.5px] text-ink-4">asked {relative(row.created_at)}</span>
                  <Badge
                    tone={row.asked_at ? "info" : "warn"}
                    title={row.asked_at ? `Emailed ${dateTime(row.asked_at)}` : (row.ask_error ?? "Not emailed")}
                  >
                    {row.asked_at ? "Mailed" : "Mail failed"}
                  </Badge>
                  {row.status === "answered" && (
                    <Badge
                      tone={row.forwarded_at ? "positive" : "warn"}
                      title={row.forwarded_at ? `Sent to the managers ${dateTime(row.forwarded_at)}` : (row.forward_error ?? "Not sent to the managers")}
                    >
                      {row.forwarded_at ? "Managers told" : "Managers not mailed"}
                    </Badge>
                  )}
                  <FollowupStatusBadge status={row.status} />
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {session.roles.is_super_admin && <TryPanel />}
      {session.roles.is_super_admin && <SettingsPanel />}
      {session.roles.is_super_admin && <DigestPanel />}
    </div>
  );
}

/* ── the settings, for a super admin ─────────────────────────────────── */

function SettingsPanel() {
  const { data, error, mutate } = useSWR<FollowupSettingsOut>("/followups/settings", {
    revalidateOnFocus: false,
  });
  // Every team, not just the admin's own — the one to watch need not be theirs.
  const allTeams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });
  const teams = useMemo(
    () => (allTeams.data ?? []).filter((t) => !t.archived_at),
    [allTeams.data],
  );

  const [enabled, setEnabled] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [titleWord, setTitleWord] = useState("");
  const [grace, setGrace] = useState("20");
  const [managersByEmail, setManagersByEmail] = useState(true);
  const [sweep, setSweep] = useState<FollowupSweepOut | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setTeamId(data.team_id ?? "");
    setEmails(data.only_emails);
    setTitleWord(data.only_title_contains);
    setGrace(String(data.grace_minutes));
    setManagersByEmail(data.notify_managers_by_email);
  }, [data]);

  const save = useAction(async () => {
    const next = await api.patch<FollowupSettingsOut>("/followups/settings", {
      enabled,
      team_id: teamId || null,
      only_emails: emails,
      only_title_contains: titleWord,
      grace_minutes: Number(grace) || 0,
      notify_managers_by_email: managersByEmail,
    });
    await mutate(next, { revalidate: false });
  });
  const run = useAction(async () => {
    setSweep(await api.post<FollowupSweepOut>("/followups/run"));
    await mutate();
  });

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={5} />;

  return (
    <Panel className="p-5">
      <PanelHead
        title="What is watched"
        hint="Super admin only. Decides whose tasks are followed up and who is mailed."
        action={
          <>
            <Button icon={Play} loading={run.pending} onClick={() => void run.run()}>
              Run Check
            </Button>
            <Button variant="accent" icon={Save} loading={save.pending} onClick={() => void save.run()}>
              Save
            </Button>
          </>
        }
      />
      {(save.error || run.error) && (
        <InlineNotice tone="danger" className="mt-3">
          {save.error ?? run.error}
        </InlineNotice>
      )}
      {data.last_error && (
        <InlineNotice tone="warn" className="mt-3">
          The last check said: {data.last_error}
        </InlineNotice>
      )}
      {sweep && (
        <InlineNotice tone="info" className="mt-3">
          Checked {sweep.tasks_read} tasks for {sweep.people}{" "}
          {sweep.people === 1 ? "person" : "people"}: {sweep.asked} asked, {sweep.resolved} closed.
          {sweep.errors.length > 0 && ` Problems: ${sweep.errors.join("; ")}`}
        </InlineNotice>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Follow up overdue tasks"
            hint={
              data.watch_from
                ? `Watching tasks due after ${dateTime(data.watch_from)}. Nothing due earlier is asked about.`
                : "Switching it on starts from that moment. Nothing already overdue is asked about."
            }
          />
          <Toggle
            checked={managersByEmail}
            onChange={setManagersByEmail}
            label="Email the reasons to the team's managers"
            hint="Off, they are told in the app only."
          />
          <Field label="Team" hint="Its members' tasks are watched; its managers get the reasons.">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Nobody</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="space-y-4">
          <Field label="Only these people" hint="Empty means the whole team. Use it to try this on one person first.">
            <RecipientList addresses={emails} onChange={setEmails} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Only titles containing" hint="Blank means every task.">
              <Input value={titleWord} onChange={(e) => setTitleWord(e.target.value)} placeholder="test" />
            </Field>
            <Field label="Ask after (minutes)" hint="After the due date and time.">
              <Input
                value={grace}
                inputMode="numeric"
                onChange={(e) => setGrace(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11.5px] text-ink-4">
        {data.last_run_at ? `Last checked ${relative(data.last_run_at)}.` : "Not checked yet."} The
        mail goes out from the person's own mailbox; the reason goes to the managers from theirs.
      </p>
    </Panel>
  );
}

/* ── trying it on one of your own tasks ──────────────────────────────── */

/**
 * The test path. Picks one of the super admin's own tasks and asks about it
 * now, without waiting for a due date to pass. The task is only read from
 * SharePoint — nothing there is created or changed — and it must be the
 * caller's own, so a test can only ever mail the person running it.
 */
function TryPanel() {
  const router = useRouter();
  const mine = useSWR<MyTasksOut>(withQuery("/proposals/my-tasks", { open_only: false, limit: 500 }), {
    revalidateOnFocus: false,
  });
  const [taskId, setTaskId] = useState("");
  const tasks = useMemo(
    () =>
      [...(mine.data?.tasks ?? [])].sort((a, b) =>
        Number(/test/i.test(b.title)) - Number(/test/i.test(a.title)),
      ),
    [mine.data],
  );

  // An old test task of the tester's own, chosen for them: the list puts
  // titles with "test" first, so this is "test 6" or its like.
  useEffect(() => {
    if (!taskId && tasks.length && /test/i.test(tasks[0].title)) setTaskId(tasks[0].id);
  }, [taskId, tasks]);

  const go = useAction(async () => {
    const made = await api.post<FollowupOut>("/followups/try", { task_id: taskId });
    router.push(`/followups/${made.id}`);
  });

  return (
    <Panel className="p-5">
      <PanelHead
        title="Try it on one of my tasks"
        hint="Asks you about the task now, without waiting for its due date. Nothing in SharePoint is changed."
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
        <Button
          variant="accent"
          icon={FlaskConical}
          loading={go.pending}
          disabled={!taskId}
          onClick={() => void go.run()}
        >
          Send Test
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-4">
        The email and the banner come to you. When you answer, the reason goes to the team&apos;s
        manager — switch off &ldquo;Email the reasons to the team&apos;s managers&rdquo; below to keep
        the test to yourself.
      </p>
    </Panel>
  );
}
