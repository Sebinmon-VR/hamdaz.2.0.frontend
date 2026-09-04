/** Formatting used across more than one screen. */

const DEFAULT_LOCALE = "en-GB";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A stable colour per person, so the same face keeps the same tile everywhere
 * without the backend having to store one.
 */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function money(
  value: number | string | null | undefined,
  currency?: string | null,
  options: { compact?: boolean } = {},
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: currency ? "currency" : "decimal",
    currency: currency ?? undefined,
    notation: options.compact && Math.abs(n) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(n) >= 10_000 && options.compact ? 1 : 2,
    minimumFractionDigits: options.compact ? 0 : 2,
  }).format(n);
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(DEFAULT_LOCALE).format(value);
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Dates arrive as ISO strings or bare YYYY-MM-DD. Both parse. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function date(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function dateShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { day: "numeric", month: "short" }).format(d);
}

export function dateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function weekday(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { weekday: "short" }).format(d);
}

/** "3 days ago", "in 2 weeks". Null in, em dash out. */
export function relative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const seconds = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), "second");
}

/** Whole days from today, negative when in the past. */
export function daysAway(value: string | Date | null | undefined): number | null {
  const d = toDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "team_lead" -> "Team lead". Used for role and status keys from the API. */
export function humanise(key: string | null | undefined): string {
  if (!key) return "—";
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function bytes(size: number | null | undefined): string {
  if (!size && size !== 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/* ── exact decimals ──────────────────────────────────────────────────────
 *
 * Money and quantities arrive from the quoting API as strings because they
 * are exact decimals on the backend. Putting one through `Number` is lossy at
 * both ends — big totals lose integer precision past 2^53, and anything with
 * more than a couple of decimal places gets a binary-float approximation. A
 * quote is a number somebody signs, so the formatters below never parse: they
 * work on the digits as written and hand back the same value, grouped.
 *
 * Use these for anything the server called a decimal. `money`/`num` above are
 * for values that were genuinely numbers on the wire (the comparison analysis
 * computes floats), and stay as they are.
 */

interface Parts {
  neg: boolean;
  int: string;
  frac: string;
}

/** Splits "-1234.50" into its sign, integer digits and fraction digits. */
function parts(value: string): Parts | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return null;
  const [, sign, int = "", frac = ""] = match;
  if (!int && !frac) return null;
  return { neg: sign === "-", int: int.replace(/^0+(?=\d)/, "") || "0", frac };
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** True when every digit is a zero — sign and padding ignored. */
function allZero(p: Parts): boolean {
  return !/[1-9]/.test(p.int + p.frac);
}

/**
 * -1, 0 or 1 for a decimal string, without parsing it.
 *
 * The reason this exists rather than `Number(v) < 0`: the comparisons it
 * feeds decide whether a line is flagged as sold below cost, and that flag
 * has to be right for a value with more places than a double can hold.
 */
export function sign(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const p = parts(value);
  if (!p || allZero(p)) return 0;
  return p.neg ? -1 : 1;
}

export function isZero(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const p = parts(value);
  return !p || allZero(p);
}

/**
 * A decimal string, grouped for reading and never rounded away.
 *
 * `min` places are always shown, and any place the server sent beyond that is
 * kept — truncating one would be this module quietly changing a price.
 */
export function decimal(
  value: string | null | undefined,
  { min = 2, dash = "—" }: { min?: number; dash?: string } = {},
): string {
  if (value === null || value === undefined) return dash;
  const p = parts(value);
  if (!p) return dash;
  // Trailing zeros are trimmed to `min` places. Dropping them changes no
  // value — "24000.0000" and "24000.00" are the same number — and a column of
  // four-place zeros is the kind of noise that stops people reading the digits
  // that matter. Places that carry a value are never touched.
  let frac = p.frac.replace(/0+$/, "");
  if (frac.length < min) frac = frac.padEnd(min, "0");
  const body = frac ? `${group(p.int)}.${frac}` : group(p.int);
  return p.neg && !allZero(p) ? `-${body}` : body;
}

/**
 * A decimal string as money: the currency, then the exact amount.
 *
 * The code is written before the number rather than run through
 * Intl.NumberFormat's currency style, because Intl only takes a Number — and
 * handing it one is the exact thing this module exists to avoid.
 */
export function amount(
  value: string | null | undefined,
  currency?: string | null,
  options: { min?: number; dash?: string } = {},
): string {
  const body = decimal(value, options);
  if (body === (options.dash ?? "—")) return body;
  return currency ? `${currency} ${body}` : body;
}

/** A decimal string as a percentage. Margins and win probability. */
export function decimalPercent(
  value: string | null | undefined,
  { places = 1 }: { places?: number } = {},
): string {
  if (value === null || value === undefined) return "—";
  const p = parts(value);
  if (!p) return "—";
  // Percentages are the one place rounding is wanted: nobody reads a margin
  // to eight places. It is done on the digits, not by a float round-trip.
  const frac = p.frac.padEnd(places + 1, "0");
  let keep = frac.slice(0, places);
  if (Number(frac[places]) >= 5) {
    // Carry by hand so that "9.99" to one place is "10.0", not "9.10".
    const carried = String(BigInt(p.int + keep) + 1n).padStart(keep.length + 1, "0");
    const cut = carried.length - places;
    keep = places > 0 ? carried.slice(cut) : "";
    p.int = (places > 0 ? carried.slice(0, cut) : carried).replace(/^0+(?=\d)/, "") || "0";
  }
  const body = places > 0 ? `${group(p.int)}.${keep}` : group(p.int);
  return `${p.neg && /[1-9]/.test(p.int + keep) ? "-" : ""}${body}%`;
}

/**
 * A quantity. Trailing zeros are dropped — "3" reads better than "3.00" for a
 * count of things, and unlike money the places carry no meaning here.
 */
export function quantity(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const p = parts(value);
  if (!p) return "—";
  const frac = p.frac.replace(/0+$/, "");
  const body = frac ? `${group(p.int)}.${frac}` : group(p.int);
  return p.neg && !allZero(p) ? `-${body}` : body;
}

/**
 * Adds decimal strings exactly.
 *
 * Only for the handful of places a list screen wants a "value waiting" figure
 * that no endpoint returns. Anything the server totals is read from the
 * server; this is not a way around that rule, and it is deliberately not
 * exported as a general-purpose calculator.
 *
 * The sum is done on scaled integers through BigInt, so a thousand rows at two
 * decimal places add up to the same answer a database would give. Floating
 * point would not: 0.1 + 0.2 is famously not 0.3, and a queue total that is
 * out by a cent is a queue total nobody trusts.
 *
 * Null in, null out — a list with a value it cannot read is not a list worth
 * half-totalling.
 */
export function sumExact(values: (string | null | undefined)[]): string | null {
  let scale = 0;
  const rows: Parts[] = [];
  for (const value of values) {
    if (value === null || value === undefined) return null;
    const p = parts(value);
    if (!p) return null;
    rows.push(p);
    scale = Math.max(scale, p.frac.length);
  }
  if (rows.length === 0) return null;

  let total = 0n;
  for (const p of rows) {
    const digits = p.int + p.frac.padEnd(scale, "0");
    const magnitude = BigInt(digits);
    total += p.neg ? -magnitude : magnitude;
  }

  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const int = scale > 0 ? digits.slice(0, -scale) : digits;
  const frac = scale > 0 ? digits.slice(-scale) : "";
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/* ── deriving one input from another ─────────────────────────────────────
 *
 * The rule everywhere else is that the server owns the money: totals, line
 * totals and the margin on a saved line all come back from it and are only
 * rendered here. These functions do not break that rule, because what they
 * produce is an *input* — the sell rate the user is about to type — not an
 * answer displayed as though the server had given it.
 *
 * Somebody pricing a job thinks "cost plus twenty percent", not "1200". Making
 * them do that arithmetic in their head and type the result is how a rate ends
 * up a few cents out. So the markup is the thing they type and the rate is
 * derived, exactly, and the server still has the last word on every total.
 */

/** Signed integer units for a parsed decimal, at its own scale. */
function unitsOf(p: Parts): bigint {
  const magnitude = BigInt((p.int + p.frac) || "0");
  return p.neg ? -magnitude : magnitude;
}

function fromUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const int = scale > 0 ? digits.slice(0, -scale) : digits;
  const frac = scale > 0 ? digits.slice(-scale) : "";
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** Integer division rounded half away from zero, so 0.5 and -0.5 both go out. */
function divRound(numer: bigint, denom: bigint): bigint {
  const negative = numer < 0n !== denom < 0n;
  const n = numer < 0n ? -numer : numer;
  const d = denom < 0n ? -denom : denom;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** Flips the sign of a decimal string without parsing it. */
export function negate(value: string): string {
  const raw = value.trim();
  return raw.startsWith("-") ? raw.slice(1) : `-${raw}`;
}

/** a − b, exactly. */
export function subExact(a: string, b: string): string | null {
  return sumExact([a, negate(b)]);
}

/**
 * The sell rate a markup on cost produces: cost × (100 + percent) ÷ 100.
 *
 * Computed on scaled integers, so 12.5% of a four-place cost is the rate the
 * server would have arrived at rather than a float's nearest neighbour.
 */
export function rateFromMarkup(
  cost: string,
  percent: string,
  places = 4,
): string | null {
  const c = parts(cost);
  const p = parts(percent);
  if (!c || !p) return null;
  const sc = c.frac.length;
  const sp = p.frac.length;
  const hundred = 100n * 10n ** BigInt(sp);
  const numer = unitsOf(c) * (hundred + unitsOf(p)) * 10n ** BigInt(places);
  const denom = 10n ** BigInt(sc + sp) * 100n;
  return fromUnits(divRound(numer, denom), places);
}

/**
 * The markup on cost that a given sell rate represents, as a percentage.
 *
 * Null when the cost is zero — there is no percentage of nothing, and showing
 * a 0 there would read as "no margin" rather than "not a question".
 */
export function markupOf(cost: string, rate: string, places = 2): string | null {
  const c = parts(cost);
  const r = parts(rate);
  if (!c || !r) return null;
  const scale = Math.max(c.frac.length, r.frac.length);
  const cN = unitsOf(c) * 10n ** BigInt(scale - c.frac.length);
  const rN = unitsOf(r) * 10n ** BigInt(scale - r.frac.length);
  if (cN === 0n) return null;
  const numer = (rN - cN) * 100n * 10n ** BigInt(places);
  return fromUnits(divRound(numer, cN), places);
}
