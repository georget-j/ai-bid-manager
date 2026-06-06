import { NextRequest, NextResponse } from "next/server";
import { syncSource } from "@/lib/procurement/sync";
import { findTenderConnector } from "@/lib/procurement/connectors/find-tender";
import { contractsFinderConnector } from "@/lib/procurement/connectors/contracts-finder";
import { publicContractsScotlandConnector } from "@/lib/procurement/connectors/public-contracts-scotland";
import { sell2walesConnector } from "@/lib/procurement/connectors/sell2wales";
import { getServiceSupabase } from "@/lib/supabase-service";
import type { ProcurementSourceConnector } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — sources can be slow

const ALL_CONNECTORS: ProcurementSourceConnector[] = [
  findTenderConnector,
  contractsFinderConnector,
  publicContractsScotlandConnector,
  sell2walesConnector,
];

export async function GET(request: NextRequest) {
  // Require CRON_SECRET — same pattern as /api/cron/escalate
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET environment variable is not configured" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: enabledSources } = await supabase
    .from("sources")
    .select("name")
    .eq("enabled", true);

  const enabledNames = new Set((enabledSources ?? []).map((s) => s.name));
  const enabled = ALL_CONNECTORS.filter((c) => enabledNames.has(c.sourceName));

  if (enabled.length === 0) {
    return NextResponse.json({ message: "No sources enabled", results: [] });
  }

  // Pull as much as fits in the function's time budget rather than a tiny fixed
  // page cap (was 5 pages ≈ 500 notices/run). Higher cap + per-source wall-clock
  // budget under maxDuration; anything not reached resumes via the saved cursor.
  const MAX_PAGES = Number(process.env.PROCUREMENT_CRON_MAX_PAGES ?? "25");
  const OVERALL_BUDGET_MS = 240_000; // stay well under maxDuration (300s)
  const startedAt = Date.now();

  // Run sequentially to avoid hammering APIs in parallel
  const results = [];
  for (let i = 0; i < enabled.length; i++) {
    const connector = enabled[i];
    const remaining = OVERALL_BUDGET_MS - (Date.now() - startedAt);
    const timeBudgetMs = Math.max(
      20_000,
      Math.floor(remaining / (enabled.length - i)),
    );
    try {
      const result = await syncSource(connector, {
        maxPages: MAX_PAGES,
        timeBudgetMs,
      });
      results.push(result);
    } catch (err) {
      results.push({
        source: connector.sourceName,
        error: err instanceof Error ? err.message : String(err),
        fetched: 0,
        rawStored: 0,
        duplicatesSkipped: 0,
        opportunitiesUpserted: 0,
        opportunitiesErrored: 0,
        errors: [],
        hasMore: false,
        nextCursor: null,
      });
    }
  }

  const totalNew = results.reduce(
    (s, r) => s + (r.opportunitiesUpserted ?? 0),
    0,
  );
  console.log(
    `[cron/sync-sources] synced ${enabled.length} sources, ${totalNew} new opportunities`,
  );

  return NextResponse.json({ ok: true, results });
}
