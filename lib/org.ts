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
 * On first login: creates an org for the user if they have none,
 * otherwise joins the first existing org as a member.
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

  // Is there already an org in this instance?
  const { data: orgs } = await supabase
    .from("orgs")
    .select("id")
    .limit(1)
    .single();

  let orgId: string;

  if (orgs?.id) {
    // Join existing org as member
    orgId = orgs.id;
  } else {
    // First user — create the org
    const slug =
      email
        .split("@")[1]
        ?.replace(/[^a-z0-9]/gi, "-")
        .toLowerCase() ?? "default";

    const { data: newOrg, error } = await supabase
      .from("orgs")
      .insert({ name: slug, slug })
      .select("id")
      .single();

    if (error || !newOrg) {
      throw new Error(`Failed to create org: ${error?.message}`);
    }
    orgId = newOrg.id;
  }

  await supabase
    .from("org_memberships")
    .upsert(
      { org_id: orgId, user_id: userId, email, role: "member" },
      { onConflict: "org_id,user_id" },
    );

  return orgId;
}
