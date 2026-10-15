"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  CheckCircle2,
  Dices,
  LayoutTemplate,
  PenLine,
  Play,
  Save,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import {
  BLOCKS_BY_KIND,
  GROUP_TONE,
  TEMPLATES,
  describeStep,
  problemsOf,
  stepsFromTemplate,
  suggestSteps,
  triggerOf,
  useAgents,
  type Agent,
  type AgentTemplate,
  type Step,
} from "@/lib/agents";
import { useSession } from "@/lib/session";
import { Button, Field, Input, PillRail, Textarea } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";
import { PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { AvatarPicker } from "@/components/agents/AvatarPicker";
import { RunPanel } from "@/components/agents/RunPanel";
import { BlockBuilder } from "@/components/agents/BlockBuilder";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * Making an agent, and changing one: who it is, what it does, and a last look.
 *
 * The three stages are a guide on a new agent and plain tabs on an existing
 * one — nothing is locked behind "Next", because somebody fixing a step should
 * not have to walk past the avatar to get to it.
 *
 * What it does can be written, built from blocks, or both. The words are kept
 * either way: the blocks are the steps, the words are how the person wants
 * them done, and the model will read the two together.
 */

type Stage = "who" | "job" | "review" | "run";

const BUILD: { key: Stage; label: string }[] = [
  { key: "who", label: "Who it is" },
  { key: "job", label: "What it does" },
  { key: "review", label: "Check & save" },
];
/** A saved agent can also be run; a new one has to exist first. */
const SAVED: { key: Stage; label: string }[] = [...BUILD, { key: "run", label: "Run it" }];

/** ?run=<id> opens a run straight away — the link a notification carries. */
function runInUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("run");
}

const NAMES = ["Nova", "Atlas", "Pip", "Juno", "Echo", "Milo", "Sage", "Orbit", "Zara", "Kit", "Remy", "Indy"];

export function AgentEditor({ initial, isNew }: { initial: Agent; isNew: boolean }) {
  const session = useSession();
  const router = useRouter();
  const { save } = useAgents(session.user.id);

  const [agent, setAgent] = useState<Agent>(initial);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial));
  const STAGES = isNew ? BUILD : SAVED;
  const [openRun] = useState(runInUrl);
  // A saved agent opens on its runs: running it is what people come back for.
  const [stage, setStage] = useState<Stage>(isNew ? "who" : "run");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = JSON.stringify(agent) !== saved;
  const problems = useMemo(() => problemsOf(agent), [agent]);
  const set = (patch: Partial<Agent>) => setAgent((a) => ({ ...a, ...patch }));

  // A tab closed on unsaved work asks first; the browser writes the words.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function commit() {
    setSaving(true);
    setSaveError(null);
    try {
      const stored = await save({ ...agent, name: agent.name.trim(), role: agent.role.trim() }, isNew);
      setAgent(stored);
      setSaved(JSON.stringify(stored));
      if (isNew) {
        router.replace(`/agents/${stored.id}`);
      } else {
        setFlash(true);
        setTimeout(() => setFlash(false), 1600);
      }
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "It could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-3.5">
      <PageHead
        eyebrow="AI agents"
        title={agent.name.trim() || (isNew ? "New agent" : "Unnamed agent")}
        actions={
          <>
            {!isNew && dirty && <span className="micro hidden text-warn sm:inline">Unsaved</span>}
            <Button
              variant="accent"
              size="sm"
              icon={flash ? Check : Save}
              loading={saving}
              disabled={!agent.name.trim() || (!isNew && !dirty)}
              onClick={commit}
            >
              {isNew ? "Create agent" : flash ? "Saved" : "Save"}
            </Button>
          </>
        }
      />

      {/* The stage switcher. Numbered, because on a new agent it is a sequence. */}
      <div className="lift flex flex-wrap items-center gap-1 rounded-[16px] bg-panel p-1.5">
        {STAGES.map((s, i) => {
          const active = s.key === stage;
          const done = isNew && i < stageIndex;
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={clsx(
                "flex h-10 flex-1 items-center justify-center gap-2 rounded-[12px] px-4 text-[13px] transition sm:flex-none",
                active ? "bg-accent font-bold text-accent-ink" : "font-medium text-ink-3 hover:bg-panel-2 hover:text-ink",
              )}
            >
              <span
                className={clsx(
                  "tnum grid size-5 place-items-center rounded-full text-[10.5px] font-bold",
                  active ? "bg-accent-ink/15" : done ? "bg-positive-soft text-positive" : "bg-panel-3 text-ink-3",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
        <span className="ml-auto hidden px-3 text-[11.5px] text-ink-4 md:block">
          {agent.steps.length} step{agent.steps.length === 1 ? "" : "s"}
          {problems.length > 0 ? ` · ${problems.length} to sort out` : " · ready"}
        </span>
      </div>

      {saveError && <InlineNotice tone="danger">{saveError}</InlineNotice>}

      {stage === "who" && <WhoStage agent={agent} set={set} />}
      {stage === "run" && !isNew && (
        <RunPanel agent={agent} dirty={dirty} initialRunId={openRun} onSave={commit} saving={saving} />
      )}
      {stage === "job" && (
        <JobStage
          agent={agent}
          set={set}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      {stage === "review" && (
        <ReviewStage
          agent={agent}
          isNew={isNew}
          canSave={Boolean(agent.name.trim()) && (isNew || dirty)}
          onSave={commit}
          onJump={(stepId) => {
            setSelectedId(stepId ?? null);
            setStage(stepId ? "job" : agent.name.trim() ? "job" : "who");
          }}
        />
      )}

      <div className="flex items-center justify-between pb-2">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          disabled={stageIndex === 0}
          onClick={() => setStage(STAGES[stageIndex - 1].key)}
        >
          Back
        </Button>
        {stageIndex < STAGES.length - 1 && (
          <Button variant="solid" onClick={() => setStage(STAGES[stageIndex + 1].key)}>
            Next: {STAGES[stageIndex + 1].label.toLowerCase()}
            <ArrowRight className="size-3.5" strokeWidth={2.2} />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── 1. who it is ────────────────────────────────────────────────────── */

function WhoStage({ agent, set }: { agent: Agent; set: (patch: Partial<Agent>) => void }) {
  const name = agent.name.trim() || "your agent";
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* The live preview: what everyone will see. */}
      <Panel className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden px-6 py-10 text-center">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(color-mix(in oklab, var(--ink) 9%, transparent) 1.2px, transparent 1.2px)",
            backgroundSize: "18px 18px",
            maskImage: "radial-gradient(circle at 50% 42%, #000 0%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 42%, #000 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <AgentAvatar spec={agent.avatar} size={230} mood="idle" title={`${name}'s avatar`} />
        </div>
        <div className="relative mt-6 max-w-sm">
          <p className="display text-[34px]">{agent.name.trim() || "Name me"}</p>
          <p className="mt-2 text-[13px] text-ink-3">{agent.role.trim() || "Tell me what I am for."}</p>
        </div>
        <div className="relative mt-6 max-w-xs rounded-[18px] rounded-tl-[6px] bg-panel-2 px-4 py-3 text-left text-[12.5px] leading-relaxed text-ink-2">
          Hi{agent.name.trim() ? `, I'm ${agent.name.trim()}` : ""}. Give me a job on the next page and I will do the
          legwork — I draft, you decide.
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <PanelHead title="Who it is" hint="Only you see your agents." />
        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Name" required>
            <Input
              value={agent.name}
              maxLength={40}
              placeholder="e.g. Nova"
              onChange={(e) => set({ name: e.target.value })}
              autoFocus={!agent.name}
            />
          </Field>
          <Button
            variant="outline"
            icon={Dices}
            className="h-11"
            onClick={() => {
              const others = NAMES.filter((n) => n !== agent.name);
              set({ name: others[Math.floor(Math.random() * others.length)] });
            }}
          >
            Suggest
          </Button>
        </div>
        <Field label="What is it for?" hint="One line. It shows under the name." className="mt-4">
          <Input
            value={agent.role}
            maxLength={100}
            placeholder="e.g. Prepares RFQs and draft quotes for my presales tasks"
            onChange={(e) => set({ role: e.target.value })}
          />
        </Field>
        <div className="mt-6 border-t border-line pt-5">
          <AvatarPicker value={agent.avatar} onChange={(avatar) => set({ avatar })} />
        </div>
      </Panel>
    </div>
  );
}

/* ── 2. what it does ─────────────────────────────────────────────────── */

type Mode = "blocks" | "write";

function JobStage({
  agent,
  set,
  selectedId,
  onSelect,
}: {
  agent: Agent;
  set: (patch: Partial<Agent>) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>(agent.steps.length === 0 && agent.instructions ? "write" : "blocks");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  function applyTemplate(template: AgentTemplate) {
    set({
      steps: stepsFromTemplate(template),
      instructions: agent.instructions.trim() ? agent.instructions : template.instructions,
      role: agent.role.trim() ? agent.role : template.role,
    });
    onSelect(null);
    setTemplatesOpen(false);
    setMode("blocks");
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={mode}
          onChange={setMode}
          options={[
            { value: "blocks", label: "Build with blocks", icon: Blocks, count: agent.steps.length || undefined },
            { value: "write", label: "Write it", icon: PenLine },
          ]}
        />
        <p className="hidden text-[12px] text-ink-4 md:block">
          {mode === "blocks"
            ? "Drag blocks into order. The words you write go with them."
            : "Say it in your own words. Turn it into blocks when you like."}
        </p>
        <Button variant="outline" size="sm" icon={LayoutTemplate} className="ml-auto" onClick={() => setTemplatesOpen(true)}>
          Templates
        </Button>
      </div>

      {mode === "blocks" && agent.steps.length === 0 && (
        <TemplateStrip onPick={applyTemplate} />
      )}

      {mode === "blocks" ? (
        <BlockBuilder
          steps={agent.steps}
          onChange={(steps) => set({ steps })}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <WritePanel
          agent={agent}
          set={set}
          onUseBlocks={() => setMode("blocks")}
        />
      )}

      <Modal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="Start from a template"
        description={
          agent.steps.length > 0
            ? "Picking one replaces the steps you have. Your name, avatar and words stay."
            : "A ready-made set of steps you can change afterwards."
        }
        width="lg"
      >
        <div className="grid gap-2.5 pb-5 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.key} template={t} onPick={() => applyTemplate(t)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function TemplateStrip({ onPick }: { onPick: (t: AgentTemplate) => void }) {
  return (
    <Panel className="p-4 sm:p-5">
      <PanelHead title="Start from a template" hint="Or drag your own blocks in below." />
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.key} template={t} onPick={() => onPick(t)} />
        ))}
      </div>
    </Panel>
  );
}

function TemplateCard({ template, onPick }: { template: AgentTemplate; onPick: () => void }) {
  const Icon = template.icon;
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex flex-col rounded-[16px] bg-panel-2 p-4 text-left transition hover:bg-panel-3"
    >
      <span className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="text-[13.5px] font-semibold">{template.name}</span>
      </span>
      <span className="mt-2 text-[12px] leading-relaxed text-ink-3">{template.blurb}</span>
      {/* The flow at a glance: one pip per step, in its group's colour. */}
      <span className="mt-3 flex flex-wrap gap-1">
        {template.steps.map(([kind], i) => (
          <span
            key={i}
            title={BLOCKS_BY_KIND[kind]?.name}
            className={clsx("h-1.5 w-4 rounded-full", GROUP_TONE[BLOCKS_BY_KIND[kind]?.group ?? "wait"].soft, "ring-1 ring-inset ring-current", GROUP_TONE[BLOCKS_BY_KIND[kind]?.group ?? "wait"].ink)}
          />
        ))}
      </span>
    </button>
  );
}

function WritePanel({
  agent,
  set,
  onUseBlocks,
}: {
  agent: Agent;
  set: (patch: Partial<Agent>) => void;
  onUseBlocks: () => void;
}) {
  const [suggested, setSuggested] = useState<Step[] | null>(null);

  return (
    <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel className="p-5 sm:p-6">
        <PanelHead title="In your own words" hint="What should it do, and how?" />
        <Textarea
          className="mt-4 min-h-[280px] text-[14px]"
          value={agent.instructions}
          onChange={(e) => {
            set({ instructions: e.target.value });
            setSuggested(null);
          }}
          placeholder={
            "e.g. When I get a new presales task, read the documents and pull out the items. " +
            "Find five suppliers in the UAE and draft the RFQ emails — check with me before contacting anyone. " +
            "When replies come in, compare them and draft the quote."
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            size="sm"
            icon={Wand2}
            disabled={agent.instructions.trim().length < 12}
            onClick={() => setSuggested(suggestSteps(agent.instructions))}
          >
            Suggest blocks
          </Button>
          <span className="text-[11.5px] text-ink-4">Matched from your words — check them before you use them.</span>
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        {suggested ? (
          <>
            <PanelHead title="Suggested steps" count={suggested.length} />
            <ol className="mt-4 space-y-1.5">
              {suggested.map((step, i) => (
                <MiniStep key={step.id} step={step} index={i + (triggerOf({ steps: suggested }) ? 0 : 1)} />
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                variant="accent"
                size="sm"
                icon={Check}
                onClick={() => {
                  set({ steps: suggested });
                  setSuggested(null);
                  onUseBlocks();
                }}
              >
                {agent.steps.length ? "Replace my steps" : "Use these"}
              </Button>
              {agent.steps.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    const hasTrigger = Boolean(triggerOf(agent));
                    const extra = suggested.filter((s) => !(hasTrigger && BLOCKS_BY_KIND[s.kind]?.group === "start"));
                    set({ steps: [...agent.steps, ...extra] });
                    setSuggested(null);
                    onUseBlocks();
                  }}
                >
                  Add to mine
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSuggested(null)}>
                Dismiss
              </Button>
            </div>
          </>
        ) : agent.steps.length ? (
          <>
            <PanelHead title="Its steps now" count={agent.steps.length} action={<Button size="sm" variant="ghost" icon={Blocks} onClick={onUseBlocks}>Edit blocks</Button>} />
            <ol className="mt-4 space-y-1.5">
              {agent.steps.map((step, i) => (
                <MiniStep key={step.id} step={step} index={i + (triggerOf(agent) ? 0 : 1)} />
              ))}
            </ol>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <span className="mb-4 grid size-11 place-items-center rounded-full bg-panel-2 text-ink-3">
              <Sparkles className="size-5" strokeWidth={1.8} />
            </span>
            <p className="text-[14px] font-semibold">Write first, build after</p>
            <p className="mt-2 max-w-[300px] text-[12.5px] leading-relaxed text-ink-3">
              Describe the job, then press Suggest blocks to lay it out as steps you can rearrange.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function MiniStep({ step, index, active, done }: { step: Step; index: number; active?: boolean; done?: boolean }) {
  const block = BLOCKS_BY_KIND[step.kind];
  const tone = GROUP_TONE[block?.group ?? "wait"];
  const Icon = block?.icon ?? Square;
  return (
    <li
      className={clsx(
        "flex items-center gap-3 rounded-[13px] px-2.5 py-2 transition",
        active ? "bg-accent-soft ring-1 ring-accent" : "bg-panel-2",
        done && "opacity-60",
      )}
    >
      <span className="tnum w-4 text-right text-[11px] text-ink-4">{block?.group === "start" ? "" : index}</span>
      <span className={clsx("grid size-7 shrink-0 place-items-center rounded-[9px]", tone.soft, tone.ink)}>
        {done ? <Check className="size-3.5" strokeWidth={2.6} /> : <Icon className="size-3.5" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{block?.name ?? step.kind}</span>
        <span className="block truncate text-[11.5px] text-ink-4">{describeStep(step)}</span>
      </span>
    </li>
  );
}

/* ── 3. check & save ─────────────────────────────────────────────────── */

function ReviewStage({
  agent,
  isNew,
  canSave,
  onSave,
  onJump,
}: {
  agent: Agent;
  isNew: boolean;
  canSave: boolean;
  onSave: () => void;
  onJump: (stepId?: string) => void;
}) {
  const problems = problemsOf(agent);
  const trigger = triggerOf(agent);
  // The walk-through: each step lights in turn. Nothing is read or sent.
  const [playing, setPlaying] = useState<number | null>(null);

  useEffect(() => {
    if (playing === null) return;
    if (playing >= agent.steps.length) {
      const done = setTimeout(() => setPlaying(null), 1400);
      return () => clearTimeout(done);
    }
    const next = setTimeout(() => setPlaying((p) => (p === null ? null : p + 1)), 950);
    return () => clearTimeout(next);
  }, [playing, agent.steps.length]);

  const current = playing !== null ? agent.steps[playing] : null;

  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Panel className="flex flex-col items-center px-6 py-8 text-center">
        <AgentAvatar spec={agent.avatar} size={170} mood={playing !== null ? "active" : "idle"} />
        <p className="display mt-5 text-[28px]">{agent.name.trim() || "Unnamed"}</p>
        {agent.role.trim() && <p className="mt-2 text-[13px] text-ink-3">{agent.role}</p>}

        <div className="mt-5 min-h-[44px] max-w-xs rounded-[18px] bg-panel-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          {playing === null
            ? trigger
              ? `I start: ${describeStep(trigger).replace(/^./, (c) => c.toLowerCase())}.`
              : "I do not know when to start yet."
            : current
              ? `${BLOCKS_BY_KIND[current.kind]?.name}… ${describeStep(current)}`
              : "Done. Everything I made is waiting for you."}
        </div>

        <Button
          className="mt-5"
          variant={playing === null ? "solid" : "outline"}
          size="sm"
          icon={playing === null ? Play : Square}
          disabled={agent.steps.length === 0}
          onClick={() => setPlaying(playing === null ? 0 : null)}
        >
          {playing === null ? "Walk through it" : "Stop"}
        </Button>
        <p className="mt-2 text-[11px] text-ink-4">A preview. Nothing is read or sent.</p>
      </Panel>

      <div className="space-y-3.5">
        {problems.length > 0 ? (
          <Panel className="p-5">
            <PanelHead title="Before it can run" count={problems.length} />
            <ul className="mt-3 space-y-1.5">
              {problems.map((p, i) => (
                <li key={i}>
                  <button
                    onClick={() => onJump(p.stepId)}
                    className="flex w-full items-center gap-2.5 rounded-[12px] bg-warn-soft px-3.5 py-2.5 text-left text-[12.5px] text-warn transition hover:opacity-85"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-warn" />
                    <span className="flex-1">{p.message}</span>
                    <ArrowRight className="size-3.5" strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel className="flex items-center gap-3 p-5">
            <CheckCircle2 className="size-5 shrink-0 text-positive" strokeWidth={2} />
            <p className="text-[13px]">
              <span className="font-semibold">Ready.</span>{" "}
              <span className="text-ink-3">Everything it needs is set.</span>
            </p>
          </Panel>
        )}

        <Panel className="p-5">
          <PanelHead title="What it will do" count={agent.steps.length} />
          {agent.steps.length ? (
            <ol className="mt-3 space-y-1.5">
              {agent.steps.map((step, i) => (
                <MiniStep
                  key={step.id}
                  step={step}
                  index={i + (trigger ? 0 : 1)}
                  active={playing === i}
                  done={playing !== null && i < playing}
                />
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-[12.5px] text-ink-3">No steps yet.</p>
          )}
          {agent.instructions.trim() && (
            <blockquote className="mt-4 rounded-[14px] border-l-4 border-accent bg-panel-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-line">
              {agent.instructions.trim()}
            </blockquote>
          )}
        </Panel>

        <InlineNotice tone="info">
          It works with the app first — your tasks, their documents, our past quotes — and asks the AI model only
          for what is left. Every step shows where its facts came from. Emails and quotes are drafts: you send them.
        </InlineNotice>

        <div className="flex justify-end">
          <Button variant="accent" icon={isNew ? Sparkles : Save} disabled={!canSave} onClick={onSave}>
            {isNew ? "Create agent" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
