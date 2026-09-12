"use client";

import clsx from "clsx";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { humanise, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  BlockOut,
  BlocksOut,
  ConfigFieldOut,
  PendingColumn,
  PendingField,
  StepIn,
  StepWhen,
  TeamOut,
  ToolChoiceOut,
  WorkflowOut,
  WorkflowPatch,
} from "@/lib/types";
import { TRIGGER_LABEL, stepIcon, useAdminFlow, useWorkflowBlocks } from "@/lib/workflows";
import { Badge, Meta, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";

/**
 * The builder: one flow, its steps, and what each step is told.
 *
 * The whole thing is a draft saved in one PATCH. The backend replaces the
 * step list rather than diffing it, and validates the lot — keys unique,
 * kinds known, required config present, an endpoint naming a real route —
 * before any of it lands, so a half-saved flow cannot exist. Its refusal is
 * a sentence naming the step, and that sentence is shown as it came.
 *
 * Every control on a step is drawn from the block's own declared fields.
 * Nothing here knows what an `email` block needs; it knows how to draw a
 * `path`, a `tool`, a `json`. Adding a block on the backend adds it here.
 */

interface StepDraft {
  /** Local only, so React keys survive a rename of the step's key. */
  id: number;
  key: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  when: StepWhen | null;
}

interface Draft {
  name: string;
  description: string;
  team: string;
  trigger: "manual" | "task_assigned";
  enabled: boolean;
  steps: StepDraft[];
}

let nextId = 1;

function draftOf(flow: WorkflowOut): Draft {
  return {
    name: flow.name,
    description: flow.description ?? "",
    team: flow.team_slug ?? "",
    trigger: flow.trigger,
    enabled: flow.enabled,
    steps: flow.steps.map((s) => ({
      id: nextId++,
      key: s.key,
      kind: s.kind,
      name: s.name,
      config: { ...s.config },
      when:
        s.when && typeof s.when.path === "string"
          ? { path: s.when.path, is: s.when.is !== false }
          : null,
    })),
  };
}

function patchOf(draft: Draft): WorkflowPatch {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    team: draft.team || null,
    trigger: draft.trigger,
    enabled: draft.enabled,
    steps: draft.steps.map<StepIn>((s) => ({
      key: s.key.trim(),
      kind: s.kind,
      name: s.name.trim() || null,
      config: s.config,
      when: s.when && s.when.path.trim() ? { path: s.when.path.trim(), is: s.when.is } : null,
    })),
  };
}

export default function WorkflowBuilderPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const session = useSession();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useAdminFlow(key);
  const blocks = useWorkflowBlocks();
  const teams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // JSON fields that do not currently parse, by "stepId:fieldKey". Saving
  // with one of these would send the last good value silently, which is
  // worse than refusing.
  const [broken, setBroken] = useState<Set<string>>(new Set());

  // The draft is rebuilt when the server's copy moves — after a save, an
  // archive. Comparing the version rather than the object means an unchanged
  // revalidation leaves work in progress alone.
  const current = data ? `${data.key}|${data.version}|${data.archived_at ?? ""}` : null;
  if (data && current !== stamp) {
    setStamp(current);
    setDraft(draftOf(data));
    setBroken(new Set());
  }

  const save = useAction(async (body: WorkflowPatch) =>
    api.patch<WorkflowOut>(`/workflows/admin/flows/${key}`, body),
  );
  const archive = useAction(async (restore: boolean) =>
    api.post<WorkflowOut>(`/workflows/admin/flows/${key}/${restore ? "restore" : "archive"}`),
  );
  const remove = useAction(async () => api.del(`/workflows/admin/flows/${key}`));

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Workflow" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Only a super admin may change what a workflow does."
        />
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data || !draft) return null;

  const archived = Boolean(data.archived_at);
  // A const, so the narrowing survives into the `.map` callback below.
  const blockSet = blocks.data ?? null;
  const unsaved = JSON.stringify(patchOf(draft)) !== JSON.stringify(patchOf(draftOf(data)));
  const keyProblem = stepKeyProblem(draft.steps);
  const blocked =
    broken.size > 0
      ? "Fix the JSON that does not parse first."
      : keyProblem ?? (draft.steps.length === 0 ? "A workflow needs at least one step." : null);
  const failure = save.error ?? archive.error ?? remove.error;

  function update(patch: Partial<Draft>) {
    setDraft((was) => (was ? { ...was, ...patch } : was));
  }
  function updateStep(id: number, patch: Partial<StepDraft>) {
    setDraft((was) =>
      was ? { ...was, steps: was.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : was,
    );
  }
  function move(id: number, by: -1 | 1) {
    setDraft((was) => {
      if (!was) return was;
      const i = was.steps.findIndex((s) => s.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= was.steps.length) return was;
      const steps = was.steps.slice();
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...was, steps };
    });
  }
  function removeStep(id: number) {
    setDraft((was) => (was ? { ...was, steps: was.steps.filter((s) => s.id !== id) } : was));
    setBroken((was) => new Set([...was].filter((k) => !k.startsWith(`${id}:`))));
  }
  function addStep(block: BlockOut) {
    const step: StepDraft = {
      id: nextId++,
      key: uniqueKey(block.kind, draft!.steps),
      kind: block.kind,
      name: block.name,
      config: Object.fromEntries(
        block.fields
          .filter((f) => f.default !== null && f.default !== undefined)
          .map((f) => [f.key, f.default]),
      ),
      when: null,
    };
    update({ steps: [...draft!.steps, step] });
    setOpenStep(step.id);
    setAdding(false);
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/workflows">Workflows</Link>}
        title={data.name}
        meta={`${data.key} · v${data.version}`}
        actions={
          <>
            <span title={blocked ?? undefined}>
              <Button
                icon={Save}
                variant={unsaved ? "accent" : undefined}
                disabled={!unsaved || Boolean(blocked)}
                loading={save.pending}
                onClick={async () => {
                  const next = await save.run(patchOf(draft));
                  if (next) await mutate(next, { revalidate: false });
                }}
              >
                {unsaved ? "Save changes" : "Saved"}
              </Button>
            </span>
            <Button
              icon={archived ? ArchiveRestore : Archive}
              loading={archive.pending}
              onClick={async () => {
                const next = await archive.run(archived);
                if (next) await mutate(next, { revalidate: false });
              }}
            >
              {archived ? "Bring back" : "Retire"}
            </Button>
            {!data.is_system && (
              <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </>
        }
      />

      {failure && <InlineNotice tone="danger">{failure}</InlineNotice>}
      {unsaved && blocked && <InlineNotice tone="warn">{blocked}</InlineNotice>}
      {archived && (
        <InlineNotice tone="warn">
          Retired. Nobody can start it; what it already ran stays readable. It can still be
          edited here and brought back.
        </InlineNotice>
      )}
      {data.is_system && (
        <InlineNotice tone="info">
          This flow ships with the product. Every step and every word of it is yours to change,
          and a later deploy will not overwrite what you save — but it cannot be deleted, only
          retired.
        </InlineNotice>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Steps" value={num(draft.steps.length)} />
        <StatBox
          label="Stops for the person"
          value={num(draft.steps.filter((s) => blocks.data && blockOf(blocks.data, s.kind)?.waits === "user").length)}
        />
        <StatBox
          label="Waits on the world"
          value={num(draft.steps.filter((s) => blocks.data && blockOf(blocks.data, s.kind)?.waits === "event").length)}
        />
        <StatBox
          label="Runs going"
          value={num(data.open_runs)}
          tone={data.open_runs > 0 ? "second" : undefined}
          hint="Runs already started keep the steps they started with. Saving changes only new runs."
        />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-3.5">
          <Panel className="p-5">
            <PanelHead
              title="Steps"
              count={draft.steps.length}
              hint="In the order they run."
              action={
                <Button size="sm" icon={Plus} onClick={() => setAdding(true)} disabled={!blocks.data}>
                  Add a block
                </Button>
              }
            />
            {blocks.error ? (
              <ErrorState error={blocks.error} onRetry={() => blocks.mutate()} className="mt-4" />
            ) : !blockSet ? (
              <PanelSkeleton lines={4} className="mt-4" />
            ) : draft.steps.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                No steps. A flow with none cannot be saved — add the first block.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {draft.steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    last={index === draft.steps.length - 1}
                    blocks={blockSet}
                    open={openStep === step.id}
                    duplicate={draft.steps.some((s) => s.id !== step.id && s.key.trim() === step.key.trim())}
                    onToggle={() => setOpenStep(openStep === step.id ? null : step.id)}
                    onChange={(patch) => updateStep(step.id, patch)}
                    onMove={(by) => move(step.id, by)}
                    onRemove={() => removeStep(step.id)}
                    onJsonState={(fieldKey, ok) =>
                      setBroken((was) => {
                        const next = new Set(was);
                        const k = `${step.id}:${fieldKey}`;
                        if (ok) next.delete(k);
                        else next.add(k);
                        return next;
                      })
                    }
                  />
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-3.5">
          <Panel className="p-5">
            <PanelHead title="About" />
            <div className="mt-5 space-y-4">
              <Field label="Name" required>
                <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Description" hint="What the person starting it reads.">
                <Textarea
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </Field>
              <Field label="Team" hint="Whose members may start it.">
                <Select value={draft.team} onChange={(e) => update({ team: e.target.value })}>
                  <option value="">Any team</option>
                  {(teams.data ?? [])
                    .filter((t) => !t.archived_at || t.slug === draft.team)
                    .map((t) => (
                      <option key={t.id} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  {/* A team the list does not know — archived and hidden, or
                      the list not loaded yet — must still be selectable, or
                      the select would silently show "Any team" and a save
                      would clear it. */}
                  {draft.team && !(teams.data ?? []).some((t) => t.slug === draft.team) && (
                    <option value={draft.team}>{draft.team}</option>
                  )}
                </Select>
              </Field>
              <Field label="Starts">
                <Select
                  value={draft.trigger}
                  onChange={(e) => update({ trigger: e.target.value as Draft["trigger"] })}
                >
                  <option value="manual">{TRIGGER_LABEL.manual}</option>
                  <option value="task_assigned">{TRIGGER_LABEL.task_assigned}</option>
                </Select>
              </Field>
              <Toggle
                checked={draft.enabled}
                onChange={(v) => update({ enabled: v })}
                label="Switched on"
                hint="Off, it is not offered to anybody. Runs already going carry on."
              />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-5">
              <Meta label="Runs on">{humanise(data.subject_kind)}</Meta>
              <Meta label="Version">{data.version}</Meta>
            </dl>
          </Panel>

          {blocks.data && (
            <Panel className="p-5">
              <PanelHead title="Placeholders" />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                Text fields may quote the context with double braces:{" "}
                <code className="font-mono text-[11px]">{"{{ task.title }}"}</code>,{" "}
                <code className="font-mono text-[11px]">{"{{ run.tag }}"}</code>,{" "}
                <code className="font-mono text-[11px]">{"{{ owner.name }}"}</code>, and whatever
                an earlier step saved under its <em>Save result as</em> key. A list reads as
                bullets with <code className="font-mono text-[11px]">{"| bullets"}</code>.
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                Answer shapes an agent or extract step may ask for:{" "}
                {blocks.data.schemas.map((s) => (
                  <code key={s} className="mr-1.5 font-mono text-[11px]">
                    {s}
                  </code>
                ))}
              </p>
            </Panel>
          )}
        </div>
      </div>

      <AddBlock
        open={adding}
        blocks={blocks.data ?? null}
        onClose={() => setAdding(false)}
        onPick={addStep}
      />

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${data.name}?`}
        description="Gone for good. Retiring is the reversible option."
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Keep it</Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={remove.pending}
              onClick={async () => {
                if ((await remove.run()) !== undefined) router.push("/admin/workflows");
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
    </>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function blockOf(blocks: BlocksOut, kind: string): BlockOut | undefined {
  return blocks.blocks.find((b) => b.kind === kind);
}

/** The backend's rule, checked here so the message arrives before the round trip. */
function stepKeyProblem(steps: StepDraft[]): string | null {
  const seen = new Set<string>();
  for (const s of steps) {
    const k = s.key.trim();
    if (!k || !/^[a-z0-9_-]+$/i.test(k)) return `Step ${steps.indexOf(s) + 1} needs a short key made of letters, digits, _ or -.`;
    if (seen.has(k)) return `Two steps are called "${k}".`;
    seen.add(k);
  }
  return null;
}

function uniqueKey(kind: string, steps: StepDraft[]): string {
  const taken = new Set(steps.map((s) => s.key));
  if (!taken.has(kind)) return kind;
  let n = 2;
  while (taken.has(`${kind}_${n}`)) n += 1;
  return `${kind}_${n}`;
}

/* ── one step ────────────────────────────────────────────────────────── */

function StepCard({
  step,
  index,
  last,
  blocks,
  open,
  duplicate,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onJsonState,
}: {
  step: StepDraft;
  index: number;
  last: boolean;
  blocks: BlocksOut;
  open: boolean;
  duplicate: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<StepDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onJsonState: (fieldKey: string, ok: boolean) => void;
}) {
  const block = blockOf(blocks, step.kind);
  const Icon = stepIcon(step.kind);
  const missing = (block?.fields ?? []).filter(
    (f) => f.required && (step.config[f.key] === undefined || step.config[f.key] === null || step.config[f.key] === ""),
  );

  return (
    <li className="rounded-[14px] bg-panel-2">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <ChevronRight
            className={clsx("size-3.5 shrink-0 text-ink-4 transition-transform", open && "rotate-90")}
            strokeWidth={2.2}
          />
          <span className="tnum w-5 shrink-0 text-[11px] text-ink-4">{index + 1}</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel text-ink-3">
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-[13px] font-medium text-ink">
                {step.name || block?.name || step.kind}
              </span>
              {block?.waits === "user" && <Badge tone="second">stops for the person</Badge>}
              {block?.waits === "event" && <Badge tone="warn">waits on the world</Badge>}
              {block?.switch && (
                <Badge tone="neutral" title={`Held while the ${humanise(block.switch)} switch is off.`}>
                  behind a switch
                </Badge>
              )}
              {!block && <Badge tone="danger">unknown block</Badge>}
              {missing.length > 0 && <Badge tone="danger">{missing.length} required</Badge>}
              {duplicate && <Badge tone="danger">duplicate key</Badge>}
            </span>
            <span className="block truncate font-mono text-[10.5px] text-ink-4">
              {step.key}
              {step.when?.path ? ` · only when ${step.when.path} is ${step.when.is ? "true" : "false"}` : ""}
            </span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          <IconBtn label="Move up" icon={ArrowUp} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconBtn label="Move down" icon={ArrowDown} disabled={last} onClick={() => onMove(1)} />
          <IconBtn label="Remove step" icon={Trash2} danger onClick={onRemove} />
        </span>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {block && <p className="text-[12px] leading-relaxed text-ink-3">{block.description}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key" required hint="What later steps and the log call it. Letters, digits, _ or -.">
              <Input
                value={step.key}
                onChange={(e) => onChange({ key: e.target.value.replace(/\s+/g, "_") })}
                className="font-mono"
              />
            </Field>
            <Field label="Name" hint="What the person sees on the timeline.">
              <Input value={step.name} onChange={(e) => onChange({ name: e.target.value })} />
            </Field>
          </div>

          <div className="rounded-[13px] bg-panel p-3.5">
            <Toggle
              checked={step.when !== null}
              onChange={(v) => onChange({ when: v ? { path: "", is: true } : null })}
              label="Only sometimes"
              hint="Skip this step unless a value in the context is what you say. The presales flow asks for documents only when the task had none."
            />
            {step.when && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
                <Input
                  value={step.when.path}
                  onChange={(e) => onChange({ when: { ...step.when!, path: e.target.value } })}
                  placeholder="docs.found"
                  className="font-mono"
                  aria-label="Context path"
                />
                <Select
                  value={step.when.is ? "true" : "false"}
                  onChange={(e) => onChange({ when: { ...step.when!, is: e.target.value === "true" } })}
                  aria-label="Run when the value is"
                >
                  <option value="true">is true</option>
                  <option value="false">is false</option>
                </Select>
              </div>
            )}
          </div>

          {block && block.fields.length > 0 && (
            <div className="space-y-4">
              {block.fields.map((field) => (
                <ConfigInput
                  key={field.key}
                  field={field}
                  tools={blocks.tools}
                  value={step.config[field.key]}
                  onChange={(v) => {
                    const config = { ...step.config };
                    if (v === undefined) delete config[field.key];
                    else config[field.key] = v;
                    onChange({ config });
                  }}
                  onJsonState={(ok) => onJsonState(field.key, ok)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function IconBtn({
  label,
  icon: Icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  icon: typeof ArrowUp;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "grid size-8 place-items-center rounded-lg text-ink-4 transition disabled:opacity-30",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-panel hover:text-ink",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.2} />
    </button>
  );
}

/* ── one config field ────────────────────────────────────────────────── */

/**
 * A control per declared field type. `undefined` from `onChange` means
 * "leave this key out", which lets a cleared number fall back to the block's
 * default rather than sending an empty string it would refuse.
 */
function ConfigInput({
  field,
  tools,
  value,
  onChange,
  onJsonState,
}: {
  field: ConfigFieldOut;
  tools: ToolChoiceOut[];
  value: unknown;
  onChange: (value: unknown) => void;
  onJsonState: (ok: boolean) => void;
}) {
  const hint = field.help || undefined;
  const text = value === undefined || value === null ? "" : String(value);

  switch (field.type) {
    case "boolean":
      return (
        <Toggle
          checked={value === true}
          onChange={onChange}
          label={field.label}
          hint={hint}
        />
      );
    case "textarea":
      return (
        <Field label={field.label} required={field.required} hint={hint}>
          <Textarea value={text} onChange={(e) => onChange(e.target.value)} className="font-mono text-[12px]" />
        </Field>
      );
    case "number":
      return (
        <Field label={field.label} required={field.required} hint={hint}>
          <Input
            type="number"
            value={text}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? undefined : Number(raw));
            }}
            className="tnum max-w-[200px]"
          />
        </Field>
      );
    case "select":
      return (
        <Field label={field.label} required={field.required} hint={hint}>
          <Select value={text} onChange={(e) => onChange(e.target.value)}>
            {!field.options.includes(text) && <option value={text}>{text || "—"}</option>}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o || "— none —"}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "tool":
      return <ToolSelect field={field} tools={tools} value={text} onChange={onChange} />;
    case "path":
      return (
        <Field label={field.label} required={field.required} hint={hint ?? "A dotted path into the context."}>
          <Input value={text} onChange={(e) => onChange(e.target.value)} placeholder="answers.items" className="font-mono" />
        </Field>
      );
    case "json":
      return (
        <JsonInput
          label={field.label}
          required={field.required}
          hint={hint}
          value={value}
          onChange={onChange}
          onState={onJsonState}
        />
      );
    case "fields":
      return <FieldsEditor field={field} value={value} onChange={onChange} onJsonState={onJsonState} />;
    default:
      return (
        <Field label={field.label} required={field.required} hint={hint}>
          <Input value={text} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

/** The routes an endpoint may call, grouped by module. */
function ToolSelect({
  field,
  tools,
  value,
  onChange,
}: {
  field: ConfigFieldOut;
  tools: ToolChoiceOut[];
  value: string;
  onChange: (value: string) => void;
}) {
  const modules = new Map<string, ToolChoiceOut[]>();
  for (const t of tools) {
    const list = modules.get(t.module) ?? [];
    list.push(t);
    modules.set(t.module, list);
  }
  const known = tools.some((t) => t.key === value);
  const chosen = tools.find((t) => t.key === value);
  return (
    <Field
      label={field.label}
      required={field.required}
      hint={chosen ? `${chosen.method} ${chosen.path}` : field.help || "One of the app's own routes, called as the run's owner."}
    >
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pick a route</option>
        {!known && value && <option value={value}>{value} (not a route the app has)</option>}
        {[...modules.entries()].map(([module, list]) => (
          <optgroup key={module} label={humanise(module)}>
            {list.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} · {t.method} {t.path}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}

/**
 * A JSON textarea that only hands back what parses.
 *
 * The text is local: reformatting somebody's typing on every keystroke is
 * how a cursor ends up at the end of the box. The parent hears the parsed
 * value when it is valid and hears "broken" when it is not, so Save can
 * refuse rather than send the last good value under the person's nose.
 */
function JsonInput({
  label,
  required,
  hint,
  value,
  onChange,
  onState,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onState: (ok: boolean) => void;
}) {
  const [text, setText] = useState(() =>
    value === undefined || value === null ? "" : JSON.stringify(value, null, 2),
  );
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Field label={label} required={required} hint={hint} error={problem}>
      <Textarea
        value={text}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            setProblem(null);
            onState(true);
            onChange(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(next);
            setProblem(null);
            onState(true);
            onChange(parsed);
          } catch (caught) {
            setProblem(caught instanceof Error ? caught.message : "Not valid JSON.");
            onState(false);
          }
        }}
        className="min-h-32 font-mono text-[12px]"
        placeholder={'{\n  "team": "{{ run.team }}"\n}'}
      />
    </Field>
  );
}

/* ── the fields an ask_user form asks for ────────────────────────────── */

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Yes or no" },
  { value: "table", label: "Table" },
  { value: "file", label: "File" },
];

const COLUMN_TYPES = ["text", "number"];

function isFieldList(v: unknown): v is PendingField[] {
  return (
    Array.isArray(v) &&
    v.every((f) => typeof f === "object" && f !== null && typeof (f as PendingField).key === "string")
  );
}

/**
 * The form an `ask_user` step shows, as rows rather than JSON.
 *
 * JSON is one toggle away for the cases the rows do not cover, and the two
 * views share the value, so switching never loses anything that parses.
 */
function FieldsEditor({
  field,
  value,
  onChange,
  onJsonState,
}: {
  field: ConfigFieldOut;
  value: unknown;
  onChange: (value: unknown) => void;
  onJsonState: (ok: boolean) => void;
}) {
  const structured = isFieldList(value) || value === undefined || value === null;
  const [asJson, setAsJson] = useState(!structured);
  const fields: PendingField[] = isFieldList(value) ? value : [];

  function replace(i: number, patch: Partial<PendingField>) {
    const next = fields.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          {field.label}
          {field.required && <span className="text-danger">*</span>}
        </span>
        {/* Only offered while the value is a list the rows can draw. Anything
            else stays JSON, since rows would have nothing to show for it. */}
        {structured && (
          <button
            type="button"
            onClick={() => setAsJson((v) => !v)}
            className="text-[11.5px] text-ink-3 underline-offset-2 hover:underline"
          >
            {asJson ? "Edit as rows" : "Edit as JSON"}
          </button>
        )}
      </div>

      {asJson || !structured ? (
        <JsonInput
          label=""
          hint={field.help || "A list of {key, label, type, required, columns}."}
          value={value}
          onChange={onChange}
          onState={onJsonState}
        />
      ) : (
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="text-[12px] text-ink-4">Nothing asked for yet — a question with no fields is fine when files are all it needs.</p>
          )}
          {fields.map((f, i) => (
            <div key={i} className="rounded-[13px] bg-panel p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_130px_auto_auto]">
                <Input
                  value={f.key}
                  onChange={(e) => replace(i, { key: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  placeholder="key"
                  className="h-9 font-mono text-[12px]"
                  aria-label="Field key"
                />
                <Input
                  value={f.label}
                  onChange={(e) => replace(i, { label: e.target.value })}
                  placeholder="Label"
                  className="h-9 text-[12.5px]"
                  aria-label="Field label"
                />
                <Select
                  value={f.type}
                  onChange={(e) =>
                    replace(i, {
                      type: e.target.value,
                      columns: e.target.value === "table" ? (f.columns ?? []) : undefined,
                    })
                  }
                  className="h-9 text-[12.5px]"
                  aria-label="Field type"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <label className="flex h-9 items-center gap-1.5 text-[12px] text-ink-3">
                  <input
                    type="checkbox"
                    checked={Boolean(f.required)}
                    onChange={(e) => replace(i, { required: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  required
                </label>
                <IconBtn label="Remove field" icon={Trash2} danger onClick={() => onChange(fields.filter((_, j) => j !== i))} />
              </div>

              {f.type === "table" && (
                <ColumnsEditor
                  columns={f.columns ?? []}
                  onChange={(columns) => replace(i, { columns })}
                />
              )}
            </div>
          ))}
          <Button
            size="sm"
            icon={Plus}
            onClick={() => onChange([...fields, { key: "", label: "", type: "text", required: false }])}
          >
            Add a field
          </Button>
        </div>
      )}
    </div>
  );
}

function ColumnsEditor({
  columns,
  onChange,
}: {
  columns: PendingColumn[];
  onChange: (columns: PendingColumn[]) => void;
}) {
  function replace(i: number, patch: Partial<PendingColumn>) {
    const next = columns.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  return (
    <div className="mt-2 rounded-[10px] bg-panel-2 p-2">
      <p className="micro mb-1.5 px-1 text-ink-4">Columns</p>
      <div className="space-y-1.5">
        {columns.map((c, i) => (
          <div key={i} className="grid gap-1.5 sm:grid-cols-[1fr_1.4fr_110px_auto]">
            <Input
              value={c.key}
              onChange={(e) => replace(i, { key: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              placeholder="key"
              className="h-8 font-mono text-[11.5px]"
              aria-label="Column key"
            />
            <Input
              value={c.label}
              onChange={(e) => replace(i, { label: e.target.value })}
              placeholder="Label"
              className="h-8 text-[12px]"
              aria-label="Column label"
            />
            <Select
              value={c.type}
              onChange={(e) => replace(i, { type: e.target.value })}
              className="h-8 text-[12px]"
              aria-label="Column type"
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanise(t)}
                </option>
              ))}
            </Select>
            <IconBtn label="Remove column" icon={Trash2} danger onClick={() => onChange(columns.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        className="mt-1"
        onClick={() => onChange([...columns, { key: "", label: "", type: "text" }])}
      >
        Add a column
      </Button>
    </div>
  );
}

/* ── picking a block ─────────────────────────────────────────────────── */

function AddBlock({
  open,
  blocks,
  onClose,
  onPick,
}: {
  open: boolean;
  blocks: BlocksOut | null;
  onClose: () => void;
  onPick: (block: BlockOut) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a block"
      description="One thing the engine knows how to do. It lands at the end of the flow; move it from there."
      width="lg"
    >
      {!blocks ? (
        <PanelSkeleton lines={4} />
      ) : (
        <ul className="grid gap-2 pb-4 sm:grid-cols-2">
          {blocks.blocks.map((block) => {
            const Icon = stepIcon(block.kind);
            return (
              <li key={block.kind}>
                <button
                  type="button"
                  onClick={() => onPick(block)}
                  className="flex h-full w-full gap-3 rounded-[14px] bg-panel-2 p-3.5 text-left transition hover:bg-panel-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-ink-3">
                    <Icon className="size-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-ink">{block.name}</span>
                      {block.waits === "user" && <Badge tone="second">stops</Badge>}
                      {block.waits === "event" && <Badge tone="warn">waits</Badge>}
                      {block.switch && <Badge tone="neutral">switch</Badge>}
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
                      {block.description}
                    </span>
                    <span className="mt-1 block font-mono text-[10.5px] text-ink-4">{block.kind}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
