import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AIGapResult {
  question_id: string;
  coverage: "covered" | "partial" | "missing" | "expired";
  matched_evidence_ids: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();

  const body = await req.json().catch(() => ({}));
  const clientId = body.clientId as string | undefined;
  if (!clientId)
    return NextResponse.json(
      { error: "clientId required" },
      { status: 400 },
    );

  // Check cache in bid_pipeline
  const { data: pipeline } = await supabase
    .from("bid_pipeline")
    .select("ai_gap_analysis")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .maybeSingle();

  const cached = (
    pipeline?.ai_gap_analysis as Record<string, AIGapResult[]> | null
  )?.[clientId];

  if (cached) {
    return NextResponse.json({ results: cached, cached: true });
  }

  // Fetch requirements and evidence in parallel
  const [{ data: questions }, { data: evidence }, { data: client }] =
    await Promise.all([
      supabase
        .from("opportunity_questions")
        .select("id, question_text, section_ref, is_mandatory, question_class")
        .eq("opportunity_id", opportunityId)
        .eq("org_id", orgId)
        .neq("question_class", "guidance")
        .order("sort_order"),
      supabase
        .from("evidence_items")
        .select("id, title, evidence_type, status, notes, expires_at")
        .eq("org_id", orgId)
        .eq("client_id", clientId),
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .eq("org_id", orgId)
        .maybeSingle(),
    ]);

  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const reqs = questions ?? [];
  const evItems = evidence ?? [];

  if (reqs.length === 0) {
    return NextResponse.json({
      results: [],
      message: "No requirements found — extract questions first.",
    });
  }

  // Build prompt
  const requirementsList = reqs
    .map((q, i) => `R${i + 1}. [${q.id}] ${q.question_text}`)
    .join("\n");

  const evidenceList =
    evItems.length > 0
      ? evItems
          .map(
            (e) =>
              `E-${e.id}: "${e.title}" (type: ${e.evidence_type}, status: ${e.status}${e.expires_at ? `, expires: ${e.expires_at}` : ""}${e.notes ? `, notes: ${e.notes.slice(0, 100)}` : ""})`,
          )
          .join("\n")
      : "No evidence items in vault.";

  const prompt = `You are a UK public procurement compliance analyst.

Given a list of tender requirements and a supplier's evidence vault, assess whether each requirement is covered by the available evidence.

Requirements:
${requirementsList}

Evidence vault:
${evidenceList}

For each requirement, return a JSON object with:
- question_id: the ID in square brackets
- coverage: "covered" (valid evidence exists), "partial" (expiring evidence only), "expired" (expired evidence only), or "missing" (no relevant evidence)
- matched_evidence_ids: array of evidence IDs (the part after "E-") that are relevant, empty array if none
- confidence: "high" (clear match), "medium" (likely match), "low" (uncertain)
- reason: one sentence explaining the match or gap

Return a JSON object: { "results": [ ...array of objects... ] }
Only return JSON, no other text.`;

  let aiResults: AIGapResult[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { results?: AIGapResult[] };
    aiResults = parsed.results ?? [];
  } catch {
    return NextResponse.json(
      { error: "AI analysis failed" },
      { status: 500 },
    );
  }

  // Cache in bid_pipeline (upsert)
  const existingAnalysis =
    (pipeline?.ai_gap_analysis as Record<string, AIGapResult[]> | null) ?? {};
  const updatedAnalysis = { ...existingAnalysis, [clientId]: aiResults };

  await supabase
    .from("bid_pipeline")
    .upsert(
      {
        opportunity_id: opportunityId,
        org_id: orgId,
        ai_gap_analysis: updatedAnalysis,
      },
      { onConflict: "opportunity_id,org_id" },
    );

  return NextResponse.json({ results: aiResults, cached: false });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId)
    return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const supabase = getServiceSupabase();

  const { data: pipeline } = await supabase
    .from("bid_pipeline")
    .select("ai_gap_analysis")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (pipeline?.ai_gap_analysis) {
    const updated = {
      ...(pipeline.ai_gap_analysis as Record<string, unknown>),
    };
    delete updated[clientId];
    await supabase
      .from("bid_pipeline")
      .update({ ai_gap_analysis: updated })
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId);
  }

  return NextResponse.json({ ok: true });
}
