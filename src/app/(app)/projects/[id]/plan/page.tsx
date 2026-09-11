"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Flag, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { date, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { MilestoneEditIn, MilestoneIn, ProjectOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  LinkButton,
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
import {
  MILESTONE_STATE_LABELS,
  MilestoneStateBadge,
  PLAN_LABELS,
  PlanBadge,
  ProgressBar,
  Timeline,
} from "@/components/projects/ProjectBits";

/**
 * The plan, on a timeline.
 *
 * Separate from the project's work tab because these are two different
 * readings of the same rows: a task list answers "what is anybody doing", and
 * this answers "will the dates hold". The chart is the thing people open a
 * status report for, so it is worth a screen where it is the whole page
 * rather than a strip.
 *
 * **A milestone's percentage is not typed where it has tasks under it.** It is
 * derived from that work, so two numbers claiming to be the same thing cannot
 * disagree — the box below only takes effect on a milestone nothing hangs off
 * yet, which is how a plan sketched before it is broken down still shows
 * movement. The editor says so rather than letting somebody type a figure that
 * is silently ignored.
 */
export default function ProjectPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, mutate } = useSWR<ProjectOut>(`/projects/${id}`);
  const [editing, setEditing] = useState<ProjectOut["milestones"][number] | "new" | null>(
    null,
  );

  if (error) {
    return (
      <>
        <PageHead eyebrow="Projects" title="Plan" />
        <ErrorState error={error} onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        <PageHead eyebrow="Projects" title="Plan" />
        <PanelSkeleton lines={8} />
      </>
    );
  }

  const stones = data.milestones;
  const key = stones.filter((stone) => stone.is_key);
  const slipped = stones.filter((stone) => (stone.slip_days ?? 0) > 0);

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/projects/${id}`}>{data.name}</Link>}
        title="Plan and milestones"
        lead="Where the dates stand, and how far each has moved from where the plan first put it."
        count={num(stones.length)}
        actions={
          <>
            <LinkButton href={`/projects/${id}`}>The project</LinkButton>
            {data.can_manage && (
              <Button variant="accent" icon={Plus} onClick={() => setEditing("new")}>
                Add a milestone
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Milestones" value={num(stones.length)} />
        <StatBox
          label="Hit"
          value={num(data.rollup.milestones_done)}
          hint="Marked done. The percentage beside each is its own work, not the calendar."
        />
        <StatBox
          label="Overdue"
          value={num(data.rollup.milestones_overdue)}
          tone={data.rollup.milestones_overdue > 0 ? "danger" : undefined}
        />
        <StatBox
          label="Slipped"
          value={num(slipped.length)}
          tone={slipped.length > 0 ? "second" : undefined}
          hint="Moved from where the plan first put them. The gap is drawn as a hollow marker on the chart."
        />
      </div>

      {key.length > 0 && (
        <p className="text-[11.5px] text-ink-4">
          {key.length} of these {key.length === 1 ? "is" : "are"} marked key — the diamond
          on the left. A slip on one of those is the kind that moves a promise.
        </p>
      )}

      <Panel className="p-5">
        <PanelHead
          title="The timeline"
          hint="Bars fill with completion, not with elapsed time"
        />
        <div className="mt-4">
          {stones.length === 0 ? (
            <Empty
              icon={Flag}
              title="Nothing planned yet"
              body={
                data.can_manage
                  ? "Add the milestones the plan turns on. Tasks hang off them, and each milestone's percentage follows the work underneath it."
                  : "The project's lead has not put a plan in yet."
              }
              action={
                data.can_manage && (
                  <Button variant="accent" icon={Plus} onClick={() => setEditing("new")}>
                    Add a milestone
                  </Button>
                )
              }
            />
          ) : (
            <Timeline
              milestones={stones}
              onOpen={
                data.can_manage
                  ? (stoneId) =>
                      setEditing(stones.find((stone) => stone.id === stoneId) ?? null)
                  : undefined
              }
            />
          )}
        </div>
        {stones.length > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
            The thin vertical line is today. A hollow ring marks where the plan first put a
            milestone, so the distance between it and the bar&rsquo;s end is the slip —
            redrawing the chart around each reschedule would erase the only evidence that
            anything moved.
          </p>
        )}
      </Panel>

      {stones.length > 0 && (
        <Panel className="p-5">
          <PanelHead
            title="Each one in full"
            hint="What is under it, and where it stands"
          />
          <ul className="mt-4 space-y-2">
            {stones.map((stone) => (
              <li key={stone.id} className="rounded-[15px] bg-panel-2 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  {stone.is_key && <Badge tone="accent">Key</Badge>}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {stone.name}
                  </span>
                  <MilestoneStateBadge value={stone.state} />
                  <PlanBadge value={stone.plan} />
                  {data.can_manage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(stone)}>
                      Edit
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <ProgressBar
                    percent={stone.percent_complete}
                    className="min-w-0 flex-1"
                    height={5}
                  />
                  <span className="tnum shrink-0 text-[11.5px] font-semibold text-ink-2">
                    {stone.percent_complete}%
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-4">
                  {[
                    stone.owner?.name ?? "nobody owns it",
                    stone.task_count
                      ? `${stone.task_count} ${stone.task_count === 1 ? "task" : "tasks"} under it`
                      : "no tasks under it — the percentage above is typed",
                    stone.due_on ? `due ${date(stone.due_on)}` : "no date",
                  ].join(" · ")}
                </p>
                {stone.detail && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                    {stone.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <MilestoneEditor
        project={data}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void mutate();
        }}
      />
    </>
  );
}

/* ── adding and changing one ─────────────────────────────────────────── */

function MilestoneEditor({
  project,
  editing,
  onClose,
  onSaved,
}: {
  project: ProjectOut;
  editing: ProjectOut["milestones"][number] | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editing && editing !== "new" ? editing : null;

  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [owner, setOwner] = useState("");
  const [startOn, setStartOn] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [doneOn, setDoneOn] = useState("");
  const [percent, setPercent] = useState("");
  const [plan, setPlan] = useState("on_plan");
  const [isKey, setIsKey] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);

  // Re-seeded when the dialog is pointed at a different milestone. Done in
  // render rather than in an effect so the fields are never briefly the
  // previous milestone's.
  const token = existing?.id ?? (editing === "new" ? "new" : null);
  if (token !== seen) {
    setSeen(token);
    setName(existing?.name ?? "");
    setDetail(existing?.detail ?? "");
    setOwner(existing?.owner?.id ?? "");
    setStartOn(existing?.start_on ?? "");
    setDueOn(existing?.due_on ?? "");
    setDoneOn(existing?.done_on ?? "");
    setPercent(existing ? String(existing.percent_complete) : "");
    setPlan(existing?.plan ?? "on_plan");
    setIsKey(existing?.is_key ?? false);
  }

  const save = useAction(async () => {
    if (existing) {
      const body: MilestoneEditIn = {
        name: name.trim(),
        detail: detail.trim() || null,
        owner_id: owner || null,
        start_on: startOn || null,
        due_on: dueOn || null,
        done_on: doneOn || null,
        percent_complete: percent === "" ? null : Number(percent),
        plan: plan as MilestoneEditIn["plan"],
        is_key: isKey,
      };
      await api.patch(`/projects/${project.id}/milestones/${existing.id}`, body);
    } else {
      const body: MilestoneIn = {
        name: name.trim(),
        detail: detail.trim() || null,
        owner_id: owner || null,
        start_on: startOn || null,
        due_on: dueOn || null,
        is_key: isKey,
      };
      await api.post(`/projects/${project.id}/milestones`, body);
    }
    onSaved();
  });

  const remove = useAction(async () => {
    if (!existing) return;
    await api.del(`/projects/${project.id}/milestones/${existing.id}`);
    onSaved();
  });

  const derived = (existing?.task_count ?? 0) > 0;

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={existing ? existing.name : "Add a milestone"}
      description={
        existing
          ? "Moving the date leaves the original where it was, so the slip stays visible."
          : "Where the date is set now becomes the baseline every later change is measured against."
      }
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              icon={Trash2}
              loading={remove.pending}
              onClick={() => void remove.run()}
              title="The tasks underneath stay — deleting a milestone is a re-plan, and the work below it is usually the reason for it."
            >
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Save}
            loading={save.pending}
            disabled={!name.trim()}
            onClick={() => void save.run()}
          >
            {existing ? "Save" : "Add it"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {(save.error || remove.error) && (
          <InlineNotice tone="danger">{save.error ?? remove.error}</InlineNotice>
        )}

        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Detail">
          <Textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input
              type="date"
              value={startOn}
              onChange={(event) => setStartOn(event.target.value)}
            />
          </Field>
          <Field label="Due">
            <Input
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Owner" hint="Somebody on the project.">
          <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">Nobody</option>
            {project.members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>

        {existing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Per cent complete"
                hint={
                  derived
                    ? `Ignored — ${existing.task_count} tasks hang off this, and they decide.`
                    : "Typed, because nothing hangs off this yet."
                }
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  disabled={derived}
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                />
              </Field>
              <Field label="Marked done on">
                <Input
                  type="date"
                  value={doneOn}
                  onChange={(event) => setDoneOn(event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Against the plan"
              hint="A slip with knock-on impact is a decision somebody has to make; one without is information."
            >
              <Select value={plan} onChange={(event) => setPlan(event.target.value)}>
                {Object.entries(PLAN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            {existing.slip_days !== null && existing.slip_days !== 0 && (
              <InlineNotice tone="info">
                This has moved {Math.abs(existing.slip_days)} days{" "}
                {existing.slip_days > 0 ? "later" : "earlier"} than the plan first said, and
                currently reads as{" "}
                {(MILESTONE_STATE_LABELS[existing.state] ?? existing.state).toLowerCase()}.
              </InlineNotice>
            )}
          </>
        )}

        <Toggle
          checked={isKey}
          onChange={setIsKey}
          label="A key milestone"
          hint="The ones a slip would move a promise on. Marked with a diamond on the chart."
        />
      </div>
    </Modal>
  );
}
