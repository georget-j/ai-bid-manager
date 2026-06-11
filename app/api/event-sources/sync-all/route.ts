import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-service";
import { allEventConnectors } from "@/lib/events/connectors";
import { syncEventSource, seedEventSources } from "@/lib/events/sync";
import { seedInvestorOrganizers } from "@/lib/events/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // sources can be slow; allow a full sweep

// Per-source page cap — mirrors the nightly cron (app/api/cron/sync-events).
// Anything not reached resumes via the stored cursor on the next run.
const MAX_PAGES = Number(process.env.EVENTS_SYNC_ALL_MAX_PAGES ?? "20");
const OVERALL_BUDGET_MS = 240_000; // stay under maxDuration (300s)

/** POST — manually sync every enabled event source with a connector (operator only). */
export async function POST() {
  const denied = await requireOperator();
  if (denied) return denied;

  await seedEventSources();
  // Organizer catalog must exist before syncing so events link organizer_id.
  await seedInvestorOrganizers();
  const supabase = getServiceSupabase();
  const { data: sources } = await supabase
    .from("investor_event_sources")
    .select("name, enabled");
  const enabled = new Set(
    (sources ?? []).filter((s) => s.enabled).map((s) => s.name),
  );

  const connectors = allEventConnectors().filter((c) =>
    enabled.has(c.sourceName),
  );

  // Distinct hosts → run in parallel; each gets the full time budget.
  const results = await Promise.allSettled(
    connectors.map((c) =>
      syncEventSource(c, {
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
      eventsUpserted: 0,
      eventsErrored: 0,
      errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      hasMore: false,
      nextCursor: null,
    };
  });

  return NextResponse.json({
    ran: connectors.map((c) => c.sourceName),
    results: summary,
  });
}
