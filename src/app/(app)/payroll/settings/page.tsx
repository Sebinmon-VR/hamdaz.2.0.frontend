"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Copy, Plus, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TeamOut } from "@/lib/types";
import { fyLabel, fyOf, type PayrollSettings, type PtSlab, type TaxTable } from "@/lib/payroll";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, IconButton, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";

export default function PayrollSettingsPage() {
  return (
    <PayrollOnly>
      <SettingsScreen />
    </PayrollOnly>
  );
}

type Editable = Omit<PayrollSettings, "in_tax_tables" | "updated_at">;

/**
 * The rules payroll is calculated with.
 *
 * Readable by every payroll reader — the rates explain every figure on a
 * payslip — and changed only by processors. Changing a rate recalculates
 * nothing on its own: draft months pick it up when recalculated, and approved
 * months keep what they were approved with.
 */
function SettingsScreen() {
  const { payroll } = useSession();
  const settings = useSWR<PayrollSettings>("/payroll/settings");
  const teams = useSWR<TeamOut[]>("/teams");
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saved, setSaved] = useState(false);

  if (settings.data && draft === null) {
    const { in_tax_tables: _t, updated_at: _u, ...rest } = settings.data;
    setDraft(rest);
  }

  const save = useAction(async () => {
    const next = await api.put<PayrollSettings>("/payroll/settings", {
      ...draft!,
      ae_company_address: draft!.ae_company_address?.trim() || null,
      in_company_address: draft!.in_company_address?.trim() || null,
      ae_employer_mol_id: draft!.ae_employer_mol_id?.trim() || null,
      ae_employer_bank_routing: draft!.ae_employer_bank_routing?.trim() || null,
      ae_employer_reference: draft!.ae_employer_reference?.trim() || null,
      in_pf_establishment: draft!.in_pf_establishment?.trim() || null,
    });
    settings.mutate(next, { revalidate: false });
    const { in_tax_tables: _t, updated_at: _u, ...rest } = next;
    setDraft(rest);
    setSaved(true);
    return next;
  });

  if (settings.error) return <ErrorState error={settings.error} onRetry={() => settings.mutate()} />;
  if (!draft || !settings.data) return <PanelSkeleton lines={8} />;

  const editable = payroll.can_process;
  const { in_tax_tables: _t, updated_at: _u, ...original } = settings.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  function set<K extends keyof Editable>(key: K, value: Editable[K]) {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  const text = (key: keyof Editable) => ({
    disabled: !editable,
    value: (draft[key] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Payroll"
        title="Payroll settings"
        lead="Draft months use these when recalculated; approved months keep what they were approved with."
        actions={
          editable && (
            <Button variant="accent" icon={Save} disabled={!dirty} loading={save.pending} onClick={() => save.run()}>
              Save settings
            </Button>
          )
        }
      />
      {!editable && <InlineNotice tone="info">Read only. Payroll processors change these.</InlineNotice>}
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {saved && !dirty && <InlineNotice tone="positive">Saved.</InlineNotice>}

      <Panel className="p-4">
        <PanelHead title="General" />
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Field label="Accounts team" hint="Everybody in this team can read payroll (not process it).">
            <Select disabled={!editable} value={draft.accounts_team_slug} onChange={(e) => set("accounts_team_slug", e.target.value)}>
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
              {!teams.data?.some((t) => t.slug === draft.accounts_team_slug) && (
                <option value={draft.accounts_team_slug}>{draft.accounts_team_slug}</option>
              )}
            </Select>
          </Field>
          <Toggle
            disabled={!editable}
            checked={draft.notify_in_app}
            onChange={(v) => set("notify_in_app", v)}
            label="Notify in the app"
            hint="Tell the approvers when a month is submitted, and the submitter when it is approved or returned. Off while you are trying it out, so a test month does not reach the CEO."
          />
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-4">
          <PanelHead title="UAE" hint="AED · WPS" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Company name on payslips" className="sm:col-span-2">
              <Input {...text("ae_company_name")} />
            </Field>
            <Field label="Address on payslips" className="sm:col-span-2">
              <Textarea {...text("ae_company_address")} />
            </Field>
            <Field label="A day's pay" hint="For unpaid days, joiners and leavers.">
              <Select disabled={!editable} value={draft.ae_day_basis} onChange={(e) => set("ae_day_basis", e.target.value as Editable["ae_day_basis"])}>
                <option value="fixed_30">Monthly ÷ 30</option>
                <option value="calendar">Monthly ÷ days in the month</option>
              </Select>
            </Field>
            <Field label="Working hours a day" hint="For the overtime hourly rate.">
              <Input inputMode="decimal" {...text("ae_hours_per_day")} />
            </Field>
            <Field label="Overtime rate" hint="× basic hourly. Law minimum 1.25.">
              <Input inputMode="decimal" {...text("ae_ot_normal_rate")} />
            </Field>
            <Field label="Night / rest-day / holiday rate" hint="Law minimum 1.5.">
              <Input inputMode="decimal" {...text("ae_ot_premium_rate")} />
            </Field>
            <Field label="Employer MOHRE id" hint="13 digits — the WPS file's employer id.">
              <Input {...text("ae_employer_mol_id")} />
            </Field>
            <Field label="Paying bank routing code" hint="9 digits.">
              <Input {...text("ae_employer_bank_routing")} />
            </Field>
            <Field label="Reference on the WPS file" className="sm:col-span-2" hint="Optional, if your bank asks for one.">
              <Input {...text("ae_employer_reference")} />
            </Field>
          </div>
        </Panel>

        <Panel className="p-4">
          <PanelHead title="India" hint="INR · PF, ESI, PT, TDS" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Company name on payslips" className="sm:col-span-2">
              <Input {...text("in_company_name")} />
            </Field>
            <Field label="Address on payslips" className="sm:col-span-2">
              <Textarea {...text("in_company_address")} />
            </Field>
            <Field label="A day's pay">
              <Select disabled={!editable} value={draft.in_day_basis} onChange={(e) => set("in_day_basis", e.target.value as Editable["in_day_basis"])}>
                <option value="calendar">Monthly ÷ days in the month</option>
                <option value="fixed_30">Monthly ÷ 30</option>
              </Select>
            </Field>
            <Field label="PF establishment code">
              <Input {...text("in_pf_establishment")} />
            </Field>
            <Field label="PF, employee %">
              <Input inputMode="decimal" {...text("in_pf_ee_rate")} />
            </Field>
            <Field label="PF, employer %">
              <Input inputMode="decimal" {...text("in_pf_er_rate")} />
            </Field>
            <Field label="Pension (EPS) % of employer share">
              <Input inputMode="decimal" {...text("in_eps_rate")} />
            </Field>
            <Field label="PF wage ceiling">
              <Input inputMode="decimal" {...text("in_pf_ceiling")} />
            </Field>
            <Field label="EDLI %">
              <Input inputMode="decimal" {...text("in_edli_rate")} />
            </Field>
            <Field label="PF admin charges %">
              <Input inputMode="decimal" {...text("in_pf_admin_rate")} />
            </Field>
            <Field label="ESI wage threshold" hint="Monthly gross at or under this is covered.">
              <Input inputMode="decimal" {...text("in_esi_threshold")} />
            </Field>
            <Field label="ESI, employee % / employer %">
              <div className="flex gap-2">
                <Input inputMode="decimal" {...text("in_esi_ee_rate")} />
                <Input inputMode="decimal" {...text("in_esi_er_rate")} />
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                disabled={!editable}
                checked={draft.in_wage_code_rule}
                onChange={(v) => set("in_wage_code_rule", v)}
                label="Labour codes' 50 % wage rule for PF"
                hint="When allowances are more than half of pay, the excess counts as wages for PF. Turn on once your PF consultant confirms how you apply it."
              />
            </div>
          </div>
        </Panel>
      </div>

      <PtSlabs
        slabs={draft.in_pt_slabs}
        editable={editable}
        onChange={(next) => set("in_pt_slabs", next)}
      />

      <TaxTables settings={settings.data} editable={editable} onSaved={(next) => settings.mutate(next, { revalidate: false })} />
    </div>
  );
}

function PtSlabs({
  slabs,
  editable,
  onChange,
}: {
  slabs: Record<string, PtSlab[]>;
  editable: boolean;
  onChange: (next: Record<string, PtSlab[]>) => void;
}) {
  const [state, setState] = useState("");
  const states = Object.keys(slabs).sort();

  function setRows(code: string, rows: PtSlab[]) {
    onChange({ ...slabs, [code]: rows });
  }

  return (
    <Panel className="p-4">
      <PanelHead
        title="Professional tax (India)"
        hint="By state. The highest slab whose monthly gross is reached applies. Save settings to keep changes."
      />
      {states.length === 0 && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          No states yet. Add the state each Indian employee works in, with its slabs — until then their
          professional tax is 0 and the month says so.
        </p>
      )}
      <div className="mt-3 space-y-4">
        {states.map((code) => (
          <div key={code} className="rounded-2xl bg-panel-2 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="second">{code}</Badge>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  onClick={() => {
                    const next = { ...slabs };
                    delete next[code];
                    onChange(next);
                  }}
                >
                  Remove state
                </Button>
              )}
            </div>
            {slabs[code].map((row, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                <span className="w-28 text-[12px] text-ink-3">Gross from</span>
                <Input className="w-32 tnum" disabled={!editable} value={row.min_gross}
                  onChange={(e) => setRows(code, slabs[code].map((r, j) => (j === i ? { ...r, min_gross: e.target.value } : r)))} />
                <span className="text-[12px] text-ink-3">pays</span>
                <Input className="w-28 tnum" disabled={!editable} value={row.amount}
                  onChange={(e) => setRows(code, slabs[code].map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} />
                <span className="text-[12px] text-ink-3">February</span>
                <Input className="w-28 tnum" disabled={!editable} placeholder="same" value={row.feb_amount ?? ""}
                  onChange={(e) => setRows(code, slabs[code].map((r, j) => (j === i ? { ...r, feb_amount: e.target.value || null } : r)))} />
                {editable && (
                  <IconButton size="sm" icon={X} label="Remove slab" onClick={() => setRows(code, slabs[code].filter((_, j) => j !== i))} />
                )}
              </div>
            ))}
            {editable && (
              <Button size="sm" variant="ghost" icon={Plus}
                onClick={() => setRows(code, [...slabs[code], { min_gross: "", amount: "", feb_amount: null }])}>
                Add a slab
              </Button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="mt-3 flex items-center gap-2">
          <Input className="w-28" placeholder="KA" value={state} maxLength={4} onChange={(e) => setState(e.target.value.toUpperCase())} />
          <Button
            size="sm"
            icon={Plus}
            disabled={!state.trim() || states.includes(state.trim())}
            onClick={() => {
              setRows(state.trim(), [{ min_gross: "", amount: "", feb_amount: null }]);
              setState("");
            }}
          >
            Add state
          </Button>
        </div>
      )}
    </Panel>
  );
}

function TaxTables({
  settings,
  editable,
  onSaved,
}: {
  settings: PayrollSettings;
  editable: boolean;
  onSaved: (next: PayrollSettings) => void;
}) {
  const now = new Date();
  const currentFy = fyOf(now.getFullYear(), now.getMonth() + 1);
  const years = Object.keys(settings.in_tax_tables).sort().reverse();
  const [fy, setFy] = useState<string>(years.includes(String(currentFy)) ? String(currentFy) : years[0] ?? String(currentFy));
  const [table, setTable] = useState<TaxTable | null>(settings.in_tax_tables[fy] ?? null);

  const save = useAction(async (target: string, confirm: boolean) => {
    const next = await api.put<PayrollSettings>(`/payroll/settings/tax-tables/${target}`, {
      slabs: table!.slabs.map((s) => ({ upto: s.upto?.toString().trim() ? s.upto : null, rate: s.rate })),
      standard_deduction: table!.standard_deduction,
      rebate_limit: table!.rebate_limit,
      rebate_max: table!.rebate_max,
      cess_rate: table!.cess_rate,
      surcharge: table!.surcharge,
      source: table!.source,
      confirm,
    });
    onSaved(next);
    setFy(target);
    setTable(next.in_tax_tables[target]);
    return next;
  });

  function choose(next: string) {
    setFy(next);
    setTable(settings.in_tax_tables[next] ?? null);
  }
  function patch(p: Partial<TaxTable>) {
    setTable((t) => (t ? { ...t, ...p } : t));
  }

  const missingCurrent = !settings.in_tax_tables[String(currentFy)];

  return (
    <Panel className="p-4">
      <PanelHead
        title="Income tax (India, new regime)"
        hint="TDS is projected over the financial year with these slabs, the 87A rebate, surcharge and cess."
        action={
          <div className="w-40">
            <Select value={fy} onChange={(e) => choose(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  FY {fyLabel(y)}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {missingCurrent && (
        <InlineNotice tone="warn" className="mt-3">
          There is no table for FY {fyLabel(currentFy)}, so this year&apos;s TDS uses the latest earlier one.
          Check the figures below against the current Finance Act, then save them as FY {fyLabel(currentFy)}.
        </InlineNotice>
      )}
      {save.error && <InlineNotice tone="danger" className="mt-3">{save.error}</InlineNotice>}
      {!table ? (
        <p className="mt-3 text-[12.5px] text-ink-3">No table saved.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {table.confirmed ? (
              <Badge tone="positive" icon={Check}>
                Confirmed by {table.confirmed_by} {dateTime(table.confirmed_at)}
              </Badge>
            ) : (
              <Badge tone="warn">Not confirmed by a processor</Badge>
            )}
            {table.source && <span className="text-ink-4">{table.source}</span>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="micro mb-2 text-ink-4">Slabs on taxable income</p>
              {table.slabs.map((slab, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <span className="w-16 text-[12px] text-ink-3">up to</span>
                  <Input className="w-36 tnum" disabled={!editable} placeholder="no limit" value={slab.upto ?? ""}
                    onChange={(e) => patch({ slabs: table.slabs.map((s, j) => (j === i ? { ...s, upto: e.target.value || null } : s)) })} />
                  <Input className="w-20 tnum" disabled={!editable} value={slab.rate}
                    onChange={(e) => patch({ slabs: table.slabs.map((s, j) => (j === i ? { ...s, rate: e.target.value } : s)) })} />
                  <span className="text-[12px] text-ink-3">%</span>
                  {editable && (
                    <IconButton size="sm" icon={X} label="Remove slab" onClick={() => patch({ slabs: table.slabs.filter((_, j) => j !== i) })} />
                  )}
                </div>
              ))}
              {editable && (
                <Button size="sm" variant="ghost" icon={Plus}
                  onClick={() => patch({ slabs: [...table.slabs.slice(0, -1), { upto: "", rate: "" }, ...table.slabs.slice(-1)] })}>
                  Add a slab
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Standard deduction">
                <Input disabled={!editable} value={table.standard_deduction} onChange={(e) => patch({ standard_deduction: e.target.value })} />
              </Field>
              <Field label="Cess %">
                <Input disabled={!editable} value={table.cess_rate} onChange={(e) => patch({ cess_rate: e.target.value })} />
              </Field>
              <Field label="87A rebate: income up to">
                <Input disabled={!editable} value={table.rebate_limit} onChange={(e) => patch({ rebate_limit: e.target.value })} />
              </Field>
              <Field label="87A rebate: at most">
                <Input disabled={!editable} value={table.rebate_max} onChange={(e) => patch({ rebate_max: e.target.value })} />
              </Field>
              <Field label="Surcharge" hint="Income above → rate %" className="sm:col-span-2">
                <div className="space-y-2">
                  {table.surcharge.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="tnum" disabled={!editable} value={row.above}
                        onChange={(e) => patch({ surcharge: table.surcharge.map((s, j) => (j === i ? { ...s, above: e.target.value } : s)) })} />
                      <Input className="w-24 tnum" disabled={!editable} value={row.rate}
                        onChange={(e) => patch({ surcharge: table.surcharge.map((s, j) => (j === i ? { ...s, rate: e.target.value } : s)) })} />
                    </div>
                  ))}
                </div>
              </Field>
              <Field label="Source" className="sm:col-span-2">
                <Input disabled={!editable} value={table.source ?? ""} onChange={(e) => patch({ source: e.target.value || null })} />
              </Field>
            </div>
          </div>
          {editable && (
            <div className="flex flex-wrap justify-end gap-2">
              {fy !== String(currentFy) && (
                <Button icon={Copy} loading={save.pending} onClick={() => save.run(String(currentFy), false)}>
                  Save these as FY {fyLabel(currentFy)}
                </Button>
              )}
              <Button loading={save.pending} onClick={() => save.run(fy, false)}>
                Save FY {fyLabel(fy)}
              </Button>
              <Button variant="accent" icon={Check} loading={save.pending} onClick={() => save.run(fy, true)}>
                I have checked these — confirm
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
