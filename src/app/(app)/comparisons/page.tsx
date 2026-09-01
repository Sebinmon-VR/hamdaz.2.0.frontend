"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, Plus, Scale, Trash2 } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, money, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { ComparisonSummaryOut } from "@/lib/types";
import { Badge, Panel, PageHead } from "@/components/ui/primitives";
import { Button, LinkButton, PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";

type Scope = "mine" | "all";

export default function ComparisonsPage() {
  const session = useSession();
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");

  const { data, error, isLoading, mutate } = useSWR<ComparisonSummaryOut[]>(
    withQuery(scope === "mine" ? "/comparisons/mine" : "/comparisons", { limit: 100 }),
  );

  const remove = useAction(async (id: string) => api.del(`/comparisons/${id}`));

  const needle = search.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (row) =>
      !needle ||
      [row.title, row.reference, row.best_supplier, row.created_by_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Quote comparison"
        title="Comparisons"
        lead="Supplier quotes compared per unit, so totals mean the same thing before they are ranked."
        actions={
          session.can("quote_comparison", "new") && (
            <LinkButton href="/comparisons/new" variant="accent" icon={Plus}>
              New comparison
            </LinkButton>
          )
        }
      />

      {remove.error && <InlineNotice tone="danger">{remove.error}</InlineNotice>}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Title, reference, supplier"
          className="w-full max-w-sm"
        />
        <PillRail
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Everyone's" },
            { value: "mine", label: "Mine" },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Scale}
          title={needle ? "Nothing matches" : "No comparisons yet"}
          body={
            needle
              ? "Try part of a title, a reference, or a supplier name."
              : "Upload a few supplier quotes and the extractor will read them into a comparable shape."
          }
          action={
            !needle &&
            session.can("quote_comparison", "new") && (
              <LinkButton href="/comparisons/new" variant="accent" icon={Plus}>
                New comparison
              </LinkButton>
            )
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Panel key={row.id} className="flex flex-col p-4 transition hover:border-line-strong">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/comparisons/${row.id}`}>
                    <h3 className="truncate text-[16px] font-semibold tracking-tight">
                      {row.title}
                    </h3>
                  </Link>
                  <p className="truncate text-[12px] text-ink-4">
                    {row.reference ?? "No reference"} · {row.created_by_name ?? "Unknown"}
                  </p>
                </div>
                <Link
                  href={`/comparisons/${row.id}`}
                  aria-label={`Open ${row.title}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ink-3 transition hover:border-accent hover:text-ink"
                >
                  <ArrowUpRight className="size-4" strokeWidth={2.2} />
                </Link>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
                    Cheapest complete
                  </p>
                  <p className="display-num mt-1 truncate text-[22px] font-semibold">
                    {row.best_total ? money(row.best_total, row.currency) : "—"}
                  </p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    {row.best_supplier ?? "No supplier quoted everything"}
                  </p>
                </div>
                {row.status === "draft" && <Badge tone="warn">Draft</Badge>}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Badge>{row.supplier_count} suppliers</Badge>
                <Badge>{row.item_count} items</Badge>
                <span className="ml-auto text-[11.5px] text-ink-4" title={date(row.created_at)}>
                  {relative(row.created_at)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Delete ${row.title}`}
                  onClick={async () => {
                    if ((await remove.run(row.id)) !== undefined) mutate();
                  }}
                />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
