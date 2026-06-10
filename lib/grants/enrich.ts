import { getServiceSupabase } from "@/lib/supabase-service";
import { getGrantConnector } from "./connectors";
import type { GrantRow, GrantDetails } from "./types";

// Deep enrichment: pull a grant's full detail (eligibility, how to apply, key dates,
// documents, links) from its source detail page and cache it on the row. Enrichment is
// lazy (on first view) and topped up by a capped cron pass. `details`/`enriched_at` are
// not written by the listing sync, so they survive re-syncs.

const ENRICHABLE_SOURCES = ["govuk-find-a-grant", "innovate-uk"];

/** Fetch + persist deep details for one grant. Returns the details (or null). */
export async function enrichGrant(
  grant: GrantRow,
): Promise<GrantDetails | null> {
  const connector = getGrantConnector(grant.source_name);
  if (!connector?.fetchDetail) return null;

  let details: GrantDetails | null = null;
  try {
    details = await connector.fetchDetail(grant);
  } catch {
    return null; // best-effort — never block the caller
  }
  if (!details) return null;

  await getServiceSupabase()
    .from("grants")
    .update({ details, enriched_at: new Date().toISOString() })
    .eq("id", grant.id);
  return details;
}

/** Enrich up to `limit` open grants that still lack details (for the cron). */
export async function enrichPendingGrants(
  limit = 15,
): Promise<{ enriched: number; attempted: number }> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("grants")
    .select("*")
    .is("details", null)
    .in("status", ["open", "forthcoming", "rolling"])
    .in("source_name", ENRICHABLE_SOURCES)
    .order("updated_at", { ascending: false })
    .limit(limit);

  const grants = (data ?? []) as GrantRow[];
  let enriched = 0;
  for (const g of grants) {
    if (await enrichGrant(g)) enriched++;
    await new Promise((r) => setTimeout(r, 400)); // polite pacing
  }
  return { enriched, attempted: grants.length };
}
