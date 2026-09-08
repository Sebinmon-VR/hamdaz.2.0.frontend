"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { humanise } from "@/lib/format";
import { moduleOf, type ToolStep } from "@/lib/assistant";

/**
 * What the assistant actually did, while it does it.
 *
 * This is not a progress spinner dressed up. The whole access model here is
 * that a tool call goes through the real endpoint carrying the person's own
 * session — so "it read your leave balance" and "it was refused a colleague's"
 * are both true things about *their* permissions, and hiding them would leave
 * somebody with an answer and no way to tell which of those produced it.
 *
 * A refusal is the case worth designing for. The backend returns 403 with a
 * sentence naming who *is* allowed, the model is told to pass that on, and the
 * step stays on screen rather than disappearing once the answer arrives.
 *
 * Steps collapse to one line each and open to their arguments and the first 500
 * characters of what came back, which is all the backend keeps.
 */
export function ToolTrace({ steps, className }: { steps: ToolStep[]; className?: string }) {
  if (steps.length === 0) return null;
  return (
    <ul className={clsx("space-y-1", className)}>
      {steps.map((step, index) => (
        <li key={`${step.tool_key}-${index}`}>
          <Step step={step} />
        </li>
      ))}
    </ul>
  );
}

function Step({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const running = step.ok === undefined;
  const failed = step.ok === false;
  const detail = Boolean(step.summary) || hasArguments(step.arguments);

  return (
    <div
      className={clsx(
        "rounded-[11px] transition",
        failed ? "bg-danger-soft" : "bg-panel-2",
      )}
    >
      <button
        type="button"
        onClick={() => detail && setOpen((was) => !was)}
        aria-expanded={detail ? open : undefined}
        className={clsx(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left",
          detail ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span className="shrink-0">
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-ink-4" />
          ) : failed ? (
            <TriangleAlert className="size-3.5 text-danger" strokeWidth={2.2} />
          ) : (
            <Check className="size-3.5 text-positive" strokeWidth={2.6} />
          )}
        </span>

        <span
          className={clsx(
            "min-w-0 flex-1 truncate text-[12px]",
            failed ? "text-danger" : running ? "text-ink-3" : "text-ink-2",
          )}
        >
          {step.label}
        </span>

        <span className="micro shrink-0 text-ink-4">{humanise(moduleOf(step.tool_key))}</span>

        {/* A refused call is the one people need to be able to tell apart at a
            glance, so its status code is on the closed row rather than inside. */}
        {failed && step.status ? (
          <span className="tnum shrink-0 text-[11px] font-semibold text-danger">
            {step.status}
          </span>
        ) : step.ms !== undefined ? (
          <span className="tnum shrink-0 text-[11px] text-ink-4">{step.ms} ms</span>
        ) : null}

        {detail && (
          <ChevronRight
            className={clsx(
              "size-3 shrink-0 text-ink-4 transition-transform",
              open && "rotate-90",
            )}
            strokeWidth={2.4}
          />
        )}
      </button>

      {open && detail && (
        <div className="space-y-2 px-3 pb-2.5">
          {hasArguments(step.arguments) && (
            <div>
              <p className="micro mb-1 text-ink-4">Asked for</p>
              <ArgumentList args={step.arguments ?? {}} />
            </div>
          )}
          {step.summary && (
            <div>
              <p className="micro mb-1 text-ink-4">Came back</p>
              <pre className="no-bar max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[9px] bg-panel px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
                {step.summary}
              </pre>
            </div>
          )}
        </div>
      )}
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
