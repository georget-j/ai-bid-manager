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

  // ── Bounded rolling historical catch-up ──────────────────────────────────
  // If wall-clock budget remains, sweep ONE source one window further back into
  // history. The watermark advances every run (even on empty windows) so the
  // sweep can't stall, and completes once it reaches the 2-year floor.
  const HISTORY_FLOOR = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const CHUNK_MS = 14 * 24 * 60 * 60 * 1000;
  const catchUp: Array<Record<string, unknown>> = [];
  const byName = new Map(ALL_CONNECTORS.map((c) => [c.sourceName, c]));

  if (Date.now() - startedAt < OVERALL_BUDGET_MS - 30_000) {
    const { data: srcRows } = await supabase
      .from("sources")
      .select("name, backfill_watermark, backfill_complete")
      .eq("enabled", true)
      .eq("backfill_complete", false);

    for (const s of srcRows ?? []) {
      const connector = byName.get(s.name);
      if (!connector) continue;

      const wm = s.backfill_watermark
        ? new Date(s.backfill_watermark)
        : new Date();
      if (wm.getTime() <= HISTORY_FLOOR.getTime()) {
        await supabase
          .from("sources")
          .update({ backfill_complete: true })
          .eq("name", s.name);
        continue;
      }

      const to = wm;
      const from = new Date(
        Math.max(HISTORY_FLOOR.getTime(), wm.getTime() - CHUNK_MS),
      );
      const remaining = OVERALL_BUDGET_MS - (Date.now() - startedAt);
      try {
        const res = await syncSource(connector, {
          fromDate: from,
          toDate: to,
          backfill: true, // don't disturb forward-sync state/health
          maxPages: 8,
          timeBudgetMs: Math.max(15_000, remaining - 10_000),
        });
        catchUp.push({
          source: s.name,
          window: `${from.toISOString().slice(0, 10)}..${to
            .toISOString()
            .slice(0, 10)}`,
          fetched: res.fetched,
          upserted: res.opportunitiesUpserted,
        });
      } catch (err) {
        catchUp.push({
          source: s.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Advance regardless so an empty window never stalls the sweep.
      await supabase
        .from("sources")
        .update({
          backfill_watermark: from.toISOString(),
          backfill_complete: from.getTime() <= HISTORY_FLOOR.getTime(),
        })
        .eq("name", s.name);

      break; // one source per run to stay within the time budget
    }
  }

  const totalNew = results.reduce(
    (s, r) => s + (r.opportunitiesUpserted ?? 0),
    0,
  );
  console.log(
    `[cron/sync-sources] synced ${enabled.length} sources, ${totalNew} new opportunities, ${catchUp.length} catch-up sweep(s)`,
  );

  return NextResponse.json({ ok: true, results, catchUp });
}
