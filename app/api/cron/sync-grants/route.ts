import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { allGrantConnectors } from "@/lib/grants/connectors";
import { syncGrantSource, seedGrantSources } from "@/lib/grants/sync";
import { enrichPendingGrants } from "@/lib/grants/enrich";
import { generatePendingGuides } from "@/lib/grants/guide";
import { embedPendingGrants } from "@/lib/grants/embed";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Per-connector time budget (they run in parallel, so this bounds wall-clock for
// the whole sync pass). Kept under maxDuration with headroom for the capped
// enrich/guide/embed passes that follow — anything unfinished resumes via the
// stored cursor on the next run.
const SYNC_BUDGET_MS = 210_000;

// Per-source page caps. For HTML-walking sources one "page" = 1 listing fetch
// plus ~10 politely-paced detail-page fetches. A capped run saves its cursor and
// the engine resumes next night.
const DEFAULT_MAX_PAGES = 25;
const PER_SOURCE_MAX_PAGES: Record<string, number> = {
  // 13 lets a full UKRI walk (~12 listing pages, ~130 requests at 150ms pacing
  // ≈ 20s of pacing + fetch time) complete in ONE run, well inside the 210s
  // budget. A complete from-page-1 walk clears the cursor and lets the
  // delisting prune qualify (it never runs on capped/cursor-resumed walks).
  "ukri-funding-finder": 13,
};

/** Scheduled grant sync — Bearer CRON_SECRET. Syncs all enabled grant sources. */
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

  const results = await Promise.allSettled(
    connectors.map((c) =>
      syncGrantSource(c, {
        maxPages: PER_SOURCE_MAX_PAGES[c.sourceName] ?? DEFAULT_MAX_PAGES,
        timeBudgetMs: SYNC_BUDGET_MS,
        trigger: "cron",
      }),
    ),
  );

  // Nightly status sweep — backstop for ALL sources, including disabled ones
  // (the per-source prune only covers enabled listsAllOpenCalls sources): any
  // grant still marked open/forthcoming whose deadline has passed is closed.
  // Grants with no deadline (e.g. rolling calls) are untouched.
  let deadlinesSwept = 0;
  try {
    const nowIso = new Date().toISOString();
    const { data: swept, error: sweepErr } = await supabase
      .from("grants")
      .update({ status: "closed", updated_at: nowIso })
      .in("status", ["open", "forthcoming"])
      .not("deadline_at", "is", null)
      .lt("deadline_at", nowIso)
      .select("id");
    if (sweepErr) {
      console.error(`grants deadline sweep failed: ${sweepErr.message}`);
    } else {
      deadlinesSwept = (swept ?? []).length;
    }
  } catch (err) {
    console.error("grants deadline sweep failed:", err);
  }

  // Top up deep details for a capped batch of open grants (lazy enrichment also runs
  // on first view; this fills the rest in over a few daily runs without hammering).
  let enriched = { enriched: 0, attempted: 0 };
  try {
    enriched = await enrichPendingGrants(25);
  } catch {
    /* best-effort */
  }

  // Generate how-to-apply guides for a capped batch of enriched grants that lack one.
  let guides = { generated: 0, attempted: 0 };
  try {
    guides = await generatePendingGuides(10);
  } catch {
    /* best-effort */
  }

  // Embed a capped batch of applyable grants for semantic matching.
  let embedded = { embedded: 0, attempted: 0 };
  try {
    embedded = await embedPendingGrants(40);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    ran: connectors.map((c) => c.sourceName),
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { error: String(r.reason) },
    ),
    deadlinesSwept,
    enriched,
    guides,
    embedded,
  });
}
