"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pause, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { AribaBcdOut, AribaReaderStatusOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";

/* ── the reader, for a super admin ───────────────────────────────────── */

export function ReaderPanel({ onVisited }: { onVisited?: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<AribaReaderStatusOut>("/ariba/status", {
    revalidateOnFocus: false,
  });
  const [result, setResult] = useState<string | null>(null);
  const visit = useAction(async () => {
    const out = await api.post<{ result: string }>("/ariba/visit");
    setResult(out.result);
    await mutate();
    onVisited?.();
  });
  const toggle = useAction(async (stop: boolean) => {
    const out = await api.post<{ result: string }>(stop ? "/ariba/stop" : "/ariba/start");
    setResult(out.result);
    await mutate();
  });
  const resume = useAction(async () => {
    const out = await api.post<{ result: string }>("/ariba/resume");
    setResult(out.result);
    await mutate();
  });

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead
        title="Ariba reader"
        hint={data ? (data.stopped_at ? "Stopped" : "Running") : undefined}
        action={
          <>
            {data && (
              <Button
                icon={data.stopped_at ? Play : Pause}
                variant={data.stopped_at ? "accent" : "danger"}
                loading={toggle.pending}
                onClick={() => {
                  const stop = !data.stopped_at;
                  if (
                    stop &&
                    !window.confirm(
                      "Stop the Ariba reader? No visits to Ariba and no BCD corrections until it is started again.",
                    )
                  )
                    return;
                  toggle.run(stop);
                }}
              >
                {data.stopped_at ? "Start reader" : "Stop reader"}
              </Button>
            )}
            <Button
              icon={RefreshCw}
              loading={visit.pending}
              disabled={!!data?.stopped_at}
              onClick={() => visit.run()}
            >
              Visit now
            </Button>
          </>
        }
      />
      {data?.stopped_at && (
        <InlineNotice tone="warn">
          Stopped by {data.stopped_by ?? "a super admin"} {uaeDateTime(data.stopped_at)}. Nothing
          visits Ariba and no BCD is corrected until it is started again. Tenders already read stay
          on the Tenders page; new ones are caught up on when it starts.
        </InlineNotice>
      )}
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={3} />
      ) : data ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
          <Fact label="Last visit" value={data.last_visit_at ? relative(data.last_visit_at) : "Never"} />
          <Fact label="Last found" value={data.last_result ?? "—"} />
          <Fact label="Last sign-in" value={data.last_login_at ? relative(data.last_login_at) : "Never"} />
          <Fact label="Visits today" value={String(data.visits_today)} />
          <Fact label="Sign-ins today" value={`${data.logins_today} of ${data.max_logins_per_day}`} />
          <Fact label="Saved session" value={data.has_session ? "Yes, reused" : "None"} />
        </dl>
      ) : null}
      {data?.blocked_at && (
        <InlineNotice tone="danger">
          <p className="font-semibold">
            Sign-in failed {uaeDateTime(data.blocked_at)} — the reader has stopped signing in.
          </p>
          <p className="mt-0.5">{data.blocked_reason}</p>
          <p className="mt-1 opacity-80">
            It will not try again on its own; the super admins were emailed. Sign in to Ariba yourself
            to see what it wants, update the password on the server if it changed, then resume.
          </p>
          <Button
            className="mt-2"
            variant="danger"
            loading={resume.pending}
            onClick={() => resume.run()}
          >
            Resume sign-in
          </Button>
        </InlineNotice>
      )}
      {resume.error && <InlineNotice tone="danger">{resume.error}</InlineNotice>}
      {toggle.error && <InlineNotice tone="danger">{toggle.error}</InlineNotice>}
      {data?.last_error && !data.blocked_at && (
        <InlineNotice tone="warn">Last visit failed: {data.last_error}</InlineNotice>
      )}
      {visit.error && <InlineNotice tone="danger">{visit.error}</InlineNotice>}
      {result && <InlineNotice tone="info">{result}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        The reader visits Ariba only when a new tender reaches the Proposals list — at most once
        every 30 minutes and 12 times a day, and signs in at most a few times a day — most visits
        reuse the saved session. Visit now is held to the same limits. One reader serves everyone.
      </p>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-4">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  );
}

/* ── BCD against Ariba, for a super admin ────────────────────────────── */

/**
 * SharePoint holds BCD as the UAE time typed into a site set to another zone,
 * so the value is read back in that zone — which is what the list shows.
 */
function asListShows(iso: string | null, zone: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });
}

export function BcdPanel() {
  const { data, error, isLoading, mutate } = useSWR<AribaBcdOut>("/ariba/bcd", {
    revalidateOnFocus: false,
  });
  const [result, setResult] = useState<string | null>(null);
  const check = useAction(async () => {
    const out = await api.post<{ result: string }>("/ariba/bcd/check");
    setResult(out.result);
    await mutate();
  });

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead
        title="BCD against Ariba"
        hint={data ? (data.writing ? "Correcting the list" : "Preview only — nothing is written") : undefined}
        action={
          <Button icon={RefreshCw} loading={check.pending} onClick={() => check.run()}>
            Check now
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={3} />
      ) : !data || data.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">
          No differences recorded. Every matched Proposals row agrees with Ariba, or no check has run yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] bg-panel-2 px-3 py-2 text-[12.5px]"
            >
              <span className="min-w-0 flex-1 truncate" title={r.task_title}>
                <span className="font-medium">{r.reference}</span>{" "}
                <span className="text-ink-4">{r.task_title}</span>
              </span>
              <span className="tnum">
                <span className="text-ink-4 line-through">{asListShows(r.old_bcd, data.site_timezone)}</span>
                {" → "}
                <span className="font-medium">{asListShows(r.new_bcd, data.site_timezone)}</span>
              </span>
              {r.applied ? (
                <Badge tone="positive" title={`Written ${relative(r.created_at)}`}>
                  Corrected
                </Badge>
              ) : r.error ? (
                <Badge tone="warn" title={r.error}>
                  Not changed
                </Badge>
              ) : (
                <Badge tone="neutral">Would correct</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {check.error && <InlineNotice tone="danger">{check.error}</InlineNotice>}
      {result && <InlineNotice tone="info">{result}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        Times are UAE time, as the BCD column shows them. Checked after every Ariba visit; only the BCD
        column of a row whose time differs is changed, and only while writing is turned on.
      </p>
    </Panel>
  );
}
