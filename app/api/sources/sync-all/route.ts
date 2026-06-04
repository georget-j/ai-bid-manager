import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { syncSource } from "@/lib/procurement/sync";
import { findTenderConnector } from "@/lib/procurement/connectors/find-tender";
import { contractsFinderConnector } from "@/lib/procurement/connectors/contracts-finder";
import { publicContractsScotlandConnector } from "@/lib/procurement/connectors/public-contracts-scotland";
import { sell2walesConnector } from "@/lib/procurement/connectors/sell2wales";
import { getServiceSupabase } from "@/lib/supabase";
import type { ProcurementSourceConnector } from "@/lib/procurement/types";

const ALL_CONNECTORS: ProcurementSourceConnector[] = [
  findTenderConnector,
  contractsFinderConnector,
  publicContractsScotlandConnector,
  sell2walesConnector,
];

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = getServiceSupabase();

  // Only sync enabled sources
  const { data: enabledSources } = await supabase
    .from("sources")
    .select("name")
    .eq("enabled", true);

  const enabledNames = new Set((enabledSources ?? []).map((s) => s.name));

  const results = await Promise.allSettled(
    ALL_CONNECTORS.filter((c) => enabledNames.has(c.sourceName)).map((c) =>
      syncSource(c),
    ),
  );

  const summary = results.map((r, i) => {
    const connector = ALL_CONNECTORS.filter((c) =>
      enabledNames.has(c.sourceName),
    )[i];
    if (r.status === "fulfilled") return r.value;
    return {
      source: connector?.sourceName ?? "unknown",
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      fetched: 0,
      rawStored: 0,
      duplicatesSkipped: 0,
      opportunitiesUpserted: 0,
      opportunitiesErrored: 0,
      errors: [],
      hasMore: false,
      nextCursor: null,
    };
  });

  return NextResponse.json({ results: summary });
}
