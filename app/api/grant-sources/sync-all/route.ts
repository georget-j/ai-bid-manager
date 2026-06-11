import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-service";
import { allGrantConnectors } from "@/lib/grants/connectors";
import { syncGrantSource, seedGrantSources } from "@/lib/grants/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // sources can be slow; allow a full sweep

// Per-source page cap — mirrors the nightly cron (app/api/cron/sync-grants).
// Anything not reached resumes via the stored cursor on the next run.
const MAX_PAGES = Number(process.env.GRANTS_SYNC_ALL_MAX_PAGES ?? "25");
const OVERALL_BUDGET_MS = 240_000; // stay under maxDuration (300s)

/** POST — manually sync every enabled grant source with a connector (operator only). */
export async function POST() {
  const denied = await requireOperator();
  if (denied) return denied;

  await seedGrantSources();
  const supabase = getServiceSupabase();
  const { data: sources } = await supabase
    .from("grant_sources")
    .select("name, enabled");
  const enabled = new Set(
    (sources ?? []).filter((s) => s.enabled).map((s) => s.name),
  );

  const connectors = allGrantConnectors().filter((c) =>
    enabled.has(c.sourceName),
  );

  // Distinct hosts → run in parallel; each gets the full time budget.
  const results = await Promise.allSettled(
    connectors.map((c) =>
      syncGrantSource(c, {
        maxPages: MAX_PAGES,
        timeBudgetMs: OVERALL_BUDGET_MS,
      }),
    ),
  );

  const summary = results.map((r, i) => {
    const connector = connectors[i];
    if (r.status === "fulfilled") return r.value;
    return {
      source: connector?.sourceName ?? "unknown",
      fetched: 0,
      pages: 0,
      rawStored: 0,
      duplicatesSkipped: 0,
      grantsUpserted: 0,
      grantsErrored: 0,
      errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      hasMore: false,
      nextCursor: null,
      closedPruned: 0,
    };
  });

  return NextResponse.json({
    ran: connectors.map((c) => c.sourceName),
    results: summary,
  });
}
