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
 * Each user gets their own isolated org — data isolation is enforced by org_id.
 * Called from the auth callback.
 */
export async function getOrCreateOrgForUser(
  userId: string,
  email: string,
): Promise<string> {
  const supabase = getServiceSupabase();

  // Already a member of an org?
  const existing = await getOrgIdForUser(userId);
  if (existing) return existing;

  // Accept a pending team invitation for this email → join the inviting org with the
  // invited role (instead of creating a private org). Email is verified by Supabase
  // Auth, so matching on email is safe.
  const { data: invite } = await supabase
    .from("org_invitations")
    .select("id, org_id, role")
    .eq("status", "pending")
    .ilike("email", email)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invite) {
    await supabase
      .from("org_memberships")
      .upsert(
        { org_id: invite.org_id, user_id: userId, email, role: invite.role },
        { onConflict: "org_id,user_id" },
      );
    await supabase
      .from("org_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    return invite.org_id;
  }

  // Create a new org for this user. Use the full sanitized email as slug to
  // guarantee uniqueness (email addresses are unique in Supabase Auth).
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: newOrg, error } = await supabase
    .from("orgs")
    .insert({ name: email, slug })
    .select("id")
    .single();

  if (error || !newOrg) {
    throw new Error(`Failed to create org: ${error?.message}`);
  }

  await supabase
    .from("org_memberships")
    .upsert(
      { org_id: newOrg.id, user_id: userId, email, role: "owner" },
      { onConflict: "org_id,user_id" },
    );

  return newOrg.id;
}
