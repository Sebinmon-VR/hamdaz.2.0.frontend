"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  ExternalLink,
  FlaskConical,
  Paperclip,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Unplug,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  MailCategory,
  MailMatch,
  MailReading,
  MailVerdict,
  MatchCandidate,
  MatchedTask,
  MailTrialOut,
  MailWatchReadReport,
  MailWatchSettingsOut,
  WatchedMailDetailOut,
  WatchedMailOut,
} from "@/lib/types";
import { Badge, Panel, PanelHead, type Tone } from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, PillRail, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, PanelSkeleton, RowsSkeleton } from "@/components/ui/feedback";
import { uaeDateTime } from "@/components/followups/FollowupBits";

/* ── labels ──────────────────────────────────────────────────────────── */

const CATEGORY: Record<MailCategory, { label: string; tone: Tone }> = {
  new_tender: { label: "New tender", tone: "accent" },
  negotiation: { label: "Negotiation", tone: "second" },
  general: { label: "General", tone: "neutral" },
  confidential: { label: "Confidential", tone: "danger" },
};

const STAGE: Record<string, string> = {
  eoi: "EOI",
  rfi: "RFI",
  rfq: "RFQ",
  rfp: "RFP",
  rft: "RFT",
  pre_tender: "Pre-tender",
  negotiation: "Negotiation",
};

const VERDICT: Record<MailVerdict, { label: string; tone: Tone; hint: string }> = {
  new: { label: "New", tone: "positive", hint: "Not on the Proposals list — needs assigning" },
  existing: { label: "Existing", tone: "info", hint: "Already on the Proposals list" },
  stage_change: { label: "Stage change", tone: "warn", hint: "On the list at an earlier stage" },
  duplicate_mail: { label: "Duplicate mail", tone: "neutral", hint: "An earlier mail brought the same tender" },
  not_found: { label: "Task not found", tone: "danger", hint: "No task found for this negotiation" },
  unsure: { label: "Match unsure", tone: "warn", hint: "Several tasks are alike — check the candidates" },
};

/** What a row needs to show its Proposals match. */
interface RowMatch {
  verdict: MailVerdict | null;
  task: MatchedTask | null;
  reason: string | null;
}

export function VerdictBadge({ verdict }: { verdict: MailVerdict | null }) {
  if (!verdict) return null;
  const v = VERDICT[verdict];
  return (
    <Badge tone={v.tone} title={v.hint}>
      {v.label}
    </Badge>
  );
}

function TaskLine({ task }: { task: MatchedTask }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
      <span className="text-ink-4">Task</span>
      <a
        href={task.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="min-w-0 max-w-full truncate font-medium text-accent-text hover:underline"
        title={task.title}
      >
        {task.title}
      </a>
      <span>· {task.assignee ?? "Not assigned"}</span>
      {task.status && <span className="text-ink-3">· {task.status}</span>}
      {task.stage && <span className="text-ink-3">· {STAGE[task.stage] ?? task.stage}</span>}
      {!task.live && (
        <Badge tone="warn" title="SharePoint could not be reached; this is the app's copy">
          From copy
        </Badge>
      )}
    </div>
  );
}

/** Below this the rules were not sure; with no model answer, that is "unsure". */
const SURE = 0.8;

function isUnsure(r: MailReading): boolean {
  return r.decided_by !== "model" && (r.confidence ?? 0) < SURE;
}

function words(key: string | null): string {
  return key ? key.replace(/_/g, " ") : "";
}

export function CategoryBadge({ reading }: { reading: MailReading }) {
  if (!reading.category) return <Badge>Not read</Badge>;
  const c = CATEGORY[reading.category];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

/* ── settings and status ─────────────────────────────────────────────── */

export function SettingsPanel({ onRead }: { onRead?: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<MailWatchSettingsOut>("/mailwatch/settings", {
    revalidateOnFocus: false,
  });
  const [mailbox, setMailbox] = useState("");
  const [senders, setSenders] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMailbox(data.mailbox);
    setSenders(data.senders.join(", "));
  }, [data]);

  const save = useAction(async (changes: Partial<Pick<MailWatchSettingsOut, "enabled" | "mailbox" | "senders" | "use_model">>) => {
    const out = await api.patch<MailWatchSettingsOut>("/mailwatch/settings", changes);
    await mutate(out, { revalidate: false });
    setResult(null);
  });
  const catchUp = useAction(async () => {
    const out = await api.post<MailWatchReadReport>("/mailwatch/catch-up");
    setResult(
      out.error
        ? `Could not read: ${out.error}`
        : `Read ${out.seen} new message${out.seen === 1 ? "" : "s"} in ${out.mailbox}; kept ${out.kept} from the watched senders${out.already ? `, ${out.already} already kept` : ""}.`,
    );
    await mutate();
    onRead?.();
  });
  const subscribe = useAction(async () => {
    const out = await api.post<MailWatchSettingsOut>("/mailwatch/subscribe");
    await mutate(out, { revalidate: false });
    setResult("Subscribed. Graph will post here when mail arrives.");
  });
  const unsubscribe = useAction(async () => {
    const out = await api.del<MailWatchSettingsOut>("/mailwatch/subscribe");
    await mutate(out, { revalidate: false });
    setResult("Subscription removed. Nothing is read until it is subscribed again or caught up by hand.");
  });

  const mailboxChanged = !!data && mailbox.trim().toLowerCase() !== data.mailbox;
  const sendersList = senders
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const sendersChanged = !!data && sendersList.join(",") !== data.senders.join(",");
  const subscribed = !!data?.subscription_id;
  const reachable = !!data?.notification_url?.startsWith("https://");

  return (
    <Panel className="space-y-4 p-4">
      <PanelHead
        title="Mailbox and switch"
        hint={data ? (data.enabled ? (subscribed ? "On · subscribed" : "On · not subscribed") : "Off") : undefined}
        action={
          <Button icon={RefreshCw} loading={catchUp.pending} onClick={() => catchUp.run()}>
            Catch up now
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <PanelSkeleton lines={5} />
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle
              checked={data.enabled}
              disabled={save.pending}
              onChange={(enabled) => save.run({ enabled })}
              label="Watch the mailbox"
              hint="On: Graph tells the server when mail arrives and it is read at once. Off: nothing is read unless you press Catch up."
            />
            <Toggle
              checked={data.use_model}
              disabled={save.pending}
              onChange={(use_model) => save.run({ use_model })}
              label="Ask Haiku when the rules are unsure"
              hint="Most mail is settled by rules. Off: an unplaced mail stays General, marked unsure."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Mailbox"
              hint="Changing it starts that mailbox from now — its older mail is not read."
            >
              <div className="flex gap-2">
                <Input value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="name@hamdaz.com" />
                <Button
                  variant="accent"
                  disabled={!mailboxChanged}
                  loading={save.pending}
                  onClick={() => {
                    if (window.confirm(`Watch ${mailbox.trim()} from now on?`)) save.run({ mailbox: mailbox.trim() });
                  }}
                >
                  Save
                </Button>
              </div>
            </Field>
            <Field
              label="Whose mail counts"
              hint={`Blank: whoever holds the CEO role. Watching now: ${data.watching.join(", ") || "nobody"}.`}
            >
              <div className="flex gap-2">
                <Input value={senders} onChange={(e) => setSenders(e.target.value)} placeholder="CEO role" />
                <Button
                  variant="accent"
                  disabled={!sendersChanged}
                  loading={save.pending}
                  onClick={() => save.run({ senders: sendersList })}
                >
                  Save
                </Button>
              </div>
            </Field>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
            <Fact label="Mails kept" value={String(data.mails_kept)} />
            <Fact label="Reading from" value={data.watch_from ? uaeDateTime(data.watch_from) : "—"} />
            <Fact label="Last read" value={data.last_read_at ? relative(data.last_read_at) : "Never"} />
            <Fact label="Last notice" value={data.last_notified_at ? relative(data.last_notified_at) : "Never"} />
            <Fact
              label="Subscription"
              value={
                subscribed
                  ? `${data.subscription_mailbox} · until ${uaeDateTime(data.subscription_expires_at)}`
                  : "None"
              }
            />
            <Fact label="Bookmark" value={data.has_bookmark ? "Held" : "None yet"} />
          </dl>

          {!reachable && (
            <InlineNotice tone="info">
              This server cannot be reached by Graph, so it cannot be told when mail arrives — use Catch up
              to read new mail. ({data.notification_url})
            </InlineNotice>
          )}
          {data.last_error && <InlineNotice tone="warn">Last error: {data.last_error}</InlineNotice>}

          {reachable && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Play} loading={subscribe.pending} onClick={() => subscribe.run()}>
                {subscribed ? "Subscribe again" : "Subscribe"}
              </Button>
              {subscribed && (
                <Button size="sm" variant="ghost" icon={Unplug} loading={unsubscribe.pending} onClick={() => unsubscribe.run()}>
                  Remove subscription
                </Button>
              )}
            </div>
          )}
        </>
      ) : null}
      {[save, catchUp, subscribe, unsubscribe].map(
        (a, i) => a.error && <InlineNotice key={i} tone="danger">{a.error}</InlineNotice>,
      )}
      {result && <InlineNotice tone="info">{result}</InlineNotice>}
      <p className="text-[11.5px] text-ink-4">
        Read only: nothing is marked read, moved, or written to SharePoint. Only the watched senders&apos; mail
        is kept; a confidential mail keeps its date and label, not what it says.
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

/* ── one mail, as a row ──────────────────────────────────────────────── */

function MailRow({
  reading,
  receivedAt,
  subject,
  references,
  attachments,
  webLink,
  match,
  onOpen,
}: {
  reading: MailReading;
  receivedAt: string | null;
  subject: string | null;
  references: string[];
  attachments: number;
  webLink: string | null;
  match?: RowMatch | null;
  onOpen?: () => void;
}) {
  const secret = reading.category === "confidential";
  return (
    <li
      className={clsx(
        "space-y-1 rounded-[12px] bg-panel-2 px-3 py-2 text-[12.5px]",
        onOpen && "cursor-pointer transition hover:bg-panel-3",
      )}
      onClick={onOpen}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge reading={reading} />
        {reading.stage && <Badge tone="info">{STAGE[reading.stage] ?? reading.stage}</Badge>}
        <VerdictBadge verdict={match?.verdict ?? null} />
        {reading.kind && <span className="text-ink-4">{words(reading.kind)}</span>}
        {isUnsure(reading) && <Badge tone="warn">Unsure</Badge>}
        {reading.decided_by === "model" && (
          <Badge tone="second" title={`Haiku · $${reading.model_cost_usd}`}>
            Haiku
          </Badge>
        )}
        <span className="ml-auto tnum text-ink-4">{receivedAt ? uaeDateTime(receivedAt) : ""}</span>
      </div>
      <p className="truncate font-medium" title={subject ?? undefined}>
        {secret ? <span className="text-ink-4">Subject hidden — confidential</span> : reading.title || subject || "—"}
      </p>
      {!secret && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
          {reading.customer && <span>{reading.customer}</span>}
          {references.length > 0 && <span className="tnum">{references.join(" · ")}</span>}
          {reading.ariba_doc && <span className="tnum text-ink-4">{reading.ariba_doc}</span>}
          {reading.closing_at && <span>Closes {uaeDateTime(reading.closing_at)}</span>}
          {attachments > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="size-3" /> {attachments}
            </span>
          )}
          <span className="text-ink-4" title={reading.reason ?? undefined}>
            {reading.reason}
          </span>
        </div>
      )}
      {match?.task && <TaskLine task={match.task} />}
      {match && !match.task && match.reason && (
        <p className="text-[11.5px] text-ink-4">{match.reason}</p>
      )}
      {webLink && (
        <a
          href={webLink}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11.5px] text-accent-text hover:underline"
        >
          <ExternalLink className="size-3" /> Open in Outlook
        </a>
      )}
    </li>
  );
}

/* ── the saved mails ─────────────────────────────────────────────────── */

type Filter = "all" | MailCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new_tender", label: "New tender" },
  { value: "negotiation", label: "Negotiation" },
  { value: "general", label: "General" },
  { value: "confidential", label: "Confidential" },
];

type VerdictFilter = "any" | MailVerdict;

const VERDICT_FILTERS: { value: VerdictFilter; label: string }[] = [
  { value: "any", label: "Any match" },
  ...(Object.keys(VERDICT) as MailVerdict[]).map((v) => ({ value: v, label: VERDICT[v].label })),
];

export function MailsPanel({ refreshKey }: { refreshKey: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [verdict, setVerdict] = useState<VerdictFilter>("any");
  const [openId, setOpenId] = useState<string | null>(null);
  const key =
    `/mailwatch/mails?limit=200${filter === "all" ? "" : `&category=${filter}`}` +
    `${verdict === "any" ? "" : `&verdict=${verdict}`}`;
  const { data, error, isLoading, mutate } = useSWR<WatchedMailOut[]>(key, { revalidateOnFocus: false });

  useEffect(() => {
    if (refreshKey) mutate();
  }, [refreshKey, mutate]);

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead title="Mails kept" hint={data ? `${data.length} shown` : undefined} />
      <PillRail options={FILTERS} value={filter} onChange={setFilter} />
      <PillRail options={VERDICT_FILTERS} value={verdict} onChange={setVerdict} />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : !data || data.length === 0 ? (
        <Empty
          title="No mails kept yet"
          body="Mail from the watched senders appears here as it arrives — or press Catch up. To see how past mail would be sorted, use the trial."
        />
      ) : (
        <ul className="space-y-1.5">
          {data.map((m) => (
            <MailRow
              key={m.id}
              reading={m}
              receivedAt={m.received_at}
              subject={m.subject}
              references={m.reference_numbers}
              attachments={m.attachment_names.length}
              webLink={m.web_link}
              match={{ verdict: m.verdict, task: m.task, reason: m.match_reason }}
              onOpen={() => setOpenId(m.id)}
            />
          ))}
        </ul>
      )}
      <MailModal id={openId} onClose={() => setOpenId(null)} onChanged={() => mutate()} />
    </Panel>
  );
}

function MailModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, mutate } = useSWR<WatchedMailDetailOut>(id ? `/mailwatch/mails/${id}` : null);
  const again = useAction(async () => {
    const out = await api.post<WatchedMailDetailOut>(`/mailwatch/mails/${id}/classify`);
    await mutate(out, { revalidate: false });
    onChanged();
  });
  const toTeams = useAction(async () => {
    const out = await api.post<WatchedMailDetailOut>(`/mailwatch/mails/${id}/teams`);
    await mutate(out, { revalidate: false });
    onChanged();
  });
  const secret = data?.category === "confidential";

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      width="lg"
      title={secret ? "Confidential mail" : data?.title || data?.subject || "Mail"}
      description={data ? `${data.sender_name ?? data.sender_email ?? ""} · ${uaeDateTime(data.received_at)}` : undefined}
      footer={
        <>
          {data?.web_link && (
            <LinkButton href={data.web_link} target="_blank" rel="noreferrer" icon={ExternalLink}>
              Open in Outlook
            </LinkButton>
          )}
          {data?.category === "negotiation" && (
            <Button icon={Send} loading={toTeams.pending} onClick={() => toTeams.run()}>
              {data.teams_posted_at ? "Post to Teams again" : "Post to Teams"}
            </Button>
          )}
          <Button variant="accent" icon={RotateCcw} loading={again.pending} onClick={() => again.run()}>
            Classify again
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="space-y-3 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge reading={data} />
            {data.stage && <Badge tone="info">{STAGE[data.stage] ?? data.stage}</Badge>}
            {data.kind && <Badge>{words(data.kind)}</Badge>}
            {isUnsure(data) && <Badge tone="warn">Unsure</Badge>}
            <span className="text-ink-4">
              {data.decided_by === "model" ? `Haiku · $${data.model_cost_usd}` : `by ${data.decided_by ?? "—"}`} ·
              confidence {data.confidence != null ? Math.round(data.confidence * 100) : "—"}%
            </span>
          </div>
          {data.reason && <p className="text-ink-3">{data.reason}</p>}
          {data.classify_error && <InlineNotice tone="warn">{data.classify_error}</InlineNotice>}
          {again.error && <InlineNotice tone="danger">{again.error}</InlineNotice>}
          {toTeams.error && <InlineNotice tone="danger">{toTeams.error}</InlineNotice>}
          {data.teams_posted_at && (
            <InlineNotice tone="positive">Posted to Teams {uaeDateTime(data.teams_posted_at)}.</InlineNotice>
          )}
          {data.teams_error && !data.teams_posted_at && (
            <InlineNotice tone="warn">Teams post failed: {data.teams_error}</InlineNotice>
          )}
          {secret ? (
            <InlineNotice tone="info">
              Nothing this mail says is kept. Open it in Outlook to check the label; if it is wrong, Classify
              again reads it afresh and keeps it as what it turns out to be.
            </InlineNotice>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <Fact label="Subject" value={data.subject ?? "—"} />
                <Fact label="Customer" value={data.customer ?? "—"} />
                <Fact label="References" value={data.reference_numbers.join(", ") || "—"} />
                <Fact label="Ariba doc" value={data.ariba_doc ?? "—"} />
                <Fact label="Closes" value={data.closing_at ? uaeDateTime(data.closing_at) : "—"} />
                <Fact label="Originally from" value={data.original_sender ?? "—"} />
                <Fact label="Attachments" value={data.attachment_names.join(", ") || "None"} />
              </dl>
              <ProposalsMatch
                match={{
                  verdict: data.verdict,
                  task: data.task,
                  reason: data.match_reason,
                  method: data.match_method,
                  candidates: data.match_candidates,
                  error: data.match_error,
                }}
              />
              <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-[12px] bg-panel-2 p-3 font-sans text-[12px] leading-relaxed text-ink-2">
                {data.body || "No body kept."}
              </pre>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── a match, in full ────────────────────────────────────────────────── */

function ProposalsMatch({
  match,
}: {
  match: {
    verdict: MailVerdict | null;
    task: MatchedTask | null;
    reason: string | null;
    method: string | null;
    candidates: MatchCandidate[];
    error: string | null;
  };
}) {
  if (!match.verdict) {
    return <p className="text-ink-4">Not matched — only new tenders and negotiations are looked up on the Proposals list.</p>;
  }
  const t = match.task;
  return (
    <div className="space-y-2 rounded-[12px] border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Proposals list</span>
        <VerdictBadge verdict={match.verdict} />
        {match.method && <span className="text-ink-4">found by {words(match.method)}</span>}
      </div>
      {match.reason && <p className="text-ink-3">{match.reason}</p>}
      {match.error && <InlineNotice tone="warn">{match.error}</InlineNotice>}
      {t && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Fact label="Task" value={t.title} />
          <Fact label="Assigned to" value={`${t.assignee ?? "Nobody"}${t.assignee_email ? ` (${t.assignee_email})` : ""}`} />
          <Fact label="Status" value={[t.status, t.submission_status].filter(Boolean).join(" · ") || "—"} />
          <Fact label="Stage" value={t.stage ? (STAGE[t.stage] ?? t.stage) : t.current_type ?? "—"} />
          <Fact label="Customer" value={t.customer ?? "—"} />
          <Fact label="Quote no." value={t.quote_no ?? "—"} />
          <Fact label="BCD" value={t.bid_closing_date ? uaeDateTime(t.bid_closing_date) : "—"} />
          <Fact label="Negotiation" value={t.negotiation ?? "—"} />
          <Fact label="Order status" value={t.order_status ?? "—"} />
          <Fact label="Created" value={t.created_at ? uaeDateTime(t.created_at) : "—"} />
          {t.remarks && <Fact label="Remarks" value={t.remarks} />}
        </dl>
      )}
      {t && (
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={t.url} target="_blank" rel="noreferrer" size="sm" icon={ExternalLink}>
            Open in SharePoint
          </LinkButton>
          <span className="text-[11.5px] text-ink-4">
            {t.live ? "Read live from SharePoint when matched." : "SharePoint was unreachable — from the app's copy."}
          </span>
        </div>
      )}
      {match.candidates.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11.5px] text-ink-4">Tasks considered</p>
          <ul className="space-y-1">
            {match.candidates.map((c) => (
              <li key={c.item_id} className="flex gap-2 text-[11.5px]">
                <span className="tnum w-9 shrink-0 text-ink-4">{Math.round(c.score * 100)}%</span>
                <span className="min-w-0 flex-1 truncate" title={c.title}>
                  {c.title}
                </span>
                <span className="shrink-0 text-ink-3">{c.assignee ?? "—"}</span>
                <span className="hidden shrink-0 text-ink-4 sm:inline">{c.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── the trial ───────────────────────────────────────────────────────── */

export function TrialPanel() {
  const [days, setDays] = useState("7");
  const [limit, setLimit] = useState("100");
  const [useModel, setUseModel] = useState(true);
  const [filter, setFilter] = useState<Filter | "unsure" | MailVerdict>("all");
  const [out, setOut] = useState<MailTrialOut | null>(null);
  const run = useAction(async () => {
    const result = await api.post<MailTrialOut>("/mailwatch/trial", {
      days: Number(days) || 7,
      limit: Number(limit) || 100,
      use_model: useModel,
    });
    setOut(result);
    setFilter("all");
  });

  const rows =
    out?.rows.filter((r) =>
      filter === "all"
        ? true
        : filter === "unsure"
          ? isUnsure(r.reading)
          : filter in VERDICT
            ? r.match?.verdict === filter
            : r.reading.category === filter,
    ) ?? [];
  const options = [
    { value: "all" as const, label: "All", count: out?.mails },
    ...FILTERS.slice(1).map((f) => ({ ...f, count: out?.by_category[f.value] ?? 0 })),
    { value: "unsure" as const, label: "Unsure", count: out?.unsure },
    ...(Object.keys(VERDICT) as MailVerdict[])
      .filter((v) => out?.by_verdict[v])
      .map((v) => ({ value: v, label: VERDICT[v].label, count: out?.by_verdict[v] })),
  ];

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead title="Trial on past mail" hint="Nothing is stored" />
      <div className="grid items-end gap-3 sm:grid-cols-[110px_110px_1fr_auto]">
        <Field label="Days back">
          <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="At most">
          <Input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Toggle checked={useModel} onChange={setUseModel} label="Use Haiku" hint="For what the rules cannot place." />
        <Button variant="accent" icon={FlaskConical} loading={run.pending} onClick={() => run.run()}>
          Run trial
        </Button>
      </div>
      {run.error && <InlineNotice tone="danger">{run.error}</InlineNotice>}
      {run.pending && <InlineNotice tone="info">Reading and sorting the mail — a hundred takes under a minute.</InlineNotice>}
      {out && (
        <>
          <p className="text-[12.5px] text-ink-3">
            {out.mails} mail{out.mails === 1 ? "" : "s"} from {out.senders.join(", ")} in {out.mailbox} since{" "}
            {uaeDateTime(out.since)} · rules {out.by_decided.rules ?? 0} · Haiku {out.by_decided.model ?? 0} ·
            unplaced {out.by_decided.none ?? 0} · cost ${Number(out.model_cost_usd).toFixed(4)}
          </p>
          <PillRail options={options} value={filter} onChange={setFilter} />
          {rows.length === 0 ? (
            <p className="text-[12.5px] text-ink-4">None.</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <MailRow
                  key={`${r.received_at}-${i}`}
                  reading={r.reading}
                  receivedAt={r.received_at}
                  subject={r.subject}
                  references={r.reading.references}
                  attachments={r.attachments}
                  webLink={r.web_link}
                  match={r.match ? { verdict: r.match.verdict, task: r.match.task, reason: r.match.reason } : null}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── search the Proposals list, as a mail would ──────────────────────── */

export function SearchPanel() {
  const [text, setText] = useState("");
  const [customer, setCustomer] = useState("ADNOC");
  const [stage, setStage] = useState("");
  const [negotiation, setNegotiation] = useState(false);
  const [out, setOut] = useState<MailMatch | null>(null);
  const search = useAction(async () => {
    const result = await api.post<MailMatch>("/mailwatch/search", {
      text: text.trim(),
      customer: customer.trim() || null,
      stage: stage || null,
      negotiation,
    });
    setOut(result);
  });

  return (
    <Panel className="space-y-3 p-4">
      <PanelHead title="Search the Proposals list" hint="As a mail would be — nothing is stored" />
      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_160px_130px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) search.run();
        }}
      >
        <Field label="Title or tender number" hint="Typos and renamed stages are fine — that is what this tries.">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Data Preperation PMS system, or 6000153446" />
        </Field>
        <Field label="Customer">
          <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
        <Field label="Mail's stage">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-10 w-full rounded-2xl border border-transparent bg-panel-2 px-3 text-[13px]"
          >
            <option value="">Not given</option>
            {Object.entries(STAGE).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="accent" type="submit" icon={Search} loading={search.pending} disabled={text.trim().length < 2}>
          Search
        </Button>
      </form>
      <Toggle
        checked={negotiation}
        onChange={setNegotiation}
        label="It is a negotiation"
        hint="Looks up the task to negotiate on, rather than whether a tender is new."
      />
      {search.error && <InlineNotice tone="danger">{search.error}</InlineNotice>}
      {out && (
        <ProposalsMatch
          match={{
            verdict: out.verdict,
            task: out.task,
            reason: out.reason,
            method: out.method,
            candidates: out.candidates,
            error: out.error,
          }}
        />
      )}
    </Panel>
  );
}
