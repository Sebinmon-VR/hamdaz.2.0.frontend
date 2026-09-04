"use client";

import clsx from "clsx";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ExternalLink, FileText, ListChecks, UserX } from "lucide-react";
import { withQuery } from "@/lib/api";
import { date, num } from "@/lib/format";
import type { QuotableTaskOut, QuotableTasksOut } from "@/lib/types";
import { Badge, Panel, Stat } from "@/components/ui/primitives";
import { Button, SearchInput, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { DueChip } from "@/components/widgets";
import { QuoteStatusBadge } from "@/components/quotes/QuoteRequestBits";
import { RaiseQuoteDialog } from "@/components/quotes/RaiseQuote";

/**
 * The enquiries this person could quote for, and what has already been raised.
 *
 * This is the entry point to the whole module: a quote exists against an
 * enquiry, so the enquiry is what you pick first. The list comes from quoting
 * rather than from proposals because the join matters — each row has to know
 * whether a quote already exists against it, and stitching two calls together
 * here would be both slower and liable to disagree with itself.
 *
 * The rule the list enforces is that one enquiry gets one quote. A row that
 * already has one shows it and links to it; it does not offer to raise
 * another. Two quotes against the same bid is not a tidy-up job — it is two
 * different numbers reaching a customer with the same reference on them.
 *
 * The order is the server's, by bid closing date. It is deliberately not
 * re-sorted here: BCD is the date that decides whether a bid is still worth
 * working on, and due date is not a stand-in for it.
 */
export function EnquiryPicker() {
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [raising, setRaising] = useState<QuotableTaskOut | null>(null);

  const { data, error, isLoading, mutate } = useSWR<QuotableTasksOut>(
    withQuery("/quote-requests/tasks", { open_only: openOnly }),
    { revalidateOnFocus: false },
  );

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <RowsSkeleton rows={6} />;
  if (!data) return null;

  // Not the same as an empty list, and must not read like one: this person has
  // no presence on the SharePoint site, so nothing could be assigned to them
  // even in principle. Telling them "nothing to do" would be a lie.
  if (!data.in_sharepoint) {
    return (
      <Empty
        icon={UserX}
        title="You are not on the Proposals list"
        body={`${data.email} has no presence on that SharePoint site, so no enquiry can be assigned to you and there is nothing here to quote for. Whoever maintains the Proposals list needs to add you before this screen can show anything.`}
      />
    );
  }

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? data.tasks.filter((task) =>
        [task.title, task.end_user, task.quote_no, task.status, task.quote_reference]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle)),
      )
    : data.tasks;

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
        <Stat value={num(data.tasks.length)} label={openOnly ? "open" : "listed"} />
        <Stat value={num(data.quoted_count)} label="already quoted" />
        <Stat value={num(data.total)} label="assigned in total" />
        <div className="ml-auto">
          <Toggle
            checked={openOnly}
            onChange={setOpenOnly}
            label="Open only"
            hint={
              openOnly
                ? `Showing ${data.tasks.length} of ${data.total} — completed ones are hidden.`
                : "Completed enquiries included."
            }
          />
        </div>
      </Panel>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search title, end user, quote number"
        className="w-full max-w-sm"
      />

      {rows.length === 0 ? (
        <Empty
          icon={ListChecks}
          title={needle ? "Nothing matches that" : "Nothing assigned to you"}
          body={
            needle
              ? "No enquiry matches that search."
              : openOnly
                ? "You have no open enquiries. Turn off “open only” to see the finished ones."
                : "Nothing on the Proposals list is assigned to you."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((task) => (
            <EnquiryRow key={task.id} task={task} onRaise={() => setRaising(task)} />
          ))}
        </ul>
      )}

      <RaiseQuoteDialog
        task={raising}
        onClose={() => setRaising(null)}
        onRaised={() => mutate()}
      />
    </div>
  );
}

/* ── one enquiry ─────────────────────────────────────────────────────── */

function EnquiryRow({ task, onRaise }: { task: QuotableTaskOut; onRaise: () => void }) {
  const quoted = task.quote_request_id !== null;

  const body = (
    <Panel
      className={clsx(
        "p-3 transition",
        quoted ? "hover:border-line-strong" : "border-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium">{task.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-4">
            {[task.end_user, task.current_type, task.submission_status, task.quote_no]
              .filter(Boolean)
              .join(" · ") || "No end user recorded"}
          </p>
        </div>

        {task.status && <Badge>{task.status}</Badge>}
        {task.priority && (
          <Badge tone={/high|urgent/i.test(task.priority) ? "danger" : "neutral"}>
            {task.priority}
          </Badge>
        )}
        <DueChip due={task.deadline ?? task.bid_closing_date ?? task.due_date} />

        {/* The row's whole purpose: start the work, or go to where it already
            is. Never both, and never a second quote against one enquiry. */}
        {quoted ? (
          <span className="flex shrink-0 items-center gap-2">
            {task.quote_status && <QuoteStatusBadge status={task.quote_status} />}
            <span className="text-[12px] font-medium text-ink-2">
              {task.quote_reference ?? task.quote_title ?? "Quote raised"}
            </span>
          </span>
        ) : (
          <Button
            size="sm"
            icon={FileText}
            onClick={(event) => {
              event.preventDefault();
              onRaise();
            }}
          >
            Raise a quote
          </Button>
        )}
      </div>

      {task.bid_closing_date && (
        <p className="mt-1.5 text-[11px] text-ink-4">
          Bid closes {date(task.bid_closing_date)}
          {task.web_url && (
            <>
              {" · "}
              <a
                href={task.web_url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink-2"
              >
                <ExternalLink className="size-3" />
                SharePoint
              </a>
            </>
          )}
        </p>
      )}
    </Panel>
  );

  // Only a quoted row navigates. An unquoted one has a button that does the
  // navigating itself, and wrapping it in a link would make the whole row a
  // target for something it cannot do yet.
  return (
    <li>
      {quoted ? (
        <Link href={`/quote-requests/${task.quote_request_id}`} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
