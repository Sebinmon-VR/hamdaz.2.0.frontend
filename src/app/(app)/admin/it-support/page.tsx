"use client";

import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import useSWR from "swr";
import { Bot, Plus, Save, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
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

interface ITSupportSettings {
  enabled: boolean;
  people: Person[];
  show_timing: boolean;
  due_enabled: boolean;
  due_from: string;
  due_until: string;
  due_days: number[];
  due_test_to: string;
  brain_model: string;
  brain_effort: string;
  modules: Module[];
  models: string[];
  efforts: string[];
  running: boolean;
  running_on: string | null;
  last_seen_at: string | null;
  signed_in_as: string | null;
  last_error: string | null;
  runs_here: boolean;
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
      {data.runs_here
        ? "This server may run it; restart it if it should be answering."
        : "It runs on the laptop: start the backend there (IT_SUPPORT_CHAT_ENABLED=true)."}
    </p>
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
      brain_model: form.brain_model,
      brain_effort: form.brain_effort,
      module_modes: Object.fromEntries(form.modules.map((m) => [m.key, m.mode])),
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
          <span className="text-ink-3">Trial: send every check-in to</span>
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
