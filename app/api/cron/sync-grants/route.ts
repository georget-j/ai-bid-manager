import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { allGrantConnectors } from "@/lib/grants/connectors";
import { syncGrantSource, seedGrantSources } from "@/lib/grants/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OVERALL_BUDGET_MS = 240_000;

/** Scheduled grant sync — Bearer CRON_SECRET. Syncs all enabled grant sources. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
      syncGrantSource(c, { maxPages: 25, timeBudgetMs: OVERALL_BUDGET_MS }),
    ),
  );

  return NextResponse.json({
    ran: connectors.map((c) => c.sourceName),
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { error: String(r.reason) },
    ),
  });
}
