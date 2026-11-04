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
