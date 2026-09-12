"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ArchiveRestore, Plus, Save, ShieldAlert, Trash2, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TeamOut, WorkflowOut, WorkflowSettingsIn, WorkflowSettingsOut } from "@/lib/types";
import { TRIGGER_LABEL, useAdminFlows, useWorkflowSettings } from "@/lib/workflows";
import { Badge, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";

/**
 * The switches and the flows.
 *
 * The three switches sit above the flows on purpose. A flow is a list of
 * steps that send mail, create quotes in Zoho and write to SharePoint as
 * whoever started it, and the switches are what make each of those real:
 * with one off, the step still runs, composes what it would have done, and
 * holds it — so the flow can be walked end to end, audited, and only then
 * let loose. Somebody building a flow needs to see that state before they
 * press anything.
 */
export default function WorkflowAdminPage() {
  const session = useSession();
  const router = useRouter();
  const settings = useWorkflowSettings();
  const flows = useAdminFlows();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Workflows" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="A workflow sends mail and writes to Zoho on somebody's behalf. Deciding what it does is a super admin's call, and the endpoints behind this screen enforce that themselves."
        />
      </>
    );
  }

  const all = flows.data ?? [];
  const rows = all.filter((f) => showArchived || !f.archived_at);
  const openRuns = all.reduce((sum, f) => sum + f.open_runs, 0);

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Workflows"
        count={flows.data ? num(rows.length) : undefined}
        lead="What each flow does, in which order, and whether it is allowed to do it for real."
        actions={
          <>
            <Toggle checked={showArchived} onChange={setShowArchived} label="Show retired" />
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              New workflow
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Flows" value={num(all.filter((f) => !f.archived_at).length)} />
        <StatBox
          label="Switched on"
          value={num(all.filter((f) => f.enabled && !f.archived_at).length)}
        />
        <StatBox
          label="Runs going"
          value={num(openRuns)}
          tone={openRuns > 0 ? "second" : undefined}
        />
        <StatBox
          label="Live switches"
          value={
            settings.data
              ? num(
                  [settings.data.send_email, settings.data.write_sharepoint, settings.data.write_zoho].filter(
                    Boolean,
                  ).length,
                ) + "/3"
              : "—"
          }
          hint="How many of mail, SharePoint and Zoho a flow may actually touch."
        />
      </div>

      {settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.mutate()} />
      ) : !settings.data ? (
        <PanelSkeleton lines={5} />
      ) : (
        <Switches settings={settings.data} onSaved={(next) => settings.mutate(next, { revalidate: false })} />
      )}

      {flows.error ? (
        <ErrorState error={flows.error} onRetry={() => flows.mutate()} />
      ) : !flows.data ? (
        <RowsSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Workflow}
          title={all.length === 0 ? "No workflows" : "Nothing but retired ones"}
          body="A workflow is an ordered list of blocks — read the documents, ask the person, find suppliers, send mail, wait, compare, create the quote — with a small config on each."
          action={
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              New workflow
            </Button>
          }
        />
      ) : (
        <Panel className="p-5">
          <PanelHead title="Flows" count={rows.length} />
          <ul className="mt-4 space-y-1.5">
            {rows.map((flow) => (
              <FlowRow key={flow.key} flow={flow} onChanged={() => flows.mutate()} />
            ))}
          </ul>
        </Panel>
      )}

      <NewFlow
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(flow) => {
          setCreating(false);
          void flows.mutate();
          router.push(`/admin/workflows/${flow.key}`);
        }}
      />
    </>
  );
}

/* ── the switches ────────────────────────────────────────────────────── */

/**
 * Each toggle saves as it is flipped — a switch with a Save button is a
 * switch somebody forgets to press. The mailbox and the poll interval are
 * typed, so they get a button.
 */
function Switches({
  settings,
  onSaved,
}: {
  settings: WorkflowSettingsOut;
  onSaved: (next: WorkflowSettingsOut) => void;
}) {
  const [mailbox, setMailbox] = useState(settings.from_mailbox ?? "");
  const [poll, setPoll] = useState(String(settings.poll_seconds));
  const [seen, setSeen] = useState(settings);
  if (seen !== settings) {
    setSeen(settings);
    setMailbox(settings.from_mailbox ?? "");
    setPoll(String(settings.poll_seconds));
  }

  const save = useAction(async (body: WorkflowSettingsIn) =>
    api.patch<WorkflowSettingsOut>("/workflows/admin/settings", body),
  );
  async function flip(body: WorkflowSettingsIn) {
    const next = await save.run(body);
    if (next) onSaved(next);
  }

  const pollNumber = Number(poll);
  const pollBad = !poll.trim() || Number.isNaN(pollNumber) || pollNumber < 30 || pollNumber > 3600;
  const dirty = mailbox.trim() !== (settings.from_mailbox ?? "") || pollNumber !== settings.poll_seconds;

  return (
    <Panel className="p-5">
      <PanelHead
        title="The switches"
        hint="Off means composed and held, never sent — every step still runs and records what it would have done."
      />
      {save.error && (
        <InlineNotice tone="danger" className="mt-4">
          {save.error}
        </InlineNotice>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Toggle
          checked={settings.send_email}
          onChange={(v) => void flip({ send_email: v })}
          label="Send mail"
          hint="Off: requests for quotation are composed per supplier and held on the run, and a wait for replies never ends. On: they go out from the mailbox below, tagged so replies are recognised."
        />
        <Toggle
          checked={settings.write_zoho}
          onChange={(v) => void flip({ write_zoho: v })}
          label="Create in Zoho Books"
          hint="Off: the estimate is not created; the step records what it would have sent. On: an approved quote request becomes the customer's estimate in Zoho."
        />
        <Toggle
          checked={settings.write_sharepoint}
          onChange={(v) => void flip({ write_sharepoint: v })}
          label="Attach to SharePoint"
          hint="Off: the CP and TP stay on the run only. On: they are added to the task's attachments. Adds only — nothing there is ever edited or removed."
        />
      </div>

      <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field
          label="Send from"
          hint="The mailbox mail goes out from and replies come back to. Leave empty to use the intake mailbox."
        >
          <Input
            value={mailbox}
            onChange={(e) => setMailbox(e.target.value)}
            placeholder="rfq@hamdaz.com"
            type="email"
          />
        </Field>
        <Field
          label="Check every (seconds)"
          error={pollBad && poll !== "" ? "Between 30 and 3600." : undefined}
          hint="How often waiting runs look for replies and status changes."
        >
          <Input value={poll} onChange={(e) => setPoll(e.target.value)} type="number" min={30} max={3600} />
        </Field>
        <Button
          icon={Save}
          variant={dirty ? "solid" : undefined}
          disabled={!dirty || pollBad}
          loading={save.pending}
          onClick={() =>
            void flip({ from_mailbox: mailbox.trim() || null, poll_seconds: pollNumber })
          }
        >
          {dirty ? "Save" : "Saved"}
        </Button>
      </div>
    </Panel>
  );
}

/* ── one flow ────────────────────────────────────────────────────────── */

function FlowRow({ flow, onChanged }: { flow: WorkflowOut; onChanged: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const archived = Boolean(flow.archived_at);

  const archive = useAction(async () =>
    api.post<WorkflowOut>(`/workflows/admin/flows/${flow.key}/${archived ? "restore" : "archive"}`),
  );
  const remove = useAction(async () => api.del(`/workflows/admin/flows/${flow.key}`));
  const failure = archive.error ?? remove.error;

  return (
    <li className="rounded-[13px] bg-panel-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={`/admin/workflows/${flow.key}`} className="min-w-0 flex-1 basis-56">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink underline-offset-2 hover:underline">
              {flow.name}
            </span>
            <span className="font-mono text-[11px] text-ink-4">{flow.key}</span>
            {/* Shipped with the product. It can be edited — that is the whole
                point of flows being data — but not deleted, since the seed
                would only put it back. */}
            {flow.is_system && (
              <Badge tone="info" title="Ships with the product. Editable, not deletable.">
                Shipped
              </Badge>
            )}
            {archived ? (
              <Badge tone="warn">Retired</Badge>
            ) : flow.enabled ? (
              <Badge tone="positive">On</Badge>
            ) : (
              <Badge tone="neutral">Off</Badge>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">
            {flow.team_name ?? "Any team"} · {TRIGGER_LABEL[flow.trigger] ?? flow.trigger} ·{" "}
            {flow.steps.length} steps · v{flow.version}
            {flow.open_runs > 0 ? ` · ${flow.open_runs} running` : ""}
          </span>
        </Link>

        <span className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            icon={archived ? ArchiveRestore : Archive}
            loading={archive.pending}
            onClick={async () => {
              if ((await archive.run()) !== undefined) onChanged();
            }}
          >
            {archived ? "Bring back" : "Retire"}
          </Button>
          {!flow.is_system && (
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={() => setDeleting(true)}
              aria-label={`Delete ${flow.name}`}
            >
              Delete
            </Button>
          )}
        </span>
      </div>
      {failure && (
        <InlineNotice tone="danger" className="mt-2">
          {failure}
        </InlineNotice>
      )}

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${flow.name}?`}
        description="Gone for good, along with its runs' definitions. Retiring is the reversible option — a retired flow cannot be started but everything it ran stays readable."
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Keep it</Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={remove.pending}
              onClick={async () => {
                if ((await remove.run()) !== undefined) {
                  setDeleting(false);
                  onChanged();
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {remove.error && (
          <InlineNotice tone="danger" className="mb-4">
            {remove.error}
          </InlineNotice>
        )}
      </Modal>
    </li>
  );
}

/* ── creating one ────────────────────────────────────────────────────── */

/**
 * A flow needs at least one step to exist, so a new one is born with a
 * single notification step — the one block with no side effect beyond a
 * message to the owner — and the builder is where it becomes something.
 */
function NewFlow({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (flow: WorkflowOut) => void;
}) {
  const teams = useSWR<TeamOut[]>(open ? "/teams" : null, { revalidateOnFocus: false });
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [team, setTeam] = useState("");
  const [trigger, setTrigger] = useState<"manual" | "task_assigned">("manual");

  const create = useAction(async () =>
    api.post<WorkflowOut>("/workflows/admin/flows", {
      key: key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      team: team || null,
      trigger,
      enabled: false,
      steps: [
        {
          key: "started",
          kind: "notify",
          name: "Tell the owner it started",
          config: { title: `${name.trim() || "Workflow"} started`, body: "" },
          when: null,
        },
      ],
    }),
  );

  const keyBad = key !== "" && !/^[a-z0-9][a-z0-9_-]*$/.test(key);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New workflow"
      description="Created switched off with one placeholder step, so it can be built before anybody can start it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={create.pending}
            disabled={key.trim().length < 2 || keyBad || !name.trim()}
            onClick={async () => {
              const flow = await create.run();
              if (flow) onCreated(flow);
            }}
          >
            Create and open
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        <Field
          label="Key"
          required
          hint="Lowercase letters, digits, _ or -. What runs and links refer to it by; it cannot change later."
          error={keyBad ? "Lowercase letters, digits, _ and - only, starting with a letter or digit." : undefined}
        >
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="presales_rfq"
          />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Presales: from task to Zoho quote" />
        </Field>
        <Field label="Description" hint="What the person starting it reads.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Team" hint="Whose members may start it. Any team means everybody with the Workflows module.">
          <Select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Any team</option>
            {(teams.data ?? [])
              .filter((t) => !t.archived_at)
              .map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Starts" hint="By hand from the Workflows screen, or on its own when a task is assigned to somebody.">
          <Select value={trigger} onChange={(e) => setTrigger(e.target.value as "manual" | "task_assigned")}>
            <option value="manual">{TRIGGER_LABEL.manual}</option>
            <option value="task_assigned">{TRIGGER_LABEL.task_assigned}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
