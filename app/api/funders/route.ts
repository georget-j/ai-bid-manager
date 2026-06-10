import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/** GET — funder directory (aggregated from grants via funder_aggregates RPC). */
export async function GET() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("funder_aggregates", {
    p_limit: 200,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ funders: data ?? [] });
}
