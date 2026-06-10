import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getGrant } from "@/lib/grants/data";
import { createResponseDraft } from "@/lib/responses/drafts";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST — start a grant application: create a response draft linked to this grant
 * (reuses the responses workspace + KB-grounded AI drafting). Returns the draftId.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const grant = await getGrant(id);
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = await createResponseDraft(orgId, {
    rfp_title: `${grant.title} — Application`,
    grant_id: id,
    status: "draft",
  });
  return NextResponse.json({ draftId: draft.id });
}
