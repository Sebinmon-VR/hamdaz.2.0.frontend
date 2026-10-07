"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Bot, History, Link2, MessagesSquare, Pencil, Plus, ShieldAlert, Trash2, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, decimal } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { EmployeeIn, EmployeeOptionsOut, EmployeeOut, EmployeeWriteMode } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * AI employees: named workers built on the assistant.
 *
 * Each one is the assistant's engine with a job description — its own name and
 * title, rules it must follow, a model, the modules it may use, whether it may
 * change anything, who may talk to it, and what it may spend in a month. People
 * chat with them from the Assistant screen; every chat acts as the person, never
 * with more access than they have.
 */

const WRITE_MODES: { value: EmployeeWriteMode; label: string; hint: string }[] = [
  { value: "read_only", label: "Look things up only", hint: "Every tool that changes something is withheld." },
  { value: "confirm", label: "Change things, after a yes", hint: "Every change waits for the person to confirm it." },
  { value: "policy", label: "As the assistant's permissions say", hint: "Tool by tool, as set under Permissions." },
];

const COLORS = ["#0e5e80", "#46bcec", "#ed4995", "#17663a", "#8a5a00", "#5b4bc4", "#22303f"];

const BLANK: EmployeeIn = {
  name: "",
  title: "",
  description: "",
  instructions: "",
  greeting: null,
  color: COLORS[0],
  model_key: null,
  reasoning_effort: null,
  allowed_modules: [],
  write_mode: "read_only",
  audience_roles: [],
  monthly_budget_usd: null,
  ms_account_email: null,
  teams_enabled: false,
  enabled: true,
  sort_order: 0,
};

export default function AIEmployeesPage() {
  const session = useSession();
  const list = useSWR<EmployeeOut[]>("/assistant/admin/employees", { revalidateOnFocus: false });
  const options = useSWR<EmployeeOptionsOut>("/assistant/admin/employees/options", { revalidateOnFocus: false });
  const [editing, setEditing] = useState<{ id: string | null; draft: EmployeeIn } | null>(null);

  // Back from Microsoft after connecting an account: say how it went, once.
  const [notice, setNotice] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failed = params.get("connect_error");
    if (connected) setNotice({ tone: "positive", text: `${connected}'s Microsoft 365 account is connected.` });
    else if (failed) setNotice({ tone: "danger", text: failed });
    if (connected || failed) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const connect = useAction(async (row: EmployeeOut) => {
    const { url } = await api.post<{ url: string }>(`/assistant/admin/employees/${row.id}/connect`);
    window.location.href = url;
  });
  const disconnect = useAction(async (row: EmployeeOut) => {
    if (!window.confirm(`Disconnect ${row.name}'s Microsoft 365 account? They stop answering in Teams.`)) return;
    await api.post(`/assistant/admin/employees/${row.id}/disconnect`);
    await list.mutate();
  });

  const remove = useAction(async (row: EmployeeOut) => {
    if (!window.confirm(`Remove ${row.name}? Past chats with them are kept.`)) return;
    await api.del(`/assistant/admin/employees/${row.id}`);
    await list.mutate();
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="AI employees" />
        <Empty icon={ShieldAlert} title="Super admin only" body="Creating AI employees and setting their rules is a super admin's job." />
      </>
    );
  }

  const rows = list.data ?? [];
  const moduleName = (key: string) => options.data?.modules.find((m) => m.key === key)?.name ?? key;

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="AI employees"
        count={rows.length || undefined}
        lead="Named AI workers built on the assistant, each with its own job and rules."
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setEditing({ id: null, draft: { ...BLANK } })}>
            New AI employee
          </Button>
        }
      />
      <AssistantAdminNav />

      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      {(remove.error || connect.error || disconnect.error) && (
        <InlineNotice tone="danger">{remove.error || connect.error || disconnect.error}</InlineNotice>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.mutate()} />
      ) : !list.data ? (
        <PanelSkeleton lines={6} />
      ) : rows.length === 0 ? (
        <Panel className="p-6">
          <Empty
            icon={Bot}
            title="No AI employees yet"
            body="Create one — for example a pre-sales engineer who reads enquiries and looks up past quotes — and people can chat with it from the Assistant screen."
            action={
              <Button variant="accent" icon={Plus} onClick={() => setEditing({ id: null, draft: { ...BLANK } })}>
                New AI employee
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Panel key={row.id} className={clsx("flex flex-col gap-3 p-5", !row.enabled && "opacity-60")}>
              <div className="flex items-start gap-3">
                <Initials name={row.name} color={row.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink">{row.name}</span>
                    {!row.enabled && <Badge>Off</Badge>}
                  </div>
                  <div className="text-[12.5px] text-ink-3">{row.title}</div>
                </div>
              </div>
              {row.description && <p className="line-clamp-3 text-[12.5px] text-ink-2">{row.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={row.write_mode === "read_only" ? "neutral" : row.write_mode === "confirm" ? "info" : "warn"}>
                  {WRITE_MODES.find((w) => w.value === row.write_mode)?.label}
                </Badge>
                <Badge tone="accent">
                  {row.allowed_modules.length ? `${row.allowed_modules.length} module(s)` : "All modules"}
                </Badge>
                <Badge>{row.model_key ?? "Assistant's model"}</Badge>
                {row.audience_roles.length > 0 && <Badge tone="second">{row.audience_roles.join(", ")}</Badge>}
              </div>
              {row.allowed_modules.length > 0 && (
                <p className="text-[11.5px] text-ink-4">{row.allowed_modules.map(moduleName).join(" · ")}</p>
              )}
              <TeamsLine
                row={row}
                busy={connect.pending || disconnect.pending}
                onConnect={() => connect.run(row)}
                onDisconnect={() => disconnect.run(row)}
              />
              <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[12px] text-ink-3">
                <span>
                  This month ${decimal(row.month_spend_usd, { min: 2 })}
                  {row.monthly_budget_usd ? ` of $${decimal(row.monthly_budget_usd, { min: 0 })}` : ""}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <LinkButton size="sm" icon={History} href={`/admin/assistant/employees/${row.id}/history`}>
                    Chat history
                  </LinkButton>
                  <Button
                    size="sm"
                    icon={Pencil}
                    onClick={() => setEditing({ id: row.id, draft: toDraft(row) })}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove.run(row)} aria-label={`Remove ${row.name}`} />
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <EmployeeForm
          id={editing.id}
          initial={editing.draft}
          options={options.data}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await list.mutate();
          }}
        />
      )}
    </>
  );
}

function toDraft(row: EmployeeOut): EmployeeIn {
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    month_spend_usd: _m,
    account_status: _s,
    account_email: _e,
    account_error: _r,
    account_last_poll_at: _p,
    account_activity: _a,
    ...draft
  } = row;
  return draft;
}

/** Its Microsoft 365 account and whether it is answering in Teams. */
function TeamsLine({
  row,
  busy,
  onConnect,
  onDisconnect,
}: {
  row: EmployeeOut;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!row.ms_account_email) {
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-4">
        <MessagesSquare className="size-3.5" /> No Microsoft 365 account — set one under Edit to use Teams.
      </p>
    );
  }
  const connected = row.account_status === "connected";
  return (
    <div className="space-y-1.5 rounded-[12px] bg-panel-2 px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-3.5 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-ink-2">{row.ms_account_email}</span>
        {connected ? (
          <Badge tone={row.teams_enabled ? "positive" : "neutral"}>
            {row.teams_enabled ? "Answering in Teams" : "Connected"}
          </Badge>
        ) : row.account_status === "needs_reconnect" ? (
          <Badge tone="danger">Reconnect</Badge>
        ) : (
          <Badge tone="warn">Not connected</Badge>
        )}
      </div>
      {row.account_error && <p className="text-danger">{row.account_error}</p>}
      {connected && (
        <p className="text-ink-4">
          {row.account_last_poll_at
            ? `Last checked Teams ${dateTime(row.account_last_poll_at)}`
            : row.teams_enabled
              ? "Not checked yet — is AI_TEAMS_ENABLED=true on the server?"
              : "Switch on “Answer Teams chats” under Edit to start."}
        </p>
      )}
      {row.account_activity.length === 0 ? (
        <p className="text-ink-4">Teams activity: nothing yet. Each message it sees is listed here.</p>
      ) : (
        <details className="group" open>
          <summary className="cursor-pointer select-none text-ink-3 hover:text-ink">
            Teams activity ({row.account_activity.length})
          </summary>
          <ol className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {row.account_activity.map((a, i) => (
              <li key={i} className="rounded-[10px] bg-panel px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    tone={a.outcome === "error" ? "danger" : a.outcome === "ignored" ? "neutral" : a.outcome === "asked" ? "info" : "positive"}
                  >
                    {a.outcome}
                  </Badge>
                  <span className="truncate text-ink-2">{a.from ?? "—"}</span>
                  <span className="text-ink-4">· {a.chat}</span>
                  <span className="tnum ml-auto shrink-0 text-ink-4">{dateTime(a.at)}</span>
                </div>
                <p className="mt-0.5 break-words text-ink-3">{a.detail}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="flex gap-1.5">
        {connected ? (
          <Button size="sm" variant="ghost" icon={Unlink} disabled={busy} onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="accent" icon={Link2} disabled={busy} onClick={onConnect}>
            Connect account
          </Button>
        )}
      </div>
    </div>
  );
}

function Initials({ name, color }: { name: string; color: string }) {
  const letters = name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "AI";
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
      style={{ background: color }}
    >
      {letters}
    </span>
  );
}

function EmployeeForm({
  id,
  initial,
  options,
  onClose,
  onSaved,
}: {
  id: string | null;
  initial: EmployeeIn;
  options: EmployeeOptionsOut | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<EmployeeIn>(initial);
  const set = <K extends keyof EmployeeIn>(key: K, value: EmployeeIn[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleIn = (key: "allowed_modules" | "audience_roles", value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  const save = useAction(async () => {
    const body = {
      ...draft,
      name: draft.name.trim(),
      title: draft.title.trim(),
      monthly_budget_usd: draft.monthly_budget_usd ? String(draft.monthly_budget_usd) : null,
    };
    if (id) await api.put(`/assistant/admin/employees/${id}`, body);
    else await api.post("/assistant/admin/employees", body);
    await onSaved();
  });

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={id ? `Edit ${initial.name}` : "New AI employee"}
      description="Its job, its rules and its reach. It always acts as the person talking to it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!draft.name.trim() || !draft.title.trim()}
            onClick={() => save.run()}
          >
            {id ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="Nora" />
          </Field>
          <Field label="Job title" required>
            <Input value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="Pre-sales engineer" />
          </Field>
        </div>

        <Field label="What they do" hint="Their job, as you would describe it to a new hire.">
          <Textarea
            value={draft.description}
            maxLength={4000}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Reads new enquiries, checks whether we have quoted the items before, finds suppliers and prepares the quote request for the engineer to review."
          />
        </Field>

        <Field label="Rules" hint="Instructions they must follow, one per line. They override anything a person asks to the contrary.">
          <Textarea
            value={draft.instructions}
            maxLength={12000}
            className="min-h-32"
            onChange={(e) => set("instructions", e.target.value)}
            placeholder={"Never give a customer price without a supplier quote behind it.\nAnswer in English, briefly.\nIf unsure, say so and suggest who to ask."}
          />
        </Field>

        <Field label="Greeting" hint="The first thing they say in a new chat. Blank for a default.">
          <Input value={draft.greeting ?? ""} maxLength={1000} onChange={(e) => set("greeting", e.target.value || null)} placeholder="Hi, I'm Nora. Which enquiry shall we look at?" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Model">
            <Select value={draft.model_key ?? ""} onChange={(e) => set("model_key", e.target.value || null)}>
              <option value="">Assistant&apos;s model{options ? ` (${options.assistant_model})` : ""}</option>
              {options?.models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Thinking">
            <Select
              value={draft.reasoning_effort ?? ""}
              onChange={(e) => set("reasoning_effort", (e.target.value || null) as EmployeeIn["reasoning_effort"])}
            >
              <option value="">Assistant&apos;s setting</option>
              <option value="low">Low — quickest</option>
              <option value="medium">Medium</option>
              <option value="high">High — most careful</option>
            </Select>
          </Field>
          <Field label="Monthly budget (USD)" hint="Blank for no cap.">
            <Input
              type="number"
              min={0}
              step="1"
              value={draft.monthly_budget_usd ?? ""}
              onChange={(e) => set("monthly_budget_usd", e.target.value || null)}
              placeholder="25"
            />
          </Field>
        </div>

        <Field label="What they may change">
          <div className="grid gap-2 sm:grid-cols-3">
            {WRITE_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => set("write_mode", mode.value)}
                className={clsx(
                  "rounded-[14px] border px-3.5 py-2.5 text-left transition",
                  draft.write_mode === mode.value ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
                )}
              >
                <div className="text-[12.5px] font-semibold text-ink">{mode.label}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{mode.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Modules they may use" hint="None ticked means every module the assistant offers. Moving around the app is always allowed.">
          <ChipPicker
            options={options?.modules ?? []}
            selected={draft.allowed_modules}
            onToggle={(key) => toggleIn("allowed_modules", key)}
          />
        </Field>

        <Field label="Who may talk to them" hint="None ticked means everyone who has the assistant.">
          <ChipPicker
            options={options?.roles ?? []}
            selected={draft.audience_roles}
            onToggle={(key) => toggleIn("audience_roles", key)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colour">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => set("color", c)}
                  className={clsx("size-8 rounded-full ring-offset-2 transition", draft.color === c && "ring-2 ring-accent")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Order">
            <Input type="number" value={draft.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} />
          </Field>
        </div>

        <div className="space-y-3 rounded-[16px] border border-line p-4">
          <div className="text-[13px] font-semibold text-ink">Microsoft 365 account (Teams)</div>
          <Field
            label="Account address"
            hint="A real Microsoft 365 user created for this AI employee, with a Teams licence — e.g. luna@hamdaz.com. After saving, press Connect account on the card and sign in as it."
          >
            <Input
              type="email"
              value={draft.ms_account_email ?? ""}
              maxLength={320}
              onChange={(e) => set("ms_account_email", e.target.value.trim() || null)}
              placeholder="luna@hamdaz.com"
            />
          </Field>
          <Toggle
            checked={draft.teams_enabled}
            onChange={(v) => set("teams_enabled", v)}
            label="Answer Teams chats"
            hint="Replies as this account to one-to-one chats, and to group chats where it is @mentioned — always acting as the person who wrote."
          />
        </div>

        <Toggle
          checked={draft.enabled}
          onChange={(v) => set("enabled", v)}
          label="Switched on"
          hint="Off hides them from everyone and stops their chats."
        />
      </div>
    </Modal>
  );
}

function ChipPicker({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; name: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  if (!options.length) return <p className="text-[12px] text-ink-4">Loading…</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onToggle(o.key)}
            aria-pressed={on}
            className={clsx(
              "rounded-full border px-3 py-1 text-[12px] transition",
              on ? "border-accent bg-accent text-accent-ink" : "border-line text-ink-2 hover:border-line-strong",
            )}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
