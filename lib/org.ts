import { NextResponse } from "next/server";
import { getServiceSupabase } from "./supabase-service";
import { getAuthUser } from "./supabase-server";

const isDemoMode =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

export type OrgRole = "owner" | "admin" | "member";
const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

/** Returns the org_id for the authenticated user, or null in demo mode. */
export async function getRequestOrgId(): Promise<string | null> {
  if (isDemoMode) return null;
  const user = await getAuthUser();
  if (!user) return null;
  return getOrgIdForUser(user.id);
}

/** The authenticated user's role within their org ('owner' in demo mode). */
export async function getRequestOrgRole(): Promise<OrgRole | null> {
  if (isDemoMode) return "owner";
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return (data?.role as OrgRole | undefined) ?? null;
}

/**
 * Returns null if the caller's org role is at least `min` (owner>admin>member),
 * otherwise a 401/403 NextResponse. Null in demo mode.
 */
export async function requireOrgRole(
  min: OrgRole,
): Promise<NextResponse | null> {
  if (isDemoMode) return null;
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.user_metadata?.is_guest === true && min !== "member") {
    return NextResponse.json(
      { error: "Guest workspaces cannot manage organisation access" },
      { status: 403 },
    );
  }
  const role = await getRequestOrgRole();
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    return NextResponse.json(
      { error: "Forbidden — insufficient organisation role" },
      { status: 403 },
    );
  }
  return null;
}

/** Looks up the first org the user belongs to. */
export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data?.org_id ?? null;
}

/**
 * On first login: creates a private org for the user if they have none.
 * Anonymous users are supported: they receive a private "Guest workspace"
 * while a synthetic membership email keeps the existing schema unchanged.
 *
 * Each user gets their own isolated org — data isolation is enforced by org_id.
 */
export async function getOrCreateOrgForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  const supabase = getServiceSupabase();
  const normalizedEmail = email?.trim().toLowerCase() || null;

  // Already a member of an org?
  const existing = await getOrgIdForUser(userId);
  if (existing) {
    // If an anonymous account is later upgraded to a real email identity,
    // replace the synthetic membership email while preserving the same org/data.
    if (normalizedEmail) {
      await supabase
        .from("org_memberships")
        .update({ email: normalizedEmail })
        .eq("org_id", existing)
        .eq("user_id", userId)
        .like("email", "guest-%@anonymous.local");
    }
    return existing;
  }

  // Real email users can accept a pending team invitation. Anonymous users skip
  // this path because there is no verified email to match against an invite.
  if (normalizedEmail) {
    const { data: invite } = await supabase
      .from("org_invitations")
      .select("id, org_id, role")
      .eq("status", "pending")
      .ilike("email", normalizedEmail)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite) {
      await supabase
        .from("org_memberships")
        .upsert(
          {
            org_id: invite.org_id,
            user_id: userId,
            email: normalizedEmail,
            role: invite.role,
          },
          { onConflict: "org_id,user_id" },
        );
      await supabase
        .from("org_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      return invite.org_id;
    }
  }

  const membershipEmail =
    normalizedEmail ?? `guest-${userId}@anonymous.local`;
  const orgName = normalizedEmail ?? "Guest workspace";

  // Email users get a readable email-based slug. Anonymous workspaces use the
  // auth user UUID, which is already unique and avoids a schema migration.
  const slug = normalizedEmail
    ? normalizedEmail
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    : `guest-${userId}`;

  const { data: newOrg, error } = await supabase
    .from("orgs")
    .insert({ name: orgName, slug })
    .select("id")
    .single();

  if (error || !newOrg) {
    throw new Error(`Failed to create org: ${error?.message}`);
  }

  await supabase
    .from("org_memberships")
    .upsert(
      {
        org_id: newOrg.id,
        user_id: userId,
        email: membershipEmail,
        role: "owner",
      },
      { onConflict: "org_id,user_id" },
    );

  return newOrg.id;
}
