import { getServiceSupabase } from "@/lib/supabase-service";
import type {
  OpportunityRow,
  BidPipelineRow,
  OpportunityMatchRow,
  OrganisationProfileRow,
} from "./types";

// ── Opportunities ─────────────────────────────────────────────────────────────

// List/scoring paths never read the heavy jsonb (raw_json / documents / lots) — only
// the single-row getOpportunity() does. Projecting the scalar columns avoids shipping
// ~4 KB of unused raw_json per row (×50 list / ×300 recommendations) every request.
const LIST_COLUMNS =
  "id, canonical_ocid, source_name, source_notice_id, source_url, submission_url, " +
  "title, description, buyer_name, buyer_identifier, buyer_region, notice_type, " +
  "procurement_stage, status, cpv_codes, region, value_amount, value_currency, " +
  "published_at, deadline_at, contract_start_at, contract_end_at, framework_flag, " +
  "created_at, updated_at";

export interface ListOpportunitiesOptions {
  orgId?: string;
  status?: string;
  stage?: string;
  region?: string;
  search?: string;
  buyer?: string;
  /** Deadline status: "open" (future or no deadline), "soon" (≤7d), "closed" (past). */
  deadline?: string;
  /** source_name exact match (e.g. "contracts-finder"). */
  source?: string;
  /** CPV division prefix, e.g. "72" for IT services. */
  sector?: string;
  valueMin?: number;
  valueMax?: number;
  limit?: number;
  offset?: number;
  /** Select the full row incl. raw_json/documents/lots (default: narrowed columns). */
  full?: boolean;
}

export async function listOpportunities(
  opts: ListOpportunitiesOptions,
): Promise<{ opportunities: OpportunityRow[]; total: number }> {
  const {
    status,
    stage,
    region,
    search,
    buyer,
    deadline,
    source,
    sector,
    valueMin,
    valueMax,
    limit = 50,
    offset = 0,
  } = opts;

  const supabase = getServiceSupabase();
  let query = supabase
    .from("opportunities")
    .select(opts.full ? "*" : LIST_COLUMNS, { count: "exact" })
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (stage) query = query.eq("procurement_stage", stage);
  if (region) query = query.ilike("region", `%${region}%`);
  if (buyer) query = query.ilike("buyer_name", `%${buyer}%`);
  if (search) query = query.ilike("title", `%${search}%`);
  if (source) query = query.eq("source_name", source);
  // CPV division prefix: cpv_search is space-padded so "% 72%" = a code starting with 72.
  if (sector) query = query.ilike("cpv_search", `% ${sector}%`);
  if (valueMin != null) query = query.gte("value_amount", valueMin);
  if (valueMax != null) query = query.lte("value_amount", valueMax);

  // Deadline status, computed against now.
  if (deadline === "open") {
    // Drop milliseconds: the dot in ".789Z" can confuse PostgREST's or-filter parser.
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    query = query.or(`deadline_at.gte.${nowIso},deadline_at.is.null`);
  } else if (deadline === "soon") {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    query = query
      .gte("deadline_at", now.toISOString())
      .lte("deadline_at", soon.toISOString());
  } else if (deadline === "closed") {
    query = query.lt("deadline_at", new Date().toISOString());
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`);

  return {
    opportunities: (data ?? []) as unknown as OpportunityRow[],
    total: count ?? 0,
  };
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
  clientId: string | null = null,
): Promise<BidPipelineRow> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("bid_pipeline")
    .upsert(
      {
        opportunity_id: opportunityId,
        org_id: orgId,
        status: "new-match",
        client_id: clientId,
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
