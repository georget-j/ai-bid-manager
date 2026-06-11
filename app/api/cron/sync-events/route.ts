import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { allEventConnectors } from "@/lib/events/connectors";
import { syncEventSource, seedEventSources } from "@/lib/events/sync";
import { seedInvestorOrganizers } from "@/lib/events/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Per-connector time budget (they run in parallel, so this bounds wall-clock
// for the whole sync pass). Event sync has no LLM passes after it (unlike
// sync-grants' enrich/guide/embed), so the budget can use most of maxDuration —
// anything unfinished resumes via the stored cursor on the next run.
const SYNC_BUDGET_MS = 240_000;

// Per-source page caps — event feeds are small ("what's coming up"), so the
// default suffices; add per-source overrides here if a feed grows.
const DEFAULT_MAX_PAGES = 20;
const PER_SOURCE_MAX_PAGES: Record<string, number> = {};

/** Scheduled investor-event sync — Bearer CRON_SECRET. Syncs all enabled event sources. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET environment variable is not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const results = await Promise.allSettled(
    connectors.map((c) =>
      syncEventSource(c, {
        maxPages: PER_SOURCE_MAX_PAGES[c.sourceName] ?? DEFAULT_MAX_PAGES,
        timeBudgetMs: SYNC_BUDGET_MS,
      }),
    ),
  );

  return NextResponse.json({
    ran: connectors.map((c) => c.sourceName),
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { error: String(r.reason) },
    ),
  });
}
