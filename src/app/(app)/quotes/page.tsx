"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, Paperclip, ReceiptText, RefreshCw } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, money, num } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { QuoteListOut } from "@/lib/types";
import { Panel, PageHead, Stat } from "@/components/ui/primitives";
import { Button, PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Quotes from Zoho Books.
 *
 * Read-only, deliberately and permanently: Zoho is where quotes are written,
 * and the refresh token this app holds is scoped to reads. Every row therefore
 * ends in a way out to Zoho rather than an edit affordance.
 */
export default function QuotesPage() {
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 350);

  const key = withQuery("/quotes", {
    status: status === "all" ? undefined : status,
    search: debounced || undefined,
    limit: 200,
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR<QuoteListOut>(key, {
    revalidateOnFocus: false,
  });

  const quotes = data?.quotes ?? [];

  const totals = useMemo(() => {
    const currency = quotes.find((q) => q.currency_code)?.currency_code ?? null;
    // Only meaningful when everything on screen is in one currency; mixing
    // them into a single figure would be worse than showing nothing.
    const mixed = new Set(quotes.map((q) => q.currency_code).filter(Boolean)).size > 1;
    return {
      currency,
      mixed,
      value: quotes.reduce((sum, q) => sum + (q.total || 0), 0),
    };
  }, [quotes]);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Quotes"
        title="Zoho quotes"
        lead="Read live from Zoho Books, and read-only: Zoho stays the place quotes are written."
        actions={
          <Button
            icon={RefreshCw}
            loading={isValidating}
            onClick={() =>
              mutate(
                () =>
                  api.get<QuoteListOut>("/quotes", {
                    status: status === "all" ? undefined : status,
                    search: debounced || undefined,
                    limit: 200,
                    // The list is cached for everyone; this is what re-reads it.
                    refresh: true,
                  }),
                { revalidate: false },
              )
            }
          >
            Re-read Zoho
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Quote number, customer, reference"
          className="w-full max-w-sm"
        />
        <PillRail
          value={status}
          onChange={setStatus}
          options={STATUSES.map((value) => ({
            value,
            label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1),
          }))}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={8} />
      ) : quotes.length === 0 ? (
        <Empty
          icon={ReceiptText}
          title={search || status !== "all" ? "No quotes match" : "No quotes"}
          body={
            search || status !== "all"
              ? "Try a different status, or search by quote number."
              : "Zoho Books returned nothing. If that is unexpected, check the integration is configured for the right organisation."
          }
        />
      ) : (
        <>
          <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
            <Stat value={num(data!.total)} label="quotes" />
            <Stat
              value={
                totals.mixed ? "—" : money(totals.value, totals.currency, { compact: true })
              }
              label={totals.mixed ? "mixed currencies" : "total value on screen"}
            />
            <Stat
              value={num(quotes.filter((q) => q.has_attachment).length)}
              label="with attachments"
            />
          </Panel>

          {data!.truncated && (
            <InlineNotice tone="info">
              Only the first {quotes.length} quotes are shown. Narrow the search or pick a
              status to see the rest.
            </InlineNotice>
          )}

          <ul className="space-y-2">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Link href={`/quotes/${quote.id}`}>
                  <Panel className="p-3 transition hover:border-accent-line">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="tnum w-28 shrink-0 text-[14px] font-semibold">
                        {quote.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">
                          {quote.customer_name ?? quote.company_name ?? "No customer"}
                        </p>
                        <p className="truncate text-[12px] text-ink-4">
                          {[quote.reference_number, quote.salesperson_name, quote.bcd]
                            .filter(Boolean)
                            .join(" · ") || "No reference"}
                        </p>
                      </div>
                      {quote.has_attachment && (
                        <Paperclip className="size-4 shrink-0 text-ink-4" />
                      )}
                      <QuoteStatusBadge
                        status={quote.status}
                        subStatus={quote.sub_status}
                      />
                      <span className="tnum w-24 shrink-0 text-right text-[12.5px] text-ink-3">
                        {date(quote.date)}
                      </span>
                      <span className="tnum w-32 shrink-0 text-right text-[14px] font-semibold">
                        {money(quote.total, quote.currency_code)}
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 text-ink-4" />
                    </div>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
