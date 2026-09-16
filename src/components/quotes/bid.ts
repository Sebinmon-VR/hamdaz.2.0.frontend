import type {
  ComplianceArea,
  ComplianceStatus,
  CostStage,
  QuoteComplianceOut,
  QuoteCostLineOut,
  QuoteRequestOut,
  QuoteSubmissionFieldOut,
  Severity,
} from "@/lib/types";

/**
 * The bid pack as the screen holds it, and how it goes back.
 *
 * One module for the shape rather than five, because the quote request page
 * sends the whole quote on every save — the estimate, the lines, the build-up,
 * the matrix and the portal checklist together — and a body assembled in five
 * places is a body that loses a list the first time somebody adds a section.
 *
 * **Every value is the string the user typed.** Nothing here parses a number.
 * Rates and costs are exact decimals the server is expecting, and running one
 * through a JavaScript number to "normalise" it is how 302.28 becomes
 * 302.27999999999997 in a bid document.
 *
 * Nothing here calculates money either. The landed cost, the ladder, the margin
 * and the uplift all arrive in `quote.bid`, computed by the server on read. A
 * second implementation on this side would be a second answer, and the screen
 * would eventually show one while the approval was made against the other.
 */

/* ── the scalar fields ───────────────────────────────────────────────── */

export interface BidDraft {
  rfp_number: string;
  buying_entity: string;
  line_item_ref: string;
  manufacturer_name: string;
  manufacturer_part_number: string;
  manufacturer_class_no: string;
  incoterm_required: string;
  incoterm_place: string;
  ship_to: string;
  requested_delivery_date: string;
  delivery_days: string;
  country_of_origin: string;
  mode_of_shipment: string;
  bid_validity_days: string;
  bid_reference: string;
  technical_verdict: string;
  commercial_verdict: string;
  supplier_currency: string;
  fx_rate: string;
  customs_duty_percent: string;
  financing_rate_percent: string;
  cash_exposure_days: string;
  target_markup_percent: string;
  submission_unit_price: string;
  submission_total: string;
  discloses_principal_price: boolean;
}

export function bidDraftOf(quote: QuoteRequestOut): BidDraft {
  return {
    rfp_number: quote.rfp_number ?? "",
    buying_entity: quote.buying_entity ?? "",
    line_item_ref: quote.line_item_ref ?? "",
    manufacturer_name: quote.manufacturer_name ?? "",
    manufacturer_part_number: quote.manufacturer_part_number ?? "",
    manufacturer_class_no: quote.manufacturer_class_no ?? "",
    incoterm_required: quote.incoterm_required ?? "",
    incoterm_place: quote.incoterm_place ?? "",
    ship_to: quote.ship_to ?? "",
    // The API sends dates as YYYY-MM-DD, which is what <input type="date">
    // wants, so an ISO timestamp is trimmed rather than round-tripped through
    // a Date — that would shift the day in any timezone behind UTC.
    requested_delivery_date: (quote.requested_delivery_date ?? "").slice(0, 10),
    delivery_days: quote.delivery_days == null ? "" : String(quote.delivery_days),
    country_of_origin: quote.country_of_origin ?? "",
    mode_of_shipment: quote.mode_of_shipment ?? "",
    bid_validity_days:
      quote.bid_validity_days == null ? "" : String(quote.bid_validity_days),
    bid_reference: quote.bid_reference ?? "",
    technical_verdict: quote.technical_verdict ?? "",
    commercial_verdict: quote.commercial_verdict ?? "",
    supplier_currency: quote.supplier_currency ?? "",
    fx_rate: quote.fx_rate ?? "",
    customs_duty_percent: quote.customs_duty_percent ?? "0",
    financing_rate_percent: quote.financing_rate_percent ?? "0",
    cash_exposure_days: String(quote.cash_exposure_days ?? 0),
    target_markup_percent: quote.target_markup_percent ?? "",
    submission_unit_price: quote.submission_unit_price ?? "",
    submission_total: quote.submission_total ?? "",
    discloses_principal_price: quote.discloses_principal_price ?? false,
  };
}

/** Blank to null, so an emptied field clears rather than storing "". */
function nullable(value: string): string | null {
  return value.trim() || null;
}

/** Blank to null, and anything else as typed — the server parses it. */
function optionalNumber(value: string): string | null {
  return value.trim() || null;
}

export function bidPatch(draft: BidDraft) {
  return {
    rfp_number: nullable(draft.rfp_number),
    buying_entity: nullable(draft.buying_entity),
    line_item_ref: nullable(draft.line_item_ref),
    manufacturer_name: nullable(draft.manufacturer_name),
    manufacturer_part_number: nullable(draft.manufacturer_part_number),
    manufacturer_class_no: nullable(draft.manufacturer_class_no),
    incoterm_required: nullable(draft.incoterm_required),
    incoterm_place: nullable(draft.incoterm_place),
    ship_to: nullable(draft.ship_to),
    requested_delivery_date: nullable(draft.requested_delivery_date),
    delivery_days: optionalNumber(draft.delivery_days),
    country_of_origin: nullable(draft.country_of_origin),
    mode_of_shipment: nullable(draft.mode_of_shipment),
    bid_validity_days: optionalNumber(draft.bid_validity_days),
    bid_reference: nullable(draft.bid_reference),
    technical_verdict: nullable(draft.technical_verdict),
    commercial_verdict: nullable(draft.commercial_verdict),
    supplier_currency: nullable(draft.supplier_currency),
    fx_rate: optionalNumber(draft.fx_rate),
    // These three are rates that mean zero when nobody has said otherwise —
    // plenty of goods carry no duty — so a blank is 0 rather than null.
    customs_duty_percent: draft.customs_duty_percent.trim() || "0",
    financing_rate_percent: draft.financing_rate_percent.trim() || "0",
    cash_exposure_days: draft.cash_exposure_days.trim() || "0",
    // A markup of nothing and no markup at all are different answers, so this
    // one stays nullable: the first prices the bid at cost, the second has not
    // been decided.
    target_markup_percent: optionalNumber(draft.target_markup_percent),
    submission_unit_price: optionalNumber(draft.submission_unit_price),
    submission_total: optionalNumber(draft.submission_total),
    discloses_principal_price: draft.discloses_principal_price,
  };
}

/* ── the three lists ─────────────────────────────────────────────────── */

/**
 * Rows carry a `key` that is stable across a reorder and exists for rows the
 * server has never seen, and an `id` that is null until it has. The same split
 * the line editor makes, for the same reason: React needs something to hold,
 * and the server needs to recognise a row it has stored so that when a gap was
 * closed, and when a cell was typed, survive a save.
 */
export interface CostRow {
  key: string;
  id: string | null;
  stage: CostStage;
  label: string;
  basis: string;
  amount_source: string;
  source_currency: string;
  amount_base: string;
  is_firm: boolean;
  notes: string;
}

export interface ComplianceRow {
  key: string;
  id: string | null;
  ref: string;
  area: ComplianceArea;
  requirement: string;
  source_clause: string;
  supplier_position: string;
  status: ComplianceStatus;
  severity: Severity | "";
  action: string;
  owner: string;
  resolved: boolean;
}

export interface PortalRow {
  key: string;
  id: string | null;
  clause: string;
  label: string;
  destination: string;
  value: string;
  note: string;
  is_mandatory: boolean;
  entered: boolean;
}

let counter = 0;
/** A key for a row the server has never seen. */
export function newKey(prefix: string): string {
  counter += 1;
  return `${prefix}-new-${counter}`;
}

export function costRowOf(row: QuoteCostLineOut): CostRow {
  return {
    key: row.id,
    id: row.id,
    stage: row.stage,
    label: row.label,
    basis: row.basis ?? "",
    amount_source: row.amount_source ?? "",
    source_currency: row.source_currency ?? "",
    amount_base: row.amount_base,
    is_firm: row.is_firm,
    notes: row.notes ?? "",
  };
}

export function blankCostRow(stage: CostStage, sourceCurrency: string): CostRow {
  return {
    key: newKey("cost"),
    id: null,
    stage,
    label: "",
    basis: "",
    amount_source: "",
    source_currency: sourceCurrency,
    amount_base: "",
    is_firm: false,
    notes: "",
  };
}

export function costRowIn(row: CostRow) {
  return {
    stage: row.stage,
    label: row.label.trim(),
    basis: nullable(row.basis),
    amount_source: optionalNumber(row.amount_source),
    source_currency: nullable(row.source_currency),
    amount_base: row.amount_base.trim() || "0",
    // The principal is the derived goods row, never a typed one — see
    // `bidpack.landed_cost`. Sent explicitly so a stored row can never
    // accidentally claim to be the price the buyer will see.
    is_principal: false,
    is_firm: row.is_firm,
    notes: nullable(row.notes),
  };
}

export function complianceRowOf(row: QuoteComplianceOut): ComplianceRow {
  return {
    key: row.id,
    id: row.id,
    ref: row.ref ?? "",
    area: row.area,
    requirement: row.requirement,
    source_clause: row.source_clause ?? "",
    supplier_position: row.supplier_position ?? "",
    status: row.status,
    severity: row.severity ?? "",
    action: row.action ?? "",
    owner: row.owner ?? "",
    resolved: row.resolved,
  };
}

export function blankComplianceRow(area: ComplianceArea): ComplianceRow {
  return {
    key: newKey("comp"),
    id: null,
    ref: "",
    area,
    requirement: "",
    source_clause: "",
    supplier_position: "",
    status: "open",
    severity: "",
    action: "",
    owner: "",
    resolved: false,
  };
}

export function complianceRowIn(row: ComplianceRow) {
  return {
    id: row.id,
    ref: nullable(row.ref),
    area: row.area,
    requirement: row.requirement.trim(),
    source_clause: nullable(row.source_clause),
    supplier_position: nullable(row.supplier_position),
    status: row.status,
    severity: row.severity || null,
    action: nullable(row.action),
    owner: nullable(row.owner),
    resolved: row.resolved,
  };
}

export function portalRowOf(row: QuoteSubmissionFieldOut): PortalRow {
  return {
    key: row.id,
    id: row.id,
    clause: row.clause ?? "",
    label: row.label,
    destination: row.destination ?? "",
    value: row.value ?? "",
    note: row.note ?? "",
    is_mandatory: row.is_mandatory,
    entered: row.entered,
  };
}

export function blankPortalRow(): PortalRow {
  return {
    key: newKey("portal"),
    id: null,
    clause: "",
    label: "",
    destination: "",
    value: "",
    note: "",
    is_mandatory: false,
    entered: false,
  };
}

export function portalRowIn(row: PortalRow) {
  return {
    id: row.id,
    clause: nullable(row.clause),
    label: row.label.trim(),
    destination: nullable(row.destination),
    value: nullable(row.value),
    note: nullable(row.note),
    is_mandatory: row.is_mandatory,
    entered: row.entered,
  };
}

/* ── how the statuses read ───────────────────────────────────────────── */

/**
 * The traffic light, plus the two things a traffic light cannot say: whether a
 * gap can be *priced* and whether it can be *cured*. A deviation we carry the
 * cost of is amber; something that has to be fixed or formally declared before
 * anything is submitted is red. Collapsing those two into one colour is what
 * makes a compliance matrix decorative.
 */
export const COMPLIANCE_STATUS: Record<
  ComplianceStatus,
  { label: string; tone: "positive" | "warn" | "danger" | "info" | "neutral"; hint: string }
> = {
  compliant: {
    label: "Compliant",
    tone: "positive",
    hint: "Offered exactly what was asked for.",
  },
  deviation: {
    label: "Deviation",
    tone: "warn",
    hint: "A gap, but one we can price or cure. Carried in the landed cost.",
  },
  non_compliant: {
    label: "Non-compliant",
    tone: "danger",
    hint: "Must be cured or formally declared before this is submitted.",
  },
  clarify: {
    label: "Clarify",
    tone: "info",
    hint: "The RFP contradicts itself, or does not say. Ask the buyer.",
  },
  risk: {
    label: "Risk",
    tone: "danger",
    hint: "Compliant on its face and still dangerous. Price disclosure, usually.",
  },
  open: {
    label: "Open",
    tone: "warn",
    hint: "Ours to produce, and not produced yet.",
  },
  not_applicable: {
    label: "Not applicable",
    tone: "neutral",
    hint: "Genuinely does not apply. Kept so the matrix still shows somebody looked.",
  },
  noted: {
    label: "Noted",
    tone: "neutral",
    hint: "For the file. Decides nothing.",
  },
};

export const SEVERITY: Record<
  Severity,
  { label: string; tone: "danger" | "warn" | "neutral"; rank: number }
> = {
  stopper: { label: "Stopper", tone: "danger", rank: 0 },
  critical: { label: "Critical", tone: "danger", rank: 1 },
  high: { label: "High", tone: "warn", rank: 2 },
  medium: { label: "Medium", tone: "warn", rank: 3 },
  note: { label: "Note", tone: "neutral", rank: 4 },
};

export const AREA: Record<ComplianceArea, string> = {
  technical: "Technical — the specification",
  commercial: "Commercial — terms and price",
  documents: "The bid package — certificates and statements",
  logistics: "Logistics and customs",
};

export const AREA_ORDER: ComplianceArea[] = [
  "technical",
  "commercial",
  "documents",
  "logistics",
];

/**
 * The bid pack's three lists, always as arrays.
 *
 * The one place that copes with a backend which has not been migrated or
 * restarted yet. The two halves of this system deploy separately, so a response
 * without these fields is a real state rather than a theoretical one — and the
 * failure it used to cause was the worst kind: not a missing section but a
 * `.map` of undefined, which takes the whole quote down on render, including
 * the estimate half that has nothing to do with bids.
 *
 * An empty list is the right reading of a missing one here. It means "this
 * quote has no compliance rows", which is exactly true of every quote raised
 * before any of this existed.
 */
export function bidLists(quote: QuoteRequestOut): {
  costLines: QuoteCostLineOut[];
  compliance: QuoteComplianceOut[];
  submissionFields: QuoteSubmissionFieldOut[];
} {
  return {
    costLines: quote.cost_lines ?? [],
    compliance: quote.compliance ?? [],
    submissionFields: quote.submission_fields ?? [],
  };
}

/**
 * Whether a quote carries a bid pack at all.
 *
 * The bid sections are hidden until there is something in them, or until
 * somebody asks for them. Most quotes are not tenders, and a screen that shows
 * a compliance matrix and a landed-cost build-up to a person quoting for a
 * phone call has buried the four fields they actually need.
 */
export function hasBidPack(quote: QuoteRequestOut): boolean {
  const lists = bidLists(quote);
  return Boolean(
    quote.rfp_number ||
      quote.line_item_ref ||
      quote.incoterm_required ||
      quote.buying_entity ||
      lists.compliance.length > 0 ||
      lists.costLines.length > 0 ||
      lists.submissionFields.length > 0,
  );
}
