import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { updateReport, deleteReport } from "@/lib/grants/reports";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** PATCH — update a report (status / due date / title / notes). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const patch = (await req.json()) as {
    status?: string;
    due_at?: string | null;
    title?: string;
    notes?: string | null;
  };
  const report = await updateReport(orgId, id, patch);
  if (!report)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report });
}

/** DELETE — remove a report. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteReport(orgId, id);
  return NextResponse.json({ ok: true });
}
