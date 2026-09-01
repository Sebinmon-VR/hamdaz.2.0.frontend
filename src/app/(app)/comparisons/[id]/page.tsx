"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Download, FileText, PenLine } from "lucide-react";
import { files } from "@/lib/api";
import { date, dateTime, money, relative } from "@/lib/format";
import type { ComparisonOut } from "@/lib/types";
import { Badge, Panel, Meta, PageHead, PanelHead } from "@/components/ui/primitives";
import { PanelSkeleton, Empty, ErrorState, InlineNotice } from "@/components/ui/feedback";
import { AnalysisView } from "@/components/comparison/AnalysisView";

export default function ComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, mutate } = useSWR<ComparisonOut>(`/comparisons/${id}`);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton lines={8} />;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/comparisons">Comparisons</Link>}
        title={data.title}
        lead={data.notes ?? undefined}
        actions={
          <>
            {data.status === "draft" && <Badge tone="warn">Draft</Badge>}
            <span className="text-[12.5px] text-ink-3">
              {data.created_by_name ?? "Unknown"} · {relative(data.created_at)}
            </span>
          </>
        }
      />

      {data.reference && (
        <p className="text-[13px] text-ink-3">
          Reference <strong className="text-ink">{data.reference}</strong>
        </p>
      )}

      {data.analysis ? (
        <>
          <AnalysisView analysis={data.analysis} />
          <p className="text-[11.5px] text-ink-4">
            Analysed {dateTime(data.analysed_at)}. Prices are as extracted from the
            documents below — the originals remain the record.
          </p>
        </>
      ) : (
        <InlineNotice tone="warn">
          This comparison has not been analysed. That happens when it was saved with fewer
          than two suppliers, or with no priced lines to match.
        </InlineNotice>
      )}

      <Panel className="p-4">
        <PanelHead
          title="The quotes behind this"
          count={data.quotes.length}
          hint={`All figures converted to ${data.currency}`}
        />

        {data.quotes.length === 0 ? (
          <Empty
            icon={FileText}
            title="No quotes attached"
            body="Nothing was saved against this comparison."
            className="mt-5"
          />
        ) : (
          <div className="mt-3 space-y-2">
            {data.quotes.map((quote) => (
              <Panel key={quote.id} tone="inset" className="p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{quote.supplier_name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-4">
                      {[
                        quote.quote_number,
                        quote.quote_date ? date(quote.quote_date) : null,
                        quote.contact,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No quote reference"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={quote.source === "upload" ? "accent" : "neutral"}>
                        {quote.source === "upload" ? "Extracted from a file" : "Entered by hand"}
                      </Badge>
                      {quote.currency !== data.currency && (
                        <Badge tone="info">
                          {quote.currency} at {quote.fx_rate}
                        </Badge>
                      )}
                      <Badge>{quote.items.length} lines</Badge>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="display-num text-[20px] font-semibold">
                      {money(quote.quoted_total, quote.currency)}
                    </p>
                    <p className="text-[11px] text-ink-4">as printed</p>
                  </div>

                  {quote.document_url && (
                    <a
                      href={files.comparisonDocument(data.id, quote.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[12.5px] font-medium transition hover:border-accent"
                    >
                      <Download className="size-3.5" />
                      {quote.file_name ? "Original" : "File"}
                    </a>
                  )}
                </div>

                {quote.extraction_note && (
                  <InlineNotice tone="warn" className="mt-4">
                    {quote.extraction_note}
                  </InlineNotice>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
                  <Meta label="Delivery">{quote.delivery_time ?? "—"}</Meta>
                  <Meta label="Payment">{quote.payment_terms ?? "—"}</Meta>
                  <Meta label="Validity">{quote.validity ?? "—"}</Meta>
                  <Meta label="Incoterms">{quote.incoterms ?? "—"}</Meta>
                </dl>

                {quote.items.length > 0 && (
                  <details className="group mt-4">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] font-medium text-ink-3 hover:text-ink">
                      <PenLine className="size-3.5" />
                      Show the {quote.items.length} lines as extracted
                    </summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-[12.5px]">
                        <thead>
                          <tr className="text-left text-[10.5px] uppercase tracking-[0.08em] text-ink-4">
                            <th className="pb-1 font-medium">Description</th>
                            <th className="pb-1 text-right font-medium">Qty</th>
                            <th className="pb-1 text-right font-medium">Unit</th>
                            <th className="pb-1 pr-3 text-right font-medium">Line</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.items.map((item) => (
                            <tr key={item.id}>
                              <td className="rounded-l-xl bg-panel py-2 pl-3">
                                <p className="font-medium">{item.description}</p>
                                {(item.part_number || item.brand) && (
                                  <p className="text-[11px] text-ink-4">
                                    {[item.brand, item.part_number].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </td>
                              <td className="tnum bg-panel py-2 text-right">
                                {item.quantity}
                                {item.unit ? ` ${item.unit}` : ""}
                              </td>
                              <td className="tnum bg-panel py-2 text-right">
                                {money(item.unit_price, quote.currency)}
                              </td>
                              <td className="tnum rounded-r-xl bg-panel py-2 pr-3 text-right font-medium">
                                {money(item.line_total, quote.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </Panel>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
