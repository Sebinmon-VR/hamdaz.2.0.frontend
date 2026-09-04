/**
 * The shapes the backend actually returns.
 *
 * Transcribed from the FastAPI OpenAPI document rather than invented, so a
 * rename on the backend shows up here as a type error instead of as an
 * undefined at runtime. Where the backend types a field as a bare `object`
 * (dashboard widget payloads, the comparison analysis, profile sections) the
 * real shape is written out here from the code that builds it, and marked as
 * such — those are the places to re-check when the backend changes.
 */

// ── auth, roles, access ────────────────────────────────────────────────

export interface UserOut {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  last_login_at: string | null;
}

export type RoleScope = "global" | "team";

export interface RoleOut {
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  is_system: boolean;
}

export interface GrantOut {
  role: RoleOut;
  granted_at: string;
  granted_by_id: string | null;
}

export interface MyRolesOut {
  user_id: string;
  email: string;
  display_name: string;
  role_keys: string[];
  is_admin: boolean;
  is_super_admin: boolean;
}

export interface UserRolesOut {
  user_id: string;
  email: string;
  display_name: string;
  roles: GrantOut[];
  role_keys: string[];
}

export interface PageOut {
  key: string;
  name: string;
  path: string;
  team_scoped?: boolean;
}

export interface ModuleOut {
  key: string;
  name: string;
  description: string;
  admin_only: boolean;
  pages: PageOut[];
}

export interface EffectiveModule {
  key: string;
  name: string;
  admin_only: boolean;
  pages: PageOut[];
}

export interface EffectiveAccessOut {
  user_id: string;
  source: string;
  modules: EffectiveModule[];
  via_teams: string[];
}

export interface ModuleGrantOut {
  module_key: string;
  name: string;
  all_pages: boolean;
  pages: PageOut[];
  granted_at: string;
  granted_by_id: string | null;
}

export interface TeamAccessOut {
  team_id: string;
  slug: string;
  name: string;
  modules: ModuleGrantOut[];
}

// ── directory ──────────────────────────────────────────────────────────

export interface OrgUserOut {
  object_id: string;
  display_name: string;
  email: string | null;
  user_principal_name: string;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
  mobile_phone: string | null;
  account_enabled: boolean;
  is_guest: boolean;
}

export interface OrgUserPage {
  total: number;
  count: number;
  offset: number;
  limit: number;
  users: OrgUserOut[];
}

// ── teams ──────────────────────────────────────────────────────────────

export interface TeamOut {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  created_by_id: string | null;
  member_count?: number;
}

export interface MemberOut {
  user_id: string;
  email: string;
  display_name: string;
  entra_object_id: string;
  is_active: boolean;
  role_keys: string[];
  joined_at: string;
}

export interface TeamDetailOut extends TeamOut {
  members: MemberOut[];
}

export interface MyTeamOut {
  team: TeamOut;
  role_keys: string[];
}

export interface BulkResult {
  added: MemberOut[];
  /** Each person is attempted independently — one bad id keeps the rest. */
  failed: { user_id: string; reason: string }[];
}

// ── profiles (admin) ───────────────────────────────────────────────────

export interface SectionInfo {
  key: string;
  label: string;
  remote: boolean;
  heavy: boolean;
  resettable: boolean;
}

export interface UserProfileOut {
  user_id: string;
  email: string;
  display_name: string;
  /** Keyed by section key; each section builds its own payload. */
  sections: Record<string, unknown>;
  errors: Record<string, string>;
  meta: { requested: string[]; elapsed_ms: number; section_ms: Record<string, number> };
}

export interface ResetResult {
  user_id: string;
  email: string;
  display_name: string;
  account_deleted: boolean;
  removed: Record<string, number>;
  previous: Record<string, unknown>;
}

// ── dashboards ─────────────────────────────────────────────────────────

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetInfo {
  key: string;
  title: string;
  description: string;
  module: string;
  size: WidgetSize;
  default: boolean;
  remote: boolean;
}

export interface RenderedWidget {
  key: string;
  title: string;
  module: string;
  size: WidgetSize;
  position: number;
  options: Record<string, unknown>;
  /** Shape depends on `key` — see the WidgetData union below. */
  data: unknown;
  error: string | null;
  elapsed_ms: number;
}

export interface DashboardOut {
  team_id: string;
  slug: string;
  name: string;
  widgets: RenderedWidget[];
  errors: Record<string, string>;
  meta: { configured: boolean; elapsed_ms: number; widget_ms: Record<string, number> };
}

export interface PlacementOut {
  widget_key: string;
  title: string;
  module: string;
  size: WidgetSize;
  position: number;
  enabled: boolean;
  options: Record<string, unknown>;
}

export interface LayoutOut {
  team_id: string;
  slug: string;
  configured: boolean;
  widgets: PlacementOut[];
  available: WidgetInfo[];
}

/**
 * Widget payloads, transcribed from app/dashboards/widgets.py. A widget that
 * cannot answer returns `{ available: false, reason }` rather than erroring,
 * so every renderer has to handle that case.
 */
export type Unavailable = { available: false; reason: string };

export type TeamSummaryData = {
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
  leads: string[];
  archived: boolean;
  created_at: string;
};

export type TeamMembersData = {
  total: number;
  showing: number;
  members: {
    user_id: string;
    display_name: string;
    email: string;
    role_keys: string[];
    is_active: boolean;
  }[];
};

export type RoleBreakdownData = { counts: Record<string, number>; total_roles_held: number };

export type RecentMembersData = {
  members: { user_id: string; display_name: string; joined_at: string; role_keys: string[] }[];
};

export type MyStandingData = {
  display_name: string;
  role_keys: string[];
  is_member: boolean;
  is_lead: boolean;
};

export type TeamModulesData = {
  count: number;
  modules: { key: string; name: string; all_pages: boolean; pages: string[] }[];
};

export type DirectorySnapshotData =
  | Unavailable
  | { available: true; headcount: number; departments: Record<string, number> };

export type MyProposalTasksData =
  | Unavailable
  | {
      available: true;
      in_sharepoint: boolean;
      total?: number;
      open_count: number;
      tasks: {
        id: string;
        title: string;
        status: string | null;
        priority: string | null;
        due_date: string | null;
        end_user: string | null;
        web_url: string | null;
      }[];
    };

export type ProposalWorkloadData =
  | Unavailable
  | {
      available: true;
      scope: Omit<ScopeOut, "lookup_ids">;
      organisation: PersonWorkloadOut;
      soon_days: number;
      person_count: number;
      excluded: ExcludedOut;
      cached: boolean;
      people: PersonWorkloadOut[];
    };

export type MyLeaveData = LeaveSummaryOut & { max_concurrent: number; auto_decide: boolean };

export type WhoIsOffData = {
  start: string;
  days: number;
  limit: number;
  calendar: Record<string, CalendarPerson[]>;
  full_days: string[];
};

export type LeaveQueueData =
  | Unavailable
  | {
      available: true;
      pending_count: number;
      auto_rejected_upcoming: number;
      requests: {
        id: string;
        name: string;
        leave_type: string;
        start_date: string;
        end_date: string;
        days: number;
        reason: string | null;
      }[];
    };

// ── proposals ──────────────────────────────────────────────────────────

export interface TaskOut {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  assigned_to_name: string | null;
  start_date: string | null;
  due_date: string | null;
  bid_closing_date: string | null;
  end_user: string | null;
  submission_status: string | null;
  current_type: string | null;
  order_status: string | null;
  negotiation: string | null;
  quote_no: string | null;
  remarks: string | null;
  working_notes: string | null;
  created_at: string | null;
  modified_at: string | null;
  web_url: string | null;
  is_open: boolean;
  deadline: string | null;
}

export interface MyTasksOut {
  email: string;
  sharepoint_user_id: string | null;
  in_sharepoint: boolean;
  total: number;
  open_count: number;
  tasks: TaskOut[];
}

/**
 * An enquiry as the quoting module serves it.
 *
 * Every field the Proposals list carries, plus what quoting knows about it:
 * whether a quote has already been raised, and which. That join is the reason
 * this endpoint exists rather than the proposals one — the picker has to know,
 * per row, whether it is offering to start work or to resume it, and asking
 * two services and stitching the answers here would be slower and would go
 * stale between the two calls.
 */
export interface QuotableTaskOut extends TaskOut {
  /** Null when nothing has been raised against this enquiry yet. */
  quote_request_id: string | null;
  quote_reference: string | null;
  quote_status: QuoteStatus | null;
  quote_title: string | null;
}

export interface QuotableTasksOut {
  email: string;
  /**
   * False means the person has no presence on the SharePoint site at all — a
   * different thing from having nothing assigned, and it needs saying
   * differently. One is "you are clear", the other is "you are not on the list
   * and nothing could ever reach you here".
   */
  in_sharepoint: boolean;
  /** Before `open_only` is applied, so "showing 12 of 27" is available. */
  total: number;
  open_count: number;
  quoted_count: number;
  /** Already sorted soonest deadline first, by BCD. Do not re-sort. */
  tasks: QuotableTaskOut[];
}

export interface ColumnOut {
  name: string | null;
  display_name: string | null;
  choices?: string[] | null;
}

export interface PersonWorkloadOut {
  lookup_id: string | null;
  name: string;
  email: string | null;
  total: number;
  completed: number;
  /** Everything not finished — includes bids that closed long ago. */
  open: number;
  /**
   * Bid closing date already past. Despite the name this is not "late work":
   * it is the parked pile. See {@link activeOf}.
   */
  overdue: number;
  due_soon: number;
  later: number;
  no_deadline: number;
  /**
   * Rows with no status at all. **Also present in `by_status` under the key
   * `"(no status)"`** — the backend counts them in both — so rendering this
   * beside that map shows the same number twice.
   */
  no_status: number;
  by_status: Record<string, number>;
  next_deadline: string | null;
}

export interface ScopeOut {
  team_slug: string;
  team_name: string;
  member_count: number;
  matched_in_sharepoint: number;
  members_without_sharepoint: string[];
}

export interface ExcludedOut {
  rows: number;
  people: number;
  names: string[];
}

/**
 * How much of a person's workload is actually live.
 *
 * Everything needed is on the row already, split four ways by deadline:
 * `overdue` (bid closing date passed), `due_soon`, `later` and `no_deadline`.
 * `open` is simply all four added up. So the live work — the bid is still
 * open — is the last three, or equivalently `open - overdue`, and that agrees
 * with what the scoring module calls **active** person for person.
 *
 * The distinction matters because on this list most rows are parked, not late:
 * somebody with 60 "open" and 58 "overdue" has two live proposals and a
 * fifty-eight-row archive of closed bids. Reporting the first number, in red,
 * says the opposite of the truth.
 */
export function activeOf(person: PersonWorkloadOut): number {
  return Math.max(0, person.open - person.overdue);
}

export interface WorkloadOut {
  organisation: PersonWorkloadOut;
  people: PersonWorkloadOut[];
  person_count: number;
  soon_days: number;
  generated_at: string;
  row_count?: number | null;
  scope?: ScopeOut | null;
  excluded?: ExcludedOut | null;
  cached?: boolean;
  age_seconds?: number;
  elapsed_ms?: number | null;
  fetch_ms?: number | null;
}

// ── leave ──────────────────────────────────────────────────────────────

export type LeaveType = "annual" | "sick" | "emergency" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequestOut {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  decided_by: string | null;
  decided_by_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  emergency_override: boolean;
  conflicting_count: number | null;
  notified_at: string | null;
  notify_error: string | null;
  created_at: string;
}

export interface LeaveSummaryOut {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  days_approved: number;
  upcoming: {
    id: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
  }[];
}

export interface CalendarPerson {
  user_id: string;
  name: string;
  leave_type: string;
}

export interface CalendarOut {
  start: string;
  end: string;
  /** Only days with somebody off appear. */
  days: Record<string, CalendarPerson[]>;
}

export interface LeaveSettingsOut {
  max_concurrent: number;
  auto_decide: boolean;
  limit_scope: string;
  hr_team_slug: string;
  notify_hr_by_email: boolean;
  max_days_per_request: number;
}

// ── quotes (Zoho Books, read-only) ─────────────────────────────────────

export interface QuoteOut {
  id: string;
  number: string;
  status: string | null;
  sub_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  company_name: string | null;
  date: string | null;
  expiry_date: string | null;
  reference_number: string | null;
  total: number;
  currency_code: string | null;
  bcd: string | null;
  portal: string | null;
  salesperson_name: string | null;
  has_attachment: boolean;
  created_time: string | null;
  last_modified_time: string | null;
  web_url?: string | null;
}

export interface QuoteListOut {
  total: number;
  truncated: boolean;
  quotes: QuoteOut[];
}

export interface LineItemOut {
  item_id: string | null;
  name: string | null;
  description: string | null;
  code: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  discount: number;
  tax_name: string | null;
  total: number;
}

export interface SalesOrderRefOut {
  id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number;
}

export interface DocumentOut {
  id: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  file_size_formatted: string | null;
  uploaded_by: string | null;
  uploaded_on: string | null;
  download_url?: string | null;
}

export interface QuoteDetailOut extends QuoteOut {
  sub_total: number;
  tax_total: number;
  discount_total: number;
  shipping_charge: number;
  adjustment: number;
  notes: string | null;
  terms: string | null;
  billing_address: Record<string, unknown> | null;
  shipping_address: Record<string, unknown> | null;
  line_items: LineItemOut[];
  salesorders: SalesOrderRefOut[];
  documents: DocumentOut[];
  invoice_ids: string[];
  invoiced_amount: number;
  uninvoiced_amount: number;
  estimate_url: string | null;
  custom_fields: Record<string, unknown>;
}

export interface BranchOut<T = unknown> {
  ok: boolean;
  error?: string | null;
  data?: T;
}

export interface RelatedOut {
  quote_id: string;
  quote_number: string;
  included: string[];
  customer?: BranchOut | null;
  items?: BranchOut | null;
  salesorders?: BranchOut | null;
  invoices?: BranchOut | null;
  comments?: BranchOut | null;
}

// ── quote comparison ───────────────────────────────────────────────────

export type ComparisonStatus = "draft" | "saved";
export type QuoteSource = "upload" | "manual";

/** Money arrives as a string so a Decimal survives the trip intact. */
export interface ItemIn {
  description: string;
  part_number?: string | null;
  brand?: string | null;
  unit?: string | null;
  quantity?: string;
  unit_price?: string;
  line_total?: string | null;
  lead_time?: string | null;
}

export interface ItemOut extends ItemIn {
  id: string;
  position: number;
}

export interface QuoteIn {
  supplier_name: string;
  quote_number?: string | null;
  quote_date?: string | null;
  currency?: string;
  fx_rate?: string;
  validity?: string | null;
  delivery_time?: string | null;
  payment_terms?: string | null;
  warranty?: string | null;
  incoterms?: string | null;
  contact?: string | null;
  notes?: string | null;
  discount?: string | null;
  freight?: string | null;
  tax?: string | null;
  quoted_total?: string | null;
  items?: ItemIn[];
  source?: QuoteSource;
  file_name?: string | null;
  extraction_note?: string | null;
}

export interface ComparisonQuoteOut extends Required<Omit<QuoteIn, "items" | "source">> {
  id: string;
  source: string;
  file_type: string | null;
  items: ItemOut[];
  document_url?: string | null;
}

export interface ExtractionFailure {
  file_name: string;
  error: string;
}

export interface ExtractionOut {
  quotes: QuoteIn[];
  failed?: ExtractionFailure[];
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

/**
 * The analysis payload, transcribed from app/comparison/analysis.py. The
 * backend types it as a bare object because it is assembled dict-first.
 */
export interface AnalysisOffer {
  quote_id: string;
  supplier_name: string;
  description: string;
  part_number: string | null;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  lead_time: string | null;
  is_best: boolean;
}

export interface AnalysisGroup {
  label: string;
  note: string | null;
  quoted_by: number;
  supplier_count: number;
  single_source: boolean;
  offers: AnalysisOffer[];
  best: {
    quote_id: string;
    supplier_name: string;
    unit_price: number | null;
    line_total: number | null;
  } | null;
  spread_pct: number | null;
}

export interface AnalysisSupplier {
  quote_id: string;
  supplier_name: string;
  currency: string;
  fx_rate: number;
  converted: boolean;
  line_count: number;
  items_total: number | null;
  discount: number | null;
  freight: number | null;
  tax: number | null;
  total: number | null;
  quoted_total: number | null;
  total_mismatch: number | null;
  delivery_time: string | null;
  payment_terms: string | null;
  validity: string | null;
  warranty: string | null;
  incoterms: string | null;
  extraction_note: string | null;
  items_quoted: number;
  missing_items: string[];
}

export interface Analysis {
  currency: string;
  generated_at: string;
  supplier_count: number;
  item_count: number;
  suppliers: AnalysisSupplier[];
  groups: AnalysisGroup[];
  cheapest_supplier: AnalysisSupplier | null;
  all_suppliers_complete: boolean;
  split_award: {
    total: number | null;
    by_supplier: Record<string, number | null>;
    supplier_count: number;
    saving: { amount: number | null; pct: number; against: string } | null;
  };
  insights: { kind: string; severity: "info" | "warning"; message: string }[];
}

export interface AnalysisOut {
  currency: string;
  analysis: Analysis;
}

export interface ComparisonSummaryOut {
  id: string;
  title: string;
  reference: string | null;
  currency: string;
  status: ComparisonStatus;
  created_by_name: string | null;
  created_at: string;
  supplier_count: number;
  item_count: number;
  best_total: string | null;
  best_supplier: string | null;
}

export interface ComparisonOut {
  id: string;
  title: string;
  reference: string | null;
  notes: string | null;
  currency: string;
  status: ComparisonStatus;
  created_by_id: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  analysed_at: string | null;
  analysis: Analysis | null;
  quotes: ComparisonQuoteOut[];
}

// ── labels ─────────────────────────────────────────────────────────────

export type LabelKind = "category" | "status" | "skill";
/** "derived" labels are computed at read time, never assigned by hand. */
export type LabelSource = "manual" | "derived";

export interface LabelOut {
  id: string;
  key: string;
  name: string;
  kind: LabelKind;
  color: string | null;
  description: string | null;
  is_system: boolean;
  /** Null for an organisation-wide label; set for one scoped to a team. */
  team_id: string | null;
  derived?: boolean;
}

export interface LabelIn {
  key: string;
  name: string;
  kind: LabelKind;
  description?: string | null;
  color?: string | null;
}

export interface HeldLabelOut {
  key: string;
  name: string;
  kind: LabelKind;
  source: LabelSource;
  expires_at?: string | null;
  /** Why a derived label applies — the leave dates, the joining date. */
  reason?: string | null;
}

export interface PersonLabelsOut {
  user_id: string;
  display_name: string;
  email: string;
  joined_on: string | null;
  labels: HeldLabelOut[];
}

export interface AssignLabelIn {
  user_id: string;
  label_key: string;
  team_id?: string | null;
  expires_at?: string | null;
  note?: string | null;
}

export interface JoinedOnIn {
  joined_on: string | null;
}

/** From /labels/suggested — the shipped labels and the capacities they imply. */
export interface SuggestedLabel {
  key: string;
  name: string;
  kind: LabelKind;
  description: string;
  color: string | null;
  capacity: number | null;
  derived: boolean;
}

// ── assignment policy ──────────────────────────────────────────────────

export interface PolicyOut {
  id: string;
  /** Null on the organisation-wide default. */
  team_id: string | null;
  team_name?: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  /** Decimals arrive as strings so they survive the trip intact. */
  default_capacity: string;
  capacity_by_label: Record<string, string>;
  default_max_open: number | null;
  max_open_by_label: Record<string, number>;
  excluded_labels: string[];
  /** Roles whose holders are never scored — managers run the queue rather
      than stand in it. Defaults to manager and team_manager. */
  excluded_roles: string[];
  exclude_on_leave: boolean;
  new_joiner_days: number;
  /** Fall back to first-seen when a joining date is missing. Off by default:
      with few dates set, everybody collapses to the new-joiner capacity and
      the ratio stops distinguishing anyone. */
  new_joiner_from_first_seen: boolean;
  weight_load: string;
  weight_open_count: string;
  weight_idle_days: string;
  updated_at: string;
  updated_by_name?: string | null;
  /** Computed per viewer by the backend's reach rule. */
  may_edit?: boolean;
  edit_reason?: string | null;
}

export interface PolicyIn {
  name?: string | null;
  description?: string | null;
  enabled?: boolean | null;
  default_capacity?: string | null;
  capacity_by_label?: Record<string, string> | null;
  default_max_open?: number | null;
  max_open_by_label?: Record<string, number> | null;
  excluded_labels?: string[] | null;
  excluded_roles?: string[] | null;
  exclude_on_leave?: boolean | null;
  new_joiner_days?: number | null;
  new_joiner_from_first_seen?: boolean | null;
  weight_load?: string | null;
  weight_open_count?: string | null;
  weight_idle_days?: string | null;
}

export interface EffectOut {
  user_id: string;
  display_name: string;
  labels: string[];
  capacity: string;
  /** The multiplier said in words — "1 task for every 2". */
  ratio: string;
  max_open: number | null;
  excluded: boolean;
  excluded_reason: string | null;
}

export interface PolicyPreviewOut {
  policy_id: string;
  /**
   * True when the team has no policy of its own and the default governs.
   * Worth saying out loud on screen: an inherited preview changes the moment
   * somebody edits the default.
   */
  inherited: boolean;
  team_id: string | null;
  people: EffectOut[];
  assignable: number;
}

// ── quote requests ─────────────────────────────────────────────────────

/**
 * Where a quote is in its approval loop.
 *
 * `rework` is not a status: an approver sending one back puts it in
 * `changes_requested`, the requester edits and submits again, and the revision
 * number goes up. So a quote can pass through the same status more than once,
 * and `revision` is what tells two passes apart.
 */
export type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "in_negotiation"
  | "created_in_zoho";

/** The three a requester can edit in. Everything else is locked, deliberately. */
export const EDITABLE_STATUSES: readonly QuoteStatus[] = [
  "draft",
  "changes_requested",
  "in_negotiation",
];

/**
 * `negotiate` is not a decision an approver makes on the review form — it is
 * what the requester records when the customer comes back on an already
 * approved quote. It appears here because it lands in the same review history.
 */
export type ReviewAction = "approve" | "reject" | "rework" | "comment" | "negotiate";

/** What a comment is attached to. `target_ref` names which one. */
export type CommentTarget = "quote" | "field" | "item" | "supplier_quote";

export interface QuoteLineOut {
  id: string;
  position: number;
  name: string;
  description: string | null;
  item_code: string | null;
  brand: string | null;
  unit: string | null;
  quantity: string;
  rate: string;
  discount: string;
  tax_name: string | null;
  tax_percentage: string | null;
  /** What it costs us. Null when no supplier quote is behind the line. */
  cost_rate: string | null;
  /**
   * What this line makes, in the quote's currency — quantity times the gap
   * between `rate` and `cost_rate`. An amount, not a percentage. Null when no
   * supplier cost sits behind the line.
   */
  margin: string | null;
  line_total: string;
  source_supplier_quote_id: string | null;
}

export interface QuoteLineIn {
  name: string;
  description?: string | null;
  item_code?: string | null;
  brand?: string | null;
  unit?: string | null;
  quantity: number | string;
  rate: number | string;
  discount?: number | string;
  tax_name?: string | null;
  tax_percentage?: number | string | null;
  cost_rate?: number | string | null;
  source_supplier_quote_id?: string | null;
}

/**
 * A line as the editor holds it.
 *
 * Distinct from `QuoteLineOut` on two points that matter. `key` is stable
 * across a reorder and exists for rows that the server has never seen, so
 * React and the dirty-tracking have something to hold on to that `id` cannot
 * provide. And `line_total` / `margin` are nullable: they are the server's
 * numbers, and a row that has just been typed does not have them yet.
 *
 * Every value stays the string the user typed. Converting to a number to
 * "normalise" it here would round the exact decimal the server is expecting.
 */
export interface QuoteLineDraft {
  key: string;
  /** Null for a row added here that has never been saved. */
  id: string | null;
  name: string;
  description: string | null;
  item_code: string | null;
  brand: string | null;
  unit: string | null;
  quantity: string;
  rate: string;
  discount: string;
  tax_name: string | null;
  tax_percentage: string | null;
  cost_rate: string | null;
  source_supplier_quote_id: string | null;
  line_total: string | null;
  margin: string | null;
}

/** Server line to editable row. */
export function toDraft(line: QuoteLineOut): QuoteLineDraft {
  return {
    key: line.id,
    id: line.id,
    name: line.name,
    description: line.description,
    item_code: line.item_code,
    brand: line.brand,
    unit: line.unit,
    quantity: line.quantity,
    rate: line.rate,
    discount: line.discount,
    tax_name: line.tax_name,
    tax_percentage: line.tax_percentage,
    cost_rate: line.cost_rate,
    source_supplier_quote_id: line.source_supplier_quote_id,
    line_total: line.line_total,
    margin: line.margin,
  };
}

/**
 * Editable row to request body.
 *
 * Blank numerics become the server's own defaults rather than being sent as
 * empty strings, which it rejects. Everything else goes as typed — no parsing,
 * so an exact decimal survives the round trip unchanged.
 */
export function toLineIn(line: QuoteLineDraft): QuoteLineIn {
  const orZero = (v: string) => (v.trim() === "" ? "0" : v.trim());
  return {
    name: line.name.trim(),
    description: line.description,
    item_code: line.item_code,
    brand: line.brand,
    unit: line.unit,
    quantity: line.quantity.trim() === "" ? "1" : line.quantity.trim(),
    rate: orZero(line.rate),
    discount: orZero(line.discount),
    tax_name: line.tax_name,
    tax_percentage:
      line.tax_percentage === null || line.tax_percentage.trim() === ""
        ? null
        : line.tax_percentage.trim(),
    cost_rate:
      line.cost_rate === null || line.cost_rate.trim() === "" ? null : line.cost_rate.trim(),
    source_supplier_quote_id: line.source_supplier_quote_id,
  };
}

export interface QuoteReviewOut {
  id: string;
  action: ReviewAction;
  note: string | null;
  /** Which pass this decision was made on. */
  revision: number;
  reviewer_name: string | null;
  selected_supplier_quote_id: string | null;
  created_at: string;
}

export interface QuoteCommentOut {
  id: string;
  target_type: CommentTarget;
  target_ref: string | null;
  body: string;
  revision: number;
  author_name: string | null;
  created_at: string;
  resolved_at: string | null;
  is_open: boolean;
}

export interface QuoteRequestSummaryOut {
  id: string;
  reference: string | null;
  title: string;
  customer_name: string;
  status: QuoteStatus;
  revision: number;
  currency: string;
  total: string;
  win_probability: string | null;
  multiple_supplier_quotes: boolean;
  created_by_name: string | null;
  assigned_to_name: string | null;
  open_comments: number;
  created_at: string;
}

export interface QuoteRequestOut {
  id: string;
  reference: string | null;
  title: string;
  status: QuoteStatus;
  revision: number;

  customer_name: string;
  customer_id: string | null;
  contact_person: string | null;
  reference_number: string | null;
  quote_date: string | null;
  expiry_date: string | null;
  currency: string;
  salesperson_name: string | null;
  place_of_supply: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  cf_bcd: string | null;
  cf_portal: string | null;
  subject: string | null;
  notes: string | null;
  terms: string | null;

  discount: string;
  shipping_charge: string;
  adjustment: string;
  sub_total: string;
  total: string;

  multiple_supplier_quotes: boolean;
  /** Set once supplier quotes are attached — they are compared as a unit. */
  comparison_id: string | null;
  selected_supplier_quote_id: string | null;
  /** Estimated from past outcomes. `win_basis` says what fed the estimate. */
  win_probability: string | null;
  win_basis: Record<string, unknown> | null;

  team_id: string;
  team_name: string | null;
  created_by_name: string | null;
  assigned_to_name: string | null;
  submitted_at: string | null;
  decided_at: string | null;

  /**
   * When the approvers were emailed that this is waiting, and why that failed.
   *
   * These two decide whether "pending approval" means anybody actually knows.
   * Submitting succeeds even when the mail does not, so a quote can sit in the
   * approvers' queue with nothing having told them it is there — which looks
   * identical, to the person who submitted it, to an approver ignoring them.
   * Both fields exist to be shown; see the workspace screen.
   */
  approvers_notified_at: string | null;
  notify_error: string | null;

  /** The SharePoint enquiry this was raised from, when it came from one. */
  source_task_id: string | null;
  source_task_url: string | null;
  created_at: string;
  updated_at: string;

  items: QuoteLineOut[];
  reviews: QuoteReviewOut[];
  comments: QuoteCommentOut[];
  /**
   * The supplier comparison, inline. Same analysis the comparison module
   * builds, carried on the quote so the picking happens here rather than on a
   * screen the user has to come back from.
   */
  comparison: QuoteComparison | null;
  /** Finished rounds, oldest first. The current pass is not in here. */
  revisions: QuoteRevisionOut[];

  /**
   * The backend's own answer to "may this person do that", rather than the
   * frontend re-deriving it from roles. The `_reason` fields are why not, and
   * are written to be shown: `submit_reason` says what is still missing, so
   * nobody has to press a disabled button to find out.
   */
  may_edit: boolean;
  may_submit: boolean;
  submit_reason: string | null;
  may_approve: boolean;
  approve_reason: string | null;
}

/**
 * A finished round.
 *
 * Kept whole rather than as a diff because a negotiation is read, not
 * replayed: the reviewer wants to see what was agreed last time beside what is
 * being asked for now, and that means both rounds have to stand on their own.
 */
export interface QuoteRevisionOut {
  /** The pass number. Unique within a quote, and its identity — there is no id. */
  revision: number;
  outcome: "approve" | "reject" | "rework" | "superseded" | (string & {});
  /**
   * The whole round as the backend serialised it.
   *
   * Typed as a bare `object` on the wire, so nothing in here is guaranteed.
   * `readRound` in components/quotes/History.tsx is the one place that reads
   * it, and it treats every key as optional — do not reach into this shape
   * directly from a component.
   */
  snapshot: Record<string, unknown>;
  created_at: string;
}

/**
 * The comparison as it arrives on a quote.
 *
 * `suppliers` and `groups` are the comparison module's own shapes — this is
 * that analysis, not a second copy of it — plus the supplier-quote ids the
 * quote needs in order to price itself from one of them.
 */
export interface QuoteComparison extends Analysis {
  /** Set when a supplier has already been chosen for this round. */
  selected_supplier_quote_id?: string | null;
}

/** POST /{id}/select-supplier. `SupplierChoiceIn` on the wire. */
export interface SupplierChoiceIn {
  supplier_quote_id: string;
  /** Percent added to each supplier cost to get the sell rate. */
  markup_percent: number | string;
}

/** POST /{id}/negotiate. `NegotiationIn` on the wire. */
export interface NegotiationIn {
  /** What the customer is asking for. The API requires it. */
  note: string;
}

/**
 * A file that could not be read.
 *
 * The upload endpoint takes up to twelve at once and keeps the ones that
 * worked, so a failure is partial by design and the names have to survive to
 * the screen — "3 files failed" is not something anyone can act on.
 */
export interface SupplierQuoteFailure {
  file_name: string;
  error: string;
}

export interface QuoteRequestIn {
  title: string;
  customer_name: string;
  customer_id?: string | null;
  contact_person?: string | null;
  reference?: string | null;
  reference_number?: string | null;
  quote_date?: string | null;
  expiry_date?: string | null;
  currency?: string;
  salesperson_name?: string | null;
  place_of_supply?: string | null;
  payment_terms?: string | null;
  delivery_terms?: string | null;
  cf_bcd?: string | null;
  cf_portal?: string | null;
  subject?: string | null;
  notes?: string | null;
  terms?: string | null;
  discount?: number | string;
  shipping_charge?: number | string;
  adjustment?: number | string;
  multiple_supplier_quotes?: boolean;
  items?: QuoteLineIn[];
}

// ── form templates ─────────────────────────────────────────────────────

export type TemplateStatus = "draft" | "active" | "archived";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "checkbox"
  | "select"
  | "table"
  | "file";

export interface TemplateFieldOut {
  key: string;
  label: string;
  type: FieldType;
  section: string | null;
  required: boolean;
  help: string | null;
  /** For `select`. */
  options: string[] | null;
  default: unknown;
  /** The field on the real record this one fills in, when it maps to one. */
  maps_to: string | null;
  /** For `table`: the columns each row has. */
  columns: TemplateFieldOut[] | null;
}

export interface TemplateSectionOut {
  key: string;
  name: string;
  help: string | null;
}

export interface TemplateGrantOut {
  /** Null means every team. */
  team_id: string | null;
  team_name: string | null;
  allowed_roles: string[];
  note: string | null;
}

export interface TemplateSummaryOut {
  id: string;
  key: string;
  name: string;
  kind: string;
  status: TemplateStatus;
  version: number;
  field_count: number;
  grant_count: number;
  description: string | null;
}

export interface TemplateOut {
  id: string;
  key: string;
  name: string;
  kind: string;
  description: string | null;
  status: TemplateStatus;
  version: number;
  sections: TemplateSectionOut[];
  fields: TemplateFieldOut[];
  created_by_name: string | null;
  grants: TemplateGrantOut[];
  /** Whether the caller may fill this in, and why not when they may not. */
  may_use: boolean;
  use_reason: string | null;
  may_edit: boolean;
}

// ── analytics: the assignment ranking ──────────────────────────────────

/**
 * One factor's contribution to a person's score.
 *
 * `normalised` is 0..1 across the candidates in this run, where 1 always means
 * "most deserving of the next task" — so a low raw load and a long wait both
 * normalise towards 1. A factor everybody ties on contributes 1.0 to all of
 * them rather than 0, since a tie is not evidence.
 */
export interface FactorOut {
  raw: number;
  normalised: number;
  weight: number;
  contribution: number;
}

/** The three factors the scoring balances, in the order they are explained. */
export const FACTOR_KEYS = [
  "load_vs_capacity",
  "open_task_count",
  "days_since_last_assign",
] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export interface EntryOut {
  user_id: string | null;
  display_name: string;
  email: string | null;
  sharepoint_lookup_id: string | null;
  total_tasks: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  due_soon_tasks: number;
  no_status_tasks: number;
  /** Never given a status and the bid closed — read as finished. */
  expired_tasks: number;
  /** Not finished, but the bid closed. Counted, but not current workload. */
  bid_closed_tasks: number;
  /**
   * Not finished and the bid is still open. **This is what the score is built
   * on** — `effective_load` divides it by capacity, and the `open_task_count`
   * factor counts it. `open_tasks` is the broader number and no longer the one
   * the ranking reasons about.
   */
  active_tasks: number;
  last_assigned_on: string | null;
  days_since_last_assign: number | null;
  labels: string[];
  capacity: string;
  effective_load: string;
  max_open: number | null;
  excluded: boolean;
  excluded_reason: string | null;
  /** Rank, 1 = next up. Null for anyone excluded from the pool. */
  priority_score: number | null;
  weighted_score: string | null;
  /** The three weighted contributions added up, before ranking. */
  factor_total: string | null;
  factors: Partial<Record<FactorKey, FactorOut>>;
}

export interface RunOut {
  id: string;
  team_id: string | null;
  team_name: string | null;
  /** The policy as it stood, frozen so a later edit cannot rewrite history. */
  policy_snapshot: Record<string, unknown>;
  source: string;
  rows_read: number;
  excluded_note: string | null;
  saved: boolean;
  notes: string | null;
  created_at: string;
  created_by_name?: string | null;
  entries: EntryOut[];
  next_up?: string | null;
  assignable?: number;
}

export interface RunSummaryOut {
  id: string;
  team_name: string | null;
  rows_read: number;
  people: number;
  assignable: number;
  next_up: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
}

export interface RunIn {
  notes?: string | null;
}
