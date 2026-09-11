"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, Map as MapIcon, Plus, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { BoardOut, MyProjectTaskOut, ProjectTaskEditIn } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  PanelHead,
  Row,
  RowHead,
  StatBox,
} from "@/components/ui/primitives";
import { Button, Input, LinkButton, Select } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import {
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
  RagDot,
  Roadmap,
  TASK_STATUS_LABELS,
  TaskStatusBadge,
  toRoadmap,
  Trend,
} from "@/components/projects/ProjectBits";

/**
 * What is on this person's plate, and where it lives.
 *
 * The landing page of the module, and deliberately the destination the rail
 * points at rather than the list of every project: the question somebody
 * arrives with is "what is mine" far more often than "what exists".
 *
 * **Served as one call.** `/projects/board` returns the tasks, the projects
 * they belong to and the portfolio figures together — three round trips to
 * draw one screen is how a dashboard earns a reputation for being slow — and
 * every figure in it is already narrowed to what this caller may read.
 *
 * **Progress is recorded here, not only on the project page.** Moving a task
 * along is the one thing an ordinary member does daily, and making them open
 * the project first would be the friction that stops it happening. What they
 * may change is exactly what the backend allows an assignee — percentage,
 * status, and a note about why — and the note is the part that turns a
 * percentage into something a status report can quote.
 */
export default function ProjectBoardPage() {
  const session = useSession();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BoardOut>(
    session.can("projects") ? "/projects/board" : null,
  );

  if (!session.can("projects")) {
    return (
      <>
        <PageHead eyebrow="Projects" title="My work" />
        <Empty
          icon={ShieldAlert}
          title="Not your module yet"
          body="Projects has not been granted to a team you are on. An administrator grants it under Team access."
        />
      </>
    );
  }

  const tasks = data?.tasks ?? [];
  const portfolio = data?.portfolio;

  return (
    <>
      <PageHead
        eyebrow="Projects"
        title="My work"
        lead="Everything assigned to you, across every project you are on."
        count={data ? num(data.my_open_tasks) : undefined}
        actions={
          <>
            <LinkButton href="/projects" icon={FolderKanban}>
              All projects
            </LinkButton>
            <LinkButton href="/projects/portfolio" icon={MapIcon}>
              Portfolio
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Open tasks" value={num(data?.my_open_tasks ?? 0)} />
        <StatBox
          label="Overdue"
          value={num(data?.my_overdue_tasks ?? 0)}
          tone={(data?.my_overdue_tasks ?? 0) > 0 ? "danger" : undefined}
          hint="Not done, and the date has passed. Judged on the date rather than on any status."
        />
        <StatBox label="Due within 7 days" value={num(data?.my_due_this_week ?? 0)} />
        <StatBox
          label="Projects you are on"
          value={num(data?.projects.length ?? 0)}
          hint="Being on a project is what makes it yours to see. Holding a task adds you to it."
        />
      </div>

      {portfolio && portfolio.stale_health > 0 && (
        <InlineNotice tone="warn">
          {portfolio.stale_health}{" "}
          {portfolio.stale_health === 1 ? "project has" : "projects have"} dials nobody has
          confirmed for a fortnight. Grey and stale-green are not evidence that anything is
          fine — the lead has simply not said.
        </InlineNotice>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={6} />
        </Panel>
      ) : (
        <>
          {/* Every project you are on, on one axis, before the work itself.
              The tasks below answer "what am I doing today"; this answers
              "where is it all going", and that question is the one nobody
              could see an answer to without opening three projects. */}
          {(data?.projects.length ?? 0) > 0 && (
            <Panel className="px-2 py-4">
              <div className="px-2.5 pb-3">
                <PanelHead
                  title="Timeline"
                  count={data?.projects.length}
                  hint="The projects your work belongs to, not their tasks"
                />
              </div>
              <Roadmap
                projects={(data?.projects ?? []).map(toRoadmap)}
                onOpen={(id) => router.push(`/projects/${id}`)}
              />
            </Panel>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Panel className="p-5">
            <PanelHead
              title="Your tasks"
              count={tasks.length || undefined}
              hint="Soonest first. Undated last — unplanned is not urgent."
            />
            {tasks.length === 0 ? (
              <Empty
                className="mt-4"
                icon={FolderKanban}
                title="Nothing is assigned to you"
                body="A task becomes yours when a project lead assigns it, which also puts you on the project."
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} onChanged={() => void mutate()} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="py-2">
            <div className="px-5 pt-3">
              <PanelHead
                title="Where it lives"
                count={data?.projects.length}
                hint="The projects your work belongs to"
                action={
                  <LinkButton href="/projects" size="sm" icon={Plus}>
                    All
                  </LinkButton>
                }
              />
            </div>
            {(data?.projects.length ?? 0) === 0 ? (
              <p className="px-5 py-6 text-[12.5px] text-ink-4">
                You are not on a project yet.
              </p>
            ) : (
              <div className="mt-2">
                <RowHead>
                  <span className="w-3 shrink-0" />
                  <span className="micro min-w-0 flex-1 text-ink-4">Project</span>
                  <span className="micro w-24 shrink-0 text-ink-4">Complete</span>
                  <span className="w-20 shrink-0" />
                </RowHead>
                {data?.projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Row>
                      <RagDot value={project.rag_overall} size={8} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {project.name}
                        <span className="ml-2 text-[11px] text-ink-4">{project.team}</span>
                      </span>
                      <span className="flex w-24 shrink-0 items-center gap-1.5">
                        <ProgressBar
                          percent={project.percent_complete}
                          rag={project.rag_overall}
                          height={4}
                          className="w-12"
                        />
                        <span className="tnum text-[11px] text-ink-3">
                          {project.percent_complete}%
                        </span>
                      </span>
                      <span className="flex w-20 shrink-0 justify-end gap-1">
                        <Trend value={project.trend_overall} />
                        <ProjectStatusBadge value={project.status} />
                      </span>
                    </Row>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          </div>
        </>
      )}
    </>
  );
}

/* ── one task, and moving it along ───────────────────────────────────── */

/**
 * A task with its own save.
 *
 * Unlike the report editor — where everything is held locally and sent in one
 * PATCH because a list sent at all replaces that section — a task edit is a
 * single row on the server and each one is its own act. Saving them together
 * would mean a person recording an afternoon's progress across four projects
 * could lose all four to one failure.
 *
 * The three controls are exactly what the backend lets an assignee change.
 * Reassigning, rescheduling and retitling are refused there as planning
 * decisions, so they are not offered here — a control that always 403s is
 * worse than no control.
 */
function TaskCard({ task, onChanged }: { task: MyProjectTaskOut; onChanged: () => void }) {
  const [status, setStatus] = useState(task.status);
  const [percent, setPercent] = useState(String(task.percent_complete));
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [open, setOpen] = useState(false);

  const dirty =
    status !== task.status ||
    percent !== String(task.percent_complete) ||
    note.trim() !== "" ||
    hours.trim() !== "";

  const save = useAction(async () => {
    const body: ProjectTaskEditIn = {};
    if (status !== task.status) body.status = status as ProjectTaskEditIn["status"];
    if (percent !== String(task.percent_complete)) body.percent_complete = Number(percent);
    // Both go into the progress log rather than onto the task. A note with
    // nothing else is a valid save: "nothing moved this week, here is why" is
    // one of the more useful things a report can quote.
    if (note.trim()) body.note = note.trim();
    if (hours.trim()) body.hours = hours.trim();
    await api.patch(`/projects/${task.project_id}/tasks/${task.id}`, body);
    setNote("");
    setHours("");
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
            {task.project_name}
            {task.project_code ? ` · ${task.project_code}` : ""}
            {task.due_on ? ` · due ${dateShort(task.due_on)}` : " · no date"}
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

      {task.blocked_reason && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-danger">
          Blocked: {task.blocked_reason}
        </p>
      )}

      {open &&
        (task.can_update ? (
          <div className="mt-3 space-y-2.5 border-t border-line pt-3">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={0}
                max={100}
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                aria-label="Per cent complete"
              />
              <Input
                inputMode="decimal"
                value={hours}
                placeholder="Hours today"
                onChange={(event) => setHours(event.target.value)}
                aria-label="Hours spent today"
              />
            </div>
            <Input
              value={note}
              placeholder="What moved, or why nothing did"
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[11px] text-ink-4">
                {save.error ? (
                  <span className="text-danger">{save.error}</span>
                ) : (
                  "Hours are added to the time already spent, not replaced."
                )}
              </p>
              <Button
                size="sm"
                variant="accent"
                loading={save.pending}
                disabled={!dirty}
                onClick={() => void save.run()}
              >
                Record it
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-4">
            This one is not yours to move — its assignee or the project lead records
            progress on it.
          </p>
        ))}
    </li>
  );
}
