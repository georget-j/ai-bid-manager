import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getGrant } from "@/lib/grants/data";
import { createResponseDraft } from "@/lib/responses/drafts";
import { enrichGrant } from "@/lib/grants/enrich";
import {
  buildGrantRequirementText,
  hasRequirementText,
} from "@/lib/grants/application";
import { extractRFPQuestions } from "@/lib/rfp-extract";
import { ingestGrantDocuments } from "@/lib/grants/ingest-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST — start a grant application. Reuses the responses workspace + KB-grounded AI
 * drafting, and goes further than a blank draft:
 *  1. ensures the grant's deep details are available (eligibility, how to apply, …),
 *  2. extracts the requirements/questions from that text and seeds the draft, so the
 *     user lands ready to respond,
 *  3. best-effort imports the grant's documents into the knowledge base so answers are
 *     grounded in them.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let grant = await getGrant(id);
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 1. Make sure we have the deep detail (eligibility / how to apply / documents).
  if (!grant.details) {
    const details = await enrichGrant(grant).catch(() => null);
    if (details) grant = { ...grant, details };
  }

  // 2. Extract requirements/questions from the grant's detailed text.
  let questions: Awaited<ReturnType<typeof extractRFPQuestions>> = [];
  if (hasRequirementText(grant)) {
    try {
      questions = await extractRFPQuestions(buildGrantRequirementText(grant));
    } catch {
      questions = []; // fall back to a blank draft (user can upload a form)
    }
  }

  const draft = await createResponseDraft(orgId, {
    rfp_title: `${grant.title} — Application`,
    grant_id: id,
    status: "draft",
    extracted_questions: questions,
    selected_question_ids: questions.map((q) => q.id),
  });

  // 3. Best-effort: import the grant's documents into the knowledge base (bounded so the
  //    request stays within maxDuration; the detail-page button imports any remainder).
  let documents = { ingested: 0, total: 0 };
  try {
    const r = await ingestGrantDocuments(orgId, grant, {
      maxSources: 6,
      deadlineMs: 30_000,
    });
    documents = { ingested: r.ingested, total: r.total };
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    draftId: draft.id,
    questions: questions.length,
    documents,
  });
}
