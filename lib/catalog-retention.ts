import { getServiceSupabase } from "@/lib/supabase-service";

type RawTable = "raw_notices" | "raw_grant_notices" | "raw_event_notices";

/** Keep a short deduplication window; the normalized catalog is retained. */
export async function pruneRawReceipts(table: RawTable): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await getServiceSupabase()
      .from(table)
      .delete()
      .lt("fetched_at", cutoff);
    if (error) console.error(`[catalog-retention] ${table}: ${error.message}`);
  } catch (error) {
    console.error(`[catalog-retention] ${table}:`, error);
  }
}
