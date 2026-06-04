import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase-server";
import { getIsAdmin } from "@/lib/admin-auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isDemoMode) {
    return NextResponse.json({ isAdmin: true, email: null });
  }
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ isAdmin: false, email: null });
  }
  const isAdmin = await getIsAdmin();
  return NextResponse.json({ isAdmin, email: user.email ?? null });
}
