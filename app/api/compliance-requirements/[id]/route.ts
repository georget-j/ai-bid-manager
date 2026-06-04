import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

const PatchSchema = z.object({
  draft_answer: z.string().optional(),
  status: z.string().optional(),
  response_owner: z.string().nullable().optional(),
  evidence_needed: z.string().nullable().optional(),
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Verify ownership via matrix join
  const { data: req } = await supabase
    .from("compliance_requirements")
    .select("id, compliance_matrix_id, compliance_matrices!inner(org_id)")
    .eq("id", id)
    .single();

  const matrixOrgId =
    req &&
    !Array.isArray(req.compliance_matrices) &&
    (req.compliance_matrices as { org_id: string } | null)?.org_id;

  if (!req || matrixOrgId !== orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("compliance_requirements")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requirement: data });
}
