import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId, requireOrgRole } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** DELETE — revoke a pending invitation (owner/admin only). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const gate = await requireOrgRole("admin");
  if (gate) return gate;
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "No organisation" }, { status: 400 });

  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data: invite } = await supabase
    .from("org_invitations")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!invite || invite.org_id !== orgId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("org_invitations")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
