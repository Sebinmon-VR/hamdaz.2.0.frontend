"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowUpRight,
  ExternalLink,
  Paperclip,
  Plus,
  ReceiptText,
  RefreshCw,
  Scale,
  SlidersHorizontal,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, daysAway, money, num } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { QuoteDetailOut, QuoteListOut, QuoteOut } from "@/lib/types";
import {
  Avatar,
  AvatarStack,
  Badge,
  Figure,
  HeroPanel,
  Panel,
  PageHead,
  SolidBadge,
} from "@/components/ui/primitives";
import {
  Button,
  CircleGroup,
  LinkButton,
  PillRail,
  SearchInput,
} from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { DateRange, EMPTY_RANGE, type Range } from "@/components/quotes/DateRange";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Quotes, read from Zoho Books.
 *
 * Read-only, deliberately and permanently: Zoho is where quotes are written,
 * and the refresh token this app holds is scoped to reads. So the screen ends
 * every path in a way out to Zoho rather than in an edit affordance.
 *
 * The layout is the app's signature: a hero panel of pipeline figures, then
 * the slab — the inverted sheet holding the list, with the selected quote
 * opened in the well nested back inside it.
 */
export default function QuotesPage() {
  const session = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(EMPTY_RANGE);
  const debounced = useDebounced(search, 350);

  // Both ends are inclusive YYYY-MM-DD on the backend, which is what the range
  // control produces — a quote's date is a calendar day, not an instant, so
  // nothing here converts a timezone.
  const query = {
    status: status === "all" ? undefined : status,
    search: debounced || undefined,
    date_start: range.start ?? undefined,
    date_end: range.end ?? undefined,
    limit: 200,
  };
  const key = withQuery("/quotes", query);
  const { data, error, isLoading, isValidating, mutate } = useSWR<QuoteListOut>(key);

  // A quote number typed in full is almost always someone arriving with it
  // from an email, so look it up directly rather than making them find it in a
  // list that may not even contain it under the current filter.
  const looksLikeNumber = /^[A-Za-z]{2,4}[-/]?\d{2,}$/.test(debounced.trim());
  const byNumber = useSWR<QuoteDetailOut>(
    looksLikeNumber ? `/quotes/by-number/${encodeURIComponent(debounced.trim())}` : null,
    { shouldRetryOnError: false },
  );

  const quotes = data?.quotes ?? [];
  const selected = quotes.find((q) => q.id === picked) ?? quotes[0];

  const figures = useMemo(() => summarise(quotes), [quotes]);
  const filtered = Boolean(search || status !== "all" || range.start || range.end);

  function refresh() {
    // The list is cached for everyone; `refresh` is what re-reads Zoho rather
    // than handing back the same cached answer.
    mutate(() => api.get<QuoteListOut>("/quotes", { ...query, refresh: true }), {
      revalidate: false,
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Zoho Books · read-only"
        title="Quotes"
        count={data ? `${num(data.total)} live` : undefined}
        actions={
          <>
            <CircleGroup
              actions={[
                { icon: RefreshCw, label: "Re-read Zoho", onClick: refresh, busy: isValidating },
                { icon: SlidersHorizontal, label: "Columns" },
              ]}
            />
            {session.can("quote_comparison", "new") && (
              <LinkButton href="/comparisons/new" variant="accent" size="lg" icon={Plus}>
                New comparison
              </LinkButton>
            )}
          </>
        }
      />

      {/* ── the pipeline ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.58fr_1fr]">
        <HeroPanel className="p-7">
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            <Figure
              label="Expiring within 7 days"
              prefix="AED"
              value={money(figures.expiring, null, { compact: false }).replace(/\.00$/, "")}
              tone={figures.expiringCount > 0 ? "second" : undefined}
              sub={figures.expiringCount > 0 ? `${figures.expiringCount} quotes` : "none"}
            />
            <Figure
              label="Out with clients"
              prefix="AED"
              value={money(figures.open, null).replace(/\.00$/, "")}
              sub={`${figures.openCount} quotes`}
            />
            <Figure
              label="Accepted on screen"
              prefix="AED"
              value={money(figures.accepted, null).replace(/\.00$/, "")}
              sub={`${figures.acceptedCount} quotes`}
            />
          </div>

          {/* Value by month, with the salespeople who own it clustered under
              each bar — the same pairing the reference uses. */}
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {figures.months.map((month) => (
              <div key={month.name} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-ink-3">{month.name}</span>
                  <span className="fig text-[13px] text-ink-2">
                    {month.total ? money(month.total, null, { compact: true }) : "—"}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-panel-3">
                  <div
                    className="grow-in h-full rounded-full"
                    style={{
                      width: `${month.share}%`,
                      background: month.late ? "var(--second)" : "var(--accent)",
                    }}
                  />
                </div>
                <AvatarStack
                  people={month.people.map((name) => ({ name }))}
                  size="sm"
                  max={4}
                />
              </div>
            ))}
          </div>
        </HeroPanel>

        <Panel className="relative p-7">
          <Link
            href="/comparisons"
            aria-label="Open comparisons"
            className="absolute right-6 top-6 grid size-8 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            <ArrowUpRight className="size-3.5" strokeWidth={2} />
          </Link>

          <Figure
            label="Total value on screen"
            prefix="AED"
            value={money(figures.total, null, { compact: true })}
            sub={figures.mixed ? "mixed currencies" : undefined}
          />

          <div className="mt-7 grid grid-cols-3 gap-2.5">
            {figures.split.map((entry, i) => (
              <div
                key={entry.label}
                className={clsx(
                  "flex h-28 flex-col justify-between rounded-[20px] p-4",
                  i === 0 ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-2",
                )}
              >
                <span className="fig text-[19px]">{num(entry.count)}</span>
                <span className="text-[11.5px] leading-tight opacity-75">{entry.label}</span>
              </div>
            ))}
          </div>

          <a
            href={selected?.web_url ?? "https://books.zoho.com"}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex h-10 items-center justify-center gap-2 rounded-full bg-solid text-[13px] font-semibold text-on-solid transition hover:opacity-90"
          >
            <ExternalLink className="size-3.5" />
            Open in Zoho Books
          </a>
        </Panel>
      </div>

      {/* ── filters ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] text-ink-3">Filters</span>
        <PillRail
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPicked(null);
          }}
          options={STATUSES.map((value) => ({
            value,
            label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1),
          }))}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Number, customer, reference"
          className="w-full max-w-xs"
        />
        <DateRange
          value={range}
          onChange={(next) => {
            setRange(next);
            setPicked(null);
          }}
        />
      </div>

      {/* ── the slab ──────────────────────────────────────────────── */}
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={7} />
      ) : quotes.length === 0 ? (
        <Empty
          icon={ReceiptText}
          title={filtered ? "No quotes match" : "No quotes"}
          body={
            filtered
              ? "Try a different status, a wider date range, or search by quote number."
              : "Zoho Books returned nothing. If that is unexpected, check the integration points at the right organisation."
          }
          action={
            filtered && (
              <Button
                onClick={() => {
                  setStatus("all");
                  setSearch("");
                  setRange(EMPTY_RANGE);
                }}
              >
                Clear every filter
              </Button>
            )
          }
        />
      ) : (
        <>
          {byNumber.data && (
            <InlineNotice tone="positive">
              <button
                onClick={() => router.push(`/quotes/${byNumber.data!.id}`)}
                className="text-left font-semibold underline underline-offset-2"
              >
                {byNumber.data.number}
              </button>{" "}
              — {byNumber.data.customer_name ?? "no customer"},{" "}
              {money(byNumber.data.total, byNumber.data.currency_code)}. Open it directly.
            </InlineNotice>
          )}

          {data!.truncated && (
            <InlineNotice tone="info">
              Only the first {quotes.length} quotes are shown. Narrow the search or pick a
              status to reach the rest.
            </InlineNotice>
          )}

          <Panel tone="slab" className="grid gap-5 p-5 lg:grid-cols-[1fr_1.4fr]">
            {/* the list */}
            <div className="min-w-0">
              <div className="flex items-center gap-3 px-2 pb-3.5">
                <span className="text-[16px] font-semibold">Quotes</span>
                {figures.expiringCount > 0 && (
                  <SolidBadge tone="second">{figures.expiringCount} expiring</SolidBadge>
                )}
                <span className="tnum ml-auto text-[12px] text-slab-ink-3">
                  {quotes.length}
                </span>
              </div>

              <div className="max-h-[520px] space-y-1 overflow-y-auto">
                {quotes.map((quote) => (
                  <QuoteRow
                    key={quote.id}
                    quote={quote}
                    selected={selected?.id === quote.id}
                    onSelect={() => setPicked(quote.id)}
                  />
                ))}
              </div>
            </div>

            {/* the well */}
            {selected && (
              <div className="flex min-w-0 flex-col rounded-[16px] bg-well p-6 text-well-ink">
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-well-ink-3">Quote</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                      <span className="fig text-[24px]">{selected.number}</span>
                      <ExpiryChip quote={selected} />
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/quotes/${selected.id}`)}
                    className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-well-tile text-well-ink-2 transition hover:text-well-ink"
                    aria-label="Open the full quote"
                  >
                    <ArrowUpRight className="size-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-well-ink-3">Customer</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-[10px] font-extrabold text-accent-ink">
                        {(selected.customer_name ?? "??").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate text-[14.5px] font-semibold">
                        {selected.customer_name ?? selected.company_name ?? "No customer"}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-well-ink-3">Salesperson</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <Avatar
                        name={selected.salesperson_name ?? "?"}
                        seed={selected.salesperson_name ?? selected.id}
                        size="sm"
                        className="size-7"
                      />
                      <span className="truncate text-[13px] font-medium">
                        {selected.salesperson_name ?? "Unassigned"}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-well-ink-3">Reference</p>
                    <p className="mt-2 truncate text-[13px]">
                      {selected.reference_number ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <WellTile label="Quote date" value={date(selected.date)} />
                  <WellTile label="Expires" value={date(selected.expiry_date)} />
                  <WellTile label="Status" value={selected.status ?? "—"} />
                  <WellTile
                    label="Attachment"
                    value={selected.has_attachment ? "Yes" : "None"}
                    icon={selected.has_attachment ? Paperclip : undefined}
                  />
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-5 rounded-full bg-well-tile py-3.5 pl-6 pr-3.5">
                  <div>
                    <p className="text-[10.5px] text-well-ink-3">Total</p>
                    <p className="fig mt-1 text-[19px]">
                      {money(selected.total, selected.currency_code)}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    {selected.web_url && (
                      <a
                        href={selected.web_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Zoho"
                        className="grid size-10 place-items-center rounded-full border border-well-line text-well-ink-2 transition hover:text-well-ink"
                      >
                        <ExternalLink className="size-4" strokeWidth={2} />
                      </a>
                    )}
                    {session.can("quote_comparison", "new") && (
                      <LinkButton href="/comparisons/new" variant="accent" icon={Scale}>
                        Compare suppliers
                      </LinkButton>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function QuoteRow({
  quote,
  selected,
  onSelect,
}: {
  quote: QuoteOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const days = daysAway(quote.expiry_date);
  const soon = days !== null && days >= 0 && days <= 7;

  return (
    <button
      onClick={onSelect}
      className={clsx(
        "flex h-[58px] w-full items-center gap-3.5 rounded-full px-4 text-left transition",
        selected
          ? "bg-slab-row ring-[1.5px] ring-[var(--accent)]"
          : "hover:bg-slab-row",
      )}
    >
      <Avatar
        name={quote.customer_name ?? quote.number}
        seed={quote.customer_id ?? quote.id}
        size="sm"
        className="size-9"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-semibold">{quote.number}</span>
        <span
          className={clsx(
            "truncate text-[11.5px]",
            soon ? "font-medium text-second-text" : "text-slab-ink-3",
          )}
        >
          {days === null
            ? (quote.customer_name ?? "No customer")
            : days < 0
              ? `expired ${Math.abs(days)}d ago`
              : `expires in ${days} days`}
        </span>
      </span>
      <span className="ml-auto shrink-0 text-[12px] text-slab-ink-3">{quote.status}</span>
      <span className="fig w-28 shrink-0 text-right text-[16px] font-normal">
        {money(quote.total, null).replace(/\.00$/, "")}
      </span>
    </button>
  );
}

function ExpiryChip({ quote }: { quote: QuoteOut }) {
  const days = daysAway(quote.expiry_date);
  if (days === null) return <Badge tone="neutral">No expiry</Badge>;
  if (days < 0) return <SolidBadge tone="second">Expired</SolidBadge>;
  if (days <= 7) return <SolidBadge tone="second">{days} days left</SolidBadge>;
  return <Badge tone="neutral">{days} days left</Badge>;
}

function WellTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Paperclip;
}) {
  return (
    <div className="flex h-[86px] flex-col justify-between rounded-[14px] bg-well-tile p-3.5">
      <span className="flex items-center gap-1.5 text-[15px] font-medium">
        {Icon && <Icon className="size-3.5 text-well-ink-3" />}
        {value}
      </span>
      <span className="text-[11px] leading-tight text-well-ink-3">{label}</span>
    </div>
  );
}

/* ── the figures behind the hero ─────────────────────────────────────── */

const OPEN_STATUSES = new Set(["sent", "viewed", "draft"]);

function summarise(quotes: QuoteOut[]) {
  let expiring = 0;
  let expiringCount = 0;
  let open = 0;
  let openCount = 0;
  let accepted = 0;
  let acceptedCount = 0;
  let total = 0;
  const byStatus = new Map<string, number>();
  const byMonth = new Map<string, { total: number; people: Set<string>; late: boolean }>();

  for (const quote of quotes) {
    const value = quote.total || 0;
    total += value;

    const status = (quote.status ?? "unknown").toLowerCase();
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);

    if (status === "accepted") {
      accepted += value;
      acceptedCount += 1;
    } else if (OPEN_STATUSES.has(status)) {
      open += value;
      openCount += 1;
    }

    const days = daysAway(quote.expiry_date);
    if (days !== null && days >= 0 && days <= 7 && status !== "accepted") {
      expiring += value;
      expiringCount += 1;
    }

    if (quote.date) {
      const when = new Date(quote.date);
      if (!Number.isNaN(when.getTime())) {
        const name = when.toLocaleString("en-GB", { month: "long" });
        const entry = byMonth.get(name) ?? { total: 0, people: new Set<string>(), late: false };
        entry.total += value;
        if (quote.salesperson_name) entry.people.add(quote.salesperson_name);
        if (days !== null && days < 0) entry.late = true;
        byMonth.set(name, entry);
      }
    }
  }

  // The four most recent months with anything in them, oldest first, so the
  // bars read left to right as time.
  const months = [...byMonth.entries()].slice(-4);
  const biggest = Math.max(1, ...months.map(([, m]) => m.total));

  return {
    expiring,
    expiringCount,
    open,
    openCount,
    accepted,
    acceptedCount,
    total,
    mixed: new Set(quotes.map((q) => q.currency_code).filter(Boolean)).size > 1,
    months: months.map(([name, m]) => ({
      name,
      total: m.total,
      share: Math.round((m.total / biggest) * 100),
      late: m.late,
      people: [...m.people].slice(0, 5),
    })),
    split: [
      { label: "Out with clients", count: openCount },
      { label: "Accepted", count: acceptedCount },
      { label: "Expiring soon", count: expiringCount },
    ],
  };
}
