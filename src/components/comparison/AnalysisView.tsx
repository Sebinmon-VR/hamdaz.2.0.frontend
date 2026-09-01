"use client";

import clsx from "clsx";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Info,
  Split,
  Trophy,
} from "lucide-react";
import { money, num, percent } from "@/lib/format";
import type { Analysis } from "@/lib/types";
import { Badge, Panel, Meta, PanelHead, RampBar, Stat } from "@/components/ui/primitives";
import { PillRail } from "@/components/ui/controls";
import { Empty, InlineNotice } from "@/components/ui/feedback";

type View = "matrix" | "suppliers" | "findings";

/**
 * The comparison, rendered.
 *
 * The order on this screen is the order the backend puts its findings in, and
 * it is deliberate: whether these totals mean the same thing comes before what
 * they are. A supplier who did not quote three of the lines is not cheap, and
 * showing their total first would say otherwise.
 */
export function AnalysisView({ analysis }: { analysis: Analysis }) {
  const [view, setView] = useState<View>("matrix");
  const currency = analysis.currency;

  const warnings = analysis.insights.filter((i) => i.severity === "warning");
  const cheapest = analysis.cheapest_supplier;
  const saving = analysis.split_award.saving;

  return (
    <div className="space-y-4">
      {/* Headline. Pink is reserved for the recommendation — one filled thing
          on the page, and this is the thing the page is for. */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel tone={cheapest ? "highlight" : "panel"} className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">
                {analysis.all_suppliers_complete
                  ? "Cheapest overall"
                  : "Cheapest of those who quoted everything"}
              </p>
              {cheapest ? (
                <>
                  <p className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">
                    {cheapest.supplier_name}
                  </p>
                  <p className="display-num mt-1 text-[34px] font-semibold leading-none">
                    {money(cheapest.total, currency)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[15px] leading-relaxed">
                  No supplier quoted every line, so no total here is comparable with
                  another. Award line by line, or go back and ask for the gaps.
                </p>
              )}
            </div>
            {cheapest && <Trophy className="size-6 shrink-0 opacity-60" />}
          </div>

          {cheapest && (
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-current/10 pt-4 text-[12.5px]">
              <span>
                <span className="opacity-60">Delivery</span>{" "}
                {cheapest.delivery_time ?? "not stated"}
              </span>
              <span>
                <span className="opacity-60">Payment</span>{" "}
                {cheapest.payment_terms ?? "not stated"}
              </span>
              <span>
                <span className="opacity-60">Valid</span> {cheapest.validity ?? "not stated"}
              </span>
            </div>
          )}
        </Panel>

        <Panel className="p-4">
          <PanelHead title="Split award" />
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            Buying each line from whoever is cheapest on it.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
            <Stat
              value={money(analysis.split_award.total, currency, { compact: true })}
              label={`across ${analysis.split_award.supplier_count} suppliers`}
            />
            {saving && (
              <Stat
                value={money(saving.amount, currency, { compact: true })}
                label={`less than ${saving.against}`}
                tone="positive"
                delta={percent(saving.pct)}
              />
            )}
          </div>
          {Object.keys(analysis.split_award.by_supplier).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {Object.entries(analysis.split_award.by_supplier).map(([name, value]) => (
                <li key={name} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-ink-2">{name}</span>
                  <span className="tnum shrink-0 font-medium">{money(value, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {warnings.length > 0 && view !== "findings" && (
        <InlineNotice tone="warn">
          {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check before this is
          used — see Findings.
        </InlineNotice>
      )}

      <Panel className="p-4">
        <PillRail
          value={view}
          onChange={setView}
          className="mb-5"
          options={[
            {
              value: "matrix",
              label: "Line by line",
              count: analysis.item_count,
              icon: ArrowLeftRight,
            },
            {
              value: "suppliers",
              label: "Suppliers",
              count: analysis.supplier_count,
              icon: Split,
            },
            {
              value: "findings",
              label: "Findings",
              count: analysis.insights.length,
              icon: AlertTriangle,
            },
          ]}
        />

        {view === "matrix" && <Matrix analysis={analysis} />}
        {view === "suppliers" && <Suppliers analysis={analysis} />}
        {view === "findings" && <Findings analysis={analysis} />}
      </Panel>
    </div>
  );
}

/**
 * The matrix: one row per matched item, one column per supplier.
 *
 * Compared per unit rather than per line, because suppliers routinely quote
 * different quantities for the same requirement — a line-total comparison
 * would be comparing scope, not price.
 */
function Matrix({ analysis }: { analysis: Analysis }) {
  const suppliers = analysis.suppliers;
  const currency = analysis.currency;

  if (analysis.groups.length === 0) {
    return <Empty title="Nothing to compare" body="No priced lines were read from these quotes." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-4">
            <th className="sticky left-0 z-10 bg-panel pb-1 pr-4 font-medium">Item</th>
            {suppliers.map((supplier) => (
              <th key={supplier.quote_id} className="min-w-32 pb-1 text-right font-medium">
                {supplier.supplier_name}
              </th>
            ))}
            <th className="pb-1 pl-4 text-right font-medium">Spread</th>
          </tr>
        </thead>
        <tbody>
          {analysis.groups.map((group, i) => (
            <tr key={`${group.label}-${i}`} className="text-[13px]">
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-72 rounded-l-2xl bg-inset py-3 pl-3.5 pr-4 text-left font-normal"
              >
                <p className="truncate font-medium">{group.label}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-4">
                  {group.single_source && <Badge tone="warn">Only one supplier</Badge>}
                  {group.note && <span className="truncate">{group.note}</span>}
                </p>
              </th>

              {suppliers.map((supplier) => {
                const offer = group.offers.find((o) => o.quote_id === supplier.quote_id);
                return (
                  <td
                    key={supplier.quote_id}
                    className={clsx(
                      "bg-inset py-3 pr-3 text-right",
                      offer?.is_best && "font-semibold text-accent-text",
                    )}
                  >
                    {offer ? (
                      <>
                        <span className="tnum block">
                          {money(offer.unit_price, currency)}
                        </span>
                        <span className="tnum block text-[11px] font-normal text-ink-4">
                          ×{offer.quantity}
                          {offer.lead_time ? ` · ${offer.lead_time}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-4">not quoted</span>
                    )}
                  </td>
                );
              })}

              <td className="tnum rounded-r-2xl bg-inset py-3 pl-4 pr-3.5 text-right">
                {group.spread_pct === null ? (
                  <span className="text-ink-4">—</span>
                ) : (
                  <span
                    className={clsx(
                      group.spread_pct > 25 ? "font-semibold text-warn" : "text-ink-3",
                    )}
                  >
                    {percent(group.spread_pct, 0)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
        Prices are per unit, converted to {currency} where a quote was in another currency.
        Spread is the gap between the cheapest and dearest offer on that line.
      </p>
    </div>
  );
}

function Suppliers({ analysis }: { analysis: Analysis }) {
  const currency = analysis.currency;
  return (
    <div className="space-y-3">
      {analysis.suppliers.map((supplier) => {
        const complete = supplier.missing_items.length === 0;
        return (
          <Panel
            key={supplier.quote_id}
            tone="inset"
            className={clsx("p-5", !complete && "border-warn-soft")}
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold tracking-tight">
                  {supplier.supplier_name}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {complete ? (
                    <Badge tone="positive">Quoted every line</Badge>
                  ) : (
                    <Badge tone="warn">
                      {supplier.missing_items.length} of {analysis.item_count} not quoted
                    </Badge>
                  )}
                  {supplier.converted && (
                    <Badge tone="info">
                      {supplier.currency} at {supplier.fx_rate}
                    </Badge>
                  )}
                  {supplier.total_mismatch !== null && (
                    <Badge tone="danger">
                      Printed total off by {money(supplier.total_mismatch, currency)}
                    </Badge>
                  )}
                  {analysis.cheapest_supplier?.quote_id === supplier.quote_id && (
                    <Badge tone="highlight" icon={Trophy}>
                      Cheapest complete
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="display-num text-[24px] font-semibold">
                  {money(supplier.total, currency)}
                </p>
                <p className="text-[11.5px] text-ink-4">
                  {num(supplier.items_quoted)} of {analysis.item_count} lines
                </p>
              </div>
            </div>

            {/* Drawn against the full item count, so a supplier who quoted
                half the lines shows a half-length bar rather than a full one
                split in two. The gap is the point. */}
            <RampBar
              className="mt-4"
              height={22}
              showValues={false}
              total={analysis.item_count}
              segments={[{ value: supplier.items_quoted, label: "Quoted" }]}
            />

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
              <Meta label="Items">{money(supplier.items_total, currency)}</Meta>
              <Meta label="Discount">
                {supplier.discount ? `− ${money(supplier.discount, currency)}` : "—"}
              </Meta>
              <Meta label="Freight">
                {supplier.freight ? money(supplier.freight, currency) : "—"}
              </Meta>
              <Meta label="Tax">{supplier.tax ? money(supplier.tax, currency) : "—"}</Meta>
              <Meta label="Delivery">{supplier.delivery_time ?? "—"}</Meta>
              <Meta label="Payment">{supplier.payment_terms ?? "—"}</Meta>
              <Meta label="Validity">{supplier.validity ?? "—"}</Meta>
              <Meta label="Warranty">{supplier.warranty ?? "—"}</Meta>
            </dl>

            {supplier.missing_items.length > 0 && (
              <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
                <strong className="text-warn">Did not quote:</strong>{" "}
                {supplier.missing_items.join(", ")}
              </p>
            )}
            {supplier.extraction_note && (
              <p className="mt-3 text-[12px] leading-relaxed text-warn">
                {supplier.extraction_note}
              </p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function Findings({ analysis }: { analysis: Analysis }) {
  if (analysis.insights.length === 0) {
    return (
      <Empty
        icon={Info}
        title="Nothing flagged"
        body="Every supplier quoted every line, the printed totals match their own figures, and no quote needed converting."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {analysis.insights.map((insight, i) => (
        <li
          key={i}
          className={clsx(
            "flex items-start gap-3 rounded-2xl px-4 py-3.5 text-[13px] leading-relaxed",
            insight.severity === "warning"
              ? "bg-warn-soft text-warn"
              : "bg-inset text-ink-2",
          )}
        >
          {insight.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.1} />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-ink-4" strokeWidth={2.1} />
          )}
          <span className="min-w-0">{insight.message}</span>
        </li>
      ))}
    </ul>
  );
}
