import { getServiceSupabase } from "@/lib/supabase";
import { SEED_OPPORTUNITIES } from "./seed";
import type {
  OpportunityRow,
  BidPipelineRow,
  OpportunityMatchRow,
  OrganisationProfileRow,
} from "./types";

const isDemoMode =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

// ── Opportunities ─────────────────────────────────────────────────────────────

export interface ListOpportunitiesOptions {
  status?: string;
  stage?: string;
  region?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listOpportunities(
  opts: ListOpportunitiesOptions = {},
): Promise<{ opportunities: OpportunityRow[]; total: number }> {
  const { status, stage, region, search, limit = 50, offset = 0 } = opts;

  const supabase = getServiceSupabase();
  let query = supabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (stage) query = query.eq("procurement_stage", stage);
  if (region) query = query.eq("region", region);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`);

  return { opportunities: (data ?? []) as OpportunityRow[], total: count ?? 0 };
}

export async function getOpportunity(
  id: string,
): Promise<OpportunityRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as OpportunityRow;
}

// ── Seed data loader ──────────────────────────────────────────────────────────

export async function upsertSeedOpportunities(): Promise<{
  upserted: number;
  errors: string[];
}> {
  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let upserted = 0;

  for (const opp of SEED_OPPORTUNITIES) {
    const { error } = await supabase.from("opportunities").upsert(
      {
        canonical_ocid: opp.canonicalOcid ?? null,
        source_name: opp.sourceName,
        source_notice_id: opp.sourceNoticeId,
        source_url: opp.sourceUrl ?? null,
        submission_url: opp.submissionUrl ?? null,
        title: opp.title,
        description: opp.description ?? null,
        buyer_name: opp.buyerName ?? null,
        buyer_identifier: opp.buyerIdentifier ?? null,
        buyer_region: opp.buyerRegion ?? null,
        notice_type: opp.noticeType ?? null,
        procurement_stage: opp.procurementStage,
        status: opp.status,
        cpv_codes: opp.cpvCodes,
        region: opp.region ?? null,
        value_amount: opp.valueAmount ?? null,
        value_currency: opp.valueCurrency ?? "GBP",
        published_at: opp.publishedAt ?? null,
        deadline_at: opp.deadlineAt ?? null,
        contract_start_at: opp.contractStartAt ?? null,
        contract_end_at: opp.contractEndAt ?? null,
        framework_flag: opp.frameworkFlag ?? false,
        lots: opp.lots ?? null,
        documents: opp.documents ?? null,
        raw_json: opp.rawJson ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_name,source_notice_id" },
    );

    if (error) {
      errors.push(`${opp.sourceNoticeId}: ${error.message}`);
    } else {
      upserted++;
    }
  }

  return { upserted, errors };
}

// Demo-mode: fall back to in-memory seed data when DB is unavailable
export async function listOpportunitiesWithFallback(
  opts: ListOpportunitiesOptions = {},
): Promise<{
  opportunities: OpportunityRow[];
  total: number;
  source: "db" | "seed";
}> {
  try {
    const result = await listOpportunities(opts);
    if (result.total > 0) {
      return { ...result, source: "db" };
    }
  } catch {
    // fall through to seed
  }

  // In-memory seed fallback — map camelCase NormalizedOpportunity to snake_case OpportunityRow
  const { search, status, stage, region, limit = 50, offset = 0 } = opts;
  let seed: OpportunityRow[] = SEED_OPPORTUNITIES.map((o, i) => ({
    id: o.canonicalOcid ?? o.sourceNoticeId ?? String(i),
    canonical_ocid: o.canonicalOcid ?? null,
    source_name: o.sourceName,
    source_notice_id: o.sourceNoticeId,
    source_url: o.sourceUrl ?? null,
    submission_url: o.submissionUrl ?? null,
    title: o.title,
    description: o.description ?? null,
    buyer_name: o.buyerName ?? null,
    buyer_identifier: o.buyerIdentifier ?? null,
    buyer_region: o.buyerRegion ?? null,
    notice_type: o.noticeType ?? null,
    procurement_stage: o.procurementStage,
    status: o.status,
    cpv_codes: o.cpvCodes,
    region: o.region ?? null,
    value_amount: o.valueAmount ?? null,
    value_currency: o.valueCurrency ?? "GBP",
    published_at: o.publishedAt ?? null,
    deadline_at: o.deadlineAt ?? null,
    contract_start_at: o.contractStartAt ?? null,
    contract_end_at: o.contractEndAt ?? null,
    framework_flag: o.frameworkFlag ?? false,
    lots: o.lots ?? null,
    documents: o.documents ?? null,
    raw_json: o.rawJson ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (search)
    seed = seed.filter((o) =>
      o.title.toLowerCase().includes(search.toLowerCase()),
    );
  if (status) seed = seed.filter((o) => o.status === status);
  if (stage) seed = seed.filter((o) => o.procurement_stage === stage);
  if (region) seed = seed.filter((o) => o.region === region);

  return {
    opportunities: seed.slice(offset, offset + limit),
    total: seed.length,
    source: "seed",
  };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function getPipelineByOrg(
  orgId: string,
): Promise<BidPipelineRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("bid_pipeline")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch pipeline: ${error.message}`);
  return (data ?? []) as BidPipelineRow[];
}

export async function addToPipeline(
  opportunityId: string,
  orgId: string,
): Promise<BidPipelineRow> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("bid_pipeline")
    .upsert(
      {
        opportunity_id: opportunityId,
        org_id: orgId,
        status: "new-match",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id,org_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to add to pipeline: ${error.message}`);
  return data as BidPipelineRow;
}

// ── Organisation profiles ─────────────────────────────────────────────────────

export async function getOrgProfile(
  orgId: string,
): Promise<OrganisationProfileRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("organisation_profiles")
    .select("*")
    .eq("org_id", orgId)
    .single();

  if (error) return null;
  return data as OrganisationProfileRow;
}

export async function upsertOrgProfile(
  orgId: string,
  profile: Omit<
    OrganisationProfileRow,
    "id" | "org_id" | "created_at" | "updated_at"
  >,
): Promise<OrganisationProfileRow> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("organisation_profiles")
    .upsert(
      { ...profile, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to save profile: ${error.message}`);
  return data as OrganisationProfileRow;
}

// ── Matches ───────────────────────────────────────────────────────────────────

export async function getMatchesForOrg(
  orgId: string,
  opportunityIds?: string[],
): Promise<OpportunityMatchRow[]> {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("opportunity_matches")
    .select("*")
    .eq("org_id", orgId);
  if (opportunityIds?.length)
    query = query.in("opportunity_id", opportunityIds);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch matches: ${error.message}`);
  return (data ?? []) as OpportunityMatchRow[];
}
