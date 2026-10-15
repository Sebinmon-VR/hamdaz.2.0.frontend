"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, PawPrint, Plus, Trash2 } from "lucide-react";
import {
  BLOCKS_BY_KIND,
  GROUP_TONE,
  STARTER_AVATARS,
  TEMPLATES,
  describeStep,
  problemsOf,
  triggerOf,
  normalizeAvatar,
  useAgents,
  useRecentRuns,
  type Agent,
} from "@/lib/agents";
import { date, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import { setCompanionAgent, useCompanion } from "@/lib/companion";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, IconButton, LinkButton } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * Your agents. Everybody's own — there is no "everyone's" view, because an
 * agent works for the person who made it and acts as them.
 */
export default function AgentsPage() {
  const session = useSession();
  const router = useRouter();
  const { agents, error, loading, remove, duplicate } = useAgents(session.user.id);
  const [failed, setFailed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const companion = useCompanion();
  const companionId = agents.find((a) => a.id === companion.agentId)?.id ?? agents[0]?.id;

  return (
    <div className="space-y-3.5">
      <PageHead
        eyebrow="AI agents"
        title="My agents"
        count={agents.length || undefined}
        lead="Assistants that do the legwork for you, step by step. They draft; you decide."
        actions={
          <LinkButton href="/agents/new" variant="accent" size="sm" icon={Plus}>
            New agent
          </LinkButton>
        }
      />

      {failed && <InlineNotice tone="danger">{failed}</InlineNotice>}

      {error ? (
        <ErrorState error={error} />
      ) : loading ? (
        <RowsSkeleton rows={4} />
      ) : agents.length === 0 ? (
        <FirstAgent />
      ) : (
        <>
          <Results />
          <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isCompanion={agent.id === companionId}
                onDuplicate={async () => {
                  try {
                    const copy = await duplicate(agent.id);
                    if (copy) router.push(`/agents/${copy.id}`);
                  } catch (caught) {
                    setFailed(caught instanceof Error ? caught.message : "It could not be copied.");
                  }
                }}
                onDelete={() => setDeleting(agent)}
              />
            ))}
            <Link
              href="/agents/new"
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-line-strong text-ink-3 transition hover:border-accent hover:text-ink"
            >
              <span className="grid size-11 place-items-center rounded-full bg-panel-2">
                <Plus className="size-5" strokeWidth={2} />
              </span>
              <span className="text-[13px] font-medium">Make another</span>
            </Link>
          </div>
        </>
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || "this agent"}?`}
        description="Its steps and settings go with it. This cannot be undone."
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                const target = deleting;
                setDeleting(null);
                if (!target) return;
                try {
                  await remove(target.id);
                } catch (caught) {
                  setFailed(caught instanceof Error ? caught.message : "It could not be deleted.");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

function AgentCard({
  agent,
  isCompanion,
  onDuplicate,
  onDelete,
}: {
  agent: Agent;
  isCompanion: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const trigger = triggerOf(agent);
  const problems = problemsOf(agent);
  const href = `/agents/${agent.id}`;

  return (
    <Panel
      className="group flex flex-col p-5"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-start gap-4">
        <Link href={href} aria-label={`Open ${agent.name}`}>
          <AgentAvatar spec={agent.avatar} size={96} mood={hover ? "active" : "idle"} />
        </Link>
        <div className="min-w-0 flex-1 pt-1">
          <Link href={href}>
            <h3 className="truncate text-[18px] font-bold tracking-tight">{agent.name || "Unnamed"}</h3>
          </Link>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">
            {agent.role || "No role written yet."}
          </p>
        </div>
        <Link
          href={href}
          aria-label={`Open ${agent.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-3 transition hover:border-accent hover:text-ink"
        >
          <ArrowUpRight className="size-4" strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mt-5 rounded-[14px] bg-panel-2 px-3.5 py-3">
        <p className="micro text-ink-4">Starts when</p>
        <p className="mt-1 truncate text-[12.5px] text-ink-2">{trigger ? describeStep(trigger) : "Not set"}</p>
        {/* The flow at a glance: one pip per step, in its group's colour. */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {agent.steps.map((step) => {
            const block = BLOCKS_BY_KIND[step.kind];
            const tone = GROUP_TONE[block?.group ?? "wait"];
            return (
              <span
                key={step.id}
                title={block?.name}
                className={clsx("h-1.5 w-5 rounded-full ring-1 ring-inset ring-current", tone.soft, tone.ink)}
              />
            );
          })}
          {agent.steps.length === 0 && <span className="text-[11.5px] text-ink-4">No steps yet</span>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {problems.length === 0 ? (
          <Badge tone="positive">Ready</Badge>
        ) : (
          <Badge tone="warn" title={problems.map((p) => p.message).join("\n")}>
            {problems.length} to sort out
          </Badge>
        )}
        <Badge>{agent.steps.length} steps</Badge>
        {isCompanion && (
          <Badge tone="accent" icon={PawPrint} title="In the bar on every screen. Drag it down and it follows you.">
            With you
          </Badge>
        )}
        <span className="ml-auto text-[11.5px] text-ink-4" title={date(agent.updatedAt)}>
          {relative(agent.updatedAt)}
        </span>
        {!isCompanion && (
          <IconButton
            size="sm"
            tone="ghost"
            icon={PawPrint}
            label={`Take ${agent.name || "this agent"} along`}
            onClick={() => setCompanionAgent(agent.id)}
          />
        )}
        <IconButton size="sm" tone="ghost" icon={Copy} label={`Duplicate ${agent.name}`} onClick={onDuplicate} />
        <IconButton size="sm" tone="ghost" icon={Trash2} label={`Delete ${agent.name}`} onClick={onDelete} />
      </div>
    </Panel>
  );
}

/**
 * What your agents did, across all of them: anything waiting for your answer
 * first, then the latest results. Each opens its run.
 */
function Results() {
  const { data } = useRecentRuns();
  if (!data || data.length === 0) return null;
  const waiting = data.filter((r) => r.status === "waiting");
  const latest = data.filter((r) => r.status !== "waiting").slice(0, 6);
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel className={clsx("p-4", waiting.length > 0 && "ring-2 ring-warn")}>
        <PanelHead title="Needs you" count={waiting.length || undefined} />
        {waiting.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-ink-4">Nothing is waiting for your answer.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {waiting.map((r) => (
              <li key={r.id}>
                <Link href={`/agents/${r.agent_id}?run=${r.id}`} className="flex items-center gap-3 rounded-[12px] bg-warn-soft px-3 py-2 transition hover:opacity-90">
                  <AgentAvatar spec={normalizeAvatar(r.agent_avatar)} size={34} mood="active" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-warn">{r.agent_name}: {r.question_title ?? "needs your answer"}</span>
                    <span className="block truncate text-[11px] text-ink-3">{r.task_title || "Files only"} · {relative(r.created_at)}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-warn" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="p-4">
        <PanelHead title="Latest results" />
        <ul className="mt-3 space-y-1">
          {latest.map((r) => (
            <li key={r.id}>
              <Link href={`/agents/${r.agent_id}?run=${r.id}`} className="flex items-start gap-3 rounded-[12px] px-2.5 py-2 transition hover:bg-panel-2">
                <AgentAvatar spec={normalizeAvatar(r.agent_avatar)} size={30} mood="still" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold">{r.agent_name}</span>
                    <Badge tone={r.status === "done" ? "positive" : r.status === "failed" ? "danger" : r.status === "running" ? "info" : "neutral"}>
                      {r.status === "done" ? "Done" : r.status === "failed" ? "Failed" : r.status === "running" ? "Working" : "Stopped"}
                    </Badge>
                    <span className="ml-auto shrink-0 text-[11px] text-ink-4">{relative(r.created_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-ink-3">{r.summary || r.task_title || "Working…"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** The empty page is the invitation: the four characters, and the ways to begin. */
function FirstAgent() {
  return (
    <Panel className="relative overflow-hidden px-6 py-14 text-center sm:px-10">
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(color-mix(in oklab, var(--ink) 9%, transparent) 1.2px, transparent 1.2px)",
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 70%)",
        }}
      />
      <div className="relative flex flex-wrap items-end justify-center gap-2 sm:gap-5">
        {STARTER_AVATARS.map((spec, i) => (
          <AgentAvatar key={i} spec={spec} size={i === 1 || i === 2 ? 132 : 116} />
        ))}
      </div>
      <h2 className="display relative mt-8 text-[34px] sm:text-[44px]">Make your first agent</h2>
      <p className="relative mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-3">
        Give it a name and a face, then tell it what to do — in your own words, or by dragging blocks into
        order. It does the legwork and leaves the decisions to you.
      </p>
      <div className="relative mt-7 flex justify-center">
        <LinkButton href="/agents/new" variant="accent" size="lg" icon={Plus}>
          Create an agent
        </LinkButton>
      </div>

      <div className="relative mx-auto mt-10 grid max-w-4xl gap-2.5 text-left sm:grid-cols-2 lg:grid-cols-4">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={`/agents/new?template=${t.key}`}
              className="rounded-[16px] bg-panel-2 p-4 transition hover:bg-panel-3"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-accent-text" strokeWidth={2} />
                <span className="text-[13px] font-semibold">{t.name}</span>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-ink-3">{t.blurb}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
