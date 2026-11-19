"use client";

import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import useSWR from "swr";
import { Bot, LogIn, LogOut, Paperclip, Plus, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { api, apiUrl, withQuery } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Button, Input, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * IT Support in Teams: the AI that answers chats sent to itsupport@ as that
 * account. Who it answers, the due-today check-ins, its model, and what it
 * may do in each ERP module. The worker reads this every 30 seconds, so a
 * change reaches the chat without a restart. Super admins only.
 */
interface Person {
  email: string;
  name: string;
  has_account?: boolean;
}

interface Module {
  key: string;
  name: string;
  default: Mode;
  max: Mode;
  mode: Mode;
}

type Mode = "off" | "read" | "write";

interface Feature {
  key: string;
  name: string;
  about: string;
  group: string;
  default: boolean;
  on: boolean;
  /** It messages people unasked. */
  sends: boolean;
  /** It changes something in the ERP. */
  writes: boolean;
}

interface ActivityRow {
  at: string;
  email: string;
  kind: string;
  summary: string;
  ok: boolean;
  cost_usd: number | null;
  detail: Record<string, unknown>;
}

interface ActivityPage {
  rows: ActivityRow[];
  spend: { day: string; usd: number; turns: number }[];
}

interface ChatRow {
  chat_id: string;
  email: string;
  name: string;
  /** On the people list: the agent answers them now. */
  answered: boolean;
  last_at: string | null;
}

interface ChatMessage {
  id: string;
  at: string | null;
  /** Sent by IT Support (the agent). */
  mine: boolean;
  sender: string;
  text: string;
  files: string[];
  reactions: string[];
  deleted: boolean;
}

interface ChatPage {
  messages: ChatMessage[];
  /** The cursor for older messages; null at the start of the chat. */
  more: string | null;
}

interface ITSupportSettings {
  enabled: boolean;
  people: Person[];
  show_timing: boolean;
  due_enabled: boolean;
  due_from: string;
  due_until: string;
  due_days: number[];
  due_test_to: string;
  brief_enabled: boolean;
  brief_at: string;
  brain_model: string;
  brain_effort: string;
  modules: Module[];
  features?: Feature[];
  models: string[];
  efforts: string[];
  running: boolean;
  running_on: string | null;
  last_seen_at: string | null;
  signed_in_as: string | null;
  last_error: string | null;
  runs_here: boolean;
  connected: boolean;
  connected_account: string | null;
  connected_at: string | null;
  connected_by: string | null;
}

const KEY = "/it-support/settings";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MODES: Mode[] = ["off", "read", "write"];
const MODEL_NAMES: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5 (fast, cheapest)",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5-5": "Opus 5.5 (most capable, dearest)",
};

export default function ITSupportPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldCheck}
        title="Super admins only"
        body="This decides whose Teams chats the AI answers and what it may do in the ERP."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="IT Support agent"
        lead="The AI that answers Teams chats sent to IT Support, as that account."
      />
      <SettingsForm />
      <Chats />
      <Activity />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-4 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr]">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-4">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

function Status({ data }: { data: ITSupportSettings }) {
  if (data.running) {
    return (
      <p className="text-[12px] text-ink-3">
        <Badge tone={data.enabled ? "positive" : "warn"}>{data.enabled ? "Answering" : "Running, switched off"}</Badge>{" "}
        on {data.running_on}, signed in as {data.signed_in_as ?? "—"}, checked {relative(data.last_seen_at!)}.
      </p>
    );
  }
  return (
    <p className="text-[12px] text-ink-3">
      <Badge tone="danger">Not running</Badge>{" "}
      {data.last_seen_at
        ? `Last seen on ${data.running_on} ${relative(data.last_seen_at)}.`
        : "No machine has run it since this page existed."}{" "}
      {!data.runs_here
        ? "It runs on the laptop: start the backend there (IT_SUPPORT_CHAT_ENABLED=true)."
        : data.connected
          ? "This server runs it; it starts within 30 seconds of connecting."
          : "This server runs it once the IT Support account is connected below."}
    </p>
  );
}

/** Why Microsoft sent the browser back without a connection. */
const CONNECT_ERRORS: Record<string, string> = {
  sign_in_failed: "Microsoft sign-in did not complete. Try connecting again.",
  permission_not_granted: "Microsoft did not grant the chat permissions. Try again, or ask an admin to consent.",
  wrong_account: "That was not the IT Support account. Sign in as IT Support, not as yourself; nothing was kept.",
  expired_login: "The sign-in took too long. Try connecting again.",
};

function Connection({ data, onChange }: { data: ITSupportSettings; onChange: (next: ITSupportSettings) => void }) {
  const [notice, setNotice] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  // Microsoft sends the browser back here with ?connected=1 or ?connect_error=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setNotice({ tone: "positive", text: "IT Support connected. The agent starts within 30 seconds." });
    }
    const failed = params.get("connect_error") ?? params.get("error");
    if (failed) {
      const who = params.get("account");
      setNotice({
        tone: "danger",
        text: (CONNECT_ERRORS[failed] ?? `Connecting failed: ${failed}`) + (who ? ` (signed in as ${who})` : ""),
      });
    }
    if (params.has("connected") || params.has("connect_error")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const disconnect = useAction(async () => {
    if (!window.confirm("Disconnect IT Support? The agent on the server stops answering within 30 seconds.")) return;
    onChange(await api.del<ITSupportSettings>("/it-support/connect"));
    setNotice(null);
  });
  return (
    <Section
      title="Connection"
      hint="The agent chats as the IT Support account, so that account signs in once. Sign in as IT Support, not as yourself."
    >
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      {disconnect.error && <InlineNotice tone="danger">{disconnect.error}</InlineNotice>}
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        {data.connected ? (
          <>
            <Badge tone="positive">Connected</Badge>
            <span className="text-ink-3">
              as {data.connected_account}
              {data.connected_at && `, ${relative(data.connected_at)}`}
              {data.connected_by && ` by ${data.connected_by}`}
            </span>
          </>
        ) : (
          <Badge tone="danger">Not connected</Badge>
        )}
        <span className="flex-1" />
        <a
          href={apiUrl("/it-support/connect")}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3.5 text-[12px] font-medium hover:bg-panel-2"
        >
          <LogIn className="size-3.5" />
          {data.connected ? "Connect again" : "Connect IT Support"}
        </a>
        {data.connected && (
          <Button size="sm" icon={LogOut} loading={disconnect.pending} onClick={() => void disconnect.run()}>
            Disconnect
          </Button>
        )}
      </div>
    </Section>
  );
}

function SettingsForm() {
  const { data, error, mutate } = useSWR<ITSupportSettings>(KEY, { revalidateOnFocus: true, refreshInterval: 30000 });
  const [form, setForm] = useState<ITSupportSettings | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftName, setDraftName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Refreshes (every 30 s, for the status) don't wipe unsaved edits.
    if (data && !dirty) setForm(data);
  }, [data, dirty]);

  function change(patch: Partial<ITSupportSettings>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
    setSaved(false);
  }

  const save = useAction(async () => {
    if (!form) return;
    setSaved(false);
    const next = await api.patch<ITSupportSettings>(KEY, {
      enabled: form.enabled,
      people: form.people.map(({ email, name }) => ({ email, name })),
      show_timing: form.show_timing,
      due_enabled: form.due_enabled,
      due_from: form.due_from,
      due_until: form.due_until,
      due_days: form.due_days,
      due_test_to: form.due_test_to,
      brief_enabled: form.brief_enabled,
      brief_at: form.brief_at,
      brain_model: form.brain_model,
      brain_effort: form.brain_effort,
      module_modes: Object.fromEntries(form.modules.map((m) => [m.key, m.mode])),
      features: Object.fromEntries((form.features ?? []).map((f) => [f.key, f.on])),
    });
    await mutate(next, { revalidate: false });
    setForm(next);
    setDirty(false);
    setSaved(true);
  });

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data || !form) return <PanelSkeleton lines={6} />;

  function addPerson() {
    if (!form) return;
    const email = draftEmail.trim().toLowerCase();
    if (!email.includes("@")) return setAddError("That isn't an email address.");
    if (form.people.some((p) => p.email === email)) return setAddError("Already in the list.");
    change({ people: [...form.people, { email, name: draftName.trim() }] });
    setDraftEmail("");
    setDraftName("");
    setAddError(null);
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start gap-3 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Bot className="size-4 text-ink-3" /> IT Support{" "}
            {data.enabled ? <Badge tone="positive">On</Badge> : <Badge tone="danger">Off</Badge>}
          </h2>
          <div className="mt-1">
            <Status data={data} />
          </div>
          {data.last_error && (
            <p className="mt-1 text-[11.5px] text-danger">Last problem: {data.last_error}</p>
          )}
        </div>
        <Button
          variant="accent"
          size="sm"
          icon={Save}
          loading={save.pending}
          disabled={!dirty}
          onClick={() => void save.run()}
        >
          Save
        </Button>
      </div>
      {save.error && <InlineNotice tone="danger" className="mb-3">{save.error}</InlineNotice>}
      {saved && !save.error && (
        <InlineNotice tone="positive" className="mb-3">Saved. The agent picks it up within 30 seconds.</InlineNotice>
      )}

      <Connection
        data={data}
        onChange={(next) => {
          void mutate(next, { revalidate: false });
        }}
      />

      <Section title="Switch" hint="Off: no chat is answered and no check-in is sent, on any machine.">
        <Toggle checked={form.enabled} onChange={(v) => change({ enabled: v })} label="Answer chats" />
      </Section>

      <Section
        title="Who it answers"
        hint="Anyone else's chat with IT Support is left alone for a person to answer. It works the ERP as the person, with their own module access."
      >
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-4">
              <th className="pb-1.5 font-medium">Email</th>
              <th className="pb-1.5 font-medium">Call them</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {form.people.map((p, i) => (
              <tr key={p.email}>
                <td className="py-1.5 pr-3">
                  {p.email}{" "}
                  {p.has_account === false && (
                    <Badge tone="warn" title="Without an ERP account it can only chat; it can't read their tasks or modules.">
                      no ERP account
                    </Badge>
                  )}
                  {p.has_account === undefined && <Badge tone="info">new</Badge>}
                </td>
                <td className="py-1.5 pr-3">
                  <Input
                    value={p.name}
                    placeholder="first word of their Teams name"
                    className="h-8! max-w-56 rounded-xl! px-3! text-[12.5px]"
                    onChange={(e) =>
                      change({
                        people: form.people.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)),
                      })
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    aria-label={`Remove ${p.email}`}
                    className="rounded-full p-1 text-ink-4 hover:bg-panel-2 hover:text-danger"
                    onClick={() => change({ people: form.people.filter((_, j) => j !== i) })}
                  >
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {form.people.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-ink-4">Nobody yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draftEmail}
            placeholder="someone@hamdaz.com"
            className="h-8! max-w-64 rounded-xl! px-3! text-[12.5px]"
            onChange={(e) => setDraftEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
          <Input
            value={draftName}
            placeholder="call them (optional)"
            className="h-8! max-w-48 rounded-xl! px-3! text-[12.5px]"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
          <Button size="sm" icon={Plus} onClick={addPerson}>
            Add
          </Button>
        </div>
        {addError && <p className="text-[11.5px] text-danger">{addError}</p>}
      </Section>

      <Section
        title="Morning brief"
        hint="At the start of the working day, one short message to each person with what closes today, anything early tomorrow, and anything past its BCD. Nothing due, nothing sent. Skips people on leave."
      >
        <Toggle
          checked={form.brief_enabled}
          onChange={(v) => change({ brief_enabled: v })}
          label="Send the morning brief"
          hint="Off until you decide to send. Preview with python -m app.itsupport.brief."
        />
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-ink-3">At (IST, on the working days below)</span>
          <Input
            type="time"
            value={form.brief_at}
            className="h-8! w-28 rounded-xl! px-3! text-[12.5px]"
            onChange={(e) => change({ brief_at: e.target.value })}
          />
        </div>
      </Section>

      <Section
        title="Due-today check-ins"
        hint="IT Support messages a person first when a task of theirs has its BCD today. Once per task."
      >
        <Toggle
          checked={form.due_enabled}
          onChange={(v) => change({ due_enabled: v })}
          label="Send check-ins"
          hint="Off until you decide to send. Preview with python -m app.itsupport.due."
        />
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-ink-3">Office hours (IST)</span>
          <Input
            type="time"
            value={form.due_from}
            className="h-8! w-28 rounded-xl! px-3! text-[12.5px]"
            onChange={(e) => change({ due_from: e.target.value })}
          />
          <span className="text-ink-4">to</span>
          <Input
            type="time"
            value={form.due_until}
            className="h-8! w-28 rounded-xl! px-3! text-[12.5px]"
            onChange={(e) => change({ due_until: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((label, d) => {
            const on = form.due_days.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  change({
                    due_days: on ? form.due_days.filter((x) => x !== d) : [...form.due_days, d].sort(),
                  })
                }
                className={clsx(
                  "h-7 rounded-full px-3 text-[12px] transition",
                  on ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-3 hover:text-ink",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-ink-3">Trial: send everything it sends unasked to</span>
          <Select
            value={form.due_test_to}
            className="h-8! min-w-56 rounded-xl! pl-3! text-[12.5px]"
            onChange={(e) => change({ due_test_to: e.target.value })}
          >
            <option value="">each task's holder (no trial)</option>
            {form.people.map((p) => (
              <option key={p.email} value={p.email}>
                {p.email}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      {form.features && form.features.length > 0 && (
        <Section
          title="Features"
          hint="Anything that messages people unasked or changes the ERP ships off; answers to questions ship on. The trial address above catches every message it sends unasked."
        >
          {Array.from(new Set(form.features.map((f) => f.group))).map((group) => (
            <div key={group} className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-4">{group}</p>
              {form.features!
                .filter((f) => f.group === group)
                .map((f) => (
                  <div key={f.key} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Toggle
                        checked={f.on}
                        onChange={(v) =>
                          change({
                            features: form.features!.map((x) => (x.key === f.key ? { ...x, on: v } : x)),
                          })
                        }
                        label={f.name}
                        hint={f.about}
                      />
                    </div>
                    <div className="flex shrink-0 gap-1 pt-0.5">
                      {f.sends && <Badge tone="warn">sends</Badge>}
                      {f.writes && <Badge tone="info">writes</Badge>}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </Section>
      )}

      <Section title="Model" hint="Rules answer first; this model handles the rest. A picture or scan always goes to Claude.">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <Select
            value={form.brain_model}
            className="h-8! min-w-64 rounded-xl! pl-3! text-[12.5px]"
            onChange={(e) => change({ brain_model: e.target.value })}
          >
            {data.models.map((m) => (
              <option key={m} value={m}>
                {MODEL_NAMES[m] ?? m}
              </option>
            ))}
          </Select>
          <span className="text-ink-3">effort</span>
          <Select
            value={form.brain_effort}
            className="h-8! w-32 rounded-xl! pl-3! text-[12.5px]"
            onChange={(e) => change({ brain_effort: e.target.value })}
          >
            {data.efforts.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </div>
        <Toggle
          checked={form.show_timing}
          onChange={(v) => change({ show_timing: v })}
          label="Show timing under each reply"
          hint="For trials: how long the reply took and which model wrote it."
        />
      </Section>

      <Section
        title="What it may do per module"
        hint="On top of each person's own access: it never reaches a module they can't open. Changes are always asked about first; deletes and mail are never done from the chat."
      >
        <table className="w-full text-[12.5px]">
          <tbody className="divide-y divide-line">
            {form.modules.map((m, i) => (
              <tr key={m.key}>
                <td className="py-1.5 pr-3">{m.name}</td>
                <td className="py-1.5 text-right">
                  <div className="inline-flex rounded-full bg-panel-2 p-0.5">
                    {MODES.map((mode) => {
                      const allowed = MODES.indexOf(mode) <= MODES.indexOf(m.max);
                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={!allowed}
                          aria-pressed={m.mode === mode}
                          title={allowed ? undefined : m.max === "off" ? "Always off" : "Changes here are made in the app"}
                          onClick={() =>
                            change({ modules: form.modules.map((x, j) => (j === i ? { ...x, mode } : x)) })
                          }
                          className={clsx(
                            "h-6 rounded-full px-2.5 text-[11.5px] capitalize transition disabled:cursor-not-allowed disabled:opacity-30",
                            m.mode === mode ? "bg-accent text-accent-ink" : "text-ink-3 hover:text-ink",
                          )}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Panel>
  );
}

const KIND_LABEL: Record<string, string> = {
  change: "Change",
  answer: "Status answer",
  sent: "Sent",
  feedback: "👎",
};

/** What the agent did: changes it made, answers it filed, messages it sent unasked, and 👎 on its replies; with the model spend per day. */
function Activity() {
  const [kind, setKind] = useState("");
  const { data, error, mutate } = useSWR<ActivityPage>(
    `/it-support/activity${kind ? `?kind=${kind}` : ""}`,
    { refreshInterval: 60000 },
  );
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <h2 className="flex-1 text-[15px] font-semibold tracking-tight">Activity</h2>
        <Select value={kind} className="h-8! min-w-44 rounded-xl! pl-3! text-[12.5px]" onChange={(e) => setKind(e.target.value)}>
          <option value="">Everything</option>
          <option value="change">Changes in the ERP</option>
          <option value="answer">Status answers</option>
          <option value="sent">Sent unasked</option>
          <option value="feedback">👎 feedback</option>
        </Select>
      </div>
      {!data ? (
        <PanelSkeleton lines={4} />
      ) : (
        <>
          {data.spend.length > 0 && (
            <p className="pb-3 text-[12px] text-ink-3">
              Model spend:{" "}
              {data.spend.slice(0, 7).map((d, i) => (
                <span key={d.day}>
                  {i > 0 && " · "}
                  {d.day.slice(5)} ${d.usd.toFixed(2)} ({d.turns})
                </span>
              ))}
            </p>
          )}
          {data.rows.length === 0 ? (
            <p className="text-[12.5px] text-ink-4">Nothing yet.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-4">
                  <th className="pb-1.5 font-medium">When</th>
                  <th className="pb-1.5 font-medium">For</th>
                  <th className="pb-1.5 font-medium">Kind</th>
                  <th className="pb-1.5 font-medium">What</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r, i) => (
                  <tr key={`${r.at}-${i}`} className={clsx(!r.ok && r.kind !== "feedback" && "text-danger")}>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink-3" title={r.at}>
                      {relative(r.at)}
                    </td>
                    <td className="py-1.5 pr-3">{r.email.split("@")[0]}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="py-1.5">
                      {r.summary}
                      {!r.ok && r.kind !== "feedback" && " (failed)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Panel>
  );
}

const REACTIONS: Record<string, string> = {
  like: "👍",
  heart: "❤️",
  laugh: "😆",
  surprised: "😮",
  sad: "😢",
  angry: "😠",
  dislike: "👎",
};

/** Each person's chat with IT Support as Teams has it, read-only: what they wrote and what the agent answered. */
function Chats() {
  const { data: chats, error, mutate } = useSWR<ChatRow[]>("/it-support/chats", { refreshInterval: 60000 });
  const [picked, setPicked] = useState("");
  const chatId = picked || chats?.[0]?.chat_id || "";
  const { data: page, error: pageError, mutate: reload } = useSWR<ChatPage>(
    chatId ? withQuery("/it-support/chats/messages", { chat_id: chatId }) : null,
    { refreshInterval: 20000 },
  );
  // Older pages, for the chat they were loaded for.
  const [older, setOlder] = useState<{ chat: string; messages: ChatMessage[]; more: string | null } | null>(null);
  const earlier = older?.chat === chatId ? older : null;
  const cursor = earlier ? earlier.more : (page?.more ?? null);
  const loadOlder = useAction(async () => {
    if (!cursor) return;
    const next = await api.get<ChatPage>("/it-support/chats/messages", { chat_id: chatId, more: cursor });
    setOlder({ chat: chatId, messages: [...(earlier?.messages ?? []), ...next.messages], more: next.more });
  });
  const seen = new Set<string>();
  const messages = [...(page?.messages ?? []), ...(earlier?.messages ?? [])]
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .reverse();
  const current = chats?.find((c) => c.chat_id === chatId);

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <h2 className="flex-1 text-[15px] font-semibold tracking-tight">Chats</h2>
        {chats && chats.length > 0 && (
          <Select
            value={chatId}
            className="h-8! min-w-56 rounded-xl! pl-3! text-[12.5px]"
            onChange={(e) => setPicked(e.target.value)}
          >
            {chats.map((c) => (
              <option key={c.chat_id} value={c.chat_id}>
                {c.name}
                {c.last_at ? ` · ${relative(c.last_at)}` : ""}
                {c.answered ? "" : " (not answered)"}
              </option>
            ))}
          </Select>
        )}
        <Button size="sm" icon={RefreshCw} onClick={() => void Promise.all([mutate(), reload()])}>
          Refresh
        </Button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !chats ? (
        <PanelSkeleton lines={4} />
      ) : chats.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">No chats with IT Support yet.</p>
      ) : pageError ? (
        <ErrorState error={pageError} onRetry={() => reload()} />
      ) : !page ? (
        <PanelSkeleton lines={6} />
      ) : (
        <>
          <p className="pb-2 text-[11.5px] text-ink-4">
            {current?.email} · read-only, as Teams has it · newest at the bottom
          </p>
          {cursor && (
            <div className="pb-2">
              <Button size="sm" loading={loadOlder.pending} onClick={() => void loadOlder.run()}>
                Show older
              </Button>
              {loadOlder.error && <span className="pl-3 text-[12px] text-danger">{loadOlder.error}</span>}
            </div>
          )}
          {messages.length === 0 ? (
            <p className="text-[12.5px] text-ink-4">Nothing in this chat yet.</p>
          ) : (
            <div className="max-h-[560px] divide-y divide-line overflow-y-auto border-y border-line">
              {messages.map((m) => (
                <div key={m.id} className="grid grid-cols-[92px_1fr] gap-3 py-2 text-[12.5px]">
                  <div className="text-[11.5px] leading-tight">
                    <div className={clsx("font-medium", m.mine ? "text-accent-text" : "text-ink-2")}>
                      {m.mine ? "IT Support" : m.sender || current?.name}
                    </div>
                    <div className="text-ink-4" title={m.at ? dateTime(m.at) : undefined}>
                      {m.at ? relative(m.at) : ""}
                    </div>
                  </div>
                  <div className={clsx("min-w-0 whitespace-pre-wrap break-words", m.deleted && "italic text-ink-4")}>
                    {m.deleted ? "Deleted" : m.text}
                    {m.files.map((f) => (
                      <span key={f} className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-3">
                        <Paperclip className="size-3" />
                        {f}
                      </span>
                    ))}
                    {m.reactions.length > 0 && (
                      <span className="mt-0.5 block text-[12px]">
                        {m.reactions.map((r, i) => (
                          <span key={`${r}-${i}`} className="pr-1">
                            {REACTIONS[r] ?? r}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
