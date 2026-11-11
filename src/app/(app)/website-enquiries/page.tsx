"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Globe } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { WebsiteEnquiryPage, WebsiteEnquiryStatus } from "@/lib/types";
import { PageHead, Panel } from "@/components/ui/primitives";
import { PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { STATUSES, StatusBadge } from "@/components/website/badges";

type Filter = WebsiteEnquiryStatus | "all";

/**
 * What came in through the contact form on hamdaz.com, newest first.
 *
 * Searched and filtered by the backend rather than here: the list is paged, so
 * filtering a page in the browser would only ever search the newest fifty.
 * The counts on the filter come back with every page, whatever is selected, so
 * "New 3" stays true while you are looking at something else.
 */
export default function WebsiteEnquiriesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());

  const key = withQuery("/website-enquiries", {
    status: filter === "all" ? undefined : filter,
    q: q || undefined,
    limit: 200,
  });
  const { data, error, isLoading, mutate } = useSWR<WebsiteEnquiryPage>(key, { revalidateOnFocus: true });

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : undefined;
  const rows = data?.enquiries ?? [];

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Sales"
        title="Website enquiries"
        count={total}
        lead="Messages from the contact form on hamdaz.com. Take one on, then move it along."
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everything", count: total },
            ...STATUSES.map((s) => ({ value: s.value, label: s.label, count: data?.counts[s.value] })),
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, email, company or message"
          className="min-w-[220px] flex-1"
        />
      </div>

      <Panel className="overflow-hidden">
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <RowsSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="p-6">
            <Empty
              icon={Globe}
              title={q || filter !== "all" ? "Nothing matches" : "No enquiries yet"}
              body={
                q || filter !== "all"
                  ? "Nothing in this filter."
                  : "Messages sent through the contact form on hamdaz.com arrive here, and everyone who can see this page is told."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-panel-2">
                  {["Received", "From", "Company", "Interested in", "Status", "Assigned"].map((h) => (
                    <th key={h} className="micro px-5 py-2 text-left font-medium text-ink-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 align-top hover:bg-panel-2/60">
                    <td className="whitespace-nowrap px-5 py-2.5 text-[12px] text-ink-3" title={dateTime(e.created_at)}>
                      {relative(e.created_at)}
                    </td>
                    <td className="max-w-[340px] px-5 py-2.5 text-[12.5px]">
                      <Link href={`/website-enquiries/${e.id}`} className="font-medium text-ink hover:underline">
                        {e.name}
                      </Link>
                      <p className="mt-0.5 truncate text-[12px] text-ink-3">{e.preview}</p>
                    </td>
                    <td className="px-5 py-2.5 text-[12.5px] text-ink-2">{e.company ?? "—"}</td>
                    <td className="max-w-[240px] px-5 py-2.5 text-[12px] text-ink-3">
                      {e.topics.length ? e.topics.join(", ") : "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-5 py-2.5 text-[12.5px] text-ink-2">{e.assigned_to?.name ?? "—"}</td>
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
