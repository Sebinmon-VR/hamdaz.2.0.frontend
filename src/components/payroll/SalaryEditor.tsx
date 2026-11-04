"use client";

import useSWR from "swr";
import { Plus, X } from "lucide-react";
import { amount, sumExact } from "@/lib/format";
import { CURRENCY, type ComponentSpec, type Country, type SalaryLine } from "@/lib/payroll";
import { Button, IconButton, Input, Select } from "@/components/ui/controls";

/** A sensible first structure for each country — a processor edits the amounts. */
export function starterLines(country: Country): SalaryLine[] {
  return country === "AE"
    ? [
        { code: "BASIC", name: "Basic salary", amount: "" },
        { code: "HOUSING", name: "Housing allowance", amount: "" },
        { code: "TRANSPORT", name: "Transport allowance", amount: "" },
      ]
    : [
        { code: "BASIC", name: "Basic salary", amount: "" },
        { code: "HRA", name: "House rent allowance", amount: "" },
        { code: "SPECIAL", name: "Special allowance", amount: "" },
      ];
}

/**
 * The monthly components of one salary structure.
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

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const spec = specs.find((s) => s.code === line.code);
        return (
          <div key={index} className="flex items-center gap-2">
            <div className="w-48 shrink-0">
              <Select
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
              </Select>
            </div>
            <Input
              className="min-w-0 flex-1"
              disabled={disabled || !spec?.repeatable}
              value={line.name}
              placeholder="Name on the payslip"
              onChange={(e) => set(index, { name: e.target.value })}
            />
            <Input
              className="w-36 shrink-0 text-right tnum"
              disabled={disabled}
              inputMode="decimal"
              placeholder="0.00"
              value={line.amount}
              onChange={(e) => set(index, { amount: e.target.value })}
            />
            {!disabled && (
              <IconButton
                icon={X}
                label="Remove"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              />
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        {!disabled ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            onClick={() => onChange([...lines, { code: "OTHER", name: "", amount: "" }])}
          >
            Add a component
          </Button>
        ) : (
          <span />
        )}
        <span className="tnum text-[12.5px] text-ink-2">
          Monthly total <b>{amount(total ?? "0", CURRENCY[country])}</b>
        </span>
      </div>
    </div>
  );
}
