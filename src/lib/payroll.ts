/**
 * Payroll on this side of the wire: the shapes the API returns, and who may do what.
 *
 * Who may see payroll is not a module grant, so `session.can("payroll")` would
 * be the wrong question. The backend answers it itself at `/payroll/me` — the
 * Accounts team, super admins, the CEO and the payroll access list may read;
 * only processors on that list may change anything; super admins and the CEO
 * approve. The session loads that answer once, and the screens read it here.
 *
 * Money arrives as decimal strings and stays that way: format it with
 * `amount()` from lib/format, never with Number arithmetic.
 */

import type { Tone } from "@/components/ui/primitives";

export type Country = "AE" | "IN";
export type RunStatus = "draft" | "submitted" | "approved" | "paid";

export interface PayrollMe {
  can_view: boolean;
  can_process: boolean;
  can_approve: boolean;
  can_admin: boolean;
  via: string[];
}

export const NO_PAYROLL: PayrollMe = {
  can_view: false,
  can_process: false,
  can_approve: false,
  can_admin: false,
  via: [],
};

export interface PayrollPerson {
  id: string;
  display_name: string;
  email: string;
}

export interface PayrollMember {
  user_id: string;
  display_name: string;
  email: string;
  level: "viewer" | "processor";
  note: string | null;
  added_by_name: string | null;
  created_at: string;
}

export interface PayrollAccessOverview {
  accounts_team_slug: string;
  accounts_team_found: boolean;
  accounts_members: PayrollPerson[];
  role_holders: { person: PayrollPerson; roles: string[] }[];
  members: PayrollMember[];
}

export interface PtSlab {
  min_gross: string;
  amount: string;
  feb_amount: string | null;
}

export interface TaxTable {
  slabs: { upto: string | null; rate: string }[];
  standard_deduction: string;
  rebate_limit: string;
  rebate_max: string;
  cess_rate: string;
  surcharge: { above: string; rate: string }[];
  confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  source: string | null;
}

export interface PayrollSettings {
  accounts_team_slug: string;
  notify_in_app: boolean;
  ae_company_name: string;
  ae_company_address: string | null;
  ae_day_basis: "fixed_30" | "calendar";
  ae_hours_per_day: string;
  ae_ot_normal_rate: string;
  ae_ot_premium_rate: string;
  ae_employer_mol_id: string | null;
  ae_employer_bank_routing: string | null;
  ae_employer_reference: string | null;
  in_company_name: string;
  in_company_address: string | null;
  in_day_basis: "fixed_30" | "calendar";
  in_pf_establishment: string | null;
  in_pf_ee_rate: string;
  in_pf_er_rate: string;
  in_eps_rate: string;
  in_pf_ceiling: string;
  in_edli_rate: string;
  in_pf_admin_rate: string;
  in_wage_code_rule: boolean;
  in_esi_threshold: string;
  in_esi_ee_rate: string;
  in_esi_er_rate: string;
  in_pt_slabs: Record<string, PtSlab[]>;
  in_tax_tables: Record<string, TaxTable>;
  invoice_prefix: string;
  invoice_payment_terms: number;
  invoice_currency: string | null;
  invoice_notes: string | null;
  invoice_terms: string | null;
  invoice_customer_zoho_id: string | null;
  mail_enabled: boolean;
  updated_at: string;
}

export interface ComponentSpec {
  code: string;
  name: string;
  countries: Country[];
  repeatable: boolean;
  basic: boolean;
  pf_wage: boolean;
}

export interface SalaryLine {
  code: string;
  name: string;
  amount: string;
}

export interface PayrollSalary {
  id: string;
  effective_from: string;
  components: SalaryLine[];
  monthly_total: string;
  note: string | null;
  created_at: string;
}

export interface EmployeeFields {
  user_id: string | null;
  code: string;
  full_name: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  joined_on: string;
  left_on: string | null;
  bank_name: string | null;
  bank_account: string | null;
  iban: string | null;
  bank_routing: string | null;
  mol_person_id: string | null;
  ifsc: string | null;
  pan: string | null;
  uan: string | null;
  esi_number: string | null;
  pt_state: string | null;
  pf_enabled: boolean;
  pf_on_actual: boolean;
  eps_member: boolean;
  esi_mode: "auto" | "yes" | "no";
  pt_override: string | null;
  tds_monthly_override: string | null;
  opening_fy: number | null;
  opening_taxable: string;
  opening_tds: string;
  notes: string | null;
}

export interface PayrollEmployee extends EmployeeFields {
  id: string;
  country: Country;
  currency: string;
  active: boolean;
  user_name: string | null;
  current_salary: PayrollSalary | null;
  salaries: PayrollSalary[];
  created_at: string;
  updated_at: string;
}

export interface PayItem {
  code: string;
  name: string;
  amount: string;
  full?: string;
  variable?: boolean;
  taxable?: boolean;
}

export interface PayrollExtra {
  name: string;
  amount: string;
  kind: "earning" | "deduction";
  variable: boolean;
  taxable: boolean;
}

export interface PayrollLine {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  designation: string | null;
  identifiers: Record<string, string | boolean | null>;
  lop_adjust: string;
  ot_normal_hours: string;
  ot_premium_hours: string;
  extras: PayrollExtra[];
  tds_override: string | null;
  on_hold: boolean;
  note: string | null;
  leave_lop_days: string;
  basis_days: string;
  paid_days: string;
  unpaid_days: string;
  earnings: PayItem[];
  deductions: PayItem[];
  employer: PayItem[];
  gross: string;
  total_deductions: string;
  net: string;
  employer_cost: string;
  taxable: string;
  tds: string;
  workings: Record<string, Record<string, unknown>>;
  warnings: string[];
}

export interface PayrollRun {
  id: string;
  country: Country;
  year: number;
  month: number;
  label: string;
  currency: string;
  status: RunStatus;
  headcount: number;
  gross: string;
  deductions: string;
  net: string;
  employer_cost: string;
  warnings: string[];
  warning_count: number;
  note: string | null;
  calculated_at: string | null;
  created_by_name: string | null;
  submitted_by_id: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  returned_note: string | null;
  paid_by_name: string | null;
  paid_on: string | null;
  created_at: string;
}

export interface PayrollEvent {
  id: string;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
  actor_name: string | null;
  run_id: string | null;
  employee_id: string | null;
  created_at: string;
}

export interface PayrollRunDetail extends PayrollRun {
  lines: PayrollLine[];
  events: PayrollEvent[];
}

export interface GratuityRow {
  employee_id: string;
  code: string;
  full_name: string;
  joined_on: string;
  left_on: string | null;
  basic: string;
  service_years: string;
  gratuity: string;
}

export const COUNTRY_NAME: Record<Country, string> = { AE: "UAE", IN: "India" };
export const CURRENCY: Record<Country, string> = { AE: "AED", IN: "INR" };

export const STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Waiting for approval", tone: "warn" },
  approved: { label: "Approved", tone: "positive" },
  paid: { label: "Paid", tone: "info" },
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026" → "2026-27", India's financial year label. */
export function fyLabel(fy: number | string): string {
  const n = Number(fy);
  return `${n}-${String(n + 1).slice(-2)}`;
}

/** The financial year a month falls in: November 2026 is FY 2026. */
export function fyOf(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

/** Empty string → null, for optional text fields sent to the API. */
export function blank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * The employee list's cache key. One spelling everywhere, so the tabs and the
 * pay run share a single request instead of several that differ by a query.
 */
export function employeesKey(includeLeft = false): string {
  return `/payroll/employees?include_left=${includeLeft}`;
}

/** "2026-11" for a year and month — the pay run's place in the URL. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonth(key: string | null): { year: number; month: number } | null {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

export function shiftMonth(at: { year: number; month: number }, by: number) {
  const index = at.year * 12 + (at.month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * India's statutory deductions — PF, pension, ESI, professional tax, TDS —
 * switched off: what most of this payroll uses, so it is what a new Indian
 * employee starts with. One switch on the employee turns them all back on.
 */
export const NO_STATUTORY = {
  pf_enabled: false,
  pf_on_actual: false,
  eps_member: false,
  esi_mode: "no",
  pt_override: "0",
  tds_monthly_override: "0",
} as const satisfies Partial<EmployeeFields>;

/** The rules the law sets, for an employee whose deductions are switched on. */
export const WITH_STATUTORY = {
  pf_enabled: true,
  pf_on_actual: false,
  eps_member: true,
  esi_mode: "auto",
  pt_override: null,
  tds_monthly_override: null,
} as const satisfies Partial<EmployeeFields>;

function isZero(value: string | null): boolean {
  return value !== null && value.trim() !== "" && Number(value) === 0;
}

/** Whether any of PF, ESI, professional tax or TDS can be deducted from this person. */
export function hasStatutory(f: EmployeeFields): boolean {
  return (
    f.pf_enabled ||
    f.esi_mode !== "no" ||
    !isZero(f.pt_override) ||
    !isZero(f.tds_monthly_override)
  );
}

/**
 * What an employee's record is missing before they can be paid by bank.
 *
 * Nothing here stops a payslip being calculated; each one makes the bank file
 * (or, with deductions on, a tax figure) wrong. Statutory ids are only asked
 * for when that person's deductions are switched on.
 */
export function employeeGaps(e: PayrollEmployee): string[] {
  if (!e.active) return [];
  const out: string[] = [];
  if (!e.current_salary) out.push("salary");
  if (e.country === "AE") {
    if (!e.iban) out.push("IBAN");
    if (!e.bank_routing) out.push("bank routing code");
    if (!e.mol_person_id) out.push("MOHRE person id");
  } else {
    if (!e.bank_account) out.push("account number");
    if (!e.ifsc) out.push("IFSC");
    if (hasStatutory(e)) {
      if (!e.pan) out.push("PAN");
      if (e.pf_enabled && !e.uan) out.push("UAN");
    }
  }
  return out;
}

/**
 * The next employee code after the highest one in use for that country —
 * HZ-IN-005 is followed by HZ-IN-006. Only a suggestion; the field stays
 * editable.
 */
export function suggestCode(employees: PayrollEmployee[], country: Country): string {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const e of employees) {
    if (e.country !== country) continue;
    const m = e.code.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  if (!best) return `HZ-${country}-001`;
  return `${best.prefix}${String(best.n + 1).padStart(best.width, "0")}`;
}

/* ── the month's invoice ──────────────────────────────────────────── */

/** A charge that is not salary — rent, internet — as Zoho takes it. */
export interface InvoiceCharge {
  item_id: string | null;
  name: string;
  description: string | null;
  quantity: string;
  rate: string;
  tax_id: string | null;
  tax_name: string | null;
  tax_percentage: string;
}

export interface InvoiceLine extends InvoiceCharge {
  /** `salary` lines are read off the payslips; `charge` lines are typed in. */
  source: "salary" | "charge";
  amount: string;
  tax_amount: string;
}

export interface RunInvoice {
  /** Empty until first saved: the fields are the defaults from settings. */
  id: string | null;
  run_id: string;
  number: string | null;
  issuer_name: string;
  issuer_address: string | null;
  customer_zoho_id: string | null;
  customer_name: string;
  customer_address: string | null;
  currency: string;
  run_currency: string;
  exchange_rate: string | null;
  needs_rate: boolean;
  invoice_date: string;
  due_date: string | null;
  payment_terms: number | null;
  reference_number: string | null;
  salary_lines: "single" | "per_employee";
  charges: InvoiceCharge[];
  lines: InvoiceLine[];
  adjustment: string;
  adjustment_description: string | null;
  notes: string | null;
  terms: string | null;
  salaries: string;
  sub_total: string;
  tax_total: string;
  total: string;
  zoho_mode: "test" | "live" | null;
  zoho_payload: Record<string, unknown> | null;
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
  zoho_at: string | null;
  zoho_by_name: string | null;
  zoho_error: string | null;
  report_sent_at: string | null;
  report_to: string[];
  report_error: string | null;
}

export interface ZohoTax {
  tax_id: string;
  tax_name: string;
  tax_percentage: string;
}

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  company_name: string | null;
  currency_code: string | null;
  email: string | null;
  tax_treatment: string | null;
}

export interface ZohoItem {
  item_id: string;
  name: string;
  description: string | null;
  rate: string | null;
  tax_id: string | null;
}

export interface InvoiceSetup {
  zoho_live: boolean;
  zoho_organization: string | null;
  mail: boolean;
  zoho_error: string | null;
  taxes: ZohoTax[];
  currencies: string[];
  approvers: string[];
  report_to: string[];
}
