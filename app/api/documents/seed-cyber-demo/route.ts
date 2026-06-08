import { NextRequest, NextResponse } from "next/server";
import {
  seedCyberDemoDocuments,
  seedCyberDemoProfile,
} from "@/lib/cyber-demo-seed";
import { getRequestOrgId } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "seed");
  if (limited) return limited;

  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "No organisation found" },
      { status: 403 },
    );
  }

  try {
    const result = await seedCyberDemoDocuments(orgId);
    // Build out the Fortis Cyber account profile too (fills empty fields only).
    const profile = await seedCyberDemoProfile(orgId);
    return NextResponse.json({ ...result, profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[seed-cyber-demo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
