import { NextResponse } from "next/server";
import { getAuthUser } from "./supabase-server";
import { isDemoMode, env } from "./env";

/**
 * "Platform operator" = an email on the ADMIN_EMAILS allowlist. Operators manage
 * GLOBAL system config (procurement sources, review routing, integrations). This is
 * distinct from a user's per-org role (owner/admin/member); see lib/org.ts.
 */
export async function getIsOperator(): Promise<boolean> {
  if (isDemoMode) return true;
  const user = await getAuthUser();
  if (!user?.email) return false;
  // When ADMIN_EMAILS is not configured, allow in non-production only (local dev convenience)
  if (env.ADMIN_EMAILS.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return env.ADMIN_EMAILS.includes(user.email);
}

/** @deprecated Use getIsOperator — "admin" now refers to the per-org role. */
export const getIsAdmin = getIsOperator;

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
 * Returns null if the caller is a platform operator (global system config).
 * Returns a 401/403 NextResponse if not. Always returns null in DEMO_MODE.
 */
export async function requireOperator(): Promise<NextResponse | null> {
  if (isDemoMode) return null;

  const user = await getAuthUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const operatorAllowed =
    env.ADMIN_EMAILS.length === 0
      ? process.env.NODE_ENV !== "production"
      : env.ADMIN_EMAILS.includes(user.email);

  if (!operatorAllowed) {
    return NextResponse.json(
      { error: "Forbidden — operator access required" },
      { status: 403 },
    );
  }

  return null;
}

/** @deprecated Use requireOperator — "admin" now refers to the per-org role. */
export const requireAdmin = requireOperator;
