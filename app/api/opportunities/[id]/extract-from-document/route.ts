export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { extractRFPQuestions } from "@/lib/rfp-extract";
import { getServiceSupabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getOrFetchTenderDoc,
  TenderDocError,
  tenderDocErrorResponse,
} from "@/lib/tender-docs";

const TOPIC_TO_TYPE: Record<string, string> = {
  security_compliance: "technical",
  legal: "general",
  pricing: "financial",
  technical: "technical",
  engineering: "technical",
  commercial: "general",
  implementation: "general",
  support: "general",
  general: "general",
};

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const limited = await checkRateLimit(request, "upload");
  if (limited) return limited;

  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId } = await params;

  let body: { url?: string; append?: boolean };
  try {
    body = (await request.json()) as { url?: string; append?: boolean };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const url = body.url;
  const append = body.append === true;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // ── Fetch + cache via the central tender document store ─────────────────────
  // Deduped + globally shared: the same tender is never downloaded or re-extracted
  // twice, and its text is persisted for reuse by extraction and re-evaluation.
  let text: string;
  let fromCache: boolean;
  try {
    const doc = await getOrFetchTenderDoc(url, opportunityId);
    text = doc.extractedText;
    fromCache = doc.fromCache;
  } catch (err) {
    if (err instanceof TenderDocError) {
      const { body: errBody, status } = tenderDocErrorResponse(err);
      return NextResponse.json(errBody, { status });
    }
    throw err;
  }

  const rfpQuestions = await extractRFPQuestions(text);
  if (rfpQuestions.length === 0) {
    return NextResponse.json(
      { error: "No questions found in document" },
      { status: 400 },
    );
  }

  // ── Persist questions ─────────────────────────────────────────────────────
  const supabase = getServiceSupabase();
  let existingTexts = new Set<string>();
  let sortOffset = 0;

  if (append) {
    const { data: existing } = await supabase
      .from("opportunity_questions")
      .select("question_text, sort_order")
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId);
    if (existing) {
      existingTexts = new Set(existing.map((r) => r.question_text.trim()));
      sortOffset =
        existing.reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 1;
    }
  } else {
    await supabase
      .from("opportunity_questions")
      .delete()
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId);
  }

  const newQuestions = rfpQuestions.filter(
    (q) => !existingTexts.has(q.text.trim()),
  );

  if (newQuestions.length === 0) {
    return NextResponse.json({ questions_saved: 0, cached: fromCache });
  }

  const rows = newQuestions.map((q, i) => ({
    opportunity_id: opportunityId,
    org_id: orgId,
    question_text: q.text,
    section_ref: q.section || null,
    question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
    question_class: q.question_class,
    sort_order: sortOffset + i,
    word_limit: null as number | null,
    is_mandatory: q.risk_level !== "low",
    answer_status: "unanswered",
  }));

  const { data, error } = await supabase
    .from("opportunity_questions")
    .insert(rows)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    questions_saved: (data ?? []).length,
    cached: fromCache,
  });
}
