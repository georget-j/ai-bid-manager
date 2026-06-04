import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  keywords: z.array(z.string()).optional(),
  cpv_codes: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  buyers: z.array(z.string()).optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  stages: z.array(z.string()).optional(),
  channel: z.string().optional(),
  enabled: z.boolean().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

async function verifyOwnership(id: string, orgId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("alert_rules")
    .select("id, org_id")
    .eq("id", id)
    .single();
  return data?.org_id === orgId ? data : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const owned = await verifyOwnership(id, orgId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("alert_rules")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const owned = await verifyOwnership(id, orgId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getServiceSupabase();
  await supabase.from("alert_rules").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
