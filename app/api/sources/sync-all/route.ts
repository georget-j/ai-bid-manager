import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { syncSource } from "@/lib/procurement/sync";
import { findTenderConnector } from "@/lib/procurement/connectors/find-tender";
import { contractsFinderConnector } from "@/lib/procurement/connectors/contracts-finder";
import { publicContractsScotlandConnector } from "@/lib/procurement/connectors/public-contracts-scotland";
import { sell2walesConnector } from "@/lib/procurement/connectors/sell2wales";
import { getServiceSupabase } from "@/lib/supabase-service";
import type { ProcurementSourceConnector } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // sources can be slow; allow a full sweep

const ALL_CONNECTORS: ProcurementSourceConnector[] = [
  findTenderConnector,
  contractsFinderConnector,
  publicContractsScotlandConnector,
  sell2walesConnector,
];

// "Sync all" pulls a fixed recent window for EVERY enabled source so the result
// is predictable ("the last week") rather than each source's incremental lag.
const SYNC_ALL_DAYS = Number(process.env.PROCUREMENT_SYNC_ALL_DAYS ?? "7");
// Generous per-source page cap (a week of CF/FTS is ~15-20 pages); the time
// budget below is the real guard. Anything not reached resumes via the cursor.
const MAX_PAGES = Number(process.env.PROCUREMENT_SYNC_ALL_MAX_PAGES ?? "50");
const OVERALL_BUDGET_MS = 240_000; // stay under maxDuration (300s)

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = getServiceSupabase();
  const { data: enabledSources } = await supabase
    .from("sources")
    .select("name")
    .eq("enabled", true);

  const enabledNames = new Set((enabledSources ?? []).map((s) => s.name));
  const enabledConnectors = ALL_CONNECTORS.filter((c) =>
    enabledNames.has(c.sourceName),
  );

  const now = new Date();
  const fromDate = new Date(
    now.getTime() - SYNC_ALL_DAYS * 24 * 60 * 60 * 1000,
  );

  // Distinct hosts → run in parallel; each gets the full window + budget.
  const results = await Promise.allSettled(
    enabledConnectors.map((c) =>
      syncSource(c, {
        fromDate,
        toDate: now,
        maxPages: MAX_PAGES,
        timeBudgetMs: OVERALL_BUDGET_MS,
      }),
    ),
  );

  const summary = results.map((r, i) => {
    const connector = enabledConnectors[i];
    if (r.status === "fulfilled") return r.value;
    return {
      source: connector?.sourceName ?? "unknown",
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      fetched: 0,
      pages: 0,
      rawStored: 0,
      duplicatesSkipped: 0,
      opportunitiesUpserted: 0,
      opportunitiesErrored: 0,
      errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      hasMore: false,
      nextCursor: null,
    };
  });

  return NextResponse.json({ windowDays: SYNC_ALL_DAYS, results: summary });
}
