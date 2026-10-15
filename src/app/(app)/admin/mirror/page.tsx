"use client";

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { MirrorStatusOut, StandingOut, TeamOut } from "@/lib/types";
import { Avatar, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { Button, Select } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";

/**
 * The local copy of the Proposals list, and who is next in line.
 *
 * What was left of the mail intake screen when its mailbox and its sorting
 * were removed (2026-10-14): the copy that the workload, follow-ups, Ariba and
 * the quote pages read instead of SharePoint, and the live ranking computed
 * from it. Nothing here writes to the Proposals list.
 */
export default function MirrorPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Proposals sync" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="The copy of the Proposals list and the live ranking are a super admin's tools, and the API enforces that too."
        />
      </>
    );
  }
  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Proposals sync"
        lead="A local copy of the Proposals list, kept current automatically, and the ranking of who gets the next task."
      />
      <div className="grid gap-3.5 xl:grid-cols-2">
        <Mirror />
        <Standing />
      </div>
    </>
  );
}

function Mirror() {
  const { data, error, mutate } = useSWR<MirrorStatusOut>("/intake/mirror", {
    revalidateOnFocus: false,
  });

  const sync = useAction(async () => {
    await api.post<MirrorStatusOut>("/intake/mirror/sync");
    await mutate();
  });

  return (
    <Panel className="p-5">
      <PanelHead
        title="Proposals mirror"
        hint="A local copy of the Proposals list, refreshed automatically. Nothing is written back to it."
        action={
          <Button size="sm" icon={RefreshCw} loading={sync.pending} onClick={() => void sync.run()}>
            Sync now
          </Button>
        }
      />

      {error ? (
        <div className="mt-4">
          <ErrorState error={error} onRetry={() => mutate()} />
        </div>
      ) : !data ? (
        <PanelSkeleton lines={3} className="mt-4 bg-transparent shadow-none" />
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatBox label="Rows held" value={num(data.rows)} className="bg-panel-2" />
            <StatBox
              label="Last sync"
              value={data.last_sync_at ? relative(data.last_sync_at) : "never"}
              className="bg-panel-2"
            />
          </div>

          <dl className="space-y-1 text-[11.5px]">
            <Line label="Took" value={`${num(data.duration_ms)} ms`} />
            <Line label="Rows read" value={num(data.rows_read)} />
            <Line label="Changed" value={num(data.rows_changed)} />
            <Line
              label="Instant updates from SharePoint"
              value={
                data.subscription_expires_at
                  ? `on, until ${relative(data.subscription_expires_at)}`
                  : "off — refreshed on the timer"
              }
            />
          </dl>

          {data.last_error && (
            <p className="text-[11.5px] leading-relaxed text-danger">{data.last_error}</p>
          )}
          {sync.error && <p className="text-[11.5px] text-danger">{sync.error}</p>}
        </div>
      )}
    </Panel>
  );
}

/**
 * Who gets the next task. A stored ranking rather than something computed on
 * demand. Rank 1 is next. Everybody's reason is on the row, because a queue
 * position nobody can decompose is one nobody will accept.
 */
function Standing() {
  const [team, setTeam] = useState("");
  const teams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });
  const { data, error, mutate } = useSWR<StandingOut[]>(
    withQuery("/intake/standing", { team: team || undefined }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const queue = (data ?? []).filter((row) => row.rank > 0);
  const excluded = (data ?? []).filter((row) => row.rank === 0);

  return (
    <Panel className="p-5">
      <PanelHead
        title="Who is next in line"
        count={queue.length || undefined}
        hint={data?.[0] ? `computed ${relative(data[0].computed_at)}` : undefined}
        action={
          <Select
            value={team}
            onChange={(event) => setTeam(event.target.value)}
            className="h-8 w-40 text-[12px]"
          >
            <option value="">Everybody</option>
            {(teams.data ?? [])
              .filter((entry) => !entry.archived_at)
              .map((entry) => (
                <option key={entry.id} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
          </Select>
        }
      />

      {error ? (
        <div className="mt-4">
          <ErrorState error={error} onRetry={() => mutate()} />
        </div>
      ) : !data ? (
        <PanelSkeleton lines={4} className="mt-4 bg-transparent shadow-none" />
      ) : queue.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-ink-4">
          Nobody is in the queue yet. Press Sync now — until the Proposals list has been
          copied across once, there is nobody to rank.
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {queue.slice(0, 8).map((person) => (
            <li
              key={person.user_id}
              className="flex items-center gap-2.5 rounded-[11px] bg-panel-2 px-3 py-2"
            >
              <span
                className={
                  "tnum grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold " +
                  (person.rank === 1 ? "bg-accent text-accent-ink" : "bg-panel-3 text-ink-3")
                }
              >
                {person.rank}
              </span>
              <Avatar name={person.display_name} seed={person.user_id} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">
                  {person.display_name}
                </span>
                {person.reason && (
                  <span className="block truncate text-[11px] text-ink-4" title={person.reason}>
                    {person.reason}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-[11px] text-ink-4">
                <span className="tnum block text-ink-2">{num(person.open_tasks)} open</span>
                {person.overdue_tasks > 0 && (
                  <span className="tnum block text-danger">
                    {num(person.overdue_tasks)} overdue
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {excluded.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
          {excluded.length} {excluded.length === 1 ? "person is" : "people are"} being skipped:{" "}
          {excluded.slice(0, 3).map((row) => row.excluded_reason ?? "not eligible").join("; ")}
          {excluded.length > 3 ? "…" : "."}
        </p>
      )}
    </Panel>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <dt className="min-w-0 flex-1 truncate text-ink-4">{label}</dt>
      <dd className="shrink-0 text-ink-2">{value}</dd>
    </div>
  );
}
