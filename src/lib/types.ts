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
  failed: { user_id: string; error: string }[];
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
  open: number;
  overdue: number;
  due_soon: number;
  later: number;
  no_deadline: number;
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
