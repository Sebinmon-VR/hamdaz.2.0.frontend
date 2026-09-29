"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlarmClock, Settings2 } from "lucide-react";
import { withQuery } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { FollowupOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { LinkButton, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { FollowupStatusBadge, uaeDateTime } from "@/components/followups/FollowupBits";
import { DueToday } from "@/components/followups/DueToday";

/**
 * Tasks that went past their due date, and the reasons given.
 *
 * *Mine* is what everybody sees: the questions sent to them. *Team* appears
 * for the managers and leads of a team — the reasons their people gave, which
 * is who the reasons are for. The settings are their own page, /admin/followups,
 * for a super admin — what is watched decides who gets mailed, and that is not a
 * team's call to make.
 */
export default function FollowupsPage() {
  const session = useSession();
  const overseen = session.teams.filter(
    (t) =>
      !t.team.archived_at &&
      (session.roles.is_admin ||
        t.role_keys.includes("team_manager") ||
        t.role_keys.includes("team_lead")),
  );
  const [view, setView] = useState<string>("mine");
  const teamSlug = view.startsWith("team:") ? view.slice(5) : null;

  const key = teamSlug ? withQuery("/followups/team", { team: teamSlug }) : "/followups/mine";
  const { data, error, isLoading, mutate } = useSWR<FollowupOut[]>(key, {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Proposals"
        title="Overdue tasks"
        lead="Tasks that went past their due date without the bid being submitted, and why."
        actions={
          session.roles.is_super_admin ? (
            <LinkButton href="/admin/followups" icon={Settings2}>
              Settings
            </LinkButton>
          ) : undefined
        }
      />

      {/* Today's dues with a live countdown: the team's for its managers and
          leads, the viewer's own for everybody else. Follows the team picked
          below; on "Sent to me" it is the watched team. */}
      <DueToday team={teamSlug} />

      {overseen.length > 0 && (
        <PillRail
          value={view}
          onChange={setView}
          options={[
            { value: "mine", label: "Sent to me" },
            ...overseen.map((t) => ({ value: `team:${t.team.slug}`, label: t.team.name })),
          ]}
        />
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : !data || data.length === 0 ? (
        <Empty
          icon={AlarmClock}
          title="Nothing overdue"
          body={
            teamSlug
              ? "Nobody in this team has been asked about a late task."
              : "You have not been asked about any late task."
          }
        />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={row.id}>
              <Link href={`/followups/${row.id}`}>
                <Panel className="flex flex-wrap items-center gap-3 p-3 transition hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{row.task_title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-4">
                      {[
                        teamSlug ? (row.assignee_name ?? row.assignee_email) : null,
                        `due ${uaeDateTime(row.due_at)}`,
                        row.status_at_ask ?? "not submitted",
                        row.reason ? `“${row.reason}”` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {row.carried_over && (
                    <Badge tone="warn" title="Due after the previous day's ask time, so asked in the next day's list">
                      Carried over
                    </Badge>
                  )}
                  <span className="text-[11.5px] text-ink-4">asked {relative(row.created_at)}</span>
                  <Badge
                    tone={row.asked_at ? "info" : "warn"}
                    title={row.asked_at ? `Emailed ${dateTime(row.asked_at)}` : (row.ask_error ?? "Not emailed")}
                  >
                    {row.asked_at ? "Mailed" : "Mail failed"}
                  </Badge>
                  {row.status === "answered" && (
                    <Badge
                      tone={row.forwarded_at ? "positive" : "warn"}
                      title={row.forwarded_at ? `Sent to the managers ${dateTime(row.forwarded_at)}` : (row.forward_error ?? "Not sent to the managers")}
                    >
                      {row.forwarded_at ? "Managers told" : "Managers not mailed"}
                    </Badge>
                  )}
                  <FollowupStatusBadge status={row.status} />
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
