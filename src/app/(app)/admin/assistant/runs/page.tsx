"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { CircleStop, Radio, ShieldAlert } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateTime, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { AssistantRunOut, RunDetailOut, RunEventOut, RunPage } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, PanelHead, Row, RowHead, type Tone } from "@/components/ui/primitives";
import { Button, PillRail, Select } from "@/components/ui/controls";
import { Empty, ErrorState, Modal, PanelSkeleton } from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * Every turn anybody has taken, and what it did.
 *
 * The run is the unit of audit here and the unit of cost: every refusal, every
 * tool call, every confirmation and every token is recorded against one, which
 * is what makes "what did the assistant do for whom, and what did it cost"
 * answerable at all. This screen is where that question gets asked.
 *
 * **Live runs are a separate endpoint, not a filter.** A turn that is running or
 * parked waiting for somebody to confirm something is the case worth watching,
 * and it is also the only case where the list changes under you — so it polls,
 * and nothing else on this screen does.
 *
 * Cancelling is the one write here. A running turn stops at its next step; a
 * parked one stops immediately.
 */

const PAGE = 25;

type View = "all" | "live";

export default function AssistantRunsPage() {
  const session = useSession();
  const [view, setView] = useState<View>("all");
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const list = useSWR<RunPage>(
    view === "all"
      ? withQuery("/assistant/admin/runs", {
          status: status || undefined,
          since: since || undefined,
          limit: PAGE,
          offset,
        })
      : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  // The only polling on this screen, and only while it is being looked at.
  const live = useSWR<AssistantRunOut[]>(
    view === "live" ? "/assistant/admin/runs/live" : null,
    { refreshInterval: 4000, revalidateOnFocus: true },
  );

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Assistant runs" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Reading everybody's conversations and what they cost is a super admin's business, and the endpoints behind this screen enforce that themselves."
        />
      </>
    );
  }

  const runs = view === "live" ? live.data ?? [] : list.data?.runs ?? [];
  const error = view === "live" ? live.error : list.error;
  const loading = view === "live" ? !live.data : !list.data;
  const total = view === "live" ? runs.length : list.data?.total ?? 0;

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Assistant runs"
        count={num(total)}
        lead="One run is one turn — a message, its tools, and what it cost."
      />

      <AssistantAdminNav />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={view}
          onChange={(next) => {
            setView(next);
            setOffset(0);
          }}
          options={[
            { value: "all" as const, label: "All runs" },
            {
              value: "live" as const,
              label: "Happening now",
              icon: Radio,
              count: live.data?.length,
            },
          ]}
        />

        {view === "all" && (
          <>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
              className="h-10 w-auto min-w-44"
            >
              <option value="">Any outcome</option>
              <option value="completed">Completed</option>
              <option value="awaiting_confirmation">Waiting on somebody</option>
              <option value="running">Running</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              value={since}
              onChange={(event) => {
                setSince(event.target.value);
                setOffset(0);
              }}
              className="h-10 w-auto min-w-40"
            >
              <option value="">Any time</option>
              <option value={daysAgo(1)}>Since yesterday</option>
              <option value={daysAgo(7)}>Last 7 days</option>
              <option value={daysAgo(30)}>Last 30 days</option>
            </Select>
          </>
        )}
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => (view === "live" ? live.mutate() : list.mutate())}
        />
      ) : loading ? (
        <PanelSkeleton lines={8} />
      ) : runs.length === 0 ? (
        <Empty
          icon={Radio}
          title={view === "live" ? "Nothing running" : "No runs match that"}
          body={
            view === "live"
              ? "Nobody is mid-turn, and nothing is parked waiting for a confirmation."
              : "Try a wider window, or any outcome."
          }
        />
      ) : (
        <Panel className="py-3">
          <RowHead className="text-ink-4">
            <span className="w-44 shrink-0 micro">Person</span>
            <span className="min-w-0 flex-1 micro">Asked</span>
            <span className="w-28 shrink-0 micro">Outcome</span>
            <span className="w-16 shrink-0 text-right micro">Tools</span>
            <span className="w-24 shrink-0 text-right micro">Cost</span>
            <span className="w-24 shrink-0 text-right micro">When</span>
          </RowHead>

          {runs.map((run) => (
            <button key={run.id} onClick={() => setOpen(run.id)} className="block w-full text-left">
              <Row>
                <span className="flex w-44 shrink-0 items-center gap-2">
                  <Avatar
                    name={run.user_name}
                    seed={run.user_id}
                    className="size-5 rounded-md text-[7px]"
                  />
                  <span className="min-w-0 truncate text-[12.5px]">{run.user_name}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                  {run.user_text}
                </span>
                <span className="w-28 shrink-0">
                  <StatusBadge status={run.status} />
                </span>
                <span className="tnum w-16 shrink-0 text-right text-[12px] text-ink-3">
                  {run.tool_calls}
                </span>
                <span className="tnum w-24 shrink-0 text-right text-[12px] text-ink-3">
                  ${Number(run.cost_usd).toFixed(4)}
                </span>
                <span className="w-24 shrink-0 truncate text-right text-[11.5px] text-ink-4">
                  {relative(run.started_at)}
                </span>
              </Row>
            </button>
          ))}
        </Panel>
      )}

      {view === "all" && list.data && total > PAGE && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </Button>
          <span className="tnum text-[11.5px] text-ink-4">
            {offset + 1}–{Math.min(offset + runs.length, total)} of {num(total)}
          </span>
          <Button
            size="sm"
            disabled={offset + runs.length >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Older
          </Button>
        </div>
      )}

      <RunDetail
        id={open}
        onClose={() => setOpen(null)}
        onCancelled={() => {
          void list.mutate();
          void live.mutate();
        }}
      />
    </>
  );
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, Tone> = {
  completed: "positive",
  running: "info",
  awaiting_confirmation: "warn",
  failed: "danger",
  blocked: "danger",
  cancelled: "neutral",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {status === "awaiting_confirmation" ? "Waiting" : humanise(status)}
    </Badge>
  );
}

/* ── one run ─────────────────────────────────────────────────────────── */

/**
 * The whole log of one turn.
 *
 * Read straight from the event table rather than reconstructed: the loop writes
 * each event as it happens, in short transactions, precisely so that a turn that
 * crashed halfway leaves an honest record instead of a blank one. That is what
 * makes this worth opening on a failure.
 */
function RunDetail({
  id,
  onClose,
  onCancelled,
}: {
  id: string | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { data, error, mutate } = useSWR<RunDetailOut>(
    id ? `/assistant/admin/runs/${id}` : null,
    { revalidateOnFocus: false },
  );

  const cancel = useAction(async () => {
    if (!id) return;
    await api.post(`/assistant/admin/runs/${id}/cancel`);
    await mutate();
    onCancelled();
  });

  const open = data?.status === "running" || data?.status === "awaiting_confirmation";

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      width="lg"
      title={data ? data.user_name : "Run"}
      description={data ? `${humanise(data.status)} · ${dateTime(data.started_at)}` : "Reading the log."}
      footer={
        open && (
          <Button
            variant="danger"
            icon={CircleStop}
            loading={cancel.pending}
            disabled={data?.cancel_requested}
            onClick={() => void cancel.run()}
          >
            {data?.cancel_requested ? "Stopping…" : "Stop this turn"}
          </Button>
        )
      }
    >
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="space-y-5 pb-4">
          <div>
            <p className="micro mb-1.5 text-ink-4">Asked</p>
            <p className="whitespace-pre-wrap rounded-2xl bg-panel-2 p-4 text-[13px] leading-relaxed">
              {data.user_text}
            </p>
          </div>

          {data.answer_text && (
            <div>
              <p className="micro mb-1.5 text-ink-4">Answered</p>
              <p className="whitespace-pre-wrap rounded-2xl bg-panel-2 p-4 text-[13px] leading-relaxed">
                {data.answer_text}
              </p>
            </div>
          )}

          {data.error && (
            <div>
              <p className="micro mb-1.5 text-ink-4">Failed with</p>
              <p className="rounded-2xl bg-danger-soft p-4 text-[12.5px] leading-relaxed text-danger">
                {data.error}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Figure label="Cost" value={`$${Number(data.cost_usd).toFixed(4)}`} />
            <Figure label="Tools" value={num(data.tool_calls)} />
            <Figure label="Rounds" value={num(data.rounds)} />
            <Figure label="Model" value={data.model_key} small />
            <Figure label="In" value={num(data.input_tokens)} />
            <Figure label="Cached in" value={num(data.cached_input_tokens)} />
            <Figure label="Out" value={num(data.output_tokens)} />
            <Figure label="Reasoning" value={num(data.reasoning_tokens)} />
          </div>

          <div>
            <PanelHead title="The log" count={data.events.length} />
            <ol className="mt-2 space-y-1">
              {data.events.map((event) => (
                <Event key={event.seq} event={event} />
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Figure({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="micro text-ink-4">{label}</p>
      <p className={clsx("mt-1 truncate", small ? "text-[12.5px] font-medium" : "fig text-[17px]")}>
        {value}
      </p>
    </div>
  );
}

/** Colours by what the event means rather than by severity. */
const EVENT_TONE: Record<string, string> = {
  error: "text-danger",
  blocked_by_policy: "text-danger",
  declined: "text-warn",
  confirmation_requested: "text-warn",
  confirmed: "text-positive",
  cancelled: "text-ink-3",
};

function Event({ event }: { event: RunEventOut }) {
  const summary = (event.payload?.summary ?? event.payload?.message ?? "") as string;
  const args = event.payload?.arguments;

  return (
    <li className="flex gap-3 rounded-[11px] bg-panel-2 px-3 py-2">
      <span className="tnum w-6 shrink-0 pt-px text-[10.5px] text-ink-4">{event.seq}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span
            className={clsx(
              "text-[12px] font-medium",
              EVENT_TONE[event.kind] ?? "text-ink-2",
            )}
          >
            {humanise(event.kind)}
          </span>
          {event.tool_key && (
            <span className="tnum text-[11px] text-ink-4">{event.tool_key}</span>
          )}
        </span>
        {args !== undefined && (
          <pre className="no-bar mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[10.5px] leading-relaxed text-ink-4">
            {JSON.stringify(args)}
          </pre>
        )}
        {summary && (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-3">
            {summary}
          </p>
        )}
      </span>
    </li>
  );
}
