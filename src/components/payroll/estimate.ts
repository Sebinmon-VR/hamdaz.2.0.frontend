/**
 * The pay sheet's figures, worked out in the browser while somebody types.
 *
 * A change is saved to the backend, which recalculates against the database —
 * a round trip of a second or two on the remote database. Waiting for it
 * every time a digit is typed makes the sheet feel stuck, so the sheet works
 * out the answer itself and shows it at once; the backend's figure replaces
 * it when the save comes back.
 *
 * It is the backend's arithmetic, not an approximation of it, for everything
 * the sheet edits: the structure is prorated as round-half-up(full × paid ÷
 * basis), exactly as `rules._earned` does, in whole paise / fils so no float
 * rounding creeps in. Statutory deductions (PF, ESI, professional tax, TDS)
 * depend on the gross in ways only the backend knows, so a line that has any
 * is marked approximate until the save returns.
 */

import type { PayrollExtra, PayrollLine } from "@/lib/payroll";

/** Earnings that are not part of the salary structure, so are never prorated. */
const NOT_STRUCTURE = new Set(["EXTRA", "OT_NORMAL", "OT_PREMIUM"]);

export type Field = "lop" | "bonus" | "deduction";

/** What has been typed into a row and not yet confirmed by the backend. */
export type Draft = Partial<Record<Field, string>>;

export interface Figures {
  /** Money in whole paise / fils. */
  salary: number;
  gross: number;
  deductions: number;
  net: number;
  bonus: number;
  other: number;
  statutory: number;
  paid: number;
  lop: number;
  /** Statutory deductions may move once the backend recalculates. */
  approximate: boolean;
}

export function toCents(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** num ÷ den, rounded half up — the backend's ROUND_HALF_UP, for non-negative values. */
function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** A typed number: empty is 0, anything else unreadable or negative is null. */
export function parseTyped(text: string | undefined): number | null {
  if (text === undefined) return null;
  const t = text.trim().replace(/,/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function isStructure(code: string): boolean {
  return !NOT_STRUCTURE.has(code);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function extras(line: PayrollLine, kind: PayrollExtra["kind"]): PayrollExtra[] {
  return line.extras.filter((e) => e.kind === kind);
}

/** The line exactly as the backend last calculated it. */
export function serverFigures(line: PayrollLine): Figures {
  const statutory = sum(line.deductions.filter((d) => d.code !== "EXTRA").map((d) => toCents(d.amount)));
  return {
    salary: sum(
      line.earnings.filter((e) => isStructure(e.code)).map((e) => toCents(e.full ?? e.amount)),
    ),
    gross: toCents(line.gross),
    deductions: toCents(line.total_deductions),
    net: toCents(line.net),
    bonus: sum(extras(line, "earning").map((e) => toCents(e.amount))),
    other: sum(extras(line, "deduction").map((e) => toCents(e.amount))),
    statutory,
    paid: Number(line.paid_days),
    lop: Math.max(0, Number(line.leave_lop_days) + Number(line.lop_adjust)),
    approximate: false,
  };
}

/** The line as it will be once what has been typed is saved. */
export function estimate(line: PayrollLine, draft: Draft | undefined, daysInMonth: number): Figures {
  const server = serverFigures(line);
  if (!draft) return server;
  const lopIn = parseTyped(draft.lop);
  const bonusIn = parseTyped(draft.bonus);
  const otherIn = parseTyped(draft.deduction);
  // Nothing readable typed: the backend's figures stand.
  if (lopIn === null && bonusIn === null && otherIn === null) return server;

  const basis = Number(line.basis_days);
  const lop = lopIn ?? server.lop;

  // Structure earnings: unchanged unless the unpaid days are.
  let structure: number;
  let paid = server.paid;
  if (lop === server.lop) {
    structure = sum(line.earnings.filter((e) => isStructure(e.code)).map((e) => toCents(e.amount)));
  } else {
    // rules._attendance: a whole month is paid on the basis; a joiner or a
    // leaver on the days they were employed, never more than the basis.
    const days = line.workings?.days as Record<string, unknown> | undefined;
    const employed = Number(days?.employed ?? daysInMonth);
    const base = employed >= daysInMonth ? basis : Math.min(basis, employed);
    paid = Math.max(0, base - lop);
    const paid100 = Math.round(paid * 100);
    const basis100 = Math.round(basis * 100);
    structure = sum(
      line.earnings
        .filter((e) => isStructure(e.code))
        .map((e) => (basis100 ? roundDiv(toCents(e.full ?? e.amount) * paid100, basis100) : 0)),
    );
  }
  // Overtime is worked out on the full basic, so unpaid days do not move it.
  const overtime = sum(
    line.earnings.filter((e) => e.code === "OT_NORMAL" || e.code === "OT_PREMIUM").map((e) => toCents(e.amount)),
  );
  // Typed amounts are rupees / dirhams; everything here is in paise / fils.
  const bonus = bonusIn !== null ? Math.round(bonusIn * 100) : server.bonus;
  const other = otherIn !== null ? Math.round(otherIn * 100) : server.other;
  const gross = structure + overtime + bonus;
  const deductions = server.statutory + other;

  return {
    salary: server.salary,
    gross,
    deductions,
    net: gross - deductions,
    bonus,
    other,
    statutory: server.statutory,
    paid,
    lop,
    approximate: server.statutory > 0,
  };
}
