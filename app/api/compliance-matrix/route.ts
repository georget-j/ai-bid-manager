import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";
import { retrieveChunks } from "@/lib/retrieval";
import { generateRFPResponse } from "@/lib/generation";
import { verifyCitations } from "@/lib/citations";

const GenerateSchema = z.object({
  opportunity_id: z.string().uuid().optional(),
  rfp_run_id: z.string().optional(),
  title: z.string().min(1),
  requirements: z
    .array(
      z.object({
        requirement_text: z.string().min(1),
        section_reference: z.string().optional(),
        mandatory: z.boolean().default(true),
        evidence_needed: z.string().optional(),
        response_owner: z.string().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json();
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { opportunity_id, rfp_run_id, title, requirements } = parsed.data;
  const supabase = getServiceSupabase();

  // Create matrix record
  const { data: matrix, error: matrixErr } = await supabase
    .from("compliance_matrices")
    .insert({
      opportunity_id: opportunity_id ?? null,
      rfp_run_id: rfp_run_id ?? null,
      org_id: orgId,
      title,
      status: "generating",
    })
    .select()
    .single();

  if (matrixErr || !matrix) {
    return NextResponse.json(
      { error: `Failed to create matrix: ${matrixErr?.message}` },
      { status: 500 },
    );
  }

  // Insert requirement rows immediately (status: not-started)
  const reqRows = requirements.map((r) => ({
    compliance_matrix_id: matrix.id,
    requirement_text: r.requirement_text,
    section_reference: r.section_reference ?? null,
    mandatory: r.mandatory,
    evidence_needed: r.evidence_needed ?? null,
    response_owner: r.response_owner ?? null,
    status: "not-started",
  }));

  await supabase.from("compliance_requirements").insert(reqRows);

  // Generate draft answers for each requirement (concurrent, capped at 5)
  const CONCURRENCY = 5;
  const chunks = [];
  for (let i = 0; i < reqRows.length; i += CONCURRENCY) {
    chunks.push(reqRows.slice(i, i + CONCURRENCY));
  }

  const { data: createdReqs } = await supabase
    .from("compliance_requirements")
    .select("id, requirement_text")
    .eq("compliance_matrix_id", matrix.id);

  const reqIdMap = new Map(
    (createdReqs ?? []).map((r) => [r.requirement_text, r.id]),
  );

  for (const chunk of chunks) {
    await Promise.allSettled(
      chunk.map(async (req) => {
        const reqId = reqIdMap.get(req.requirement_text);
        if (!reqId) return;

        try {
          const retrieved = await retrieveChunks(req.requirement_text, orgId);
          const rawResponse = await generateRFPResponse(
            req.requirement_text,
            retrieved,
          );
          const retrievedIds = new Set(retrieved.map((c) => c.id));
          const { response } = verifyCitations(rawResponse, retrievedIds);

          const confLevel = response.confidence?.level ?? "low";
          const confScore =
            confLevel === "high" ? 85 : confLevel === "medium" ? 60 : 35;

          await supabase
            .from("compliance_requirements")
            .update({
              draft_answer: response.draft_answer,
              confidence: confScore,
              source_citations: response.citations,
              status: confScore >= 70 ? "drafted" : "needs-evidence",
              updated_at: new Date().toISOString(),
            })
            .eq("id", reqId);
        } catch {
          await supabase
            .from("compliance_requirements")
            .update({
              status: "needs-evidence",
              updated_at: new Date().toISOString(),
            })
            .eq("id", reqId);
        }
      }),
    );
  }

  // Mark matrix complete
  await supabase
    .from("compliance_matrices")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", matrix.id);

  return NextResponse.json({ matrix_id: matrix.id });
}

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ matrices: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("compliance_matrices")
    .select("*, compliance_requirements(id, status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matrices: data ?? [] });
}
