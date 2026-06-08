import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import {
  getResponseDraft,
  patchResponseDraft,
  deleteResponseDraft,
  type DraftInput,
} from "@/lib/responses/drafts";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET — a single draft (org-scoped). */
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const draft = await getResponseDraft(id, orgId);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ draft });
}

/** PATCH — autosave a draft (partial update). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let patch: DraftInput;
  try {
    patch = (await request.json()) as DraftInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const draft = await patchResponseDraft(id, orgId, patch);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ draft });
}

/** DELETE — remove a draft. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteResponseDraft(id, orgId);
  return NextResponse.json({ ok: true });
}
