import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId, requireOrgRole } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];

async function loadMembership(membershipId: string, orgId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("org_memberships")
    .select("id, org_id, role")
    .eq("id", membershipId)
    .maybeSingle();
  if (!data || data.org_id !== orgId) return null;
  return data as { id: string; org_id: string; role: Role };
}

async function ownerCount(orgId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("org_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner");
  return count ?? 0;
}

/** PATCH — change a member's role (owner/admin only; can't demote the last owner). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = await requireOrgRole("admin");
  if (gate) return gate;
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "No organisation" }, { status: 400 });

  const { id } = await params;
  const membership = await loadMembership(id, orgId);
  if (!membership)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!ROLES.includes(body.role as Role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role = body.role as Role;

  // Don't allow demoting the last remaining owner.
  if (membership.role === "owner" && role !== "owner") {
    if ((await ownerCount(orgId)) <= 1) {
      return NextResponse.json(
        { error: "An organisation must keep at least one owner." },
        { status: 409 },
      );
    }
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("org_memberships")
    .update({ role })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a member from the org (owner/admin only; not the last owner). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const gate = await requireOrgRole("admin");
  if (gate) return gate;
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "No organisation" }, { status: 400 });

  const { id } = await params;
  const membership = await loadMembership(id, orgId);
  if (!membership)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (membership.role === "owner" && (await ownerCount(orgId)) <= 1) {
    return NextResponse.json(
      { error: "An organisation must keep at least one owner." },
      { status: 409 },
    );
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("org_memberships")
    .delete()
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
