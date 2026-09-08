"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { Coins, Mic, ShieldAlert, Volume2 } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type {
  AnalyticsBucket,
  AssistantAnalyticsOut,
  VoiceAnalyticsOut,
} from "@/lib/types";
import {
  Meter,
  PageHead,
  Panel,
  PanelHead,
  StatBox,
} from "@/components/ui/primitives";
import { PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * What the assistant is used for, and what it costs.
 *
 * Two decisions about how this is drawn, and both follow from what the numbers
 * are for.
 *
 * **The day chart plots one measure at a time**, with a switch rather than a
 * second axis. Runs, cost and tokens are three different scales, and putting two
 * of them on one plot with two y-axes is the way to make any pair of lines
 * appear to be related — the reader cannot see the scales, only the crossings.
 * So: one measure, one axis, and a switch for the others.
 *
 * **Every breakdown is a table with a bar in it**, not a pie or a set of coloured
 * series. These are rankings — which tool, which person, which model — and a
 * ranking is read down a column. A colour per row would also mean a legend, and
 * a legend is a lookup this data does not need: the row is already labelled.
 *
 * **The voice is a panel of its own, not a row in the tables.** Its two halves
 * are not measured the same way and cannot honestly be stacked next to the
 * chat's. Reading an answer aloud is counted here, exactly, from the text we
 * sent. A spoken conversation is counted by the *browser*, from what OpenAI
 * reported to it, and a session that ended in a closed tab reports nothing — so
 * that figure is a floor. Putting a floor and two exact numbers in one column
 * under one heading would be the quickest way to have somebody quote the wrong
 * one in a budget.
 *
 * One thing worth knowing before reading the team rows: a person on two teams
 * counts for both, so the teams add up to more than the total. That is what a
 * team lead wants to see, and it is said on the panel rather than left to be
 * discovered.
 */

type Measure = "cost" | "runs" | "tokens";

const MEASURE: Record<Measure, { label: string; of: (b: AnalyticsBucket) => number; show: (n: number) => string }> = {
  cost: { label: "Cost", of: (b) => Number(b.cost_usd), show: (n) => `$${n.toFixed(2)}` },
  runs: { label: "Turns", of: (b) => b.runs, show: (n) => num(n) },
  tokens: {
    label: "Tokens",
    of: (b) => b.input_tokens + b.output_tokens,
    show: (n) => num(n),
  },
};

export default function AssistantAnalyticsPage() {
  const session = useSession();
  const [days, setDays] = useState(30);
  const [measure, setMeasure] = useState<Measure>("cost");

  const { data, error, mutate } = useSWR<AssistantAnalyticsOut>(
    withQuery("/assistant/admin/analytics", { since: daysAgo(days - 1) }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Assistant usage" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Reading what the assistant has cost across the organisation is a super admin's business, and the endpoint behind this screen enforces that itself."
        />
      </>
    );
  }

  const totals = data?.totals;

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Assistant usage"
        count={totals ? `${num(totals.runs)} turns` : undefined}
        lead="Priced from the model lists, chat and voice, so a stale price makes every figure here wrong."
        meta={data ? `${dateShort(data.since)} – ${dateShort(data.until)}` : undefined}
      />

      <AssistantAdminNav />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={String(days)}
          onChange={(value) => setDays(Number(value))}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
        <PillRail
          value={measure}
          onChange={setMeasure}
          options={(Object.keys(MEASURE) as Measure[]).map((key) => ({
            value: key,
            label: MEASURE[key].label,
          }))}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data || !totals ? (
        <PanelSkeleton lines={8} />
      ) : totals.runs === 0 && data.voice.speech.uses === 0 ? (
        <Empty
          icon={Coins}
          title="Nothing in this window"
          body="Nobody has used the assistant in this period. Try a longer one."
        />
      ) : (
        <div className="space-y-4">
          {/* Headline figures. A number is not a chart, and four of them in a
              row answer "how much, by whom" faster than any plot of the same
              four values would. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* The figure to quote is chat and voice together — but the two
                are named in the hint rather than merged silently, because
                somebody comparing this against last month's screen needs to
                know the voice was not in that one. */}
            <StatBox
              label="Spent"
              value={`$${Number(totals.total_cost_usd).toFixed(2)}`}
              hint={`$${Number(totals.cost_usd).toFixed(2)} on turns and $${Number(
                totals.voice_cost_usd,
              ).toFixed(2)} on reading answers aloud.`}
            />
            <StatBox label="Turns" value={num(totals.runs)} />
            <StatBox
              label="People"
              value={num(totals.people)}
              hint="Distinct people who took at least one turn."
            />
            <StatBox
              label="Tool calls"
              value={num(totals.tool_calls)}
              hint="Every call to a real endpoint, made as the person asking."
            />
          </div>

          <DayChart days={data.by_day} measure={measure} />

          <VoicePanel voice={data.voice} />

          {/* How turns ended, and how the confirmations went. Both are counts of
              one whole, so both are one bar rather than four numbers. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <PanelHead title="How turns ended" count={num(totals.runs)} />
              <Composition
                className="mt-4"
                total={totals.runs}
                parts={[
                  { label: "Completed", value: totals.completed, tone: "positive" },
                  { label: "Still open", value: totals.open, tone: "info" },
                  { label: "Failed", value: totals.failed, tone: "danger" },
                  { label: "Blocked", value: totals.blocked, tone: "danger" },
                  { label: "Cancelled", value: totals.cancelled, tone: "neutral" },
                ]}
              />
            </Panel>

            <Panel className="p-5">
              <PanelHead
                title="Confirmations"
                count={num(totals.confirmations_requested)}
                hint="Writes that stopped and asked"
              />
              <Composition
                className="mt-4"
                total={totals.confirmations_requested}
                parts={[
                  { label: "Approved", value: totals.confirmations_approved, tone: "positive" },
                  { label: "Declined", value: totals.confirmations_declined, tone: "warn" },
                ]}
              />
              {totals.refused_by_policy > 0 && (
                <InlineNotice tone="warn" className="mt-4">
                  {num(totals.refused_by_policy)}{" "}
                  {totals.refused_by_policy === 1 ? "call was" : "calls were"} refused by policy
                  — the model asked for a tool the person is not given. A few is the policy
                  working; a lot means the model is being told about tools it cannot use.
                </InlineNotice>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking title="Most used tools" rows={data.by_tool} measure={measure} />
            <Ranking title="Busiest people" rows={data.by_user} measure={measure} />
            <Ranking
              title="By team"
              rows={data.by_team}
              measure={measure}
              note="Somebody on two teams counts for both, so these add up to more than the total."
            />
            <Ranking title="By model" rows={data.by_model} measure={measure} />
          </div>
        </div>
      )}
    </>
  );
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/* ── one measure, over the window ────────────────────────────────────── */

/**
 * A column per day.
 *
 * One series, so there is no legend and no colour lookup: the title says what is
 * plotted and length carries the value. Only the largest column is labelled —
 * a number over every bar is the thing that makes a chart unreadable, and the
 * rest are available on hover and in the tables below.
 *
 * Columns are anchored to the baseline with rounded tops, and a bar with a value
 * always draws at least a couple of pixels: a day with one turn on it reading as
 * an empty day is a different fact.
 */
function DayChart({ days, measure }: { days: AnalyticsBucket[]; measure: Measure }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const spec = MEASURE[measure];
  const values = days.map(spec.of);
  const peak = Math.max(...values, 0);
  const busiest = values.indexOf(peak);
  const shown = hovered ?? busiest;

  return (
    <Panel className="p-5">
      <PanelHead
        title={`${spec.label} per day`}
        hint={days[shown] ? `${days[shown].label} · ${spec.show(values[shown])}` : undefined}
        action={
          <span className="tnum text-[11.5px] text-ink-4">
            peak {spec.show(peak)}
          </span>
        }
      />

      <div
        className="mt-5 flex h-40 items-end gap-[2px]"
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label={`${spec.label} per day. Peak ${spec.show(peak)} on ${days[busiest]?.label ?? "—"}.`}
      >
        {days.map((day, index) => {
          const value = values[index];
          const height = peak > 0 ? (value / peak) * 100 : 0;
          const on = hovered === index;
          return (
            <button
              key={day.key}
              onMouseEnter={() => setHovered(index)}
              onFocus={() => setHovered(index)}
              title={`${day.label} · ${spec.show(value)}`}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span
                className={clsx(
                  "w-full rounded-t-[4px] transition-opacity",
                  on ? "opacity-100" : "opacity-85 group-hover:opacity-100",
                )}
                style={{
                  // A floor of 2px, so a quiet day is visibly a quiet day
                  // rather than indistinguishable from one with nothing at all.
                  height: value > 0 ? `max(2px, ${height}%)` : "1px",
                  background: value > 0 ? "var(--accent)" : "var(--panel-3)",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Ends only. A label under every column at 90 days is a grey smear. */}
      <div className="mt-2 flex justify-between text-[10.5px] text-ink-4">
        <span>{days[0]?.label ?? ""}</span>
        <span>{days[days.length - 1]?.label ?? ""}</span>
      </div>
    </Panel>
  );
}

/* ── the voice ───────────────────────────────────────────────────────── */

/**
 * What the voice cost, with its two halves kept apart.
 *
 * They are not the same kind of number and the panel says so rather than
 * letting the layout imply otherwise:
 *
 * * **Read aloud** is exact. The backend prices it from the text it was about
 *   to send, before the request leaves, because that is the last moment the
 *   figure is knowable — the audio streams straight to the browser and a
 *   listener who closes the tab has still been billed for the whole clip.
 * * **Spoken** is a floor. OpenAI bills that session directly, so the only
 *   place its tokens exist on our side is what the browser reported at the end.
 *   A conversation that ended in a closed tab is missing from this figure
 *   entirely, and an administrator reading it as a bill would be wrong by
 *   however many of those there were.
 *
 * The spoken cost is also already inside the turns figure above — its run
 * carries it — which is why the headline adds only the read-aloud half. Said on
 * the panel, because "why do these three numbers not add up" is otherwise the
 * first question anybody asks it.
 */
function VoicePanel({ voice }: { voice: VoiceAnalyticsOut }) {
  const { speech, realtime } = voice;
  if (speech.uses === 0 && realtime.uses === 0) return null;

  return (
    <Panel className="p-5">
      <PanelHead
        title="Voice"
        count={`$${Number(voice.cost_usd).toFixed(2)}`}
        hint="Priced from the voice model list, which is separate from the chat models"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Half
          icon={Volume2}
          title="Read aloud"
          cost={speech.cost_usd}
          rows={[
            { label: "Clips", value: num(speech.uses) },
            { label: "Characters", value: num(speech.characters) },
          ]}
          note="Counted from the text sent, before it leaves — exact, and billed per character rather than per token."
        />
        <Half
          icon={Mic}
          title="Spoken conversations"
          cost={realtime.cost_usd}
          rows={[
            { label: "Sessions", value: num(realtime.uses) },
            { label: "Time", value: minutes(realtime.seconds) },
            {
              label: "Audio tokens",
              value: num(realtime.audio_input_tokens + realtime.audio_output_tokens),
            },
          ]}
          note="Reported by the browser at the end of each session, so a conversation that ended in a closed tab is missing: read it as a floor."
        />
      </div>

      {realtime.uses > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
          A spoken conversation&rsquo;s cost is already on its run, so it is counted in the
          turns figure above and left out of the read-aloud one. The three do add up — once.
        </p>
      )}

      {voice.by_model.length > 1 && (
        <ul className="mt-4 space-y-2.5">
          {[...voice.by_model]
            .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
            .map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">
                    {row.label}
                  </span>
                  <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">
                    ${Number(row.cost_usd).toFixed(2)}
                  </span>
                </div>
                <Meter
                  value={Number(row.cost_usd)}
                  max={Math.max(...voice.by_model.map((m) => Number(m.cost_usd)), 0)}
                  height={6}
                  className="mt-1.5"
                />
              </li>
            ))}
        </ul>
      )}
    </Panel>
  );
}

/** One half of the voice bill: a cost, the counts behind it, and its caveat. */
function Half({
  icon: Icon,
  title,
  cost,
  rows,
  note,
}: {
  icon: React.ElementType;
  title: string;
  cost: string;
  rows: { label: string; value: string }[];
  note: string;
}) {
  return (
    <div className="rounded-[13px] bg-panel-2 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-ink-4" strokeWidth={2.1} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
          {title}
        </span>
        <span className="fig shrink-0 text-[18px]">${Number(cost).toFixed(2)}</span>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="micro text-ink-4">{row.label}</dt>
            <dd className="tnum mt-0.5 text-[12.5px] font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-4">{note}</p>
    </div>
  );
}

/** Seconds as a person would say them. Zero reads as a dash, not "0m". */
function minutes(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 90) return `${seconds}s`;
  const total = Math.round(seconds / 60);
  return total < 60 ? `${total}m` : `${Math.floor(total / 60)}h ${total % 60}m`;
}

/* ── parts of a whole ────────────────────────────────────────────────── */

/**
 * A single bar broken into named parts, with the names beside it.
 *
 * Status colours rather than the accent ramp: "failed" and "completed" are
 * states, not positions on a scale, and this app already has one colour per
 * state that means the same thing on every other screen.
 */
function Composition({
  total,
  parts,
  className,
}: {
  total: number;
  parts: { label: string; value: number; tone: "positive" | "warn" | "danger" | "info" | "neutral" }[];
  className?: string;
}) {
  const live = parts.filter((part) => part.value > 0);
  if (total === 0 || live.length === 0) {
    return <p className={clsx("text-[12.5px] text-ink-4", className)}>Nothing yet.</p>;
  }

  const FILL: Record<string, string> = {
    positive: "var(--positive)",
    warn: "var(--warn)",
    danger: "var(--danger)",
    info: "var(--info)",
    neutral: "var(--panel-3)",
  };

  return (
    <div className={className}>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {live.map((part) => (
          <span
            key={part.label}
            title={`${part.label}: ${num(part.value)}`}
            className="rounded-full"
            style={{
              width: `${(part.value / total) * 100}%`,
              background: FILL[part.tone],
            }}
          />
        ))}
      </div>
      <ul className="mt-3.5 space-y-1.5">
        {live.map((part) => (
          <li key={part.label} className="flex items-center gap-2.5 text-[12.5px]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: FILL[part.tone] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-2">{part.label}</span>
            <span className="tnum shrink-0 text-ink">{num(part.value)}</span>
            <span className="tnum w-12 shrink-0 text-right text-[11px] text-ink-4">
              {Math.round((part.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── a ranking ───────────────────────────────────────────────────────── */

/** Rows ordered by the measure, each with a bar against the largest. */
function Ranking({
  title,
  rows,
  measure,
  note,
}: {
  title: string;
  rows: AnalyticsBucket[];
  measure: Measure;
  note?: string;
}) {
  const spec = MEASURE[measure];
  const ordered = [...rows].sort((a, b) => spec.of(b) - spec.of(a)).slice(0, 8);
  const peak = Math.max(...ordered.map(spec.of), 0);

  return (
    <Panel className="p-5">
      <PanelHead title={title} count={rows.length} hint={note} />
      {ordered.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-ink-4">Nothing yet.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {ordered.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                  {row.label}
                </span>
                <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">
                  {spec.show(spec.of(row))}
                </span>
              </div>
              {/* `Meter` already runs the house accent → second ramp, which is
                  the same move every other bar in this app makes. */}
              <Meter value={spec.of(row)} max={peak} height={6} className="mt-1.5" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
