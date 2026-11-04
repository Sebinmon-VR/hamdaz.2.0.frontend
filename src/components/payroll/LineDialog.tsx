"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, FileText, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { amount, decimal } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { PayItem, PayrollExtra, PayrollLine, PayrollRunDetail } from "@/lib/payroll";
import { Toggle } from "@/components/ui/controls";
import { Drawer, DrawerSection } from "@/components/payroll/Drawer";
import { AreaBox, Btn, IconBtn, Labeled, Note, SelectBox, TextBox } from "@/components/payroll/ui";

/**
 * One person's month, in the side panel: the payslip as calculated, and — in
 * a draft — the few things that can change it. Unpaid days, a bonus and a
 * deduction are typed on the sheet itself; this is for the rarer ones.
 */
export function LineDialog({
  run,
  line,
  editable,
  onClose,
  onSaved,
  onDownload,
  onOpenEmployee,
}: {
  run: PayrollRunDetail;
  line: PayrollLine;
  editable: boolean;
  onClose: () => void;
  onSaved: (next: PayrollRunDetail) => void;
  onDownload: (line: PayrollLine) => void;
  onOpenEmployee: (employeeId: string) => void;
}) {
  const [lop, setLop] = useState(line.lop_adjust);
  const [otNormal, setOtNormal] = useState(line.ot_normal_hours);
  const [otPremium, setOtPremium] = useState(line.ot_premium_hours);
  const [tds, setTds] = useState(line.tds_override ?? "");
  const [hold, setHold] = useState(line.on_hold);
  const [note, setNote] = useState(line.note ?? "");
  const [extras, setExtras] = useState<PayrollExtra[]>(line.extras);
  const [more, setMore] = useState(false);

  const save = useAction(async () => {
    const next = await api.patch<PayrollRunDetail>(`/payroll/runs/${run.id}/lines/${line.id}`, {
      lop_adjust: lop || "0",
      ot_normal_hours: otNormal || "0",
      ot_premium_hours: otPremium || "0",
      tds_override: tds.trim() ? tds.trim() : null,
      on_hold: hold,
      note: note.trim() || null,
      extras: extras.map((e) => ({ ...e, name: e.name.trim(), amount: e.amount.trim() })),
    });
    onSaved(next);
    onClose();
    return next;
  });

  const cur = run.currency;
  const uae = run.country === "AE";

  return (
    <Drawer
      open
      onClose={onClose}
      title={line.employee_name}
      subtitle={
        <>
          {line.employee_code}
          {line.designation ? ` · ${line.designation}` : ""} · {run.label} ·{" "}
          <button className="underline" onClick={() => onOpenEmployee(line.employee_id)}>
            Employee record
          </button>
        </>
      }
      footer={
        <>
          <Btn icon={FileText} onClick={() => onDownload(line)}>
            Payslip PDF
          </Btn>
          <span className="min-w-0 flex-1 truncate text-[12px] text-danger">{save.error}</span>
          <Btn variant="ghost" onClick={onClose}>
            {editable ? "Cancel" : "Close"}
          </Btn>
          {editable && (
            <Btn variant="accent" loading={save.pending} onClick={() => save.run()}>
              Save
            </Btn>
          )}
        </>
      }
    >
      {line.warnings.length > 0 && (
        <div className="-mx-5 -mt-4 mb-4 [&+section]:border-t-0 [&+section]:pt-0">
          {line.warnings.map((w) => (
            <Note key={w} tone="warn">
              {w}
            </Note>
          ))}
        </div>
      )}

      <DrawerSection
        title="Payslip"
        hint={`${decimal(line.paid_days, { min: 0 })} of ${decimal(line.basis_days, { min: 0 })} days paid`}
      >
        <div className="grid overflow-hidden rounded-md border border-line sm:grid-cols-2 sm:divide-x sm:divide-line">
          <Items title="Earnings" items={line.earnings} total={line.gross} totalLabel="Gross pay" />
          <Items title="Deductions" items={line.deductions} total={line.total_deductions} totalLabel="Total deductions" />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md border border-line px-3 py-2.5">
          <span className="text-[13px] font-semibold">Net pay</span>
          <span className="tnum text-[16px] font-semibold text-positive">{amount(line.net, cur)}</span>
        </div>
        {line.employer.length > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">
            Employer cost, not deducted: {line.employer.map((e) => `${e.name} ${amount(e.amount)}`).join(" · ")}
          </p>
        )}
      </DrawerSection>

      <DrawerSection title="This month">
        <div className="space-y-3">
          <Toggle
            disabled={!editable}
            checked={hold}
            onChange={setHold}
            label="Hold this salary"
            hint="Stays on the payslip and in the register, but is left out of the bank file."
          />
          <Labeled label="Note" hint="Shown in the salary register, not on the payslip.">
            <AreaBox disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} />
          </Labeled>
        </div>
      </DrawerSection>

      <section className="border-t border-line pt-3">
        <button
          className="flex w-full items-center gap-2 text-left text-[12.5px] font-medium text-ink-2"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
        >
          <ChevronDown className={clsx("size-4 transition", more && "rotate-180")} />
          More — {uae ? "overtime" : "tax"}, unpaid-day adjustment, several one-off amounts, workings
        </button>
        {more && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Labeled label="Unpaid days from leave" hint="Approved unpaid leave, read from Leave.">
                <TextBox disabled value={decimal(line.leave_lop_days, { min: 0 })} />
              </Labeled>
              <Labeled label="Adjustment" hint="Days added to (or, negative, taken off) the leave.">
                <TextBox disabled={!editable} inputMode="decimal" value={lop} onChange={(e) => setLop(e.target.value)} />
              </Labeled>
              {uae ? (
                <>
                  <Labeled label="Overtime hours">
                    <TextBox disabled={!editable} inputMode="decimal" value={otNormal} onChange={(e) => setOtNormal(e.target.value)} />
                  </Labeled>
                  <Labeled label="Night / rest-day hours" hint="The higher overtime rate.">
                    <TextBox disabled={!editable} inputMode="decimal" value={otPremium} onChange={(e) => setOtPremium(e.target.value)} />
                  </Labeled>
                </>
              ) : (
                <Labeled label="TDS this month" hint="Empty to calculate it.">
                  <TextBox disabled={!editable} inputMode="decimal" placeholder="Calculated" value={tds} onChange={(e) => setTds(e.target.value)} />
                </Labeled>
              )}
            </div>
            <ExtrasEditor extras={extras} onChange={setExtras} editable={editable} uae={uae} />
            <Workings line={line} uae={uae} currency={cur} />
          </div>
        )}
      </section>
    </Drawer>
  );
}

function Items({
  title,
  items,
  total,
  totalLabel,
}: {
  title: string;
  items: PayItem[];
  total: string;
  totalLabel: string;
}) {
  return (
    <div className="flex flex-col">
      <p className="border-b border-line bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
        {title}
      </p>
      <div className="flex-1 px-3 py-1.5">
        {items.length === 0 && <p className="py-0.5 text-[12.5px] text-ink-4">None</p>}
        {items.map((item, i) => (
          <div key={`${item.code}-${i}`} className="flex justify-between gap-3 py-0.5 text-[12.5px]">
            <span className="text-ink-2">{item.name}</span>
            <span className="tnum">{amount(item.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-line px-3 py-1.5 text-[12.5px] font-semibold">
        <span>{totalLabel}</span>
        <span className="tnum">{amount(total)}</span>
      </div>
    </div>
  );
}

function Workings({ line, uae, currency }: { line: PayrollLine; uae: boolean; currency: string }) {
  const w = line.workings ?? {};
  const days = w.days as Record<string, string> | undefined;
  const tax = w.tax as Record<string, string | number> | undefined;
  const pf = w.pf as Record<string, string> | undefined;
  const gratuity = w.gratuity as Record<string, string> | undefined;
  const rows: [string, string][] = [];
  if (days) rows.push(["Days", `${decimal(days.paid, { min: 0 })} paid of ${decimal(days.basis, { min: 0 })} (${days.rule})`]);
  if (uae && gratuity) rows.push(["Gratuity owed at month end", amount(gratuity.liability, currency)]);
  if (pf) rows.push(["PF wages", `${amount(pf.pf_wages)} — contributions on ${amount(pf.epf_wages)}`]);
  if (tax) {
    if (tax.projected_salary !== undefined) {
      rows.push([
        "Tax projection",
        `${amount(String(tax.projected_salary))} for the year − ${amount(String(tax.standard_deduction))} standard deduction = ${amount(String(tax.taxable_income))} taxable; tax ${amount(String(tax.total))} (FY ${tax.table_fy} table)`,
      ]);
      rows.push([
        "TDS",
        `${amount(String(tax.total))} − ${amount(String(tax.tds_before))} already deducted, over ${Number(tax.months_after) + 1} month(s) = ${amount(String(tax.monthly))}`,
      ]);
    } else {
      rows.push(["TDS", `${amount(String(tax.monthly))}, ${tax.method}`]);
    }
  }
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-line">
      <p className="border-b border-line bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
        How it was worked out
      </p>
      <dl className="px-3 py-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-0.5 text-[12px] leading-relaxed">
            <dt className="w-40 shrink-0 text-ink-3">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ExtrasEditor({
  extras,
  onChange,
  editable,
  uae,
}: {
  extras: PayrollExtra[];
  onChange: (next: PayrollExtra[]) => void;
  editable: boolean;
  uae: boolean;
}) {
  function set(index: number, patch: Partial<PayrollExtra>) {
    onChange(extras.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_7rem_4.5rem_2rem] gap-2 border-b border-line bg-panel-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
          <span>Type</span>
          <span>One-off amount</span>
          <span className="text-right">Amount</span>
          <span>{uae ? "Variable" : "Taxable"}</span>
          <span />
        </div>
        {extras.length === 0 && <p className="px-2.5 py-2 text-[12px] text-ink-4">None this month.</p>}
        {extras.map((extra, index) => (
          <div
            key={index}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_7rem_4.5rem_2rem] items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
          >
            <SelectBox
              disabled={!editable}
              value={extra.kind}
              onChange={(e) => set(index, { kind: e.target.value as PayrollExtra["kind"] })}
            >
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </SelectBox>
            <TextBox disabled={!editable} placeholder="Name on the payslip" value={extra.name} onChange={(e) => set(index, { name: e.target.value })} />
            <TextBox
              className="text-right tnum"
              disabled={!editable}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount"
              value={extra.amount}
              onChange={(e) => set(index, { amount: e.target.value })}
            />
            <span>
              {extra.kind === "earning" && (
                <input
                  type="checkbox"
                  aria-label={uae ? "Variable pay" : "Taxable"}
                  disabled={!editable}
                  checked={uae ? extra.variable : extra.taxable}
                  onChange={(e) => set(index, uae ? { variable: e.target.checked } : { taxable: e.target.checked })}
                />
              )}
            </span>
            {editable ? (
              <IconBtn icon={X} label="Remove" bare className="size-7" onClick={() => onChange(extras.filter((_, i) => i !== index))} />
            ) : (
              <span />
            )}
          </div>
        ))}
        {editable && (
          <div className="px-2.5 py-1.5">
            <Btn
              variant="ghost"
              icon={Plus}
              onClick={() => onChange([...extras, { name: "", amount: "", kind: "earning", variable: true, taxable: true }])}
            >
              Add a one-off amount
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
