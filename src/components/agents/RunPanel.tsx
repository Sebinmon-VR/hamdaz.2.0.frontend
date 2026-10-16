"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Hourglass,
  Loader2,
  Mail,
  MessageSquare,
  Minus,
  PenLine,
  Play,
  Save,
  Send,
  Sparkles,
  Square,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, relative } from "@/lib/format";
import {
  BLOCKS_BY_KIND,
  GROUP_TONE,
  isLive,
  startsOnItsOwn,
  useRfqs,
  useRun,
  useRuns,
  type Agent,
  type AgentStatus,
  type AgentTask,
  type Rfq,
  type Run,
  type RunStatus,
  type Source,
  type StepResult,
} from "@/lib/agents";
import { Button, FileDrop, Input, SearchInput, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { Badge, Panel, PanelHead, type Tone } from "@/components/ui/primitives";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * Running an agent: pick one of your tasks, press Run, watch it work.
 *
 * Each step lands as it finishes, with what it produced, where every fact
 * came from, and whether the AI model was used (and what it cost) — so the
 * page answers "is this right?" and "what did that cost?" without anybody
 * asking. A step that waits for you shows its question at the top — the same
 * question it asked in Teams, answerable from either.
 */

/** Blocks that may reach the model at all; everything else is the app alone. */
const MAY_USE_AI = new Set(["extract_requirements", "find_suppliers", "summarise", "ask_model", "check", "draft_email"]);

export function RunPanel({
  agent,
  dirty,
  initialRunId,
  onSave,
  saving,
}: {
  agent: Agent;
  dirty: boolean;
  initialRunId: string | null;
  onSave: () => void;
  saving: boolean;
}) {
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const runs = useRuns(agent.id);
  const selected = runId ?? runs.data?.[0]?.id ?? null;

  return (
    <div className="grid gap-3.5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-3.5">
        <StartPanel
          agent={agent}
          dirty={dirty}
          onSave={onSave}
          saving={saving}
          onStarted={(run) => {
            setRunId(run.id);
            void runs.mutate();
          }}
        />
        <Panel className="p-4">
          <PanelHead title="Runs" count={runs.data?.length || undefined} />
          <div className="mt-3 space-y-1">
            {runs.error ? (
              <ErrorState error={runs.error} />
            ) : !runs.data ? (
              <RowsSkeleton rows={3} />
            ) : runs.data.length === 0 ? (
              <p className="px-1 py-3 text-[12.5px] text-ink-4">No runs yet.</p>
            ) : (
              runs.data.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRunId(r.id)}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left transition",
                    r.id === selected ? "bg-row text-row-ink" : "hover:bg-panel-2",
                  )}
                >
                  <StatusDot status={r.status} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                      <span className="truncate">{r.task_title || "Files only"}</span>
                      {r.started_by === "trigger" && <Zap className="size-3 shrink-0 text-info" aria-label="Started on its own" />}
                    </span>
                    <span className={clsx("block text-[11px]", r.id === selected ? "text-row-ink-2" : "text-ink-4")}>
                      {relative(r.created_at)} · {cost(r.cost_usd)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Panel>
      </div>

      {selected ? (
        <RunView runId={selected} agent={agent} onChanged={() => void runs.mutate()} />
      ) : (
        <Panel className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <AgentAvatar spec={agent.avatar} size={120} />
          <p className="mt-5 text-[15px] font-semibold">
            {startsOnItsOwn(agent) ? "It starts on its own" : "Pick a task and press Run"}
          </p>
          <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
            {startsOnItsOwn(agent)
              ? `When a task is assigned to you, ${agent.name || "your agent"} asks you in Teams for its documents and gets to work. Its runs show up here.`
              : `${agent.name || "Your agent"} works through its steps on that task. You will see each result here, with where it came from.`}
          </p>
        </Panel>
      )}
    </div>
  );
}

/* ── starting a run ──────────────────────────────────────────────────── */

function StartPanel({
  agent,
  dirty,
  onSave,
  saving,
  onStarted,
}: {
  agent: Agent;
  dirty: boolean;
  onSave: () => void;
  saving: boolean;
  onStarted: (run: Run) => void;
}) {
  const tasks = useSWR<AgentTask[]>("/agents/tasks");
  const status = useSWR<AgentStatus>("/agents/status");
  const [taskId, setTaskId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Try the always-on start on a task already in the list.
  const [asAssigned, setAsAssigned] = useState(false);
  const canPretend = agent.steps[0]?.kind === "start_new_task";

  const needle = search.trim().toLowerCase();
  const shown = (tasks.data ?? []).filter((t) => !needle || `${t.title} ${t.end_user ?? ""}`.toLowerCase().includes(needle));
  const aiSteps = agent.steps.filter((s) => MAY_USE_AI.has(s.kind)).length;

  async function run() {
    setStarting(true);
    setFailed(null);
    try {
      const form = new FormData();
      if (taskId) form.append("task_id", taskId);
      if (taskId && canPretend && asAssigned) form.append("as_assigned", "true");
      for (const f of files) form.append("files", f);
      const started = await api.upload<Run>(`/agents/${agent.id}/runs`, form);
      setFiles([]);
      onStarted(started);
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "It could not start.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Panel className="p-4">
      {startsOnItsOwn(agent) && <AloneNote agent={agent} status={status.data} />}
      <PanelHead title={startsOnItsOwn(agent) ? "Or run it now on" : "Run it on"} />
      {dirty && (
        <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-warn-soft px-3 py-2 text-[12px] text-warn">
          <span className="flex-1">Unsaved changes — a run uses the saved version.</span>
          <Button size="sm" variant="outline" icon={Save} loading={saving} onClick={onSave}>
            Save
          </Button>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Find one of your tasks" className="mt-3" />
      <div className="mt-2 max-h-[260px] space-y-1 overflow-y-auto pr-1">
        <TaskOption on={taskId === ""} onClick={() => setTaskId("")} title="No task — just the files I add" />
        {tasks.error ? (
          <p className="px-2 py-2 text-[12px] text-danger">Your tasks could not be loaded.</p>
        ) : !tasks.data ? (
          <RowsSkeleton rows={3} />
        ) : shown.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-ink-4">{needle ? "No task matches." : "You have no open tasks."}</p>
        ) : (
          shown.map((t) => (
            <TaskOption
              key={t.id}
              on={taskId === t.id}
              onClick={() => setTaskId(t.id)}
              title={t.title}
              sub={[t.end_user, t.deadline && `closes ${dateShort(t.deadline)}`].filter(Boolean).join(" · ")}
            />
          ))
        )}
      </div>

      <FileDrop
        className="mt-3"
        onFiles={(picked) => setFiles((now) => [...now, ...picked].slice(0, 10))}
        label="Add files to this run"
        hint="Optional. PDF, Excel, Word, CSV or images — read alongside the task's own documents."
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-[10px] bg-panel-2 px-3 py-1.5 text-[12px]">
              <FileText className="size-3.5 text-ink-4" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((now) => now.filter((_, n) => n !== i))}
                className="text-ink-4 hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canPretend && taskId && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[12px] bg-panel-2 px-3 py-2.5 text-[12px]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={asAssigned}
            onChange={(e) => setAsAssigned(e.target.checked)}
          />
          <span>
            <span className="block font-medium">As if it was just assigned to me</span>
            <span className="block text-ink-4">
              To try the always-on start: it says it is on it, or asks you for the documents, just as it would for a new task.
            </span>
          </span>
        </label>
      )}

      {failed && <InlineNotice tone="danger" className="mt-3">{failed}</InlineNotice>}

      <Button
        variant="accent"
        icon={Play}
        className="mt-4 w-full"
        loading={starting}
        disabled={agent.steps.length === 0 || (!taskId && files.length === 0)}
        onClick={run}
      >
        Run {agent.name || "agent"}
      </Button>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-4">
        The app does the work first. {aiSteps ? (
          <>
            {aiSteps} step{aiSteps === 1 ? "" : "s"} may ask{" "}
            <span className="font-medium text-ink-3">{modelName(status.data?.model)}</span> for what the app cannot work
            out — usually a fraction of a cent.
          </>
        ) : (
          "None of its steps needs the AI model."
        )}
        {status.data && !status.data.configured && aiSteps > 0 && (
          <span className="block text-warn">No AI key is set — those steps will say so; the rest still runs.</span>
        )}
      </p>
    </Panel>
  );
}

/** What an always-on agent does without being asked, and whether this server lets it. */
function AloneNote({ agent, status }: { agent: Agent; status: AgentStatus | undefined }) {
  return (
    <div className="mb-4 rounded-[14px] bg-info-soft px-3.5 py-3 text-[12px] leading-relaxed text-info">
      <p className="flex items-center gap-1.5 font-semibold">
        <Zap className="size-3.5" /> Always on
      </p>
      <p className="mt-1 text-ink-2">
        When a task is assigned to you, {agent.name || "it"} starts on its own: it asks you in Teams for the documents,
        works through its steps, and asks again before sending anything.
      </p>
      {status && !status.triggers_on && (
        <p className="mt-1.5 text-warn">Starting on its own is switched off on this server for now — run it by hand below.</p>
      )}
      {status && !status.teams_on && (
        <p className="mt-1.5 text-warn">Teams is not connected on this server, so it asks you here and in the bell instead.</p>
      )}
    </div>
  );
}

function TaskOption({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-2.5 rounded-[11px] px-2.5 py-2 text-left transition",
        on ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-panel-2",
      )}
    >
      <span className={clsx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-accent bg-accent" : "border-line-strong")}>
        {on && <span className="size-1.5 rounded-full bg-accent-ink" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium leading-snug">{title}</span>
        {sub && <span className="block text-[11px] text-ink-4">{sub}</span>}
      </span>
    </button>
  );
}

/* ── one run ─────────────────────────────────────────────────────────── */

function RunView({ runId, agent, onChanged }: { runId: string; agent: Agent; onChanged: () => void }) {
  const { data: run, error, mutate } = useRun(runId);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!run) return <RowsSkeleton rows={6} />;

  const live = isLive(run.status);

  async function stop() {
    setBusy(true);
    try {
      await mutate(api.post<Run>(`/agents/runs/${runId}/stop`), { revalidate: true });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3.5">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AgentAvatar spec={agent.avatar} size={64} mood={live ? "active" : "idle"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <RunBadge status={run.status} />
              <span className="text-[12px] text-ink-4">{relative(run.created_at)}</span>
            </div>
            <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight">{run.task_title || "Files only"}</h3>
            <p className="mt-1 text-[11.5px] text-ink-4">
              {run.started_by === "trigger" && (
                <span className="text-info">
                  <Zap className="mb-px inline size-3" /> Started on its own when the task was assigned ·{" "}
                </span>
              )}
              {aiUse(run)} · {cost(run.cost_usd)}
            </p>
          </div>
          {live && (
            <Button size="sm" variant="outline" icon={Square} loading={busy} onClick={stop}>
              Stop
            </Button>
          )}
        </div>
        {run.summary && !live && (
          <p
            className={clsx(
              "mt-4 rounded-[14px] px-4 py-3 text-[13px] leading-relaxed",
              run.status === "done" ? "bg-positive-soft text-positive" : "bg-warn-soft text-warn",
            )}
          >
            {run.summary}
          </p>
        )}
        {run.error && <InlineNotice tone="danger" className="mt-3">{run.error}</InlineNotice>}
      </Panel>

      {run.status === "waiting" && run.question && (
        <QuestionCard run={run} onAnswered={() => void mutate()} />
      )}

      {run.results.some((r) => r.kind === "send_emails" && r.status === "done") && <RepliesPanel run={run} />}

      <div className="space-y-2">
        {run.results.length === 0 && live && (
          <Panel className="flex items-center gap-3 p-5 text-[12.5px] text-ink-3">
            <Loader2 className="size-4 animate-spin" /> Starting…
          </Panel>
        )}
        {run.results.map((r, i) => (
          <StepCard key={r.step_id} result={r} index={i} />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({ run, onAnswered }: { run: Run; onAnswered: () => void }) {
  if (run.question?.mode === "docs") return <DocsQuestion run={run} onAnswered={onAnswered} />;
  if (run.question?.mode === "send") return <SendQuestion run={run} onAnswered={onAnswered} />;
  return <PlainQuestion run={run} onAnswered={onAnswered} />;
}

/** "Asked in Teams too" — so nobody answers twice wondering which counts. */
function AlsoInTeams({ run }: { run: Run }) {
  if (!run.question?.teams) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
      <MessageSquare className="size-3.5" /> Also asked in Teams — answer there or here, whichever is first.
    </p>
  );
}

function PlainQuestion({ run, onAnswered }: { run: Run; onAnswered: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"go" | "stop" | null>(null);
  const q = run.question!;
  const about = q.about_step_id ? run.results.find((r) => r.step_id === q.about_step_id) : undefined;

  async function answer(go: boolean) {
    setBusy(go ? "go" : "stop");
    try {
      await api.post(`/agents/runs/${run.id}/answer`, { go, text });
      onAnswered();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="border-2 border-warn p-5">
      <p className="micro text-warn">Waiting for you</p>
      <h3 className="mt-1.5 text-[16px] font-semibold">{q.title}</h3>
      {q.message && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{q.message}</p>}
      <AlsoInTeams run={run} />
      {/* What it is asking about, right here — not a scroll away. */}
      {about && Object.keys(about.output ?? {}).length > 0 && (
        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-[14px] border border-line p-3">
          <p className="micro mb-2 text-ink-4">{about.name}</p>
          <Output kind={about.kind} output={about.output} />
        </div>
      )}
      <Textarea
        className="mt-3 min-h-20"
        placeholder={q.mode === "answer" ? "Your answer" : "Anything to add (optional) — e.g. leave out supplier X"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="accent" icon={Check} loading={busy === "go"} disabled={busy !== null} onClick={() => answer(true)}>
          Carry on
        </Button>
        <Button variant="outline" icon={Ban} loading={busy === "stop"} disabled={busy !== null} onClick={() => answer(false)}>
          Stop here
        </Button>
      </div>
    </Panel>
  );
}

/**
 * "Can you share the documents?" — drop them here (they are filed into the
 * task's folder, where the team finds them too), or put them in the folder
 * yourself and say so. It looks in the folder on its own every couple of
 * minutes as well.
 */
function DocsQuestion({ run, onAnswered }: { run: Run; onAnswered: () => void }) {
  const q = run.question!;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"file" | "go" | "stop" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function act(kind: "file" | "go" | "stop") {
    setBusy(kind);
    setFailed(null);
    try {
      if (kind === "file") {
        const form = new FormData();
        for (const f of files) form.append("files", f);
        await api.upload(`/agents/runs/${run.id}/documents`, form);
        setFiles([]);
      } else {
        await api.post(`/agents/runs/${run.id}/answer`, { go: kind === "go", text: "" });
      }
      onAnswered();
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="border-2 border-warn p-5">
      <p className="micro text-warn">Waiting for the documents</p>
      <h3 className="mt-1.5 text-[16px] font-semibold">{q.title}</h3>
      {q.message && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{q.message}</p>}
      <AlsoInTeams run={run} />
      {q.folder_url && (
        <a
          href={q.folder_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-[13px] border border-line px-3.5 text-[12.5px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
        >
          <FolderOpen className="size-4" /> Open the task folder <ExternalLink className="size-3 text-ink-4" />
        </a>
      )}
      <FileDrop
        className="mt-3"
        onFiles={(picked) => setFiles((now) => [...now, ...picked].slice(0, 10))}
        label="Or drop them here"
        hint="They are filed into the task's folder, so the team has them too."
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-[10px] bg-panel-2 px-3 py-1.5 text-[12px]">
              <FileText className="size-3.5 text-ink-4" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((now) => now.filter((_, n) => n !== i))} className="text-ink-4 hover:text-ink">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && <InlineNotice tone="danger" className="mt-3">{failed}</InlineNotice>}
      <div className="mt-3 flex flex-wrap gap-2">
        {files.length > 0 ? (
          <Button variant="accent" icon={Upload} loading={busy === "file"} disabled={busy !== null} onClick={() => act("file")}>
            File {files.length === 1 ? "it" : `these ${files.length}`} and start
          </Button>
        ) : (
          <Button variant="accent" icon={Check} loading={busy === "go"} disabled={busy !== null} onClick={() => act("go")}>
            They&apos;re in — start
          </Button>
        )}
        <Button variant="outline" icon={Ban} loading={busy === "stop"} disabled={busy !== null} onClick={() => act("stop")}>
          Not needed
        </Button>
      </div>
    </Panel>
  );
}

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[A-Za-z]{2,}$/;

interface DraftEdit {
  to_email: string;
  subject: string;
  body: string;
}

/**
 * "Review these before they go" — the failsafe on supplier mail. Nothing is
 * ticked to start with, and an email can only be ticked once it has been
 * opened and read; any of it can be changed there. Sending asks once more,
 * with the list of who gets what, and only then goes — as you. The server
 * refuses a send without that confirmation.
 */
function SendQuestion({ run, onAnswered }: { run: Run; onAnswered: () => void }) {
  const q = run.question!;
  const drafts = q.drafts ?? [];
  const drafted = run.results.find((r) => r.step_id === q.about_step_id) ?? [...run.results].reverse().find((r) => r.kind === "draft_email");
  const full = (n: number) => list(drafted?.output.drafts).find((d, i) => Number(d.n ?? i) === n);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [read, setRead] = useState<Set<number>>(() => new Set());
  const [edits, setEdits] = useState<Record<number, DraftEdit>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"go" | "stop" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const testTo = q.test_to ?? null;
  const current = (n: number): DraftEdit => {
    const d = drafts.find((x) => x.n === n);
    const body = full(n)?.body ?? d?.body;
    return edits[n] ?? { to_email: d?.to_email ?? "", subject: d?.subject ?? "", body: body ? String(body) : "" };
  };
  const canSend = (n: number) => EMAIL.test(current(n).to_email.trim());
  const chosen = [...picked].filter((n) => canSend(n) && read.has(n)).sort((a, b) => a - b);

  function toggleOpen(n: number) {
    setConfirming(false);
    setOpen(open === n ? null : n);
    setRead((r) => new Set(r).add(n));
  }

  function edit(n: number, patch: Partial<DraftEdit>) {
    // A change after "Review and send" means confirming again, on the new text.
    setConfirming(false);
    setEdits((now) => ({ ...now, [n]: { ...current(n), ...patch } }));
  }

  async function answer(go: boolean) {
    setBusy(go ? "go" : "stop");
    setFailed(null);
    try {
      await api.post(`/agents/runs/${run.id}/answer`, {
        go,
        text,
        picks: go ? chosen : [],
        confirmed: go,
        edits: Object.fromEntries(Object.entries(edits).map(([n, e]) => [n, { to_email: e.to_email.trim(), subject: e.subject, body: e.body }])),
      });
      onAnswered();
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="border-2 border-warn p-5">
      <p className="micro text-warn">Nothing sent yet — review each email, then confirm</p>
      <h3 className="mt-1.5 text-[16px] font-semibold">{q.title}</h3>
      {testTo ? (
        <p className="mt-2.5 rounded-[12px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">
          Test mode — every email goes to {testTo} only. No supplier receives anything.
        </p>
      ) : (
        q.message && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{q.message}</p>
      )}
      <AlsoInTeams run={run} />
      <ul className="mt-3 space-y-1.5">
        {drafts.map((d) => {
          const now = current(d.n);
          const ok = canSend(d.n);
          const seen = read.has(d.n);
          const on = picked.has(d.n) && ok && seen;
          return (
            <li key={d.n} className={clsx("rounded-[14px] border p-3 transition", on ? "border-accent bg-accent-soft/40" : "border-line")}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={on}
                  disabled={!ok || !seen}
                  title={!seen ? "Read the email first" : undefined}
                  aria-label={`Send to ${d.to_name ?? now.to_email}`}
                  onChange={(e) => {
                    setConfirming(false);
                    setPicked((p) => {
                      const next = new Set(p);
                      if (e.target.checked) next.add(d.n);
                      else next.delete(d.n);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{d.to_name || now.to_email}</span>
                  <span className="block truncate text-[11.5px] text-ink-4">
                    {!ok ? (
                      <span className="text-warn">No email address — add one to send it</span>
                    ) : !seen ? (
                      <span className="text-warn">Read it first — then you can tick it</span>
                    ) : testTo ? (
                      <>
                        <span className="font-medium text-warn">Goes to {testTo}</span> · for {now.to_email}
                      </>
                    ) : (
                      now.to_email
                    )}{" "}
                    · {now.subject}
                  </span>
                </span>
                <Button size="sm" variant="ghost" icon={PenLine} onClick={() => toggleOpen(d.n)}>
                  {open === d.n ? "Close" : "Read / edit"}
                </Button>
              </div>
              {open === d.n && (
                <div className="mt-3 space-y-2">
                  <Input value={now.to_email} placeholder="Email address" onChange={(e) => edit(d.n, { to_email: e.target.value })} />
                  <Input value={now.subject} placeholder="Subject" onChange={(e) => edit(d.n, { subject: e.target.value })} />
                  <Textarea className="min-h-48 font-sans text-[12.5px]" value={now.body} onChange={(e) => edit(d.n, { body: e.target.value })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Textarea
        className="mt-3 min-h-16"
        placeholder="Anything to add (optional) — kept with the run, not put in the emails"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {failed && <InlineNotice tone="danger" className="mt-3">{failed}</InlineNotice>}
      {confirming && chosen.length > 0 && (
        <div className="mt-3 rounded-[14px] border-2 border-accent bg-accent-soft/40 p-3.5">
          <p className="text-[13px] font-semibold">
            Send these {chosen.length} email{chosen.length === 1 ? "" : "s"} from {testTo ? `your mailbox (test: all to ${testTo})` : "your mailbox"}?
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
            {chosen.map((n) => {
              const now = current(n);
              const d = drafts.find((x) => x.n === n);
              return (
                <li key={n} className="truncate">
                  <span className="font-semibold">{d?.to_name || now.to_email}</span> · {now.to_email}
                  {edits[n] && <span className="text-accent-text"> · edited</span>} · {now.subject}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="accent" icon={Send} loading={busy === "go"} disabled={busy !== null} onClick={() => answer(true)}>
              Yes, send {chosen.length}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!confirming && (
          <Button variant="accent" icon={Send} disabled={busy !== null || chosen.length === 0} onClick={() => setConfirming(true)}>
            Review and send {chosen.length}
          </Button>
        )}
        <Button variant="outline" icon={Ban} loading={busy === "stop"} disabled={busy !== null} onClick={() => answer(false)}>
          Don&apos;t send
        </Button>
        <span className="text-[11px] text-ink-4">
          {testTo ? `Test mode: all to ${testTo}.` : "They go as you, and land in your Sent Items."}
        </span>
      </div>
    </Panel>
  );
}

/* ── after the RFQs ───────────────────────────────────────────────────── */

const RFQ_STATUS: Record<Rfq["status"], { label: string; tone: Tone }> = {
  waiting: { label: "Waiting for a reply", tone: "neutral" },
  replied: { label: "Replied", tone: "warn" },
  taking: { label: "Taking their quote…", tone: "info" },
  taken: { label: "Quote taken", tone: "positive" },
  declined: { label: "Not taken", tone: "neutral" },
  submitted: { label: "Sent for approval", tone: "positive" },
  failed: { label: "Could not finish", tone: "danger" },
};

/**
 * The RFQs this run sent and what became of each: the reply when it comes,
 * "take their quote" (onto the quote request, priced, report made), and
 * "send for approval" — the same choices the Teams cards offer.
 */
function RepliesPanel({ run }: { run: Run }) {
  const { data, mutate } = useRfqs(run.id);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!data || data.length === 0) return null;
  const waiting = data.filter((r) => r.status === "waiting").length;

  async function check() {
    setChecking(true);
    setFailed(null);
    try {
      await mutate(api.post<Rfq[]>(`/agents/runs/${run.id}/rfqs/check`), { revalidate: false });
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "Your inbox could not be read.");
    } finally {
      setChecking(false);
    }
  }

  async function act(rfq: Rfq, what: "take" | "approval", go: boolean) {
    setBusy(`${rfq.id}:${what}:${go}`);
    setFailed(null);
    try {
      await api.post(`/agents/rfqs/${rfq.id}/${what}`, { go });
      // The work goes on in the background; look again shortly.
      setTimeout(() => void mutate(), 1500);
      setTimeout(() => void mutate(), 8000);
      await mutate();
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <PanelHead title="Supplier replies" count={data.length} />
        <span className="text-[11.5px] text-ink-4">
          {waiting ? `Watching your inbox — ${waiting} still to reply` : "Everyone has replied or been answered"}
        </span>
        <Button size="sm" variant="outline" icon={Mail} loading={checking} className="ml-auto" onClick={check}>
          Check for replies now
        </Button>
      </div>
      {failed && <InlineNotice tone="danger" className="mt-3">{failed}</InlineNotice>}
      <ul className="mt-3 space-y-2">
        {data.map((r) => {
          const state = RFQ_STATUS[r.status];
          const test = r.sent_to.toLowerCase() !== r.supplier_email.toLowerCase();
          const report = r.report;
          return (
            <li key={r.id} className={clsx("rounded-[14px] border p-3.5", r.status === "replied" ? "border-warn" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{r.supplier_name || r.supplier_email}</span>
                <Badge tone={state.tone} icon={r.status === "taking" ? Loader2 : undefined} className={r.status === "taking" ? "[&>svg]:animate-spin" : undefined}>
                  {state.label}
                </Badge>
                <span className="ml-auto text-[11px] text-ink-4">
                  {test ? `test inbox ${r.sent_to} · for ${r.supplier_email}` : r.supplier_email} · sent {relative(r.sent_at)}
                </span>
              </div>
              {r.reply && (
                <div className="mt-2 rounded-[12px] bg-panel-2 px-3 py-2">
                  <p className="text-[11.5px] text-ink-4">
                    {r.reply.subject} {r.reply.received && `· ${relative(r.reply.received)}`}
                  </p>
                  {r.reply.preview && <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-2">{r.reply.preview}</p>}
                  {(r.reply.attachments ?? []).length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
                      <FileText className="size-3.5" /> {(r.reply.attachments ?? []).join(", ")}
                    </p>
                  )}
                </div>
              )}
              {report && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                  <Fact label="Lines" small>{report.lines ?? 0}</Fact>
                  <Fact label="We sell at" small>{report.quoted} {report.currency}</Fact>
                  <Fact label="Landed cost" small>{report.landed} {report.currency}</Fact>
                  <Fact label="Margin" small>
                    {report.margin} {report.currency}
                    {report.margin_percent ? ` (${Number(report.margin_percent).toFixed(1)}%)` : ""}
                  </Fact>
                </dl>
              )}
              {report?.warnings?.map((w, i) => (
                <p key={i} className="mt-1 flex gap-1.5 text-[11.5px] text-warn">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                </p>
              ))}
              {r.note && <p className="mt-2 text-[12px] text-ink-3">{r.note}</p>}
              <div className="mt-2.5 flex flex-wrap gap-2">
                {(r.status === "replied" || r.status === "failed") && r.reply && (
                  <>
                    <Button size="sm" variant="accent" icon={Check} loading={busy === `${r.id}:take:true`} disabled={busy !== null} onClick={() => act(r, "take", true)}>
                      {r.status === "failed" ? "Try again" : "Take their quote"}
                    </Button>
                    <Button size="sm" variant="outline" icon={Ban} loading={busy === `${r.id}:take:false`} disabled={busy !== null} onClick={() => act(r, "take", false)}>
                      Not this one
                    </Button>
                  </>
                )}
                {r.status === "taken" && (
                  <>
                    <Button size="sm" variant="accent" icon={Send} loading={busy === `${r.id}:approval:true`} disabled={busy !== null} onClick={() => act(r, "approval", true)}>
                      {test ? "Test: who would approve?" : "Send for approval"}
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === `${r.id}:approval:false`} disabled={busy !== null} onClick={() => act(r, "approval", false)}>
                      Not yet
                    </Button>
                  </>
                )}
                {r.quote_request_id && (
                  <a
                    href={`/quote-requests/${r.quote_request_id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[13px] border border-line px-3 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    <ExternalLink className="size-3.5" /> Open the quote request
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── a step's result ─────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, Tone> = {
  done: "positive",
  running: "info",
  waiting: "warn",
  skipped: "neutral",
  failed: "danger",
  stopped: "neutral",
  pending: "neutral",
};

function StepCard({ result, index }: { result: StepResult; index: number }) {
  const block = BLOCKS_BY_KIND[result.kind];
  const tone = GROUP_TONE[block?.group ?? "wait"];
  const Icon = block?.icon ?? FileText;
  const hasDetail =
    Object.keys(result.output ?? {}).length > 0 || (result.sources?.length ?? 0) > 0 || (result.notes?.length ?? 0) > 0;
  const [open, setOpen] = useState(result.status === "done" && index > 0);

  return (
    <Panel className={clsx("overflow-hidden", result.status === "pending" && "opacity-60")}>
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className={clsx("grid size-9 shrink-0 place-items-center rounded-[11px]", tone.soft, tone.ink)}>
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold">{result.name}</span>
            <StepStatus status={result.status} />
            {result.ai ? (
              result.ai.free ? (
                <Badge tone="positive" icon={Sparkles} title={result.ai.model}>
                  Free AI · $0
                </Badge>
              ) : (
                <Badge tone="second" icon={Sparkles} title={`${result.ai.model} · ${result.ai.input_tokens} in, ${result.ai.output_tokens} out${result.ai.searches ? ` · ${result.ai.searches} web searches` : ""}`}>
                  AI · {cost(result.ai.cost_usd)}
                </Badge>
              )
            ) : result.status === "done" ? (
              <Badge>No AI</Badge>
            ) : null}
          </span>
          {result.headline && <span className="mt-0.5 block text-[12.5px] text-ink-3">{result.headline}</span>}
        </span>
        {hasDetail && <ChevronDown className={clsx("size-4 shrink-0 text-ink-4 transition", open && "rotate-180")} />}
      </button>
      {open && hasDetail && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <Output kind={result.kind} output={result.output ?? {}} />
          {result.notes?.length > 0 && (
            <ul className="space-y-1">
              {result.notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-warn">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {n}
                </li>
              ))}
            </ul>
          )}
          {result.sources?.length > 0 && <Sources sources={result.sources} />}
        </div>
      )}
    </Panel>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div>
      <p className="micro mb-1.5 text-ink-4">Where it came from</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => {
          const body = (
            <>
              <span className="font-medium">{s.label}</span>
              {s.detail && <span className="text-ink-4"> · {s.detail}</span>}
              {s.url && <ExternalLink className="ml-1 inline size-3" />}
            </>
          );
          return s.url ? (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px] hover:bg-panel-3">
              {body}
            </a>
          ) : (
            <span key={i} className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px]">{body}</span>
          );
        })}
      </div>
    </div>
  );
}

/* ── outputs, per kind ───────────────────────────────────────────────── */

type Rec = Record<string, unknown>;
const list = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** A value, or "not given" in grey — blanks are said, never filled in. */
function V({ v }: { v: unknown }) {
  const text = v === null || v === undefined ? "" : String(v).trim();
  if (!text || text.toLowerCase() === "not given") return <span className="italic text-ink-4">not given</span>;
  return <>{text}</>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-panel-2 text-ink-3">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-line align-top">
              {cells.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Output({ kind, output }: { kind: string; output: Rec }) {
  switch (kind) {
    case "read_documents":
      return (
        <Table
          head={["Document", "From", "Read"]}
          rows={list(output.files).map((f) => [
            f.url ? <a href={String(f.url)} target="_blank" rel="noreferrer" className="underline">{String(f.name)}</a> : String(f.name),
            String(f.origin),
            f.status === "read" ? (f.kind === "scan" ? "a scan" : `${Number(f.chars).toLocaleString()} characters`) : <span className="text-warn">{String(f.note ?? f.status)}</span>,
          ])}
        />
      );
    case "extract_requirements": {
      const items = list(output.items);
      return (
        <div className="space-y-3">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label="Customer"><V v={output.customer} /></Fact>
            <Fact label="Closing"><V v={output.deadline} /></Fact>
            <Fact label="Items">{items.length}</Fact>
          </dl>
          {output.summary && String(output.summary) !== "not given" ? <p className="text-[12.5px] leading-relaxed text-ink-2">{String(output.summary)}</p> : null}
          {items.length > 0 && (
            <Table
              head={["#", "Item", "Part no.", "Brand", "Qty", "Unit", "From"]}
              rows={items.map((it, i) => [
                i + 1, <V key="d" v={it.description} />, <V key="p" v={it.part_number} />, <V key="b" v={it.brand} />,
                <V key="q" v={it.quantity} />, <V key="u" v={it.unit} />,
                <span key="s" className="text-ink-4">{String(it.source_document ?? "")}{it.how ? ` · ${String(it.how)}` : ""}</span>,
              ])}
            />
          )}
          <Bullets title="Conditions" items={strs(output.conditions)} />
          <Bullets title="Not given in the documents" items={strs(output.missing)} tone="warn" />
        </div>
      );
    }
    case "lookup_tasks":
      return (
        <Table
          head={["Task", "Closes", "Status"]}
          rows={list(output.tasks).map((t) => [
            String(t.title),
            t.deadline ? `${dateShort(String(t.deadline))}${typeof t.days_left === "number" ? ` (${Number(t.days_left) < 0 ? `${-Number(t.days_left)}d late` : `in ${t.days_left}d`})` : ""}` : <V key="d" v={null} />,
            <V key="s" v={t.status} />,
          ])}
        />
      );
    case "lookup_history":
      return (
        <div className="space-y-2">
          {list(output.items).map((row, i) => (
            <div key={i} className="rounded-[12px] bg-panel-2 px-3 py-2">
              <p className="text-[12.5px] font-medium">{String(row.item)}</p>
              <ul className="mt-1 space-y-0.5">
                {list(row.matches).slice(0, 3).map((m, j) => (
                  <li key={j} className="text-[11.5px] text-ink-3">
                    {String(m.label)} · {m.date ? dateShort(String(m.date)) : "no date"} · <V v={m.rate ? `${m.rate} ${m.currency ?? ""}` : null} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Bullets title="No past quotes for" items={strs(output.unmatched)} />
        </div>
      );
    case "find_suppliers":
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {list(output.suppliers).map((s, i) => {
            const src = s.source as Source | undefined;
            return (
              <div key={i} className="rounded-[14px] bg-panel-2 p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{String(s.name)}</p>
                  <Badge tone={s.from === "web" ? "info" : "positive"}>{s.from === "web" ? "Web" : "Our history"}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                  <Fact label="Email" small><V v={s.email} /></Fact>
                  <Fact label="Phone" small><V v={s.phone} /></Fact>
                  <Fact label="Contact" small><V v={s.contact_person} /></Fact>
                  <Fact label="Where" small><V v={s.place} /></Fact>
                </dl>
                {strs(s.items_covered).length > 0 && (
                  <p className="mt-2 text-[11px] text-ink-4">Covers: {strs(s.items_covered).slice(0, 4).join("; ")}</p>
                )}
                {src?.url && (
                  <a href={src.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-text underline">
                    Evidence <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      );
    case "compare_quotes":
      return (
        <Table
          head={["Item", "Best past offer", "Date", "Selling at margin"]}
          rows={list(output.rows).map((r) => [
            String(r.item),
            r.rate ? `${r.rate} ${r.currency ?? ""} · ${r.supplier ?? ""}` : <V key="r" v={null} />,
            r.date ? dateShort(String(r.date)) : "—",
            <V key="s" v={r.sell ? `${r.sell} ${r.currency ?? ""}` : null} />,
          ])}
        />
      );
    case "summarise":
      return (
        <div className="space-y-2">
          {output.text ? <CopyBlock text={String(output.text)} /> : null}
          <ul className="space-y-1">
            {list(output.bullets).map((b, i) => (
              <li key={i} className="flex gap-2 text-[12.5px]">
                <Minus className="mt-1 size-3 shrink-0 text-ink-4" />
                <span>
                  {String(b.text)} <span className="text-[11px] text-ink-4">[{String(b.source)}]</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "ask_model":
      return (
        <div className="space-y-2">
          <CopyBlock text={String(output.answer ?? "")} />
          <ul className="space-y-1">
            {list(output.points).map((p, i) => (
              <li key={i} className="text-[12.5px]">
                {String(p.text)} <span className="text-[11px] text-ink-4">[{String(p.source)}]</span>
              </li>
            ))}
          </ul>
          <Bullets title="Not in the material" items={strs(output.not_found)} tone="warn" />
        </div>
      );
    case "check":
      return <p className="text-[12.5px]">{output.passed ? "Passed" : "Not passed"}: {String(output.reason ?? "")}</p>;
    case "draft_email":
      return (
        <div className="space-y-2.5">
          {list(output.drafts).map((d, i) => (
            <Draft key={i} draft={d} />
          ))}
        </div>
      );
    case "draft_quote_request":
      return (
        <div className="space-y-2">
          <p className="text-[12px] text-ink-3">
            {String(output.currency)} · {String(output.margin)}% margin
          </p>
          <Table
            head={["Item", "Qty", "Cost", "Sell", "Supplier"]}
            rows={list(output.lines).map((l) => [
              <V key="d" v={l.description} />,
              <V key="q" v={l.quantity ? `${l.quantity} ${l.unit ?? ""}` : null} />,
              <V key="c" v={l.cost ? `${l.cost} ${l.cost_currency ?? ""}` : null} />,
              <V key="s" v={l.sell ? `${l.sell} ${l.cost_currency ?? ""}` : null} />,
              <V key="p" v={l.supplier} />,
            ])}
          />
        </div>
      );
    case "ask_documents":
      return (
        <div className="space-y-2">
          {strs(output.files).length > 0 && (
            <ul className="space-y-0.5">
              {strs(output.files).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
                  <FileText className="size-3.5 text-ink-4" /> {f}
                </li>
              ))}
            </ul>
          )}
          {output.folder_url ? (
            <a href={String(output.folder_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-accent-text underline">
              The task folder <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      );
    case "send_emails":
      return list(output.sent).length > 0 ? (
        <Table
          head={["To", "Subject", "Sent"]}
          rows={list(output.sent).map((m) => [
            <span key="t">
              <span className="font-medium">{String(m.to_name ?? "")}</span>{" "}
              <span className="text-ink-4">{String(m.to_email ?? "")}</span>
            </span>,
            String(m.subject ?? ""),
            m.status === "sent" ? (
              <span key="s" className="inline-flex items-center gap-1 text-positive"><Check className="size-3.5" /> Sent</span>
            ) : (
              <span key="s" className="text-danger">{String(m.error ?? m.status)}</span>
            ),
          ])}
        />
      ) : output.declined ? (
        <p className="text-[12.5px] text-ink-3">You said don&apos;t send.</p>
      ) : null;
    case "notify_me":
      return <p className="text-[12.5px]">{String(output.message ?? "")}</p>;
    case "ask_me":
    case "get_approval":
      return output.answer ? <p className="text-[12.5px]">“{String(output.answer)}”</p> : null;
    default:
      return null;
  }
}

function Draft({ draft }: { draft: Rec }) {
  const to = draft.to_email ? String(draft.to_email) : "";
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(String(draft.subject))}&body=${encodeURIComponent(String(draft.body))}`;
  return (
    <div className="rounded-[14px] bg-panel-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold">{String(draft.to_name)}</span>
        <span className="text-ink-4"><V v={draft.to_email} /></span>
        <span className="ml-auto flex gap-1.5">
          <CopyButton text={`${String(draft.subject)}\n\n${String(draft.body)}`} />
          <a href={mailto} className="inline-flex h-8 items-center gap-1.5 rounded-[13px] border border-line px-3 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink">
            <Mail className="size-3.5" /> Open in mail
          </a>
        </span>
      </div>
      <p className="mt-2 text-[12px] font-medium">{String(draft.subject)}</p>
      <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-2">{String(draft.body)}</pre>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="relative rounded-[14px] bg-panel-2 p-3 pr-24">
      <p className="whitespace-pre-line text-[12.5px] leading-relaxed">{text}</p>
      <span className="absolute right-2 top-2">
        <CopyButton text={text} />
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      icon={done ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          // Clipboard blocked: nothing to do but leave the text selectable.
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function Fact({ label, children, small }: { label: string; children: ReactNode; small?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={clsx("text-ink-4", small ? "text-[10.5px]" : "text-[11px]")}>{label}</dt>
      <dd className={clsx("truncate", small ? "text-[11.5px]" : "text-[13px] font-medium")}>{children}</dd>
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={clsx("micro mb-1", tone === "warn" ? "text-warn" : "text-ink-4")}>{title}</p>
      <ul className="space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="text-[12px] text-ink-2">• {t}</li>
        ))}
      </ul>
    </div>
  );
}

/* ── small things ────────────────────────────────────────────────────── */

const RUN_LABEL: Record<RunStatus, string> = {
  running: "Working",
  waiting: "Waiting for you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

function RunBadge({ status }: { status: RunStatus }) {
  const tone: Tone = status === "done" ? "positive" : status === "failed" ? "danger" : status === "waiting" ? "warn" : status === "running" ? "info" : "neutral";
  return (
    <Badge tone={tone} icon={status === "running" ? Loader2 : undefined} className={status === "running" ? "[&>svg]:animate-spin" : undefined}>
      {RUN_LABEL[status]}
    </Badge>
  );
}

function StatusDot({ status }: { status: RunStatus }) {
  const color = { done: "bg-positive", failed: "bg-danger", waiting: "bg-warn", running: "bg-info", stopped: "bg-ink-4" }[status];
  return <span className={clsx("size-2 shrink-0 rounded-full", color, status === "running" && "animate-pulse")} />;
}

function StepStatus({ status }: { status: string }) {
  const icon = { running: Loader2, waiting: Hourglass, failed: X, skipped: Minus, stopped: Square, done: Check, pending: undefined }[status];
  const label = { running: "Working", waiting: "Waiting", failed: "Failed", skipped: "Skipped", stopped: "Not run", done: "Done", pending: "Waiting its turn" }[status] ?? status;
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} icon={icon} className={status === "running" ? "[&>svg]:animate-spin" : undefined}>
      {label}
    </Badge>
  );
}

function cost(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!n) return "no AI cost";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function aiUse(run: Run): string {
  const used = run.results.filter((r) => r.ai).length;
  if (!used) return "No AI used";
  return `AI in ${used} step${used === 1 ? "" : "s"} (${modelName(run.model)})`;
}

function modelName(model: string | null | undefined): string {
  if (!model) return "the AI model";
  if (model.startsWith("claude-haiku")) return "Claude Haiku";
  if (model.startsWith("claude-sonnet")) return "Claude Sonnet";
  if (model.startsWith("claude-opus")) return "Claude Opus";
  return model;
}

