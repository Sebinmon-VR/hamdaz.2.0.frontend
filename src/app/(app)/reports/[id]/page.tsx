"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  Check,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { date, dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  IssueIn,
  ReportEditIn,
  ReportOut,
  ReportProjectNoteIn,
  ReportSectionOut,
  TaskLineIn,
} from "@/lib/types";
import {
  Avatar,
  Badge,
  Meta,
  PageHead,
  Panel,
  PanelHead,
} from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { AnswerField } from "@/components/reports/AnswerField";
import {
  CADENCE_LABELS,
  COMPLETION_LABELS,
  ReportStatusBadge,
  ScopeBadge,
  SEVERITY_LABELS,
} from "@/components/reports/ReportBits";
import { ReportView } from "@/components/reports/ReportView";
import {
  NoProjectLines,
  PortfolioTable,
  ProjectLineHead,
  ProjectNotes,
  ReportDials,
  ReportTimeline,
} from "@/components/reports/ProjectSections";

/**
 * One report — being written, or being read.
 *
 * The same route does both, because they are the same document at two points
 * in its life and splitting them would mean a URL that stops working the moment
 * somebody files. Which one is drawn is decided by `can_edit` from the payload,
 * never by comparing ids here: only the author edits, and only while it is a
 * draft — not a manager, not a super admin, who comment or delete instead. That
 * rule lives in one place on the backend and this screen asks it rather than
 * restating it.
 *
 * **Filing is the point of no return, and the screen says so.** After it the
 * report is read-only to its author and visible to the people it goes to — the
 * team's managers and leads, the CEO, and super admins — who are mailed a copy.
 * There is no unfiling: a report that could be revised after being read would
 * make "what did they report on Tuesday" unanswerable, which is the one
 * question the whole module exists to answer.
 */
export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, error, isLoading, mutate } = useSWR<ReportOut>(
    id ? `/reports/${id}` : null,
    { revalidateOnFocus: false },
  );

  if (error) {
    return (
      <>
        <PageHead eyebrow="Reports" title="Report" />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        <PageHead eyebrow="Reports" title="Report" />
        <PanelSkeleton lines={10} />
      </>
    );
  }

  return data.can_edit ? (
    <Editor key={data.id} report={data} onSaved={() => void mutate()} />
  ) : (
    <Reader report={data} onChanged={() => void mutate()} />
  );
}

/* ── writing it ──────────────────────────────────────────────────────── */

/**
 * The draft.
 *
 * Everything is held locally and sent in one PATCH, rather than each control
 * saving itself. Two reasons, and the second is the real one: a report is
 * written in one sitting with the sections filled out of order, so per-field
 * saves would be a request per keystroke-pause on a screen somebody is thinking
 * on — and, more importantly, the backend's list semantics make partial saves
 * dangerous. Sending `tasks` at all replaces the section. One payload built
 * from one piece of state cannot half-replace anything.
 */
function Editor({ report, onSaved }: { report: ReportOut; onSaved: () => void }) {
  const router = useRouter();

  const [overview, setOverview] = useState(report.overview ?? "");
  const [remarks, setRemarks] = useState(report.remarks ?? "");
  const [summary, setSummary] = useState(report.summary ?? "");
  const [answers, setAnswers] = useState<Record<string, unknown>>(report.answers ?? {});
  const [tasks, setTasks] = useState<TaskLineIn[]>(() =>
    report.tasks.map((task) => ({
      title: task.title,
      completion: task.completion as TaskLineIn["completion"],
      source: task.source as TaskLineIn["source"],
      external_id: task.external_id,
      status: task.status,
      percent_complete: task.percent_complete,
      priority: task.priority,
      end_user: task.end_user,
      quote_no: task.quote_no,
      deadline: task.deadline,
      link: task.link,
      attachments_url: task.attachments_url,
      has_attachments: task.has_attachments,
      note: task.note,
    })),
  );
  const [issues, setIssues] = useState<IssueIn[]>(() =>
    report.issues.map((issue) => ({
      title: issue.title,
      detail: issue.detail,
      severity: issue.severity as IssueIn["severity"],
      waiting_on: issue.waiting_on,
      resolved: issue.resolved,
    })),
  );
  // Keyed by project line id, and only the prose: the figures on a line are a
  // snapshot the backend refuses to let anybody type over. Seeded from what is
  // already saved so a half-written portfolio report re-opens as it was left.
  const [projectNotes, setProjectNotes] = useState<Record<string, ReportProjectNoteIn>>(
    () =>
      Object.fromEntries(
        report.project_lines.map((line) => [
          line.id,
          {
            activities: line.activities,
            action_required: line.action_required,
            note: line.note,
          },
        ]),
      ),
  );
  // Only the overrides. A metric left alone is not sent at all, so the computed
  // figure keeps computing — sending it back would freeze today's count into
  // the report the moment somebody opened it.
  const [metrics, setMetrics] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const metric of report.metrics) {
      if (metric.value !== null) out[metric.key] = metric.value;
    }
    return out;
  });
  const [saved, setSaved] = useState(false);

  const body = (): ReportEditIn => ({
    overview: overview.trim() || null,
    remarks: remarks.trim() || null,
    summary: summary.trim() || null,
    answers,
    tasks: tasks.filter((task) => task.title.trim() !== ""),
    issues: issues.filter((issue) => issue.title.trim() !== ""),
    // A cleared box means "go back to the computed figure", which the backend
    // spells as null. Sending "" would be a 422 about a decimal.
    metrics: Object.fromEntries(
      report.metrics.map((metric) => [metric.key, metrics[metric.key]?.trim() || null]),
    ),
    // Sent only where there are lines. An empty object on a team report would
    // be harmless but says something untrue about what the report is.
    ...(report.project_lines.length > 0 ? { project_notes: projectNotes } : {}),
  });

  const save = useAction(async () => {
    await api.patch<ReportOut>(`/reports/${report.id}`, body());
    setSaved(true);
    onSaved();
  });

  const submit = useAction(async () => {
    // Saved first, always. Filing what is on the server rather than what is on
    // the screen is how somebody ends up having filed a report missing the
    // paragraph they just typed.
    await api.patch<ReportOut>(`/reports/${report.id}`, body());
    await api.post<ReportOut>(`/reports/${report.id}/submit`);
    onSaved();
  });

  const remove = useAction(async () => {
    await api.del(`/reports/${report.id}`);
    router.push("/reports");
  });

  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <PageHead
        eyebrow={`${report.team} · ${CADENCE_LABELS[report.cadence] ?? report.cadence}`}
        title={report.project_name ?? report.period_label}
        lead="A draft is yours alone — nobody else can see it until you file it."
        meta={`${date(report.period_start)} – ${date(report.period_end)}`}
        actions={
          <>
            <ScopeBadge value={report.scope} />
            <ReportStatusBadge value={report.status} />
          </>
        }
      />

      <div className="space-y-4">
        {report.sections.map((entry) => (
          <EditorSection
            key={entry.key}
            section={entry}
            report={report}
            state={{
              overview,
              setOverview,
              remarks,
              setRemarks,
              summary,
              setSummary,
              answers,
              setAnswers,
              tasks,
              setTasks,
              issues,
              setIssues,
              metrics,
              setMetrics,
              projectNotes,
              setProjectNotes,
            }}
          />
        ))}

        <Panel className="p-5">
          <PanelHead title="Filing it" hint="After this it cannot be changed" />
          <InlineNotice tone="warn" className="mt-4">
            Filing makes this read-only and sends it to the people it goes to — your team&rsquo;s
            managers and leads, the CEO and super admins — who are mailed a link. There is no
            unfiling: a report that could be revised after being read would make &ldquo;what did
            they report&rdquo; an unanswerable question.
          </InlineNotice>

          {report.can_delete && (
            <div className="mt-4 flex items-center gap-3">
              {confirming ? (
                <>
                  <span className="text-[12.5px] text-ink-3">Delete this draft?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    loading={remove.pending}
                    onClick={() => void remove.run()}
                  >
                    Delete it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setConfirming(true)}
                >
                  Delete this draft
                </Button>
              )}
            </div>
          )}
        </Panel>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-[20px] bg-panel px-5 py-3.5 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">
          {save.error || submit.error ? (
            <span className="text-danger">{save.error ?? submit.error}</span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1.5 text-positive">
              <Check className="size-3.5" strokeWidth={2.6} />
              Saved as a draft.
            </span>
          ) : (
            `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · ${issues.length} ${
              issues.length === 1 ? "issue" : "issues"
            }`
          )}
        </p>
        <Button icon={Save} loading={save.pending} onClick={() => void save.run()}>
          Save draft
        </Button>
        <Button
          variant="accent"
          icon={Send}
          loading={submit.pending}
          disabled={!report.can_submit}
          onClick={() => void submit.run()}
        >
          File it
        </Button>
      </div>
    </>
  );
}

interface EditorState {
  overview: string;
  setOverview: (value: string) => void;
  remarks: string;
  setRemarks: (value: string) => void;
  summary: string;
  setSummary: (value: string) => void;
  answers: Record<string, unknown>;
  setAnswers: (value: Record<string, unknown>) => void;
  tasks: TaskLineIn[];
  setTasks: (value: TaskLineIn[]) => void;
  issues: IssueIn[];
  setIssues: (value: IssueIn[]) => void;
  metrics: Record<string, string>;
  setMetrics: (value: Record<string, string>) => void;
  projectNotes: Record<string, ReportProjectNoteIn>;
  setProjectNotes: (value: Record<string, ReportProjectNoteIn>) => void;
}

/** One section of the form, drawn from its `kind` and the template's fields. */
function EditorSection({
  section,
  report,
  state,
}: {
  section: ReportSectionOut;
  report: ReportOut;
  state: EditorState;
}) {
  const fields = report.fields.filter((field) => field.section === section.key);
  const lines = report.project_lines;
  const single = lines.length > 0 ? lines[0] : null;

  const setNote = (id: string, patch: ReportProjectNoteIn) =>
    state.setProjectNotes({
      ...state.projectNotes,
      [id]: { ...state.projectNotes[id], ...patch },
    });

  const prose =
    section.key === "overview"
      ? { value: state.overview, set: state.setOverview }
      : section.key === "remarks"
        ? { value: state.remarks, set: state.setRemarks }
        : section.key === "summary"
          ? { value: state.summary, set: state.setSummary }
          : null;

  return (
    <Panel className="p-5">
      <PanelHead
        title={section.name}
        count={
          section.key === "tasks"
            ? state.tasks.length
            : section.key === "issues"
              ? state.issues.length || undefined
              : section.kind === "projects"
                ? lines.length
                : section.kind === "timeline"
                  ? single?.milestones.length || undefined
                  : undefined
        }
      />
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">{section.description}</p>

      <div className="mt-4 space-y-4">
        {prose && (
          <Textarea
            value={prose.value}
            onChange={(event) => prose.set(event.target.value)}
            className="min-h-28"
            placeholder={
              section.key === "overview"
                ? "What the period was about, in a few lines."
                : section.key === "summary"
                  ? "What the reader should take away, and what happens next."
                  : "Anything worth saying that is not a task and not a blocker."
            }
          />
        )}

        {/* The project sections. Read-only even in the draft, apart from the
            three prose boxes underneath the dials: the figures are a snapshot
            of the project taken when this draft was opened, and a report whose
            numbers could be retyped would be a record of what somebody wished
            the project said. A project whose figures are wrong is fixed in the
            project, and the draft re-opened. */}
        {section.kind === "dials" &&
          (single ? (
            <div className="space-y-3.5">
              <ProjectLineHead line={single} />
              <ReportDials line={single} />
              <ProjectNotes
                line={single}
                value={state.projectNotes[single.id] ?? {}}
                onChange={(patch) => setNote(single.id, patch)}
                single
              />
            </div>
          ) : (
            <NoProjectLines scope={report.scope} />
          ))}

        {section.kind === "timeline" &&
          (single ? <ReportTimeline line={single} /> : <NoProjectLines scope={report.scope} />)}

        {section.kind === "projects" &&
          (lines.length > 0 ? (
            <div className="space-y-3.5">
              <PortfolioTable lines={lines} />
              {/* A portfolio report is written a project at a time, which is
                  why the notes are merged rather than replaced on save. */}
              <div className="space-y-2">
                {lines.map((line) => (
                  <ProjectNotes
                    key={line.id}
                    line={line}
                    value={state.projectNotes[line.id] ?? {}}
                    onChange={(patch) => setNote(line.id, patch)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <NoProjectLines scope={report.scope} />
          ))}

        {section.key === "tasks" && <TaskRows state={state} />}
        {section.key === "issues" && <IssueRows state={state} />}
        {section.kind === "figures" && <MetricGrid report={report} state={state} />}

        {fields.map((field) => (
          <AnswerField
            key={field.key}
            field={field}
            value={state.answers[field.key]}
            onChange={(value) => state.setAnswers({ ...state.answers, [field.key]: value })}
          />
        ))}
      </div>
    </Panel>
  );
}

/* ── the work ────────────────────────────────────────────────────────── */

/**
 * The task rows.
 *
 * A pulled row keeps what SharePoint said — its title, its link, whether it
 * carries attachments — and is not editable in those parts, deliberately: the
 * row is a snapshot of the list at the moment it was pulled, and letting
 * somebody retype the title would produce a report that disagrees with the
 * system it claims to be quoting. What the author owns is the claim the list
 * cannot make: how far along it actually is, and why.
 */
function TaskRows({ state }: { state: EditorState }) {
  const update = (index: number, patch: Partial<TaskLineIn>) =>
    state.setTasks(state.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)));

  return (
    <div className="space-y-2">
      {state.tasks.map((task, index) => {
        const pulled = task.source === "proposals";
        return (
          <div key={index} className="rounded-[15px] bg-panel-2 p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                {pulled ? (
                  <div className="flex items-start gap-1.5">
                    <span className="min-w-0 text-[13px] font-medium text-ink">
                      {task.title}
                    </span>
                    {task.link && (
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in SharePoint"
                        className="mt-0.5 shrink-0 text-ink-4 transition hover:text-ink"
                      >
                        <ExternalLink className="size-3" strokeWidth={2.2} />
                      </a>
                    )}
                    {task.has_attachments && (
                      <Paperclip className="mt-0.5 size-3 shrink-0 text-ink-4" strokeWidth={2.2} />
                    )}
                  </div>
                ) : (
                  <Input
                    value={task.title}
                    placeholder="What the work was"
                    onChange={(event) => update(index, { title: event.target.value })}
                  />
                )}
                {pulled && (task.status || task.end_user || task.quote_no) && (
                  <p className="mt-1 truncate text-[11px] text-ink-4">
                    {[task.status, task.end_user, task.quote_no].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {pulled && <Badge tone="neutral">From Proposals</Badge>}
              <button
                onClick={() => state.setTasks(state.tasks.filter((_, i) => i !== index))}
                aria-label="Remove this row"
                title="Remove this row"
                className="grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-danger"
              >
                <X className="size-3.5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              <Field label="Where it stands">
                <Select
                  value={task.completion ?? "in_progress"}
                  onChange={(event) =>
                    update(index, { completion: event.target.value as TaskLineIn["completion"] })
                  }
                >
                  {Object.entries(COMPLETION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Deadline">
                <Input
                  type="date"
                  value={task.deadline ?? ""}
                  onChange={(event) => update(index, { deadline: event.target.value || null })}
                />
              </Field>
              <Field label="Per cent done">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={task.percent_complete ?? ""}
                  onChange={(event) =>
                    update(index, {
                      percent_complete:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <Field className="mt-2.5" label="Note" hint="Only if it needs one.">
              <Input
                value={task.note ?? ""}
                placeholder="Waiting on the supplier's revised price"
                onChange={(event) => update(index, { note: event.target.value || null })}
              />
            </Field>
          </div>
        );
      })}

      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        onClick={() =>
          state.setTasks([
            ...state.tasks,
            { title: "", completion: "in_progress", source: "manual" },
          ])
        }
      >
        Add work that lives nowhere else
      </Button>
    </div>
  );
}

/* ── what is in the way ──────────────────────────────────────────────── */

function IssueRows({ state }: { state: EditorState }) {
  const update = (index: number, patch: Partial<IssueIn>) =>
    state.setIssues(
      state.issues.map((issue, i) => (i === index ? { ...issue, ...patch } : issue)),
    );

  return (
    <div className="space-y-2">
      {state.issues.map((issue, index) => (
        <div key={index} className="rounded-[15px] bg-panel-2 p-3.5">
          <div className="flex items-start gap-2.5">
            <Input
              value={issue.title}
              placeholder="What is in the way"
              onChange={(event) => update(index, { title: event.target.value })}
            />
            <button
              onClick={() => state.setIssues(state.issues.filter((_, i) => i !== index))}
              aria-label="Remove this issue"
              title="Remove this issue"
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-danger"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <Field label="How bad">
              <Select
                value={issue.severity ?? "medium"}
                onChange={(event) =>
                  update(index, { severity: event.target.value as IssueIn["severity"] })
                }
              >
                {Object.entries(SEVERITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Waiting on" hint="A person, a supplier, another team.">
              <Input
                value={issue.waiting_on ?? ""}
                onChange={(event) => update(index, { waiting_on: event.target.value || null })}
              />
            </Field>
          </div>

          <Field className="mt-2.5" label="Detail">
            <Textarea
              value={issue.detail ?? ""}
              onChange={(event) => update(index, { detail: event.target.value || null })}
              className="min-h-16"
            />
          </Field>

          <div className="mt-2.5">
            <Toggle
              checked={issue.resolved === true}
              onChange={(value) => update(index, { resolved: value })}
              label="Already sorted"
              hint="Kept on the report, but not counted as open."
            />
          </div>
        </div>
      ))}

      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        onClick={() =>
          state.setIssues([...state.issues, { title: "", severity: "medium" }])
        }
      >
        Raise an issue
      </Button>
    </div>
  );
}

/* ── the figures ─────────────────────────────────────────────────────── */

/**
 * The metrics, computed and correctable.
 *
 * Each shows what the rows above actually said and offers a box to disagree
 * with it. An empty box is not zero — it means "use the computed figure" — and
 * saying so on screen matters, because the alternative reading would turn every
 * untouched metric into a claim that nothing happened.
 */
function MetricGrid({ report, state }: { report: ReportOut; state: EditorState }) {
  if (report.metrics.length === 0) return null;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {report.metrics.map((metric) => (
        <div key={metric.key} className="rounded-[13px] bg-panel-2 px-3.5 py-3">
          <p className="micro truncate text-ink-4" title={metric.label}>
            {metric.label}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={state.metrics[metric.key] ?? ""}
              placeholder={metric.computed ?? "—"}
              onChange={(event) =>
                state.setMetrics({ ...state.metrics, [metric.key]: event.target.value })
              }
            />
            {metric.unit && (
              <span className="shrink-0 text-[11.5px] text-ink-4">{metric.unit}</span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-ink-4">
            {metric.computed !== null
              ? `Rows say ${metric.computed}. Leave it empty to keep that.`
              : "Typed by the team."}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── reading it ──────────────────────────────────────────────────────── */

/**
 * A filed report, plus the one thing a reader can add to it.
 *
 * Comments are a reader's remark and the author is deliberately excluded from
 * leaving one: somebody with more to say has the remarks section of their next
 * report, or a word with their manager. Letting an author append after filing
 * would put the answer to "what did they report on Tuesday" back out of reach.
 */
function Reader({ report, onChanged }: { report: ReportOut; onChanged: () => void }) {
  const session = useSession();
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState(false);

  const say = useAction(async () => {
    const body = comment.trim();
    if (!body) return;
    await api.post(`/reports/${report.id}/comments`, { body });
    setComment("");
    onChanged();
  });

  const remove = useAction(async () => {
    await api.del(`/reports/${report.id}`);
    router.push("/reports");
  });

  const mine = report.author_id === session.user.id;

  return (
    <>
      <PageHead
        eyebrow={
          report.project_name
            ? `${report.team} · ${report.project_name}`
            : `${report.team} · ${CADENCE_LABELS[report.cadence] ?? report.cadence}`
        }
        title={report.period_label}
        meta={`${date(report.period_start)} – ${date(report.period_end)}`}
        actions={
          <>
            <ScopeBadge value={report.scope} />
            <ReportStatusBadge value={report.status} />
            <Link
              href="/reports"
              className="text-[12.5px] text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              All reports
            </Link>
          </>
        }
      />

      <Panel className="p-5">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Meta label="Filed by">
            <span className="flex items-center gap-2">
              <Avatar name={report.author_name} seed={report.author_id} size="xs" />
              <span className="truncate">{report.author_name}</span>
            </span>
          </Meta>
          <Meta label={report.project_id ? "Project" : "Team"}>
            {report.project_id ? (
              // The report is a snapshot; the project has moved on. This is
              // the way to the live one, and it is the only live thing on
              // this screen.
              <Link
                href={`/projects/${report.project_id}`}
                className="underline underline-offset-2"
              >
                {report.project_name ?? "the project"}
              </Link>
            ) : (
              report.team
            )}
          </Meta>
          <Meta label="Filed">
            {report.submitted_at ? relative(report.submitted_at) : "Not yet"}
          </Meta>
          <Meta label="Template">
            {report.template_name}{" "}
            <span className="text-[11.5px] text-ink-4">v{report.template_version}</span>
          </Meta>
        </dl>
      </Panel>

      {mine && (
        <InlineNotice tone="info">
          This is yours, and it is filed — so it is read-only now. Anything further goes in
          your next report.
        </InlineNotice>
      )}

      <ReportView report={report} />

      <Panel className="p-5">
        <PanelHead
          title="Comments"
          count={report.comments.length || undefined}
          hint="A reader's remark. The author cannot leave one."
        />

        {report.comments.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-ink-4">Nothing said yet.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {report.comments.map((entry) => (
              <li key={entry.id} className="flex gap-2.5">
                <Avatar name={entry.author_name} seed={entry.author_id} size="xs" />
                <div className="min-w-0 flex-1 rounded-[13px] bg-panel-2 px-3.5 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {entry.author_name}
                    </span>
                    <span
                      className="text-[11px] text-ink-4"
                      title={dateTime(entry.created_at)}
                    >
                      {relative(entry.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
                    {entry.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {report.can_comment && (
          <div className="mt-4 flex items-end gap-2.5">
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Ask about something, or say it has been picked up."
              maxLength={4000}
              className="min-h-16"
            />
            <Button
              icon={MessageSquare}
              loading={say.pending}
              disabled={!comment.trim()}
              onClick={() => void say.run()}
            >
              Comment
            </Button>
          </div>
        )}
        {say.error && <p className="mt-2 text-[12px] text-danger">{say.error}</p>}
      </Panel>

      {report.can_delete && (
        <Panel className="p-5">
          <PanelHead title="Remove it" hint="For the mistake that has to be undoable" />
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            A filed report can only be removed by a super admin — deliberately not by a CEO
            or a manager, since reading everything and being able to remove it are different
            powers. This is for the report filed against the wrong team, not for one
            somebody disagrees with.
          </p>
          <div className="mt-4 flex items-center gap-3">
            {confirming ? (
              <>
                <span className="text-[12.5px] text-ink-3">Delete this report?</span>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  loading={remove.pending}
                  onClick={() => void remove.run()}
                >
                  Delete it
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirming(true)}>
                Delete this report
              </Button>
            )}
          </div>
          {remove.error && <p className="mt-2 text-[12px] text-danger">{remove.error}</p>}
        </Panel>
      )}
    </>
  );
}
