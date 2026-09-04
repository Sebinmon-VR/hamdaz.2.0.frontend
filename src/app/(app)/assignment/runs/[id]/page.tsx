"use client";

import clsx from "clsx";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Ban, Lock, Trash2, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { date, dateTime, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { EntryOut, RunOut } from "@/lib/types";
import { FACTOR_KEYS } from "@/lib/types";
import {
  Avatar,
  Badge,
  Figure,
  HeroPanel,
  Meter,
  PageHead,
  Panel,
  PanelHead,
  SolidBadge,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import {
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
} from "@/components/ui/feedback";

/**
 * One kept ranking.
 *
 * A record, not a live view: the counts are as they were read and the policy is
 * the snapshot frozen onto the row. That is the point of keeping one — a later
 * edit to the weights must not be able to rewrite what a decision was based on,
 * so this screen never re-scores anything.
 */
export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [opened, setOpened] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = useSWR<RunOut>(`/analytics/runs/${id}`);
  const remove = useAction(async () => api.del(`/analytics/runs/${id}`));

  if (run.error) return <ErrorState error={run.error} onRetry={() => run.mutate()} />;
  if (!run.data) return <PanelSkeleton lines={8} />;

  const data = run.data;
  const pool = data.entries
    .filter((e) => !e.excluded)
    .sort((a, b) => (a.priority_score ?? Infinity) - (b.priority_score ?? Infinity));
  const out = data.entries.filter((e) => e.excluded);
  // Across every entry, not just the pool: the excluded rows are clickable
  // too, and looking them up in the pool alone meant clicking one silently
  // showed whoever was ranked first instead.
  const selected = data.entries.find((e) => e.user_id === opened) ?? pool[0];

  const snapshot = data.policy_snapshot as Record<string, unknown>;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/assignment/user-analytics">Ranking</Link>}
        title={data.next_up ?? "No one eligible"}
        lead={data.notes ?? undefined}
        actions={
          <>
            <Badge tone="neutral" icon={Lock}>
              Kept {dateTime(data.created_at)}
            </Badge>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </>
        }
      />

      {remove.error && <InlineNotice tone="danger">{remove.error}</InlineNotice>}

      <div className="grid gap-4 lg:grid-cols-[1.58fr_1fr]">
        <HeroPanel className="p-7">
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            <Figure
              label="Next up at the time"
              value={data.next_up ?? "—"}
              size="sm"
              sub={`of ${num(data.assignable ?? pool.length)} in the pool`}
            />
            <Figure label="People scored" value={num(data.entries.length)} sub={`${out.length} excluded`} />
            <Figure label="Rows read" value={num(data.rows_read)} sub="from the Proposals list" />
          </div>

          {data.excluded_note && (
            <InlineNotice tone="warn" className="mt-6">
              {data.excluded_note}
            </InlineNotice>
          )}

          <p className="mt-6 text-[11.5px] leading-relaxed text-ink-4">
            Recorded by {data.created_by_name ?? "somebody"} for{" "}
            {data.team_name ?? "the organisation"}. Counts are as they were read then, not
            as they are now.
          </p>
        </HeroPanel>

        <Panel className="p-7">
          <PanelHead title="The policy, as it stood" />
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
            Frozen onto this record. Editing the live policy does not change anything here.
          </p>
          <dl className="mt-6 space-y-2.5">
            {SNAPSHOT_ROWS.map((row) => {
              const value = snapshot[row.key];
              if (value === undefined || value === null) return null;
              return (
                <div key={row.key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12.5px] text-ink-3">{row.label}</dt>
                  <dd className="tnum text-[12.5px] font-medium text-ink">
                    {formatSnapshot(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>

      <Panel tone="slab" className="grid gap-5 p-5 lg:grid-cols-[1fr_1.25fr]">
        <div className="min-w-0">
          <div className="flex items-center gap-3 px-2 pb-3.5">
            <span className="text-[16px] font-semibold">Order</span>
            {out.length > 0 && <SolidBadge tone="second">{out.length} out</SolidBadge>}
            <span className="tnum ml-auto text-[12px] text-slab-ink-3">
              {data.entries.length}
            </span>
          </div>
          <div className="max-h-[460px] space-y-1 overflow-y-auto">
            {[...pool, ...out].map((entry) => (
              <button
                key={entry.user_id ?? entry.display_name}
                onClick={() => setOpened(entry.user_id)}
                className={clsx(
                  "flex h-[58px] w-full items-center gap-3.5 rounded-full px-4 text-left transition",
                  entry.excluded && "opacity-60",
                  selected?.user_id === entry.user_id
                    ? "bg-slab-row ring-[1.5px] ring-[var(--accent)]"
                    : "hover:bg-slab-row",
                )}
              >
                <span
                  className={clsx(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[11.5px] font-bold",
                    entry.priority_score === 1
                      ? "bg-accent text-accent-ink"
                      : "bg-slab-row text-slab-ink-3",
                  )}
                >
                  {entry.excluded ? <Ban className="size-3.5" /> : entry.priority_score}
                </span>
                <Avatar
                  name={entry.display_name}
                  seed={entry.user_id ?? entry.display_name}
                  size="sm"
                  className="size-9"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-semibold">
                    {entry.display_name}
                  </span>
                  <span className="truncate text-[11.5px] text-slab-ink-3">
                    {entry.excluded
                      ? (entry.excluded_reason ?? "Out of the pool")
                      : entry.labels.join(" · ") || "no labels"}
                  </span>
                </span>
                {!entry.excluded && (
                  <span className="fig ml-auto w-14 shrink-0 text-right text-[18px]">
                    {entry.weighted_score}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {selected && <Breakdown entry={selected} runId={id} />}
      </Panel>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this run?"
        description="The record goes for good. It does not affect the live policy or anybody's work — only the history of what was decided."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={remove.pending}
              onClick={async () => {
                if ((await remove.run()) !== undefined) router.push("/assignment/user-analytics");
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );
}

/* ── the breakdown ───────────────────────────────────────────────────── */

const FACTOR_NAMES: Record<string, string> = {
  load_vs_capacity: "Load against capacity",
  open_task_count: "Open task count",
  days_since_last_assign: "Days since last assigned",
};

/**
 * Why one person scored what they did.
 *
 * The entry already carries its factors, so this renders from the run. The
 * dedicated per-person endpoint exists for fetching one in isolation and is
 * used as the fallback when a row somehow arrives without them.
 */
function Breakdown({ entry, runId }: { entry: EntryOut; runId: string }) {
  const hasFactors = Object.keys(entry.factors ?? {}).length > 0;
  const detail = useSWR<EntryOut>(
    !hasFactors && entry.user_id
      ? `/analytics/runs/${runId}/people/${entry.user_id}`
      : null,
  );
  const shown = hasFactors ? entry : (detail.data ?? entry);

  // Runs recorded before active/bid-closed were split carry a zero in the
  // new column rather than a real count.
  const predatesActiveSplit = shown.active_tasks === 0 && shown.open_tasks > 0;

  const factors = FACTOR_KEYS.map((key) => ({ key, ...(shown.factors?.[key] ?? null) })).filter(
    (f) => f.raw !== undefined,
  );
  const biggest = Math.max(0.0001, ...factors.map((f) => f.contribution ?? 0));

  return (
    <div className="flex min-w-0 flex-col rounded-[16px] bg-well p-6 text-well-ink">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">
            {shown.excluded ? "Out of the pool" : `Rank ${shown.priority_score}`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <span className="fig text-[24px]">{shown.display_name}</span>
            {shown.priority_score === 1 && (
              <SolidBadge tone="accent">
                <Trophy className="mr-1 inline size-3" /> Next up
              </SolidBadge>
            )}
          </div>
        </div>
        {!shown.excluded && (
          <span className="ml-auto text-right">
            <p className="text-[11.5px] text-well-ink-3">Score</p>
            <p className="fig mt-1 text-[24px]">{shown.weighted_score}</p>
          </span>
        )}
      </div>

      {shown.excluded ? (
        <InlineNotice tone="warn" className="mt-6">
          {shown.excluded_reason ?? "Took no new work under this policy."}
        </InlineNotice>
      ) : (
        <div className="mt-7 space-y-5">
          {factors.map((factor) => (
            <div key={factor.key}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                <span className="text-[12.5px] font-medium">
                  {FACTOR_NAMES[factor.key] ?? factor.key}
                </span>
                <span className="tnum text-[11.5px] text-well-ink-3">
                  raw {factor.raw} · normalised {factor.normalised!.toFixed(2)} · weight{" "}
                  {factor.weight}
                </span>
                <span className="tnum ml-auto text-[12.5px] font-semibold">
                  +{factor.contribution!.toFixed(3)}
                </span>
              </div>
              <Meter value={factor.contribution ?? 0} max={biggest} height={8} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {[
          { label: "Effective load", value: shown.effective_load },
          // The scoring moved from open to active work, and the column was
          // added with a default of 0 — so a run kept before that reads zero
          // active, which is not the same as having had none. Show the number
          // that run was actually decided on rather than a misleading nought.
          predatesActiveSplit
            ? { label: "Open then", value: num(shown.open_tasks) }
            : { label: "Active then", value: num(shown.active_tasks) },
          { label: "Overdue", value: num(shown.overdue_tasks) },
          { label: "Completed", value: num(shown.completed_tasks) },
          { label: "Of", value: num(shown.total_tasks) },
          { label: "Capacity", value: shown.capacity },
        ].map((tile) => (
          <div
            key={tile.label}
            className="flex h-[86px] flex-col justify-between rounded-[14px] bg-well-tile p-3.5"
          >
            <span className="fig text-[19px]">{tile.value}</span>
            <span className="text-[11px] leading-tight text-well-ink-3">{tile.label}</span>
          </div>
        ))}
      </div>

      {shown.last_assigned_on && (
        <p className="mt-5 text-[11.5px] text-well-ink-3">
          Last given something on {date(shown.last_assigned_on)}.
        </p>
      )}
    </div>
  );
}

/* ── the frozen policy ───────────────────────────────────────────────── */

const SNAPSHOT_ROWS = [
  { key: "name", label: "Policy" },
  { key: "default_capacity", label: "Baseline capacity" },
  { key: "default_max_open", label: "Default max open" },
  { key: "weight_load", label: "Weight · load" },
  { key: "weight_open_count", label: "Weight · open count" },
  { key: "weight_idle_days", label: "Weight · idle days" },
  { key: "new_joiner_days", label: "New-joiner window" },
  { key: "exclude_on_leave", label: "Skip people on leave" },
  { key: "excluded_labels", label: "Excluding labels" },
  { key: "capacity_by_label", label: "Capacity overrides" },
];

function formatSnapshot(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(", ") : "none";
  }
  return String(value);
}
