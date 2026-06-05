import { NextRequest, NextResponse } from "next/server";
import { seedCyberDemoDocuments } from "@/lib/cyber-demo-seed";
import { getRequestOrgId } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";

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
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[seed-cyber-demo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
