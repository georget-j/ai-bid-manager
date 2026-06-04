import { NextResponse } from "next/server";
import { getAuthUser } from "./supabase-server";
import { isDemoMode, env } from "./env";

export async function getIsAdmin(): Promise<boolean> {
  if (isDemoMode) return true;
  const user = await getAuthUser();
  if (!user?.email) return false;
  // When ADMIN_EMAILS is not configured, allow in non-production only (local dev convenience)
  if (env.ADMIN_EMAILS.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return env.ADMIN_EMAILS.includes(user.email);
}

/**
 * Returns null if the caller has a valid session.
 * Returns a 401 NextResponse if not.
 * Always returns null in DEMO_MODE.
 */
export async function requireAuth(): Promise<NextResponse | null> {
  if (isDemoMode) return null;
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Returns null if the caller is allowed to perform an admin action.
 * Returns a 401/403 NextResponse if not.
 * Always returns null in DEMO_MODE.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (isDemoMode) return null;

  const user = await getAuthUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminAllowed =
    env.ADMIN_EMAILS.length === 0
      ? process.env.NODE_ENV !== "production"
      : env.ADMIN_EMAILS.includes(user.email);

  if (!adminAllowed) {
    return NextResponse.json(
      { error: "Forbidden — admin access required" },
      { status: 403 },
    );
  }

  return null;
}
