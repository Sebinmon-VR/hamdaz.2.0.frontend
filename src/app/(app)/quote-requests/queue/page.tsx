"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCheck } from "lucide-react";
import { withQuery } from "@/lib/api";
import { amount, num, relative, sumExact } from "@/lib/format";
import type { QuoteRequestSummaryOut } from "@/lib/types";
import { PageHead, Panel, Row, RowHead, StatBox } from "@/components/ui/primitives";
import { Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

/**
 * Approved quotes that nothing has created in Zoho yet.
 *
 * This is a worklist, not a process: the backend is explicit that nothing here
 * writes to Zoho Books, so the queue is a list of quotes somebody still has to
 * enter by hand. Saying that plainly is the point — a screen called "queue"
 * that looks automatic and is not would waste somebody a day.
 */
export default function ZohoQueuePage() {
  const [mineOnly, setMineOnly] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<QuoteRequestSummaryOut[]>(
    withQuery("/quote-requests/queue", { mine_only: mineOnly || undefined }),
  );

  const rows = data ?? [];
  // Mixed currencies cannot be added up honestly, so the total is only shown
  // when there is one currency to show it in. The addition itself is exact —
  // these are decimal strings, and summing them as floats would put the
  // headline figure a cent out for no reason anybody could later explain.
  const currencies = new Set(rows.map((q) => q.currency));
  const value = sumExact(rows.map((q) => q.total));

  return (
    <>
      <PageHead
        eyebrow={<Link href="/quote-requests">Quote requests</Link>}
        title="Ready for Zoho"
        count={data ? num(rows.length) : undefined}
        actions={
          <Toggle checked={mineOnly} onChange={setMineOnly} label="Only mine" />
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <StatBox label="Waiting" value={num(rows.length)} />
        <StatBox
          label="Value"
          value={
            currencies.size === 1
              ? amount(value, [...currencies][0])
              : currencies.size === 0
                ? "—"
                : "mixed"
          }
        />
        <StatBox
          label="Oldest"
          value={
            rows.length === 0
              ? "—"
              : relative(
                  rows.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at,
                )
          }
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <Empty
          icon={CheckCheck}
          title="Nothing waiting"
          body={
            mineOnly
              ? "None of your approved quotes are waiting to be created in Zoho."
              : "Every approved quote has been created in Zoho."
          }
        />
      ) : (
        <Panel className="overflow-hidden py-2">
          <RowHead>
            <span className="micro w-24 text-ink-4">Reference</span>
            <span className="micro flex-1 text-ink-4">Quote</span>
            <span className="micro w-32 text-ink-4">Approved</span>
            <span className="micro w-28 text-right text-ink-4">Total</span>
          </RowHead>

          {rows.map((quote) => (
            <Link key={quote.id} href={`/quote-requests/${quote.id}`} className="block">
              <Row className="cursor-pointer">
                <span className="tnum w-24 shrink-0 truncate text-[12px] text-ink-3">
                  {quote.reference ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {quote.title}
                  <span className="ml-2 text-[11.5px] font-normal text-ink-4">
                    {quote.customer_name}
                  </span>
                </span>
                <span className="w-32 shrink-0 text-[11.5px] text-ink-3">
                  {relative(quote.created_at)}
                </span>
                <span className="tnum w-28 shrink-0 text-right text-[12.5px] font-semibold">
                  {amount(quote.total, quote.currency)}
                </span>
              </Row>
            </Link>
          ))}
        </Panel>
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-4">
        Nothing here writes to Zoho Books. These are quotes cleared for someone to create
        there, and they stay on this list until that has happened.
      </p>
    </>
  );
}
