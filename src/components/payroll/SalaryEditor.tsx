"use client";

import useSWR from "swr";
import { Plus, X } from "lucide-react";
import { amount, sumExact } from "@/lib/format";
import { CURRENCY, type ComponentSpec, type Country, type SalaryLine } from "@/lib/payroll";
import { Btn, IconBtn, SelectBox, TextBox } from "@/components/payroll/ui";

/**
 * A new salary starts as the basic alone — most people here are paid exactly
 * that — and allowances are one "Add a component" away. The country is kept
 * in the signature so a country-specific start can come back without
 * touching the callers.
 */
export function starterLines(_country: Country): SalaryLine[] {
  return [{ code: "BASIC", name: "Basic salary", amount: "" }];
}

/**
 * The monthly components of one salary structure, as a small table.
 *
 * The codes come from the backend's catalogue (`/payroll/catalogue`) because
 * they carry meaning there — basic is the base for overtime, gratuity and PF —
 * and a free-text component would quietly fall outside all three. "Other
 * allowance" is the escape hatch, and it can repeat under its own names.
 */
export function SalaryEditor({
  country,
  lines,
  onChange,
  disabled,
}: {
  country: Country;
  lines: SalaryLine[];
  onChange: (lines: SalaryLine[]) => void;
  disabled?: boolean;
}) {
  const catalogue = useSWR<ComponentSpec[]>("/payroll/catalogue");
  const specs = (catalogue.data ?? []).filter((c) => c.countries.includes(country));
  const used = new Set(lines.map((l) => l.code));
  const total = sumExact(lines.map((l) => (l.amount.trim() ? l.amount.trim() : "0")));

  function set(index: number, patch: Partial<SalaryLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  // Widths live on wrappers, never on the inputs: the primitive carries
  // `w-full` and there is no tailwind-merge.
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="grid grid-cols-[minmax(0,1fr)_8rem_2.5rem] gap-2 border-b border-line bg-panel-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
        <span>Component</span>
        <span className="text-right">Monthly</span>
        <span />
      </div>
      {lines.map((line, index) => {
        const spec = specs.find((s) => s.code === line.code);
        return (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_8rem_2.5rem] items-center gap-2 border-b border-line px-2.5 py-1.5"
          >
            <div className="flex min-w-0 gap-2">
              <div className="w-44 shrink-0">
                <SelectBox
                  disabled={disabled}
                  value={line.code}
                  onChange={(e) => {
                    const next = specs.find((s) => s.code === e.target.value);
                    set(index, { code: e.target.value, name: next?.name ?? e.target.value });
                  }}
                >
                  {specs.map((s) => (
                    <option
                      key={s.code}
                      value={s.code}
                      disabled={!s.repeatable && used.has(s.code) && s.code !== line.code}
                    >
                      {s.name}
                    </option>
                  ))}
                  {!spec && <option value={line.code}>{line.code}</option>}
                </SelectBox>
              </div>
              {spec?.repeatable && (
                <div className="min-w-0 flex-1">
                  <TextBox
                    disabled={disabled}
                    value={line.name}
                    placeholder="Name on the payslip"
                    onChange={(e) => set(index, { name: e.target.value })}
                  />
                </div>
              )}
            </div>
            <TextBox
              className="text-right tnum"
              disabled={disabled}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`${line.name || "Component"} amount`}
              value={line.amount}
              onChange={(e) => set(index, { amount: e.target.value })}
            />
            {disabled ? (
              <span />
            ) : (
              <IconBtn
                icon={X}
                label="Remove"
                bare
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              />
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between px-2.5 py-1.5">
        {!disabled ? (
          <Btn
            variant="ghost"
            icon={Plus}
            onClick={() => onChange([...lines, { code: "OTHER", name: "", amount: "" }])}
          >
            Add a component
          </Btn>
        ) : (
          <span />
        )}
        <span className="tnum pr-12 text-[13px] text-ink-2">
          Total <b className="text-ink">{amount(total ?? "0", CURRENCY[country])}</b>
        </span>
      </div>
    </div>
  );
}
