import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getEventConnector } from "@/lib/events/connectors";
import { seedEventSources } from "@/lib/events/sync";
import { seedInvestorOrganizers } from "@/lib/events/seed";

export async function GET() {
  const supabase = getServiceSupabase();

  const { count } = await supabase
    .from("investor_event_sources")
    .select("name", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    await seedEventSources();
  }
  // Curated organizer catalog — insert-only-missing, so safe to run every load.
  // Synced events link to these via organizer_id, so they must exist before the
  // first sync.
  await seedInvestorOrganizers();

  const { data, error } = await supabase
    .from("investor_event_sources")
    .select("*")
    .order("display_name");
  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch event sources: ${error.message}` },
      { status: 500 },
    );
  }

  const enriched = await Promise.all(
    (data ?? []).map(async (source) => {
      const { count: eventCount } = await supabase
        .from("investor_events")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);
      const { count: rawCount } = await supabase
        .from("raw_event_notices")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);
      return {
        ...source,
        event_count: eventCount ?? 0,
        raw_count: rawCount ?? 0,
        // Whether a sync connector exists for this source — the UI gates its
        // "Sync now" button on this instead of offering a dead button.
        hasConnector: Boolean(getEventConnector(source.name)),
      };
    }),
  );

  return NextResponse.json({ sources: enriched });
}
