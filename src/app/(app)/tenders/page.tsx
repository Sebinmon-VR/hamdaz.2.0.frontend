"use client";

import { useState } from "react";
import useSWR from "swr";
import { Gavel, RefreshCw, TriangleAlert } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { AribaBcdOut, AribaEventOut, AribaReaderStatusOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton, RowsSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";
import { Countdown } from "@/components/ui/Countdown";

type View = "Open" | "Closed" | "all";

/**
 * Tenders read from the Ariba supplier portal: title, due date, status.
 *
 * The list is the backend's copy, never the portal itself — the portal is
 * visited only when a new tender reaches the Proposals list. A super admin
 * sees what the reader last did at the foot, and can ask for a visit now.
 */
export default function TendersPage() {
  const session = useSession();
  const [view, setView] = useState<View>("Open");
  const key = withQuery("/ariba/events", { status: view === "all" ? undefined : view });
  const { data, error, isLoading, mutate } = useSWR<AribaEventOut[]>(key, {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Proposals"
        title="Ariba tenders"
        count={data?.length}
        lead="Open events on the Ariba supplier portal, soonest due first."
      />

      <NotReceived rows={data} />

      <PillRail<View>
        value={view}
        onChange={setView}
        options={[
          { value: "Open", label: "Open" },
          { value: "Closed", label: "Closed" },
          { value: "all", label: "All" },
        ]}
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={6} />
      ) : !data || data.length === 0 ? (
        <Empty
          icon={Gavel}
          title={view === "Closed" ? "No closed tenders" : "No tenders yet"}
          body="Tenders appear here after the reader visits Ariba, which it does when a new tender reaches the Proposals list."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={row.doc_id}>
              <TenderRow row={row} />
            </li>
          ))}
        </ul>
      )}

      {session.roles.is_super_admin && <ReaderPanel onVisited={() => mutate()} />}
      {session.roles.is_super_admin && <BcdPanel />}
    </div>
  );
}

/**
 * The warning the page exists for: a task marked Submitted whose tender Ariba
 * shows no response for, while it is still open — time to find out why.
 */
function NotReceived({ rows }: { rows: AribaEventOut[] | undefined }) {
  const late = (rows ?? []).filter((r) => r.not_received);
  if (!late.length) return null;
  return (
    <InlineNotice tone="danger">
      <p className="font-semibold">
        {late.length === 1
          ? "1 tender is marked Submitted, but Ariba says not submitted"
          : `${late.length} tenders are marked Submitted, but Ariba says not submitted`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {late.map((r) => (
          <li key={r.doc_id}>
            {r.reference ?? r.doc_id} · {r.title} —{" "}
            {r.end_time ? `closes ${uaeDateTime(r.end_time)}` : "Ariba shows no end time"}
          </li>
        ))}
      </ul>
      <p className="mt-1 opacity-80">
        As of the last Ariba visit. Check the response was sent on Ariba before it closes.
      </p>
    </InlineNotice>
  );
}

function TenderRow({ row }: { row: AribaEventOut }) {
  const open = row.status === "Open";
  const passed = !!row.end_time && new Date(row.end_time).getTime() <= Date.now();
  return (
    <Panel
      className={
        row.not_received
          ? "flex flex-wrap items-center gap-3 p-3 ring-2 ring-danger"
          : "flex flex-wrap items-center gap-3 p-3"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium" title={row.title}>
          {row.title}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-ink-4">
          {[row.doc_id, row.reference, `due ${uaeDateTime(row.end_time)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {row.proposal_item_id ? (
        <Badge tone="info" title={row.proposal_title ?? undefined}>
          In Proposals
        </Badge>
      ) : (
        <Badge tone="neutral" title="No Proposals row carries this tender number">
          Not in Proposals
        </Badge>
      )}
      {row.not_received && (
        <Badge tone="danger" icon={TriangleAlert} title="The task says Submitted; Ariba's Participated column says No">
          Not submitted on Ariba
        </Badge>
      )}
      {row.participated !== null && !row.not_received && (
        <Badge
          tone={row.participated ? "positive" : "neutral"}
          title="Ariba's Participated column (Yes = submitted), as of the last visit"
        >
          {row.participated ? "Submitted on Ariba" : "Not submitted on Ariba"}
        </Badge>
      )}
      {open && !passed && <Countdown to={row.end_time} title={`Closes ${uaeDateTime(row.end_time)}`} />}
      {open && passed && <Badge tone="danger">Past due</Badge>}
      <Badge
        tone={open ? "positive" : "neutral"}
        title={open ? "Listed under Status: Open on Ariba — still taking responses" : "No longer open on Ariba — completed or pending selection"}
      >
        {open ? "Open on Ariba" : "Closed on Ariba"}
      </Badge>
    </Panel>
  );
}

/* ── the reader, for a super admin ───────────────────────────────────── */

function ReaderPanel({ onVisited }: { onVisited: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<AribaReaderStatusOut>("/ariba/status", {
    revalidateOnFocus: false,
  });
  const [result, setResult] = useState<string | null>(null);
  const visit = useAction(async () => {
    const out = await api.post<{ result: string }>("/ariba/visit");
    setResult(out.result);
    await mutate();
    onVisited();
  });

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead
        title="Ariba reader"
        action={
          <Button icon={RefreshCw} loading={visit.pending} onClick={() => visit.run()}>
            Visit now
          </Button>
        }
      />
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
          <Fact label="Saved session" value={data.has_session ? "Yes, reused" : "None"} />
        </dl>
      ) : null}
      {data?.paused_until && (
        <InlineNotice tone="danger">
          Sign-in was refused, so the reader will not sign in again until {uaeDateTime(data.paused_until)}.
          Check the Ariba login in the server settings.
        </InlineNotice>
      )}
      {data?.last_error && !data.paused_until && (
        <InlineNotice tone="warn">Last visit failed: {data.last_error}</InlineNotice>
      )}
      {visit.error && <InlineNotice tone="danger">{visit.error}</InlineNotice>}
      {result && <InlineNotice tone="info">{result}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        The reader visits Ariba only when a new tender reaches the Proposals list — at most once
        every 30 minutes and 12 times a day. Visit now is still held to the daily limit.
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

function BcdPanel() {
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
