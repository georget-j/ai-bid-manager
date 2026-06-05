import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";
import {
  generateResponseDocx,
  type ResponseQuestion,
} from "@/lib/export-response-docx";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();

  // Fetch opportunity details
  const { data: opp } = await supabase
    .from("opportunities")
    .select("title, buyer_name, source_id")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opp) {
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 },
    );
  }

  // Fetch org name
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, orgs(name)")
    .eq("org_id", orgId)
    .maybeSingle();

  const orgName =
    (membership?.orgs as { name?: string } | null)?.name ?? "Our Organisation";

  // Fetch questions for this org × opportunity
  const { data: questions } = await supabase
    .from("opportunity_questions")
    .select(
      "id, question_text, section_ref, question_class, sort_order, word_limit, ai_draft, answer_status",
    )
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (!questions || questions.length === 0) {
    return NextResponse.json(
      { error: "No questions found for this opportunity" },
      { status: 404 },
    );
  }

  const docxBuffer = await generateResponseDocx(
    {
      title: opp.title ?? "Tender",
      buyer_name: opp.buyer_name ?? null,
      source_id: opp.source_id ?? null,
    },
    orgName,
    questions as ResponseQuestion[],
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
