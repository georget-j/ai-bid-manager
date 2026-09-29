import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase-server";
import { getIsOperator } from "@/lib/admin-auth";
import { getRequestOrgRole } from "@/lib/org";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isDemoMode) {
    return NextResponse.json({
      isOperator: true,
      role: "owner",
      email: null,
      isGuest: false,
      // Back-compat: some clients still read isAdmin.
      isAdmin: true,
    });
  }
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({
      isOperator: false,
      role: null,
      email: null,
      isGuest: false,
      isAdmin: false,
    });
  }
  const [isOperator, role] = await Promise.all([
    getIsOperator(),
    getRequestOrgRole(),
  ]);
  return NextResponse.json({
    isOperator,
    role,
    email: user.email ?? null,
    isGuest: user.user_metadata?.is_guest === true,
    isAdmin: isOperator,
  });
}
