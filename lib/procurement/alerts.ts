import { getServiceSupabase } from "@/lib/supabase-service";
import type { OpportunityRow } from "./types";

export interface AlertRule {
  id: string;
  org_id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  buyers: string[];
  min_value: number | null;
  max_value: number | null;
  stages: string[];
  enabled: boolean;
  channel: string;
  created_at: string;
  updated_at: string;
}

export interface AlertMatch {
  id: string;
  alert_rule_id: string;
  opportunity_id: string;
  org_id: string;
  seen: boolean;
  matched_at: string;
}

/** Returns true if the opportunity matches the alert rule criteria. */
export function matchesRule(opp: OpportunityRow, rule: AlertRule): boolean {
  const text = `${opp.title} ${opp.description ?? ""}`.toLowerCase();

  // Keywords: any match
  if (rule.keywords.length > 0) {
    const hit = rule.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!hit) return false;
  }

  // CPV codes: any match
  if (rule.cpv_codes.length > 0) {
    const hit = (opp.cpv_codes ?? []).some((code) =>
      rule.cpv_codes.includes(code),
    );
    if (!hit) return false;
  }

  // Regions: any match
  if (rule.regions.length > 0) {
    const oppRegion = (opp.region ?? opp.buyer_region ?? "").toLowerCase();
    const hit = rule.regions.some((r) => oppRegion.includes(r.toLowerCase()));
    if (!hit) return false;
  }

  // Buyers: any match (substring)
  if (rule.buyers.length > 0) {
    const oppBuyer = (opp.buyer_name ?? "").toLowerCase();
    const hit = rule.buyers.some((b) => oppBuyer.includes(b.toLowerCase()));
    if (!hit) return false;
  }

  // Stages: any match
  if (rule.stages.length > 0) {
    if (!rule.stages.includes(opp.procurement_stage)) return false;
  }

  // Value range
  const value = opp.value_amount ? Number(opp.value_amount) : null;
  if (value !== null) {
    if (rule.min_value != null && value < rule.min_value) return false;
    if (rule.max_value != null && value > rule.max_value) return false;
  }

  return true;
}

/**
 * Run all enabled alert rules for all orgs against a batch of newly
 * upserted opportunities. Inserts alert_matches rows for hits.
 * Called from the sync engine after upserts complete.
 */
export async function matchAlertsForOpportunities(
  opportunityIds: string[],
): Promise<{ matched: number }> {
  if (opportunityIds.length === 0) return { matched: 0 };

  const supabase = getServiceSupabase();

  // Load opportunities
  const { data: opps } = await supabase
    .from("opportunities")
    .select("*")
    .in("id", opportunityIds);

  if (!opps?.length) return { matched: 0 };

  // Load all enabled alert rules
  const { data: rules } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("enabled", true);

  if (!rules?.length) return { matched: 0 };

  const matchRows: Array<{
    alert_rule_id: string;
    opportunity_id: string;
    org_id: string;
    matched_at: string;
  }> = [];

  for (const rule of rules as AlertRule[]) {
    for (const opp of opps as OpportunityRow[]) {
      if (matchesRule(opp, rule)) {
        matchRows.push({
          alert_rule_id: rule.id,
          opportunity_id: opp.id,
          org_id: rule.org_id,
          matched_at: new Date().toISOString(),
        });
      }
    }
  }

  if (matchRows.length === 0) return { matched: 0 };

  // Upsert — ignore duplicates
  await supabase
    .from("alert_matches")
    .upsert(matchRows, {
      onConflict: "alert_rule_id,opportunity_id",
      ignoreDuplicates: true,
    });

  return { matched: matchRows.length };
}
