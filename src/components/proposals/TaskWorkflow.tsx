"use client";

import { useMemo } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowUpRight,
  Check,
  CircleDashed,
  Download,
  Loader2,
  Mail,
  Play,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { date, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useMaybeSession } from "@/lib/session";
import type { TaskOut, WorkflowOut, WorkflowRunOut, WorkflowRunSummaryOut } from "@/lib/types";
import { FILE_SOURCE, MESSAGE_STATE, isOpenRun, runStatus, stepState, useRun, useTaskRuns } from "@/lib/workflows";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/**
 * What the workflow has done for this task, on the task itself.
 *
 * The run page holds everything — the log, the files, the mails. This is the
 * part a person opening a task wants without leaving it: how far the flow has
 * got, what it is waiting on, and what it found — the items to price, the
 * suppliers it proposes, the quote it drafted. Read from the run's own
 * context, so what is shown here is exactly what the next step will act on.
 *
 * Only for people who have the Workflows module; everyone else sees the task
 * as before. The section says nothing rather than erroring when the module
 * is not granted, because a colleague reading a task on the team board should
 * not be told about a feature that is not theirs.
 */
export function TaskWorkflow({ task }: { task: TaskOut }) {
  const session = useMaybeSession();
  const allowed = Boolean(session?.can("workflows"));
  const { data, error, mutate } = useTaskRuns(allowed ? task.id : null);

  // The run worth showing: one still going, else the newest.
  const chosen: WorkflowRunSummaryOut | null = useMemo(() => {
    const runs = data?.runs ?? [];
    return runs.find((r) => isOpenRun(r.status)) ?? runs[0] ?? null;
  }, [data]);
  const { data: run } = useRun(chosen?.id ?? null);

  const start = useAction(async (flow: WorkflowOut) => {
    await api.post<WorkflowRunOut>(`/workflows/${flow.key}/runs`, {
      subject_id: task.id,
      subject_label: task.title,
    });
    await mutate();
  });

  if (!allowed || error) return null;
  if (!data) return null;

  const flows = data.workflows;

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
        Workflow
      </p>

      {!chosen && (
        <div className="rounded-2xl bg-inset p-4">
          {flows.length === 0 ? (
            <p className="text-[13px] text-ink-3">No workflow is set up for your team yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] text-ink-3">
                Nothing has been run on this task. Start one and it reads the documents, finds
                suppliers and asks you before anything goes out.
              </p>
              {flows.map((flow) => (
                <Button
                  key={flow.key}
                  size="sm"
                  variant="accent"
                  icon={Play}
                  loading={start.pending}
                  disabled={!task.is_open}
                  onClick={() => void start.run(flow)}
                >
                  {flows.length === 1 ? "Start workflow" : flow.name}
                </Button>
              ))}
            </div>
          )}
          {start.error && <InlineNotice tone="danger">{start.error}</InlineNotice>}
        </div>
      )}

      {chosen && (
        <div className="space-y-3 rounded-2xl bg-inset p-4">
          <RunHead summary={chosen} run={run} />
          {run && <Steps run={run} />}
          {run && <Findings run={run} />}
        </div>
      )}
    </div>
  );
}

function RunHead({ summary, run }: { summary: WorkflowRunSummaryOut; run?: WorkflowRunOut }) {
  const status = runStatus(summary.status);
  const pending = run?.pending;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-ink">{summary.workflow_name}</p>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="tnum text-[11.5px] text-ink-4">{summary.tag}</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">
          {summary.status === "waiting_user" && pending
            ? `Waiting for you: ${pending.title}`
            : summary.status === "waiting_event"
              ? `Waiting on the world at "${summary.current_step ?? ""}"`
              : summary.status === "failed"
                ? summary.error ?? "Failed"
                : summary.current_step
                  ? `On: ${summary.current_step}`
                  : "Finished"}
          {" · "}started {relative(summary.started_at)} by {summary.owner_name}
        </p>
      </div>
      <Link
        href={`/workflows/runs/${summary.id}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-line px-3 text-[12.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
      >
        {summary.status === "waiting_user" ? "Answer" : "Open run"}
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

/** The steps as a compact row: done, current, and what is left. */
function Steps({ run }: { run: WorkflowRunOut }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
      {run.steps.map((step) => {
        const s = stepState(step.state);
        const Icon =
          step.state === "done"
            ? Check
            : step.state === "failed"
              ? TriangleAlert
              : step.state === "skipped"
                ? X
                : step.state === "running" || step.state === "waiting"
                  ? Loader2
                  : CircleDashed;
        return (
          <li
            key={step.key}
            title={step.note ?? step.kind}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px]",
              step.state === "done" && "bg-positive-soft text-positive",
              step.state === "failed" && "bg-danger-soft text-danger",
              step.state === "skipped" && "bg-panel text-ink-4 line-through",
              (step.state === "running" || step.state === "waiting") && "bg-warn-soft text-warn",
              step.state === "pending" && "bg-panel text-ink-3",
            )}
          >
            <Icon
              className={clsx("size-3", step.state === "running" && "animate-spin")}
              strokeWidth={2.2}
            />
            {step.name}
            <span className="sr-only">, {s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── what the run has found ──────────────────────────────────────────── */

interface Item {
  description?: string;
  part_number?: string;
  brand?: string;
  quantity?: number | string;
  unit?: string;
  specification?: string;
}

interface Supplier {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  role?: string;
  items_covered?: string[];
  evidence?: string;
  confidence?: number;
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function Findings({ run }: { run: WorkflowRunOut }) {
  const ctx = run.context;
  const requirements = asRecord(ctx.requirements);
  const items = asList<Item>(requirements.items);
  const conditions = asList<string>(requirements.requirements);
  const suppliers = asList<Supplier>(
    ctx.verified_suppliers ?? asRecord(ctx.suppliers).suppliers,
  );
  const rfq = asRecord(ctx.rfq);
  const replies = asRecord(ctx.replies);
  const comparison = asRecord(ctx.comparison);
  const chosen = asRecord(comparison.chosen);
  const quote = asRecord(ctx.quote);
  const zoho = asRecord(ctx.zoho);

  const missing = asList<string>(requirements.missing);
  const docs = run.files.filter((f) => f.source === "sharepoint" || f.source === "upload");
  const outgoing = run.messages.filter((m) => m.direction === "out");
  const incoming = run.messages.filter((m) => m.direction === "in");
  const offers = asList<{ supplier_name?: string; total?: number | string | null }>(comparison.suppliers);
  const priced = asList<{ name?: string; quantity?: number; rate?: number; cost_rate?: number }>(comparison.items);
  const attached = asRecord(ctx.attached);

  const nothing =
    items.length === 0 && suppliers.length === 0 && docs.length === 0 && !quote.id && !zoho.estimate_number;
  if (nothing) return null;

  return (
    <div className="space-y-3">
      {docs.length > 0 && (
        <Section title={`Documents read (${docs.length})`}>
          <ul className="flex flex-wrap gap-1.5">
            {docs.map((f) => (
              <li key={f.id}>
                <a
                  href={apiUrl(`/workflows/runs/${run.id}/files/${f.id}`)}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[11.5px] text-ink-2 hover:text-ink"
                  title={`${FILE_SOURCE[f.source]?.label ?? f.source} · ${Math.round(f.size / 1024)} KB`}
                >
                  <Download className="size-3" />
                  {f.file_name}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {typeof requirements.summary === "string" && requirements.summary && (
        <Section title="What is needed">
          <p className="text-[12.5px] leading-relaxed text-ink-2">{requirements.summary}</p>
          <p className="mt-1 text-[11.5px] text-ink-4">
            {typeof requirements.customer === "string" && requirements.customer && `Customer: ${requirements.customer}`}
            {typeof requirements.deadline === "string" && requirements.deadline && ` · Deadline: ${requirements.deadline}`}
          </p>
        </Section>
      )}

      {items.length > 0 && (
        <Section title={`Items to price (${items.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-4">
                <tr>
                  <th className="py-1 pr-3 font-medium">Item</th>
                  <th className="py-1 pr-3 font-medium">Part no.</th>
                  <th className="py-1 pr-3 font-medium">Brand</th>
                  <th className="py-1 pr-3 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-1.5 pr-3 text-ink">
                      {item.description}
                      {item.specification && (
                        <span className="block text-[11px] text-ink-4">{item.specification}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-3">{item.part_number || "—"}</td>
                    <td className="py-1.5 pr-3 text-ink-3">{item.brand || "—"}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-ink-2">
                      {item.quantity ?? 1} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conditions.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11.5px] text-ink-3">
              {conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <p className="mt-2 text-[11.5px] text-warn">
              Not in the documents: {missing.join("; ")}
            </p>
          )}
        </Section>
      )}

      {suppliers.length > 0 && (
        <Section
          title={
            ctx.verified_suppliers
              ? `Suppliers asked (${suppliers.length})`
              : `Suppliers found (${suppliers.length}) — awaiting your check`
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-4">
                <tr>
                  <th className="py-1 pr-3 font-medium">Supplier</th>
                  <th className="py-1 pr-3 font-medium">Contact</th>
                  <th className="py-1 pr-3 font-medium">Can supply</th>
                  <th className="py-1 pr-3 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => (
                  <tr key={i} className="border-t border-line/60 align-top">
                    <td className="py-1.5 pr-3">
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="block text-[11px] text-ink-4">
                        {[s.role && s.role !== "unknown" ? s.role : null, s.city].filter(Boolean).join(" · ")}
                        {typeof s.confidence === "number" && ` · ${Math.round(s.confidence * 100)}%`}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-ink-2">
                      {s.email || <span className="text-warn">no address found</span>}
                      {s.phone && <span className="block text-[11px] text-ink-4">{s.phone}</span>}
                      {s.website && (
                        <a
                          href={s.website.startsWith("http") ? s.website : `https://${s.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[11px] text-accent hover:underline"
                        >
                          {s.website}
                        </a>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-3">{(s.items_covered ?? []).join(", ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-[11.5px] text-ink-3">{s.evidence || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title={`Requests for quotation (${outgoing.length})`}>
          <ul className="space-y-1">
            {outgoing.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                <Mail className="size-3 self-center text-ink-4" />
                <span className="font-medium text-ink">{m.party ?? m.address}</span>
                <Badge tone={MESSAGE_STATE[m.state]?.tone ?? "neutral"}>
                  {MESSAGE_STATE[m.state]?.label ?? m.state}
                </Badge>
                <span className="text-ink-4">{m.sent_at ? relative(m.sent_at) : m.error ?? ""}</span>
              </li>
            ))}
          </ul>
          {asList(rfq.held).length > 0 && (
            <p className="mt-1 text-[11.5px] text-warn">
              Composed and held: the mail switch is off in the workflow settings.
            </p>
          )}
        </Section>
      )}

      {(incoming.length > 0 || typeof replies.count === "number") && (
        <Section title={`Supplier replies (${incoming.length})`}>
          {incoming.length === 0 ? (
            <p className="text-[12px] text-ink-3">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {incoming.map((m) => {
                const files = run.files.filter(
                  (f) => f.source === "email" && (f.origin === m.party || f.origin === m.address),
                );
                return (
                  <li key={m.id} className="text-[12px]">
                    <span className="font-medium text-ink">{m.party ?? m.address}</span>
                    <span className="text-ink-4"> · {m.received_at ? date(m.received_at) : ""}</span>
                    <span className="block text-ink-3">{m.subject}</span>
                    {files.length > 0 && (
                      <span className="flex flex-wrap gap-1.5 pt-0.5">
                        {files.map((f) => (
                          <a
                            key={f.id}
                            href={apiUrl(`/workflows/runs/${run.id}/files/${f.id}`)}
                            className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[11px] text-ink-2 hover:text-ink"
                          >
                            <Download className="size-3" />
                            {f.file_name}
                          </a>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {offers.length > 0 && (
        <Section title="Comparison">
          <ul className="space-y-0.5 text-[12px]">
            {offers.map((o, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className={clsx(o.supplier_name === chosen.supplier_name ? "font-medium text-ink" : "text-ink-2")}>
                  {o.supplier_name}
                  {o.supplier_name === chosen.supplier_name && " · chosen"}
                </span>
                <span className="tnum text-ink-2">
                  {o.total == null ? "—" : `AED ${Number(o.total).toLocaleString()}`}
                </span>
              </li>
            ))}
          </ul>
          {priced.length > 0 && (
            <p className="mt-1 text-[11.5px] text-ink-4">
              {priced.length} line(s) priced from the chosen supplier
              {comparison.single ? " (the only reply)" : ""}.
            </p>
          )}
        </Section>
      )}

      {typeof quote.id === "string" && (
        <Section title="Quote request">
          <Link
            href={`/quote-requests/${quote.id}`}
            className="text-[12.5px] font-medium text-accent hover:underline"
          >
            {String(quote.reference ?? quote.title ?? "Open the quote request")}
          </Link>
          {typeof quote.status === "string" && (
            <span className="ml-2 text-[11.5px] text-ink-4">{quote.status}</span>
          )}
        </Section>
      )}

      {typeof zoho.estimate_number === "string" && (
        <Section title="Zoho Books">
          <p className="text-[12.5px] text-ink-2">
            Estimate {zoho.estimate_number}
            {asList(zoho.files).length > 0 && ` · ${asList(zoho.files).length} document(s) on the run`}
          </p>
        </Section>
      )}
      {zoho.held === true && (
        <Section title="Zoho Books">
          <p className="text-[12.5px] text-ink-3">
            The estimate was prepared and held: the Zoho switch is off.
          </p>
        </Section>
      )}
      {(asList(attached.attached).length > 0 || asList(attached.held).length > 0) && (
        <Section title="Attached to the task">
          <p className="text-[12.5px] text-ink-3">
            {asList(attached.attached).length > 0 && `${asList<string>(attached.attached).join(", ")} added to SharePoint.`}
            {asList(attached.held).length > 0 && ` ${asList<string>(attached.held).join(", ")} held: the SharePoint switch is off.`}
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4">{title}</p>
      {children}
    </div>
  );
}
