/* HR's staff list. Transcribed from app/hr/staff_router.py. */

export type StaffStatus = "active" | "notice" | "left" | "inactive";
export type ExitKind = "resigned" | "terminated" | "contract_ended" | "other";

export interface StaffExit {
  kind: ExitKind;
  kind_label: string;
  resigned_on: string | null;
  last_working_day: string;
  note: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
  access_ended_at: string | null;
}

export interface StaffRow {
  user_id: string;
  name: string;
  email: string;
  status: StaffStatus;
  is_active: boolean;
  joined_on: string | null;
  last_login_at: string | null;
  teams: string[];
  payroll_code: string | null;
  payroll_left_on: string | null;
  exit: StaffExit | null;
}

export interface StaffEvent {
  action: string;
  summary: string;
  actor_name: string | null;
  at: string;
}

export interface StaffDetail extends StaffRow {
  events: StaffEvent[];
}

export interface ExitResult {
  person: StaffDetail;
  /** False when the rankings could not be rebuilt just now; the next sync does it. */
  ranking_refreshed: boolean;
}

export const EXIT_KINDS: { value: ExitKind; label: string }[] = [
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
  { value: "contract_ended", label: "Contract ended" },
  { value: "other", label: "Other" },
];

export const STATUS_LABEL: Record<StaffStatus, string> = {
  active: "Active",
  notice: "Serving notice",
  left: "Left",
  inactive: "Account off",
};
