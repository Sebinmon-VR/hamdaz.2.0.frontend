"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Download, ExternalLink, FileText, Package, Paperclip, Receipt, ShoppingCart } from "lucide-react";
import { files, withQuery } from "@/lib/api";
import { bytes, date, humanise, money, num } from "@/lib/format";
import type { QuoteDetailOut, RelatedOut } from "@/lib/types";
import { Badge, Panel, Meta, PageHead, PanelHead, Stat } from "@/components/ui/primitives";
import { PillRail } from "@/components/ui/controls";
import { PanelSkeleton, Empty, ErrorState, InlineNotice } from "@/components/ui/feedback";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";

type Tab = "items" | "documents" | "related";

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("items");

  const quote = useSWR<QuoteDetailOut>(`/quotes/${id}`);
  // The related branches are separate calls in Zoho, so the backend fetches
  // each independently and reports per-branch failure rather than failing the
  // whole page. Only asked for once the tab is opened.
  const related = useSWR<RelatedOut>(
    tab === "related"
      ? withQuery(`/quotes/${id}/related`, { include: "customer,salesorders,invoices,comments" })
      : null,
  );

  if (quote.error) return <ErrorState error={quote.error} onRetry={() => quote.mutate()} />;
  if (!quote.data) return <PanelSkeleton lines={8} />;

  const q = quote.data;
  const currency = q.currency_code;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/quotes">Quotes</Link>}
        title={q.number}
        lead={q.customer_name ?? q.company_name ?? undefined}
        actions={
          <>
            <QuoteStatusBadge status={q.status} subStatus={q.sub_status} />
            {(q.web_url ?? q.estimate_url) && (
              <a
                href={(q.web_url ?? q.estimate_url)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[13.5px] font-medium text-accent-ink"
              >
                <ExternalLink className="size-4" />
                Open in Zoho
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
              <Stat value={money(q.total, currency)} label="quote total" />
              {q.invoiced_amount > 0 && (
                <Stat
                  value={money(q.invoiced_amount, currency, { compact: true })}
                  label="invoiced"
                  tone="positive"
                />
              )}
              {q.uninvoiced_amount > 0 && (
                <Stat
                  value={money(q.uninvoiced_amount, currency, { compact: true })}
                  label="not yet invoiced"
                  tone="warn"
                />
              )}
              <Stat value={num(q.line_items.length)} label="line items" />
            </div>
          </Panel>

          <Panel className="p-4">
            <PillRail
              value={tab}
              onChange={setTab}
              options={[
                { value: "items", label: "Line items", count: q.line_items.length, icon: Package },
                {
                  value: "documents",
                  label: "Attachments",
                  count: q.documents.length,
                  icon: Paperclip,
                },
                { value: "related", label: "Orders and invoices", icon: ShoppingCart },
              ]}
              className="mb-5"
            />

            {tab === "items" && <LineItems quote={q} />}

            {tab === "documents" && (
              <>
                {q.documents.length === 0 ? (
                  <Empty
                    icon={Paperclip}
                    title="No attachments"
                    body="Nothing has been attached to this quote in Zoho."
                  />
                ) : (
                  <ul className="space-y-2">
                    {q.documents.map((doc) => (
                      <li
                        key={doc.id ?? doc.file_name}
                        className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-3 py-2"
                      >
                        <FileText className="size-4 shrink-0 text-ink-3" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">
                            {doc.file_name ?? "Untitled"}
                          </p>
                          <p className="truncate text-[11.5px] text-ink-4">
                            {[
                              doc.file_type?.toUpperCase(),
                              doc.file_size_formatted ?? bytes(doc.file_size),
                              doc.uploaded_by,
                              doc.uploaded_on ? date(doc.uploaded_on) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {doc.id && (
                          // Streamed by the API with the session cookie — a
                          // plain navigation, not a fetch, so the browser
                          // handles the download itself. The path comes from
                          // the response where Zoho gave one, so this does not
                          // become a second place the URL is decided.
                          <a
                            href={
                              doc.download_url
                                ? files.fromApiPath(doc.download_url)
                                : files.quoteDocument(q.id, doc.id)
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[12.5px] font-medium transition hover:border-accent"
                          >
                            <Download className="size-3.5" />
                            Download
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === "related" && <Related quote={q} related={related.data} loading={!related.data} />}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHead title="Details" />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Meta label="Quote date">{date(q.date)}</Meta>
              <Meta label="Expires">{date(q.expiry_date)}</Meta>
              <Meta label="Reference">{q.reference_number ?? "—"}</Meta>
              <Meta label="Salesperson">{q.salesperson_name ?? "—"}</Meta>
              <Meta label="BCD">{q.bcd ?? "—"}</Meta>
              <Meta label="Portal">{q.portal ?? "—"}</Meta>
              <Meta label="Created">{date(q.created_time)}</Meta>
              <Meta label="Last changed">{date(q.last_modified_time)}</Meta>
            </dl>
          </Panel>

          <Panel className="p-4">
            <PanelHead title="Money" />
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row label="Sub total" value={money(q.sub_total, currency)} />
              {q.discount_total > 0 && (
                <Row label="Discount" value={`− ${money(q.discount_total, currency)}`} />
              )}
              {q.shipping_charge > 0 && (
                <Row label="Shipping" value={money(q.shipping_charge, currency)} />
              )}
              {q.tax_total > 0 && <Row label="Tax" value={money(q.tax_total, currency)} />}
              {q.adjustment !== 0 && (
                <Row label="Adjustment" value={money(q.adjustment, currency)} />
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-2.5 text-[15px] font-semibold">
                <span>Total</span>
                <span className="tnum">{money(q.total, currency)}</span>
              </div>
            </dl>
          </Panel>

          {(q.billing_address || q.shipping_address) && (
            <Panel className="p-6">
              <PanelHead title="Addresses" />
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Address label="Billing" value={q.billing_address} />
                <Address label="Shipping" value={q.shipping_address} />
              </div>
            </Panel>
          )}

          {Object.keys(q.custom_fields ?? {}).length > 0 && (
            <Panel className="p-6">
              <PanelHead
                title="Custom fields"
                count={Object.keys(q.custom_fields).length}
                hint="Set on the quote in Zoho"
              />
              <dl className="mt-4 space-y-2.5">
                {Object.entries(q.custom_fields).map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-4">
                    <dt className="min-w-0 truncate text-[12.5px] text-ink-3">
                      {humanise(key)}
                    </dt>
                    <dd className="shrink-0 text-right text-[12.5px] text-ink">
                      {formatCustom(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}

          {(q.notes || q.terms) && (
            <Panel className="p-4">
              <PanelHead title="Notes and terms" />
              {q.notes && (
                <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                  {q.notes}
                </p>
              )}
              {q.terms && (
                <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-3">
                  {q.terms}
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

function LineItems({ quote }: { quote: QuoteDetailOut }) {
  if (quote.line_items.length === 0) {
    return <Empty icon={Package} title="No line items" body="This quote has no priced lines." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-1">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-4">
            <th className="pb-1 font-medium">Item</th>
            <th className="pb-1 text-right font-medium">Qty</th>
            <th className="pb-1 text-right font-medium">Rate</th>
            <th className="pb-1 text-right font-medium">Discount</th>
            <th className="pb-1 pr-3.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.line_items.map((item, i) => (
            <tr key={item.item_id ?? i} className="text-[13px]">
              <td className="rounded-l-2xl bg-inset py-3 pl-3.5">
                <p className="font-medium">{item.name ?? "Unnamed"}</p>
                {item.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-4">
                    {item.description}
                  </p>
                )}
                {item.code && (
                  <p className="mt-0.5 font-mono text-[11px] text-ink-4">{item.code}</p>
                )}
              </td>
              <td className="tnum bg-inset py-3 text-right">
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </td>
              <td className="tnum bg-inset py-3 text-right">
                {money(item.rate, quote.currency_code)}
              </td>
              <td className="tnum bg-inset py-3 text-right text-ink-3">
                {item.discount ? `${item.discount}%` : "—"}
                {item.tax_name && (
                  <span className="block text-[10.5px] text-ink-4">{item.tax_name}</span>
                )}
              </td>
              <td className="tnum rounded-r-2xl bg-inset py-3 pr-3.5 text-right font-semibold">
                {money(item.total, quote.currency_code)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Orders, invoices and comments hanging off the quote.
 *
 * Each is a separate branch on the backend and each can fail on its own —
 * Zoho rate-limits per endpoint — so a failed branch says so in place rather
 * than taking the tab down with it.
 */
function Related({
  quote,
  related,
  loading,
}: {
  quote: QuoteDetailOut;
  related?: RelatedOut;
  loading: boolean;
}) {
  if (loading) return <PanelSkeleton lines={4} />;

  const branches = [
    { key: "salesorders", label: "Sales orders", branch: related?.salesorders },
    { key: "invoices", label: "Invoices", branch: related?.invoices },
    { key: "comments", label: "Comments", branch: related?.comments },
  ];

  return (
    <div className="space-y-5">
      {quote.salesorders.length > 0 && (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
            On this quote
          </p>
          <ul className="space-y-2">
            {quote.salesorders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-3 py-2"
              >
                <ShoppingCart className="size-4 shrink-0 text-ink-3" />
                <span className="tnum text-[13.5px] font-medium">
                  {order.number ?? order.id}
                </span>
                {order.status && <Badge>{order.status}</Badge>}
                <span className="ml-auto text-[12.5px] text-ink-3">{date(order.date)}</span>
                <span className="tnum text-[13.5px] font-semibold">
                  {money(order.total, quote.currency_code)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {quote.invoice_ids.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-inset px-3 py-2 text-[13px]">
          <Receipt className="size-4 shrink-0 text-ink-3" />
          {quote.invoice_ids.length} invoice
          {quote.invoice_ids.length === 1 ? "" : "s"} raised against this quote.
        </div>
      )}

      {related && related.included.length > 0 && (
        <p className="text-[11.5px] text-ink-4">
          Read from Zoho: {related.included.join(", ")}.
        </p>
      )}

      {branches
        .filter(({ branch }) => branch && !branch.ok)
        .map(({ key, label, branch }) => (
          <InlineNotice key={key} tone="warn">
            {label} could not be read from Zoho: {branch!.error}
          </InlineNotice>
        ))}

      {quote.salesorders.length === 0 && quote.invoice_ids.length === 0 && (
        <Empty
          icon={ShoppingCart}
          title="Nothing downstream yet"
          body="No sales order or invoice has been raised from this quote."
        />
      )}
    </div>
  );
}

/**
 * A Zoho address block.
 *
 * Zoho returns these as a loose object whose keys vary by organisation, so
 * this renders the ones that are conventionally present in the order an
 * address is actually read, and quietly skips whatever is missing.
 */
function Address({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  const lines = value
    ? ["attention", "address", "street2", "city", "state", "zip", "country"]
        .map((key) => value[key])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];

  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      {lines.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-4">Not recorded</p>
      ) : (
        <address className="mt-2 not-italic text-[13px] leading-relaxed text-ink">
          {lines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </address>
      )}
      {value && typeof value.phone === "string" && value.phone && (
        <p className="mt-2 text-[12px] text-ink-3">{value.phone}</p>
      )}
    </div>
  );
}

/** Custom field values arrive as whatever Zoho stored — string, number, bool. */
function formatCustom(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
