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

/**
 * The currencies a quote can be raised in.
 *
 * Exactly the set the supplier-quote parser recognises, so a quote can never
 * be put in a currency the comparison is then unable to read back off a
 * supplier's PDF. AED leads because almost everything is quoted in it; the
 * rest are the Gulf neighbours and the majors, in that order.
 *
 * Nothing here converts between them. A quote is raised, priced and approved
 * in one currency, and the code is carried so the figures are labelled
 * correctly — not so that two of them can be added together.
 */
export const CURRENCIES = [
  "AED", "USD", "EUR", "GBP", "SAR", "QAR", "OMR", "KWD",
  "BHD", "INR", "JPY", "CNY", "CHF", "AUD", "CAD", "SGD",
] as const;

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
 * Somebody pricing a job thinks "twenty percent margin", not "1250". Making
 * them do that arithmetic in their head and type the result is how a rate ends
 * up a few cents out. So the margin is the thing they type and the rate is
 * derived, exactly, and the server still has the last word on every total.
 *
 * A margin is a share of the selling price: rate = cost ÷ (1 − margin). Cost
 * 100 at 20% is 125, of which a fifth — the 25 added — is margin. Marking up
 * by 20% would give 120, which keeps only 16.67%, and that difference on every
 * line is how a bid goes in cheaper than the number somebody typed.
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

/** `a × b`, exactly, without sending either decimal through a float. */
export function multiplyExact(a: string, b: string): string | null {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return null;
  return fromUnits(unitsOf(x) * unitsOf(y), x.frac.length + y.frac.length);
}

/** Round a decimal half-up to a fixed number of places, as Zoho does for tax. */
export function roundExact(value: string, places = 2): string | null {
  const p = parts(value);
  if (!p) return null;
  if (p.frac.length <= places) {
    return fromUnits(unitsOf(p) * 10n ** BigInt(places - p.frac.length), places);
  }
  return fromUnits(divRound(unitsOf(p), 10n ** BigInt(p.frac.length - places)), places);
}

/** The editable values that affect one quote line's three Zoho columns. */
export interface QuotePreviewLineInput {
  key: string;
  quantity: string;
  rate: string;
  discount: string;
  costRate: string | null;
}

/** A calculated line for an on-screen preview. Nothing here has been saved. */
export interface QuotePreviewLine {
  line_total: string;
  margin: string | null;
}

/** The client-side preview of the quote figures that the backend will save. */
export interface QuotePreview {
  lines: Record<string, QuotePreviewLine>;
  sub_total: string;
  total_excl_tax: string;
  tax_total: string;
  total: string;
  discount: string;
  shipping_charge: string;
  adjustment: string;
  tax_name: string | null;
  tax_percentage: string | null;
  /** What the costed lines cost us: Σ cost × quantity. "0" when none has a cost. */
  cost_total: string;
}

/**
 * What the lines cost us, before anything is moved: Σ cost × quantity over
 * the lines that have a cost. Exact, so it agrees with the server's goods
 * figure to the cent.
 */
export function costTotal(
  lines: readonly { cost_rate: string | null; quantity: string }[],
): string {
  const costs: string[] = [];
  for (const line of lines) {
    const cost = line.cost_rate?.trim();
    if (!cost || !parts(cost)) continue;
    const qty = line.quantity.trim() || "1";
    const extended = multiplyExact(cost, qty);
    if (extended !== null) costs.push(extended);
  }
  return sumExact(costs) ?? "0";
}

function previewInput(value: string | null | undefined, fallback: string): string | null {
  const text = value?.trim();
  if (!text) return fallback;
  return parts(text) ? text : null;
}

/**
 * Reproduce the quote-total arithmetic locally while somebody is editing.
 *
 * The preview is intentionally read-only: it does not update the SWR record
 * or make a request. Save remains the only operation that persists a quote.
 * Invalid, half-typed numerics yield `null`, so the screen never presents a
 * made-up total as the number that will be saved.
 */
export function quotePreview(
  lines: readonly QuotePreviewLineInput[],
  adjustments: Pick<
    QuotePreview,
    "discount" | "shipping_charge" | "adjustment" | "tax_name" | "tax_percentage"
  >,
): QuotePreview | null {
  const discount = previewInput(adjustments.discount, "0");
  const shipping = previewInput(adjustments.shipping_charge, "0");
  const adjustment = previewInput(adjustments.adjustment, "0");
  // A blank rate is no tax. The tax is on the quote, once, on the total.
  const taxPercentage = previewInput(adjustments.tax_percentage, "0");
  if (discount === null || shipping === null || adjustment === null) return null;
  if (taxPercentage === null) return null;

  const calculated: Record<string, QuotePreviewLine> = {};
  const taxable: string[] = [];
  const costs: string[] = [];

  for (const line of lines) {
    // These defaults are the same ones `toLineIn` sends when a numeric cell is
    // blank. A blank quantity is one unit; blank money is zero.
    const quantity = previewInput(line.quantity, "1");
    const rate = previewInput(line.rate, "0");
    const lineDiscount = previewInput(line.discount, "0");
    if (quantity === null || rate === null || lineDiscount === null) {
      return null;
    }

    const extended = multiplyExact(quantity, rate);
    const lineTotal = extended === null ? null : subExact(extended, lineDiscount);
    if (lineTotal === null) return null;

    const cost = previewInput(line.costRate, "");
    const perUnitMargin = cost === null || cost === "" ? null : subExact(rate, cost);
    const margin = perUnitMargin === null ? null : multiplyExact(perUnitMargin, quantity);
    calculated[line.key] = { line_total: lineTotal, margin };
    taxable.push(lineTotal);
    if (cost) {
      const extended = multiplyExact(cost, quantity);
      if (extended !== null) costs.push(extended);
    }
  }

  const subTotal = sumExact(taxable) ?? "0";
  const totalExclTax = sumExact([subTotal, negate(discount), shipping, adjustment]);
  if (totalExclTax === null) return null;
  // Once, on the total before tax — the discount off and the shipping on
  // first — and rounded once to the cent, as the server does it.
  const taxBase = multiplyExact(totalExclTax, taxPercentage);
  const taxTotal = taxBase === null ? null : divideExact(taxBase, "100", 2);
  if (taxTotal === null) return null;
  const total = sumExact([totalExclTax, taxTotal]);
  if (total === null) return null;

  return {
    lines: calculated,
    sub_total: subTotal,
    total_excl_tax: totalExclTax,
    tax_total: taxTotal,
    total,
    discount,
    shipping_charge: shipping,
    tax_name: adjustments.tax_name,
    tax_percentage: adjustments.tax_percentage,
    cost_total: sumExact(costs) ?? "0",
    adjustment,
  };
}

/**
 * The sell rate that keeps `percent` of itself as margin: cost × 100 ÷ (100 −
 * percent). Null when the margin is the whole price or more — there is no
 * such price — or when either input is not a number.
 *
 * Computed on scaled integers, so a 12.5% margin on a four-place cost is the
 * rate the server would have arrived at rather than a float's nearest
 * neighbour.
 */
export function rateFromMargin(
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
  const share = hundred - unitsOf(p);
  if (share <= 0n) return null;
  const numer = unitsOf(c) * hundred * 10n ** BigInt(places);
  const denom = share * 10n ** BigInt(sc);
  return fromUnits(divRound(numer, denom), places);
}

/** `a ÷ b` on scaled integers, rounded half-up to `places`. Null on a zero divisor. */
export function divideExact(a: string, b: string, places = 2): string | null {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return null;
  const yN = unitsOf(y);
  if (yN === 0n) return null;
  // (x / 10^sx) / (y / 10^sy) = x * 10^sy / (y * 10^sx), then scaled to `places`.
  const numer = unitsOf(x) * 10n ** BigInt(y.frac.length + places);
  const denom = yN * 10n ** BigInt(x.frac.length);
  return fromUnits(divRound(numer, denom), places);
}

/**
 * A selling price built the way Zoho Books builds one: the margin goes on in
 * the supplier's currency, the price is rounded there — to the whole unit for
 * AED, since that is how Zoho's item prices are set; to the cent otherwise —
 * and only then converted at the rate, to the cent.
 *
 * AED 49 at a 20% margin = 61.25 → 61 → ÷ 3.672501 = USD 16.61. Pricing the
 * converted cost instead lands a cent a unit away from the estimate. `fx` is
 * one unit of the quote's currency in the supplier's; "1" when they are the
 * same.
 */
export function priceViaSupplier(
  supplierPrice: string,
  percent: string,
  fx: string,
  supplierCurrency: string,
): string | null {
  const wholeUnits = supplierCurrency.toUpperCase() === "AED";
  const theirs = rateFromMargin(supplierPrice, percent, wholeUnits ? 0 : 2);
  if (theirs === null) return null;
  return divideExact(theirs, fx, 2);
}

/**
 * The margin a given sell rate keeps, as a share of itself: (rate − cost) ÷
 * rate × 100.
 *
 * Null when the rate is zero — there is no share of nothing, and showing a 0
 * there would read as "no margin" rather than "not a question".
 */
export function marginOf(cost: string, rate: string, places = 2): string | null {
  const c = parts(cost);
  const r = parts(rate);
  if (!c || !r) return null;
  const scale = Math.max(c.frac.length, r.frac.length);
  const cN = unitsOf(c) * 10n ** BigInt(scale - c.frac.length);
  const rN = unitsOf(r) * 10n ** BigInt(scale - r.frac.length);
  if (rN === 0n) return null;
  const numer = (rN - cN) * 100n * 10n ** BigInt(places);
  return fromUnits(divRound(numer, rN), places);
}
