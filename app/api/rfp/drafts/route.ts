import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import {
  listResponseDrafts,
  createResponseDraft,
  type DraftInput,
} from "@/lib/responses/drafts";

export const dynamic = "force-dynamic";

/** GET — the org's response drafts (most-recently-updated first). */
export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const drafts = await listResponseDrafts(orgId);
  return NextResponse.json({ drafts });
}

/** POST — create a new response draft. */
export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: DraftInput;
  try {
    body = (await request.json()) as DraftInput;
  } catch {
    body = {};
  }
  const draft = await createResponseDraft(orgId, body);
  return NextResponse.json({ draft });
}
