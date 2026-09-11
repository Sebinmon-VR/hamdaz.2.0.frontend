"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  BellRing,
  Check,
  Database,
  Inbox,
  Mail,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateTime, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  IntakeMessageOut,
  IntakePage,
  IntakeSettingsIn,
  IntakeSettingsOut,
  MirrorStatusOut,
  StandingOut,
  TeamOut,
} from "@/lib/types";
import {
  Avatar,
  Badge,
  PageHead,
  Panel,
  PanelHead,
  Row,
  RowHead,
  StatBox,
} from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  PillRail,
  Select,
  Toggle,
} from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";
import {
  CategoryBadge,
  IntakeStatusBadge,
  STATUS_LABELS,
} from "@/components/intake/IntakeBits";
import { MessageTrail } from "@/components/intake/MessageTrail";

/**
 * The intake: mail in, work assigned.
 *
 * A mailbox is watched; each message is read by a model and given a category;
 * the local copy of the Proposals list is searched for the thing it is about;
 * and then one of two things happens — new work becomes a task given to
 * whoever the live ranking says is next, or existing work gets its holder told.
 *
 * **The screen is built around watching it rather than driving it**, because
 * that is what this system needs from a person. It runs on a timer whether
 * anybody is here or not, and the only questions worth answering on a screen
 * are: is it on, what has it decided lately, and why did it decide that. The
 * settings are here too, but they are one panel among four rather than the
 * point of the page.
 *
 * **Writing is off until somebody turns it on.** With `create_in_sharepoint`
 * off — how it ships — a message that would raise a task instead records the
 * exact payload it would have posted and stops. That is not a test mode; it is
 * how this is meant to run until its judgement has been watched for a while,
 * and the screen says so rather than nagging about it.
 */
export default function IntakePage() {
  const session = useSession();
  const settings = useSWR<IntakeSettingsOut>("/intake/settings", {
    revalidateOnFocus: false,
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Mail intake" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="This shows whose mail is being read and lets you switch on writing to the live Proposals list, so it is limited to super admins."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Mail intake"
        lead="It reads a mailbox, works out what each email is about, and gives new work to whoever is next in line."
        meta={settings.data ? `saved ${dateTime(settings.data.updated_at)}` : undefined}
        actions={
          settings.data ? (
            <>
              <Badge tone={settings.data.enabled ? "positive" : "neutral"}>
                {settings.data.enabled ? "Watching" : "Off"}
              </Badge>
              {/* Two separate writes, so three states rather than two. Calling
                  it "simulating" while it is marking columns in SharePoint
                  would be the badge telling an administrator something untrue. */}
              <Badge
                tone={
                  settings.data.create_in_sharepoint
                    ? "warn"
                    : settings.data.update_negotiation
                      ? "second"
                      : "info"
                }
                title={
                  settings.data.create_in_sharepoint
                    ? "Raises real tasks, and may mark existing ones."
                    : settings.data.update_negotiation
                      ? "Raises nothing, but marks matched tasks — which a flow can trigger on."
                      : "Decides everything and writes nothing."
                }
              >
                {settings.data.create_in_sharepoint
                  ? "Writing"
                  : settings.data.update_negotiation
                    ? "Marking only"
                    : "Simulating"}
              </Badge>
            </>
          ) : undefined
        }
      />

      <Stages />

      {settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.mutate()} />
      ) : !settings.data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <>
          {settings.data.last_error && (
            <InlineNotice tone="danger">
              The last poll failed: {settings.data.last_error}
            </InlineNotice>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Mirror />
            <Standing />
          </div>

          <Log settings={settings.data} />

          <Settings settings={settings.data} onSaved={() => void settings.mutate()} />
        </>
      )}
    </>
  );
}

/* ── what the pipeline does ──────────────────────────────────────────── */

/**
 * The five stages, along one line.
 *
 * Not decoration. Every screen below is about one of these stages, and a person
 * asked to trust a system that assigns work to their colleagues should be able
 * to see, in one glance, what it actually consists of — that a model reads the
 * mail, that a search decides whether the work already exists, and that the
 * assignment comes from a ranking rather than from the model.
 */
function Stages() {
  const stages = [
    { icon: Mail, title: "An email arrives", body: "From someone on the list below." },
    { icon: Sparkles, title: "It reads it", body: "Works out if it is a tender, a price query, an order." },
    { icon: Database, title: "It checks the list", body: "Is this a job we already have, or a new one?" },
    { icon: UserCheck, title: "Someone gets it", body: "A new job goes to whoever is next in line." },
    { icon: Inbox, title: "They are told", body: "A notification here, and in Teams if set up." },
  ];

  return (
    <div className="no-bar flex items-stretch gap-0 overflow-x-auto">
      {stages.map((stage, index) => (
        <div key={stage.title} className="flex items-center">
          {index > 0 && <span aria-hidden className="h-px w-4 shrink-0 bg-line" />}
          <div className="w-52 shrink-0 rounded-[15px] bg-panel-2 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
              <stage.icon className="size-3.5 shrink-0 text-ink-4" strokeWidth={2.1} />
              {stage.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-4">{stage.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the mirror ──────────────────────────────────────────────────────── */

/**
 * The local copy of the Proposals list.
 *
 * Worth its own panel because everything else depends on it: matching an email
 * to a task and counting somebody's workload are both answered from here rather
 * than from SharePoint, which is what keeps them fast however large the list
 * gets. It reads SharePoint on a timer and writes nothing to it, ever — worth
 * saying next to a button that says "sync".
 */
function Mirror() {
  const { data, error, mutate } = useSWR<MirrorStatusOut>("/intake/mirror", {
    revalidateOnFocus: false,
  });

  const sync = useAction(async () => {
    await api.post<MirrorStatusOut>("/intake/mirror/sync");
    await mutate();
  });

  const coverage = data && data.rows > 0 ? data.embedded / data.rows : 0;

  return (
    <Panel className="p-5">
      <PanelHead
        title="Proposals mirror"
        hint="A local copy of the Proposals list, refreshed automatically. Nothing is written back to it."
        action={
          <Button
            size="sm"
            icon={RefreshCw}
            loading={sync.pending}
            onClick={() => void sync.run()}
          >
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
              label="With an embedding"
              value={`${Math.round(coverage * 100)}%`}
              tone={coverage < 1 ? "second" : undefined}
              hint="Used to find which task an email is about. Below 100% usually means the OpenAI key is missing."
              className="bg-panel-2"
            />
          </div>

          <dl className="space-y-1 text-[11.5px]">
            <Line
              label="Last sync"
              value={
                data.last_sync_at
                  ? `${relative(data.last_sync_at)} · ${num(data.duration_ms)} ms`
                  : "never"
              }
            />
            <Line label="Rows read" value={num(data.rows_read)} />
            <Line label="Changed" value={num(data.rows_changed)} />
            <Line
              label="Re-embedded"
              value={num(data.rows_embedded)}
            />
          </dl>

          {/* The one figure worth watching over time: if it stays near the row
              count on every sync, the text hash is not doing its job and every
              sync is paying to embed rows that did not change. */}
          {data.rows_embedded > 0 && data.rows_embedded >= data.rows * 0.9 && (
            <p className="text-[11px] leading-relaxed text-warn">
              Nearly every row was re-processed. That should be rare. If it happens every
              sync, something is wrong and it is costing money each time.
            </p>
          )}

          {data.last_error && (
            <p className="text-[11.5px] leading-relaxed text-danger">{data.last_error}</p>
          )}
          {sync.error && <p className="text-[11.5px] text-danger">{sync.error}</p>}
        </div>
      )}
    </Panel>
  );
}

/* ── the ranking ─────────────────────────────────────────────────────── */

/**
 * Who gets the next task.
 *
 * A stored ranking rather than something computed on demand — which is what
 * lets the intake decide who an incoming tender belongs to while the email is
 * still being read. Rank 1 is next.
 *
 * Everybody's factors are shown on the row, not hidden behind a click, because
 * a queue position nobody can decompose is a queue position nobody will accept
 * being at the bottom of.
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
          Nobody is in the queue yet. Press Sync now above — until the Proposals list has
          been copied across once, there is nobody to give new work to.
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

/* ── the log ─────────────────────────────────────────────────────────── */

/**
 * Every mail it has seen, including the ones it ignored.
 *
 * The ignored rows are the point of keeping them. "What did it do" is answered
 * by the actioned rows; "why did nothing happen when I sent that" is answered
 * only by the ignored ones, and that is the question people actually ask.
 */
function Log({ settings }: { settings: IntakeSettingsOut }) {
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<IntakeMessageOut | null>(null);

  const { data, error, isLoading, mutate } = useSWR<IntakePage>(
    withQuery("/intake/messages", {
      status: status === "all" ? undefined : status,
      limit: 100,
    }),
    { keepPreviousData: true, refreshInterval: 60_000 },
  );

  const counts = data?.counts ?? {};

  const retry = useAction(async (id: string) => {
    const fresh = await api.post<IntakeMessageOut>(`/intake/messages/${id}/retry`);
    setOpen(fresh);
    await mutate();
  });

  return (
    <>
      <Panel className="py-2">
        <div className="px-5 pt-3">
          <PanelHead
            title="Every email it has seen"
            count={data ? num(data.total) : undefined}
            hint="Including mail it ignored — that is where to look when nothing happened"
            action={
              <PillRail
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All" },
                  ...Object.keys(STATUS_LABELS).map((key) => ({
                    value: key,
                    label: STATUS_LABELS[key],
                    count: counts[key],
                  })),
                ]}
              />
            }
          />
        </div>

        {error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={() => mutate()} />
          </div>
        ) : isLoading && !data ? (
          <RowsSkeleton rows={6} />
        ) : !data || data.messages.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-ink-4">
            Nothing here. If it is switched on and still empty, either no mail has arrived
            or nobody has been added to the sender list above — it starts out empty.
          </p>
        ) : (
          <div className="mt-2">
            <RowHead>
              <span className="micro w-20 shrink-0 text-ink-4">Status</span>
              <span className="micro min-w-0 flex-1 text-ink-4">Subject</span>
              <span className="micro hidden w-40 shrink-0 text-ink-4 md:block">From</span>
              <span className="micro hidden w-24 shrink-0 text-ink-4 sm:block">What</span>
              <span className="micro hidden w-36 shrink-0 text-ink-4 lg:block">Given to</span>
              <span className="micro w-20 shrink-0 text-ink-4">Seen</span>
            </RowHead>
            {data.messages.map((message) => (
              <Row
                key={message.id}
                onClick={() => setOpen(message)}
                className="cursor-pointer"
              >
                <span className="w-20 shrink-0">
                  <IntakeStatusBadge value={message.status} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {message.subject || "(no subject)"}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-[11.5px] text-ink-4 md:block">
                  {message.sender_email ?? "—"}
                </span>
                <span className="hidden w-24 shrink-0 sm:block">
                  <CategoryBadge value={message.category} />
                </span>
                <span className="hidden w-36 shrink-0 truncate text-[11.5px] text-ink-3 lg:block">
                  {message.assigned_name ?? "—"}
                </span>
                <span className="w-20 shrink-0 truncate text-[11px] text-ink-4">
                  {message.received_at ? relative(message.received_at) : "—"}
                </span>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.subject || "The message"}
        description="What it did with this email, step by step."
        width="lg"
        footer={
          open ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(null)}>
                Close
              </Button>
              {/* For after a setting changed — a sender added, a threshold
                  lowered, writing switched on. The classification is redone
                  rather than reused, because the thing being retried is
                  usually the decision itself. */}
              <Button
                icon={RefreshCw}
                loading={retry.pending}
                title="Put this email through again with the current settings"
                onClick={() => void retry.run(open.id)}
              >
                Try again
              </Button>
            </>
          ) : undefined
        }
      >
        {open && (
          <>
            {retry.error && <InlineNotice tone="danger">{retry.error}</InlineNotice>}
            <MessageTrail message={open} settings={settings} />
          </>
        )}
      </Modal>
    </>
  );
}

/* ── the settings ────────────────────────────────────────────────────── */

/**
 * Asking Microsoft to tell us the moment mail arrives.
 *
 * Polling above is the safety net and keeps running either way — Microsoft's
 * own advice is not to rely on notifications alone. This is the difference
 * between a tender being picked up in seconds and in a minute.
 *
 * It fails outright when the app is not reachable from the internet, because
 * Graph validates the endpoint before creating anything: it posts to the URL
 * and expects the token echoed back. That is the honest outcome — a
 * subscription that silently never fires would be worse than none — and it is
 * why the error is shown verbatim rather than softened.
 *
 * A subscription expires. The date is shown rather than the fact, since
 * "renew it before Thursday" is actionable and "expires" is not.
 */
function PushSubscription({
  settings,
  onDone,
}: {
  settings: IntakeSettingsOut;
  onDone: () => void;
}) {
  const subscribe = useAction(async () => {
    await api.post("/intake/subscription");
    onDone();
  });

  const expires = settings.subscription_expires_at;
  const live = Boolean(settings.subscription_id);

  return (
    <div className="rounded-[15px] bg-panel-2 p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
          Have Microsoft push new mail
        </span>
        {live ? (
          <Badge tone="positive">On</Badge>
        ) : (
          <Badge tone="neutral">Polling only</Badge>
        )}
        <Button
          size="sm"
          icon={BellRing}
          loading={subscribe.pending}
          disabled={!settings.mailbox}
          onClick={() => void subscribe.run()}
        >
          {live ? "Renew it" : "Turn it on"}
        </Button>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">
        {live && expires ? (
          <>
            Microsoft is notifying us; the subscription lasts until{" "}
            {dateTime(expires)} and has to be renewed before then. Checking on a timer
            carries on regardless — it is the safety net.
          </>
        ) : (
          <>
            Without this, mail is found on the timer above. With it, a tender is picked up
            in seconds. Microsoft checks it can reach this app first, so it will refuse
            outright unless this is running on a public https address.
          </>
        )}
      </p>

      {subscribe.error && (
        <InlineNotice tone="danger" className="mt-2.5">
          {subscribe.error}
        </InlineNotice>
      )}
    </div>
  );
}

function Settings({
  settings,
  onSaved,
}: {
  settings: IntakeSettingsOut;
  onSaved: () => void;
}) {
  const teams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });
  const [draft, setDraft] = useState<IntakeSettingsOut>(settings);
  const [seen, setSeen] = useState(settings.updated_at);
  const [saved, setSaved] = useState(false);

  if (seen !== settings.updated_at) {
    setSeen(settings.updated_at);
    setDraft(settings);
  }

  const set = <K extends keyof IntakeSettingsOut>(key: K, value: IntakeSettingsOut[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = useAction(async () => {
    const body: IntakeSettingsIn = {
      enabled: draft.enabled,
      mailbox: draft.mailbox,
      allowed_senders: draft.allowed_senders,
      allowed_domains: draft.allowed_domains,
      create_in_sharepoint: draft.create_in_sharepoint,
      update_negotiation: draft.update_negotiation,
      negotiation_value: draft.negotiation_value,
      assign_team_id: draft.assign_team_id,
      match_threshold: draft.match_threshold,
      classify_threshold: draft.classify_threshold,
      teams_webhook_url: draft.teams_webhook_url,
      notify_in_app: draft.notify_in_app,
      notify_teams: draft.notify_teams,
      poll_seconds: draft.poll_seconds,
    };
    await api.patch<IntakeSettingsOut>("/intake/settings", body);
    setSaved(true);
    onSaved();
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const turningOnWrites = draft.create_in_sharepoint && !settings.create_in_sharepoint;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <PanelHead title="The mailbox" hint="Which inbox it reads, and whose mail it accepts" />
          <div className="mt-5 space-y-5">
            <Toggle
              checked={draft.enabled}
              onChange={(value) => set("enabled", value)}
              label="Read the mailbox"
              hint="Off means no mail is read and nothing happens at all."
            />

            <Field
              label="Which inbox"
              hint="Change it and only new mail is read. Mail already sitting in the new inbox is left alone."
            >
              <Input
                value={draft.mailbox}
                placeholder="tenders@hamdaz.com"
                onChange={(event) => set("mailbox", event.target.value)}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-[12px] text-ink-3">Whose mail it reads</p>
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-4">
                Mail from anyone not listed here is ignored. Leave both lists empty and it
                reads <strong>nothing</strong> — that way it cannot start acting on a whole
                shared inbox before you have set it up.
              </p>
              <RecipientList
                addresses={draft.allowed_senders}
                onChange={(next) => set("allowed_senders", next)}
              />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] text-ink-3">Or anyone at these domains</p>
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-4">
                Any address ending in one of these is read, whoever sent it.
              </p>
              <RecipientList
                addresses={draft.allowed_domains}
                onChange={(next) => set("allowed_domains", next)}
                placeholder="adnoc.ae"
                requireAt={false}
                max={20}
              />
            </div>

            <Field label="Check for new mail every" hint="In seconds. 60 is once a minute. Anything from 15 to 3600.">
              <Input
                type="number"
                min={15}
                max={3600}
                value={draft.poll_seconds}
                onChange={(event) => set("poll_seconds", Number(event.target.value))}
              />
            </Field>

            <PushSubscription settings={settings} onDone={onSaved} />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead
              title="What it is allowed to change"
              hint="Both of these write into SharePoint. Both are off to begin with."
            />
            <div className="mt-5 space-y-5">
              <Toggle
                checked={draft.create_in_sharepoint}
                onChange={(value) => set("create_in_sharepoint", value)}
                label="Create tasks in SharePoint"
                hint="Off, it still works everything out and shows you the task it would have created — it just does not create it."
              />

              {turningOnWrites && (
                <InlineNotice tone="warn">
                  From now on it will add real tasks to the Proposals list the team works
                  in, with real people&rsquo;s names on them. You cannot undo that. Open a
                  few messages in the log first — each one shows the exact task it would
                  have created.
                </InlineNotice>
              )}

              {/* The second write, and its own switch on purpose: marking a
                  column on a row that already exists is a much smaller act than
                  creating a row and giving it to somebody, and an administrator
                  may reasonably want one without the other. */}
              <Toggle
                checked={draft.update_negotiation}
                onChange={(value) => set("update_negotiation", value)}
                label="Tick “Negotiation” on the matching task"
                hint="When a customer emails back about a price, it ticks that box on their task. Use this if you have a Power Automate flow that watches for it."
              />

              {draft.update_negotiation && (
                <Field
                  label="Value to write"
                  hint="Whatever the Negotiation column in your list expects. Usually Yes."
                >
                  <Input
                    value={draft.negotiation_value}
                    placeholder="Yes"
                    maxLength={60}
                    onChange={(event) => set("negotiation_value", event.target.value)}
                  />
                </Field>
              )}

              {draft.update_negotiation && !settings.update_negotiation && (
                <InlineNotice tone="warn">
                  Any flow watching that column will start running from the next matching
                  email. It is only ticked once per task, so a long email thread will not
                  set the flow off again and again.
                </InlineNotice>
              )}

              <Field
                label="Give new work to"
                hint="New tasks go to the next person in this team. Leave it as Everybody to use the whole company."
              >
                <Select
                  value={draft.assign_team_id ?? ""}
                  onChange={(event) => set("assign_team_id", event.target.value || null)}
                >
                  <option value="">Everybody</option>
                  {(teams.data ?? [])
                    .filter((entry) => !entry.archived_at)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </Panel>

          <Panel className="p-5">
            <PanelHead
              title="How sure it has to be"
              hint="0 to 1. Every score in the log is shown against these."
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field
                label="Before it acts on an email"
                hint="If it is less sure than this about what an email is, it does nothing. Higher is safer."
              >
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={draft.classify_threshold}
                  onChange={(event) =>
                    set("classify_threshold", Number(event.target.value))
                  }
                />
              </Field>
              <Field
                label="Before it calls it a match"
                hint="If it is less sure than this that the email is about an existing task, it treats it as new work."
              >
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={draft.match_threshold}
                  onChange={(event) => set("match_threshold", Number(event.target.value))}
                />
              </Field>
            </div>
          </Panel>

          <Panel className="p-5">
            <PanelHead title="Letting people know" hint="How the person gets told" />
            <div className="mt-5 space-y-5">
              <Toggle
                checked={draft.notify_in_app}
                onChange={(value) => set("notify_in_app", value)}
                label="In the app"
                hint="The bell, for whoever the work went to."
              />
              <Toggle
                checked={draft.notify_teams}
                onChange={(value) => set("notify_teams", value)}
                label="In Teams"
                hint="Posts to a channel as well."
              />
              {draft.notify_teams && (
                <Field label="Teams webhook address" hint="Paste the incoming webhook URL from the Teams channel.">
                  <Input
                    value={draft.teams_webhook_url ?? ""}
                    placeholder="https://…"
                    onChange={(event) => set("teams_webhook_url", event.target.value || null)}
                  />
                </Field>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-[20px] bg-panel px-5 py-3.5 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">
          {save.error ? (
            <span className="text-danger">{save.error}</span>
          ) : saved && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-positive">
              <Check className="size-3.5" strokeWidth={2.6} />
              Saved. It applies to the next message read.
            </span>
          ) : dirty ? (
            "Unsaved changes."
          ) : (
            "Everything here is saved."
          )}
        </p>
        <Button
          variant="accent"
          icon={Save}
          loading={save.pending}
          disabled={!dirty}
          onClick={() => void save.run()}
        >
          Save
        </Button>
      </div>
    </>
  );
}
