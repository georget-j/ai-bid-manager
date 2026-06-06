import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { analyseGaps } from "@/lib/evidence-gap";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query param required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Verify client belongs to this org
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, vertical")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Gap analysis is requirement-only: only question_class='requirement' items are
  // compliance gates that evidence can satisfy. Open questions and guidance are not
  // gaps — mixing them in inflated and skewed the coverage score.
  const { data: requirementsData, error: qErr } = await supabase
    .from("opportunity_questions")
    .select("id, question_text, section_ref, is_mandatory, question_class")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .eq("question_class", "requirement")
    .order("sort_order");

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const requirements = requirementsData ?? [];

  // Distinguish "nothing extracted at all" from "extracted, but no requirements".
  const { count: anyQuestionCount } = await supabase
    .from("opportunity_questions")
    .select("id", { count: "exact", head: true })
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId);

  const emptyReport = {
    client,
    total_requirements: 0,
    covered: 0,
    partial: 0,
    missing: 0,
    expired: 0,
    coverage_score: 0,
    results: [],
    evidence_count: 0,
  };

  if (requirements.length === 0) {
    const extractedAnything = (anyQuestionCount ?? 0) > 0;
    return NextResponse.json({
      ...emptyReport,
      state: extractedAnything ? "no-requirements" : "no-questions",
      message: extractedAnything
        ? "No pass/fail compliance requirements were extracted from this tender — the items are open questions rather than requirements evidence can satisfy."
        : "No questions extracted yet. Run “Get all details” on the RFP tab first.",
    });
  }

  // Fetch client evidence
  const { data: evidence } = await supabase
    .from("evidence_items")
    .select("id, title, evidence_type, status, notes, expires_at")
    .eq("org_id", orgId)
    .eq("client_id", clientId);

  const evidenceItems = evidence ?? [];
  const report = analyseGaps(requirements, evidenceItems);

  // "no-evidence" vs "ok" lets the UI say "add evidence" instead of implying every
  // requirement genuinely failed when the vault is simply empty.
  const state = evidenceItems.length === 0 ? "no-evidence" : "ok";

  return NextResponse.json({
    client,
    ...report,
    evidence_count: evidenceItems.length,
    state,
    message:
      state === "no-evidence"
        ? `No evidence on file for ${client.name} yet — add certifications, policies, and case studies to assess coverage.`
        : null,
  });
}
