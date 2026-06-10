import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { listReportsForDraft, createReport } from "@/lib/grants/reports";

export const dynamic = "force-dynamic";

/** GET ?draftId= — reports for an application. */
export async function GET(req: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const draftId = req.nextUrl.searchParams.get("draftId");
  if (!draftId)
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  return NextResponse.json({
    reports: await listReportsForDraft(orgId, draftId),
  });
}

/** POST — add a report milestone to an application. */
export async function POST(req: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    draft_id?: string;
    grant_id?: string | null;
    title?: string;
    due_at?: string | null;
  };
  if (!body.draft_id || !body.title?.trim())
    return NextResponse.json(
      { error: "draft_id and title required" },
      { status: 400 },
    );
  const report = await createReport(orgId, {
    draft_id: body.draft_id,
    grant_id: body.grant_id ?? null,
    title: body.title,
    due_at: body.due_at ?? null,
  });
  return NextResponse.json({ report });
}
