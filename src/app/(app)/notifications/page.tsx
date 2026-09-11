"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { dateTime, humanise, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { markRead, useNotifications, useUnread } from "@/lib/notifications";
import type { NotificationOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Button, PillRail } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

/**
 * What you have been told.
 *
 * Most of what lands here is raised by work nobody watched happen — a tender
 * arriving in the watched mailbox and becoming a task with your name on it, a
 * report being filed by somebody who reports to you. That is the whole reason
 * this page exists: those things are decided by a timer, and without somewhere
 * for them to surface, being given work would be something you found out about
 * by opening SharePoint.
 *
 * **Everyone sees their own and nobody else's.** Not by a check on this screen
 * — by there being no route that takes a user id at all.
 *
 * Reading one marks it read. Deliberately: the alternative is a tick beside
 * every row that people either click religiously or never, and neither produces
 * a number on the bell anybody trusts.
 */
export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, error, isLoading, mutate } = useNotifications(unreadOnly);
  const bell = useUnread();

  const clear = useAction(async () => {
    await markRead();
    await Promise.all([mutate(), bell.refresh()]);
  });

  const open = useAction(async (notification: NotificationOut) => {
    if (notification.read_at) return;
    await markRead([notification.id]);
    await Promise.all([mutate(), bell.refresh()]);
  });

  const rows = data?.notifications ?? [];

  return (
    <>
      <PageHead
        eyebrow="You"
        title="Notifications"
        count={data ? `${data.unread} unread` : undefined}
        actions={
          <>
            <PillRail
              value={unreadOnly ? "unread" : "all"}
              onChange={(value) => setUnreadOnly(value === "unread")}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: data?.unread },
              ]}
            />
            <Button
              icon={CheckCheck}
              loading={clear.pending}
              disabled={!data || data.unread === 0}
              onClick={() => void clear.run()}
            >
              Mark all read
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <Empty
          icon={Bell}
          title={unreadOnly ? "Nothing unread" : "Nothing yet"}
          body="Work assigned to you by the intake, and reports filed by people you oversee, arrive here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((notification) => {
            const unread = notification.read_at === null;
            const body = (
              <div
                className={
                  "flex gap-3 rounded-[16px] px-4 py-3 transition " +
                  (unread ? "bg-panel ring-1 ring-accent/25" : "bg-panel")
                }
              >
                {/* A dot rather than a bold row: bold is how this app marks a
                    selection, and two meanings for one weight is how a list
                    stops being readable at a glance. */}
                <span
                  aria-hidden
                  className={
                    "mt-1.5 size-2 shrink-0 rounded-full " +
                    (unread ? "bg-accent" : "bg-transparent")
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {notification.title}
                    </p>
                    <span
                      className="shrink-0 text-[11px] text-ink-4"
                      title={dateTime(notification.created_at)}
                    >
                      {relative(notification.created_at)}
                    </span>
                  </div>
                  {notification.body && (
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
                      {notification.body}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{humanise(notification.kind)}</Badge>
                    {notification.source && (
                      <span className="text-[11px] text-ink-4">
                        from {humanise(notification.source)}
                      </span>
                    )}
                    {notification.sent_to_teams && (
                      <Badge tone="info">Also in Teams</Badge>
                    )}
                    {!unread && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
                        <Check className="size-3" strokeWidth={2.4} />
                        read
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            // The link is a path within the app rather than an absolute URL, so
            // it survives the frontend moving. One without a link is still worth
            // showing — plenty of them are simply news.
            return notification.link ? (
              <Link
                key={notification.id}
                href={notification.link}
                onClick={() => void open.run(notification)}
                className="block"
              >
                {body}
              </Link>
            ) : (
              <button
                key={notification.id}
                onClick={() => void open.run(notification)}
                className="block w-full text-left"
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
