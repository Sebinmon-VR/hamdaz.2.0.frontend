"use client";

import clsx from "clsx";
import { useState } from "react";
import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { amount, decimalPercent, isZero, quantity, relative } from "@/lib/format";
import type { QuoteLineOut, QuoteRequestOut, QuoteRevisionOut } from "@/lib/types";
import { Avatar, Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { REVIEW_ACTION, REVISION_OUTCOME } from "@/components/quotes/QuoteRequestBits";

/**
 * Every round this quote has been through, and what was said about it.
 *
 * Revisions and reviews are one story told by two arrays, and splitting them
 * across tabs is what makes a negotiation unreadable: the note explaining why
 * a round was sent back belongs against that round's numbers, not two clicks
 * away from them. So they are merged by revision number and drawn as one rail.
 *
 * The comparison is the point of the screen during a negotiation — the
 * customer is arguing about a price agreed in an earlier round, and the only
 * useful view is that round beside this one. `Compare` puts them literally
 * side by side rather than asking anybody to hold two totals in their head.
 */
export function History({ quote }: { quote: QuoteRequestOut }) {
  const reviews = quote.reviews ?? [];
  const [comparing, setComparing] = useState<Round | null>(null);

  // Read once, defensively, here — see `readRound`.
  const rounds = (quote.revisions ?? []).map((revision) => readRound(revision, quote));

  // The round worth arguing against: the last one actually agreed.
  const lastApproved = [...rounds].reverse().find((r) => r.outcome === "approve") ?? null;
  const negotiating = quote.status === "in_negotiation";

  if (rounds.length === 0 && reviews.length === 0) {
    return (
      <Panel className="p-5">
        <PanelHead title="History" />
        <p className="mt-3 text-[13px] text-ink-3">
          Nothing has happened to this quote yet — it is on its first pass.
        </p>
      </Panel>
    );
  }

  // Reviews on the pass being worked on now have no finished revision to sit
  // under, so they close the list as the round in progress.
  const current = reviews.filter((r) => r.revision === quote.revision);

  return (
    <>
      {/* During a negotiation the earlier agreement is not history, it is the
          thing under discussion. It gets the top of the panel. */}
      {negotiating && lastApproved && (
        <Panel tone="highlight" className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">
                Under negotiation
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed">
                Pass {lastApproved.revision} was approved
                {lastApproved.total ? (
                  <>
                    {" at "}
                    <strong className="tnum">
                      {amount(lastApproved.total, lastApproved.currency)}
                    </strong>
                  </>
                ) : null}
                {lastApproved.supplier ? `, priced from ${lastApproved.supplier}` : ""}. This
                pass is what the customer came back asking for.
              </p>
            </div>
            <Button icon={ArrowLeftRight} onClick={() => setComparing(lastApproved)}>
              Put them side by side
            </Button>
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <PanelHead title="History" count={rounds.length} hint={`pass ${quote.revision} now`} />

        {/* Oldest first, as the API sends them: this is a story, and a
            negotiation only makes sense read forwards — what was asked, what
            was agreed, what the customer came back with. */}
        <ol className="mt-4 space-y-2.5">
          {rounds.map((round) => (
            // The pass number, not an id: RevisionOut has no id field, and
            // one quote cannot have two rounds numbered the same.
            <RoundRow
              key={round.revision}
              round={round}
              reviews={reviews.filter((r) => r.revision === round.revision)}
              onCompare={() => setComparing(round)}
            />
          ))}

          {current.length > 0 && (
            <li className="rounded-[16px] border border-dashed border-line p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">Pass {quote.revision}</Badge>
                <span className="text-[12px] text-ink-3">in progress</span>
              </div>
              <Reviews reviews={current} />
            </li>
          )}
        </ol>
      </Panel>

      {comparing && (
        <Compare round={comparing} quote={quote} onClose={() => setComparing(null)} />
      )}
    </>
  );
}

/* ── reading a revision ──────────────────────────────────────────────── */

/**
 * One finished round, flattened.
 *
 * `RevisionOut` carries only `revision`, `outcome`, `created_at` and a bare
 * `snapshot` object — the backend does not type what is inside it, so every
 * field below is optional on the wire and this is the single place that copes
 * with that. Reading `snapshot` inline at each use site is how a missing key
 * turns into `undefined.length` halfway down a render.
 *
 * Anything absent falls back to the quote's own value where that is honest
 * (the currency does not change between rounds) and to null where it is not
 * (a total from a different round is not this round's total).
 */
interface Round {
  revision: number;
  outcome: string;
  createdAt: string;
  items: QuoteLineOut[];
  total: string | null;
  currency: string;
  supplier: string | null;
  winProbability: string | null;
  note: string | null;
  discount: string | null;
}

interface Snapshot {
  items?: QuoteLineOut[];
  total?: string | null;
  sub_total?: string | null;
  currency?: string | null;
  discount?: string | null;
  win_probability?: string | null;
  selected_supplier_name?: string | null;
  selected_supplier_quote_id?: string | null;
  note?: string | null;
  notes?: string | null;
}

function readRound(revision: QuoteRevisionOut, quote: QuoteRequestOut): Round {
  const snap: Snapshot = (revision.snapshot ?? {}) as Snapshot;
  const supplierId = snap.selected_supplier_quote_id ?? null;

  return {
    revision: revision.revision,
    outcome: revision.outcome,
    createdAt: revision.created_at,
    items: Array.isArray(snap.items) ? snap.items : [],
    total: snap.total ?? null,
    currency: snap.currency ?? quote.currency,
    // The snapshot may carry only the id, so the name is looked up in the
    // comparison this quote already has rather than left as a bare uuid.
    supplier:
      snap.selected_supplier_name ??
      (supplierId
        ? (quote.comparison?.suppliers ?? []).find((s) => s.quote_id === supplierId)
            ?.supplier_name ?? null
        : null),
    winProbability: snap.win_probability ?? null,
    note: snap.note ?? snap.notes ?? null,
    discount: snap.discount ?? null,
  };
}

/* ── one finished round ──────────────────────────────────────────────── */

function RoundRow({
  round,
  reviews,
  onCompare,
}: {
  round: Round;
  reviews: QuoteRequestOut["reviews"];
  onCompare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const outcome = REVISION_OUTCOME[round.outcome] ?? {
    label: round.outcome,
    tone: "neutral" as const,
  };

  return (
    <li className="rounded-[16px] bg-panel-2 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Pass {round.revision}</Badge>
        <Badge tone={outcome.tone}>{outcome.label}</Badge>
        {round.total && (
          <span className="tnum text-[13px] font-semibold">
            {amount(round.total, round.currency)}
          </span>
        )}
        {round.supplier && (
          <span className="text-[11.5px] text-ink-4">from {round.supplier}</span>
        )}
        {round.winProbability !== null && (
          <span className="text-[11.5px] text-ink-4">
            {decimalPercent(round.winProbability, { places: 0 })} to win
          </span>
        )}
        <span className="ml-auto text-[11px] text-ink-4">{relative(round.createdAt)}</span>
      </div>

      {round.note && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{round.note}</p>
      )}

      <Reviews reviews={reviews} />

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {round.items.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3 transition hover:text-ink"
            aria-expanded={open}
          >
            <ChevronDown className={clsx("size-3 transition", open && "rotate-180")} />
            {round.items.length} line{round.items.length === 1 ? "" : "s"}
          </button>
        )}
        <button
          onClick={onCompare}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
        >
          <ArrowLeftRight className="size-3" />
          Compare with now
        </button>
      </div>

      {open && (
        <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
          {round.items.map((item, i) => (
            <li
              key={item.id ?? `${round.revision}-${i}`}
              className="flex items-baseline gap-3 text-[12px]"
            >
              <span className="min-w-0 flex-1 truncate text-ink-2">{item.name}</span>
              <span className="tnum shrink-0 text-ink-4">{quantity(item.quantity)}</span>
              <span className="tnum w-24 shrink-0 text-right">
                {amount(item.rate, round.currency)}
              </span>
              <span className="tnum w-28 shrink-0 text-right font-medium">
                {amount(item.line_total, round.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Reviews({ reviews }: { reviews: QuoteRequestOut["reviews"] }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-2 border-t border-line pt-2.5">
      {reviews.map((review) => {
        const spec = REVIEW_ACTION[review.action] ?? {
          label: review.action,
          tone: "neutral" as const,
        };
        return (
          <li key={review.id} className="flex gap-2.5">
            <Avatar
              name={review.reviewer_name ?? "?"}
              seed={review.id}
              className="size-6 shrink-0 rounded-lg text-[8px]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={spec.tone}>{spec.label}</Badge>
                <span className="text-[12px] font-medium">
                  {review.reviewer_name ?? "Somebody"}
                </span>
                <span className="text-[10.5px] text-ink-4">{relative(review.created_at)}</span>
              </div>
              {review.note && (
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{review.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── then against now ────────────────────────────────────────────────── */

/**
 * A finished round beside the current one.
 *
 * Lines are matched by item code, falling back to name, because that is the
 * only thing stable across a re-price: choosing a different supplier gives
 * every line a new id. Anything on one side only is marked added or dropped
 * rather than quietly omitted — a line that disappeared between rounds is
 * exactly what a customer is likely to be asking about.
 *
 * No difference is computed. Both numbers are the server's, printed side by
 * side, and the reader does the comparing.
 */
function Compare({
  round,
  quote,
  onClose,
}: {
  round: Round;
  quote: QuoteRequestOut;
  onClose: () => void;
}) {
  const rows = matchLines(round.items, quote.items);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <ArrowLeftRight className="size-4 text-ink-3" strokeWidth={1.8} />
        <span className="text-[15px] font-semibold">
          Pass {round.revision} against pass {quote.revision}
        </span>
        <Button size="sm" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </div>

      {round.items.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-[12.5px] text-ink-3">
          That round&rsquo;s snapshot did not include its lines, so there is nothing to put
          beside the current ones. Its total was{" "}
          {round.total ? amount(round.total, round.currency) : "not recorded"}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-y border-line bg-panel-2">
                <th className="micro px-5 py-2 text-left font-medium text-ink-4">Line</th>
                <th className="micro px-3 py-2 text-right font-medium text-ink-4" colSpan={2}>
                  Pass {round.revision} · {REVISION_OUTCOME[round.outcome]?.label ?? round.outcome}
                </th>
                <th className="micro px-5 py-2 text-right font-medium text-ink-4" colSpan={2}>
                  Now · pass {quote.revision}
                </th>
              </tr>
              <tr className="border-b border-line text-ink-4">
                <th />
                <th className="micro px-3 pb-1.5 text-right font-normal">Qty</th>
                <th className="micro px-3 pb-1.5 text-right font-normal">Total</th>
                <th className="micro px-3 pb-1.5 text-right font-normal">Qty</th>
                <th className="micro px-5 pb-1.5 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={clsx(
                    "border-b border-line/60",
                    !row.then && "bg-positive-soft/20",
                    !row.now && "bg-danger-soft/20",
                  )}
                >
                  <td className="px-5 py-2 text-[12.5px]">
                    {row.name}
                    {!row.then && <Badge tone="positive" className="ml-2">added</Badge>}
                    {!row.now && <Badge tone="danger" className="ml-2">dropped</Badge>}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-[12px] text-ink-3">
                    {row.then ? quantity(row.then.quantity) : "—"}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-[12px] text-ink-3">
                    {row.then ? amount(row.then.line_total, round.currency) : "—"}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-[12px]">
                    {row.now ? quantity(row.now.quantity) : "—"}
                  </td>
                  <td className="tnum px-5 py-2 text-right text-[12.5px] font-medium">
                    {row.now ? amount(row.now.line_total, quote.currency) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-panel-2">
                <td className="px-5 py-3 text-[12.5px] font-semibold">Total</td>
                <td />
                <td className="tnum px-3 py-3 text-right text-[13px] text-ink-2">
                  {round.total ? amount(round.total, round.currency) : "—"}
                </td>
                <td />
                <td className="tnum px-5 py-3 text-right text-[15px] font-bold">
                  {amount(quote.total, quote.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-4">
        {round.supplier
          ? `Pass ${round.revision} was priced from ${round.supplier}.`
          : `Pass ${round.revision} has no supplier recorded against it.`}
        {round.discount && !isZero(round.discount)
          ? ` It carried a ${round.discount}% discount.`
          : ""}
      </p>
    </Panel>
  );
}

interface CompareRow {
  key: string;
  name: string;
  then: QuoteLineOut | null;
  now: QuoteLineOut | null;
}

function matchLines(then: QuoteLineOut[], now: QuoteLineOut[]): CompareRow[] {
  const keyOf = (line: QuoteLineOut) =>
    (line.item_code || line.name || "").trim().toLowerCase();
  const rows = new Map<string, CompareRow>();

  then.forEach((line, i) => {
    const k = keyOf(line) || `then-${i}`;
    rows.set(k, { key: k, name: line.name, then: line, now: null });
  });
  now.forEach((line, i) => {
    const k = keyOf(line) || `now-${i}`;
    const existing = rows.get(k);
    if (existing) existing.now = line;
    else rows.set(k, { key: k, name: line.name, then: null, now: line });
  });

  return [...rows.values()];
}
