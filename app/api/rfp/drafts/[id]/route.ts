import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import {
  getResponseDraft,
  patchResponseDraft,
  deleteResponseDraft,
} from "@/lib/responses/drafts";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// Application lifecycle stages (migration 064): drafting -> submitted ->
// awarded / unsuccessful. Anything else is a client bug — reject it.
const STAGES = ["drafting", "submitted", "awarded", "unsuccessful"] as const;

const BudgetLineSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
});

// Structured-but-permissive mirror of DraftInput — the column whitelist in
// patchResponseDraft stays the final word on what reaches the DB.
const PatchSchema = z.object({
  rfp_title: z.string().optional(),
  opportunity_id: z.string().nullable().optional(),
  grant_id: z.string().nullable().optional(),
  status: z.string().optional(),
  stage: z.enum(STAGES).optional(),
  submitted_at: z.string().nullable().optional(),
  extracted_questions: z.array(z.record(z.string(), z.unknown())).optional(),
  selected_question_ids: z.array(z.number()).optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
  latest_rfp_run_id: z.string().nullable().optional(),
  budget: z
    .object({
      costs: z.array(BudgetLineSchema),
      funding: z.array(BudgetLineSchema),
    })
    .nullable()
    .optional(),
});

/** GET — a single draft (org-scoped). */
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const draft = await getResponseDraft(id, orgId);
    if (!draft)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[rfp/drafts] failed to load draft:", err);
    return NextResponse.json(
      { error: "Failed to load draft" },
      { status: 500 },
    );
  }
}

/** PATCH — autosave a draft (partial update). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const draft = await patchResponseDraft(id, orgId, parsed.data);
    if (!draft)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[rfp/drafts] failed to update draft:", err);
    return NextResponse.json(
      { error: "Failed to update draft" },
      { status: 500 },
    );
  }
}

/** DELETE — remove a draft. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteResponseDraft(id, orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rfp/drafts] failed to delete draft:", err);
    return NextResponse.json(
      { error: "Failed to delete draft" },
      { status: 500 },
    );
  }
}
