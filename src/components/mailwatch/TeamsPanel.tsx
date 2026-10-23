"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Link2, Send, Unlink } from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { MailWatchTeamsOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { Toggle } from "@/components/ui/controls";
import { uaeDateTime } from "@/components/followups/FollowupBits";

const RETURN_ERRORS: Record<string, string> = {
  sign_in_failed: "Microsoft sign-in did not complete. Try connecting again.",
  permission_not_granted: "The account did not grant permission to send channel messages.",
};

/**
 * Negotiation updates to Teams, for a super admin. Graph lets no app post to a
 * channel by itself, so a person connects their account once and posts appear
 * as them. The channel is fixed in the backend's code — the test channel.
 */
export function TeamsPanel() {
  const { data, error, isLoading, mutate } = useSWR<MailWatchTeamsOut>("/mailwatch/teams", {
    revalidateOnFocus: false,
  });
  const [notice, setNotice] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  // Microsoft sends the browser back here with ?teams=connected or ?teams_error=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("teams") === "connected") setNotice({ tone: "info", text: "Teams account connected." });
    const failed = params.get("teams_error");
    if (failed) setNotice({ tone: "danger", text: RETURN_ERRORS[failed] ?? `Connecting failed: ${failed}` });
    if (params.has("teams") || params.has("teams_error")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const toggle = useAction(async (on: boolean) => {
    const out = await api.patch<MailWatchTeamsOut>("/mailwatch/teams", { post_negotiations: on });
    await mutate(out, { revalidate: false });
  });
  const test = useAction(async () => {
    const out = await api.post<MailWatchTeamsOut>("/mailwatch/teams/test");
    await mutate(out, { revalidate: false });
    setNotice({ tone: "info", text: `Test message posted to ${out.team_name} → ${out.channel_name}.` });
  });
  const disconnect = useAction(async () => {
    const out = await api.del<MailWatchTeamsOut>("/mailwatch/teams");
    await mutate(out, { revalidate: false });
  });

  const connectHref = apiUrl("/mailwatch/teams/connect");

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead
        title="Negotiation updates to Teams"
        hint={
          data
            ? data.connected
              ? data.post_negotiations
                ? "On"
                : "Connected · off"
              : "Not connected"
            : undefined
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={3} />
      ) : data ? (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
            <Fact
              label="Posts as"
              value={data.connected ? `${data.account_name ?? ""} (${data.account_email ?? ""})` : "Nobody connected"}
            />
            <Fact label="Channel" value={`${data.locked_team} → ${data.locked_channel} (fixed)`} />
            <Fact label="Connected" value={data.connected_at ? uaeDateTime(data.connected_at) : "—"} />
            <Fact label="Last post" value={data.last_used_at ? relative(data.last_used_at) : "Never"} />
            <Fact label="Mails posted" value={String(data.posted)} />
            <Fact label="Posting from" value={data.posting_from ? uaeDateTime(data.posting_from) : "—"} />
          </dl>

          {data.connected && (
            <Toggle
              checked={data.post_negotiations}
              disabled={toggle.pending}
              onChange={(on) => toggle.run(on)}
              label="Post each negotiation mail to the channel"
              hint="With the task, its assignee, status, quote number and BCD from SharePoint, and what the customer asks. Only mail arriving after it is switched on."
            />
          )}

          <div className="flex flex-wrap gap-2">
            <a href={connectHref}>
              <Button icon={Link2} variant={data.connected ? "outline" : "accent"} size="sm">
                {data.connected ? "Connect a different account" : "Connect my Teams account"}
              </Button>
            </a>
            {data.connected && (
              <>
                <Button size="sm" icon={Send} loading={test.pending} onClick={() => test.run()}>
                  Send test message
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Unlink}
                  loading={disconnect.pending}
                  onClick={() => {
                    if (window.confirm("Disconnect the Teams account? Nothing more is posted until one is connected.")) disconnect.run();
                  }}
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>
          {data.last_error && <InlineNotice tone="warn">Last error: {data.last_error}</InlineNotice>}
        </>
      ) : null}
      {[toggle, test, disconnect].map(
        (a, i) => a.error && <InlineNotice key={i} tone="danger">{a.error}</InlineNotice>,
      )}
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        Microsoft lets no app post to a channel on its own, so posts are sent as the connected account.
        The channel is fixed to the test channel in the app&apos;s code. Connecting asks only to send channel
        messages; the account must be a member of that team.
      </p>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-4">{label}</dt>
      <dd className="min-w-0 truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
