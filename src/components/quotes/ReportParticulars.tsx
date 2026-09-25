"use client";

import type { ReactNode } from "react";

import clsx from "clsx";
import { Input, Textarea } from "@/components/ui/controls";
import { Panel, PanelHead } from "@/components/ui/primitives";
import type { BidDraft } from "@/components/quotes/bid";

/**
 * What the selling & costing report needs told that the quote does not
 * otherwise hold: who the goods come from and how they travel, who finally
 * uses them, where the walk-away line is, and what to say if the customer
 * pushes back. Saved with the quote; the report and its PDF read them.
 */

const HINT =
  "Printed on the selling & costing report the approver receives. Blank walk-away and comfortable margins take the house defaults.";

// The same dense box as the quote's own fields: the primitives are 44px tall
// and there is no tailwind-merge, so the compact size is marked important.
const DENSE = "h-[30px]! rounded-[10px]! px-2.5! text-[12.5px]!";
const DENSE_AREA = "min-h-0! rounded-[10px]! px-2.5! py-1! text-[12.5px]! leading-snug!";

export function ReportParticulars({
  draft,
  editable,
  onChange,
  embedded = false,
}: {
  draft: BidDraft;
  editable: boolean;
  onChange: (patch: Partial<BidDraft>) => void;
  /** Inside one card with the quote's details: a group under a small heading. */
  embedded?: boolean;
}) {
  const set =
    <K extends keyof BidDraft>(key: K) =>
    (value: string) =>
      onChange({ [key]: value } as Partial<BidDraft>);

  const fields = (
    <div
      className={clsx(
        "flex flex-wrap gap-x-3 gap-y-2",
        embedded ? "mt-2" : "mt-3",
      )}
    >
      <P className="grow basis-[170px]" label="Supplier" hint="As the report names them. Filled from the chosen offer.">
        <Input
          value={draft.supplier_name}
          disabled={!editable}
          onChange={(e) => set("supplier_name")(e.target.value)}
          placeholder="router-switch.com"
          className={DENSE}
        />
      </P>
      <P className="grow basis-[170px]" label="Bought as" hint="Printed beside the supplier's name.">
        <Input
          value={draft.supplier_basis}
          disabled={!editable}
          onChange={(e) => set("supplier_basis")(e.target.value)}
          placeholder="online purchase"
          className={DENSE}
        />
      </P>
      <P className="grow basis-[170px]" label="Route" hint="How the goods travel.">
        <Input
          value={draft.supplier_route}
          disabled={!editable}
          onChange={(e) => set("supplier_route")(e.target.value)}
          placeholder="Express courier to Abu Dhabi"
          className={DENSE}
        />
      </P>
      <P className="grow basis-[170px]" label="End user" hint="When the customer invoiced is buying for somebody else.">
        <Input
          value={draft.end_user_name}
          disabled={!editable}
          onChange={(e) => set("end_user_name")(e.target.value)}
          className={DENSE}
        />
      </P>
      <P className="grow basis-[170px]"
        label="Walk-away margin"
        hint="Of the selling price. Below this the quote is not sold without management approval."
        suffix="%"
      >
        <Input
          value={draft.walk_away_margin_percent}
          disabled={!editable}
          inputMode="decimal"
          className={clsx(DENSE, "tnum pr-8!")}
          onChange={(e) => set("walk_away_margin_percent")(e.target.value)}
          placeholder="25"
        />
      </P>
      <P className="grow basis-[170px]"
        label="Comfortable above"
        hint="A discount that leaves at least this much needs nobody's blessing."
        suffix="%"
      >
        <Input
          value={draft.comfortable_margin_percent}
          disabled={!editable}
          inputMode="decimal"
          className={clsx(DENSE, "tnum pr-8!")}
          onChange={(e) => set("comfortable_margin_percent")(e.target.value)}
          placeholder="40"
        />
      </P>
      <P
        label="Recommendation"
        hint="What to say if the customer pushes back. Left blank, the report writes one from the ladder."
        className="basis-[380px] grow-[3]"
      >
        <Textarea
          value={draft.recommendation}
          disabled={!editable}
          rows={2}
          onChange={(e) => set("recommendation")(e.target.value)}
          placeholder="Counter at 10%, then 20%…"
          className={DENSE_AREA}
        />
      </P>
      <P
        label="Notes for the approver"
        hint="One per line. Printed under the tables after the generated footnotes."
        className="basis-full"
      >
        <Textarea
          value={draft.report_notes}
          disabled={!editable}
          rows={2}
          onChange={(e) => set("report_notes")(e.target.value)}
          placeholder="Confirm HPE warranty and COO (China) before PO."
          className={DENSE_AREA}
        />
      </P>
    </div>
  );

  if (embedded) {
    return (
      <section>
        <span className="micro block text-ink-4" title={HINT}>
          For the approver&apos;s report
        </span>
        {fields}
      </section>
    );
  }
  return (
    <Panel className="p-4">
      <PanelHead title="For the approver's report" hint={HINT} />
      {fields}
    </Panel>
  );
}

/* ── one particular ──────────────────────────────────────────────────── */

/**
 * A dense labelled control. `Field` from the controls puts 8px under its
 * label and prints the hint as a line of type; here the label sits 2px above
 * the box and the hint is its tooltip.
 */
function P({
  label,
  hint,
  suffix,
  className,
  children,
}: {
  label: string;
  hint: string;
  /** Drawn inside the right edge of the box — "%" on the two margins. */
  suffix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={clsx("block min-w-0", className)} title={hint}>
      <span className="mb-0.5 flex h-4 items-center text-[11.5px] text-ink-3">{label}</span>
      <span className="relative block">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-4">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
