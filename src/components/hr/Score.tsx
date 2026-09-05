"use client";

import clsx from "clsx";
import { humanise, num } from "@/lib/format";
import type { HrPerformanceOut, HrScore, HrTagScore } from "@/lib/types";
import { Badge, Figure, Meter } from "@/components/ui/primitives";

/**
 * What a filled-in form came to, as a number and as its parts.
 *
 * The tags are the reason this component exists rather than a percentage in a
 * `<span>`. The backend is explicit that one overall figure tells you somebody
 * scored 71% and the tags tell you they are strong technically and weak on
 * delivery, which is the thing anybody acts on — so the tags are given the
 * space and the headline number is deliberately not the loudest thing here.
 *
 * Two things are easy to get wrong reading these and are called out in the UI
 * rather than left to the reader:
 *
 *   * a null percent means "nothing scorable was answered", not "scored zero";
 *   * the tag maximums do not sum to the overall maximum, because a field
 *     feeds every tag it carries at full weight. Adding them up would count a
 *     two-tag question twice, so no total across tags is shown.
 */
export function ScoreCard({
  score,
  className,
}: {
  score: HrScore;
  className?: string;
}) {
  const scored = score.max > 0;

  return (
    <div className={clsx("space-y-5", className)}>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Figure
          label="Score"
          value={scored ? `${score.percent?.toFixed(1) ?? "—"}` : "—"}
          unit={scored ? "%" : undefined}
          sub={scored ? `${num(score.points)} of ${num(score.max)}` : "nothing scorable answered"}
          tone={scored ? "accent" : undefined}
        />
        <Figure size="sm" label="Answered" value={num(score.answered)} />
        <Figure
          size="sm"
          label="Skipped"
          value={num(score.skipped)}
          sub={score.skipped > 0 ? "left out of the total, not zeroed" : undefined}
        />
      </div>

      {score.tags.length > 0 && <TagBreakdown tags={score.tags} />}
    </div>
  );
}

/**
 * The same picture for somebody's whole record rather than one form.
 *
 * Separate from `ScoreCard` because the shape is genuinely different and the
 * caveats are too: `reviews` and `self_reviews` are the things that decide how
 * much weight the number deserves, and a record made entirely of self-reviews
 * is not evidence about anybody. So both counts are shown, always, even when
 * `self_reviews` is zero.
 */
export function PerformanceCard({
  performance,
  className,
}: {
  performance: HrPerformanceOut;
  className?: string;
}) {
  const scored = performance.max > 0;

  return (
    <div className={clsx("space-y-5", className)}>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Figure
          label="Combined score"
          value={scored ? (performance.percent?.toFixed(1) ?? "—") : "—"}
          unit={scored ? "%" : undefined}
          sub={
            scored
              ? `${num(performance.points)} of ${num(performance.max)}`
              : "no submitted review has scored anything"
          }
          tone={scored ? "accent" : undefined}
        />
        <Figure
          size="sm"
          label="Reviews"
          value={num(performance.reviews)}
          sub={
            performance.self_reviews > 0
              ? `${performance.self_reviews} written by themselves`
              : undefined
          }
        />
        <Figure size="sm" label="Cycles" value={num(performance.cycles.length)} />
      </div>

      {performance.reviews > 0 && performance.reviews === performance.self_reviews && (
        <p className="text-[12px] leading-relaxed text-warn">
          Every review counted here was written by the person about themselves. The number is
          a self-assessment, not a judgement anybody else made.
        </p>
      )}

      {performance.tags.length > 0 && <TagBreakdown tags={performance.tags} />}
    </div>
  );
}

/** The per-tag bars. Sorted worst first — the weak tag is the actionable one. */
export function TagBreakdown({ tags, className }: { tags: HrTagScore[]; className?: string }) {
  const ordered = [...tags].sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  return (
    <ul className={clsx("space-y-3", className)}>
      {ordered.map((tag) => (
        <li key={tag.tag}>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
              {humanise(tag.tag)}
            </span>
            <span className="tnum text-[12.5px] font-semibold text-ink">
              {tag.percent === null ? "—" : `${tag.percent.toFixed(0)}%`}
            </span>
            <span className="tnum text-[11px] text-ink-4">
              {num(tag.points)}/{num(tag.max)}
            </span>
          </div>
          <Meter value={tag.points} max={tag.max} height={6} className="mt-1.5" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The one-line version, for a list row.
 *
 * Takes the decimal string the API sends rather than the float, so the digits
 * printed are the digits the server sent. Nothing is compared or totalled
 * here, so there is no reason to parse it.
 */
export function ScorePill({ percent }: { percent: string | null }) {
  if (percent === null) {
    return (
      <Badge tone="neutral" title="This form scores nothing, or nothing scorable was answered.">
        Unscored
      </Badge>
    );
  }
  const value = Number(percent);
  const tone = Number.isNaN(value) ? "neutral" : value >= 70 ? "positive" : value >= 40 ? "warn" : "danger";
  return (
    <Badge tone={tone} className="tnum">
      {percent}%
    </Badge>
  );
}
