import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getResponseDraft } from "@/lib/responses/drafts";
import { getGrant } from "@/lib/grants/data";
import {
  generateGrantApplicationDocx,
  type GrantExportAnswer,
  type GrantExportQuestion,
  type GrantExportMode,
} from "@/lib/export-grant-docx";
import type { GrantBudget } from "@/lib/grants/budget";
import type { RFPResponse } from "@/lib/schema";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// Question shape persisted on response_drafts.extracted_questions (jsonb).
type StoredQuestion = {
  id?: number;
  section?: string;
  text?: string;
  word_limit?: number | null;
  mandatory?: boolean;
};

// Answer shape persisted on response_drafts.answers (jsonb), keyed by question id.
type StoredAnswer = {
  question_id?: number;
  question_text?: string;
  section?: string;
  response?: RFPResponse;
  edited_draft?: string | null;
  editedDraft?: string | null;
};

/**
 * GET — download a grant application as a Word file.
 *
 * ?mode=clean  (default) — the shareable submission file: cover page, summary,
 *                          answers, budget. No internal review notes.
 * ?mode=review — adds clearly-badged internal review notes under each answer.
 *
 * Selected-but-unanswered questions are included with a visible
 * "[Response to be drafted]" placeholder so nothing silently vanishes.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const mode: GrantExportMode =
    new URL(req.url).searchParams.get("mode") === "review" ? "review" : "clean";

  const draft = await getResponseDraft(id, orgId);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storedAnswers = (draft.answers ?? {}) as Record<string, StoredAnswer>;

  // Join the draft's answers back to its extracted questions so the export
  // keeps each question's word limit and section, and includes selected
  // questions that have no answer yet.
  const extracted = (draft.extracted_questions ?? []) as StoredQuestion[];
  const selectedSet = new Set(
    (draft.selected_question_ids ?? []).map((n) => Number(n)),
  );

  const questions: GrantExportQuestion[] = extracted
    .filter(
      (q): q is StoredQuestion & { id: number } =>
        typeof q.id === "number" &&
        // An empty selection means "everything"; otherwise keep selected
        // questions plus any the user answered anyway.
        (selectedSet.size === 0 ||
          selectedSet.has(q.id) ||
          storedAnswers[String(q.id)] !== undefined),
    )
    .map((q) => ({
      id: q.id,
      text: q.text ?? "",
      section: q.section ?? "General",
      word_limit: typeof q.word_limit === "number" ? q.word_limit : null,
      mandatory: q.mandatory === true,
    }));

  // Answers map for the generator — and synthesised question rows for any
  // answer whose question is missing from the stored list (older drafts).
  const answers: Record<string, GrantExportAnswer> = {};
  for (const [key, a] of Object.entries(storedAnswers)) {
    if (!a?.response) continue;
    const qid = Number(key);
    if (!Number.isFinite(qid)) continue;
    answers[String(qid)] = {
      question_id: qid,
      question_text: a.question_text ?? "",
      section: a.section ?? "General",
      response: a.response,
      edited_draft:
        typeof a.edited_draft === "string"
          ? a.edited_draft
          : typeof a.editedDraft === "string"
            ? a.editedDraft
            : null,
    };
    if (!questions.some((q) => q.id === qid)) {
      questions.push({
        id: qid,
        text: a.question_text ?? "",
        section: a.section ?? "General",
        word_limit: null,
        mandatory: false,
      });
    }
  }

  if (questions.length === 0) {
    return NextResponse.json(
      {
        error: "This application has no questions or answers to download yet.",
      },
      { status: 400 },
    );
  }

  // Org name (for the cover page + Word metadata) and the grant in parallel.
  const [{ data: membership }, grant] = await Promise.all([
    getServiceSupabase()
      .from("org_memberships")
      .select("org_id, orgs(name)")
      .eq("org_id", orgId)
      .maybeSingle(),
    draft.grant_id ? getGrant(draft.grant_id) : Promise.resolve(null),
  ]);
  const orgName =
    (membership?.orgs as { name?: string } | null)?.name ?? "Our Organisation";

  const buffer = await generateGrantApplicationDocx({
    grant,
    orgName,
    draft: { rfp_title: draft.rfp_title },
    questions,
    answers,
    budget: (draft.budget ?? null) as GrantBudget | null,
    mode,
  });

  const safe =
    (grant?.title ?? draft.rfp_title)
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .slice(0, 80) || "grant-application";

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}-application.docx"`,
    },
  });
}
