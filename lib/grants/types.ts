// Grants domain types — parallel to lib/procurement/types.ts but grant-shaped.

export type GrantSourceName =
  | "360giving"
  | "ukri-gtr"
  | "govuk-find-a-grant"
  | "innovate-uk"
  | "manual-upload";

export type GrantStatus =
  | "open"
  | "forthcoming"
  | "closed"
  | "rolling"
  | "awarded" // historical award (360Giving) — browse-only, not applyable
  | "unknown";

export type GrantRecommendedAction =
  | "apply"
  | "maybe"
  | "do-not-apply"
  | "needs-review";

export interface NormalizedGrantDocument {
  id?: string | null;
  title: string;
  url?: string | null;
  format?: string | null;
}

// Deep detail (migration 062) — pulled from a source's grant detail page.
export interface GrantLink {
  title: string;
  url: string;
}

export interface GrantDetailSection {
  heading: string;
  text: string;
}

export interface GrantDetails {
  sections: GrantDetailSection[]; // eligibility, objectives, how to apply, dates, ...
  links: GrantLink[]; // links embedded in the detail content (e.g. eligibility criteria)
  documents: GrantLink[]; // downloadable documents (PDF / DOCX / ...)
  webpageUrl?: string | null; // canonical apply / info page on the source
}

export interface NormalizedGrant {
  sourceName: GrantSourceName;
  sourceNoticeId: string;
  sourceUrl?: string | null;
  applicationUrl?: string | null;

  title: string;
  description?: string | null;

  funderName?: string | null;
  funderId?: string | null;
  funderRegion?: string | null;

  fundingType?: string | null; // grant | loan | award | prize | other
  amountMin?: number | null;
  amountMax?: number | null;
  currency?: string | null;

  openAt?: string | null;
  deadlineAt?: string | null;
  status: GrantStatus;

  themes?: string[];
  sectors?: string[];
  regions?: string[];
  eligibilityText?: string | null;
  eligibleOrgTypes?: string[];
  matchFundingRequired?: boolean;
  beneficiaries?: string[];

  documents?: NormalizedGrantDocument[];
  publishedAt?: string | null;
  rawJson: unknown;
}

// DB row shape (snake_case, matches the `grants` table).
export interface GrantRow {
  id: string;
  source_name: string;
  source_notice_id: string;
  source_url: string | null;
  application_url: string | null;
  title: string;
  description: string | null;
  funder_name: string | null;
  funder_id: string | null;
  funder_region: string | null;
  funding_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string | null;
  open_at: string | null;
  deadline_at: string | null;
  status: string;
  themes: string[];
  sectors: string[];
  regions: string[];
  eligibility_text: string | null;
  eligible_org_types: string[];
  match_funding_required: boolean;
  beneficiaries: string[];
  documents: NormalizedGrantDocument[] | null;
  raw_json: unknown | null;
  published_at: string | null;
  details: GrantDetails | null;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrantSourceRow {
  id: string;
  name: GrantSourceName;
  display_name: string;
  type: string;
  base_url: string | null;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_cursor: string | null;
  last_error: string | null;
  last_run_at?: string | null;
  last_fetched_count?: number | null;
  last_pages?: number | null;
  last_normalize_errors?: number | null;
  backfill_watermark?: string | null;
  backfill_complete?: boolean;
  created_at: string;
  updated_at: string;
}

export interface GrantMatchRow {
  id: string;
  grant_id: string;
  org_id: string;
  fit_score: number;
  readiness_score: number;
  recommended_action: GrantRecommendedAction;
  eligible: boolean;
  reasons: string[];
  risks: string[];
  missing_requirements: string[];
  created_at: string;
}

// Connector interface (mirror of ProcurementSourceConnector).
export interface GrantFetchSinceParams {
  from: Date;
  to: Date;
  cursor?: string | null;
  limit?: number;
}

export interface GrantFetchResult {
  sourceName: GrantSourceName;
  rawItems: unknown[];
  nextCursor?: string | null;
  fetchedAt: string;
  hasMore: boolean;
}

export interface GrantSourceConnector {
  sourceName: GrantSourceName;
  displayName: string;
  baseUrl: string;
  /**
   * True when a complete sync returns the source's entire current set of open calls
   * (e.g. GOV.UK Find a Grant, Innovate UK). Lets the sync prune grants that have been
   * delisted at source (closed) by marking any not seen in a complete run as "closed".
   * Leave false/undefined for paged/partial sources (e.g. 360Giving awarded grants).
   */
  listsAllOpenCalls?: boolean;
  fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult>;
  normalize(raw: unknown): Promise<NormalizedGrant[]>;
  /**
   * Optional deep enrichment: fetch a grant's source detail page and return its rich
   * content (eligibility, how to apply, key dates, documents, links). Called lazily
   * when a grant is first viewed and by a capped cron pass.
   */
  fetchDetail?(grant: GrantRow): Promise<GrantDetails | null>;
}
