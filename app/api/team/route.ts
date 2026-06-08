import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getRequestOrgId, requireOrgRole } from "@/lib/org";
import { getAuthUser } from "@/lib/supabase-server";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];

/** GET — members + pending invitations for the caller's org (owner/admin only). */
export async function GET() {
  const gate = await requireOrgRole("admin");
  if (gate) return gate;

  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "No organisation" }, { status: 400 });

  const supabase = getServiceSupabase();
  const user = await getAuthUser();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("org_memberships")
      .select("id, user_id, email, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    members: members ?? [],
    invitations: invitations ?? [],
    currentUserId: user?.id ?? null,
  });
}

/** POST — invite a user to the caller's org by email + role (owner/admin only). */
export async function POST(request: NextRequest) {
  const gate = await requireOrgRole("admin");
  if (gate) return gate;

  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "No organisation" }, { status: 400 });

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = (
    ROLES.includes(body.role as Role) ? body.role : "member"
  ) as Role;

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Already a member of this org?
  const { data: existing } = await supabase
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That email is already a member of this organisation." },
      { status: 409 },
    );
  }

  const user = await getAuthUser();
  const token = randomUUID();

  const { data: invitation, error } = await supabase
    .from("org_invitations")
    .insert({
      org_id: orgId,
      email,
      role,
      token,
      invited_by: user?.email ?? null,
      status: "pending",
    })
    .select("id, email, role, status, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const inviteUrl = `${base}/login?invite=${token}`;

  return NextResponse.json({ invitation, inviteUrl });
}
