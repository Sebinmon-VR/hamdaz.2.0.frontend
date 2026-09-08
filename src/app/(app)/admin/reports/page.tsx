"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Check,
  Mail,
  MailX,
  Save,
  Send,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateShort, dateTime, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  ReportDeliveryPage,
  ReportScheduleIn,
  ReportScheduleOut,
  ReportSettingsIn,
  ReportSettingsOut,
  ReportTemplateChoiceOut,
  RoleOut,
  TeamOut,
} from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  PanelHead,
  Row,
  RowHead,
} from "@/components/ui/primitives";
import {
  Button,
  ChipPicker,
  Field,
  Input,
  PillRail,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { CADENCE_LABELS } from "@/components/reports/ReportBits";
import { RecipientList } from "@/components/reports/RecipientList";

/**
 * Reports administration: who they go to, what each team files, and what was sent.
 *
 * **The distinction this whole screen turns on: delivery is not visibility.**
 * Nothing here widens or narrows who may *read* a report — that is decided per
 * report by whether somebody is its author, runs its team, or runs the company,
 * and it is not configurable. What is configurable is who gets a message about
 * it. An address added below is mailed a summary, and the link in that mail
 * refuses them exactly as it would anybody else. Said on the screen too, because
 * an administrator who believed otherwise would use this to try to grant access
 * and would quietly fail.
 *
 * Super admin only, and the endpoints enforce that themselves — the gate below
 * is there so the refusal reads as a sentence rather than three 403s.
 */
export default function ReportsAdminPage() {
  const session = useSession();
  const settings = useSWR<ReportSettingsOut>("/reports/admin/settings", {
    revalidateOnFocus: false,
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Reports" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Deciding what every team must report, and who is told when they do, is a narrower question than running a team — so it is limited to super admins, and the endpoints behind this screen enforce that themselves."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Reports"
        lead="Who a filed report is mailed to, what each team files, and what actually went out."
        meta={settings.data ? `saved ${dateTime(settings.data.updated_at)}` : undefined}
      />

      {settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.mutate()} />
      ) : !settings.data ? (
        <PanelSkeleton lines={8} />
      ) : (
        <Delivery settings={settings.data} onSaved={() => void settings.mutate()} />
      )}

      <Schedules />
      <DeliveryLog />
    </>
  );
}

/* ── who gets told ───────────────────────────────────────────────────── */

function Delivery({
  settings,
  onSaved,
}: {
  settings: ReportSettingsOut;
  onSaved: () => void;
}) {
  const roles = useSWR<RoleOut[]>("/roles?scope=global", { revalidateOnFocus: false });

  // Seeded once per server payload, so a revalidation cannot throw away what
  // somebody is in the middle of typing.
  const [draft, setDraft] = useState<ReportSettingsOut>(settings);
  const [seen, setSeen] = useState(settings.updated_at);
  const [saved, setSaved] = useState(false);

  if (seen !== settings.updated_at) {
    setSeen(settings.updated_at);
    setDraft(settings);
  }

  const set = <K extends keyof ReportSettingsOut>(key: K, value: ReportSettingsOut[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = useAction(async () => {
    const body: ReportSettingsIn = {
      notify_on_submit: draft.notify_on_submit,
      notify_team_oversight: draft.notify_team_oversight,
      notify_company_wide: draft.notify_company_wide,
      company_roles: draft.company_roles,
      extra_recipients: draft.extra_recipients,
      copy_author: draft.copy_author,
      notify_cadences: draft.notify_cadences,
      max_tasks_in_email: draft.max_tasks_in_email,
      include_task_list: draft.include_task_list,
      include_issue_list: draft.include_issue_list,
      log_retention_days: draft.log_retention_days,
    };
    await api.patch<ReportSettingsOut>("/reports/admin/settings", body);
    setSaved(true);
    onSaved();
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const silent = !draft.notify_on_submit;

  return (
    <>
      <InlineNotice tone="info">
        None of this decides who may <strong>read</strong> a report — that is settled per
        report by whether somebody wrote it, runs its team, or runs the company. These
        switches decide who is <strong>told</strong>. An address added here gets a summary
        by mail; the link in it refuses them like anybody else.
      </InlineNotice>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead
              title="When a report is filed"
              hint="Filing is what makes a report visible; this is what makes it arrive"
            />
            <div className="mt-5 space-y-5">
              <Toggle
                checked={draft.notify_on_submit}
                onChange={(value) => set("notify_on_submit", value)}
                label="Mail it to the people it goes to"
                hint="The master switch. Off, nothing is sent at all — reports still file, and are still read where they live."
              />

              {silent ? (
                <InlineNotice tone="warn">
                  Nothing is being mailed. Reports are still filed and still readable by the
                  people they go to; they simply have to come and look. Every skipped send is
                  recorded in the log below, so this is visible rather than mysterious.
                </InlineNotice>
              ) : (
                <>
                  <Toggle
                    checked={draft.notify_team_oversight}
                    onChange={(value) => set("notify_team_oversight", value)}
                    label="The team's managers and leads"
                    hint="The people the report is actually written for. Held per team, so this reaches the right handful rather than everybody with the word manager in their title."
                  />
                  <Toggle
                    checked={draft.notify_company_wide}
                    onChange={(value) => set("notify_company_wide", value)}
                    label="Everybody holding a company-wide role"
                    hint="Chosen below. This is the switch to reach for when the CEO asks to be taken off the dailies."
                  />

                  {draft.notify_company_wide && (
                    <div>
                      <p className="mb-1.5 text-[12px] text-ink-3">Which roles count</p>
                      <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-4">
                        Its own list, deliberately — the same three roles read every report by
                        default, and somebody who wants to keep the access and lose the mail
                        changes this and nothing else.
                      </p>
                      {roles.data ? (
                        <ChipPicker
                          options={roles.data.map((role) => ({
                            value: role.key,
                            label: role.name,
                          }))}
                          selected={draft.company_roles}
                          onToggle={(value) =>
                            set(
                              "company_roles",
                              draft.company_roles.includes(value)
                                ? draft.company_roles.filter((key) => key !== value)
                                : [...draft.company_roles, value],
                            )
                          }
                        />
                      ) : (
                        <p className="text-[12px] text-ink-4">Reading the roles…</p>
                      )}
                      {draft.company_roles.length === 0 && (
                        <p className="mt-2 text-[11.5px] text-warn">
                          No roles chosen, so this switch reaches nobody. Turn it off instead
                          — that says the same thing and says it on purpose.
                        </p>
                      )}
                    </div>
                  )}

                  <Toggle
                    checked={draft.copy_author}
                    onChange={(value) => set("copy_author", value)}
                    label="Copy the author"
                    hint="Off by default: nobody needs a copy of what they just wrote, and it is the fastest way to teach people these messages are noise."
                  />

                  <div>
                    <p className="mb-1.5 text-[12px] text-ink-3">Always copied</p>
                    <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-4">
                      For people who are not users here — a shared mailbox, an external
                      consultant. An entry without an @ is dropped on save rather than
                      refused, which is why they are added one at a time.
                    </p>
                    <RecipientList
                      addresses={draft.extra_recipients}
                      onChange={(next) => set("extra_recipients", next)}
                    />
                  </div>
                </>
              )}
            </div>
          </Panel>

          {!silent && (
            <Panel className="p-5">
              <PanelHead title="Which cadences" hint="The one setting most worth changing" />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">
                Weeklies and monthlies but not dailies is the common answer. A manager of six
                people otherwise gets thirty messages a week and reads none of them — and a
                report nobody reads is a report people stop writing.
              </p>
              <div className="mt-4">
                <ChipPicker
                  options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  selected={draft.notify_cadences}
                  onToggle={(value) =>
                    set(
                      "notify_cadences",
                      draft.notify_cadences.includes(value)
                        ? draft.notify_cadences.filter((key) => key !== value)
                        : [...draft.notify_cadences, value],
                    )
                  }
                />
              </div>
              {draft.notify_cadences.length === 0 && (
                <p className="mt-2.5 text-[11.5px] text-warn">
                  With none chosen nothing is mailed, which is what the master switch above
                  says in one place instead of four.
                </p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="What the message carries" hint="A summary, not the report" />
            <div className="mt-4 space-y-4">
              <Toggle
                checked={draft.include_task_list}
                onChange={(value) => set("include_task_list", value)}
                label="The task rows"
              />
              {draft.include_task_list && (
                <Field
                  label="At most this many tasks"
                  hint="0–100. Past a screenful it stops being a summary and becomes something nobody reads to the end of."
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.max_tasks_in_email}
                    onChange={(event) =>
                      set("max_tasks_in_email", Number(event.target.value))
                    }
                  />
                </Field>
              )}
              <Toggle
                checked={draft.include_issue_list}
                onChange={(value) => set("include_issue_list", value)}
                label="The issues"
                hint="The part a manager is meant to act on, which is the argument for keeping it even when the tasks are left out."
              />
            </div>
          </Panel>

          <Panel className="p-5">
            <PanelHead title="The log" hint="How far back the screen looks by default" />
            <Field
              className="mt-4"
              label="Days"
              hint="1–3650. Advisory only: nothing is deleted, this is the range the log below opens on."
            >
              <Input
                type="number"
                min={1}
                max={3650}
                value={draft.log_retention_days}
                onChange={(event) => set("log_retention_days", Number(event.target.value))}
              />
            </Field>
          </Panel>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-[20px] bg-panel px-5 py-3.5 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">
          {save.error ? (
            <span className="text-danger">{save.error}</span>
          ) : saved && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-positive">
              <Check className="size-3.5" strokeWidth={2.6} />
              Saved. It applies to the next report filed.
            </span>
          ) : dirty ? (
            "Unsaved changes."
          ) : (
            "Everything here is saved."
          )}
        </p>
        <Button
          variant="accent"
          icon={Save}
          loading={save.pending}
          disabled={!dirty}
          onClick={() => void save.run()}
        >
          Save
        </Button>
      </div>
    </>
  );
}

/* ── what each team files ────────────────────────────────────────────── */

/**
 * Which template a team's daily, weekly or monthly uses.
 *
 * This is what makes one team's report different from the next team's — the six
 * sections are the same everywhere, and the questions inside them come from
 * here. A team with no schedule for a cadence still files: it gets the default
 * template, so this is a refinement rather than a prerequisite.
 */
function Schedules() {
  const schedules = useSWR<ReportScheduleOut[]>("/reports/admin/schedules", {
    revalidateOnFocus: false,
  });
  const templates = useSWR<ReportTemplateChoiceOut[]>("/reports/admin/templates", {
    revalidateOnFocus: false,
  });
  const teams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });

  const [editing, setEditing] = useState<ReportScheduleOut | "new" | null>(null);

  return (
    <>
      <Panel className="py-2">
        <div className="px-5 pt-3">
          <PanelHead
            title="What each team files"
            count={schedules.data?.length}
            hint="The sections never change; the questions inside them come from the template"
            action={
              <Button size="sm" variant="accent" onClick={() => setEditing("new")}>
                Point a team at one
              </Button>
            }
          />
        </div>

        {schedules.error ? (
          <div className="p-5">
            <ErrorState error={schedules.error} onRetry={() => schedules.mutate()} />
          </div>
        ) : !schedules.data ? (
          <RowsSkeleton rows={4} />
        ) : schedules.data.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-ink-4">
            Nothing set, so every team files the default template. That is a working state,
            not a broken one.
          </p>
        ) : (
          <div className="mt-2">
            <RowHead>
              <span className="micro min-w-0 flex-1 text-ink-4">Team</span>
              <span className="micro w-24 shrink-0 text-ink-4">Cadence</span>
              <span className="micro hidden w-56 shrink-0 text-ink-4 md:block">Template</span>
              <span className="micro w-20 shrink-0 text-ink-4">Due</span>
              <span className="w-32 shrink-0" />
            </RowHead>
            {schedules.data.map((schedule) => (
              <Row
                key={schedule.id}
                onClick={() => setEditing(schedule)}
                className="cursor-pointer"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {schedule.team}
                </span>
                <span className="w-24 shrink-0 text-[12px] text-ink-3">
                  {CADENCE_LABELS[schedule.cadence] ?? schedule.cadence}
                </span>
                <span className="hidden w-56 shrink-0 truncate text-[12px] text-ink-3 md:block">
                  {schedule.template_name}
                </span>
                <span className="tnum w-20 shrink-0 text-[12px] text-ink-3">
                  {String(schedule.due_hour).padStart(2, "0")}:00
                </span>
                <span className="flex w-32 shrink-0 justify-end gap-1.5">
                  {schedule.extra_recipients.length > 0 && (
                    <Badge
                      tone="neutral"
                      title={schedule.extra_recipients.join(", ")}
                    >
                      +{schedule.extra_recipients.length}
                    </Badge>
                  )}
                  {schedule.notify === false ? (
                    <Badge tone="warn" icon={MailX} title="This team's reports of this cadence are not mailed.">
                      Silent
                    </Badge>
                  ) : schedule.notify === true ? (
                    <Badge tone="positive" icon={Mail} title="Mailed even where the global setting would not.">
                      Mailed
                    </Badge>
                  ) : null}
                  {!schedule.enabled && <Badge tone="neutral">Off</Badge>}
                </span>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <ScheduleEditor
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void schedules.mutate();
        }}
        templates={templates.data ?? []}
        teams={(teams.data ?? []).filter((team) => !team.archived_at)}
      />
    </>
  );
}

function ScheduleEditor({
  editing,
  onClose,
  onSaved,
  templates,
  teams,
}: {
  editing: ReportScheduleOut | "new" | null;
  onClose: () => void;
  onSaved: () => void;
  templates: ReportTemplateChoiceOut[];
  teams: TeamOut[];
}) {
  const existing = editing !== "new" && editing !== null ? editing : null;
  const [draft, setDraft] = useState<ReportScheduleIn | null>(null);
  const [seen, setSeen] = useState<string | null>(null);

  // Seeded when the dialog opens on a different row, rather than on every
  // render: re-seeding while somebody is typing is the bug this shape avoids.
  const key = editing === "new" ? "new" : (existing?.id ?? null);
  if (editing !== null && key !== seen) {
    setSeen(key);
    setDraft(
      existing
        ? {
            team_id: existing.team_id,
            cadence: existing.cadence as ReportScheduleIn["cadence"],
            template_id: existing.template_id,
            enabled: existing.enabled,
            due_hour: existing.due_hour,
            due_weekday: existing.due_weekday,
            note: existing.note,
            notify: existing.notify,
            extra_recipients: existing.extra_recipients,
          }
        : {
            team_id: teams[0]?.id ?? "",
            cadence: "weekly",
            template_id: templates[0]?.id ?? "",
            enabled: true,
            due_hour: 18,
            due_weekday: 4,
            notify: null,
            extra_recipients: [],
          },
    );
  }
  const save = useAction(async () => {
    if (!draft) return;
    await api.put<ReportScheduleOut>("/reports/admin/schedules", draft);
    onSaved();
  });

  const set = <K extends keyof ReportScheduleIn>(key: K, value: ReportScheduleIn[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Modal
      open={editing !== null && draft !== null}
      onClose={onClose}
      title={existing ? `${existing.team} · ${CADENCE_LABELS[existing.cadence]}` : "Point a team at a template"}
      description="The team and the cadence together name one schedule — setting the same pair again replaces it rather than adding a second."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            icon={Save}
            loading={save.pending}
            disabled={!draft?.team_id || !draft?.template_id}
            onClick={() => void save.run()}
          >
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4">
          {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Team">
              <Select
                value={draft.team_id}
                disabled={Boolean(existing)}
                onChange={(event) => set("team_id", event.target.value)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cadence">
              <Select
                value={draft.cadence}
                disabled={Boolean(existing)}
                onChange={(event) =>
                  set("cadence", event.target.value as ReportScheduleIn["cadence"])
                }
              >
                {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Template"
            hint="What this team is asked inside the six sections. A team with no schedule files the default."
          >
            <Select
              value={draft.template_id}
              onChange={(event) => set("template_id", event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} — {template.field_count}{" "}
                  {template.field_count === 1 ? "question" : "questions"} (v{template.version})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due by" hint="Hour of the day, 0–23.">
              <Input
                type="number"
                min={0}
                max={23}
                value={draft.due_hour ?? 18}
                onChange={(event) => set("due_hour", Number(event.target.value))}
              />
            </Field>
            {draft.cadence === "weekly" && (
              <Field label="Due on" hint="Only meaningful for a weekly.">
                <Select
                  value={String(draft.due_weekday ?? 4)}
                  onChange={(event) => set("due_weekday", Number(event.target.value))}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {/* Three states, and the middle one is the useful one. "Follow the
              global setting" is not the same as "yes": a team that has never
              expressed a preference should be reached when somebody turns
              dailies on later, and a team that said no should not. */}
          <Field
            label="Mail this team's reports of this cadence"
            hint="Following the setting is what you want unless this one team is different."
          >
            <PillRail
              value={draft.notify === null || draft.notify === undefined ? "inherit" : draft.notify ? "yes" : "no"}
              onChange={(value) =>
                set("notify", value === "inherit" ? null : value === "yes")
              }
              options={[
                { value: "inherit", label: "Follow the setting" },
                { value: "yes", label: "Always mail" },
                { value: "no", label: "Never mail" },
              ]}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-[12px] text-ink-3">Also copy, for this team only</p>
            <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-4">
              Added to whoever the settings already produce. This list narrows nothing — it
              cannot be used to take somebody off.
            </p>
            <RecipientList
              addresses={draft.extra_recipients ?? []}
              onChange={(next) => set("extra_recipients", next)}
            />
          </div>

          <Field label="Note" hint="For whoever reads this screen next.">
            <Textarea
              value={draft.note ?? ""}
              maxLength={2000}
              onChange={(event) => set("note", event.target.value || null)}
              className="min-h-16"
            />
          </Field>

          <Toggle
            checked={draft.enabled !== false}
            onChange={(value) => set("enabled", value)}
            label="This schedule is on"
            hint="Off leaves the row in place and stops it applying — the team falls back to the default template."
          />
        </div>
      )}
    </Modal>
  );
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/* ── what actually went out ──────────────────────────────────────────── */

/**
 * The delivery log.
 *
 * Its own thing rather than a column on each report, because the question it
 * answers is *across* reports: has anything failed to send this week, is the
 * CEO actually on these. A per-report summary cannot answer either.
 *
 * "Skipped" is the row worth understanding, and it is why the log is useful at
 * all: nothing was attempted, and the reason is recorded — the switch is off,
 * this cadence is not mailed, or there was nobody to send to. Without it, "why
 * did my manager not get Tuesday's" has only guesses for an answer.
 */
function DeliveryLog() {
  const [status, setStatus] = useState("all");
  const { data, error, isLoading, mutate } = useSWR<ReportDeliveryPage>(
    withQuery("/reports/admin/deliveries", {
      status: status === "all" ? undefined : status,
      limit: 100,
    }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const counts = data?.counts ?? {};

  return (
    <Panel className="py-2">
      <div className="px-5 pt-3">
        <PanelHead
          title="What was sent"
          count={data ? num(data.total) : undefined}
          hint="Newest first, over the window set above"
          action={
            <PillRail
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "sent", label: "Sent", count: counts.sent },
                { value: "failed", label: "Failed", count: counts.failed },
                { value: "skipped", label: "Skipped", count: counts.skipped },
              ]}
            />
          }
        />
      </div>

      {(counts.failed ?? 0) > 0 && (
        <div className="px-5 pt-4">
          <InlineNotice tone="danger">
            {num(counts.failed)} {counts.failed === 1 ? "message" : "messages"} failed to
            send in this window. A failure never stops a report being filed — what it means
            is that somebody who expects these has not had one.
          </InlineNotice>
        </div>
      )}

      {error ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => mutate()} />
        </div>
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : !data || data.deliveries.length === 0 ? (
        <p className="px-5 py-6 text-[12.5px] text-ink-4">
          Nothing in this window. If reports are being filed and nothing is here, the master
          switch above is off.
        </p>
      ) : (
        <div className="mt-2">
          <RowHead>
            <span className="w-16 shrink-0" />
            <span className="micro min-w-0 flex-1 text-ink-4">Report</span>
            <span className="micro hidden w-48 shrink-0 text-ink-4 md:block">Sent to</span>
            <span className="micro w-24 shrink-0 text-ink-4">When</span>
          </RowHead>
          {data.deliveries.map((delivery) => (
            <Row key={delivery.id}>
              <span className="w-16 shrink-0">
                {delivery.status === "sent" ? (
                  <Badge tone="positive" icon={Send}>
                    Sent
                  </Badge>
                ) : delivery.status === "failed" ? (
                  <Badge tone="danger" icon={TriangleAlert}>
                    Failed
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon={MailX}>
                    Skipped
                  </Badge>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                {delivery.team_name ?? "—"}
                {delivery.author_name && (
                  <span className="ml-2 text-[11.5px] text-ink-4">{delivery.author_name}</span>
                )}
                {delivery.cadence && (
                  <span className="ml-2 text-[11.5px] text-ink-4">
                    {CADENCE_LABELS[delivery.cadence] ?? humanise(delivery.cadence)}
                    {delivery.period_start ? ` · ${dateShort(delivery.period_start)}` : ""}
                  </span>
                )}
                {delivery.detail && (
                  <span className="ml-2 text-[11.5px] text-warn" title={delivery.detail}>
                    {delivery.detail}
                  </span>
                )}
              </span>
              <span
                className="hidden w-48 shrink-0 truncate text-[11.5px] text-ink-4 md:block"
                title={delivery.recipients.join(", ")}
              >
                {delivery.recipients.length === 0
                  ? "nobody"
                  : delivery.recipients.length === 1
                    ? delivery.recipients[0]
                    : `${delivery.recipients[0]} +${delivery.recipients.length - 1}`}
              </span>
              <span
                className="w-24 shrink-0 truncate text-[11.5px] text-ink-4"
                title={dateTime(delivery.created_at)}
              >
                {relative(delivery.created_at)}
              </span>
            </Row>
          ))}
        </div>
      )}

      {data && data.total > data.deliveries.length && (
        <p className="px-5 py-3 text-[11.5px] text-ink-4">
          Showing the newest {num(data.deliveries.length)} of {num(data.total)}.
        </p>
      )}
    </Panel>
  );
}
