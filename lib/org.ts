import { getServiceSupabase } from "./supabase";
import { getAuthUser } from "./supabase-server";

const isDemoMode =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

/** Returns the org_id for the authenticated user, or null in demo mode. */
export async function getRequestOrgId(): Promise<string | null> {
  if (isDemoMode) return null;
  const user = await getAuthUser();
  if (!user) return null;
  return getOrgIdForUser(user.id);
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
