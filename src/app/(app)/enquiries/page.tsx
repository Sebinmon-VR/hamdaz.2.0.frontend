"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ListChecks, ScanSearch } from "lucide-react";
import { date, dateTime } from "@/lib/format";
import type { EnquirySummaryOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { LinkButton, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

/**
 * Every enquiry that has been analysed. An analysis is started from a task
 * (Proposals → a task → Analyse enquiry), so this list is for finding one
 * again, not for starting one.
 */
export default function EnquiriesPage() {
  const [search, setSearch] = useState("");
  const { data, error, isLoading, mutate } = useSWR<{ analyses: EnquirySummaryOut[] }>("/enquiries", {
    revalidateOnFocus: false,
  });

  const needle = search.trim().toLowerCase();
  const rows = (data?.analyses ?? []).filter(
    (a) => !needle || `${a.task_title} ${a.end_user ?? ""}`.toLowerCase().includes(needle),
  );

  return (
    <div className="space-y-4">
      <PageHead
        title="Enquiry analyses"
        count={data?.analyses.length}
        actions={
          <LinkButton href="/proposals/my-tasks" icon={ListChecks}>
            Analyse a task
          </LinkButton>
        }
      />
      <Panel className="overflow-hidden">
        <div className="p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by task or end user" />
        </div>
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <RowsSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="px-6 pb-6">
            <Empty
              icon={ScanSearch}
              title={needle ? "Nothing matches" : "No enquiries analysed yet"}
              body="Open a task under Proposals and choose Analyse enquiry."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-y border-line bg-panel-2">
                  {["Task", "End user", "Bid closing", "Items", "Recent", "History", "New", "Last run"].map((h) => (
                    <th key={h} className="micro px-5 py-2 text-left font-medium text-ink-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.task_id} className="border-b border-line/60 hover:bg-panel-2/60">
                    <td className="max-w-[380px] px-5 py-2 text-[12.5px]">
                      <Link href={`/enquiries/${encodeURIComponent(a.task_id)}`} className="font-medium text-ink hover:underline">
                        {a.task_title}
                      </Link>
                      {a.status === "running" && <Badge tone="info" className="ml-2">Running</Badge>}
                      {a.status === "failed" && <Badge tone="danger" className="ml-2">Failed</Badge>}
                    </td>
                    <td className="px-5 py-2 text-[12.5px] text-ink-2">{a.end_user ?? "—"}</td>
                    <td className="px-5 py-2 text-[12.5px] text-ink-2">{date(a.bid_closing_date)}</td>
                    <td className="tnum px-5 py-2 text-[12.5px]">{a.items}</td>
                    <td className="tnum px-5 py-2 text-[12.5px] text-positive">{a.recent}</td>
                    <td className="tnum px-5 py-2 text-[12.5px] text-info">{a.history}</td>
                    <td className="tnum px-5 py-2 text-[12.5px] text-warn">{a.new}</td>
                    <td className="px-5 py-2 text-[12px] text-ink-3">
                      {a.finished_at ? `${dateTime(a.finished_at)}${a.run_by_name ? ` · ${a.run_by_name}` : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
