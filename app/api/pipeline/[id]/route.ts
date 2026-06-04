import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

const PatchSchema = z.object({
  status: z.string().optional(),
  owner: z.string().nullable().optional(),
  bid_decision: z.string().nullable().optional(),
  decision_notes: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
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

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Verify the item belongs to this org
  const { data: existing } = await supabase
    .from("bid_pipeline")
    .select("id, org_id")
    .eq("id", id)
    .single();

  if (!existing || existing.org_id !== orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("bid_pipeline")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
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

  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from("bid_pipeline")
    .select("id, org_id")
    .eq("id", id)
    .single();

  if (!existing || existing.org_id !== orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await supabase.from("bid_pipeline").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
