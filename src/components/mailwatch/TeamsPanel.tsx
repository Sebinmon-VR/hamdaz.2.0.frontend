"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Link2, Send, Unlink } from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { MailWatchTeamsOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { Field, Select, Toggle } from "@/components/ui/controls";
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
  const assignToggle = useAction(async (on: boolean) => {
    const out = await api.patch<MailWatchTeamsOut>("/mailwatch/teams", { assign_new_tenders: on });
    await mutate(out, { revalidate: false });
  });
  const chooseList = useAction(async (task_list: MailWatchTeamsOut["task_list"]) => {
    const out = await api.patch<MailWatchTeamsOut>("/mailwatch/teams", { task_list });
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
        title="Teams: negotiations and new tenders"
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
            <Fact
              label="Channel"
              value={`${data.team_name ?? data.test_team} → ${data.channel_name ?? data.test_channel}${data.is_test_channel ? " (test)" : ""}`}
            />
            <Fact label="Connected" value={data.connected_at ? uaeDateTime(data.connected_at) : "—"} />
            <Fact label="Last post" value={data.last_used_at ? relative(data.last_used_at) : "Never"} />
            <Fact label="Mails posted" value={String(data.posted)} />
            <Fact label="Posting from" value={data.posting_from ? uaeDateTime(data.posting_from) : "—"} />
            <Fact label="Test tasks" value={String(data.test_tasks)} />
            <Fact label="Assigning from" value={data.assign_from ? uaeDateTime(data.assign_from) : "—"} />
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

          <Toggle
            checked={data.assign_new_tenders}
            disabled={assignToggle.pending}
            onChange={(on) => assignToggle.run(on)}
            label="Assign each new tender (testing: kept in the test list)"
            hint="A new tender goes to priority 1 of Presale; a later stage of a known tender (EOI → RFP) to whoever had it. The task is kept in the test list with the Proposals list's columns, not written to SharePoint, and its card goes to the test channel when an account is connected. Only mail arriving after it is switched on."
          />

          <Field
            label="Create each new tender's task in"
            hint={
              data.task_list === "real"
                ? "The real Proposals list: tasks appear there for the team, assigned."
                : data.task_list === "test"
                  ? "The Proposals Test list on the Test site — a copy of the real list's columns, for testing."
                  : "Nowhere: the task is kept in the app only (Test tasks tab)."
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-64">
                <Select
                  value={data.task_list}
                  disabled={chooseList.pending}
                  onChange={(e) => {
                    const next = e.target.value as MailWatchTeamsOut["task_list"];
                    if (
                      next === "real" &&
                      !window.confirm(
                        "Create new tenders' tasks in the REAL Proposals list? The team will see them there, assigned.",
                      )
                    )
                      return;
                    chooseList.run(next);
                  }}
                >
                  {data.task_lists.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.name}
                      {l.key === "test" ? " (Test site — testing)" : " (real list)"}
                    </option>
                  ))}
                  <option value="none">Nowhere — keep in the app only</option>
                </Select>
              </div>
              {data.task_lists
                .filter((l) => l.key === data.task_list)
                .map((l) => (
                  <a key={l.key} href={l.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent">
                    Open {l.name}
                  </a>
                ))}
            </div>
          </Field>
          <ChannelPicker data={data} onSaved={(out) => mutate(out, { revalidate: false })} />
          {!data.is_test_channel && (
            <InlineNotice tone="warn">
              Cards go to {data.team_name} → {data.channel_name}, a real channel — without the TESTING banner.
            </InlineNotice>
          )}
          {data.task_list === "real" && (
            <InlineNotice tone="warn">New tenders&apos; tasks are created in the real Proposals list.</InlineNotice>
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
      {[toggle, assignToggle, chooseList, test, disconnect].map(
        (a, i) => a.error && <InlineNotice key={i} tone="danger">{a.error}</InlineNotice>,
      )}
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        Microsoft lets no app post to a channel on its own, so posts are sent as the connected account.
        Cards go to the channel chosen above — the test channel until changed. Connecting asks only to send
        channel messages; the account must be a member of the chosen team.
      </p>
    </Panel>
  );
}

/** Where cards are posted: a team, then one of its channels. */
function ChannelPicker({ data, onSaved }: { data: MailWatchTeamsOut; onSaved: (out: MailWatchTeamsOut) => void }) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [channelId, setChannelId] = useState("");
  const { data: teamList, error: teamsError } = useSWR<{ id: string; name: string }[]>(
    open ? "/mailwatch/teams/teams" : null,
  );
  const { data: channels, error: channelsError } = useSWR<{ id: string; name: string; kind: string }[]>(
    open && teamId ? `/mailwatch/teams/channels?team_id=${encodeURIComponent(teamId)}` : null,
  );
  const save = useAction(async (team_id: string, channel_id: string) => {
    const out = await api.patch<MailWatchTeamsOut>("/mailwatch/teams", { team_id, channel_id });
    onSaved(out);
    setOpen(false);
  });
  const testTeam = teamList?.find((t) => t.name === data.test_team);

  if (!open) {
    return (
      <Field label="Post cards to">
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="font-medium">
            {data.team_name ?? data.test_team} → {data.channel_name ?? data.test_channel}
          </span>
          {data.is_test_channel ? <Badge tone="warn">Test channel</Badge> : <Badge tone="positive">Real channel</Badge>}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Change channel
          </Button>
        </div>
      </Field>
    );
  }
  const chosenTeam = teamList?.find((t) => t.id === teamId);
  const chosen = channels?.find((c) => c.id === channelId);
  const isTest = chosenTeam?.name === data.test_team && chosen?.name.toLowerCase() === data.test_channel.toLowerCase();
  return (
    <Field label="Post cards to" hint="The connected account must be a member of the team. Send a test message after changing.">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56">
          <Select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setChannelId("");
            }}
          >
            <option value="">{teamList ? "Choose a team…" : "Loading teams…"}</option>
            {teamList?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-56">
          <Select value={channelId} disabled={!teamId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">{teamId && !channels ? "Loading channels…" : "Choose a channel…"}</option>
            {channels?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.kind !== "standard" ? ` (${c.kind})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="accent"
          disabled={!teamId || !channelId}
          loading={save.pending}
          onClick={() => {
            if (
              !isTest &&
              !window.confirm(
                `Post the cards to ${chosenTeam?.name} → ${chosen?.name}? That is a real channel: the team will see them, without the TESTING banner.`,
              )
            )
              return;
            save.run(teamId, channelId);
          }}
        >
          Save
        </Button>
        {testTeam && !data.is_test_channel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const list = await api.get<{ id: string; name: string }[]>(
                `/mailwatch/teams/channels?team_id=${encodeURIComponent(testTeam.id)}`,
              );
              const test = list.find((c) => c.name.toLowerCase() === data.test_channel.toLowerCase());
              if (test) save.run(testTeam.id, test.id);
            }}
          >
            Back to the test channel
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {[teamsError, channelsError].map(
        (e, i) => e && <InlineNotice key={i} tone="danger">{String(e.message ?? e)}</InlineNotice>,
      )}
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
    </Field>
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
