import { getServiceSupabase } from "@/lib/supabase";
import type {
  OpportunityRow,
  BidPipelineRow,
  OpportunityMatchRow,
  OrganisationProfileRow,
} from "./types";

// ── Opportunities ─────────────────────────────────────────────────────────────

export interface ListOpportunitiesOptions {
  orgId: string;
  status?: string;
  stage?: string;
  region?: string;
  search?: string;
  buyer?: string;
  limit?: number;
  offset?: number;
}

export async function listOpportunities(
  opts: ListOpportunitiesOptions,
): Promise<{ opportunities: OpportunityRow[]; total: number }> {
  const {
    orgId,
    status,
    stage,
    region,
    search,
    buyer,
    limit = 50,
    offset = 0,
  } = opts;

  const supabase = getServiceSupabase();
  let query = supabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (stage) query = query.eq("procurement_stage", stage);
  if (region) query = query.eq("region", region);
  if (buyer) query = query.ilike("buyer_name", `%${buyer}%`);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`);

  return { opportunities: (data ?? []) as OpportunityRow[], total: count ?? 0 };
}

export async function getOpportunity(
  id: string,
  orgId?: string,
): Promise<OpportunityRow | null> {
  const supabase = getServiceSupabase();
  let query = supabase.from("opportunities").select("*").eq("id", id);
  if (orgId) query = query.eq("org_id", orgId);
  const { data, error } = await query.single();
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
