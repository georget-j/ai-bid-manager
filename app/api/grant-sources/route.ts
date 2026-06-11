import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getGrantConnector } from "@/lib/grants/connectors";
import { seedGrantSources } from "@/lib/grants/sync";

export async function GET() {
  const supabase = getServiceSupabase();

  const { count } = await supabase
    .from("grant_sources")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    await seedGrantSources();
  }

  const { data, error } = await supabase
    .from("grant_sources")
    .select("*")
    .order("display_name");
  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch grant sources: ${error.message}` },
      { status: 500 },
    );
  }

  const enriched = await Promise.all(
    (data ?? []).map(async (source) => {
      const { count: grantCount } = await supabase
        .from("grants")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);
      const { count: rawCount } = await supabase
        .from("raw_grant_notices")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);
      return {
        ...source,
        grant_count: grantCount ?? 0,
        raw_count: rawCount ?? 0,
        // Whether a sync connector exists for this source — the UI gates its
        // "Sync now" button on this instead of offering a dead button.
        hasConnector: Boolean(getGrantConnector(source.name)),
      };
    }),
  );

  return NextResponse.json({ sources: enriched });
}
