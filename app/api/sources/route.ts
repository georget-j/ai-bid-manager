import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { seedSources } from "@/lib/procurement/sync";

export async function GET() {
  const supabase = getServiceSupabase();

  // Auto-seed source rows on first access
  const { count } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    await seedSources();
  }

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .order("display_name");

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch sources: ${error.message}` },
      { status: 500 },
    );
  }

  // Enrich with opportunity counts
  const enriched = await Promise.all(
    (data ?? []).map(async (source) => {
      const { count: oppCount } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);

      const { count: rawCount } = await supabase
        .from("raw_notices")
        .select("id", { count: "exact", head: true })
        .eq("source_name", source.name);

      return {
        ...source,
        opportunity_count: oppCount ?? 0,
        raw_count: rawCount ?? 0,
      };
    }),
  );

  return NextResponse.json({ sources: enriched });
}
