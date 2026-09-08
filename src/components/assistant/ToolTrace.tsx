"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import { humanise } from "@/lib/format";
import { moduleOf, type ToolStep } from "@/lib/assistant";
import { ResultPreview } from "@/components/assistant/ResultPreview";

/**
 * What the assistant actually did, while it does it.
 *
 * This is not a progress spinner dressed up. The whole access model here is
 * that a tool call goes through the real endpoint carrying the person's own
 * session — so "it read your leave balance" and "it was refused a colleague's"
 * are both true things about *their* permissions, and hiding them would leave
 * somebody with an answer and no way to tell which of those produced it. A
 * refusal is the case worth designing for: the backend returns 403 with a
 * sentence naming who *is* allowed, and the step stays on screen rather than
 * disappearing once the answer arrives.
 *
 * **It is drawn as a flow, along one line, and that is the fix for a real
 * problem.** These were stacked cards, one under another, and a turn that calls
 * eight tools — which is ordinary, since searching the catalogue then reading
 * three modules is four on its own — pushed the answer off the bottom of the
 * screen before it had finished arriving. Height that grows with the number of
 * calls is the wrong shape for something that sits *inside* a message.
 *
 * So: one row, scrolling sideways, following the newest call as it arrives. The
 * sequence is the thing worth seeing at a glance — what it looked up, in what
 * order, and where it failed — and a left-to-right chain reads as a sequence in
 * a way a vertical list of equal cards never did. Detail opens **below** the
 * rail, one call at a time, in a box with a fixed ceiling. The whole trace is
 * therefore the same height whether it holds two calls or twenty.
 */
export function ToolTrace({ steps, className }: { steps: ToolStep[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement | null>(null);

  // Follow the newest call. Without this the rail sits on the first step while
  // the work happens off the right-hand edge — which is the same failure as the
  // stacked version, turned ninety degrees.
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
  }, [steps.length]);

  if (steps.length === 0) return null;

  const selected = open !== null ? steps[open] : undefined;

  return (
    <div className={clsx("min-w-0", className)}>
      <div
        ref={rail}
        className="no-bar flex items-stretch gap-0 overflow-x-auto py-0.5"
        role="list"
        aria-label={`${steps.length} tool ${steps.length === 1 ? "call" : "calls"}`}
      >
        {steps.map((step, index) => (
          <div key={`${step.tool_key}-${index}`} role="listitem" className="flex items-center">
            {index > 0 && <Connector failed={step.ok === false} />}
            <Node
              step={step}
              open={open === index}
              onToggle={() => setOpen((was) => (was === index ? null : index))}
            />
          </div>
        ))}
      </div>

      {selected && (
        <Detail step={selected} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/**
 * The line between two calls.
 *
 * Short, and it carries no meaning of its own — the model decides what to call
 * next as it goes, so this is a sequence and emphatically not a dependency
 * graph. Drawing it as one, with branches, would be inventing structure that
 * the run does not have.
 */
function Connector({ failed }: { failed: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx("h-px w-3 shrink-0", failed ? "bg-danger/40" : "bg-line")}
    />
  );
}

function Node({
  step,
  open,
  onToggle,
}: {
  step: ToolStep;
  open: boolean;
  onToggle: () => void;
}) {
  const running = step.ok === undefined;
  const failed = step.ok === false;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={`${step.label} — ${humanise(moduleOf(step.tool_key))}${
        failed && step.status ? ` · refused ${step.status}` : ""
      }`}
      className={clsx(
        "flex max-w-[13rem] shrink-0 items-center gap-2 rounded-[13px] px-3 py-2 text-left transition",
        failed
          ? "bg-danger-soft ring-1 ring-danger/30"
          : running
            ? "bg-panel-2 ring-1 ring-accent/40"
            : "bg-panel-2 hover:bg-panel-3",
        open && "ring-1 ring-accent",
      )}
    >
      <span className="shrink-0">
        {running ? (
          <Loader2 className="size-3.5 animate-spin text-accent-text" />
        ) : failed ? (
          <TriangleAlert className="size-3.5 text-danger" strokeWidth={2.2} />
        ) : (
          <Check className="size-3.5 text-positive" strokeWidth={2.6} />
        )}
      </span>

      <span className="min-w-0">
        <span
          className={clsx(
            "block truncate text-[12px] leading-tight",
            failed ? "text-danger" : running ? "text-ink-3" : "text-ink-2",
          )}
        >
          {step.label}
        </span>
        <span className="micro block truncate text-ink-4">
          {humanise(moduleOf(step.tool_key))}
          {failed && step.status ? ` · ${step.status}` : ""}
          {!failed && step.ms !== undefined ? ` · ${step.ms} ms` : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * One call, opened.
 *
 * Capped in height and scrolled inside itself, which is the other half of
 * keeping the trace a fixed size: a tool that returns a page of rows must not
 * be able to push the answer down any more than twenty tools in a row can.
 */
function Detail({ step, onClose }: { step: ToolStep; onClose: () => void }) {
  const failed = step.ok === false;
  return (
    <div className="rise mt-2 overflow-hidden rounded-[15px] bg-panel-2">
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
          {step.label}
        </span>
        <span className="micro shrink-0 text-ink-4">{step.tool_key}</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-ink"
        >
          <X className="size-3" strokeWidth={2.4} />
        </button>
      </div>

      <div className="no-bar max-h-72 space-y-3 overflow-y-auto px-3.5 pb-3 pt-2.5">
        {hasArguments(step.arguments) && (
          <div>
            <p className="micro mb-1 text-ink-4">Asked for</p>
            <ArgumentList args={step.arguments ?? {}} />
          </div>
        )}

        {step.ok === undefined ? (
          <p className="text-[11.5px] text-ink-4">Still running.</p>
        ) : (
          <div>
            <p className="micro mb-1 text-ink-4">
              {failed ? `Refused — ${step.status ?? "no status"}` : "Came back"}
            </p>
            <ResultPreview step={step} />
          </div>
        )}
      </div>
    </div>
  );
}

function hasArguments(args: Record<string, unknown> | undefined): boolean {
  return Boolean(args && Object.keys(args).length > 0);
}

/**
 * The arguments a call was made with, as a list of pairs.
 *
 * A pair rather than the raw JSON: on a confirmation card these are the values
 * somebody is being asked to approve, and "start_date · 2026-09-14" is read
 * correctly at a glance where a brace-and-quote blob is skimmed and waved
 * through. Nested values fall back to JSON, since inventing a tree view for the
 * rare case would cost more than it returns.
 */
export function ArgumentList({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return <p className="text-[11.5px] text-ink-4">No arguments.</p>;
  }
  return (
    <dl className="space-y-1">
      {entries.map(([name, value]) => (
        <div key={name} className="flex gap-2.5 text-[11.5px]">
          <dt className="w-32 shrink-0 truncate text-ink-4">{humanise(name)}</dt>
          <dd className="min-w-0 flex-1 break-words text-ink-2">{show(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}
