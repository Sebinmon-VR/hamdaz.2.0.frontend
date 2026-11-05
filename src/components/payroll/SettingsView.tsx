"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { Check, Copy, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TeamOut } from "@/lib/types";
import {
  fyLabel,
  fyOf,
  type Country,
  type InvoiceSetup,
  type PayrollSettings,
  type PtSlab,
  type TaxTable,
} from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { Toggle } from "@/components/ui/controls";
import { PanelSkeleton } from "@/components/ui/feedback";
import { AccessView } from "@/components/payroll/AccessView";
import { CustomerSearch } from "@/components/payroll/ZohoPicker";
import { AreaBox, Btn, FormRow, IconBtn, Labeled, Note, SelectBox, TextBox } from "@/components/payroll/ui";

type Editable = Omit<PayrollSettings, "in_tax_tables" | "updated_at">;

type Section = "company" | "approvals" | "invoicing" | "access" | "rules" | "pt" | "tax";

/**
 * Payroll settings, laid out like any business application's: a list of
 * sections on the left, label-and-field rows on the right.
 *
 * Everyday settings come first; the statutory ones (rates, professional tax,
 * income tax) are grouped below and only matter once somebody's deductions
 * are switched on. Changing anything recalculates nothing by itself — a draft
 * picks it up on Refresh, and approved months keep what they were approved with.
 */
export function SettingsView({ countries }: { countries: Country[] }) {
  const { payroll } = useSession();
  const settings = useSWR<PayrollSettings>("/payroll/settings");
  const teams = useSWR<TeamOut[]>("/teams");
  const setup = useSWR<InvoiceSetup>("/payroll/invoice-setup");
  // The Zoho contact's name, for the picker only — settings keep its id.
  const [zohoName, setZohoName] = useState("");
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<Section>("company");

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

  if (settings.error) return <Note tone="danger">{settings.error.message}</Note>;
  if (!draft || !settings.data) return <PanelSkeleton lines={8} className="p-4" />;

  const editable = payroll.can_process;
  const { in_tax_tables: _t, updated_at: _u, ...original } = settings.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  // Only the countries somebody is paid in; both while nobody is.
  const shows = (c: Country) => countries.length === 0 || countries.includes(c);
  const both = shows("IN") && shows("AE");

  function set<K extends keyof Editable>(key: K, value: Editable[K]) {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  const text = (key: keyof Editable) => ({
    disabled: !editable,
    value: (draft[key] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const nav: { group: string; items: { key: Section; label: string }[] }[] = [
    {
      group: "General",
      items: [
        { key: "company", label: "Company" },
        { key: "approvals", label: "Approvals" },
        { key: "invoicing", label: "Invoicing" },
        { key: "access", label: "Who can use payroll" },
      ],
    },
    {
      group: "Statutory",
      items: [
        { key: "rules", label: "Pay rules" },
        ...(shows("IN")
          ? ([
              { key: "pt", label: "Professional tax" },
              { key: "tax", label: "Income tax" },
            ] as const)
          : []),
      ],
    },
  ];
  const heads: Record<Section, { title: string; text: string }> = {
    company: { title: "Company", text: "Printed on every payslip and used on the bank file." },
    approvals: { title: "Approvals", text: "Who is told when a month needs them." },
    invoicing: {
      title: "Invoicing",
      text: "Defaults for new invoices, the emails, and whether Zoho is written to.",
    },
    access: { title: "Who can use payroll", text: "Everyone listed here can see every salary." },
    rules: {
      title: "Pay rules",
      text: "How a day's pay, overtime, PF and ESI are worked out. Only used where deductions are switched on.",
    },
    pt: { title: "Professional tax", text: "Monthly slabs by state, for Indian employees with deductions on." },
    tax: { title: "Income tax", text: "New-regime slabs used to work out TDS, by financial year." },
  };
  // The sections the settings form saves; tax tables and the access list save themselves.
  const formSection = section !== "tax";

  return (
    <div className="grid md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav className="no-bar flex gap-1 overflow-x-auto border-b border-line p-2 md:flex-col md:gap-0 md:overflow-visible md:border-b-0 md:border-r md:p-3">
        {nav.map((g) => (
          <div key={g.group} className="flex gap-1 md:mb-3 md:block">
            <p className="hidden px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-4 md:block">
              {g.group}
            </p>
            {g.items.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={clsx(
                  "block shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] transition md:w-full",
                  section === item.key ? "bg-panel-2 font-semibold text-ink" : "text-ink-3 hover:bg-panel-2 hover:text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{heads[section].title}</h2>
            <p className="text-[12px] text-ink-4">{heads[section].text}</p>
          </div>
          {editable && formSection && (
            <>
              {save.error && <span className="text-[12px] text-danger">{save.error}</span>}
              {saved && !dirty && <span className="text-[12px] text-positive">Saved</span>}
              {dirty && (
                <Btn
                  variant="ghost"
                  onClick={() => {
                    setDraft(original);
                    save.clearError();
                  }}
                >
                  Discard
                </Btn>
              )}
              <Btn variant="accent" disabled={!dirty} loading={save.pending} onClick={() => save.run()}>
                Save changes
              </Btn>
            </>
          )}
        </div>
        {!editable && <Note>Read only. Payroll processors change these.</Note>}

        <div className="px-5 pb-4">
          {section === "company" && (
            <>
              {shows("IN") && (
                <>
                  {both && <Group>India</Group>}
                  <FormRow label="Company name">
                    <TextBox {...text("in_company_name")} />
                  </FormRow>
                  <FormRow label="Address">
                    <AreaBox {...text("in_company_address")} />
                  </FormRow>
                </>
              )}
              {shows("AE") && (
                <>
                  {both && <Group>UAE</Group>}
                  <FormRow label="Company name">
                    <TextBox {...text("ae_company_name")} />
                  </FormRow>
                  <FormRow label="Address">
                    <AreaBox {...text("ae_company_address")} />
                  </FormRow>
                  <FormRow label="Employer MOHRE id" hint="13 digits, on the WPS file.">
                    <Narrow>
                      <TextBox inputMode="numeric" {...text("ae_employer_mol_id")} />
                    </Narrow>
                  </FormRow>
                  <FormRow label="Paying bank routing code" hint="9 digits, on the WPS file.">
                    <Narrow>
                      <TextBox inputMode="numeric" {...text("ae_employer_bank_routing")} />
                    </Narrow>
                  </FormRow>
                  <FormRow label="WPS reference" hint="Only if your bank asks for one.">
                    <Narrow>
                      <TextBox {...text("ae_employer_reference")} />
                    </Narrow>
                  </FormRow>
                </>
              )}
            </>
          )}

          {section === "approvals" && (
            <FormRow
              label="Notifications"
              hint="Off while payroll is being tried out, so a test month reaches nobody."
            >
              <Toggle
                disabled={!editable}
                checked={draft.notify_in_app}
                onChange={(v) => set("notify_in_app", v)}
                label="Tell people in the app"
                hint="The approvers when a month is sent for approval; the sender when it is approved or sent back."
              />
            </FormRow>
          )}

          {section === "invoicing" && (
            <>
              <FormRow label="From" hint="The India company — set under Company.">
                <p className="pt-1.5 text-[13px] text-ink">{draft.in_company_name}</p>
              </FormRow>
              <FormRow label="Bill to" hint="Every month's invoice goes to the UAE company.">
                <TextBox {...text("ae_company_name")} />
              </FormRow>
              <FormRow label="Bill-to address">
                <AreaBox {...text("ae_company_address")} />
              </FormRow>
              <FormRow label="Zoho contact" hint="The customer in Zoho Books the invoice is raised to.">
                <Narrow>
                  <CustomerSearch
                    disabled={!editable}
                    value={zohoName}
                    onText={(t) => {
                      setZohoName(t);
                      set("invoice_customer_zoho_id", null);
                    }}
                    onPick={(c) => {
                      setZohoName(c.contact_name);
                      set("invoice_customer_zoho_id", c.contact_id);
                    }}
                  />
                </Narrow>
                <p className="mt-1 text-[12px] text-ink-4">
                  {draft.invoice_customer_zoho_id
                    ? `Linked (${draft.invoice_customer_zoho_id}).`
                    : "Not linked yet — search Zoho and pick the contact."}
                </p>
              </FormRow>
              <FormRow label="Currency" hint="Empty: the payroll's own currency.">
                <div className="w-40">
                  <SelectBox
                    disabled={!editable}
                    value={draft.invoice_currency ?? ""}
                    onChange={(e) => set("invoice_currency", e.target.value || null)}
                  >
                    <option value="">Payroll currency</option>
                    {(setup.data?.currencies ?? ["INR", "AED", "USD"]).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectBox>
                </div>
              </FormRow>
              <FormRow label="Invoice numbers" hint="Our own number; Zoho gives its own as well.">
                <Narrow>
                  <TextBox {...text("invoice_prefix")} />
                </Narrow>
                <p className="mt-1 text-[12px] text-ink-4">
                  This year: {draft.invoice_prefix}
                  {new Date().getFullYear()}-001 onwards.
                </p>
              </FormRow>
              <FormRow label="Payment terms" hint="Days to pay.">
                <div className="w-28">
                  <TextBox
                    disabled={!editable}
                    inputMode="numeric"
                    value={String(draft.invoice_payment_terms ?? "")}
                    onChange={(e) => set("invoice_payment_terms", Number(e.target.value.replace(/\D/g, "") || 0))}
                  />
                </div>
              </FormRow>
              <FormRow label="Customer notes" hint="Printed on every new invoice.">
                <AreaBox {...text("invoice_notes")} />
              </FormRow>
              <FormRow label="Terms and conditions" hint="Printed on every new invoice.">
                <AreaBox {...text("invoice_terms")} />
              </FormRow>
              <FormRow
                label="Emails"
                hint="The approval request to the super admins when a month is sent; the report (invoice and register) once it has been through Zoho."
              >
                <Toggle
                  disabled={!editable}
                  checked={draft.mail_enabled}
                  onChange={(v) => set("mail_enabled", v)}
                  label="Send payroll emails"
                  hint={
                    setup.data
                      ? `Approval: ${setup.data.approvers.join(", ") || "no super admin"}. Report: ${setup.data.report_to.join(", ") || "nobody"}.`
                      : undefined
                  }
                />
              </FormRow>
              <FormRow label="Zoho Books" hint={setup.data?.zoho_organization ?? undefined}>
                {setup.data?.zoho_live ? (
                  <p className="text-[13px] text-ink">
                    <b>Live.</b> &ldquo;Create in Zoho&rdquo; creates the invoice in Zoho Books.
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-2">
                    <b>Test mode.</b> &ldquo;Create in Zoho&rdquo; checks the invoice against Zoho and writes
                    nothing. It goes live only when PAYROLL_ZOHO_INVOICE_WRITE is switched on on the server.
                  </p>
                )}
              </FormRow>
            </>
          )}

          {section === "access" && (
            <>
              <FormRow label="Accounts team" hint="Everybody in this team can see payroll.">
                <Narrow>
                  <SelectBox
                    disabled={!editable}
                    value={draft.accounts_team_slug}
                    onChange={(e) => set("accounts_team_slug", e.target.value)}
                  >
                    {(teams.data ?? []).map((t) => (
                      <option key={t.id} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                    {!teams.data?.some((t) => t.slug === draft.accounts_team_slug) && (
                      <option value={draft.accounts_team_slug}>{draft.accounts_team_slug}</option>
                    )}
                  </SelectBox>
                </Narrow>
              </FormRow>
              <div className="pt-4">
                <AccessView />
              </div>
            </>
          )}

          {section === "rules" && (
            <>
              {shows("IN") && (
                <>
                  {both && <Group>India</Group>}
                  <FormRow label="A day's pay" hint="For unpaid days, joiners and leavers.">
                    <Narrow>
                      <SelectBox
                        disabled={!editable}
                        value={draft.in_day_basis}
                        onChange={(e) => set("in_day_basis", e.target.value as Editable["in_day_basis"])}
                      >
                        <option value="calendar">Monthly ÷ days in the month</option>
                        <option value="fixed_30">Monthly ÷ 30</option>
                      </SelectBox>
                    </Narrow>
                  </FormRow>
                  <FormRow label="Provident fund" hint="Percent of PF wages, up to the ceiling.">
                    <Inline>
                      <Small label="Employee %"><TextBox inputMode="decimal" {...text("in_pf_ee_rate")} /></Small>
                      <Small label="Employer %"><TextBox inputMode="decimal" {...text("in_pf_er_rate")} /></Small>
                      <Small label="Pension (EPS) %"><TextBox inputMode="decimal" {...text("in_eps_rate")} /></Small>
                      <Small label="Wage ceiling"><TextBox inputMode="decimal" {...text("in_pf_ceiling")} /></Small>
                    </Inline>
                  </FormRow>
                  <FormRow label="PF charges">
                    <Inline>
                      <Small label="EDLI %"><TextBox inputMode="decimal" {...text("in_edli_rate")} /></Small>
                      <Small label="Admin %"><TextBox inputMode="decimal" {...text("in_pf_admin_rate")} /></Small>
                      <Small label="Establishment code" wide><TextBox {...text("in_pf_establishment")} /></Small>
                    </Inline>
                  </FormRow>
                  <FormRow label="ESI" hint="Monthly gross at or under the limit is covered.">
                    <Inline>
                      <Small label="Wage limit"><TextBox inputMode="decimal" {...text("in_esi_threshold")} /></Small>
                      <Small label="Employee %"><TextBox inputMode="decimal" {...text("in_esi_ee_rate")} /></Small>
                      <Small label="Employer %"><TextBox inputMode="decimal" {...text("in_esi_er_rate")} /></Small>
                    </Inline>
                  </FormRow>
                  <FormRow label="Labour codes' 50 % rule" hint="When allowances are over half of pay, the excess counts as PF wages.">
                    <Toggle
                      disabled={!editable}
                      checked={draft.in_wage_code_rule}
                      onChange={(v) => set("in_wage_code_rule", v)}
                      label="Apply it"
                    />
                  </FormRow>
                </>
              )}
              {shows("AE") && (
                <>
                  {both && <Group>UAE</Group>}
                  <FormRow label="A day's pay" hint="For unpaid days, joiners and leavers.">
                    <Narrow>
                      <SelectBox
                        disabled={!editable}
                        value={draft.ae_day_basis}
                        onChange={(e) => set("ae_day_basis", e.target.value as Editable["ae_day_basis"])}
                      >
                        <option value="fixed_30">Monthly ÷ 30</option>
                        <option value="calendar">Monthly ÷ days in the month</option>
                      </SelectBox>
                    </Narrow>
                  </FormRow>
                  <FormRow label="Overtime" hint="× the basic hourly rate. Law minimums 1.25 and 1.5.">
                    <Inline>
                      <Small label="Hours a day"><TextBox inputMode="decimal" {...text("ae_hours_per_day")} /></Small>
                      <Small label="Ordinary rate"><TextBox inputMode="decimal" {...text("ae_ot_normal_rate")} /></Small>
                      <Small label="Night / holiday rate"><TextBox inputMode="decimal" {...text("ae_ot_premium_rate")} /></Small>
                    </Inline>
                  </FormRow>
                </>
              )}
            </>
          )}

          {section === "pt" && (
            <PtSlabs slabs={draft.in_pt_slabs} editable={editable} onChange={(next) => set("in_pt_slabs", next)} />
          )}

          {section === "tax" && (
            <TaxTables settings={settings.data} editable={editable} onSaved={(next) => settings.mutate(next, { revalidate: false })} />
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-line pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
      {children}
    </p>
  );
}

function Narrow({ children }: { children: ReactNode }) {
  return <div className="max-w-xs">{children}</div>;
}

function Inline({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function Small({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "w-44" : "w-28"}>
      <Labeled label={label}>{children}</Labeled>
    </div>
  );
}

/** Professional tax: a small table of slabs for each state. Saved with the settings. */
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
  function setCell(code: string, i: number, patch: Partial<PtSlab>) {
    setRows(code, slabs[code].map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4 pt-4">
      {states.length === 0 && (
        <p className="text-[13px] text-ink-3">
          No states yet. Until a state has slabs, professional tax there is 0.
        </p>
      )}
      {states.map((code) => (
        <div key={code} className="overflow-hidden rounded-md border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5">
            <span className="text-[13px] font-semibold text-ink">{code}</span>
            {editable && (
              <button
                className="ml-auto text-[12px] text-ink-3 hover:text-danger"
                onClick={() => {
                  const next = { ...slabs };
                  delete next[code];
                  onChange(next);
                }}
              >
                Remove state
              </button>
            )}
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-4">
                <th className="px-3 py-1.5 font-semibold">Monthly gross from</th>
                <th className="px-3 py-1.5 font-semibold">Tax a month</th>
                <th className="px-3 py-1.5 font-semibold">February</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {slabs[code].map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-1.5">
                    <TextBox className="tnum" disabled={!editable} value={row.min_gross} aria-label="Monthly gross from"
                      onChange={(e) => setCell(code, i, { min_gross: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <TextBox className="tnum" disabled={!editable} value={row.amount} aria-label="Tax a month"
                      onChange={(e) => setCell(code, i, { amount: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <TextBox className="tnum" disabled={!editable} placeholder="Same" value={row.feb_amount ?? ""} aria-label="February amount"
                      onChange={(e) => setCell(code, i, { feb_amount: e.target.value || null })} />
                  </td>
                  <td className="px-1 py-1.5">
                    {editable && (
                      <IconBtn icon={X} label="Remove slab" bare className="size-7"
                        onClick={() => setRows(code, slabs[code].filter((_, j) => j !== i))} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <div className="border-t border-line px-3 py-1.5">
              <Btn variant="ghost" icon={Plus} onClick={() => setRows(code, [...slabs[code], { min_gross: "", amount: "", feb_amount: null }])}>
                Add a slab
              </Btn>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <div className="flex items-center gap-2">
          <div className="w-24">
            <TextBox placeholder="KL" aria-label="State code" value={state} maxLength={4} onChange={(e) => setState(e.target.value.toUpperCase())} />
          </div>
          <Btn
            icon={Plus}
            disabled={!state.trim() || states.includes(state.trim())}
            onClick={() => {
              setRows(state.trim(), [{ min_gross: "", amount: "", feb_amount: null }]);
              setState("");
            }}
          >
            Add state
          </Btn>
          <span className="text-[12px] text-ink-4">Then Save changes.</span>
        </div>
      )}
    </div>
  );
}

/** Income tax slabs for one financial year, saved (and confirmed) on their own. */
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
  const [fy, setFy] = useState<string>(
    years.includes(String(currentFy)) ? String(currentFy) : years[0] ?? String(currentFy),
  );
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
    <div className="pt-1">
      <FormRow label="Financial year">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-40">
            <SelectBox value={fy} onChange={(e) => choose(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  FY {fyLabel(y)}
                </option>
              ))}
            </SelectBox>
          </div>
          {table &&
            (table.confirmed ? (
              <Badge tone="positive" icon={Check}>
                Confirmed by {table.confirmed_by} {dateTime(table.confirmed_at)}
              </Badge>
            ) : (
              <Badge tone="warn">Not confirmed</Badge>
            ))}
        </div>
        {missingCurrent && (
          <p className="mt-1.5 text-[12px] text-warn">
            No table for FY {fyLabel(currentFy)} yet, so this year uses the latest earlier one. Check the
            figures, then save them as FY {fyLabel(currentFy)}.
          </p>
        )}
      </FormRow>
      {save.error && <p className="py-2 text-[12.5px] text-danger">{save.error}</p>}
      {!table ? (
        <p className="py-4 text-[13px] text-ink-3">No table saved.</p>
      ) : (
        <>
          <FormRow label="Slabs" hint="On taxable income, in order. Leave the last one without a limit.">
            <div className="overflow-hidden rounded-md border border-line">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-panel-2 text-left text-[11px] uppercase tracking-wide text-ink-4">
                    <th className="px-3 py-1.5 font-semibold">Up to</th>
                    <th className="px-3 py-1.5 font-semibold">Rate %</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {table.slabs.map((slab, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-1.5">
                        <TextBox className="tnum" disabled={!editable} placeholder="No limit" value={slab.upto ?? ""} aria-label="Up to"
                          onChange={(e) => patch({ slabs: table.slabs.map((s, j) => (j === i ? { ...s, upto: e.target.value || null } : s)) })} />
                      </td>
                      <td className="w-28 px-3 py-1.5">
                        <TextBox className="tnum" disabled={!editable} value={slab.rate} aria-label="Rate %"
                          onChange={(e) => patch({ slabs: table.slabs.map((s, j) => (j === i ? { ...s, rate: e.target.value } : s)) })} />
                      </td>
                      <td className="px-1 py-1.5">
                        {editable && (
                          <IconBtn icon={X} label="Remove slab" bare className="size-7"
                            onClick={() => patch({ slabs: table.slabs.filter((_, j) => j !== i) })} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {editable && (
                <div className="border-t border-line px-3 py-1.5">
                  <Btn variant="ghost" icon={Plus}
                    onClick={() => patch({ slabs: [...table.slabs.slice(0, -1), { upto: "", rate: "" }, ...table.slabs.slice(-1)] })}>
                    Add a slab
                  </Btn>
                </div>
              )}
            </div>
          </FormRow>
          <FormRow label="Deductions and rebate">
            <Inline>
              <Small label="Standard deduction" wide>
                <TextBox className="tnum" disabled={!editable} value={table.standard_deduction} onChange={(e) => patch({ standard_deduction: e.target.value })} />
              </Small>
              <Small label="87A: income up to" wide>
                <TextBox className="tnum" disabled={!editable} value={table.rebate_limit} onChange={(e) => patch({ rebate_limit: e.target.value })} />
              </Small>
              <Small label="87A: at most">
                <TextBox className="tnum" disabled={!editable} value={table.rebate_max} onChange={(e) => patch({ rebate_max: e.target.value })} />
              </Small>
              <Small label="Cess %">
                <TextBox className="tnum" disabled={!editable} value={table.cess_rate} onChange={(e) => patch({ cess_rate: e.target.value })} />
              </Small>
            </Inline>
          </FormRow>
          <FormRow label="Surcharge" hint="Income above → rate %.">
            <div className="space-y-1.5">
              {table.surcharge.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-44">
                    <TextBox className="tnum" disabled={!editable} value={row.above} aria-label="Income above"
                      onChange={(e) => patch({ surcharge: table.surcharge.map((s, j) => (j === i ? { ...s, above: e.target.value } : s)) })} />
                  </div>
                  <span className="text-[12px] text-ink-4">→</span>
                  <div className="w-24">
                    <TextBox className="tnum" disabled={!editable} value={row.rate} aria-label="Surcharge %"
                      onChange={(e) => patch({ surcharge: table.surcharge.map((s, j) => (j === i ? { ...s, rate: e.target.value } : s)) })} />
                  </div>
                  <span className="text-[12px] text-ink-4">%</span>
                </div>
              ))}
            </div>
          </FormRow>
          <FormRow label="Source">
            <TextBox disabled={!editable} value={table.source ?? ""} onChange={(e) => patch({ source: e.target.value || null })} />
          </FormRow>
          {editable && (
            <div className="flex flex-wrap justify-end gap-2 pt-3">
              {fy !== String(currentFy) && (
                <Btn icon={Copy} loading={save.pending} onClick={() => save.run(String(currentFy), false)}>
                  Save as FY {fyLabel(currentFy)}
                </Btn>
              )}
              <Btn loading={save.pending} onClick={() => save.run(fy, false)}>
                Save FY {fyLabel(fy)}
              </Btn>
              <Btn variant="accent" icon={Check} loading={save.pending} onClick={() => save.run(fy, true)}>
                Checked — confirm
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
