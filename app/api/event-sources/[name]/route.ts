import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ name: string }>;
}

/** PATCH — toggle an investor event source enabled/disabled (operator only). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireOperator();
  if (gate) return gate;

  const { name } = await params;
  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be boolean" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  // investor_event_sources has no updated_at column (keyed by name, run-state
  // only) — just flip the flag.
  const { error } = await supabase
    .from("investor_event_sources")
    .update({ enabled: body.enabled })
    .eq("name", name);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
