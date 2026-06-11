export type ProcurementSourceName =
  | "find-tender"
  | "contracts-finder"
  | "public-contracts-scotland"
  | "sell2wales"
  | "etenders-ni"
  | "manual-upload";

export type ProcurementStage =
  | "planning"
  | "tender"
  | "award"
  | "contract"
  | "implementation"
  | "unknown";

export type OpportunityStatus =
  | "planned"
  | "active"
  | "closed"
  | "awarded"
  | "cancelled"
  | "unknown";

export type BidPipelineStatus =
  | "new-match"
  | "reviewing"
  | "bid"
  | "no-bid"
  | "in-progress"
  | "awaiting-review"
  | "submitted"
  | "won"
  | "lost"
  | "archived";

export type RecommendedAction = "bid" | "maybe" | "do-not-bid" | "needs-review";

export interface NormalizedLot {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  valueAmount?: number | null;
  valueCurrency?: string | null;
  cpvCodes?: string[];
  deadlineAt?: string | null;
}

export interface NormalizedDocument {
  id?: string | null;
  title: string;
  documentType?: string | null;
  url?: string | null;
  format?: string | null;
  publishedAt?: string | null;
}

export interface NormalizedOpportunity {
  canonicalOcid?: string | null;
  sourceName: ProcurementSourceName;
  sourceNoticeId: string;
  sourceUrl?: string | null;
  submissionUrl?: string | null;

  title: string;
  description?: string | null;

  buyerName?: string | null;
  buyerIdentifier?: string | null;
  buyerRegion?: string | null;

  noticeType?: string | null;
  procurementStage: ProcurementStage;
  status: OpportunityStatus;

  cpvCodes: string[];
  region?: string | null;

  valueAmount?: number | null;
  valueCurrency?: string | null;

  publishedAt?: string | null;
  updatedAt?: string | null;
  deadlineAt?: string | null;
  contractStartAt?: string | null;
  contractEndAt?: string | null;

  frameworkFlag?: boolean;
  lots?: NormalizedLot[];
  documents?: NormalizedDocument[];

  rawJson: unknown;
}

// DB row shape (snake_case, matches Supabase column names)
export interface OpportunityRow {
  id: string;
  canonical_ocid: string | null;
  source_name: string;
  source_notice_id: string;
  source_url: string | null;
  submission_url: string | null;
  title: string;
  description: string | null;
  buyer_name: string | null;
  buyer_identifier: string | null;
  buyer_region: string | null;
  notice_type: string | null;
  procurement_stage: string;
  status: string;
  cpv_codes: string[];
  region: string | null;
  value_amount: string | number | null;
  value_currency: string | null;
  published_at: string | null;
  deadline_at: string | null;
  contract_start_at: string | null;
  contract_end_at: string | null;
  framework_flag: boolean;
  lots: NormalizedLot[] | null;
  documents: NormalizedDocument[] | null;
  raw_json: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface BuyerRow {
  id: string;
  name: string;
  identifiers: unknown | null;
  address: unknown | null;
  region: string | null;
  website: string | null;
  source_refs: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  name: ProcurementSourceName;
  display_name: string;
  type: string;
  base_url: string | null;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_cursor: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Insurance ─────────────────────────────────────────────────────────────────

export const INSURANCE_LINES = [
  "professional_indemnity",
  "public_liability",
  "employers_liability",
] as const;

export type InsuranceLine = (typeof INSURANCE_LINES)[number];

/** One line of cover in the migration-070 shape (amount in GBP). */
export interface InsuranceCoverDetail {
  amount: number | null;
  insurer?: string;
  policy_number?: string;
  /** ISO date the policy runs out. */
  expires_at?: string;
}

/**
 * What a stored insurance value can hold: rows written before migration 070
 * keep plain numbers; newer rows hold {amount, insurer?, policy_number?,
 * expires_at?} objects. Readers must go through normaliseInsurance.
 */
export type InsuranceCoverValue = number | InsuranceCoverDetail | null;

/** Structured insurance cover. All lines optional. */
export interface InsuranceCover {
  professional_indemnity?: InsuranceCoverValue;
  public_liability?: InsuranceCoverValue;
  employers_liability?: InsuranceCoverValue;
}

/** Every line present, every value in the migration-070 object shape. */
export type NormalisedInsurance = Record<
  InsuranceLine,
  InsuranceCoverDetail | null
>;

function normaliseInsuranceLine(value: unknown): InsuranceCoverDetail | null {
  // Pre-070 shape: the value is the cover amount itself.
  if (typeof value === "number") {
    return Number.isFinite(value) ? { amount: value } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const detail: InsuranceCoverDetail = {
    amount:
      typeof o.amount === "number" && Number.isFinite(o.amount)
        ? o.amount
        : null,
  };
  if (typeof o.insurer === "string" && o.insurer.trim()) {
    detail.insurer = o.insurer.trim();
  }
  if (typeof o.policy_number === "string" && o.policy_number.trim()) {
    detail.policy_number = o.policy_number.trim();
  }
  if (typeof o.expires_at === "string" && o.expires_at.trim()) {
    detail.expires_at = o.expires_at.trim();
  }
  const hasAnything =
    detail.amount != null ||
    detail.insurer != null ||
    detail.policy_number != null ||
    detail.expires_at != null;
  return hasAnything ? detail : null;
}

/**
 * Normalise a stored insurance value (either era) into the migration-070
 * object shape. Returns null when there is no usable cover at all, so
 * `normaliseInsurance(x) != null` still means "has some insurance recorded".
 */
export function normaliseInsurance(value: unknown): NormalisedInsurance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out = {} as NormalisedInsurance;
  let any = false;
  for (const line of INSURANCE_LINES) {
    const detail = normaliseInsuranceLine(raw[line]);
    out[line] = detail;
    if (detail) any = true;
  }
  return any ? out : null;
}

// ── Organisation profile ──────────────────────────────────────────────────────

/** Registered office address (migration 070, Companies House shape). */
export interface RegisteredAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
}

/** A named person buyers ask about (migration 070). */
export interface KeyPerson {
  name: string;
  role: string;
  bio?: string | null;
}

/** A framework place, e.g. G-Cloud 14 (migration 070). */
export interface FrameworkEntry {
  name: string;
  reference?: string | null;
  /** ISO date the place expires. */
  expires_at?: string | null;
}

/** A named policy document, e.g. "Information Security Policy" (migration 070). */
export interface PolicyEntry {
  name: string;
  /** ISO date the policy was last reviewed. */
  last_reviewed?: string | null;
  /** Knowledge-base document holding the policy text. */
  document_id?: string | null;
}

export interface OrganisationProfileRow {
  id: string;
  org_id: string;
  name: string;
  organisation_type: string | null;
  sectors: string[];
  services: string[];
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  certifications: string[];
  accreditations: string[];
  insurance: InsuranceCover | null;
  min_contract_value: number | null;
  max_contract_value: number | null;
  preferred_buyers: string[];
  excluded_buyers: string[];
  excluded_keywords: string[];
  // Buildout (migration 053) — capability/capacity signals for fit scoring.
  company_size_band: string | null;
  annual_turnover: number | null;
  year_established: number | null;
  delivery_models: string[];
  social_value: string[];
  // Grant eligibility (migration 059).
  legal_form: string | null;
  is_registered_charity: boolean | null;
  charity_number: string | null;
  company_number: string | null;
  match_funding_capacity: number | null;
  beneficiaries: string[];
  grant_themes: string[];
  // Business credentials (migration 070). Optional because rows fetched before
  // the migration (and older seed inputs) omit them — getOrgProfile defaults
  // them, so reads through lib/procurement/data.ts always see stable values.
  website?: string | null;
  vat_number?: string | null;
  registered_address?: RegisteredAddress | null;
  /** ISO date of incorporation. */
  incorporation_date?: string | null;
  sic_codes?: string[];
  trading_names?: string[];
  employee_count?: number | null;
  key_people?: KeyPerson[];
  memberships?: string[];
  frameworks?: FrameworkEntry[];
  policies?: PolicyEntry[];
  carbon_reduction_plan?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityMatchRow {
  id: string;
  opportunity_id: string;
  org_id: string;
  fit_score: number;
  readiness_score: number;
  recommended_action: RecommendedAction;
  reasons: string[];
  risks: string[];
  missing_requirements: string[];
  created_at: string;
}

export interface BidPipelineRow {
  id: string;
  opportunity_id: string;
  org_id: string;
  status: BidPipelineStatus;
  owner: string | null;
  bid_decision: string | null;
  decision_notes: string | null;
  next_action: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

// Connector interface
export interface FetchSinceParams {
  from: Date;
  to: Date;
  cursor?: string | null;
  limit?: number;
}

export interface SourceFetchResult {
  sourceName: ProcurementSourceName;
  rawItems: unknown[];
  nextCursor?: string | null;
  fetchedAt: string;
  hasMore: boolean;
}

export interface ProcurementSourceConnector {
  sourceName: ProcurementSourceName;
  displayName: string;
  baseUrl: string;
  fetchSince(params: FetchSinceParams): Promise<SourceFetchResult>;
  normalize(raw: unknown): Promise<NormalizedOpportunity[]>;
}
