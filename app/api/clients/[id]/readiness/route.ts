import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { scoreReadiness, VERTICAL_CHECKLISTS } from "@/lib/readiness";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;
  const supabase = getServiceSupabase();

  const { data: client } = await supabase
    .from("clients")
    .select("id, vertical")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!client)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vertical = client.vertical ?? "";

  if (!VERTICAL_CHECKLISTS[vertical]) {
    return NextResponse.json({
      supported: false,
      vertical,
      message:
        "No checklist available for this vertical yet. IT/Cyber and Facilities checklists are supported.",
    });
  }

  const { data: evidence } = await supabase
    .from("evidence_items")
    .select("id, title, evidence_type, status, notes")
    .eq("org_id", orgId)
    .eq("client_id", clientId);

  const readiness = scoreReadiness(vertical, evidence ?? []);

  return NextResponse.json({ supported: true, vertical, ...readiness });
}
