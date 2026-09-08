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
  /** Whether the item has files at all — cheap, and present on every row. */
  has_attachments: boolean;
  /**
   * Straight to SharePoint's attachment folder, or null when empty.
   *
   * Opening it uses the **viewer's own** SharePoint access rather than the
   * app's service identity, which is what makes it the honest fallback for
   * somebody the task is not assigned to: `/proposals/tasks/{id}/attachments`
   * answers 404 for them by design, but this link still works if SharePoint
   * itself knows them.
   */
  attachments_url: string | null;
  is_open: boolean;
  deadline: string | null;
}

/**
 * One file on a proposal task.
 *
 * `download_url` is absolute and points at **Hamdaz**, not SharePoint, so the
 * ERP session authorises the fetch and no SharePoint token is ever handed to a
 * browser. Use it as-is rather than rebuilding it from the file name.
 */
export interface TaskAttachmentOut {
  file_name: string;
  download_url: string;
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

/**
 * One team member's proposal rows, as their lead sees them.
 *
 * The identity here is the ERP user, not the name on the SharePoint row. The
 * join ran that way round — this team's members were looked up in SharePoint,
 * rather than rows being attributed to whoever they happen to name — which is
 * what makes the people in a {@link TeamTasksOut} exactly the team and nobody
 * else. So `name` and `email` are safe to key on; `task.assigned_to_name` is
 * still only a display name and still must not be.
 */
export interface MemberTasksOut {
  user_id: string;
  name: string;
  email: string;
  /** Roles held *inside this team*, so a lead reads differently to a member. */
  role_keys: string[];
  sharepoint_user_id: string | null;
  /**
   * False when they have no presence on the SharePoint site at all. Different
   * from having nothing assigned, and it needs saying differently: one is
   * "they are clear", the other is "nothing could ever reach them here".
   */
  in_sharepoint: boolean;
  /** Everything assigned to them, before `open_only`. */
  total: number;
  /** Not finished, whatever the deadline — mostly bids that closed long ago. */
  open_count: number;
  /**
   * Not finished **and** the bid is still open. The number to lead with, and
   * the same quantity {@link activeOf} derives for the workload aggregate.
   */
  active_count: number;
  /** Live rows whose deadline falls inside the `soon_days` horizon. */
  due_soon_count: number;
  /** The nearest deadline still ahead of them; past ones are not "next". */
  next_deadline: string | null;
  tasks: TaskOut[];
}

/**
 * A whole team's proposal work, member by member, with the rows attached.
 *
 * The counterpart to {@link WorkloadOut}, and the reason there are two: the
 * workload aggregate is admin-only and carries counts alone, while this is
 * open to the team's own lead and carries the rows behind those counts. A
 * lead being shown a number they cannot open was the gap this closes.
 */
export interface TeamTasksOut {
  scope: ScopeOut;
  soon_days: number;
  generated_at: string;
  member_count: number;
  /** Summed from `members` server-side, so header and list cannot disagree. */
  total: number;
  open_count: number;
  active_count: number;
  /** Busiest first, on live work rather than on the archive. Do not re-sort. */
  members: MemberTasksOut[];
  cached: boolean;
  age_seconds: number;
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

/* ══════════════════════════════════════════════════════════════════════
 * HR — hiring, employee documents and performance reviews
 *
 * Appended as its own section rather than woven in: the module landed whole,
 * and keeping it in one block is what makes it obvious which shapes came from
 * `app/hr/schemas.py` when the backend changes them.
 * ════════════════════════════════════════════════════════════════════ */

// ── HR: the enumerations ───────────────────────────────────────────────
//
// Every one of these is a StrEnum on the backend and arrives as its value, so
// they are unions of literals rather than `string`. `/hr/meta` returns the same
// lists at runtime; the unions are what make a typo a compile error, and the
// meta call is what a picker should actually iterate so a value added on the
// backend appears in the UI without a deploy here.
//
// Names carry an `Hr` prefix throughout. Not the house convention of mirroring
// the backend class name, but `DocumentOut` and `ReviewAction` were already
// taken by the Zoho and proposals sections of this file, and two different
// `DocumentOut`s is a worse problem than a prefix.

export type HrOpeningStatus = "draft" | "open" | "closed" | "filled";

export type HrEmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "temporary";

export type HrApplicationStage =
  | "new"
  | "shortlisted"
  | "interviewed"
  | "offered"
  | "hired"
  | "rejected"
  /** They pulled out. Kept apart from rejected — it matters if they reapply. */
  | "withdrawn";

export type HrDocumentKind =
  | "offer_letter"
  | "contract"
  | "amendment"
  | "id_document"
  | "visa"
  | "certificate"
  | "payslip"
  | "appraisal"
  | "warning"
  | "resignation"
  | "other";

export type HrCycleStatus = "draft" | "open" | "closed";

export type HrReviewStatus = "pending" | "draft" | "submitted" | "declined";

/** How the reviewer knows the subject. Context only — never a permission. */
export type HrReviewerRelation = "self" | "manager" | "peer" | "report" | "hr" | "other";

// ── HR: scoring ────────────────────────────────────────────────────────

/**
 * One tag's slice of a score, as `app.forms.scoring.TagScore.as_dict` writes it.
 *
 * Tags are the point of the whole scoring apparatus: one percentage says
 * somebody scored 71%, the tags say they are strong technically and weak on
 * delivery. A field feeds every tag it lists at full weight, so the tag
 * maximums deliberately do not add up to the overall maximum — totalling them
 * would double-count every question that carries two tags.
 */
export interface HrTagScore {
  tag: string;
  points: number;
  max: number;
  /** Scorable fields carrying this tag that were actually answered. */
  answered: number;
  /** Null when nothing scorable was answered — not zero, which reads as "bad". */
  percent: number | null;
}

/** `app.forms.scoring.Score.as_dict`. All zeros when the form scores nothing. */
export interface HrScore {
  points: number;
  max: number;
  percent: number | null;
  answered: number;
  /** Scorable fields left blank. A near-empty review should look near-empty. */
  skipped: number;
  tags: HrTagScore[];
}

/** What `/hr/meta` says about one of the two forms the module depends on. */
/** One template HR may choose between, as `/hr/meta` lists it. */
export interface HrMetaForm {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  field_count: number;
  /** Every scoring tag the template mentions, in template order. */
  tags: string[];
  is_default: boolean;
}

/**
 * Every active template of one kind, and which of them is the fallback.
 *
 * There is deliberately no single "the form". A super admin can ship a short
 * application beside a technical one, and collapsing them to one would hide
 * the variants they went to the trouble of writing — so HR chooses, per
 * opening and per review cycle.
 *
 * `default_id` is what the backend uses when a request names no template. It
 * is **not** "the newest": the convention is the template whose key equals its
 * kind, which makes the fallback a decision rather than whichever happened to
 * be saved last and changed under HR without anybody choosing.
 */
export interface HrMetaForms {
  default_id: string | null;
  templates: HrMetaForm[];
}

/**
 * `GET /hr/meta` — any signed-in user.
 *
 * A form list being **empty** is the case worth surfacing loudly: without a
 * job application form there is nothing to post an opening against, and
 * finding that out at the moment somebody clicks "post" is finding out too
 * late.
 */
export interface HrMetaOut {
  document_kinds: HrDocumentKind[];
  employment_types: HrEmploymentType[];
  application_stages: HrApplicationStage[];
  opening_statuses: HrOpeningStatus[];
  reviewer_relations: HrReviewerRelation[];
  /** The advert HR fills in. Empty until a super admin ships a posting form. */
  posting_forms: HrMetaForms;
  /** What a candidate fills in on an opening's share link. */
  application_forms: HrMetaForms;
  /** What a nominated reviewer fills in for a cycle. */
  review_forms: HrMetaForms;
}

/**
 * What a deletion destroyed.
 *
 * The HR deletes answer with this rather than a bare 204, because the blast
 * radius is not obvious from the thing you clicked: removing one opening takes
 * every application to it and every CV with it. `summary` is the backend's own
 * sentence — show that rather than assembling one here, so the confirmation a
 * super admin reads is the server's account of what it actually did.
 */
export interface HrRemovedOut {
  openings: number;
  applications: number;
  files: number;
  documents: number;
  cycles: number;
  reviews: number;
  summary: string;
}

// ── HR: job openings ───────────────────────────────────────────────────

/** A row of `GET /hr/openings`. Deliberately lighter than `HrOpeningOut`. */
export interface HrOpeningSummaryOut {
  id: string;
  title: string;
  slug: string;
  status: HrOpeningStatus;
  department: string | null;
  location: string | null;
  employment_type: HrEmploymentType;
  publicly_listed: boolean;
  posted_at: string | null;
  closes_on: string | null;
  application_count: number;
  new_application_count: number;
}

export interface HrOpeningOut {
  id: string;
  title: string;
  /** The internal handle. Explicitly *not* the public link — see `share_url`. */
  slug: string;
  reference: string | null;
  team_id: string | null;
  team_name: string | null;
  department: string | null;
  location: string | null;
  employment_type: HrEmploymentType;
  headcount: number;
  salary_range: string | null;
  summary: string | null;
  description: string | null;
  requirements: string | null;

  /** The application form candidates fill in. Always set. */
  template_id: string;
  template_name: string | null;
  template_version: number;

  /**
   * The advert itself, as a form rather than as columns.
   *
   * A posting template is assigned automatically when one is active, so this
   * is normally set even though HR never named it. That matters at posting
   * time: `POST /openings/{ref}/post` validates `details` against this
   * template with required fields enforced, so an opening whose posting form
   * is half-filled is a draft that cannot go out. It is the one place the
   * module fails late rather than early, which is why the create and edit
   * screens render these fields rather than trusting the columns above.
   */
  posting_template_id: string | null;
  posting_template_name: string | null;
  posting_template_version: number;
  /** Answers to the posting form, keyed by field. */
  details: Record<string, unknown>;
  /** The posting form's own shape, so the screen renders it without a second call. */
  posting_fields: TemplateFieldOut[];
  posting_sections: TemplateSectionOut[];

  status: HrOpeningStatus;
  /** Whether it appears on the organisation's public careers list at all. */
  publicly_listed: boolean;
  /** Whether the backend serves a ready-made application page for the link. */
  hosted_form: boolean;
  /** Computed on the row: posted, not closed, and not past `closes_on`. */
  accepts_applications: boolean;
  posted_at: string | null;
  closes_on: string | null;
  closed_at: string | null;
  created_by_name: string | null;
  created_at: string;

  /**
   * The link HR copies for candidates, built around an unguessable token.
   * Null while the opening is a draft — a link to a draft goes nowhere, so
   * there is nothing to show, and showing one invites it being sent anyway.
   */
  share_url: string | null;
  /** The same token as JSON, for an organisation with its own careers site. */
  share_api_url: string | null;

  application_count: number;
  /** Applications still at stage `new`. The "nobody has looked yet" count. */
  new_application_count: number;
}

/** `POST /hr/openings`. Everything but the title has a backend default. */
export interface HrOpeningIn {
  title: string;
  /** The application form. Unset uses `application_forms.default_id`. */
  template_id?: string | null;
  /** The advert's own form. Unset uses `posting_forms.default_id`. */
  posting_template_id?: string | null;
  /**
   * Answers to the posting form. Required fields are enforced when the opening
   * is **posted**, not while it is a draft — so this may be partial here and
   * still has to be complete before the advert can go out.
   */
  details?: Record<string, unknown> | null;
  reference?: string | null;
  team_id?: string | null;
  department?: string | null;
  location?: string | null;
  employment_type?: HrEmploymentType;
  headcount?: number;
  salary_range?: string | null;
  summary?: string | null;
  description?: string | null;
  requirements?: string | null;
  closes_on?: string | null;
  publicly_listed?: boolean;
  hosted_form?: boolean;
}

/** `PATCH /hr/openings/{ref}`. Anything left out is untouched. */
export type HrOpeningUpdateIn = Partial<HrOpeningIn>;

// ── HR: applications ───────────────────────────────────────────────────

export interface HrAttachmentOut {
  id: string;
  /** Which form field the candidate attached it to. Null for a stray file. */
  field_key: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
}

export interface HrApplicationOut {
  id: string;
  opening_id: string;
  opening_title: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  /** Keyed by template field key. `template_version` says which keys those are. */
  answers: Record<string, unknown>;
  /** The template version the candidate actually filled in, frozen on submit. */
  template_version: number;
  /** Frozen at submission too, so editing the template cannot rewrite a score. */
  score: HrScore;
  /**
   * A decimal *string*, not a number — it is a Pydantic `Decimal` on the wire.
   * `score.percent` is the same figure as a float, and is the one to compare
   * against; this one is for display.
   */
  score_percent: string | null;
  stage: HrApplicationStage;
  stage_note: string | null;
  /** HR's own notes. The candidate has no route back, so nobody else sees them. */
  internal_notes: string | null;
  submitted_at: string;
  /** Set by *any* stage move, not only by a hire or a rejection. */
  decided_at: string | null;
  decided_by_name: string | null;
  /** The employee record they became, once hired and once they have signed in. */
  hired_user_id: string | null;
  attachments: HrAttachmentOut[];
}

export interface HrStageIn {
  stage: HrApplicationStage;
  note?: string | null;
}

export interface HrHireIn {
  /** A local Hamdaz user id. One exists only after a first Microsoft sign-in. */
  user_id: string;
  close_opening?: boolean;
}

// ── HR: employee documents ─────────────────────────────────────────────

export interface HrDocumentOut {
  id: string;
  user_id: string;
  user_name: string | null;
  /** A label, not a schema — every kind is stored identically. */
  kind: HrDocumentKind;
  title: string;
  note: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  issued_on: string | null;
  expires_on: string | null;
  /** Computed per request, not stored — a stored flag would go stale nightly. */
  expired: boolean;
  /**
   * Whether the person it is about may read it. False is the interesting case:
   * they cannot learn the document exists at all, and asking for it by id gets
   * a 404 rather than a 403.
   */
  visible_to_employee: boolean;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface HrDocumentUpdateIn {
  kind?: HrDocumentKind;
  title?: string;
  note?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  visible_to_employee?: boolean;
}

// ── HR: review cycles ──────────────────────────────────────────────────

export interface HrCycleIn {
  name: string;
  /** Unset uses the newest active performance-review template. */
  template_id?: string | null;
  description?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  due_on?: string | null;
  shared_with_subjects?: boolean;
}

export interface HrCycleOut {
  id: string;
  name: string;
  description: string | null;
  template_id: string;
  template_name: string | null;
  template_version: number;
  period_start: string | null;
  period_end: string | null;
  due_on: string | null;
  status: HrCycleStatus;
  /**
   * Whether subjects may read submitted reviews of themselves. Half of the
   * rule only — a review must also be submitted, so turning this on cannot
   * expose a reviewer's work in progress.
   */
  shared_with_subjects: boolean;
  opened_at: string | null;
  closed_at: string | null;
  created_by_name: string | null;
  created_at: string;

  /** Reviews created in this cycle — nominations, so people are counted twice. */
  nominated: number;
  submitted: number;
  /** Distinct people being reviewed. Always ≤ `nominated`. */
  subjects: number;
}

export interface HrNominateIn {
  subject_id: string;
  reviewer_id: string;
  /** Forced to `self` by the backend when the two ids match. */
  relation?: HrReviewerRelation;
  due_on?: string | null;
}

export interface HrBulkNominateIn {
  /** All or nothing: one bad nomination fails the whole request. */
  nominations: HrNominateIn[];
}

export interface HrReviewOut {
  id: string;
  cycle_id: string;
  cycle_name: string | null;
  subject_id: string;
  subject_name: string | null;
  reviewer_id: string;
  reviewer_name: string | null;
  relation: HrReviewerRelation;
  status: HrReviewStatus;
  /**
   * Null when the caller may not read the content — a different question from
   * whether the review exists. A subject can always see that they are being
   * reviewed and by whom; `answers`, `score`, `score_percent`, `comment` and
   * `declined_reason` all arrive null until the cycle is shared *and* the
   * review is submitted. So null here means "withheld", not "empty".
   */
  answers: Record<string, unknown> | null;
  score: HrScore | null;
  /** A decimal string, not a number. Null when withheld or unscored alike. */
  score_percent: string | null;
  comment: string | null;
  declined_reason: string | null;
  due_on: string | null;
  submitted_at: string | null;
  /**
   * The questions. Sent only by `GET /hr/reviews/{id}`, and only to the
   * nominated reviewer or to HR — every list endpoint leaves both null, so a
   * screen that wants to render the form has to fetch the single review.
   */
  fields: TemplateFieldOut[] | null;
  sections: TemplateSectionOut[] | null;
}

export interface HrReviewAnswersIn {
  answers: Record<string, unknown>;
  comment?: string | null;
  /** False saves a draft; true submits and freezes the score for good. */
  submit?: boolean;
}

/**
 * Somebody's combined score across every *submitted* review of them.
 *
 * Combined by points and maximums rather than by averaging percentages, so a
 * reviewer who answered two questions does not get the same say as one who
 * answered twenty. Not gated on the cycle being shared: a person is entitled
 * to the aggregate about themselves, which is a different thing from reading
 * an individual colleague's words.
 */
export interface HrPerformanceOut {
  user_id: string;
  user_name: string | null;
  reviews: number;
  /** How many of those reviews the person wrote about themselves. */
  self_reviews: number;
  /** Cycle ids as strings, sorted. Not names — the endpoint resolves none. */
  cycles: string[];
  points: number;
  max: number;
  /** Null when nothing scorable was answered anywhere. */
  percent: number | null;
  answered: number;
  skipped: number;
  tags: HrTagScore[];
}

// ── meetings (the caller's own Outlook calendar) ───────────────────────

/**
 * How somebody answered an invitation.
 *
 * `none` and `notResponded` are not the same thing and the calendar means
 * both: `none` is Graph's answer for the organiser and for events with no
 * invitation at all, `notResponded` is a person who was asked and has not
 * said. Rendering them identically loses the only part that needs chasing.
 */
export type MeetingResponse =
  | "none"
  | "organizer"
  | "tentativelyAccepted"
  | "accepted"
  | "declined"
  | "notResponded";

export interface AttendeeOut {
  name: string;
  email: string | null;
  /** required | optional | resource */
  kind: string;
  response: MeetingResponse;
  responded_at: string | null;
  is_organizer: boolean;
  /** A room or equipment rather than a person — listed apart, never counted. */
  is_resource: boolean;
}

/**
 * One row of the calendar listing.
 *
 * Deliberately lighter than {@link MeetingDetailOut}: a week is dozens of
 * events, and shipping every attendee list and body inside the listing makes a
 * payload that is mostly text nobody renders.
 */
export interface MeetingOut {
  /**
   * Graph's event id, and what `GET /meetings/{event_id}` takes.
   *
   * For a recurring meeting this identifies **the occurrence**, not the
   * series — so it is safe as a React key and safe to link to, but it is not
   * stable across a series being edited.
   */
  event_id: string;
  subject: string;
  start: string | null;
  end: string | null;
  is_all_day: boolean;
  is_cancelled: boolean;
  is_organizer: boolean;
  organizer: AttendeeOut | null;
  /** People invited, the organiser included, rooms excluded. */
  attendee_count: number;
  location: string | null;
  is_online: boolean;
  /** Teams (or whichever provider) join link. Null for an in-person meeting. */
  join_url: string | null;
  online_provider: string | null;
  /** The caller's own answer to the invitation. */
  my_response: MeetingResponse;
  show_as: string | null;
  is_recurring: boolean;
  /** Opens the event in Outlook on the web. */
  web_link: string | null;
}

export interface MeetingDetailOut extends MeetingOut {
  body_preview: string | null;
  /** Organiser first, then required, optional, and rooms last. Already sorted. */
  attendees: AttendeeOut[];
  sensitivity: string | null;
  importance: string | null;
  categories: string[];
  /** Set when this is one occurrence of a recurring series. */
  series_master_id: string | null;
  /** singleInstance | occurrence | exception | seriesMaster */
  occurrence_type: string | null;
  last_modified_at: string | null;
}

export interface MeetingPage {
  /** The window actually read, after defaults — echoed back for a caller that sent none. */
  window_start: string;
  window_end: string;
  /** Matches after filtering, before the window is applied. */
  total: number;
  count: number;
  offset: number;
  limit: number;
  meetings: MeetingOut[];
}

// ── the assistant ──────────────────────────────────────────────────────

/**
 * Transcribed from `app/assistant/schemas.py`.
 *
 * Two halves, and the split is the backend's own: the chat is open to any
 * signed-in person and refuses on its own terms, while everything under
 * `/assistant/admin` is **super admin only** — deliberately narrower than the
 * admin role used elsewhere, because deciding what an assistant may do on
 * everybody's behalf is a different question from running a team.
 */

export type ToolKind = "read" | "write";

export interface ToolCapabilityOut {
  key: string;
  label: string;
  kind: ToolKind;
  requires_confirmation: boolean;
}

export interface ModuleCapabilityOut {
  key: string;
  name: string;
  tools: ToolCapabilityOut[];
}

/**
 * Why the assistant is not available, when it is not.
 *
 * Each of these has its own sentence from the backend, written for a person to
 * read — so `reason` is shown verbatim and the code only decides which shape of
 * empty state to draw around it.
 */
export type AdmissionCode =
  | "disabled"
  | "blocked"
  | "not_released"
  | "rate_limited"
  | "cost_cap_user"
  | "cost_cap_total";

/** What the frontend asks before showing the chat at all. */
export interface AssistantStatusOut {
  enabled: boolean;
  admitted: boolean;
  code: AdmissionCode | string | null;
  reason: string | null;
  /** Null unless admitted. */
  model: string | null;
  voice_enabled: boolean;
  /** The configured voice. Null while the voice is switched off. */
  voice: string | null;
  /**
   * Whether a spoken conversation can be opened.
   *
   * Its own switch, separate from `voice_enabled`, because they are different
   * arrangements: read-aloud is this app's loop, and realtime is OpenAI's.
   */
  realtime_enabled: boolean;
  /** What this person's turn would actually be given — drives the suggestions. */
  modules: ModuleCapabilityOut[];
}

export interface ConversationOut {
  id: string;
  title: string | null;
  created_at: string;
  last_message_at: string | null;
}

export interface AssistantMessageOut {
  id: string;
  run_id: string | null;
  seq: number;
  role: string;
  content: string;
  /** One entry per tool the turn used. Null on a turn that used none. */
  tool_calls: { tool_key?: string; ok?: boolean }[] | null;
  created_at: string;
}

/** One write the model asked for that policy says a person must approve. */
export interface PendingActionOut {
  call_id: string;
  tool_key: string;
  label: string;
  arguments: Record<string, unknown>;
  warning: string | null;
}

export interface PendingOut {
  run_id: string;
  actions: PendingActionOut[];
}

export interface ConversationDetailOut extends ConversationOut {
  messages: AssistantMessageOut[];
  /** Set when the last turn stopped to ask before a write. */
  pending: PendingOut | null;
}

export type RunStatus =
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface AssistantRunOut {
  id: string;
  conversation_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  status: RunStatus | string;
  model_key: string;
  reasoning_effort: string;
  started_at: string;
  finished_at: string | null;
  user_text: string;
  answer_text: string | null;
  error: string | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  /** A decimal string — the backend prices in Numeric, so it is never a float. */
  cost_usd: string;
  tool_calls: number;
  rounds: number;
  cancel_requested: boolean;
}

/** Everything the loop did, in order. The audit trail behind one turn. */
export interface RunEventOut {
  seq: number;
  kind: string;
  tool_key: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface RunDetailOut extends AssistantRunOut {
  events: RunEventOut[];
  pending: PendingActionOut[] | null;
}

export interface RunPage {
  runs: AssistantRunOut[];
  total: number;
}

/* ── administration ──────────────────────────────────────────────────── */

export type AudienceMode = "everyone" | "allow_list";

export interface AssistantSettingsOut {
  enabled: boolean;
  model_key: string;
  reasoning_effort: string;
  max_tool_rounds: number;
  max_output_tokens: number;
  history_window: number;
  turns_per_user_per_hour: number;
  /** Decimal strings. Null means no cap. */
  daily_cost_cap_user_usd: string | null;
  daily_cost_cap_total_usd: string | null;
  audience_mode: AudienceMode;
  confirm_writes_default: boolean;
  voice_enabled: boolean;
  /** Whether a spoken conversation may be opened at all. Off by default. */
  realtime_enabled: boolean;
  realtime_model: string;
  /**
   * Whether the assistant may write during a spoken conversation.
   *
   * Its own switch, and off by default, for a stated reason: in the text chat
   * the server parks the run and nothing happens until a person answers, while
   * in a spoken conversation it is the *client* that asks. That is a genuinely
   * weaker guarantee, and an administrator has to accept it deliberately.
   */
  realtime_writes_enabled: boolean;
  /** Only gpt-4o-mini-tts acts on voice_instructions; the tts-1 pair ignore it. */
  voice_model: string;
  voice: string;
  /** How it should sound. Null means the shipped wording is used. */
  voice_instructions: string | null;
  extra_instructions: string | null;
  updated_by_id: string | null;
  updated_at: string;
  /** Whether an OpenAI key is set on the server. Not editable here. */
  openai_configured: boolean;
}

/** Only the fields sent change. Null on a cap removes it. */
export interface AssistantSettingsIn {
  enabled?: boolean;
  model_key?: string;
  reasoning_effort?: string;
  max_tool_rounds?: number;
  max_output_tokens?: number;
  history_window?: number;
  turns_per_user_per_hour?: number;
  daily_cost_cap_user_usd?: string | null;
  daily_cost_cap_total_usd?: string | null;
  audience_mode?: AudienceMode;
  confirm_writes_default?: boolean;
  voice_enabled?: boolean;
  realtime_enabled?: boolean;
  realtime_model?: string;
  realtime_writes_enabled?: boolean;
  voice_model?: string;
  voice?: string;
  /** Null or blank restores the shipped wording rather than removing steering. */
  voice_instructions?: string | null;
  extra_instructions?: string | null;
}

/** One of OpenAI's voices, as offered by GET /assistant/voices. */
export interface VoiceOut {
  key: string;
  /** True for the one currently configured. */
  active: boolean;
}

/** GET /assistant/voices — everything an admin needs to offer a picker. */
export interface VoiceOptionsOut {
  enabled: boolean;
  model: string;
  voice: string;
  /** The steering actually in force, shipped default included. */
  instructions: string;
  /** Longest text POST /assistant/speech will accept in one request. */
  max_chars: number;
  voices: VoiceOut[];
  speech_models: string[];
  /** Served so the admin screen does not keep its own copy of this list. */
  realtime_models: string[];
  realtime_model: string;
}

/** POST /assistant/speech — returns audio/mpeg, not JSON. */
export interface SpeakIn {
  text: string;
  /** Super admin only, for sampling. Others get the configured voice. */
  voice?: string | null;
}

export interface AssistantModelOut {
  key: string;
  name: string;
  description: string;
  /** USD per one million tokens, as decimal strings. */
  input_price: string;
  cached_input_price: string;
  output_price: string;
  enabled: boolean;
  /** The one the settings currently point at. */
  active: boolean;
}

/**
 * A priced voice model — a speech engine, or a spoken-conversation model.
 *
 * Its own list rather than a corner of `AssistantModelOut`, because the two are
 * not billed in the same unit. The chat model is tokens in, tokens out. Speech
 * is charged per *character* of the text handed to it, and a spoken
 * conversation per token with audio dearer than text by an order of magnitude.
 * One shape with one set of price fields could hold both only by calling a
 * character a token, and every figure downstream would then be a guess wearing
 * a decimal point.
 *
 * Prices belonging to the other kind are zero and mean nothing — read `kind`
 * before reading a price.
 */
export interface AssistantVoiceModelOut {
  key: string;
  name: string;
  kind: VoiceKind;
  description: string;
  /** speech: USD per one million characters of text. */
  char_price: string;
  /** realtime: USD per one million tokens, by sort. */
  text_input_price: string;
  cached_text_input_price: string;
  audio_input_price: string;
  cached_audio_input_price: string;
  text_output_price: string;
  audio_output_price: string;
  enabled: boolean;
  /** The one the settings point at, for its kind. */
  active: boolean;
}

/** PATCH /assistant/admin/voice-models/{key}. Prices of the other kind are ignored. */
export interface AssistantVoiceModelIn {
  enabled?: boolean;
  char_price?: string;
  text_input_price?: string;
  cached_text_input_price?: string;
  audio_input_price?: string;
  cached_audio_input_price?: string;
  text_output_price?: string;
  audio_output_price?: string;
}

export type Gate = "open" | "access" | "admin";

export interface ToolPolicyOut {
  tool_key: string;
  label: string;
  kind: ToolKind;
  method: string;
  path: string;
  description: string;
  warning: string | null;
  /**
   * `planned` is a roadmap entry: in the catalogue, offered to nobody.
   *
   * It cannot be reached however the policy rows are set — the resolver builds
   * from the live tools alone — which is the point of the distinction rather
   * than a side effect of it.
   */
  status: "live" | "planned";
  /**
   * Kept out of the prompt until the model searches for it.
   *
   * The full catalogue is tens of kilobytes of JSON schema. Sending all of it
   * would cost tokens on every "hi" and, worse, cost attention: a long list is
   * one the model reads less carefully, and tool choice gets worse as it grows.
   * So the everyday tools are always present and the rest are a search away.
   */
  deferred: boolean;
  enabled: boolean;
  confirm_override: boolean | null;
  allowed_roles: string[] | null;
  /** After the module policy and the global default are folded in. */
  effective_enabled: boolean;
  effective_confirm: boolean;
  effective_roles: string[] | null;
}

export interface ModulePolicyOut {
  module_key: string;
  name: string;
  gate: Gate;
  description: string;
  read_enabled: boolean;
  write_enabled: boolean;
  confirm_writes: boolean | null;
  allowed_roles: string[] | null;
  effective_confirm: boolean;
  tools: ToolPolicyOut[];
}

export type RuleSubject = "user" | "team" | "role";
export type RuleEffect = "allow" | "block";

export interface AccessRuleOut {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  effect: string;
  enabled: boolean;
  note: string | null;
  created_by_id: string | null;
  created_at: string;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  runs: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
}

export interface AssistantAnalyticsTotals {
  runs: number;
  completed: number;
  failed: number;
  blocked: number;
  cancelled: number;
  open: number;
  people: number;
  tool_calls: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  /**
   * What the *runs* cost, and only that.
   *
   * Deliberately unchanged in meaning now that the voice is priced too: a
   * figure that quietly starts including something new is worse than one that
   * is honestly missing a part. `total_cost_usd` is the one to quote.
   */
  cost_usd: string;
  /**
   * What reading answers aloud cost over the same window.
   *
   * Speech only. A spoken conversation is not in here — its cost is already on
   * its run, and therefore already inside `cost_usd` — so read `voice.realtime`
   * for that half rather than adding it on.
   */
  voice_cost_usd: string;
  /** `cost_usd` and `voice_cost_usd` added up. What the assistant cost. */
  total_cost_usd: string;
  confirmations_requested: number;
  confirmations_approved: number;
  confirmations_declined: number;
  refused_by_policy: number;
}

export type VoiceKind = "speech" | "realtime";

/** One row of the voice bill: a kind, a day, a person or a model. */
export interface VoiceBucket {
  key: string;
  label: string;
  /** Clips read aloud, or spoken conversations. */
  uses: number;
  /** Speech only: characters of text handed to the model, which is what it is billed on. */
  characters: number;
  audio_input_tokens: number;
  audio_output_tokens: number;
  text_input_tokens: number;
  text_output_tokens: number;
  /**
   * Realtime only, and only when the browser reported it. Not what the session
   * is billed on — that is the tokens — but the number a person recognises when
   * they ask why the bill looks like that.
   */
  seconds: number;
  cost_usd: string;
}

/**
 * The voice bill, split by kind because the two halves are not alike.
 *
 * `speech` is exact: the backend counts it from the text it was about to send,
 * before the request leaves. `realtime` is what the *browser* reported OpenAI
 * charging at the end of a session — OpenAI runs that loop and bills it
 * directly, so the tokens never pass through the API at all. A conversation
 * that ended in a closed tab is missing from it, which makes the realtime
 * figure a floor rather than a bill, and the screen has to say so.
 */
export interface VoiceAnalyticsOut {
  speech: VoiceBucket;
  realtime: VoiceBucket;
  /** Both halves added up. Not the same as `totals.voice_cost_usd`, which is speech alone. */
  cost_usd: string;
  by_day: VoiceBucket[];
  by_user: VoiceBucket[];
  by_model: VoiceBucket[];
}

export interface AssistantAnalyticsOut {
  since: string;
  until: string;
  totals: AssistantAnalyticsTotals;
  /** What the voice cost over the same window, speech and spoken apart. */
  voice: VoiceAnalyticsOut;
  by_day: AnalyticsBucket[];
  by_user: AnalyticsBucket[];
  /** A person on two teams counts for both, so team rows out-total the whole. */
  by_team: AnalyticsBucket[];
  by_model: AnalyticsBucket[];
  by_tool: AnalyticsBucket[];
}

/** What exists before any policy applies, for the permissions screen. */
export interface CatalogueOut {
  modules: {
    key: string;
    name: string;
    gate: Gate;
    description: string;
    tools: {
      key: string;
      label: string;
      kind: ToolKind;
      method: string;
      path: string;
      description: string;
      warning: string | null;
    }[];
  }[];
}

/* ── the spoken conversation ─────────────────────────────────────────── */

/**
 * Realtime is a different arrangement from reading an answer aloud, and the
 * difference decides how this is typed.
 *
 * Read-aloud is this app's loop: the chat answers in text, then a speech model
 * reads it out. Realtime is **OpenAI's** loop — the browser streams microphone
 * audio straight to them over WebRTC and hears speech back, with no turn of
 * ours in between. That is what makes it feel like a conversation and what
 * makes it the more delicate thing to secure.
 *
 * Two rules keep it inside the same access model as everything else, and both
 * are enforced on the server rather than here:
 *
 * 1. The tool list, the instructions, the model and the voice are **fixed when
 *    the token is minted**. A tampered client cannot add a tool, because the
 *    session it connects to was already furnished.
 * 2. Tools **never execute in the browser**. Every call comes back to
 *    `/assistant/realtime/call`, where policy is resolved again and the call
 *    travels the same route as the text chat with the person's own session.
 */

/** One tool as the browser needs to know it — to name it, not to run it. */
export interface RealtimeToolOut {
  /** The function name the model will use. */
  name: string;
  /** The key to post back, and what the trace displays. */
  tool_key: string;
  label: string;
  kind: ToolKind;
  requires_confirmation: boolean;
  warning: string | null;
}

/** Everything a browser needs to open one spoken conversation. */
export interface RealtimeSessionOut {
  /**
   * The ephemeral client secret. Short-lived and single-purpose: it is worth
   * two minutes and its only job is to open one connection, immediately.
   */
  client_secret: string;
  /** Epoch **seconds**, not milliseconds. Past this the secret opens nothing. */
  expires_at: number;
  model: string;
  voice: string;
  /** The run this conversation is recorded against, and what `end` closes. */
  run_id: string;
  /** What the session was minted with, so the client can render the calls. */
  tools: RealtimeToolOut[];
  writes_enabled: boolean;
}

/**
 * A tool call relayed from the model.
 *
 * The client relays what was asked for; it does not decide what may run. A name
 * that is not on this person's list is refused however convincingly the model
 * asked for it.
 */
export interface RealtimeCallIn {
  run_id: string;
  /** The function name the model used, or the tool key. Either is accepted. */
  name: string;
  arguments: Record<string, unknown>;
  /** Set only after the person has been asked and has said yes. */
  confirmed?: boolean;
}

/**
 * What the browser heard OpenAI report over one spoken conversation.
 *
 * Sent once, as the conversation closes, on the body of
 * `POST /assistant/realtime/session/{run_id}/end`. This is the *only* way a
 * spoken conversation gets a cost at all: OpenAI runs the realtime loop and
 * bills it directly, so the tokens never reach the API — the `response.done`
 * events this browser receives are the sole place those figures exist on our
 * side. The client adds them up over the session and sends the totals.
 *
 * Which makes it a report, not a measurement, and the backend records it as
 * one. Nothing is authorised on the strength of it; it only ever adds to a cost
 * figure. It is also accepted once per run — a retried close, or the same
 * session left open in a second tab, must not bill the conversation twice.
 */
export interface RealtimeUsageIn {
  text_input_tokens: number;
  cached_text_input_tokens: number;
  audio_input_tokens: number;
  cached_audio_input_tokens: number;
  text_output_tokens: number;
  audio_output_tokens: number;
  /** How long it lasted, for the screen. The backend refuses more than a day. */
  seconds: number;
}

export interface RealtimeCallOut {
  ok: boolean;
  status: number;
  /** The tool result as JSON text, to hand back to the model verbatim. */
  output: string;
  /** True when nothing ran because the person has not been asked yet. */
  requires_confirmation: boolean;
  label: string | null;
  warning: string | null;
}

/* ── reports ─────────────────────────────────────────────────────────── */

/**
 * What each team files, and what the reports say together.
 *
 * The shape is worth understanding before the screens are: **the frame is
 * fixed, what hangs in it is not.** Six sections — overview, tasks, issues,
 * remarks, metrics, summary — are code on the backend and the same on every
 * report, so a manager reading four teams on a Monday finds the issues in the
 * same place each time, and a CEO asking "what is blocking us" gets an answer
 * that spans teams. The *questions* inside them are a template a super admin
 * points each team at, and arrive as `fields`.
 *
 * So a screen renders from `sections` (what to draw) plus `fields` (what this
 * team is additionally asked) and needs to know nothing else. Neither is
 * hardcoded here.
 */
export type ReportCadence = "daily" | "weekly" | "monthly" | "ad_hoc";

/** A draft is its author's alone; submitted is read-only and visible to readers. */
export type ReportStatus = "draft" | "submitted";

/**
 * How far along a row is — the author's claim, not SharePoint's.
 *
 * Short and closed on purpose: the value of this field is that it means the
 * same on every report. The Proposals list already has a free-text status, and
 * counting that is what nobody can do.
 */
export type ReportCompletion =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "done"
  | "dropped";

export type IssueSeverity = "low" | "medium" | "high" | "blocked";

/** `prose` is one text box, `rows` a list, `figures` the metric grid. */
export type SectionKind = "prose" | "rows" | "figures";

export interface ReportSectionOut {
  key: string;
  name: string;
  description: string;
  kind: SectionKind;
}

/** One extra question this team is asked, inside one of the six sections. */
export interface ReportFieldOut {
  key: string;
  label: string;
  type: string;
  section: string;
  required: boolean;
  help: string | null;
  options: string[] | null;
}

/**
 * Everything needed to draw the form before a report exists.
 *
 * Served ahead of starting a draft so a page can show what is coming — and so
 * the assistant can tell somebody what it is about to ask them.
 */
export interface ReportFormOut {
  team_id: string;
  team: string;
  cadence: ReportCadence;
  template_id: string;
  template_name: string;
  template_version: number;
  sections: ReportSectionOut[];
  fields: ReportFieldOut[];
  completions: string[];
  period_start: string;
  period_end: string;
  period_label: string;
}

export interface TaskLineOut {
  id: string;
  position: number;
  /** "proposals" for a row pulled from SharePoint, "manual" for a typed one. */
  source: string;
  external_id: string | null;
  title: string;
  /** What SharePoint said, which is a different claim from `completion`. */
  status: string | null;
  completion: string;
  percent_complete: number | null;
  priority: string | null;
  end_user: string | null;
  quote_no: string | null;
  deadline: string | null;
  /** Into SharePoint. Carries no token — opening it uses the reader's access. */
  link: string | null;
  attachments_url: string | null;
  has_attachments: boolean;
  note: string | null;
}

/** A row as it is sent back. Everything but the title has a default. */
export interface TaskLineIn {
  title: string;
  completion?: ReportCompletion;
  source?: "proposals" | "manual";
  external_id?: string | null;
  status?: string | null;
  percent_complete?: number | null;
  priority?: string | null;
  end_user?: string | null;
  quote_no?: string | null;
  deadline?: string | null;
  link?: string | null;
  attachments_url?: string | null;
  has_attachments?: boolean;
  note?: string | null;
}

export interface IssueOut {
  id: string;
  position: number;
  title: string;
  detail: string | null;
  severity: string;
  waiting_on: string | null;
  resolved: boolean;
}

export interface IssueIn {
  title: string;
  detail?: string | null;
  severity?: IssueSeverity;
  waiting_on?: string | null;
  resolved?: boolean;
}

/**
 * A figure, and where it came from.
 *
 * `computed` is what the task rows said; `value` is what the author put, if
 * they put anything; `effective` is the one that counts. `edited` is worth
 * showing rather than hiding — a corrected number and an agreeing one are
 * different kinds of evidence.
 */
export interface ReportMetricOut {
  key: string;
  label: string;
  unit: string | null;
  computed: string | null;
  value: string | null;
  target: string | null;
  effective: string | null;
  edited: boolean;
}

export interface ReportCommentOut {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface ReportSummaryOut {
  id: string;
  team_id: string;
  team: string;
  author_id: string;
  author_name: string;
  cadence: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: string;
  submitted_at: string | null;
  task_count: number;
  open_issue_count: number;
  /** Only meaningful for a reader who is not the author. */
  read_by_me: boolean;
}

export interface ReportOut extends ReportSummaryOut {
  template_id: string;
  template_name: string;
  template_version: number;
  overview: string | null;
  remarks: string | null;
  summary: string | null;
  answers: Record<string, unknown>;
  sections: ReportSectionOut[];
  fields: ReportFieldOut[];
  tasks: TaskLineOut[];
  issues: IssueOut[];
  metrics: ReportMetricOut[];
  comments: ReportCommentOut[];
  /**
   * What *this* caller may do with it.
   *
   * Sent so a screen does not reimplement the rules to decide which buttons to
   * draw — and so it cannot drift from them. Only the author edits, and only
   * while it is a draft; not even a super admin, who comments or deletes
   * instead.
   */
  can_edit: boolean;
  can_submit: boolean;
  can_comment: boolean;
  can_delete: boolean;
}

export interface ReportPage {
  reports: ReportSummaryOut[];
  total: number;
}

/** POST /reports. Everything but the team has a sensible default. */
export interface ReportStartIn {
  team_id: string;
  cadence?: ReportCadence;
  /** Any day inside the period. Defaults to today. */
  on?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  /** Pull the caller's own Proposals tasks in as rows. On by default. */
  prefill_tasks?: boolean;
  include_closed?: boolean;
}

/**
 * PATCH /reports/{id}. Only what is sent changes.
 *
 * One asymmetry to keep in mind, and it is the backend's: a **list** sent at
 * all replaces that section entirely — sending `tasks` means "these are the
 * tasks", not "add these" — while `answers` and `metrics` are *merged*, so
 * filling a long form over two saves does not wipe the first.
 */
export interface ReportEditIn {
  overview?: string | null;
  remarks?: string | null;
  summary?: string | null;
  answers?: Record<string, unknown>;
  tasks?: TaskLineIn[];
  issues?: IssueIn[];
  metrics?: Record<string, string | null>;
}

/* ── what the reports say together ───────────────────────────────────── */

export interface TeamRollupOut {
  team_id: string;
  team: string;
  reports: number;
  people: number;
}

export interface AuthorRollupOut {
  author_id: string;
  author: string;
  reports: number;
  last_period: string | null;
}

export interface MetricRollupOut {
  key: string;
  label: string;
  unit: string | null;
  total: number;
  /** Averaged as well as totalled: a total that grows because more people filed says nothing about the work. */
  average: number;
  reports: number;
}

export interface OpenIssueOut {
  id: string;
  report_id: string;
  title: string;
  detail: string | null;
  severity: string;
  waiting_on: string | null;
  team: string;
  raised_by: string;
  period_start: string;
}

/**
 * The view across reports, narrowed to what the caller may read.
 *
 * Not an admin screen: an ordinary person asking for this gets their own
 * reports summarised and nobody else's, rather than a refusal. Which is why
 * the page behind it is offered to everybody.
 */
export interface ReportsOverviewOut {
  since: string;
  until: string;
  reports: number;
  people: number;
  by_team: TeamRollupOut[];
  by_author: AuthorRollupOut[];
  metrics: MetricRollupOut[];
  open_issues: OpenIssueOut[];
}

/* ── setting them up ─────────────────────────────────────────────────── */

export interface ReportScheduleOut {
  id: string;
  team_id: string;
  team: string;
  cadence: string;
  template_id: string;
  template_name: string;
  enabled: boolean;
  due_hour: number;
  due_weekday: number | null;
  note: string | null;
  /**
   * Whether this team's reports of this cadence are mailed.
   *
   * Three states, not two, and the null is the important one: it means "follow
   * the global setting", so turning that setting on later reaches a team that
   * never expressed a preference and does not reach one that said no. A
   * boolean could not say the difference between "yes" and "nobody has
   * decided".
   */
  notify: boolean | null;
  /** Copied on this team's reports. Added to the global list — it narrows nothing. */
  extra_recipients: string[];
}

export interface ReportScheduleIn {
  team_id: string;
  cadence: ReportCadence;
  template_id: string;
  enabled?: boolean;
  due_hour?: number;
  due_weekday?: number | null;
  note?: string | null;
  notify?: boolean | null;
  extra_recipients?: string[];
}

/* ── who a filed report goes to ──────────────────────────────────────── */

/**
 * The delivery rules.
 *
 * **None of this decides who may read a report.** Delivery and visibility are
 * separate questions and only the first is configurable: an address added here
 * is mailed a summary, and the link in that mail refuses them exactly as it
 * would anybody else who may not read that report.
 */
export interface ReportSettingsOut {
  /** The master switch. Off means nothing is mailed at all. */
  notify_on_submit: boolean;
  /** Mail the team's own managers and leads — the people it is written for. */
  notify_team_oversight: boolean;
  /** Mail everybody holding one of `company_roles`. */
  notify_company_wide: boolean;
  /**
   * Which global roles count as company-wide *for the mail*.
   *
   * Defaults to the same three that may read every report, but is its own
   * list: a CEO who wants to keep the access and lose the daily message
   * changes this and nothing else.
   */
  company_roles: string[];
  /** Always copied. For people who are not users here — a shared mailbox, a consultant. */
  extra_recipients: string[];
  /** Send authors their own report back. Off: nobody needs a copy of what they just wrote. */
  copy_author: boolean;
  /** Which cadences are mailed at all. The common ask is weeklies but not dailies. */
  notify_cadences: string[];
  /** How much of the report the message carries before it stops being a summary. */
  max_tasks_in_email: number;
  include_task_list: boolean;
  include_issue_list: boolean;
  /** Advisory: nothing is deleted, it is what the log defaults its range to. */
  log_retention_days: number;
  updated_by_id: string | null;
  updated_at: string;
}

/** Only the fields sent change. */
export interface ReportSettingsIn {
  notify_on_submit?: boolean;
  notify_team_oversight?: boolean;
  notify_company_wide?: boolean;
  /** Every key must exist — one that does not would silently mail nobody. */
  company_roles?: string[];
  /** Anything without an "@" is dropped rather than failing the whole save. */
  extra_recipients?: string[];
  copy_author?: boolean;
  notify_cadences?: string[];
  max_tasks_in_email?: number;
  include_task_list?: boolean;
  include_issue_list?: boolean;
  log_retention_days?: number;
}

/**
 * One attempt to mail one report.
 *
 * The names are copied off the report rather than joined to it, so a record
 * still reads after its report has been deleted — which is exactly the record
 * somebody is trying to look up.
 */
export interface ReportDeliveryOut {
  id: string;
  report_id: string | null;
  team_name: string | null;
  author_name: string | null;
  cadence: string | null;
  period_start: string | null;
  /** "sent", "failed" or "skipped". */
  status: string;
  recipients: string[];
  /** Why nothing was sent, or why it failed. Null on a clean send. */
  detail: string | null;
  created_at: string;
}

export interface ReportDeliveryPage {
  deliveries: ReportDeliveryOut[];
  total: number;
  /** By status, over the same window — so a screen can say "3 failed" without paging. */
  counts: Record<string, number>;
}

export interface ReportTemplateChoiceOut {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  field_count: number;
}
