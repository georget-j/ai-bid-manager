import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  generateResponseDocx,
  type ResponseQuestion,
  type ExportGapReport,
} from "@/lib/export-response-docx";
import { analyseGaps } from "@/lib/evidence-gap";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId } = await params;
  const approvedOnly =
    new URL(request.url).searchParams.get("mode") === "approved";
  const supabase = getServiceSupabase();

  // Fetch opportunity + pipeline (for client_id) in parallel
  const [{ data: opp }, { data: pipelineRow }] = await Promise.all([
    supabase
      .from("opportunities")
      .select("title, buyer_name, source_id")
      .eq("id", opportunityId)
      .maybeSingle(),
    supabase
      .from("bid_pipeline")
      .select("client_id")
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  if (!opp) {
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 },
    );
  }

  // Fetch org name, questions, and (optionally) client evidence in parallel
  const clientId = pipelineRow?.client_id ?? null;

  const [{ data: membership }, { data: questions }, clientData] =
    await Promise.all([
      supabase
        .from("org_memberships")
        .select("org_id, orgs(name)")
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("opportunity_questions")
        .select(
          "id, question_text, section_ref, question_class, sort_order, word_limit, ai_draft, answer_status, is_mandatory",
        )
        .eq("opportunity_id", opportunityId)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      clientId
        ? Promise.all([
            supabase
              .from("clients")
              .select("id, name")
              .eq("id", clientId)
              .eq("org_id", orgId)
              .maybeSingle(),
            supabase
              .from("evidence_items")
              .select("id, title, evidence_type, status, notes")
              .eq("org_id", orgId)
              .eq("client_id", clientId),
          ])
        : null,
    ]);

  const orgName =
    (membership?.orgs as { name?: string } | null)?.name ?? "Our Organisation";

  if (!questions || questions.length === 0) {
    return NextResponse.json(
      { error: "No questions found for this opportunity" },
      { status: 404 },
    );
  }

  // Build gap report if a client is linked
  let gapReport: ExportGapReport | null = null;
  if (clientData) {
    const [{ data: client }, { data: evidence }] = clientData;
    if (client && evidence) {
      const nonGuidance = questions.filter(
        (q) => q.question_class !== "guidance",
      );
      const report = analyseGaps(
        nonGuidance.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          section_ref: q.section_ref,
          is_mandatory: q.is_mandatory,
        })),
        evidence,
      );
      gapReport = {
        client_name: client.name,
        coverage_score: report.coverage_score,
        covered: report.covered,
        partial: report.partial,
        missing: report.missing,
        expired: report.expired,
        results: report.results.map((r) => ({
          question_text: r.question_text,
          section_ref: r.section_ref,
          coverage: r.coverage,
          risk_level: r.risk_level,
          gap_note: r.gap_note,
        })),
      };
    }
  }

  // Filter to approved-only if requested
  const exportQuestions = approvedOnly
    ? (questions as ResponseQuestion[]).filter(
        (q) =>
          q.question_class === "guidance" || q.answer_status === "approved",
      )
    : (questions as ResponseQuestion[]);

  const docxBuffer = await generateResponseDocx(
    {
      title: opp.title ?? "Tender",
      buyer_name: opp.buyer_name ?? null,
      source_id: opp.source_id ?? null,
    },
    orgName,
    exportQuestions,
    gapReport,
    approvedOnly,
  );

  const slug = (opp.title ?? "response")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return new NextResponse(docxBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="response-${slug}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
