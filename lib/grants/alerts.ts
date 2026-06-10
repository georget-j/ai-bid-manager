import { getServiceSupabase } from "@/lib/supabase-service";
import type { AlertRule } from "@/lib/procurement/alerts";
import type { GrantRow } from "./types";

// Grants reuse the existing alert_rules (one alerting system across tenders + grants).
// Tender-only criteria (cpv_codes, stages) don't apply to grants and are ignored; the
// rule's `buyers` field is treated as funder names. A rule only matches grants if it has
// at least one grant-relevant criterion set — so a purely tender-shaped rule (e.g. CPV
// only) never spams grant matches.

/** Returns true if the grant matches the (grant-relevant parts of the) alert rule. */
export function matchesGrantRule(grant: GrantRow, rule: AlertRule): boolean {
  const hasGrantCriteria =
    rule.keywords.length > 0 ||
    rule.regions.length > 0 ||
    rule.buyers.length > 0 ||
    rule.min_value != null ||
    rule.max_value != null;
  if (!hasGrantCriteria) return false;

  const text =
    `${grant.title} ${grant.description ?? ""} ${(grant.themes ?? []).join(" ")} ${(grant.sectors ?? []).join(" ")} ${grant.eligibility_text ?? ""}`.toLowerCase();

  // Keywords: any match
  if (rule.keywords.length > 0) {
    const hit = rule.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!hit) return false;
  }

  // Regions: any overlap with the grant's regions
  if (rule.regions.length > 0) {
    const regions = (grant.regions ?? []).map((r) => r.toLowerCase());
    const hit = rule.regions.some((r) =>
      regions.some((gr) => gr.includes(r.toLowerCase())),
    );
    if (!hit) return false;
  }

  // Buyers == funders: any substring match against the funder name
  if (rule.buyers.length > 0) {
    const funder = (grant.funder_name ?? "").toLowerCase();
    const hit = rule.buyers.some((b) => funder.includes(b.toLowerCase()));
    if (!hit) return false;
  }

  // Value range: against the grant's award size (max, else min)
  const value =
    grant.amount_max != null
      ? Number(grant.amount_max)
      : grant.amount_min != null
        ? Number(grant.amount_min)
        : null;
  if (value !== null) {
    if (rule.min_value != null && value < rule.min_value) return false;
    if (rule.max_value != null && value > rule.max_value) return false;
  }

  return true;
}

/**
 * Run all enabled alert rules against a batch of newly upserted grants and insert
 * grant_alert_matches rows for hits. Called from the grant sync after upserts complete.
 */
export async function matchAlertsForGrants(
  grantIds: string[],
): Promise<{ matched: number }> {
  if (grantIds.length === 0) return { matched: 0 };

  const supabase = getServiceSupabase();

  // Alert matching is best-effort from the caller's side (the sync catches and
  // records errors) — but failures must surface, not read as "no matches".
  const { data: grants, error: grantsError } = await supabase
    .from("grants")
    .select("*")
    .in("id", grantIds);
  if (grantsError)
    throw new Error(
      `Failed to load grants for alert matching: ${grantsError.message}`,
    );
  if (!grants?.length) return { matched: 0 };

  const { data: rules, error: rulesError } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("enabled", true);
  if (rulesError)
    throw new Error(
      `Failed to load alert rules for alert matching: ${rulesError.message}`,
    );
  if (!rules?.length) return { matched: 0 };

  const matchRows: Array<{
    alert_rule_id: string;
    grant_id: string;
    org_id: string;
    matched_at: string;
  }> = [];

  for (const rule of rules as AlertRule[]) {
    for (const grant of grants as GrantRow[]) {
      if (matchesGrantRule(grant, rule)) {
        matchRows.push({
          alert_rule_id: rule.id,
          grant_id: grant.id,
          org_id: rule.org_id,
          matched_at: new Date().toISOString(),
        });
      }
    }
  }

  if (matchRows.length === 0) return { matched: 0 };

  const { error: upsertError } = await supabase
    .from("grant_alert_matches")
    .upsert(matchRows, {
      onConflict: "alert_rule_id,grant_id",
      ignoreDuplicates: true,
    });
  if (upsertError)
    throw new Error(
      `Failed to upsert grant alert matches: ${upsertError.message}`,
    );

  return { matched: matchRows.length };
}
