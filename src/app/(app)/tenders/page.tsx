"use client";

import { useState } from "react";
import useSWR from "swr";
import { Gavel, Settings2, TriangleAlert } from "lucide-react";
import { withQuery } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AribaEventOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { LinkButton, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";
import { Countdown } from "@/components/ui/Countdown";

type View = "Open" | "Closed" | "all";

/**
 * Tenders read from the Ariba supplier portal: title, due date, status.
 *
 * The list is the backend's copy, never the portal itself — the portal is
 * visited only when a new tender reaches the Proposals list. What the reader
 * last did, and its switch, are on /admin/ariba for a super admin.
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
        actions={
          session.roles.is_super_admin ? (
            <LinkButton href="/admin/ariba" icon={Settings2}>
              Reader settings
            </LinkButton>
          ) : undefined
        }
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
