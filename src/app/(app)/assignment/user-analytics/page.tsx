"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Ban,
  Bookmark,
  RefreshCw,
  Settings2,
  Trophy,
} from "lucide-react";
import { ApiError, api, withQuery } from "@/lib/api";
import { date, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { EntryOut, FactorKey, RunOut, RunSummaryOut } from "@/lib/types";
import { FACTOR_KEYS } from "@/lib/types";
import {
  AccentSlab,
  Avatar,
  Meter,
  Row,
  RowHead,
  PageHead,
  Panel,
  PanelHead,
  SolidBadge,
  StatBox,
} from "@/components/ui/primitives";
import { PersonHover } from "@/components/people/PersonHover";
import { Button, Field, PillRail, Textarea } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  RowsSkeleton,
} from "@/components/ui/feedback";

/**
 * Who should get the next task, and why.
 *
 * **Nothing here assigns anything.** The backend says so in as many words: it
 * ranks, and handing the work over is still a person's action. Task counts are
 * read live from SharePoint on every call and nothing is written back there.
 *
 * Two endpoints, and the split is the whole design. `/preview` computes and
 * keeps nothing — the common case, since a history full of rankings nobody
 * acted on would bury the ones that mattered. `POST /runs` computes the same
 * thing and stores it with the policy frozen onto the row, so a later edit to
 * the policy cannot rewrite what a decision was based on.
 *
 * A team is required and must have an assignment policy **of its own**. The
 * organisation default deliberately does not qualify, so a 409 here is a
 * configuration answer rather than a failure, and is reported as one.
 */
export default function UserAnalyticsPage() {
  const session = useSession();
  const teams = session.teams.map((t) => t.team).filter((t) => !t.archived_at);
  const [slug, setSlug] = useState(teams[0]?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const preview = useSWR<RunOut>(
    slug ? withQuery("/analytics/preview", { team: slug }) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const runs = useSWR<RunSummaryOut[]>(
    slug ? withQuery("/analytics/runs", { team: slug, limit: 10 }) : null,
  );

  const run = preview.data;
  const entries = run?.entries ?? [];
  // Every entry carries the weights the run used, so the panel below reports
  // what was actually applied rather than what the policy screen says now.
  // Read across all of them: a factor the backend could not compute is simply
  // absent from that person, not absent from the policy.
  const weights = useMemo(() => {
    const found = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 0])) as Record<
      FactorKey,
      number
    >;
    for (const entry of run?.entries ?? []) {
      for (const key of FACTOR_KEYS) {
        const weight = entry.factors[key]?.weight;
        if (weight !== undefined) found[key] = Math.max(found[key], weight);
      }
    }
    return found;
  }, [run]);
  const weightTotal = FACTOR_KEYS.reduce((sum, key) => sum + weights[key], 0);

  const pool = entries.filter((e) => !e.excluded).sort(rankOrder);
  const out = entries.filter((e) => e.excluded);
  // Searched across every entry, not just the pool: the excluded rows are
  // clickable too, and looking them up in the pool alone meant clicking one
  // silently showed whoever was top-ranked instead. Falling back to the
  // leader is only for the initial render, when nothing has been picked.
  const selected = entries.find((e) => e.user_id === opened) ?? pool[0];

  // A 409 means the team has no policy of its own — a setup answer, not a
  // breakage, and it comes with instructions the backend wrote.
  const scope = preview.error instanceof ApiError && preview.error.status === 409
    ? preview.error.message
    : null;

  function refresh() {
    preview.mutate(
      () => api.get<RunOut>("/analytics/preview", { team: slug, refresh: true }),
      { revalidate: false },
    );
  }

  if (teams.length === 0) {
    return (
      <>
        <PageHead eyebrow="Work assignment" title="User analytics" />
        <Empty
          title="You are not in a team"
          body="This is always per team. There is no company-wide order, because putting everybody in one queue would mix teams that never share work."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Work assignment"
        title="User analytics"
        lead="Read live from SharePoint. Nothing here assigns anything."
        actions={
          <>
            <Button
              icon={RefreshCw}
              loading={preview.isValidating}
              onClick={refresh}
              disabled={!slug}
            >
              Re-read SharePoint
            </Button>
            <Button
              variant="accent"
              size="lg"
              icon={Bookmark}
              disabled={!run || pool.length === 0}
              onClick={() => setSaving(true)}
            >
              Save this
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] text-ink-3">Team</span>
        <PillRail
          value={slug}
          onChange={(next) => {
            setSlug(next);
            setOpened(null);
          }}
          options={teams.map((team) => ({ value: team.slug, label: team.name }))}
        />
      </div>

      {scope ? (
        <InlineNotice tone="info">
          {scope}{" "}
          <Link href="/assignment/policy" className="font-semibold underline underline-offset-2">
            Open the policy screen
          </Link>
          .
        </InlineNotice>
      ) : preview.error ? (
        <ErrorState error={preview.error} onRetry={() => preview.mutate()} />
      ) : !run ? (
        <RowsSkeleton rows={8} />
      ) : (
        <>
          {/* The one accent on the screen names the one answer it exists to
              give. Everything else beside it is a plain block. */}
          <div className="flex flex-col gap-3.5 lg:flex-row">
            <AccentSlab
              label="Next up"
              title={run.next_up ?? "Nobody eligible"}
              value={pool[0]?.weighted_score ?? undefined}
              sub={
                pool[0]
                  ? [
                      pool[0].labels[0],
                      `×${pool[0].capacity}`,
                      `${num(pool[0].active_tasks)} active`,
                      pool[0].days_since_last_assign === null
                        ? "never assigned"
                        : `${pool[0].days_since_last_assign} days idle`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined
              }
              bleed={false}
              className="min-w-0 flex-1 lg:max-w-[480px]"
            />

            <div className="grid flex-1 grid-cols-2 gap-3.5 sm:grid-cols-4">
              <StatBox label="Can take work" value={num(pool.length)} />
              <StatBox label="People checked" value={num(entries.length)} />
              <StatBox
                label="Not available"
                value={num(out.length)}
                tone={out.length > 0 ? "second" : undefined}
              />
              <StatBox label="Tasks read" value={num(run.rows_read)} />
            </div>
          </div>

          {run.excluded_note && <InlineNotice tone="warn">{run.excluded_note}</InlineNotice>}

          {/* The weights the run actually applied, read off its own entries. */}
          <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
            <span className="micro text-ink-4">What counts most</span>
            {FACTOR_KEYS.map((key) => {
              const share = weightTotal > 0 ? weights[key] / weightTotal : 0;
              return (
                <div key={key} className="flex min-w-[168px] flex-1 flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium" title={FACTORS[key].blurb}>
                      {FACTORS[key].name}
                    </span>
                    <span className="tnum ml-auto text-[12px] font-semibold">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                  <Meter value={share} max={1} />
                </div>
              );
            })}
            <Link
              href="/assignment/policy"
              aria-label="Change what counts"
              className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-panel-2 text-ink-3 transition hover:text-ink"
            >
              <Settings2 className="size-3.5" strokeWidth={2} />
            </Link>
          </Panel>

          {/* ── the ranking ───────────────────────────────────────── */}
          {pool.length === 0 && out.length === 0 ? (
            <Empty
              title="Nobody to order"
              body="No members of this team appear on the Proposals list."
            />
          ) : (
            <div className="flex min-h-0 flex-col gap-3.5 lg:flex-row">
              <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden py-2">
                <RowHead>
                  <span className="micro w-8 text-ink-4">#</span>
                  <span className="micro flex-1 text-ink-4">Person</span>
                  <span className="micro w-14 text-right text-ink-4">Cap</span>
                  <span className="micro w-16 text-right text-ink-4">Active</span>
                  <span className="micro w-16 text-right text-ink-4">Score</span>
                </RowHead>

                <div className="max-h-[520px] overflow-y-auto">
                  {pool.map((entry) => (
                    <EntryRow
                      key={entry.user_id ?? entry.display_name}
                      entry={entry}
                      selected={selected?.user_id === entry.user_id}
                      onSelect={() => setOpened(entry.user_id)}
                    />
                  ))}

                  {out.length > 0 && (
                    <div className="mx-4 mt-3 flex items-center gap-2.5 border-t border-line pt-3">
                      <span className="micro text-second">Not available</span>
                      <span className="tnum ml-auto text-[11px] text-ink-4">{out.length}</span>
                    </div>
                  )}
                  {out.map((entry) => (
                    <EntryRow
                      key={entry.user_id ?? entry.display_name}
                      entry={entry}
                      selected={selected?.user_id === entry.user_id}
                      onSelect={() => setOpened(entry.user_id)}
                    />
                  ))}
                </div>
              </Panel>

              {selected && (
                <Panel
                  tone="sheet"
                  className="flex w-full shrink-0 flex-col p-6 lg:w-[486px]"
                >
                  <Explanation entry={selected} />
                </Panel>
              )}
            </div>
          )}

          {/* ── kept runs ─────────────────────────────────────────── */}
          <Panel className="p-6">
            <PanelHead
              title="Saved"
              count={runs.data?.length ?? 0}
              hint="Orders somebody chose to save"
            />
            {!runs.data ? (
              <RowsSkeleton rows={3} />
            ) : runs.data.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                None yet. Keeping a run records who was next and the policy it was decided
                under.
              </p>
            ) : (
              <div className="mt-4 space-y-1">
                {runs.data.map((summary) => (
                  <Link
                    key={summary.id}
                    href={`/assignment/runs/${summary.id}`}
                    className="flex flex-wrap items-center gap-4 rounded-[20px] px-4 py-3 transition hover:bg-panel-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                      <Trophy className="size-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {summary.next_up ?? "No one eligible"}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-4">
                        {summary.notes ?? `${summary.assignable} of ${summary.people} in the pool`}
                      </span>
                    </span>
                    <span className="tnum ml-auto shrink-0 text-[11.5px] text-ink-4">
                      {summary.created_by_name ?? "—"} · {relative(summary.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      <SaveRun
        open={saving}
        slug={slug}
        nextUp={run?.next_up ?? null}
        onClose={() => setSaving(false)}
        onSaved={() => {
          setSaving(false);
          runs.mutate();
        }}
      />
    </>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

/** Rank 1 is next up; anyone unscored sorts to the end. */
function rankOrder(a: EntryOut, b: EntryOut) {
  return (a.priority_score ?? Infinity) - (b.priority_score ?? Infinity);
}

const FACTORS = {
  load_vs_capacity: {
    name: "How busy they are",
    glyph: "÷",
    blurb:
      "what they are carrying, divided by the share their labels say they should take",
  },
  open_task_count: {
    name: "How many live tasks",
    glyph: "#",
    blurb:
      "the raw number, because somebody holding twenty things is under pressure whatever their multiplier says",
  },
  days_since_last_assign: {
    name: "How long they have waited",
    glyph: "⏱",
    blurb:
      "how long they have waited — without it the two fastest closers absorb everything, since finishing work is what makes you look available",
  },
} as const;

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: EntryOut;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Row
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      selected={selected}
      aria-pressed={selected}
      className={clsx("cursor-pointer", entry.excluded && !selected && "opacity-55")}
    >
      <span
        className={clsx(
          "tnum w-8 shrink-0 text-[14px] font-bold",
          selected
            ? "text-row-ink"
            : entry.priority_score === 1
              ? "text-accent"
              : "text-ink-3",
        )}
      >
        {entry.excluded ? (
          <Ban className="size-3.5" />
        ) : (
          String(entry.priority_score ?? "").padStart(2, "0")
        )}
      </span>

      <PersonHover
        userId={entry.user_id}
        name={entry.display_name}
        email={entry.email}
        className="shrink-0"
      >
        <Avatar
          name={entry.display_name}
          seed={entry.user_id ?? entry.display_name}
          size="sm"
          className="size-[22px] shrink-0 rounded-[7px] text-[8.5px]"
        />
      </PersonHover>

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {entry.display_name}
        <span
          className={clsx(
            "ml-2 text-[11px] font-normal",
            selected ? "text-row-ink-2" : "text-ink-4",
          )}
        >
          {entry.excluded
            ? (entry.excluded_reason ?? "not available")
            : entry.labels.length > 0
              ? entry.labels.join(" · ")
              : "no labels"}
        </span>
      </span>

      {!entry.excluded && (
        <>
          <span
            className={clsx(
              "tnum w-14 shrink-0 text-right text-[12px]",
              selected ? "text-row-ink-2" : "text-ink-2",
            )}
          >
            {entry.capacity}
          </span>
          {/* active, not open: the bid-closed work is still on the list but
              the scoring does not count it, and showing the wider number here
              made the order look wrong. */}
          <span
            className={clsx(
              "tnum w-16 shrink-0 text-right text-[12px]",
              selected ? "text-row-ink-2" : "text-ink-2",
            )}
            title={`${entry.active_tasks} active of ${entry.total_tasks}${
              entry.bid_closed_tasks > 0 ? ` · ${entry.bid_closed_tasks} bid closed` : ""
            }`}
          >
            {entry.active_tasks}
          </span>
          <span className="tnum w-16 shrink-0 text-right text-[12.5px] font-bold">
            {entry.weighted_score}
          </span>
        </>
      )}
    </Row>
  );
}

/** Why one person scored what they did — the factors, weighted and summed. */
function Explanation({ entry }: { entry: EntryOut }) {
  const factors = FACTOR_KEYS.map((key) => ({ key, ...(entry.factors[key] ?? null) })).filter(
    (f) => f.raw !== undefined,
  );
  const biggest = Math.max(0.0001, ...factors.map((f) => f.contribution ?? 0));

  return (
    <div className="flex min-w-0 flex-col rounded-[16px] bg-well p-6 text-well-ink">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] text-well-ink-3">
            {entry.excluded ? "Not available" : `#${entry.priority_score}`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <span className="fig text-[24px]">{entry.display_name}</span>
            {entry.priority_score === 1 && <SolidBadge tone="accent">Next up</SolidBadge>}
          </div>
        </div>
        {!entry.excluded && (
          <span className="ml-auto text-right">
            <p className="text-[11.5px] text-well-ink-3">Score</p>
            <p className="fig mt-1 text-[24px]">{entry.weighted_score}</p>
          </span>
        )}
      </div>

      {entry.excluded ? (
        <InlineNotice tone="warn" className="mt-6">
          {entry.excluded_reason ?? "This person takes no new work under the current policy."}
        </InlineNotice>
      ) : (
        <div className="mt-7 space-y-5">
          {factors.map((factor) => (
            <div key={factor.key}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                <span className="text-[12.5px] font-medium">
                  {FACTORS[factor.key].name}
                </span>
                <span className="tnum text-[11.5px] text-well-ink-3">
                  {fmtRaw(factor.key, factor.raw!)} · counts {factor.weight}×
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
          // effective_load is active_tasks / capacity — showing a count and a
          // capacity without it leaves the ratio unexplained.
          { label: "Work per share", value: entry.effective_load },
          // The three weighted parts added up, which is the number the order
          // is actually sorted on — the score people read is derived from it.
          { label: "Total of the parts", value: entry.factor_total ?? "—" },
          { label: "Active", value: num(entry.active_tasks) },
          { label: "Bid closed", value: num(entry.bid_closed_tasks) },
          { label: "Expired", value: num(entry.expired_tasks) },
          { label: "Due soon", value: num(entry.due_soon_tasks) },
          { label: "Overdue", value: num(entry.overdue_tasks) },
          // A fifth of the Proposals list carries no status at all, and those
          // rows land in the open count. Worth seeing before trusting a load.
          { label: "No status", value: num(entry.no_status_tasks) },
          { label: "Capacity", value: entry.capacity },
          {
            label: "Waited",
            value:
              entry.days_since_last_assign === null
                ? "never"
                : `${entry.days_since_last_assign}d`,
          },
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

      <p className="mt-5 text-[11.5px] leading-relaxed text-well-ink-3">
        {entry.last_assigned_on
          ? `Last given something on ${date(entry.last_assigned_on)}.`
          : "Has never been given anything through this, so counts as having waited a year."}
        {entry.max_open !== null && ` Capped at ${entry.max_open} open items.`}
      </p>
    </div>
  );
}

/** Raw values mean different things per factor, so they are formatted apart. */
function fmtRaw(key: string, raw: number): string {
  if (key === "days_since_last_assign") return `${Math.round(raw)}d`;
  if (key === "load_vs_capacity") return raw.toFixed(2);
  return String(Math.round(raw));
}

function SaveRun({
  open,
  slug,
  nextUp,
  onClose,
  onSaved,
}: {
  open: boolean;
  slug: string;
  nextUp: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const save = useAction(async () =>
    api.post<RunOut>("/analytics/runs", { notes: notes.trim() || null }, { team: slug }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save this"
      description="Records the ranking with the policy frozen onto it, so a later edit to the weights cannot rewrite what this decision was based on."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Bookmark}
            loading={save.pending}
            onClick={async () => {
              if ((await save.run()) !== undefined) {
                setNotes("");
                onSaved();
              }
            }}
          >
            Keep it
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        {nextUp && (
          <p className="text-[13px] text-ink-2">
            <strong className="font-semibold text-ink">{nextUp}</strong> is next up. The run
            is recomputed as it is saved, so the counts are read fresh.
          </p>
        )}
        <Field label="Note" hint="Why you saved it, for whoever reads it later.">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Deciding the Sharjah Cement package."
          />
        </Field>
      </div>
    </Modal>
  );
}
