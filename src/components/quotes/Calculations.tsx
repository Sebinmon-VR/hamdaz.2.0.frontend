"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { amount, decimal } from "@/lib/format";
import type { CalcStepOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";

/**
 * The working behind every figure on the quote, from the server's own pass.
 *
 * A total is a claim; this is the arithmetic. Drawn from `calculation` on the
 * quote body rather than recomputed here, so it cannot disagree with the
 * totals it explains — and so that when it is wrong, it is wrong in one place.
 *
 * Grouped in the order the arithmetic runs: the rate, the lines, the totals,
 * the tax, the landed cost, the bid. Each group folds, because the person who
 * wants to check the tax does not want to scroll past thirty lines to do it.
 */
const GROUPS: { key: CalcStepOut["group"]; title: string }[] = [
  { key: "rate", title: "Exchange rate" },
  { key: "lines", title: "Lines" },
  { key: "totals", title: "Totals" },
  { key: "tax", title: "Tax" },
  { key: "base", title: "In AED, as Zoho reports it" },
  { key: "landed", title: "Landed cost" },
  { key: "bid", title: "Bid and margin" },
];

export function Calculations({ steps }: { steps: CalcStepOut[] }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set(["lines", "landed"]));
  if (steps.length === 0) return null;

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Panel className="p-5">
      <PanelHead
        title="How the figures are worked out"
        hint="The server's own arithmetic, step by step. The total incl. tax is the figure everything else is measured against."
      />
      <div className="mt-3 space-y-2">
        {GROUPS.map(({ key, title }) => {
          const rows = steps.filter((s) => s.group === key);
          if (rows.length === 0) return null;
          const open = !closed.has(key);
          const Icon = open ? ChevronDown : ChevronRight;
          return (
            <div key={key} className="rounded-md border border-line">
              <button
                type="button"
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12px] font-semibold text-ink-2"
              >
                <Icon className="size-3.5 shrink-0 text-ink-4" />
                {title}
                <span className="ml-auto font-normal text-ink-4">{rows.length}</span>
              </button>
              {open && (
                <ol className="divide-y divide-line border-t border-line">
                  {rows.map((step, i) => (
                    <li key={i} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[12.5px] text-ink">{step.label}</span>
                        <span className="tnum shrink-0 text-[12.5px] font-medium">
                          {step.currency
                            ? amount(step.result, step.currency)
                            : step.label === "Margin"
                              ? `${decimal(step.result, { min: 1 })}%`
                              : step.result.replace(/0+$/, "").replace(/\.$/, "")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-4">{step.working}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
