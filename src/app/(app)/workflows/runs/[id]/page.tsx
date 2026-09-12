"use client";

import clsx from "clsx";
import { use, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  ChevronRight,
  Download,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { amount, bytes, dateTime, humanise, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  PendingColumn,
  PendingField,
  PendingPrompt,
  WorkflowRunEventOut,
  WorkflowRunFileOut,
  WorkflowRunMessageOut,
  WorkflowRunOut,
  WorkflowRunStepOut,
} from "@/lib/types";
import {
  FILE_SOURCE,
  MESSAGE_STATE,
  isOpenRun,
  runStatus,
  stepIcon,
  stepState,
  useRun,
} from "@/lib/workflows";
import { Avatar, Badge, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, FileDrop, Input, Textarea, Toggle } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";

/**
 * One run, from its first step to its last.
 *
 * The screen is built around one question: what does this run need from the
 * reader right now? When it is waiting on the person, the question it is
 * asking is the first thing on the page and everything else — the timeline,
 * the files, the mail — is context for answering it. When it is waiting on
 * the world it says what it is waiting for and how long it will wait. When
 * it has failed it says why, next to the button that tries again.
 *
 * Answering does not just record the answer. The backend carries the run on
 * as far as it can inside the same request — to the next question or the
 * next wait — so the run that comes back is already somewhere else, and the
 * response replaces the cache rather than triggering a refetch of the same.
 */
export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, isValidating, mutate } = useRun(id);
  const [cancelling, setCancelling] = useState(false);

  const cancel = useAction(async () => api.post<WorkflowRunOut>(`/workflows/runs/${id}/cancel`));
  const retry = useAction(async () => api.post<WorkflowRunOut>(`/workflows/runs/${id}/retry`));
  const wake = useAction(async () => api.post<WorkflowRunOut>(`/workflows/runs/${id}/wake`));

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data) return null;

  const run = data;
  const status = runStatus(run.status);
  const open = isOpenRun(run.status);
  const failure = cancel.error ?? retry.error ?? wake.error;

  /** Every action answers with the whole run, so it replaces the cache. */
  async function apply(next: WorkflowRunOut | undefined) {
    if (next) await mutate(next, { revalidate: false });
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/workflows">Workflows</Link>}
        title={run.workflow_name}
        meta={run.tag}
        actions={
          <>
            <Button icon={RefreshCw} loading={isValidating} onClick={() => mutate()}>
              Refresh
            </Button>
            {run.status === "waiting_event" && (
              <Button
                icon={Radar}
                loading={wake.pending}
                onClick={async () => apply(await wake.run())}
              >
                Check now
              </Button>
            )}
            {run.status === "failed" && (
              <Button
                variant="accent"
                icon={RotateCcw}
                loading={retry.pending}
                onClick={async () => apply(await retry.run())}
              >
                Retry
              </Button>
            )}
            {open && (
              <Button variant="danger" icon={Ban} onClick={() => setCancelling(true)}>
                Cancel run
              </Button>
            )}
          </>
        }
      />

      {failure && <InlineNotice tone="danger">{failure}</InlineNotice>}

      {/* ── where it is ── */}
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="text-[13px] text-ink-2">{status.hint}</span>
        {run.current_step && open && (
          <span className="text-[12px] text-ink-4">
            On step {Math.min(run.step_index + 1, run.step_count)} of {run.step_count}:{" "}
            {run.current_step}
          </span>
        )}
      </Panel>

      <div className="grid gap-3.5 xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-3.5">
          {run.status === "waiting_user" && run.pending && (
            <PendingCard
              run={run}
              pending={run.pending}
              onAnswered={apply}
              onUploaded={() => mutate()}
            />
          )}

          {run.status === "waiting_event" && (
            <WaitingCard
              run={run}
              pending={wake.pending}
              onCheck={async () => apply(await wake.run())}
            />
          )}

          {run.status === "failed" && (
            <Panel className="p-5">
              <PanelHead title="What went wrong" />
              <InlineNotice tone="danger" className="mt-4">
                {run.error ?? "The step failed without saying why."}
              </InlineNotice>
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
                Retrying starts again from the step that failed. Everything before it — the
                answers given, the mail sent, the files gathered — is kept.
              </p>
              <Button
                variant="accent"
                icon={RotateCcw}
                className="mt-4"
                loading={retry.pending}
                onClick={async () => apply(await retry.run())}
              >
                Retry from there
              </Button>
            </Panel>
          )}

          <FilesPanel run={run} />
          <MessagesPanel messages={run.messages} />
          <ContextPanel context={run.context} />
          <EventsPanel events={run.events} />
        </div>

        <div className="min-w-0 space-y-3.5">
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <Meta label="Task">
                <span title={run.subject_id}>{run.subject_label ?? run.subject_id}</span>
              </Meta>
              <Meta label="Task id">
                <span className="tnum">{run.subject_id}</span>
              </Meta>
              <Meta label="Owner">
                <span className="flex items-center gap-2">
                  <Avatar name={run.owner_name} seed={run.owner_id} size="xs" />
                  <span className="truncate">{run.owner_name}</span>
                </span>
              </Meta>
              <Meta label="Model spend">{amount(run.cost_usd, "USD")}</Meta>
              <Meta label="Started">
                <span title={dateTime(run.started_at)}>{relative(run.started_at)}</span>
              </Meta>
              <Meta label="Finished">
                {run.finished_at ? (
                  <span title={dateTime(run.finished_at)}>{relative(run.finished_at)}</span>
                ) : (
                  "not yet"
                )}
              </Meta>
            </dl>
          </Panel>

          <Timeline steps={run.steps} />
        </div>
      </div>

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this run?"
        description="It stops where it is and cannot be resumed. Mail already sent stays sent; a quote already drafted stays drafted. Nothing it has done is undone."
        footer={
          <>
            <Button onClick={() => setCancelling(false)}>Keep it going</Button>
            <Button
              variant="danger"
              icon={Ban}
              loading={cancel.pending}
              onClick={async () => {
                const next = await cancel.run();
                setCancelling(false);
                await apply(next);
              }}
            >
              Cancel the run
            </Button>
          </>
        }
      />
    </>
  );
}

/* ── the timeline ────────────────────────────────────────────────────── */

function Timeline({ steps }: { steps: WorkflowRunStepOut[] }) {
  return (
    <Panel className="p-5">
      <PanelHead title="Steps" count={steps.length} />
      <ol className="mt-4">
        {steps.map((step, index) => {
          const Icon = stepIcon(step.kind);
          const state = stepState(step.state);
          const live = step.state === "running" || step.state === "waiting";
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-line"
                />
              )}
              <span
                className={clsx(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  step.state === "done" && "bg-positive-soft text-positive",
                  step.state === "failed" && "bg-danger-soft text-danger",
                  step.state === "waiting" && "bg-second-soft text-second-text",
                  step.state === "running" && "bg-info-soft text-info",
                  step.state === "skipped" && "bg-panel-2 text-ink-4",
                  step.state === "pending" && "bg-panel-2 text-ink-4",
                  live && "ring-2 ring-accent/40",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={clsx(
                      "text-[13px] font-medium",
                      step.state === "pending" || step.state === "skipped"
                        ? "text-ink-3"
                        : "text-ink",
                    )}
                  >
                    {step.name}
                  </span>
                  {step.state !== "pending" && <Badge tone={state.tone}>{state.label}</Badge>}
                </div>
                <span className="block font-mono text-[10.5px] text-ink-4">{step.key}</span>
                {step.note && (
                  <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-3">
                    {step.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ── waiting on the world ────────────────────────────────────────────── */

function WaitingCard({
  run,
  pending,
  onCheck,
}: {
  run: WorkflowRunOut;
  pending: boolean;
  onCheck: () => Promise<void>;
}) {
  const replies = run.messages.filter((m) => m.direction === "in");
  const sent = run.messages.filter((m) => m.direction === "out" && m.state === "sent");
  const held = run.messages.filter((m) => m.direction === "out" && m.state === "held");
  return (
    <Panel tone="sheet" className="p-5">
      <PanelHead title={run.current_step ?? "Waiting"} />
      <p className="mt-3 text-[13px] leading-relaxed">
        The run is waiting for something outside it — a reply landing in the mailbox, a status
        changing on a record. It checks on its own; the button asks it to look now.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        <Meta label="Next check">
          {run.wake_at ? (
            <span title={dateTime(run.wake_at)}>{relative(run.wake_at)}</span>
          ) : (
            "—"
          )}
        </Meta>
        <Meta label="Gives up">
          {run.deadline_at ? (
            <span title={dateTime(run.deadline_at)}>{relative(run.deadline_at)}</span>
          ) : (
            "never"
          )}
        </Meta>
        <Meta label="Mails sent">
          {sent.length}
          {held.length > 0 ? ` (${held.length} held)` : ""}
        </Meta>
        <Meta label="Replies so far">{replies.length}</Meta>
      </dl>
      {replies.length > 0 && (
        <ul className="mt-4 space-y-1">
          {replies.map((m) => (
            <li key={m.id} className="text-[12px]">
              <span className="font-medium">{m.party ?? m.address ?? "Someone"}</span>
              <span className="ml-2 text-ink-3">
                {m.received_at ? relative(m.received_at) : ""}
                {m.subject ? ` · ${m.subject}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Held mail is the reason a wait can never end. Said here rather than
          buried in the messages list, because the person is otherwise
          watching a countdown for a reply that was never asked for. */}
      {held.length > 0 && sent.length === 0 && (
        <InlineNotice tone="warn" className="mt-4">
          Every mail on this run was held rather than sent — the mail switch is off. Nobody
          has been asked anything, so no reply is coming until a super admin turns it on and
          the step is run again.
        </InlineNotice>
      )}
      <Button icon={Radar} className="mt-4" loading={pending} onClick={() => void onCheck()}>
        Check now
      </Button>
    </Panel>
  );
}

/* ── waiting on the person ───────────────────────────────────────────── */

type Values = Record<string, unknown>;

/**
 * The question the run is asking.
 *
 * Two modes, one card. A form collects fields the flow's author named; a
 * review shows a value the run produced — the requirements it read, the
 * suppliers it found — for the person to check, edit if need be, and verify.
 * The edit is sent only when something changed, so "verified as shown" is
 * the plain path rather than a diff the backend has to detect.
 *
 * The draft is keyed on the step, not the run: the answer moves the run on
 * to a different question, and the old answers must not leak into it.
 */
function PendingCard({
  run,
  pending,
  onAnswered,
  onUploaded,
}: {
  run: WorkflowRunOut;
  pending: PendingPrompt;
  onAnswered: (next: WorkflowRunOut | undefined) => Promise<void>;
  onUploaded: () => void;
}) {
  const [step, setStep] = useState(pending.step_key);
  const [values, setValues] = useState<Values>(() => blankValues(pending.fields ?? []));
  const [review, setReview] = useState<unknown>(pending.review_value);
  if (step !== pending.step_key) {
    setStep(pending.step_key);
    setValues(blankValues(pending.fields ?? []));
    setReview(pending.review_value);
  }

  const answer = useAction(async (body: { values: Values; value?: unknown }) =>
    api.post<WorkflowRunOut>(`/workflows/runs/${run.id}/answer`, body),
  );
  const upload = useAction(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.upload(`/workflows/runs/${run.id}/files`, form);
  });

  const fields = pending.fields ?? [];
  const isReview = pending.mode === "review";
  const edited = isReview && JSON.stringify(review) !== JSON.stringify(pending.review_value);
  const uploaded = run.files.filter((f) => f.source === "upload" && f.step_key === pending.step_key);
  const wantsFiles = Boolean(pending.allow_files) || fields.some((f) => f.type === "file");
  const missing = fields.filter((f) => f.required && isBlank(values[f.key], f, uploaded.length));

  return (
    <Panel tone="sheet" className="p-5">
      <PanelHead title={pending.title} hint={run.current_step ?? undefined} />
      {pending.message && (
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed">{pending.message}</p>
      )}

      {answer.error && (
        <InlineNotice tone="danger" className="mt-4">
          {answer.error}
        </InlineNotice>
      )}

      {isReview ? (
        <div className="mt-5">
          <ReviewEditor value={review} onChange={setReview} />
          {edited && (
            <p className="mt-2 text-[11.5px] text-ink-3">
              Edited. What you verify is what you see here, not what the run produced.
            </p>
          )}
        </div>
      ) : (
        fields.length > 0 && (
          <div className="mt-5 space-y-4">
            {fields
              .filter((f) => f.type !== "file")
              .map((field) => (
                <FormField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setValues((was) => ({ ...was, [field.key]: v }))}
                />
              ))}
          </div>
        )
      )}

      {wantsFiles && (
        <div className="mt-5">
          <p className="mb-2 text-[12px] text-ink-3">Files</p>
          {upload.error && (
            <InlineNotice tone="danger" className="mb-3">
              {upload.error}
            </InlineNotice>
          )}
          {uploaded.length > 0 && (
            <ul className="mb-3 space-y-1">
              {uploaded.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-[12.5px]">
                  <Download className="size-3.5 text-ink-4" strokeWidth={2} />
                  <a
                    href={apiUrl(`/workflows/runs/${run.id}/files/${f.id}`)}
                    className="truncate underline-offset-2 hover:underline"
                  >
                    {f.file_name}
                  </a>
                  <span className="tnum text-[11px] text-ink-4">{bytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <FileDrop
            busy={upload.pending}
            hint="Each file is attached to this question as it lands. Upload them before pressing the button."
            onFiles={async (files) => {
              // One at a time, in order: the backend matches files to the
              // step by arrival, and a parallel burst would race that.
              for (const file of files) {
                if ((await upload.run(file)) === undefined) break;
              }
              onUploaded();
            }}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          loading={answer.pending}
          disabled={missing.length > 0}
          onClick={async () => {
            const body = isReview
              ? edited
                ? { values: {}, value: review }
                : { values: {} }
              : { values: cleanValues(values, fields) };
            await onAnswered(await answer.run(body));
          }}
        >
          {pending.resume_label || "Continue"}
        </Button>
        {missing.length > 0 && (
          <span className="text-[12px] text-ink-3">
            Still needed: {missing.map((f) => f.label).join(", ")}.
          </span>
        )}
      </div>
    </Panel>
  );
}

function blankValues(fields: PendingField[]): Values {
  const out: Values = {};
  for (const f of fields) {
    if (f.type === "table") out[f.key] = [];
    else if (f.type === "checkbox") out[f.key] = false;
    else out[f.key] = "";
  }
  return out;
}

function isBlank(value: unknown, field: PendingField, uploadedCount: number): boolean {
  if (field.type === "file") return uploadedCount === 0;
  if (field.type === "checkbox") return value !== true;
  if (field.type === "table") return !Array.isArray(value) || value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}

/** Numbers as numbers, empty strings as nulls, table cells coerced by column. */
function cleanValues(values: Values, fields: PendingField[]): Values {
  const out: Values = {};
  for (const f of fields) {
    if (f.type === "file") continue;
    const v = values[f.key];
    if (f.type === "number") out[f.key] = v === "" || v === undefined ? null : Number(v);
    else if (f.type === "table") {
      const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
      out[f.key] = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const col of f.columns ?? []) {
          const cell = row[col.key];
          clean[col.key] =
            col.type === "number"
              ? cell === "" || cell === undefined
                ? null
                : Number(cell)
              : (cell ?? "");
        }
        return clean;
      });
    } else out[f.key] = v ?? "";
  }
  return out;
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: PendingField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "checkbox") {
    return <Toggle checked={value === true} onChange={onChange} label={field.label} />;
  }
  if (field.type === "table") {
    return (
      <div>
        <span className="mb-2 flex items-center gap-1 text-[12px] text-ink-3">
          {field.label}
          {field.required && <span className="text-danger">*</span>}
        </span>
        <TableEditor
          columns={field.columns ?? []}
          rows={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
          onChange={onChange}
        />
      </div>
    );
  }
  const text = value === undefined || value === null ? "" : String(value);
  return (
    <Field label={field.label} required={field.required}>
      {field.type === "textarea" ? (
        <Textarea value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          type={field.type === "number" ? "number" : "text"}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * Rows and columns the flow's author named, typed in by hand.
 *
 * Scrolls sideways inside its own box on a phone rather than squeezing five
 * columns into 360px; a table that wraps is a table nobody can read.
 */
function TableEditor({
  columns,
  rows,
  onChange,
}: {
  columns: PendingColumn[];
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
}) {
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, ""]));
  return (
    <div className="rounded-[14px] bg-panel-2 p-2">
      {rows.length > 0 && (
        <div className="no-bar overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-1">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="micro px-2 pb-1 text-left text-ink-4">
                    {c.label}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        value={row[c.key] === undefined || row[c.key] === null ? "" : String(row[c.key])}
                        onChange={(e) => {
                          const next = rows.slice();
                          next[i] = { ...row, [c.key]: e.target.value };
                          onChange(next);
                        }}
                        className={clsx(
                          "h-9 w-full rounded-[10px] border border-transparent bg-panel px-2.5 text-[12.5px] text-ink outline-none transition focus:border-accent",
                          c.type === "number" && "tnum w-20",
                        )}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      aria-label="Remove row"
                      onClick={() => onChange(rows.filter((_, j) => j !== i))}
                      className="grid size-8 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button size="sm" icon={Plus} className="m-1" onClick={() => onChange([...rows, blank()])}>
        Add a row
      </Button>
    </div>
  );
}

/* ── reviewing what the run produced ─────────────────────────────────── */

/** The columns worth showing first when the value is a list of suppliers. */
const PREFERRED = ["name", "email", "phone", "website", "city", "role", "confidence"];

type Primitive = string | number | boolean | null;

function isPrimitive(v: unknown): v is Primitive {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A readable, lightly editable rendering of whatever the run wants checked.
 *
 * A list of objects is the case that matters — the suppliers — and it gets a
 * grid with editable cells and removable rows. An object gets its keys down
 * the side. Anything nested inside a cell is shown, not edited: an address
 * can be fixed in a box, a list of items covered cannot, and pretending
 * otherwise would mean a JSON editor in a table cell.
 */
function ReviewEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) {
    return <RecordTable rows={value} onChange={onChange} />;
  }
  if (Array.isArray(value) && value.every(isPrimitive)) {
    return <PrimitiveList items={value} onChange={onChange} />;
  }
  if (isRecord(value)) {
    return <RecordList record={value} onChange={onChange} />;
  }
  if (Array.isArray(value) && value.length === 0) {
    return <p className="text-[12.5px] text-ink-3">Nothing was found. Verifying carries on with an empty list.</p>;
  }
  return <Json value={value} />;
}

function RecordTable({
  rows,
  onChange,
}: {
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
}) {
  const keys = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) keys.add(k);
  const columns = [
    ...PREFERRED.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !PREFERRED.includes(k)),
  ];
  const blank = () =>
    Object.fromEntries(columns.map((k) => [k, isPrimitive(rows[0]?.[k]) ? "" : rows[0]?.[k]]));

  return (
    <div className="rounded-[14px] bg-panel-2 p-2">
      <div className="no-bar overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              {columns.map((k) => (
                <th key={k} className="micro whitespace-nowrap px-2 pb-1 text-left text-ink-4">
                  {humanise(k)}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((k) => (
                  <td key={k} className="align-top">
                    <Cell
                      value={row[k]}
                      onChange={(v) => {
                        const next = rows.slice();
                        next[i] = { ...row, [k]: v };
                        onChange(next);
                      }}
                    />
                  </td>
                ))}
                <td className="align-top">
                  <button
                    type="button"
                    aria-label="Remove this one"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                    className="grid size-9 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" icon={Plus} className="m-1" onClick={() => onChange([...rows, blank()])}>
        Add one
      </Button>
    </div>
  );
}

/**
 * One editable cell. A number stays a number when the text still parses as
 * one, so a confidence typed as "0.9" goes back as 0.9 rather than "0.9".
 */
function Cell({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (!isPrimitive(value)) {
    const short = Array.isArray(value) ? `${value.length} items` : "object";
    return (
      <span
        title={JSON.stringify(value, null, 2)}
        className="block min-w-[90px] px-2.5 py-2 text-[11.5px] text-ink-4"
      >
        {Array.isArray(value) && value.every(isPrimitive) ? value.join(", ") || short : short}
      </span>
    );
  }
  if (typeof value === "boolean") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="h-9 min-w-[70px] rounded-[10px] bg-panel px-2.5 text-left text-[12.5px]"
      >
        {value ? "yes" : "no"}
      </button>
    );
  }
  const numeric = typeof value === "number";
  return (
    <input
      value={value === null ? "" : String(value)}
      onChange={(e) => {
        const text = e.target.value;
        if (numeric && text.trim() !== "" && !Number.isNaN(Number(text))) onChange(Number(text));
        else onChange(text);
      }}
      className={clsx(
        "h-9 w-full min-w-[110px] rounded-[10px] border border-transparent bg-panel px-2.5 text-[12.5px] text-ink outline-none transition focus:border-accent",
        numeric && "tnum min-w-[70px]",
      )}
    />
  );
}

function RecordList({
  record,
  onChange,
}: {
  record: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  return (
    <dl className="grid gap-x-5 gap-y-3 rounded-[14px] bg-panel-2 p-4 sm:grid-cols-[max-content_1fr]">
      {Object.entries(record).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="pt-2 text-[12px] text-ink-3">{humanise(k)}</dt>
          <dd className="min-w-0">
            {isPrimitive(v) ? (
              <Cell value={v} onChange={(next) => onChange({ ...record, [k]: next })} />
            ) : Array.isArray(v) && v.every(isPrimitive) ? (
              <PrimitiveList
                items={v}
                onChange={(next) => onChange({ ...record, [k]: next })}
              />
            ) : (
              <Json value={v} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PrimitiveList({
  items,
  onChange,
}: {
  items: Primitive[];
  onChange: (items: Primitive[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Cell
            value={item}
            onChange={(v) => {
              const next = items.slice();
              next[i] = v as Primitive;
              onChange(next);
            }}
          />
          <button
            type="button"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...items, ""])}>
        Add
      </Button>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="no-bar max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[14px] bg-panel-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ── what the run holds ──────────────────────────────────────────────── */

function FilesPanel({ run }: { run: WorkflowRunOut }) {
  if (run.files.length === 0) return null;
  return (
    <Panel className="p-5">
      <PanelHead title="Files" count={run.files.length} />
      <ul className="mt-3 space-y-1">
        {run.files.map((f) => (
          <FileRow key={f.id} runId={run.id} file={f} />
        ))}
      </ul>
    </Panel>
  );
}

function FileRow({ runId, file }: { runId: string; file: WorkflowRunFileOut }) {
  const source = FILE_SOURCE[file.source] ?? { label: humanise(file.source), tone: "neutral" as const };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[13px] bg-panel-2 px-3 py-2">
      {/* A plain link: the browser's own download handles the cookie, the
          filename from Content-Disposition and the save dialog. */}
      <a
        href={apiUrl(`/workflows/runs/${runId}/files/${file.id}`)}
        className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium underline-offset-2 hover:underline"
      >
        <Download className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
        <span className="truncate">{file.file_name}</span>
      </a>
      <Badge tone={source.tone} title={file.origin ?? undefined}>
        {source.label}
      </Badge>
      {file.step_key && <span className="font-mono text-[10.5px] text-ink-4">{file.step_key}</span>}
      <span className="tnum text-[11.5px] text-ink-4">{bytes(file.size)}</span>
      <span className="tnum text-[11.5px] text-ink-4" title={dateTime(file.created_at)}>
        {relative(file.created_at)}
      </span>
    </li>
  );
}

function MessagesPanel({ messages }: { messages: WorkflowRunMessageOut[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (messages.length === 0) return null;
  return (
    <Panel className="p-5">
      <PanelHead title="Mail" count={messages.length} />
      <ul className="mt-3 space-y-1">
        {messages.map((m) => {
          const state = MESSAGE_STATE[m.state] ?? { label: humanise(m.state), tone: "neutral" as const };
          const out = m.direction === "out";
          const expanded = open === m.id;
          return (
            <li key={m.id} className="rounded-[13px] bg-panel-2">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : m.id)}
                aria-expanded={expanded}
                className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2.5 text-left"
              >
                {out ? (
                  <ArrowUpRight className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
                ) : (
                  <ArrowDownLeft className="size-3.5 shrink-0 text-second" strokeWidth={2} />
                )}
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-[13px] font-medium">
                    {m.subject ?? "(no subject)"}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-4">
                    {out ? "to" : "from"} {m.party ?? "—"}
                    {m.address ? ` <${m.address}>` : ""}
                  </span>
                </span>
                <Badge tone={state.tone}>{state.label}</Badge>
                <span className="tnum text-[11.5px] text-ink-4">
                  {relative(m.sent_at ?? m.received_at)}
                </span>
                <ChevronRight
                  className={clsx("size-3 shrink-0 text-ink-4 transition-transform", expanded && "rotate-90")}
                  strokeWidth={2.4}
                />
              </button>
              {expanded && (
                <div className="space-y-3 px-3 pb-3">
                  {m.error && <InlineNotice tone="danger">{m.error}</InlineNotice>}
                  <pre className="no-bar max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-panel p-3 text-[12px] leading-relaxed text-ink-2">
                    {m.body ?? "(empty)"}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * What the steps have written down, one key each.
 *
 * Collapsed by default: the requirements block alone can be a screen tall,
 * and the person came for the question at the top, not the working.
 */
function ContextPanel({ context }: { context: Record<string, unknown> }) {
  const [open, setOpen] = useState<string | null>(null);
  const entries = Object.entries(context).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) return null;
  return (
    <Panel className="p-5">
      <PanelHead title="What the run knows" count={entries.length} />
      <ul className="mt-3 space-y-1">
        {entries.map(([key, value]) => (
          <Disclosure
            key={key}
            open={open === key}
            onToggle={() => setOpen(open === key ? null : key)}
            head={
              <>
                <span className="font-mono text-[12px] font-medium text-ink">{key}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
                  {summarise(value)}
                </span>
              </>
            }
          >
            <Json value={value} />
          </Disclosure>
        ))}
      </ul>
    </Panel>
  );
}

function EventsPanel({ events }: { events: WorkflowRunEventOut[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (events.length === 0) return null;
  const latestFirst = [...events].sort((a, b) => b.seq - a.seq);
  return (
    <Panel className="p-5">
      <PanelHead title="Log" count={events.length} />
      <ul className="mt-3 space-y-1">
        {latestFirst.map((e) => (
          <Disclosure
            key={e.seq}
            open={open === e.seq}
            onToggle={() => setOpen(open === e.seq ? null : e.seq)}
            head={
              <>
                <Badge tone={eventTone(e.kind)}>{humanise(e.kind)}</Badge>
                {e.step_key && <span className="font-mono text-[11px] text-ink-3">{e.step_key}</span>}
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
                  {e.payload ? summarise(e.payload) : ""}
                </span>
                <span className="tnum text-[11px] text-ink-4" title={dateTime(e.created_at)}>
                  {relative(e.created_at)}
                </span>
              </>
            }
          >
            {e.payload ? <Json value={e.payload} /> : <p className="text-[12px] text-ink-4">Nothing more.</p>}
          </Disclosure>
        ))}
      </ul>
    </Panel>
  );
}

function eventTone(kind: string) {
  if (kind === "error") return "danger" as const;
  if (kind === "held") return "warn" as const;
  if (kind === "completed" || kind === "step_completed" || kind === "email_sent") return "positive" as const;
  if (kind === "waiting" || kind === "answered") return "second" as const;
  if (kind === "cancelled") return "neutral" as const;
  return "neutral" as const;
}

function Disclosure({
  open,
  onToggle,
  head,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="rounded-[13px] bg-panel-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <ChevronRight
          className={clsx("size-3 shrink-0 text-ink-4 transition-transform", open && "rotate-90")}
          strokeWidth={2.4}
        />
        {head}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </li>
  );
}

/** One line about a value, for a collapsed row. */
function summarise(value: unknown): string {
  if (isPrimitive(value)) return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return keys.length <= 6 ? keys.join(", ") : `${keys.length} keys`;
  }
  return "";
}
