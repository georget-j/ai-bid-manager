export type ProcurementSourceName =
  | "find-tender"
  | "contracts-finder"
  | "public-contracts-scotland"
  | "sell2wales"
  | "etenders-ni"
  | "manual-upload"
  | "seed";

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
  insurance: unknown | null;
  min_contract_value: number | null;
  max_contract_value: number | null;
  preferred_buyers: string[];
  excluded_buyers: string[];
  excluded_keywords: string[];
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
