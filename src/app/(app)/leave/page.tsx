"use client";

import useSWR from "swr";
import { CalendarDays, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { LeaveRequestOut, LeaveSettingsOut, LeaveSummaryOut } from "@/lib/types";
import { Panel, PageHead, PanelHead, Stat } from "@/components/ui/primitives";
import { Button, LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { LeaveStatusBadge, LeaveTypeBadge } from "@/components/leave/badges";

export default function MyLeavePage() {
  const summary = useSWR<LeaveSummaryOut>("/leave/summary/me");
  const requests = useSWR<LeaveRequestOut[]>("/leave/requests/me");
  const settings = useSWR<LeaveSettingsOut>("/leave/settings");

  const cancel = useAction(async (id: string) => api.post(`/leave/requests/${id}/cancel`));

  const rows = requests.data ?? [];
  const today = new Date().setHours(0, 0, 0, 0);

  // The single request that is actually coming up next. It is the only one
  // that gets the pink treatment — a list where several rows are highlighted
  // highlights nothing.
  const nextUp = [...rows]
    .filter(
      (r) =>
        new Date(r.start_date).setHours(0, 0, 0, 0) >= today &&
        (r.status === "pending" || r.status === "approved"),
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Leave"
        title="My leave"
        lead={
          settings.data?.auto_decide
            ? `Requests are decided immediately against a limit of ${settings.data.max_concurrent} people off at once. HR only steps in for the ones that clash.`
            : "Requests wait for HR to decide."
        }
        actions={
          <LinkButton href="/leave/request" variant="accent" icon={Plus}>
            Request leave
          </LinkButton>
        }
      />

      {cancel.error && <InlineNotice tone="danger">{cancel.error}</InlineNotice>}

      {summary.data && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(summary.data.days_approved)} label="days approved" />
          <Stat
            value={num(summary.data.pending)}
            label="awaiting a decision"
            tone="warn"
            delta={summary.data.pending > 0 ? "open" : undefined}
          />
          <Stat value={num(summary.data.approved)} label="approved requests" />
          <Stat value={num(summary.data.rejected)} label="rejected" tone="danger" />
          {settings.data && (
            <div className="ml-auto max-w-xs text-[12.5px] leading-relaxed text-ink-3">
              At most <strong>{settings.data.max_concurrent}</strong> people may be off at
              once, counted across the {settings.data.limit_scope}. A single request can
              run to {settings.data.max_days_per_request} days.
            </div>
          )}
        </Panel>
      )}

      <Panel className="p-4">
        <PanelHead title="My requests" count={rows.length} />

        {requests.error ? (
          <ErrorState error={requests.error} onRetry={() => requests.mutate()} />
        ) : requests.isLoading && !requests.data ? (
          <RowsSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <Empty
            icon={CalendarDays}
            title="No requests yet"
            body="Time off you book will show up here, along with what was decided and why."
            className="mt-5"
            action={
              <LinkButton href="/leave/request" variant="accent" icon={Plus}>
                Request leave
              </LinkButton>
            }
          />
        ) : (
          <ul className="mt-3 space-y-1.5">
            {rows.map((request) => {
              const upcoming =
                new Date(request.start_date).setHours(0, 0, 0, 0) >= today &&
                (request.status === "pending" || request.status === "approved");
              return (
                <li key={request.id}>
                  <Panel
                    tone={request.id === nextUp?.id ? "highlight" : "inset"}
                    className="p-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium">
                          {date(request.start_date)} – {date(request.end_date)}
                        </p>
                        <p className="mt-0.5 text-[12px] opacity-70">
                          {request.days} {request.days === 1 ? "day" : "days"} ·
                          requested {relative(request.created_at)}
                        </p>
                      </div>
                      <LeaveTypeBadge type={request.leave_type} />
                      <LeaveStatusBadge status={request.status} />
                      {(request.status === "pending" || upcoming) &&
                        request.status !== "cancelled" &&
                        request.status !== "rejected" && (
                          <Button
                            size="sm"
                            icon={X}
                            loading={cancel.pending}
                            onClick={async () => {
                              if ((await cancel.run(request.id)) !== undefined) {
                                requests.mutate();
                                summary.mutate();
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                    </div>

                    {request.reason && (
                      <p className="mt-3 text-[13px] leading-relaxed opacity-80">
                        {request.reason}
                      </p>
                    )}

                    {request.decided_at && (
                      <p className="mt-3 border-t border-current/10 pt-3 text-[12px] opacity-70">
                        {humanise(request.status)} by{" "}
                        {request.decided_by === "system"
                          ? "the concurrency rule"
                          : (request.decided_by ?? "HR")}{" "}
                        {relative(request.decided_at)}
                        {request.decision_note ? ` — ${request.decision_note}` : ""}
                        {request.conflicting_count !== null
                          ? ` (${request.conflicting_count} others off on the busiest day)`
                          : ""}
                      </p>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
