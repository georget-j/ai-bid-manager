import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getGrant } from "@/lib/grants/data";
import { createResponseDraft } from "@/lib/responses/drafts";
import { enrichGrant } from "@/lib/grants/enrich";
import {
  buildGrantRequirementText,
  hasRequirementText,
  buildDocumentQuestionText,
  mergeExtractedQuestions,
  type GrantQuestion,
} from "@/lib/grants/application";
import { extractRFPQuestions, type ExtractedQuestion } from "@/lib/rfp-extract";
import {
  ingestGrantDocuments,
  getGrantDocumentTexts,
} from "@/lib/grants/ingest-docs";
import { ensureOutputGenre } from "@/lib/grants/genre";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

// Enough text to be worth a question-extraction call (mirrors hasRequirementText).
const MIN_DOC_TEXT_CHARS = 200;

/**
 * POST — start a grant application. Reuses the responses workspace + KB-grounded AI
 * drafting, and goes further than a blank draft:
 *  1. returns the existing application for this grant instead of creating a duplicate,
 *  2. ensures the grant's deep details are available (eligibility, how to apply, …),
 *  3. best-effort imports the grant's documents into the knowledge base FIRST, so the
 *     funder's real application questions can be extracted from those documents
 *     (falling back to the grant's web listing when no documents yield questions),
 *  4. classifies what kind of submission the funder expects (cached on the grant).
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let grant = await getGrant(id);
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 1. One application per grant: if this org already has a draft for it, return that
  //    instead of creating a duplicate. Archived drafts are skipped (the user binned
  //    them) and so are unsuccessful ones — re-applying after an unsuccessful outcome
  //    (e.g. a new funding round) deserves a fresh start. Drafting/submitted/awarded
  //    applications are always resumed.
  const { data: existingDraft, error: existingError } =
    await getServiceSupabase()
      .from("response_drafts")
      .select("id")
      .eq("org_id", orgId)
      .eq("grant_id", id)
      .neq("status", "archived")
      .neq("stage", "unsuccessful")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (existingError) {
    return NextResponse.json(
      { error: "Could not check for an existing application" },
      { status: 500 },
    );
  }
  if (existingDraft) {
    return NextResponse.json({ draftId: existingDraft.id, existing: true });
  }

  // 2. Make sure we have the deep detail (eligibility / how to apply / documents).
  if (!grant.details) {
    const details = await enrichGrant(grant).catch(() => null);
    if (details) grant = { ...grant, details };
  }

  // 3. Best-effort: import the grant's documents into the knowledge base FIRST
  //    (bounded so the request stays within maxDuration; the detail-page button
  //    imports any remainder). Doing this before extraction means the funder's REAL
  //    application questions come from their own documents, not our paraphrase.
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

  // 4. Extract the application questions — from the ingested documents when they have
  //    usable text, otherwise from the grant's web-listing prose.
  let docText = "";
  try {
    const texts = await getGrantDocumentTexts(orgId, grant);
    docText = buildDocumentQuestionText(texts);
  } catch {
    /* best-effort — fall back to the listing text */
  }

  let docQuestions: ExtractedQuestion[] = [];
  if (docText.length >= MIN_DOC_TEXT_CHARS) {
    docQuestions = await extractRFPQuestions(docText, { mode: "grant" }).catch(
      () => [],
    );
  }
  let webQuestions: ExtractedQuestion[] = [];
  if (docQuestions.length === 0 && hasRequirementText(grant)) {
    webQuestions = await extractRFPQuestions(buildGrantRequirementText(grant), {
      mode: "grant",
    }).catch(() => []);
  }
  // Doc-derived questions win; listing-derived ones are kept only when the documents
  // produced none. Each question carries its provenance (source) on the draft.
  const questions: GrantQuestion[] = mergeExtractedQuestions(
    docQuestions,
    webQuestions,
  );

  // 5. Best-effort: classify what kind of submission the funder expects (application
  //    form / project proposal / pitch / business case) — cached on the grant.
  await ensureOutputGenre(grant, docText).catch(() => null);

  const draft = await createResponseDraft(orgId, {
    rfp_title: `${grant.title} — Application`,
    grant_id: id,
    status: "draft",
    extracted_questions: questions,
    selected_question_ids: questions.map((q) => q.id),
  });

  return NextResponse.json({
    draftId: draft.id,
    existing: false,
    questions: questions.length,
    documents,
  });
}
