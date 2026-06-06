export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getOpportunity } from "@/lib/procurement/data";
import { getOpportunityTenderTexts } from "@/lib/tender-docs";
import { openai, CHAT_MODEL } from "@/lib/openai";
import type { NormalizedLot } from "@/lib/procurement/types";

interface Params {
  params: Promise<{ id: string }>;
}

interface ReevalItem {
  question_id: string;
  question_text: string;
  question_class: string;
  section_ref: string | null;
  source_document: string | null;
  is_mandatory: boolean;
  answer_status: string;
  score: number;
  strengths: string[];
  suggestions: string[];
}

const ANSWERED = ["drafted", "needs-review", "approved"];

// GET — return the most recent stored re-evaluation (or null).
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("rfp_reevaluations")
    .select("overall_score, results, created_at")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ evaluation: null });
  return NextResponse.json({
    evaluation: {
      overall_score: data.overall_score,
      items: data.results,
      created_at: data.created_at,
    },
  });
}

// POST — score all answered items against the original tender and store the result.
export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();

  const [opp, { data: questions }] = await Promise.all([
    getOpportunity(opportunityId),
    supabase
      .from("opportunity_questions")
      .select(
        "id, question_text, question_class, section_ref, source_document, is_mandatory, answer_status, word_limit, ai_draft",
      )
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId)
      .neq("question_class", "guidance")
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const answered = (questions ?? []).filter(
    (q) => ANSWERED.includes(q.answer_status) && (q.ai_draft ?? "").trim(),
  );

  if (answered.length === 0) {
    return NextResponse.json(
      { error: "Draft or approve some answers before re-evaluating." },
      { status: 400 },
    );
  }

  // Build the original tender context (description + lots + linked docs' text).
  const lots = (opp.lots ?? []) as NormalizedLot[];
  const lotText = lots
    .map((l, i) => `Lot ${i + 1}: ${l.title ?? ""}\n${l.description ?? ""}`)
    .join("\n\n");
  const linked = await getOpportunityTenderTexts(opportunityId);
  const docText = linked
    .map((d) => `### ${d.title}\n${d.extractedText.slice(0, 6000)}`)
    .join("\n\n");

  const tenderContext = [
    `Title: ${opp.title}`,
    opp.description ? `\nDescription:\n${opp.description}` : "",
    lotText ? `\nLots:\n${lotText}` : "",
    docText ? `\nTender documents:\n${docText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 16000);

  const answersBlock = answered
    .map((q, i) => {
      const wl = q.word_limit ? ` (limit ${q.word_limit} words)` : "";
      const tag =
        q.question_class === "requirement" ? "REQUIREMENT" : "QUESTION";
      return `${i + 1}. [${q.id}] ${tag}${q.is_mandatory ? " (MANDATORY)" : ""}${wl}: ${q.question_text}\nDRAFT ANSWER: ${(q.ai_draft ?? "").slice(0, 800)}`;
    })
    .join("\n\n");

  const prompt = `You are a senior UK public-sector bid evaluator. Score how well each drafted answer responds to its tender requirement/question, judged against the ORIGINAL TENDER below.

ORIGINAL TENDER:
${tenderContext}

ANSWERED ITEMS:
${answersBlock}

For EACH item return an object with:
- question_id: the id in square brackets
- score: 0-100 — how well the draft answers the requirement (specific, evidence-backed, compliant, within any word limit, fully addresses what is asked)
- strengths: array of short phrases on what is strong (may be empty)
- suggestions: array of short, concrete improvements to raise the score (may be empty if already excellent)

Also return overall_score: 0-100 — the holistic quality/competitiveness of the whole response, weighting mandatory items more heavily.

Return ONLY JSON: { "overall_score": <int>, "items": [ { "question_id", "score", "strengths": [], "suggestions": [] } ] }`;

  let overall = 0;
  let scored: Array<{
    question_id: string;
    score: number;
    strengths?: string[];
    suggestions?: string[];
  }> = [];
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 3000,
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as {
      overall_score?: number;
      items?: typeof scored;
    };
    overall = Math.max(0, Math.min(100, Math.round(parsed.overall_score ?? 0)));
    scored = parsed.items ?? [];
  } catch {
    return NextResponse.json(
      { error: "Re-evaluation failed — please try again." },
      { status: 500 },
    );
  }

  const scoreById = new Map(scored.map((s) => [s.question_id, s]));
  const items: ReevalItem[] = answered.map((q) => {
    const s = scoreById.get(q.id);
    return {
      question_id: q.id,
      question_text: q.question_text,
      question_class: q.question_class,
      section_ref: q.section_ref,
      source_document: q.source_document,
      is_mandatory: q.is_mandatory,
      answer_status: q.answer_status,
      score:
        s && typeof s.score === "number"
          ? Math.max(0, Math.min(100, Math.round(s.score)))
          : 0,
      strengths: Array.isArray(s?.strengths) ? s!.strengths.slice(0, 5) : [],
      suggestions: Array.isArray(s?.suggestions)
        ? s!.suggestions.slice(0, 5)
        : [],
    };
  });

  await supabase.from("rfp_reevaluations").insert({
    opportunity_id: opportunityId,
    org_id: orgId,
    overall_score: overall,
    results: items,
  });

  return NextResponse.json({
    evaluation: {
      overall_score: overall,
      items,
      created_at: new Date().toISOString(),
    },
  });
}
