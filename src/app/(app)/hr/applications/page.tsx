"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Paperclip, UserSearch } from "lucide-react";
import { withQuery } from "@/lib/api";
import { num, relative } from "@/lib/format";
import type { HrApplicationOut, HrApplicationStage, HrOpeningSummaryOut } from "@/lib/types";
import { Avatar, PageHead, Panel, Stat } from "@/components/ui/primitives";
import { PillRail, SearchInput, Select } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { StageBadge } from "@/components/hr/badges";
import { ScorePill } from "@/components/hr/Score";

type Filter = HrApplicationStage | "all" | "live";

export default function ApplicationsPage() {
  return (
    <HrOnly>
      {/* useSearchParams needs a Suspense boundary above it or the whole route
          opts out of static rendering and Next says so at build time. */}
      <Suspense fallback={<RowsSkeleton rows={6} />}>
        <Applications />
      </Suspense>
    </HrOnly>
  );
}

/**
 * The pile of candidates.
 *
 * Ordered highest scoring first by the backend, and that order is worth
 * treating with suspicion in the UI as well as in the docstring that produces
 * it: a form scores what it can measure, which is never the whole of a person.
 * So the score is a badge beside the name rather than a rank number in front
 * of it, and nothing here sorts, groups or hides on it.
 */
function Applications() {
  const params = useSearchParams();
  const openingFromUrl = params.get("opening_id") ?? "";

  const [opening, setOpening] = useState(openingFromUrl);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const openings = useSWR<HrOpeningSummaryOut[]>("/hr/openings", { revalidateOnFocus: false });
  const key = withQuery("/hr/applications", {
    opening_id: opening || undefined,
    // "live" is not a backend stage — it means "still being considered", which
    // is the absence of the three closed stages rather than a value. Filtered
    // client-side because asking the API four times and merging would be a
    // worse answer to the same question.
    stage: filter === "all" || filter === "live" ? undefined : filter,
  });
  const applications = useSWR<HrApplicationOut[]>(key);

  const CLOSED: HrApplicationStage[] = ["hired", "rejected", "withdrawn"];
  const rows = (applications.data ?? [])
    .filter((a) => (filter === "live" ? !CLOSED.includes(a.stage) : true))
    .filter((a) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        a.candidate_name.toLowerCase().includes(q) ||
        a.candidate_email.toLowerCase().includes(q) ||
        (a.opening_title ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Hiring"
        title="Applications"
        count={applications.data ? `${rows.length}` : undefined}
        lead="Highest scoring first. A starting point for reading a pile, not a ranking to act on."
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everything" },
            { value: "live", label: "Still in play" },
            { value: "new", label: "New" },
            { value: "shortlisted", label: "Shortlisted" },
            { value: "interviewed", label: "Interviewed" },
            { value: "offered", label: "Offered" },
            { value: "hired", label: "Hired" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <Select
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          className="w-56"
          aria-label="Opening"
        >
          <option value="">Every opening</option>
          {(openings.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </Select>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, email or role"
          className="min-w-[200px] flex-1"
        />
      </div>

      {rows.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(rows.length)} label="in this view" />
          <Stat
            value={num(rows.filter((a) => a.stage === "new").length)}
            label="nobody has looked at"
            tone="accent"
          />
          <Stat
            value={num(rows.filter((a) => a.attachments.length > 0).length)}
            label="with a file attached"
          />
        </Panel>
      )}

      {applications.error ? (
        <ErrorState error={applications.error} onRetry={() => applications.mutate()} />
      ) : applications.isLoading && !applications.data ? (
        <RowsSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Empty
          icon={UserSearch}
          title={search || filter !== "all" || opening ? "Nothing matches" : "No applications yet"}
          body={
            search || filter !== "all" || opening
              ? "Nothing in this filter. Applications arrive through an opening's share link."
              : "Candidates appear here the moment they submit a form. Post an opening to get a link to send them."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((application) => (
            <li key={application.id}>
              <Link href={`/hr/applications/${application.id}`} className="block">
                <Panel className="flex flex-wrap items-center gap-4 p-4 transition hover:bg-panel-2">
                  <Avatar name={application.candidate_name} seed={application.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {application.candidate_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-3">
                      {application.candidate_email}
                      {application.opening_title ? ` · ${application.opening_title}` : ""}
                    </p>
                  </div>
                  {application.attachments.length > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-4"
                      title={application.attachments.map((f) => f.file_name).join(", ")}
                    >
                      <Paperclip className="size-3.5" />
                      {application.attachments.length}
                    </span>
                  )}
                  <span className="shrink-0 text-[11.5px] text-ink-4">
                    {relative(application.submitted_at)}
                  </span>
                  <ScorePill percent={application.score_percent} />
                  <StageBadge stage={application.stage} />
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {openings.error && (
        <InlineNotice tone="warn">
          The opening filter could not be loaded, so it lists nothing. The applications above
          are unaffected.
        </InlineNotice>
      )}
    </div>
  );
}
