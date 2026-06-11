import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getGrantConnector } from "@/lib/grants/connectors";
import { syncGrantSource } from "@/lib/grants/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Params {
  params: Promise<{ name: string }>;
}

/** POST — manually sync one grant source (operator only). */
export async function POST(req: NextRequest, { params }: Params) {
  const gate = await requireOperator();
  if (gate) return gate;

  const { name } = await params;
  const connector = getGrantConnector(name);
  if (!connector) {
    return NextResponse.json(
      { error: `No connector for grant source "${name}"` },
      { status: 404 },
    );
  }

  // Refuse disabled sources: syncing one strands a cursor (and sync state) on a
  // source the nightly cron will never resume, and "disabled" must mean OFF.
  const supabase = getServiceSupabase();
  const { data: sourceRow } = await supabase
    .from("grant_sources")
    .select("enabled")
    .eq("name", name)
    .single();
  if (sourceRow && sourceRow.enabled === false) {
    return NextResponse.json(
      { error: "Source is disabled — enable it first." },
      { status: 409 },
    );
  }

  let body: { fromDate?: string; toDate?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine */
  }

  const result = await syncGrantSource(connector, {
    fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
    toDate: body.toDate ? new Date(body.toDate) : undefined,
    trigger: "manual",
  });
  return NextResponse.json(result);
}
