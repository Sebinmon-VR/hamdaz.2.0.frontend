"use client";

import clsx from "clsx";
import useSWR from "swr";
import { Download, RefreshCw } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { amount, date, decimal, decimalPercent } from "@/lib/format";
import type {
  CostingReportOut,
  FigureOut,
  NegotiationStatus,
  QuoteRequestOut,
} from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import {
  Band,
  CellText,
  Grid,
  GridHead,
  GridRow,
  Num,
  Sheet,
  Td,
  Th,
} from "@/components/quotes/sheet/Sheet";

/**
 * The selling & costing report — what goes to the approver.
 *
 * The same page the PDF prints, drawn from the same server object: what we
 * are charging, what it costs landed, what that leaves, and what each
 * discount step does to the margin. Nothing here is calculated. The report
 * arrives computed from the quote's own rows, and this screen formats it —
 * so the figure an approver reads here is the figure on the PDF they were
 * mailed, to the cent.
 *
 * Above the report sit the few facts it states that the quote does not
 * otherwise hold — who the goods come from and how they travel, who finally
 * uses them, where the walk-away line is — as yellow cells like every other
 * sheet. They save with the quote, and the report below refreshes on save.
 *
 * Margin throughout is a share of the selling price: the number a discount
 * eats into, and the terms every line is priced in — cost ÷ (1 − margin).
 */

const STATUS: Record<
  NegotiationStatus,
  { label: string; tone: "positive" | "info" | "warn" | "danger"; hint: string }
> = {
  comfortable: {
    label: "Healthy margin",
    tone: "positive",
    hint: "At or above the comfortable margin: this discount can be given without asking anybody.",
  },
  acceptable: {
    label: "Acceptable",
    tone: "info",
    hint: "Between the walk-away and the comfortable margin: fine to give, worth noting.",
  },
  needs_approval: {
    label: "Below walk-away",
    tone: "warn",
    hint: "Below the walk-away margin: not sold at this price without management approval.",
  },
  loss: {
    label: "Loss",
    tone: "danger",
    hint: "The price no longer covers the landed cost: money out on every unit.",
  },
}

export function CostingReport({
  quote,
  unsaved,
}: {
  quote: QuoteRequestOut;
  /** Edits on screen the server has not seen. The report is of the saved quote. */
  unsaved: boolean;
}) {
  // Keyed on the quote's stamp, so a save fetches the report of what was
  // just saved rather than serving the one from before it.
  const { data, error, isLoading, mutate } = useSWR<CostingReportOut>(
    withQuery(`/quote-requests/${quote.id}/report`, { v: quote.updated_at }),
    { revalidateOnFocus: false },
  );

  const exportPdf = useAction(async () =>
    api.download(`/quote-requests/${quote.id}/report.pdf`, `${quote.reference ?? "quote"}-report.pdf`),
  );

  return (
    <div className="space-y-3.5">
      {/* ── the report ── */}
      {unsaved && (
        <InlineNotice tone="info">
          The report below is of the saved quote. Save your changes and it redraws.
        </InlineNotice>
      )}
      {error && (
        <InlineNotice tone="danger">
          The report could not be built: {error instanceof Error ? error.message : "unknown error"}
        </InlineNotice>
      )}
      {isLoading && !data && <PanelSkeleton lines={12} />}
      {data && (
        <Report
          report={data}
          onExport={() => exportPdf.run()}
          exporting={exportPdf.pending}
          exportError={exportPdf.error}
          onRefresh={() => mutate()}
        />
      )}
    </div>
  );
}

/* ── the page, as the PDF prints it ─────────────────────────────────── */

function Report({
  report,
  onExport,
  exporting,
  exportError,
  onRefresh,
}: {
  report: CostingReportOut;
  onExport: () => void;
  exporting: boolean;
  exportError: string | null;
  onRefresh: () => void;
}) {
  const cur = report.currency;
  const base = report.base_currency;
  const two = report.base_rate !== null;
  const who = report.customer.end_user ?? report.customer.name;

  return (
    <Sheet>
      <div className="flex flex-wrap items-start gap-3 border-b border-line-strong px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="micro text-ink-4">Hamdaztech Technology Services LLC</p>
          <h2 className="mt-1 text-[15px] font-semibold uppercase tracking-wide text-ink">
            Selling &amp; costing report
          </h2>
          <p className="mt-1 text-[12px] text-ink-2">
            Quote <span className="font-semibold">{report.reference}</span>
            {" · "}
            {two
              ? `${cur} & ${base} (1 ${cur} = ${report.base_rate} ${base}${report.rate_source ? `, ${report.rate_source}` : ""})`
              : cur}
            {" · "}Prepared {date(report.prepared_on)}
            {report.prepared_by ? ` by ${report.prepared_by}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={RefreshCw} onClick={onRefresh}>
            Refresh
          </Button>
          <Button size="sm" variant="accent" icon={Download} loading={exporting} onClick={onExport}>
            Export PDF
          </Button>
        </div>
        {exportError && (
          <p className="w-full text-[12px] text-danger">{exportError}</p>
        )}
      </div>

      {/* the parties */}
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <Party heading="Customer" name={report.customer.name + (report.customer.reference ? ` · Portal ref ${report.customer.reference}` : "")}>
          {report.customer.end_user && <span>End user: {report.customer.end_user}</span>}
          <span>
            {report.customer.place_of_supply && `Place of supply: ${report.customer.place_of_supply} · `}
            Valid: {date(report.customer.valid_from)} – {date(report.customer.valid_until)}
          </span>
        </Party>
        <Party
          heading="Supplier"
          name={(report.supplier.name ?? "Supplier not stated") + (report.supplier.basis ? ` (${report.supplier.basis})` : "")}
        >
          <span>
            {report.supplier.route && `Route: ${report.supplier.route} · `}
            {report.supplier.creator && `Creator: ${report.supplier.creator}`}
          </span>
          {report.supplier.quote_number && <span>Their ref: {report.supplier.quote_number}</span>}
        </Party>
      </div>

      {/* the four figures */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-3 lg:grid-cols-4">
        <Tile label="Quoted price (ex-VAT)" figure={report.quoted_price} report={report} tone="navy" />
        <Tile label="Total landed cost" figure={report.landed_total} report={report} tone="grey" />
        <Tile
          label={`Gross margin${report.gross_margin_percent ? ` · ${decimalPercent(report.gross_margin_percent)}` : ""}`}
          figure={report.gross_margin}
          report={report}
          tone="cyan"
        />
        <Tile
          label={`Walk-away (${decimalPercent(report.walk_away_margin_percent, { places: 0 })} margin)`}
          figure={report.walk_away_price}
          report={report}
          tone="magenta"
        />
      </div>

      {/* 1 */}
      <Band>1. Selling vs costing by line</Band>
      <Grid
        columns={
          two
            ? "36px minmax(0,1fr) 52px 88px 84px 84px 84px 84px 84px 84px 64px"
            : "36px minmax(0,1fr) 52px 100px 100px 100px 100px 72px"
        }
      >
        <GridHead>
          <Th>#</Th>
          <Th>Part no. / description</Th>
          <Th align="right">Qty</Th>
          <Th align="right">Supplier {report.supplier_currency ?? cur}</Th>
          <Th align="right">Landed {cur}</Th>
          {two && <Th align="right">Landed {base}</Th>}
          <Th align="right">Selling {cur}</Th>
          {two && <Th align="right">Selling {base}</Th>}
          <Th align="right">Margin {cur}</Th>
          {two && <Th align="right">Margin {base}</Th>}
          <Th align="right">Margin</Th>
        </GridHead>
        {report.lines.map((line) => (
          <GridRow key={line.position}>
            <Td muted>
              <Num muted>{line.position}</Num>
            </Td>
            <Td wrap>
              {line.part_number && <span className="mr-1.5 font-semibold">{line.part_number}</span>}
              <span className="text-ink-2">{line.description}</span>
            </Td>
            <Td align="right">
              <Num>{decimal(line.quantity, { min: 0 })}</Num>
            </Td>
            <Td align="right">
              <Num muted>{decimal(line.supplier_amount)}</Num>
            </Td>
            <Td align="right">
              <Num>{decimal(line.landed?.amount)}</Num>
            </Td>
            {two && (
              <Td align="right">
                <Num muted>{decimal(line.landed?.base)}</Num>
              </Td>
            )}
            <Td align="right">
              <Num>{decimal(line.selling.amount)}</Num>
            </Td>
            {two && (
              <Td align="right">
                <Num muted>{decimal(line.selling.base)}</Num>
              </Td>
            )}
            <Td align="right">
              <Num strong>{decimal(line.margin?.amount)}</Num>
            </Td>
            {two && (
              <Td align="right">
                <Num muted>{decimal(line.margin?.base)}</Num>
              </Td>
            )}
            <Td align="right">
              <Num strong>{line.margin_percent ? decimalPercent(line.margin_percent) : "—"}</Num>
            </Td>
          </GridRow>
        ))}
        <GridRow strong>
          <Td />
          <Td>Total (ex-VAT)</Td>
          <Td align="right">
            <Num strong>{decimal(report.total_quantity, { min: 0 })}</Num>
          </Td>
          <Td align="right">
            <Num strong>{decimal(report.total_supplier_amount)}</Num>
          </Td>
          <Td align="right">
            <Num strong>{decimal(report.landed_total.amount)}</Num>
          </Td>
          {two && (
            <Td align="right">
              <Num strong>{decimal(report.landed_total.base)}</Num>
            </Td>
          )}
          <Td align="right">
            <Num strong>{decimal(report.quoted_price.amount)}</Num>
          </Td>
          {two && (
            <Td align="right">
              <Num strong>{decimal(report.quoted_price.base)}</Num>
            </Td>
          )}
          <Td align="right">
            <Num strong>{decimal(report.gross_margin.amount)}</Num>
          </Td>
          {two && (
            <Td align="right">
              <Num strong>{decimal(report.gross_margin.base)}</Num>
            </Td>
          )}
          <Td align="right">
            <Num strong>
              {report.gross_margin_percent ? decimalPercent(report.gross_margin_percent) : "—"}
            </Num>
          </Td>
        </GridRow>
      </Grid>

      {/* 2 and 3 */}
      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-line">
        <div>
          <Band>2. Landed cost to UAE</Band>
          <Grid columns={two ? "minmax(0,1fr) 100px 100px" : "minmax(0,1fr) 120px"}>
            <GridHead>
              <Th>Cost element</Th>
              <Th align="right">{cur}</Th>
              {two && <Th align="right">{base}</Th>}
            </GridHead>
            {report.cost_rows.map((row, i) => (
              <GridRow key={`${row.label}-${i}`}>
                <Td wrap muted={row.computed}>
                  {row.label}
                  {row.is_estimate && <span className="text-ink-4">*</span>}
                </Td>
                <Td align="right">
                  <Num>{decimal(row.amount.amount)}</Num>
                </Td>
                {two && (
                  <Td align="right">
                    <Num muted>{decimal(row.amount.base)}</Num>
                  </Td>
                )}
              </GridRow>
            ))}
            <GridRow strong>
              <Td>Total landed cost</Td>
              <Td align="right">
                <Num strong>{decimal(report.landed_total.amount)}</Num>
              </Td>
              {two && (
                <Td align="right">
                  <Num strong>{decimal(report.landed_total.base)}</Num>
                </Td>
              )}
            </GridRow>
          </Grid>
        </div>
        <div>
          <Band>3. Quote value</Band>
          <Grid columns={two ? "minmax(0,1fr) 100px 100px" : "minmax(0,1fr) 120px"}>
            <GridHead>
              <Th>{report.reference}</Th>
              <Th align="right">{cur}</Th>
              {two && <Th align="right">{base}</Th>}
            </GridHead>
            <ValueRow label="Sub total (ex-VAT)" figure={report.sub_total} two={two} />
            <ValueRow label={report.tax_label} figure={report.tax_total} two={two} />
            <ValueRow label="Total incl. VAT" figure={report.total_incl_tax} two={two} strong />
          </Grid>
          <Band>Walk-away prices (ex-VAT)</Band>
          <Grid columns={two ? "minmax(0,1fr) 90px 90px 80px" : "minmax(0,1fr) 110px 90px"}>
            <GridHead>
              <Th>Min. margin</Th>
              <Th align="right">{cur}</Th>
              {two && <Th align="right">{base}</Th>}
              <Th align="right">Max. disc.</Th>
            </GridHead>
            {report.walk_away_ladder.map((rung) => {
              const floor = rung.margin_percent === report.walk_away_margin_percent;
              return (
                <GridRow key={rung.margin_percent} tone={floor ? "accent" : undefined}>
                  <Td>
                    <Num strong={floor}>{decimalPercent(rung.margin_percent)}</Num>
                  </Td>
                  <Td align="right">
                    <Num strong={floor}>{decimal(rung.price.amount)}</Num>
                  </Td>
                  {two && (
                    <Td align="right">
                      <Num muted>{decimal(rung.price.base)}</Num>
                    </Td>
                  )}
                  <Td align="right">
                    <Num strong>
                      {rung.max_discount_percent ? decimalPercent(rung.max_discount_percent) : "—"}
                    </Num>
                  </Td>
                </GridRow>
              );
            })}
          </Grid>
        </div>
      </div>

      {/* 4 */}
      <Band>4. Negotiation — if {who} requests a discount</Band>
      <Grid
        columns={
          two
            ? "90px 110px 110px 110px 110px 90px minmax(0,1fr)"
            : "90px 140px 140px 90px minmax(0,1fr)"
        }
      >
        <GridHead>
          <Th>Discount</Th>
          <Th align="right">Total incl. VAT {cur}</Th>
          {two && <Th align="right">{base}</Th>}
          <Th align="right">Gross margin {cur}</Th>
          {two && <Th align="right">{base}</Th>}
          <Th align="right">Margin %</Th>
          <Th>Status</Th>
        </GridHead>
        {report.negotiation.map((step) => {
          const spec = STATUS[step.status];
          return (
            <GridRow key={step.discount_percent}>
              <Td>
                <Num strong>
                  {step.discount_percent === "0.00" || step.discount_percent === "0"
                    ? "Quoted"
                    : decimalPercent(step.discount_percent, { places: 0 })}
                </Num>
              </Td>
              <Td align="right">
                <Num>{decimal(step.total_incl_tax.amount)}</Num>
              </Td>
              {two && (
                <Td align="right">
                  <Num muted>{decimal(step.total_incl_tax.base)}</Num>
                </Td>
              )}
              <Td align="right">
                <Num strong>{decimal(step.margin.amount)}</Num>
              </Td>
              {two && (
                <Td align="right">
                  <Num muted>{decimal(step.margin.base)}</Num>
                </Td>
              )}
              <Td align="right">
                <Num strong>{step.margin_percent ? decimalPercent(step.margin_percent) : "—"}</Num>
              </Td>
              <Td>
                <Badge tone={spec.tone} title={spec.hint}>{spec.label}</Badge>
              </Td>
            </GridRow>
          );
        })}
      </Grid>

      {/* What each status means, with this quote's own thresholds in it. */}
      <p className="px-4 pb-1 pt-2 text-[11px] leading-relaxed text-ink-4">
        <span className="font-semibold text-ink-3">Healthy margin</span> at or above the
        comfortable margin ({decimalPercent(report.comfortable_margin_percent, { places: 0 })}) ·{" "}
        <span className="font-semibold text-ink-3">Acceptable</span> between the walk-away (
        {decimalPercent(report.walk_away_margin_percent, { places: 0 })}) and the comfortable
        margin · <span className="font-semibold text-ink-3">Below walk-away</span> still positive
        but under the walk-away, so not without management approval ·{" "}
        <span className="font-semibold text-ink-3">Loss</span> the price no longer covers the
        landed cost.
      </p>

      {/* the recommendation and the footnotes */}
      <div className="m-4 rounded-[12px] border-l-[3px] border-accent bg-panel-2 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed">
          <span className="font-semibold">Recommendation:</span> {report.recommendation}
        </p>
        {(report.notes.length > 0 || report.warnings.length > 0) && (
          <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-ink-3">
            {report.notes.map((note, i) => (
              <li key={`n${i}`}>• {note}</li>
            ))}
            {report.warnings.map((warning, i) => (
              <li key={`w${i}`} className="text-danger">
                • {warning}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The names the trail already knows; a blank line where it does not. */}
      <div className="grid grid-cols-3 gap-6 px-4 pb-5 pt-2 text-[11.5px] text-ink-4">
        {(
          [
            ["Prepared by", report.prepared_by],
            ["Reviewed by", report.reviewed_by],
            ["Approved by", report.approved_by],
          ] as const
        ).map(([label, who]) => (
          <div key={label}>
            <div className="pb-1">{label}</div>
            <div className="h-7 truncate border-t border-line-strong pt-1.5 text-[13px] font-semibold text-ink">
              {who ?? ""}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function Party({
  heading,
  name,
  children,
}: {
  heading: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-line px-4 py-3">
      <p className="micro text-accent">{heading}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">{name}</p>
      <div className="mt-0.5 flex flex-col text-[12px] leading-relaxed text-ink-3">{children}</div>
    </div>
  );
}

function Tile({
  label,
  figure,
  report,
  tone,
}: {
  label: string;
  figure: FigureOut;
  report: CostingReportOut;
  tone: "navy" | "grey" | "cyan" | "magenta";
}) {
  return (
    <div
      className={clsx(
        "rounded-[12px] border border-line border-t-[3px] px-4 py-3",
        tone === "navy" && "border-t-ink bg-panel-2",
        tone === "grey" && "border-t-line-strong",
        tone === "cyan" && "border-t-accent bg-panel-2",
        tone === "magenta" && "border-t-second bg-second-soft/30",
      )}
    >
      <p className="micro text-ink-4">{label}</p>
      <p className={clsx("fig mt-1.5 text-[20px] leading-none", tone === "magenta" && "text-second-text")}>
        {amount(figure.amount, report.currency)}
      </p>
      {figure.base !== null && (
        <p className="tnum mt-1.5 text-[12px] font-semibold text-ink-2">
          {amount(figure.base, report.base_currency)}
        </p>
      )}
    </div>
  );
}

function ValueRow({
  label,
  figure,
  two,
  strong,
}: {
  label: string;
  figure: FigureOut;
  two: boolean;
  strong?: boolean;
}) {
  return (
    <GridRow strong={strong}>
      <Td>{label}</Td>
      <Td align="right">
        <Num strong={strong}>{decimal(figure.amount)}</Num>
      </Td>
      {two && (
        <Td align="right">
          <Num strong={strong} muted={!strong}>
            {decimal(figure.base)}
          </Num>
        </Td>
      )}
    </GridRow>
  );
}
