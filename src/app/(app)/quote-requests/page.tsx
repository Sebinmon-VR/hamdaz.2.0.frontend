"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FileText, Plus } from "lucide-react";
import { withQuery } from "@/lib/api";
import { amount, decimalPercent, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { QuoteRequestSummaryOut, QuoteStatus } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  Row,
  RowHead,
  StatBox,
} from "@/components/ui/primitives";
import { LinkButton, PillRail, SearchInput, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { QuoteStatusBadge } from "@/components/quotes/QuoteRequestBits";

/**
 * Customer quotes we are putting together, and where each one has got to.
 *
 * Distinct from **Quotes**, which is read-only from Zoho Books: this is the
 * work *before* a quote exists there. One is a record, the other is a
 * negotiation, and conflating them is why the two screens are named apart.
 *
 * The default view is everything still moving. A quote already in Zoho is
 * finished business and belongs on the Zoho screen, so it is not what you want
 * to see first — but it is one click away rather than gone.
 */
export default function QuoteRequestsPage() {
  const session = useSession();
  const [status, setStatus] = useState<QuoteStatus | "open" | "all">("open");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");

  // `status` takes one value, so "everything still moving" is filtered here
  // rather than asked for — the alternative is five requests and a merge.
  // `/mine` is its own endpoint rather than a filter, because "mine" means
  // raised by me OR waiting on me — which the list endpoint cannot express.
  const { data, error, isLoading, mutate } = useSWR<QuoteRequestSummaryOut[]>(
    mine
      ? withQuery("/quote-requests/mine", { limit: 200 })
      : withQuery("/quote-requests", {
          status: status === "open" || status === "all" ? undefined : status,
          limit: 200,
        }),
  );

  const all = data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = all
    .filter((q) =>
      status === "open"
        ? q.status !== "created_in_zoho" && q.status !== "rejected"
        : true,
    )
    .filter(
      (q) =>
        !needle ||
        q.title.toLowerCase().includes(needle) ||
        q.customer_name.toLowerCase().includes(needle) ||
        (q.reference ?? "").toLowerCase().includes(needle),
    );

  const count = (s: QuoteStatus) => all.filter((q) => q.status === s).length;
  const waiting = count("pending_approval");
  const back = count("changes_requested");

  return (
    <>
      <PageHead
        title="Quote requests"
        count={data ? `${num(rows.length)}` : undefined}
        actions={
          <>
            <Toggle checked={mine} onChange={setMine} label="Mine" />
            <LinkButton href="/quote-requests/new" variant="accent" icon={Plus}>
              New quote
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Being written" value={num(count("draft"))} />
        <StatBox
          label="Waiting on approval"
          value={num(waiting)}
          tone={waiting > 0 ? "second" : undefined}
        />
        <StatBox label="Sent back" value={num(back)} tone={back > 0 ? "second" : undefined} />
        <StatBox label="Approved" value={num(count("approved"))} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Title, customer or reference"
          className="w-full max-w-xs"
        />
        <PillRail
          value={status}
          onChange={(next) => setStatus(next as QuoteStatus | "open" | "all")}
          options={[
            { value: "open", label: "Still moving" },
            { value: "draft", label: "Draft", count: count("draft") },
            { value: "pending_approval", label: "Waiting", count: waiting },
            { value: "changes_requested", label: "Sent back", count: back },
            { value: "approved", label: "Approved", count: count("approved") },
            { value: "all", label: "Everything", count: all.length },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Empty
          icon={FileText}
          title={needle ? "Nothing matches" : "No quotes here yet"}
          body={
            needle
              ? "Try part of a title, a customer or a reference."
              : "A quote request is how a customer quote gets written, priced against supplier offers, and approved before it reaches Zoho."
          }
          action={
            !needle && (
              <LinkButton href="/quote-requests/new" variant="accent" icon={Plus}>
                New quote
              </LinkButton>
            )
          }
        />
      ) : (
        <Panel className="overflow-hidden py-2">
          <RowHead>
            <span className="micro w-24 text-ink-4">Reference</span>
            <span className="micro flex-1 text-ink-4">Quote</span>
            <span className="micro w-40 text-ink-4">Status</span>
            <span className="micro w-20 text-right text-ink-4">Win</span>
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
                  {/* A revision above one means it has been round the loop. */}
                  {quote.revision > 1 && (
                    <span className="ml-2 text-[11px] text-ink-4">rev {quote.revision}</span>
                  )}
                </span>

                <span className="flex w-40 shrink-0 items-center gap-1.5">
                  <QuoteStatusBadge status={quote.status} />
                  {quote.open_comments > 0 && (
                    <Badge tone="warn">{quote.open_comments} open</Badge>
                  )}
                </span>

                <span className="tnum w-20 shrink-0 text-right text-[12px] text-ink-2">
                  {decimalPercent(quote.win_probability, { places: 0 })}
                </span>

                <span className="tnum w-28 shrink-0 text-right text-[12.5px] font-semibold">
                  {amount(quote.total, quote.currency)}
                </span>
              </Row>
            </Link>
          ))}
        </Panel>
      )}

      {session.roles.is_admin && (
        <p className="text-[11.5px] text-ink-4">
          Approved quotes wait in{" "}
          <Link href="/quote-requests/queue" className="underline underline-offset-2">
            the Zoho queue
          </Link>{" "}
          until somebody creates them there. Nothing here writes to Zoho.
        </p>
      )}
    </>
  );
}
