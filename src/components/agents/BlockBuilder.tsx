"use client";

import clsx from "clsx";
import { useMemo, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Flag,
  GripVertical,
  MousePointerClick,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  BLOCK_GROUPS,
  BLOCKS,
  BLOCKS_BY_KIND,
  GROUP_TONE,
  describeStep,
  makeStep,
  missingFields,
  newId,
  type BlockDef,
  type BlockField,
  type Step,
  type StepConfig,
} from "@/lib/agents";
import { Button, Field, IconButton, Input, SearchInput, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Panel, PanelHead } from "@/components/ui/primitives";

/**
 * The agent's job, as blocks.
 *
 * Three columns: the blocks on offer, the agent's steps top to bottom, and the
 * selected step's settings. Blocks are dragged from the left onto the canvas,
 * steps are dragged by their grip to reorder — and every drag has a click
 * equivalent (click a block to add it, the arrows to move a step), because
 * HTML drag and drop does not exist on a touch screen.
 *
 * The first step is the trigger and lives in its own slot: an agent has
 * exactly one thing that wakes it, and it always comes first, so letting it be
 * dragged into the middle would only make a flow that cannot mean anything.
 */

type Drag = { type: "block"; kind: string } | { type: "step"; id: string } | null;

const isStart = (kind: string) => BLOCKS_BY_KIND[kind]?.group === "start";

export function BlockBuilder({
  steps,
  onChange,
  selectedId,
  onSelect,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<number | "trigger" | null>(null);

  const trigger = steps[0] && isStart(steps[0].kind) ? steps[0] : null;
  const body = trigger ? steps.slice(1) : steps;
  const selected = steps.find((s) => s.id === selectedId) ?? null;

  const commit = (nextTrigger: Step | null, nextBody: Step[]) =>
    onChange(nextTrigger ? [nextTrigger, ...nextBody] : nextBody);

  function addBlock(kind: string, at?: number) {
    const step = makeStep(kind);
    if (isStart(kind)) {
      commit(step, body);
    } else {
      // After the selected step when there is one — that is where the eye is.
      const selectedAt = body.findIndex((s) => s.id === selectedId);
      const index = at ?? (selectedAt >= 0 ? selectedAt + 1 : body.length);
      commit(trigger, [...body.slice(0, index), step, ...body.slice(index)]);
    }
    onSelect(step.id);
  }

  function moveStep(id: string, to: number) {
    const from = body.findIndex((s) => s.id === id);
    if (from < 0) return;
    const next = [...body];
    const [step] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, step);
    commit(trigger, next);
  }

  function updateStep(id: string, config: StepConfig) {
    onChange(steps.map((s) => (s.id === id ? { ...s, config } : s)));
  }

  function removeStep(id: string) {
    onChange(steps.filter((s) => s.id !== id));
    if (selectedId === id) onSelect(null);
  }

  function duplicateStep(id: string) {
    const at = body.findIndex((s) => s.id === id);
    if (at < 0) return;
    const copy = { ...body[at], id: newId(), config: { ...body[at].config } };
    commit(trigger, [...body.slice(0, at + 1), copy, ...body.slice(at + 1)]);
    onSelect(copy.id);
  }

  /* ── drag and drop ── */

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  const acceptsBody = drag !== null && !(drag.type === "block" && isStart(drag.kind));
  const acceptsTrigger = drag?.type === "block" && isStart(drag.kind);

  function slotProps(index: number) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!acceptsBody) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = drag?.type === "step" ? "move" : "copy";
        if (over !== index) setOver(index);
      },
      onDragLeave: () => setOver((o) => (o === index ? null : o)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (drag?.type === "block") addBlock(drag.kind, index);
        if (drag?.type === "step") moveStep(drag.id, index);
        endDrag();
      },
    };
  }

  return (
    <div className="grid gap-3.5 lg:grid-cols-[264px_minmax(0,1fr)] 2xl:grid-cols-[264px_minmax(0,1fr)_340px]">
      <Palette
        onPick={(kind) => addBlock(kind)}
        // Deferred: changing the DOM inside dragstart makes Chrome cancel the drag.
        onDragStart={(kind) => setTimeout(() => setDrag({ type: "block", kind }))}
        onDragEnd={endDrag}
        hasTrigger={Boolean(trigger)}
      />

      {/* ── the canvas ── */}
      <Panel className="min-w-0 p-4 sm:p-5">
        <PanelHead
          title="Steps"
          count={body.length || undefined}
          hint="Top to bottom, in order. Drag to rearrange."
        />

        <div
          className="relative mt-4 rounded-[16px] bg-panel-2 px-3 py-5 sm:px-6"
          style={{
            backgroundImage: "radial-gradient(color-mix(in oklab, var(--ink) 10%, transparent) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          <div className="mx-auto flex max-w-[560px] flex-col items-stretch">
            {/* The trigger slot. */}
            {trigger ? (
              <div
                onDragOver={(e) => {
                  if (!acceptsTrigger) return;
                  e.preventDefault();
                  setOver("trigger");
                }}
                onDragLeave={() => setOver((o) => (o === "trigger" ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag?.type === "block") addBlock(drag.kind);
                  endDrag();
                }}
                className={clsx("rounded-[16px] transition", over === "trigger" && "ring-2 ring-accent ring-offset-2 ring-offset-panel-2")}
              >
                <StepCard
                  step={trigger}
                  label="Starts when"
                  selected={selectedId === trigger.id}
                  onSelect={() => onSelect(trigger.id)}
                  onRemove={() => removeStep(trigger.id)}
                />
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  if (!acceptsTrigger) return;
                  e.preventDefault();
                  setOver("trigger");
                }}
                onDragLeave={() => setOver((o) => (o === "trigger" ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag?.type === "block") addBlock(drag.kind);
                  endDrag();
                }}
                className={clsx(
                  "flex items-center gap-3 rounded-[16px] border-2 border-dashed px-4 py-4 transition",
                  over === "trigger"
                    ? "border-accent bg-accent-soft"
                    : acceptsTrigger
                      ? "border-accent/70 bg-panel"
                      : "border-line-strong bg-panel/60",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                  <Flag className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">What starts it?</p>
                  <p className="text-[12px] text-ink-3">
                    Drop a <span className="font-medium text-accent-text">Starts when</span> block here, or click one on the left.
                  </p>
                </div>
              </div>
            )}

            <Connector />

            {body.map((step, index) => (
              <div key={step.id} className="flex flex-col items-stretch">
                <DropSlot active={acceptsBody} over={over === index} {...slotProps(index)} />
                <StepCard
                  step={step}
                  number={index + 1}
                  selected={selectedId === step.id}
                  dragging={drag?.type === "step" && drag.id === step.id}
                  onSelect={() => onSelect(step.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", step.id);
                    setTimeout(() => setDrag({ type: "step", id: step.id }));
                  }}
                  onDragEnd={endDrag}
                  onUp={index > 0 ? () => moveStep(step.id, index - 1) : undefined}
                  onDown={index < body.length - 1 ? () => moveStep(step.id, index + 2) : undefined}
                  onDuplicate={() => duplicateStep(step.id)}
                  onRemove={() => removeStep(step.id)}
                />
                <Connector />
              </div>
            ))}

            {/* The open end: always a target, and says so when nothing is there yet. */}
            <div
              {...slotProps(body.length)}
              className={clsx(
                "flex min-h-[64px] items-center justify-center gap-2 rounded-[16px] border-2 border-dashed px-4 text-center text-[12.5px] transition",
                over === body.length
                  ? "border-accent bg-accent-soft text-accent-text"
                  : acceptsBody
                    ? "border-accent/70 text-ink-2"
                    : "border-line-strong text-ink-4",
              )}
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              {body.length === 0 ? "Drop the first step here, or click a block on the left" : "Drop a block here to add it at the end"}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-ink-4">
              <span className="h-px w-8 bg-line-strong" />
              <span className="micro">Done</span>
              <span className="h-px w-8 bg-line-strong" />
            </div>
          </div>
        </div>
      </Panel>

      {/* ── the inspector ── */}
      <div className="lg:col-span-2 2xl:col-span-1">
        <Inspector
          step={selected}
          onChange={(config) => selected && updateStep(selected.id, config)}
          onRemove={() => selected && removeStep(selected.id)}
          onClose={() => onSelect(null)}
        />
      </div>
    </div>
  );
}

/* ── the palette ─────────────────────────────────────────────────────── */

function Palette({
  onPick,
  onDragStart,
  onDragEnd,
  hasTrigger,
}: {
  onPick: (kind: string) => void;
  onDragStart: (kind: string) => void;
  onDragEnd: () => void;
  hasTrigger: boolean;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  const groups = useMemo(
    () =>
      BLOCK_GROUPS.map((group) => ({
        ...group,
        blocks: BLOCKS.filter(
          (b) =>
            b.group === group.key &&
            (!needle || `${b.name} ${b.blurb}`.toLowerCase().includes(needle)),
        ),
      })).filter((g) => g.blocks.length > 0),
    [needle],
  );

  return (
    <Panel className="flex min-w-0 flex-col p-3 lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-170px)]">
      <div className="px-1 pb-3 pt-1">
        <PanelHead title="Blocks" hint="Drag, or click to add" />
        <SearchInput value={search} onChange={setSearch} placeholder="Find a block" className="mt-3" />
      </div>
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="micro mb-1.5 px-1 text-ink-4" title={group.hint}>
              {group.label}
              {group.key === "start" && hasTrigger && <span className="ml-1.5 normal-case tracking-normal">· replaces yours</span>}
            </p>
            <div className="space-y-1">
              {group.blocks.map((block) => (
                <PaletteItem
                  key={block.kind}
                  block={block}
                  onPick={() => onPick(block.kind)}
                  onDragStart={() => onDragStart(block.kind)}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="px-1 text-[12px] text-ink-4">No block matches “{search}”.</p>}
      </div>
    </Panel>
  );
}

function PaletteItem({
  block,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  block: BlockDef;
  onPick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const tone = GROUP_TONE[block.group];
  const Icon = block.icon;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", block.kind);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onPick}
      title={block.blurb}
      className="group flex w-full cursor-grab items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left transition hover:bg-panel-2 active:cursor-grabbing"
    >
      <span className={clsx("grid size-8 shrink-0 place-items-center rounded-[10px]", tone.soft, tone.ink)}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{block.name}</span>
        <span className="block truncate text-[11px] text-ink-4">{block.blurb}</span>
      </span>
      <Plus className="size-3.5 shrink-0 text-ink-4 opacity-0 transition group-hover:opacity-100" strokeWidth={2.2} />
    </button>
  );
}

/* ── the canvas pieces ───────────────────────────────────────────────── */

function Connector() {
  return <span aria-hidden className="mx-auto block h-4 w-px bg-line-strong" />;
}

/** The gap between two steps — a hairline that opens up when something is dragged over it. */
function DropSlot({
  active,
  over,
  ...handlers
}: {
  active: boolean;
  over: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  if (!active) return null;
  return (
    <div {...handlers} className="-my-1 flex h-7 items-center">
      <div
        className={clsx(
          "w-full rounded-full transition-all",
          over ? "h-10 border-2 border-dashed border-accent bg-accent-soft" : "h-1 bg-accent/30",
        )}
      />
    </div>
  );
}

function StepCard({
  step,
  number,
  label,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onUp,
  onDown,
  onDuplicate,
  onRemove,
}: {
  step: Step;
  number?: number;
  label?: string;
  selected: boolean;
  dragging?: boolean;
  onSelect: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const block = BLOCKS_BY_KIND[step.kind];
  const tone = GROUP_TONE[block?.group ?? "wait"];
  const Icon = block?.icon ?? Flag;
  const missing = missingFields(step);

  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={clsx(
        "lift group relative flex cursor-pointer items-center gap-3 rounded-[16px] border-l-4 bg-panel py-3 pl-2 pr-3 transition",
        tone.edge,
        selected ? "ring-2 ring-accent" : "hover:ring-1 hover:ring-line-strong",
        dragging && "opacity-40",
      )}
    >
      {onDragStart ? (
        <span className="cursor-grab text-ink-4 active:cursor-grabbing" title="Drag to move">
          <GripVertical className="size-4" />
        </span>
      ) : (
        <span className="w-4" />
      )}
      <span className={clsx("grid size-9 shrink-0 place-items-center rounded-[11px]", tone.soft, tone.ink)}>
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[11px] text-ink-4">
          {label ? <span className="micro text-accent-text">{label}</span> : <span className="tnum">Step {number}</span>}
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle className="size-3" strokeWidth={2.4} /> Needs setting up
            </span>
          )}
        </p>
        <p className="truncate text-[13.5px] font-semibold text-ink">{block?.name ?? step.kind}</p>
        <p className="truncate text-[12px] text-ink-3">{describeStep(step)}</p>
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {onUp && <IconButton size="sm" tone="ghost" icon={ArrowUp} label="Move up" onClick={onUp} />}
        {onDown && <IconButton size="sm" tone="ghost" icon={ArrowDown} label="Move down" onClick={onDown} />}
        {onDuplicate && <IconButton size="sm" tone="ghost" icon={Copy} label="Duplicate" onClick={onDuplicate} />}
        <IconButton size="sm" tone="ghost" icon={Trash2} label="Remove" onClick={onRemove} />
      </div>
    </div>
  );
}

/* ── the inspector ───────────────────────────────────────────────────── */

function Inspector({
  step,
  onChange,
  onRemove,
  onClose,
}: {
  step: Step | null;
  onChange: (config: StepConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  if (!step) {
    return (
      <Panel className="flex flex-col items-center px-6 py-10 text-center 2xl:sticky 2xl:top-[76px]">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-panel-2 text-ink-3">
          <MousePointerClick className="size-5" strokeWidth={1.8} />
        </span>
        <p className="text-[14px] font-semibold">Pick a step to set it up</p>
        <p className="mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-ink-3">
          Each block has a few settings — who to write to, how many suppliers, when to give up waiting.
          Click a step on the canvas to change them here.
        </p>
      </Panel>
    );
  }

  const block = BLOCKS_BY_KIND[step.kind];
  const tone = GROUP_TONE[block?.group ?? "wait"];
  const Icon = block?.icon ?? Flag;
  const group = BLOCK_GROUPS.find((g) => g.key === block?.group);
  const set = (key: string, value: string | number | boolean) => onChange({ ...step.config, [key]: value });

  return (
    <Panel className="p-5 2xl:sticky 2xl:top-[76px]">
      <div className="flex items-start gap-3">
        <span className={clsx("grid size-10 shrink-0 place-items-center rounded-[12px]", tone.soft, tone.ink)}>
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("micro", tone.ink)}>{group?.label}</p>
          <h3 className="mt-1 text-[16px] font-semibold tracking-tight">{block?.name}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{block?.blurb}</p>
        </div>
        <IconButton size="sm" tone="ghost" icon={X} label="Close" onClick={onClose} />
      </div>

      <div className="mt-5 space-y-4">
        {(block?.fields ?? []).length === 0 && (
          <p className="rounded-[14px] bg-panel-2 px-4 py-3 text-[12.5px] text-ink-3">Nothing to set — this block just works.</p>
        )}
        {(block?.fields ?? []).map((field) => (
          <FieldInput key={field.key} field={field} value={step.config[field.key]} onChange={(v) => set(field.key, v)} />
        ))}
      </div>

      {block?.group === "act" && (
        <p className="mt-5 rounded-[14px] bg-positive-soft px-4 py-3 text-[12px] leading-relaxed text-positive">
          A draft, never sent. It waits for you to read and send it yourself.
        </p>
      )}

      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <Button size="sm" variant="danger" icon={Trash2} onClick={onRemove}>
          Remove step
        </Button>
      </div>
    </Panel>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: BlockField;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.type === "toggle") {
    return <Toggle label={field.label} hint={field.help} checked={Boolean(value)} onChange={onChange} />;
  }
  const text = value === undefined || value === null ? "" : String(value);
  return (
    <Field label={field.label} hint={field.help} required={field.required}>
      {field.type === "textarea" ? (
        <Textarea value={text} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <Select value={text} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={field.type === "number" ? "number" : field.type === "time" ? "time" : "text"}
          min={field.type === "number" ? 0 : undefined}
          value={text}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        />
      )}
    </Field>
  );
}
