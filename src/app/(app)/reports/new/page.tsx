"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import useSWR from "swr";
import { FolderKanban, NotebookPen, ShieldAlert, Sparkles } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  ReportCadence,
  ReportFormOut,
  ReportOut,
  ReportStartIn,
  TeamOut,
} from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { CADENCE_OPTIONS } from "@/components/reports/ReportBits";
import { ProgressBar, RagDot } from "@/components/projects/ProjectBits";

/**
 * Starting a report.
 *
 * The screen asks three questions — which team, how often, which period — and
 * then shows what is *about* to be asked before anything is created. That
 * preview is why `/reports/form` exists as its own endpoint rather than being
 * folded into the draft: a template can add half a dozen questions to a team's
 * weekly, and finding that out after committing to a draft is how people end up
 * with three empty reports for the same week.
 *
 * **What is asked depends on the team, and now on what the report is about.**
 * A team pointed at a project template is asked which project before anything
 * else, and then gets health dials and a milestone timeline in place of some
 * of the standard six sections. That needed no new mechanism here — the form
 * endpoint answers with a `scope` and, where it is `project`, the projects
 * this person may actually file on — but it is why the preview on the right
 * matters more than it used to: the shape of the form now changes with the
 * team, not only its questions.
 *
 * **The tasks are pulled in for you, and that is the feature.** The work is
 * already recorded in the Proposals list; retyping it is how a reporting tool
 * earns its reputation. What the backend pulls is strictly the caller's own —
 * there is no parameter that puts somebody else's work on your report — and if
 * SharePoint cannot be reached the draft is still created, empty, because a
 * reporting tool that will not open because another system is down is one
 * people stop using.
 */
export default function NewReportPage() {
  const session = useSession();
  const router = useRouter();

  // A super admin may file for any team, which is what makes the feature
  // testable against a real team without first joining it. Everybody else gets
  // their own — the backend refuses anything else, so offering more would be
  // offering a 403.
  const isSuper = session.roles.is_super_admin;
  const everyTeam = useSWR<TeamOut[]>(isSuper ? "/teams" : null, {
    revalidateOnFocus: false,
  });
  const teams = isSuper
    ? (everyTeam.data ?? []).filter((team) => !team.archived_at)
    : session.teams.map((entry) => entry.team);

  const [teamId, setTeamId] = useState<string>("");
  const [cadence, setCadence] = useState<ReportCadence>("daily");
  const [on, setOn] = useState<string>("");
  const [prefill, setPrefill] = useState(true);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [prefillMilestones, setPrefillMilestones] = useState(true);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const team = teams.find((entry) => entry.id === teamId) ?? teams[0];
  const chosen = team?.id ?? "";

  // Asked as soon as a team is known, and re-asked on every change of cadence
  // or date: the period, the template and the team's own questions all move
  // with those, and a preview that lagged behind the controls above it would be
  // worse than none.
  const form = useSWR<ReportFormOut>(
    chosen
      ? withQuery("/reports/form", {
          team: chosen,
          cadence,
          on: on || undefined,
        })
      : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const scope = form.data?.scope ?? "team";
  const projects = form.data?.projects ?? [];
  // The first one they have not already filed on. Chosen for them rather than
  // left empty, because on a team with one project the question has one
  // answer and asking it is friction.
  const openProject = projects.find((entry) => !entry.already_reported);
  const project =
    projects.find((entry) => entry.id === projectId) ?? openProject ?? projects[0];

  const start = useAction(async () => {
    if (!chosen) return;
    const body: ReportStartIn = {
      team_id: chosen,
      cadence,
      on: on || null,
      prefill_tasks: prefill,
      include_closed: includeClosed,
      // Sent only on a project report. The backend refuses one named on a
      // team report rather than dropping it, which is the behaviour worth
      // not defeating from here.
      ...(scope === "project"
        ? { project_id: project?.id ?? null, prefill_milestones: prefillMilestones }
        : {}),
      ...(scope === "portfolio" ? { prefill_milestones: prefillMilestones } : {}),
      ...(cadence === "ad_hoc"
        ? { period_start: periodStart || null, period_end: periodEnd || null }
        : {}),
    };
    const created = await api.post<ReportOut>("/reports", body);
    router.push(`/reports/${created.id}`);
  });

  if (!session.can("reports")) {
    return (
      <>
        <PageHead eyebrow="Reports" title="File a report" />
        <Empty
          icon={ShieldAlert}
          title="Not your module yet"
          body="Reports has not been granted to a team you are on. An administrator grants it under Team access."
        />
      </>
    );
  }

  if (teams.length === 0) {
    return (
      <>
        <PageHead eyebrow="Reports" title="File a report" />
        <Empty
          icon={NotebookPen}
          title="You are not on a team"
          body="A report is filed for a team, so being on one is what makes filing possible. Ask an administrator to add you."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Reports"
        title="File a report"
        lead="Your Proposals tasks are pulled in for you. You say where each one stands."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="What you are reporting on" />
            <div className="mt-4 space-y-4">
              <Field label="Team">
                <Select value={chosen} onChange={(event) => setTeamId(event.target.value)}>
                  {teams.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <p className="mb-2 text-[12px] text-ink-3">How often</p>
                <PillRail
                  value={cadence}
                  onChange={(next) => setCadence(next as ReportCadence)}
                  options={CADENCE_OPTIONS}
                />
                {/* Which template a team files is a schedule row per cadence,
                    so changing this can change the whole shape of the form —
                    not only its questions. The preview on the right is what
                    makes that visible before anything is created. */}
              </div>

              {cadence === "ad_hoc" ? (
                // Nothing can work out the period of a bid post-mortem or a
                // site visit, so the author says. Left empty it is today.
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From">
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(event) => setPeriodStart(event.target.value)}
                    />
                  </Field>
                  <Field label="To">
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(event) => setPeriodEnd(event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <Field
                  label="Any day inside the period"
                  hint="Left empty it is today — which is what you want for today's report."
                >
                  <Input
                    type="date"
                    value={on}
                    onChange={(event) => setOn(event.target.value)}
                  />
                </Field>
              )}
            </div>
          </Panel>

          {/* Which project, asked before anything else — because on a
              project-scoped form it is the first thing the report is about,
              and everything below it is a snapshot of whatever is chosen
              here. A project already reported on for this period is offered
              but disabled: telling somebody now is kinder than letting them
              fill in a whole report and be refused at the end. */}
          {scope === "project" && (
            <Panel className="p-5">
              <PanelHead
                title="Which project"
                count={projects.length || undefined}
                hint="The ones you run on this team"
              />
              {projects.length === 0 ? (
                <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
                  This team files project status reports, and there is no project here you
                  run. Filing on somebody else&rsquo;s project would be reporting on work
                  you are not answerable for, so the list is narrowed to yours — being able
                  to <em>read</em> a project is not enough.
                </p>
              ) : (
                <ul className="mt-4 space-y-1.5">
                  {projects.map((entry) => {
                    const on = entry.id === project?.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          disabled={entry.already_reported}
                          onClick={() => setProjectId(entry.id)}
                          aria-pressed={on}
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition disabled:opacity-45",
                            on ? "bg-accent-soft" : "hover:bg-panel-2",
                          )}
                        >
                          <RagDot value={entry.rag_overall} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {entry.name}
                            </span>
                            <span className="mt-1 flex items-center gap-2">
                              <ProgressBar
                                percent={entry.percent_complete}
                                rag={entry.rag_overall}
                                height={4}
                                className="w-24"
                              />
                              <span className="tnum text-[11px] text-ink-4">
                                {entry.percent_complete}%
                              </span>
                              {entry.code && (
                                <span className="text-[11px] text-ink-4">{entry.code}</span>
                              )}
                            </span>
                          </span>
                          {entry.already_reported && (
                            <Badge tone="neutral">Already filed</Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          <Panel className="p-5">
            <PanelHead
              title={scope === "team" ? "Your tasks" : "What is pulled in"}
              hint={
                scope === "team"
                  ? "Pulled from the Proposals list, as rows"
                  : "Taken from the project itself, and then frozen"
              }
            />
            <div className="mt-4 space-y-4">
              {scope === "portfolio" ? (
                <p className="text-[12px] leading-relaxed text-ink-3">
                  Every project on this team you can see becomes a row — its status,
                  health, percentage and counts, as they stand right now. There is no task
                  list on a portfolio report: at that altitude it is noise, and the
                  per-project reports carry it.
                </p>
              ) : (
                <Toggle
                  checked={prefill}
                  onChange={setPrefill}
                  label={
                    scope === "project"
                      ? "Bring the project's open work in"
                      : "Bring my Proposals tasks in"
                  }
                  hint={
                    scope === "project"
                      ? "The project's own open tasks, soonest first. Not your SharePoint bids — those belong to a different system and would be nonsense on a project report."
                      : "Title, status, deadline, the SharePoint link and whether it carries attachments. Yours only — there is no way to pull somebody else's."
                  }
                />
              )}

              {scope === "team" && prefill && (
                <Toggle
                  checked={includeClosed}
                  onChange={setIncludeClosed}
                  label="Include ones already finished"
                  hint="Off for a daily, where what matters is what is live. Worth it on a monthly."
                />
              )}

              {scope !== "team" && (
                <Toggle
                  checked={prefillMilestones}
                  onChange={setPrefillMilestones}
                  label="Bring the milestones in as a timeline"
                  hint="On by default — a status report without its milestones is a status report missing the thing people open it for."
                />
              )}

              <p className="text-[11.5px] leading-relaxed text-ink-4">
                {scope === "team"
                  ? "Rows can be added and removed afterwards, and work that lives nowhere else is typed in. If SharePoint cannot be reached the draft still opens — empty rather than not at all."
                  : "The figures are copied as they are now and then frozen, so this report still describes this period when it is read next year. What you write is the part only you can supply."}
              </p>
            </div>
          </Panel>
        </div>

        {/* What is about to be asked. Shown before anything is created, so
            nobody discovers their team's six extra questions after committing
            to a draft they now have to finish or delete. */}
        <Panel className="p-5">
          <PanelHead
            title="What you will be asked"
            hint={form.data ? form.data.template_name : undefined}
            action={
              form.data ? (
                <Badge tone="neutral">v{form.data.template_version}</Badge>
              ) : undefined
            }
          />

          {form.error ? (
            <div className="mt-4">
              <ErrorState error={form.error} onRetry={() => form.mutate()} />
            </div>
          ) : !form.data ? (
            <PanelSkeleton lines={7} className="mt-4" />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-[13px] bg-panel-2 px-3.5 py-3">
                <p className="micro text-ink-4">Period</p>
                <p className="mt-1 text-[13.5px] font-semibold text-ink">
                  {form.data.period_label}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-4">
                  {date(form.data.period_start)} – {date(form.data.period_end)}
                </p>
              </div>

              <ul className="space-y-2">
                {form.data.sections.map((section) => {
                  const extra = form.data!.fields.filter(
                    (field) => field.section === section.key,
                  );
                  return (
                    <li key={section.key} className="rounded-[13px] bg-panel-2 px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                          {section.name}
                        </span>
                        <Badge tone="neutral">{humanise(section.kind)}</Badge>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">
                        {section.description}
                      </p>
                      {extra.length > 0 && (
                        <p className="mt-2 text-[11.5px] text-ink-3">
                          Also asks:{" "}
                          {extra.map((field) => field.label).join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <InlineNotice tone="info">
                {scope === "team" ? (
                  <>
                    The six sections are the same on every report in the company — that is
                    what lets a manager read four teams in one pass. What each team is
                    asked <em>inside</em> them comes from its template, which a super admin
                    sets.
                  </>
                ) : (
                  <>
                    This team files{" "}
                    {scope === "portfolio" ? "a portfolio report" : "project status reports"}
                    , so the frame itself is different: the dials, the timeline and the
                    counts come from{" "}
                    {scope === "portfolio" ? "the projects" : "the project"} rather than
                    being typed, and what is asked here is only the part a person has to
                    supply.
                  </>
                )}
              </InlineNotice>
            </div>
          )}
        </Panel>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-[20px] bg-panel px-5 py-3.5 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">
          {start.error ? (
            <span className="text-danger">{start.error}</span>
          ) : scope === "project" && form.data && !project ? (
            "No project here is yours to report on."
          ) : form.data ? (
            [form.data.team, project?.name, form.data.period_label]
              .filter(Boolean)
              .join(" · ")
          ) : (
            "Choose a team and a cadence."
          )}
        </p>
        <Button
          variant="accent"
          icon={scope === "team" ? Sparkles : FolderKanban}
          loading={start.pending}
          // A project report with nothing to report on cannot be started, and
          // the backend would refuse it — saying so here saves the round trip
          // and names the reason above.
          disabled={!form.data || (scope === "project" && !project)}
          onClick={() => void start.run()}
        >
          Start the draft
        </Button>
      </div>
    </>
  );
}
