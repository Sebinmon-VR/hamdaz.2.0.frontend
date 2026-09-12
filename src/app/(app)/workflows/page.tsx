"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Play, RefreshCw, Workflow } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { num, relative, truncate } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { MyTasksOut, WorkflowRunOut, WorkflowRunSummaryOut, WorkflowOut } from "@/lib/types";
import { isOpenRun, runStatus, useRuns, useWorkflows } from "@/lib/workflows";
import { Badge, PageHead, Panel, Row, RowHead, StatBox } from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  PillRail,
  SearchInput,
  Select,
  Toggle,
} from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";

type Filter = "open" | "waiting_user" | "waiting_event" | "running" | "finished" | "all";

export default function WorkflowsPage() {
  return (
    // useSearchParams needs a Suspense boundary above it or the whole route
    // opts out of static rendering and Next says so at build time.
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <Runs />
    </Suspense>
  );
}

/**
 * The runs this person can see, and the way to start another.
 *
 * Everything is fetched and the filters are applied here rather than asked
 * for: the endpoint takes one `open` flag, and the rail wants a count on each
 * pill, which six requests and a merge would answer worse than one list.
 *
 * "Waiting on you" leads the rail because it is the only pill that names
 * something the reader has to do. The other two open states are the run's
 * business, and the finished ones are history.
 */
function Runs() {
  const router = useRouter();
  const params = useSearchParams();
  // A task page links here with `?task=` to start a flow on that task. The
  // modal opens on arrival with the id filled in, so the link is one click
  // rather than a hint about where a button is.
  const taskFromUrl = params.get("task");

  const [mine, setMine] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(Boolean(taskFromUrl));

  const { data, error, isLoading, isValidating, mutate } = useRuns({ mine });

  const all = data ?? [];
  const count = (status: string) => all.filter((r) => r.status === status).length;
  const open = all.filter((r) => isOpenRun(r.status)).length;

  const needle = search.trim().toLowerCase();
  const rows = all
    .filter((r) => {
      if (filter === "open") return isOpenRun(r.status);
      if (filter === "finished") return !isOpenRun(r.status);
      if (filter === "all") return true;
      return r.status === filter;
    })
    .filter(
      (r) =>
        !needle ||
        (r.subject_label ?? "").toLowerCase().includes(needle) ||
        r.subject_id.toLowerCase().includes(needle) ||
        r.tag.toLowerCase().includes(needle) ||
        r.workflow_name.toLowerCase().includes(needle) ||
        r.owner_name.toLowerCase().includes(needle),
    );

  return (
    <>
      <PageHead
        title="Workflows"
        count={data ? num(rows.length) : undefined}
        lead="A team's process, run one task at a time. Each run acts as the person who started it."
        actions={
          <>
            <Toggle checked={mine} onChange={setMine} label="Mine" />
            <Button icon={RefreshCw} loading={isValidating} onClick={() => mutate()}>
              Refresh
            </Button>
            <Button variant="accent" icon={Play} onClick={() => setStarting(true)}>
              Start a workflow
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox
          label="Waiting on you"
          value={num(count("waiting_user"))}
          tone={count("waiting_user") > 0 ? "second" : undefined}
          hint="Runs stopped on a question only the owner can answer."
        />
        <StatBox
          label="Waiting on the world"
          value={num(count("waiting_event"))}
          hint="Runs waiting for a supplier's reply or an approval."
        />
        <StatBox label="Running" value={num(count("running"))} />
        <StatBox
          label="Failed"
          value={num(count("failed"))}
          tone={count("failed") > 0 ? "danger" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Task, tag, flow or owner"
          className="w-full max-w-xs"
        />
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Still going", count: open },
            { value: "waiting_user", label: "Waiting on you", count: count("waiting_user") },
            { value: "waiting_event", label: "Waiting outside", count: count("waiting_event") },
            { value: "running", label: "Running", count: count("running") },
            { value: "finished", label: "Finished", count: all.length - open },
            { value: "all", label: "Everything", count: all.length },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Workflow}
          title={
            needle ? "Nothing matches" : all.length === 0 ? "No runs yet" : "Nothing under this filter"
          }
          body={
            needle
              ? "Try part of a task title, a run's tag, or the flow's name."
              : all.length === 0
                ? "A run takes one task through a team's process — reading its documents, finding suppliers, asking for quotes and taking the answer into Zoho — stopping to ask you whenever it needs a decision."
                : "Runs in other states are one pill away."
          }
          action={
            !needle &&
            all.length === 0 && (
              <Button variant="accent" icon={Play} onClick={() => setStarting(true)}>
                Start a workflow
              </Button>
            )
          }
        />
      ) : (
        <Panel className="overflow-hidden py-2">
          <RowHead className="hidden sm:flex">
            <span className="micro w-24 text-ink-4">Tag</span>
            <span className="micro flex-1 text-ink-4">Task</span>
            <span className="micro w-44 text-ink-4">Status</span>
            <span className="micro w-16 text-right text-ink-4">Step</span>
            <span className="micro w-24 text-right text-ink-4">Started</span>
          </RowHead>

          {rows.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </Panel>
      )}

      <StartDialog
        open={starting}
        initialTask={taskFromUrl}
        onClose={() => setStarting(false)}
        onStarted={(run) => {
          setStarting(false);
          router.push(`/workflows/runs/${run.id}`);
        }}
      />
    </>
  );
}

/**
 * The rows collapse to two lines on a phone: the tag and dates are the first
 * things worth giving up, the task and the status the last.
 */
function RunRow({ run }: { run: WorkflowRunSummaryOut }) {
  const status = runStatus(run.status);
  return (
    <Link href={`/workflows/runs/${run.id}`} className="block">
      <Row className="h-auto min-h-[33px] cursor-pointer flex-wrap py-1.5 sm:h-[33px] sm:flex-nowrap sm:py-0">
        <span className="tnum hidden w-24 shrink-0 truncate text-[12px] text-ink-3 sm:block">
          {run.tag}
        </span>

        <span className="min-w-0 flex-1 basis-full truncate text-[13px] font-medium sm:basis-auto">
          {run.subject_label ?? run.subject_id}
          <span className="ml-2 text-[11.5px] font-normal text-ink-4">{run.workflow_name}</span>
          <span className="ml-2 hidden text-[11px] text-ink-4 md:inline">{run.owner_name}</span>
        </span>

        <span className="flex w-44 shrink-0 items-center gap-1.5">
          <Badge tone={status.tone} title={status.hint}>
            {status.label}
          </Badge>
          {run.waiting_for && (
            <span
              className="hidden min-w-0 truncate text-[11px] text-ink-4 lg:block"
              title={run.waiting_for}
            >
              {truncate(run.waiting_for, 28)}
            </span>
          )}
        </span>

        <span
          className="tnum w-16 shrink-0 text-right text-[12px] text-ink-2"
          title={run.current_step ?? undefined}
        >
          {Math.min(run.step_index + 1, run.step_count)}/{run.step_count}
        </span>

        <span className="tnum hidden w-24 shrink-0 text-right text-[12px] text-ink-3 sm:block">
          {relative(run.started_at)}
        </span>
      </Row>
    </Link>
  );
}

/* ── starting one ────────────────────────────────────────────────────── */

/**
 * Pick a flow, pick a task, go.
 *
 * The task picker reads the caller's own open proposals — the same list as
 * My tasks — because that is what a run is started on. It needs the proposals
 * module, which a workflows user may not have; when the list cannot be read
 * the id can still be typed, so the picker is a convenience rather than a
 * gate. The backend resolves the task itself when the run begins.
 */
function StartDialog({
  open,
  initialTask,
  onClose,
  onStarted,
}: {
  open: boolean;
  initialTask: string | null;
  onClose: () => void;
  onStarted: (run: WorkflowRunOut) => void;
}) {
  const flows = useWorkflows();
  const tasks = useSWR<MyTasksOut>(
    open ? withQuery("/proposals/my-tasks", { open_only: true, limit: 500 }) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [flowKey, setFlowKey] = useState("");
  const [taskId, setTaskId] = useState(initialTask ?? "");
  const [seenInitial, setSeenInitial] = useState(initialTask);
  if (initialTask !== seenInitial) {
    setSeenInitial(initialTask);
    setTaskId(initialTask ?? "");
  }

  const available = (flows.data ?? []).filter((f) => f.enabled && !f.archived_at);
  // One flow is the common case for a long while; picking it for the person
  // saves the click without hiding the choice when there are more.
  const chosenKey = flowKey || (available.length === 1 ? available[0].key : "");
  const chosen = available.find((f) => f.key === chosenKey) ?? null;
  const task = tasks.data?.tasks.find((t) => t.id === taskId.trim()) ?? null;

  const start = useAction(async (flow: WorkflowOut) =>
    api.post<WorkflowRunOut>(`/workflows/${flow.key}/runs`, {
      subject_id: taskId.trim(),
      subject_label: task?.title ?? null,
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a workflow"
      description="The run is yours: every question it asks, it asks you, and everything it does, it does as you."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Play}
            loading={start.pending}
            disabled={!chosen || !taskId.trim()}
            onClick={async () => {
              if (!chosen) return;
              const run = await start.run(chosen);
              if (run) onStarted(run);
            }}
          >
            Start
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {start.error && <InlineNotice tone="danger">{start.error}</InlineNotice>}

        {flows.error ? (
          <ErrorState error={flows.error} onRetry={() => flows.mutate()} />
        ) : !flows.data ? (
          <RowsSkeleton rows={2} />
        ) : available.length === 0 ? (
          <InlineNotice tone="info">
            No workflow is available to your teams. A super admin builds them under
            Administration.
          </InlineNotice>
        ) : (
          <div>
            <p className="mb-2 text-[12px] text-ink-3">Which process</p>
            <ul className="space-y-1.5">
              {available.map((flow) => {
                const on = flow.key === chosenKey;
                return (
                  <li key={flow.key}>
                    <button
                      type="button"
                      onClick={() => setFlowKey(flow.key)}
                      aria-pressed={on}
                      className={
                        on
                          ? "w-full rounded-[13px] bg-accent-soft px-3.5 py-3 text-left ring-1 ring-accent"
                          : "w-full rounded-[13px] bg-panel-2 px-3.5 py-3 text-left transition hover:bg-panel-3"
                      }
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink">{flow.name}</span>
                        {flow.team_name && <Badge tone="neutral">{flow.team_name}</Badge>}
                        <span className="tnum text-[11px] text-ink-4">
                          {flow.steps.length} steps
                          {flow.open_runs > 0 ? ` · ${flow.open_runs} running` : ""}
                        </span>
                      </span>
                      {flow.description && (
                        <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
                          {flow.description}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tasks.data && tasks.data.tasks.length > 0 && (
          <Field label="Which task" hint="Your open proposals, soonest deadline first.">
            <Select value={task ? task.id : ""} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Pick one, or type an id below</option>
              {tasks.data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {truncate(t.title, 70)}
                  {t.end_user ? ` — ${t.end_user}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label={tasks.data?.tasks.length ? "Or a task id" : "Task id"}
          required
          hint={
            tasks.error
              ? "Your task list could not be read, so the id has to be typed. It is the number of the item in the Proposals list."
              : "The Proposals list item this run is about."
          }
        >
          <Input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="1234"
            inputMode="numeric"
          />
        </Field>

        {chosen && task && (
          <p className="text-[11.5px] text-ink-4">
            Starts <strong className="text-ink-2">{chosen.name}</strong> on{" "}
            <strong className="text-ink-2">{truncate(task.title, 60)}</strong>.
          </p>
        )}
      </div>
    </Modal>
  );
}
