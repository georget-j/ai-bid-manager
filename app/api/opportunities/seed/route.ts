import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { upsertSeedOpportunities } from "@/lib/procurement/data";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const result = await upsertSeedOpportunities();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
