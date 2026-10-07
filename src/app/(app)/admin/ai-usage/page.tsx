"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Coins, ShieldAlert } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateShort, dateTime, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AIUsageOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * Which models read quote documents, and what each read cost.
 *
 * One row per call, not per document: a free model that answered badly and
 * Claude asked after it are two calls, and the first was paid for in tokens
 * all the same. A document the built-in readers settled on their own made no
 * call and is not listed. Super admin only, and the endpoint enforces that.
 */

type Period = "7" | "30" | "90" | "all";

/** Dollars to the cent, or to the hundredth of a cent when it is that small. */
function usd(value: string | number): string {
  const n = Number(value);
  if (!n) return "free";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const paid = (provider: string) => provider === "anthropic";

export default function AIUsagePage() {
  const session = useSession();
  const [period, setPeriod] = useState<Period>("30");

  const { data, error, mutate } = useSWR<AIUsageOut>(
    session.roles.is_super_admin
      ? withQuery("/quote-requests/admin/ai-usage", { days: period === "all" ? "0" : period })
      : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="AI usage" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="What the company spends on AI models is a super admin's business, and the endpoint behind this screen enforces that itself."
        />
      </>
    );
  }

  const head = "micro whitespace-nowrap px-3 py-2 text-left font-medium text-ink-4";
  const cell = "px-3 py-2.5 align-top text-[12.5px]";

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="AI usage"
        count={data ? `${num(data.calls.length)} calls` : undefined}
        lead="Which models read supplier quotes and documents on quote requests, and what each read cost. Free models cost nothing; Claude is priced at its list price."
        meta={data?.since ? `since ${dateShort(data.since)}` : data ? "all time" : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <PanelSkeleton />
      ) : (
        <>
          {/* The four numbers the page is for. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Total cost" value={usd(data.total_cost_usd)} />
            <Tile label="Model calls" value={num(data.calls.length)} hint={`${data.free_calls} free · ${data.paid_calls} paid (Claude)`} />
            <Tile label="Tokens in" value={tokens(data.input_tokens)} />
            <Tile label="Tokens out" value={tokens(data.output_tokens)} />
          </div>

          {data.calls.length === 0 ? (
            <Empty
              icon={Coins}
              title="No model calls in this period"
              body="Documents the built-in readers can follow on their own cost nothing and make no call. Calls are recorded from 7 October 2026."
            />
          ) : (
            <>
              <Panel className="p-2">
                <h2 className="px-3 pb-1 pt-3 text-[14px] font-semibold">By model</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr className="border-b border-line">
                        <th className={head}>Model</th>
                        <th className={clsx(head, "text-right")}>Calls</th>
                        <th className={clsx(head, "text-right")}>Tokens in / out</th>
                        <th className={clsx(head, "text-right")}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_model.map((m) => (
                        <tr key={`${m.provider}:${m.model}`} className="border-b border-line/60">
                          <td className={cell}>
                            <ModelName provider={m.provider} model={m.model} />
                          </td>
                          <td className={clsx(cell, "tnum text-right")}>{num(m.calls)}</td>
                          <td className={clsx(cell, "tnum text-right text-ink-3")}>
                            {tokens(m.input_tokens)} / {tokens(m.output_tokens)}
                          </td>
                          <td className={clsx(cell, "tnum text-right font-medium")}>{usd(m.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {data.truncated && (
                <InlineNotice tone="info">
                  Showing the latest {num(data.calls.length)} calls. The totals above count every call in the period.
                </InlineNotice>
              )}

              <Panel className="p-2">
                <h2 className="px-3 pb-1 pt-3 text-[14px] font-semibold">Every call</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead>
                      <tr className="border-b border-line">
                        <th className={head}>When</th>
                        <th className={head}>Quote</th>
                        <th className={head}>What was read</th>
                        <th className={head}>Model</th>
                        <th className={clsx(head, "text-right")}>Tokens in / out</th>
                        <th className={clsx(head, "text-right")}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.calls.map((call) => (
                        <tr
                          key={call.id}
                          className={clsx("border-b border-line/60", !call.used && "text-ink-4")}
                        >
                          <td className={clsx(cell, "whitespace-nowrap text-ink-3")}>
                            {dateTime(call.created_at)}
                            {call.user_name && (
                              <div className="text-[11px] text-ink-4">{call.user_name}</div>
                            )}
                          </td>
                          <td className={cell}>
                            <Link
                              href={`/quote-requests/${call.request_id}`}
                              className="font-medium text-accent-text hover:underline"
                            >
                              {call.quote_reference || call.quote_title || "Quote"}
                            </Link>
                            {call.quote_reference && call.quote_title && (
                              <div className="max-w-[260px] truncate text-[11px] text-ink-4">
                                {call.quote_title}
                              </div>
                            )}
                          </td>
                          <td className={cell}>
                            {call.label ?? call.purpose.replace("_", " ")}
                            {!call.used && (
                              <div className="text-[11px] text-ink-4">
                                Answer unusable; the next model was asked
                              </div>
                            )}
                          </td>
                          <td className={cell}>
                            <ModelName provider={call.provider} model={call.model} />
                          </td>
                          <td className={clsx(cell, "tnum whitespace-nowrap text-right text-ink-3")}>
                            {tokens(call.input_tokens)} / {tokens(call.output_tokens)}
                          </td>
                          <td className={clsx(cell, "tnum whitespace-nowrap text-right font-medium")}>
                            {usd(call.cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="px-5 py-4">
      <div className="text-[12px] text-ink-4">{label}</div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[11.5px] text-ink-3">{hint}</div>}
    </Panel>
  );
}

function ModelName({ provider, model }: { provider: string; model: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{model}</span>
      <Badge tone={paid(provider) ? "warn" : "positive"}>
        {paid(provider) ? "Claude · paid" : `${provider} · free`}
      </Badge>
    </div>
  );
}
