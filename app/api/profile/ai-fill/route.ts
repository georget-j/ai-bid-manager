import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgProfile } from "@/lib/procurement/data";
import { draftProfileProposals } from "@/lib/profile-ai";

export const dynamic = "force-dynamic";
// Retrieval (4 hybrid searches) + website fetch + registers + one LLM call.
export const maxDuration = 60;

/**
 * POST { website? } — draft profile-field proposals from the org's evidence
 * library, website and the public registers. Draft-only: returns proposals for
 * the user to review and apply into the form; nothing is written here. The
 * normal POST /api/profile save is the only write path.
 */
export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Shares the per-IP bucket with the other user-initiated AI drafting route
  // (/api/ask) — each fill makes several model/embedding calls, so it must not
  // be free to hammer.
  const limited = await checkRateLimit(request, "ask");
  if (limited) return limited;

  // Optional body: { website } lets the form pass an address the user has
  // typed but not saved yet. An empty or non-JSON body is fine.
  let website: string | null = null;
  try {
    const body = (await request.json()) as { website?: unknown };
    if (typeof body?.website === "string" && body.website.trim()) {
      website = body.website.trim();
    }
  } catch {
    // No body — fall back to the saved profile's website.
  }

  try {
    const profile = await getOrgProfile(orgId);
    const draft = await draftProfileProposals({ orgId, profile, website });
    return NextResponse.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
