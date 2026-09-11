"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Archive,
  ArchiveRestore,
  Check,
  Map as MapIcon,
  MessageSquare,
  NotebookPen,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, dateShort, money, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  HealthIn,
  MemberOut,
  ProjectIssueIn,
  ProjectOut,
  ProjectTaskEditIn,
  ProjectTaskIn,
  ProjectUpdateOut,
} from "@/lib/types";
import {
  Avatar,
  Badge,
  Meta,
  PageHead,
  Panel,
  PanelHead,
  StatBox,
} from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  LinkButton,
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
} from "@/components/ui/feedback";
import { PeoplePicker } from "@/components/hr/PeoplePicker";
import {
  Delta,
  Dials,
  PRIORITY_LABELS,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
  TASK_STATUS_LABELS,
  TaskStatusBadge,
  Tally,
  UPDATE_KIND_LABELS,
  UpdateKindBadge,
} from "@/components/projects/ProjectBits";

/**
 * One project.
 *
 * Everything on this screen comes from a single `GET /projects/{id}`, which
 * carries the plan, the work, the issues and — the part that matters for the
 * buttons — what *this* caller may do with each of them. `can_manage`,
 * `can_administer`, `can_report` and each task's own `can_update` are read
 * rather than re-derived: the three powers are deliberately kept apart on the
 * backend, and a screen that collapsed any pair of them into one check would
 * be how "everyone can edit everything" arrives by accident.
 *
 * A project somebody may not read answers 404 rather than 403, so the
 * not-found state here is the same one they would get for an id that never
 * existed. That is the backend's choice and the right one — a 403 on an id
 * confirms the id names a real project of some team.
 */
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState("work");

  const { data, error, isLoading, mutate } = useSWR<ProjectOut>(`/projects/${id}`);
  const reload = () => void mutate();

  if (error) {
    return (
      <>
        <PageHead eyebrow="Projects" title="Project" />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        <PageHead eyebrow="Projects" title="Project" />
        <PanelSkeleton lines={10} />
      </>
    );
  }

  const rollup = data.rollup;

  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/teams/${data.team_id}`}>{data.team}</Link>
        }
        title={data.name}
        lead={data.objective ?? undefined}
        meta={
          data.target_end_on ? `target ${date(data.target_end_on)}` : "no target date"
        }
        actions={
          <>
            {data.code && <Badge tone="neutral">{data.code}</Badge>}
            <ProjectStatusBadge value={data.status} />
            <LinkButton href={`/projects/${id}/plan`} icon={MapIcon}>
              Plan
            </LinkButton>
            {data.can_report && (
              <LinkButton href="/reports/new" icon={NotebookPen}>
                File a status report
              </LinkButton>
            )}
          </>
        }
      />

      {data.archived && (
        <InlineNotice tone="warn">
          This project is archived. Nobody manages an archived project — restoring it is a
          separate, deliberate act, and it is the one thing still open to whoever runs the
          team.
        </InlineNotice>
      )}

      {data.health.stale && !data.archived && (
        <InlineNotice tone="warn">
          Nobody has confirmed the dials{" "}
          {data.health.reviewed_at
            ? `since ${relative(data.health.reviewed_at)}`
            : "at all"}
          . Grey dials, and green ones nobody has looked at, are not evidence that anything
          is fine.
        </InlineNotice>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6">
        <StatBox label="Complete" value={`${rollup.percent_complete}%`} />
        <StatBox label="Tasks open" value={num(rollup.tasks_open)} />
        <StatBox
          label="Overdue"
          value={num(rollup.tasks_overdue)}
          tone={rollup.tasks_overdue > 0 ? "danger" : undefined}
        />
        <StatBox
          label="Blocked"
          value={num(rollup.tasks_blocked)}
          tone={rollup.tasks_blocked > 0 ? "danger" : undefined}
        />
        <StatBox
          label="Milestones late"
          value={num(rollup.milestones_overdue)}
          tone={rollup.milestones_overdue > 0 ? "danger" : undefined}
        />
        <StatBox
          label="Issues open"
          value={num(rollup.issues_open)}
          tone={rollup.issues_open > 0 ? "second" : undefined}
          hint="Anybody on the project may raise one — the person who trips over a blocker is rarely the person running it."
        />
      </div>

      <Health project={data} onSaved={reload} />

      <Brief project={data} />

      <PillRail
        value={tab}
        onChange={setTab}
        className="w-fit"
        options={[
          { value: "work", label: "Work", count: data.tasks.length },
          { value: "issues", label: "Issues", count: rollup.issues_open || undefined },
          { value: "people", label: "People", count: data.members.length },
          { value: "log", label: "What moved" },
          { value: "about", label: "About" },
        ]}
      />

      {tab === "work" && <Work project={data} onChanged={reload} />}
      {tab === "issues" && <Issues project={data} onChanged={reload} />}
      {tab === "people" && <People project={data} onChanged={reload} />}
      {tab === "log" && <Log project={data} onChanged={reload} />}
      {tab === "about" && <About project={data} onChanged={reload} />}
    </>
  );
}

/* ── what happened, and what is needed ───────────────────────────────── */

/**
 * The two boxes a status report opens with, on the project itself.
 *
 * Neither is a new field. The left is the last few entries of the log; the
 * right is the open issues somebody flagged as needing a decision from above.
 * They are lifted to the front page because those are the two questions a
 * status report exists to answer — what moved, and what do you need from me —
 * and answering them from two different tabs is how a report ends up written
 * from memory on the morning it is due.
 *
 * The right-hand box is tinted only when it has something in it, so the colour
 * is the signal rather than the furniture.
 */
function Brief({ project }: { project: ProjectOut }) {
  // The log is not on the project record — it is paged, and this wants the
  // top of it rather than the thirty days the tab below asks for.
  const { data: updates } = useSWR<ProjectUpdateOut[]>(
    withQuery(`/projects/${project.id}/updates`, { limit: 4 }),
  );

  const activity = updates ?? [];
  const waiting = project.issues
    .filter((issue) => issue.needs_support && !issue.resolved_on)
    .slice(0, 4);

  if (activity.length === 0 && waiting.length === 0) return null;

  return (
    <div className="grid gap-3.5 lg:grid-cols-2">
      <Panel tone="inset" className="p-4">
        <PanelHead title="Key activities" hint="The last few things that moved" />
        {activity.length === 0 ? (
          <p className="mt-3 text-[12px] text-ink-4">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {activity.map((update) => (
              <li key={update.id} className="flex gap-2.5">
                <span className="mt-1.5 size-[5px] shrink-0 rounded-[1.5px] bg-accent" />
                <p className="min-w-0 text-[12px] leading-relaxed text-ink-2">
                  {update.subject ?? update.body ?? UPDATE_KIND_LABELS[update.kind] ?? update.kind}
                  <span className="ml-1.5 text-ink-4">{relative(update.created_at)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div
        className="rounded-[20px] p-4"
        style={waiting.length ? { background: "var(--warn-soft)" } : undefined}
      >
        <div className={waiting.length ? "" : "rounded-[20px] bg-panel-2 -m-4 p-4"}>
          <PanelHead
            title="Management action required"
            count={waiting.length || undefined}
            hint={waiting.length ? undefined : "Nothing is waiting on a decision"}
          />
          {waiting.length === 0 ? (
            <p className="mt-3 text-[12px] text-ink-4">
              Issues raised here are the team&rsquo;s own until somebody marks one as needing
              a decision from above.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {waiting.map((issue) => (
                <li key={issue.id} className="flex gap-2.5">
                  <span className="mt-1.5 size-[5px] shrink-0 rounded-[1.5px] bg-warn" />
                  <p className="min-w-0 text-[12px] leading-relaxed text-ink-2">
                    {issue.title}
                    {issue.support_note && (
                      <span className="text-ink-3"> — {issue.support_note}</span>
                    )}
                    <span className="ml-1.5 whitespace-nowrap text-ink-4">
                      open {issue.age_days}d
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── the dials ───────────────────────────────────────────────────────── */

/**
 * The five dials, and the one place they are set.
 *
 * Its own endpoint rather than part of the project edit, because the
 * timestamp is the point: saving a description must not claim the health was
 * reassessed, and confirming the dials unchanged must count as a review. That
 * is why "Confirm as still true" sends an empty body — a real act with no
 * change in it.
 */
function Health({ project, onSaved }: { project: ProjectOut; onSaved: () => void }) {
  const [draft, setDraft] = useState<HealthIn>({});
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const dials = project.health.dials.map((dial) => ({
    ...dial,
    rag: (draft[`rag_${dial.key}` as keyof HealthIn] as string) ?? dial.rag,
    trend: (draft[`trend_${dial.key}` as keyof HealthIn] as string) ?? dial.trend,
  }));

  const save = useAction(async () => {
    await api.put(`/projects/${project.id}/health`, {
      ...draft,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setDraft({});
    setNote("");
    setSaved(true);
    onSaved();
  });

  const dirty = Object.keys(draft).length > 0 || note.trim() !== "";

  return (
    <Panel className="p-5">
      <PanelHead
        title="Health"
        hint={
          project.health.reviewed_at
            ? `Last assessed ${relative(project.health.reviewed_at)}`
            : "Never assessed"
        }
        action={
          project.can_manage && (
            <Button
              size="sm"
              variant={dirty ? "accent" : "outline"}
              icon={dirty ? Save : Check}
              loading={save.pending}
              onClick={() => void save.run()}
            >
              {dirty ? "Record the assessment" : "Confirm as still true"}
            </Button>
          )
        }
      />

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">
        Your judgement, not arithmetic. Where the dates or the budget disagree with a dial
        it is said underneath — a project can be behind and green for a reason no date
        arithmetic can know, so the suggestion is never written to the dial.
      </p>

      <Dials
        className="mt-4"
        dials={dials}
        disabled={save.pending}
        onSet={
          project.can_manage
            ? (key, patch) =>
                setDraft((current) => ({
                  ...current,
                  ...(patch.rag ? { [`rag_${key}`]: patch.rag } : {}),
                  ...(patch.trend ? { [`trend_${key}`]: patch.trend } : {}),
                }))
            : undefined
        }
      />

      {project.can_manage && (
        <div className="mt-3.5">
          <Field label="Why" hint="Kept with the assessment and shown in the log.">
            <Input
              value={note}
              placeholder="Supplier confirmed the revised delivery, so schedule back to green"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
      )}

      {project.health.reviewed_note && !dirty && (
        <p className="mt-3 rounded-[13px] bg-panel-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-3">
          {project.health.reviewed_note}
        </p>
      )}

      {(save.error || saved) && (
        <p className="mt-2 text-[11.5px]">
          {save.error ? (
            <span className="text-danger">{save.error}</span>
          ) : (
            <span className="text-positive">Assessed just now.</span>
          )}
        </p>
      )}
    </Panel>
  );
}

/* ── the work ────────────────────────────────────────────────────────── */

function Work({ project, onChanged }: { project: ProjectOut; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const byMilestone = new Map<string, typeof project.tasks>();
  for (const task of project.tasks) {
    if (!showDone && (task.status === "done" || task.status === "dropped")) continue;
    const key = task.milestone_id ?? "";
    byMilestone.set(key, [...(byMilestone.get(key) ?? []), task]);
  }
  const groups = [
    ...project.milestones.map((stone) => ({
      key: stone.id,
      name: stone.name,
      tasks: byMilestone.get(stone.id) ?? [],
    })),
    // Unattached work last, and named rather than blank: a task under no
    // milestone is work nobody has placed in the plan, which is worth seeing
    // as its own group rather than hiding at the top.
    { key: "", name: "Not under a milestone", tasks: byMilestone.get("") ?? [] },
  ].filter((group) => group.tasks.length > 0);

  return (
    <>
      <Panel className="p-5">
        <PanelHead
          title="Work"
          count={project.tasks.length}
          hint="Grouped by milestone, so the plan and the work stay the same picture"
          action={
            <>
              <Toggle checked={showDone} onChange={setShowDone} label="Finished too" />
              {project.can_manage && (
                <Button size="sm" variant="accent" icon={Plus} onClick={() => setAdding(true)}>
                  Add a task
                </Button>
              )}
            </>
          }
        />

        {groups.length === 0 ? (
          <Empty
            className="mt-4"
            icon={MapIcon}
            title={showDone ? "Nothing here yet" : "Nothing open"}
            body={
              project.can_manage
                ? "Add tasks and hang them off milestones. Whoever a task is assigned to is put on the project and told about it."
                : "No open work on this project. Its lead adds tasks and assigns them."
            }
          />
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="micro mb-2 text-ink-4">{group.name}</p>
                <ul className="space-y-2">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      projectId={project.id}
                      task={task}
                      canManage={project.can_manage}
                      onChanged={onChanged}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <AddTask
        project={project}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          onChanged();
        }}
      />
    </>
  );
}

/**
 * One task, and the two different powers over it.
 *
 * An assignee may move percentage, status, hours and the blocked reason —
 * that is the operation this module exists to make cheap. Retitling,
 * rescheduling and handing the work to somebody else are planning decisions
 * and only appear for whoever manages the project. The backend refuses the
 * difference explicitly rather than ignoring it, so nothing here is a
 * courtesy: a control offered to the wrong person would fail loudly.
 */
function TaskRow({
  projectId,
  task,
  canManage,
  onChanged,
}: {
  projectId: string;
  task: ProjectOut["tasks"][number];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(task.status);
  const [percent, setPercent] = useState(String(task.percent_complete));
  const [blocked, setBlocked] = useState(task.blocked_reason ?? "");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [due, setDue] = useState(task.due_on ?? "");
  const [priority, setPriority] = useState(task.priority);

  const save = useAction(async () => {
    const body: ProjectTaskEditIn = {};
    if (status !== task.status) body.status = status as ProjectTaskEditIn["status"];
    if (percent !== String(task.percent_complete)) body.percent_complete = Number(percent);
    if (blocked !== (task.blocked_reason ?? "")) body.blocked_reason = blocked || null;
    if (canManage && due !== (task.due_on ?? "")) body.due_on = due || null;
    if (canManage && priority !== task.priority) {
      body.priority = priority as ProjectTaskEditIn["priority"];
    }
    if (note.trim()) body.note = note.trim();
    if (hours.trim()) body.hours = hours.trim();
    await api.patch(`/projects/${projectId}/tasks/${task.id}`, body);
    setNote("");
    setHours("");
    onChanged();
  });

  const remove = useAction(async () => {
    await api.del(`/projects/${projectId}/tasks/${task.id}`);
    onChanged();
  });

  return (
    <li className="rounded-[15px] bg-panel-2 p-3.5">
      <div className="flex flex-wrap items-start gap-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-medium text-ink">{task.title}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">
            {[
              task.assignee?.name ?? "Nobody assigned",
              task.due_on ? `due ${dateShort(task.due_on)}` : "no date",
              task.spent_hours ? `${task.spent_hours}h spent` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <PriorityBadge value={task.priority} />
        <TaskStatusBadge value={task.status} />
        {task.overdue && <Badge tone="danger">Late</Badge>}
        <span className="tnum shrink-0 text-[12px] font-semibold text-ink-2">
          {task.percent_complete}%
        </span>
      </div>

      <ProgressBar percent={task.percent_complete} className="mt-2.5" height={4} />

      {task.blocked_reason && !open && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-danger">
          Blocked: {task.blocked_reason}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          {task.detail && (
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
              {task.detail}
            </p>
          )}

          {task.can_update ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Field label="Where it stands">
                  <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                    {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Per cent done">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                  />
                </Field>
                <Field label="Hours today" hint="Added to the time already spent.">
                  <Input
                    inputMode="decimal"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                  />
                </Field>
              </div>

              {status === "blocked" && (
                <Field label="What is in the way" hint="Read on the next status report.">
                  <Input
                    value={blocked}
                    onChange={(event) => setBlocked(event.target.value)}
                  />
                </Field>
              )}

              {canManage && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="Deadline">
                    <Input
                      type="date"
                      value={due}
                      onChange={(event) => setDue(event.target.value)}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    >
                      {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              <Field label="What moved" hint="Goes in the log, not on the task.">
                <Input value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>

              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-[11px] text-ink-4">
                  {save.error ? (
                    <span className="text-danger">{save.error}</span>
                  ) : canManage ? (
                    "Reassigning is done from the People tab."
                  ) : (
                    "The schedule and who holds it are the lead's to change."
                  )}
                </p>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    loading={remove.pending}
                    onClick={() => void remove.run()}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="accent"
                  loading={save.pending}
                  onClick={() => void save.run()}
                >
                  Record it
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[11.5px] text-ink-4">
              Not yours to move. Its assignee records progress on it, or whoever runs the
              project does.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function AddTask({
  project,
  open,
  onClose,
  onAdded,
}: {
  project: ProjectOut;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [assignee, setAssignee] = useState("");
  const [milestone, setMilestone] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimate, setEstimate] = useState("");

  const add = useAction(async () => {
    const body: ProjectTaskIn = {
      title: title.trim(),
      detail: detail.trim() || null,
      assignee_id: assignee || null,
      milestone_id: milestone || null,
      due_on: due || null,
      priority: priority as ProjectTaskIn["priority"],
      estimate_hours: estimate.trim() || null,
    };
    await api.post(`/projects/${project.id}/tasks`, body);
    setTitle("");
    setDetail("");
    setAssignee("");
    setDue("");
    setEstimate("");
    onAdded();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a task"
      description="Whoever it is assigned to is put on the project and told about it — assignment is what makes a project visible to somebody."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={add.pending}
            disabled={!title.trim()}
            onClick={() => void add.run()}
          >
            Add it
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {add.error && <InlineNotice tone="danger">{add.error}</InlineNotice>}
        <Field label="What has to be done" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Detail">
          <Textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Under which milestone">
            <Select value={milestone} onChange={(event) => setMilestone(event.target.value)}>
              <option value="">Not under one</option>
              {project.milestones.map((stone) => (
                <option key={stone.id} value={stone.id}>
                  {stone.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline">
            <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
          </Field>
          <Field
            label="Estimate, in hours"
            hint="Only useful if every task carries one — a half-estimated plan is weighted equally anyway."
          >
            <Input
              inputMode="decimal"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Assign it to" hint="Somebody already on the project, or anybody on a team.">
          <Select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Nobody yet</option>
            {project.members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ── what is in the way ──────────────────────────────────────────────── */

/**
 * Issues, which anybody on the project may raise.
 *
 * Deliberately wider than managing the plan: the person who trips over a
 * blocker is usually not the person running the project, and a module where
 * only the lead can say something is wrong is a module that finds out late.
 * Working an issue is narrower — its owner, whoever raised it, or the lead.
 */
function Issues({ project, onChanged }: { project: ProjectOut; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [needsSupport, setNeedsSupport] = useState(false);

  const raise = useAction(async () => {
    const body: ProjectIssueIn = {
      title: title.trim(),
      detail: detail.trim() || null,
      needs_support: needsSupport,
    };
    await api.post(`/projects/${project.id}/issues`, body);
    setTitle("");
    setDetail("");
    setNeedsSupport(false);
    onChanged();
  });

  const close = useAction(async (issueId: string, status: string) => {
    await api.patch(`/projects/${project.id}/issues/${issueId}`, { status });
    onChanged();
  });

  const open = project.issues.filter(
    (issue) => issue.status === "open" || issue.status === "in_progress",
  );
  const closed = project.issues.filter(
    (issue) => issue.status === "resolved" || issue.status === "closed",
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5">
        <PanelHead
          title="Open issues"
          count={open.length || undefined}
          hint="Anything in the way, whoever noticed it"
        />
        {open.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-ink-4">Nothing raised.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {open.map((issue) => (
              <li key={issue.id} className="rounded-[15px] bg-panel-2 p-3.5">
                <div className="flex flex-wrap items-start gap-2.5">
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                    {issue.title}
                  </span>
                  <PriorityBadge value={issue.priority} />
                  {issue.needs_support && (
                    <Badge tone="warn" icon={TriangleAlert}>
                      Support needed
                    </Badge>
                  )}
                  <Badge tone="neutral">{issue.age_days}d old</Badge>
                </div>
                {issue.detail && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                    {issue.detail}
                  </p>
                )}
                {issue.support_note && (
                  <p className="mt-1.5 rounded-[9px] bg-warn-soft px-2 py-1.5 text-[11.5px] text-warn">
                    {issue.support_note}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-4">
                    {[
                      issue.owner?.name ? `owned by ${issue.owner.name}` : "nobody owns it",
                      `raised ${dateShort(issue.raised_on)}`,
                    ].join(" · ")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Check}
                    loading={close.pending}
                    onClick={() => void close.run(issue.id, "resolved")}
                  >
                    Resolved
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={X}
                    loading={close.pending}
                    onClick={() => void close.run(issue.id, "closed")}
                    title="Overtaken, withdrawn, or decided against — kept apart from resolved so 'how many did we solve' stays answerable."
                  >
                    Close
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {close.error && <p className="mt-2 text-[12px] text-danger">{close.error}</p>}

        {closed.length > 0 && (
          <>
            <p className="micro mt-5 text-ink-4">Settled</p>
            <ul className="mt-2 space-y-1">
              {closed.map((issue) => (
                <li
                  key={issue.id}
                  className="flex items-center gap-2.5 rounded-[11px] bg-panel-2 px-3 py-2 text-[12px] text-ink-3 opacity-75"
                >
                  <span className="min-w-0 flex-1 truncate line-through">{issue.title}</span>
                  <Badge tone={issue.status === "resolved" ? "positive" : "neutral"}>
                    {issue.status === "resolved" ? "Resolved" : "Closed"}
                  </Badge>
                  <span className="tnum shrink-0 text-[11px] text-ink-4">
                    {issue.resolved_on ? dateShort(issue.resolved_on) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel className="p-5">
        <PanelHead title="Raise one" hint="Open to anybody on the project" />
        <div className="mt-4 space-y-3.5">
          <Field label="What is in the way" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Detail">
            <Textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Toggle
            checked={needsSupport}
            onChange={setNeedsSupport}
            label="This needs somebody above us"
            hint="Puts it in the support-needed box on the next status report, which is the part managers read first."
          />
          {raise.error && <InlineNotice tone="danger">{raise.error}</InlineNotice>}
          <Button
            variant="accent"
            icon={Plus}
            loading={raise.pending}
            disabled={!title.trim()}
            onClick={() => void raise.run()}
          >
            Raise it
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ── who is on it ────────────────────────────────────────────────────── */

function People({ project, onChanged }: { project: ProjectOut; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);

  const remove = useAction(async (userId: string) => {
    await api.del(`/projects/${project.id}/members/${userId}`);
    onChanged();
  });

  const setRole = useAction(async (userId: string, role: string) => {
    await api.put(`/projects/${project.id}/members`, { user_id: userId, role });
    onChanged();
  });

  return (
    <>
      <Panel className="p-5">
        <PanelHead
          title="On this project"
          count={project.members.length}
          hint="Being on it is what makes it visible; holding a task is what makes that task yours"
          action={
            project.can_manage && (
              <Button size="sm" variant="accent" icon={Plus} onClick={() => setAdding(true)}>
                Add somebody
              </Button>
            )
          }
        />

        <ul className="mt-4 divide-y divide-line">
          {project.members.map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Avatar name={member.name} seed={member.user_id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{member.name}</p>
                <p className="truncate text-[11.5px] text-ink-4">
                  {[member.email, member.responsibility].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="tnum shrink-0 text-[11.5px] text-ink-4">
                {member.open_tasks} open
              </span>
              {project.can_manage ? (
                <Select
                  value={member.role}
                  onChange={(event) => void setRole.run(member.user_id, event.target.value)}
                  className="w-32 shrink-0"
                  aria-label={`${member.name}'s role`}
                >
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </Select>
              ) : (
                <Badge tone={member.role === "lead" ? "accent" : "neutral"}>
                  {member.role === "lead"
                    ? "Lead"
                    : member.role === "viewer"
                      ? "Viewer"
                      : "Member"}
                </Badge>
              )}
              {project.can_manage && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  loading={remove.pending}
                  onClick={() => void remove.run(member.user_id)}
                  title="Refused while they still hold open work here — the lead decides where it goes rather than it being silently unassigned."
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {(remove.error || setRole.error) && (
          <InlineNotice tone="danger" className="mt-3">
            {remove.error ?? setRole.error}
          </InlineNotice>
        )}

        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
          A viewer reads the board and holds none of the work — for a stakeholder who
          should see it without appearing in workload counts. A project lead is not the
          same as a team lead: the person running the migration may be the person who knows
          the migration.
        </p>
      </Panel>

      <AddMember
        project={project}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          onChanged();
        }}
      />
    </>
  );
}

function AddMember({
  project,
  open,
  onClose,
  onAdded,
}: {
  project: ProjectOut;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [role, setRole] = useState("member");
  const [responsibility, setResponsibility] = useState("");
  const held = new Set(project.members.map((member) => member.user_id));

  const add = useAction(async (member: MemberOut) => {
    await api.put(`/projects/${project.id}/members`, {
      user_id: member.user_id,
      role,
      responsibility: responsibility.trim() || null,
    });
    onAdded();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add somebody"
      description="People are listed by team because that is the only place their Hamdaz user id is published."
      width="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4 pb-4">
        {add.error && <InlineNotice tone="danger">{add.error}</InlineNotice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="As a">
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="member">Member</option>
              <option value="lead">Lead</option>
              <option value="viewer">Viewer</option>
            </Select>
          </Field>
          <Field label="Responsible for" hint="Optional, and shown beside their name.">
            <Input
              value={responsibility}
              maxLength={200}
              onChange={(event) => setResponsibility(event.target.value)}
            />
          </Field>
        </div>
        <PeoplePicker selected={[]} exclude={held} onToggle={(member) => void add.run(member)} />
      </div>
    </Modal>
  );
}

/* ── what moved ──────────────────────────────────────────────────────── */

/**
 * The progress log.
 *
 * The one thing on this screen that is history rather than state, and the
 * reason day/week/month reporting is a query with different bounds rather
 * than four features. Read for the last thirty days by default, which is what
 * the endpoint does when given no dates.
 */
function Log({ project, onChanged }: { project: ProjectOut; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const { data, isLoading, mutate } = useSWR<ProjectUpdateOut[]>(
    withQuery(`/projects/${project.id}/updates`, { limit: 100 }),
  );

  const post = useAction(async () => {
    await api.post(`/projects/${project.id}/updates`, { body: body.trim() });
    setBody("");
    await mutate();
    onChanged();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5">
        <PanelHead
          title="What moved"
          count={data?.length}
          hint="The last thirty days, newest first"
        />
        {isLoading && !data ? (
          <PanelSkeleton lines={6} className="mt-4 bg-transparent p-0" />
        ) : (data?.length ?? 0) === 0 ? (
          <p className="mt-4 text-[12.5px] text-ink-4">
            Nothing has been recorded in the last thirty days. A project with no movement is
            not necessarily stalled, but it is one worth asking about.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data?.map((entry) => (
              <li key={entry.id} className="rounded-[13px] bg-panel-2 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <UpdateKindBadge value={entry.kind} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {entry.subject ?? "—"}
                  </span>
                  <Delta value={entry.percent_delta} />
                  {entry.status_after && <TaskStatusBadge value={entry.status_after} />}
                </div>
                {entry.body && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                    {entry.body}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-ink-4">
                  {[
                    entry.author?.name,
                    relative(entry.created_at),
                    entry.hours ? `${entry.hours}h` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-5">
        <PanelHead title="Write something down" hint="Open to anybody on the project" />
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">
          A note with no numbers attached. A status report that can quote what the people
          doing the work actually said is worth more than one that cannot.
        </p>
        <div className="mt-4 space-y-3">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Site survey done; the riser is narrower than the drawings, so the cable route changes."
            maxLength={4000}
            className="min-h-28"
          />
          {post.error && <InlineNotice tone="danger">{post.error}</InlineNotice>}
          <Button
            variant="accent"
            icon={MessageSquare}
            loading={post.pending}
            disabled={!body.trim()}
            onClick={() => void post.run()}
          >
            Post it
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ── the project itself ──────────────────────────────────────────────── */

function About({ project, onChanged }: { project: ProjectOut; onChanged: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState(project.status);
  const [spend, setSpend] = useState(project.spend_amount ?? "");
  const [budget, setBudget] = useState(project.budget_amount ?? "");
  const [target, setTarget] = useState(project.target_end_on ?? "");
  const [description, setDescription] = useState(project.description ?? "");

  const save = useAction(async () => {
    await api.patch(`/projects/${project.id}`, {
      status,
      spend_amount: spend === "" ? null : spend,
      budget_amount: budget === "" ? null : budget,
      target_end_on: target || null,
      description: description.trim() || null,
    });
    onChanged();
  });

  const archive = useAction(async (restore: boolean) => {
    await api.post(`/projects/${project.id}/${restore ? "restore" : "archive"}`);
    onChanged();
  });

  const remove = useAction(async () => {
    await api.del(`/projects/${project.id}`);
    router.push("/projects");
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5">
        <PanelHead
          title="About"
          action={
            project.can_manage && (
              <Button
                size="sm"
                variant="accent"
                icon={Save}
                loading={save.pending}
                onClick={() => void save.run()}
              >
                Save
              </Button>
            )
          }
        />

        {project.can_manage ? (
          <div className="mt-4 space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="done">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              <Field label="Target end">
                <Input
                  type="date"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </Field>
              <Field label={`Budget (${project.currency})`}>
                <Input
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </Field>
              <Field
                label={`Spent (${project.currency})`}
                hint="Compared against progress, not against the calendar — 80% spent is fine at 80% done."
              >
                <Input
                  inputMode="decimal"
                  value={spend}
                  onChange={(event) => setSpend(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Meta label="Team">{project.team}</Meta>
              <Meta label="Lead">{project.lead?.name ?? "Nobody named"}</Meta>
              <Meta label="Status">
                {project.status === "on_hold" ? "On hold" : project.status}
              </Meta>
              <Meta label="Started">{date(project.start_on)}</Meta>
              <Meta label="Target end">{date(project.target_end_on)}</Meta>
              <Meta label="Budget">
                {money(project.budget_amount, project.currency)}
              </Meta>
            </dl>
            {project.description && (
              <p className="mt-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
                {project.description}
              </p>
            )}
          </>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel className="p-5">
          <PanelHead title="The figures" hint="Everything countable, in one pass" />
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Tally label="Tasks" value={num(project.rollup.tasks_total)} />
            <Tally label="Done" value={num(project.rollup.tasks_done)} tone="positive" />
            <Tally label="Open" value={num(project.rollup.tasks_open)} />
            <Tally label="Milestones" value={num(project.rollup.milestones_total)} />
            <Tally label="Hit" value={num(project.rollup.milestones_done)} tone="positive" />
            <Tally
              label="Late"
              value={num(project.rollup.milestones_overdue)}
              tone={project.rollup.milestones_overdue > 0 ? "danger" : undefined}
            />
          </div>
          {project.budget_amount && (
            <p className="mt-4 text-[11.5px] text-ink-4">
              {money(project.spend_amount, project.currency)} of{" "}
              {money(project.budget_amount, project.currency)} spent at{" "}
              {project.rollup.percent_complete}% complete.
            </p>
          )}
        </Panel>

        {project.can_administer && (
          <Panel className="p-5">
            <PanelHead title="Danger zone" />
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Archiving keeps the project, its plan and its history but takes it out of
              every live view — and an archived project is managed by nobody. Deleting is
              permanent and takes the plan with it; reports already filed against it
              survive, because each keeps its own copy of what it said.
            </p>
            {(archive.error || remove.error) && (
              <InlineNotice tone="danger" className="mt-3">
                {archive.error ?? remove.error}
              </InlineNotice>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                icon={project.archived ? ArchiveRestore : Archive}
                loading={archive.pending}
                onClick={() => void archive.run(project.archived)}
              >
                {project.archived ? "Restore" : "Archive"}
              </Button>
              {confirming ? (
                <>
                  <Button
                    variant="danger"
                    icon={Trash2}
                    loading={remove.pending}
                    onClick={() => void remove.run()}
                  >
                    Delete it permanently
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button variant="ghost" icon={Trash2} onClick={() => setConfirming(true)}>
                  Delete
                </Button>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
