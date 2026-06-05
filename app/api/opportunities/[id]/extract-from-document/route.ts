export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { extractText } from "@/lib/extractors";
import { extractRFPQuestions } from "@/lib/rfp-extract";
import { getServiceSupabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_DOC_SIZE = 10 * 1024 * 1024;

function guessFileName(url: string, contentType: string | null): string {
  try {
    const urlPath = new URL(url).pathname;
    const urlFile = decodeURIComponent(urlPath.split("/").pop() ?? "");
    if (urlFile.includes(".")) return urlFile;
  } catch {
    // malformed URL — fall through
  }
  const ext = contentType?.includes("pdf")
    ? ".pdf"
    : contentType?.includes("word") || contentType?.includes("docx")
      ? ".docx"
      : contentType?.includes("excel") || contentType?.includes("spreadsheet")
        ? ".xlsx"
        : ".txt";
  return `document${ext}`;
}

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

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const url = body.url;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let docRes: Response;
  try {
    docRes = await fetch(url, {
      headers: { "User-Agent": "BidIntelligence/1.0" },
      redirect: "follow",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch document from URL" },
      { status: 502 },
    );
  }

  if (!docRes.ok) {
    return NextResponse.json(
      { error: `Document server returned ${docRes.status}` },
      { status: 502 },
    );
  }

  const contentType = docRes.headers.get("content-type");
  const fileName = guessFileName(url, contentType);

  const buffer = Buffer.from(await docRes.arrayBuffer());
  if (buffer.length > MAX_DOC_SIZE) {
    return NextResponse.json(
      { error: "Document too large (max 10 MB)" },
      { status: 400 },
    );
  }

  let text: string;
  try {
    const extraction = await extractText(buffer, fileName);
    text = extraction.text;
  } catch {
    return NextResponse.json(
      { error: "Could not extract text from document" },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "No readable text found in document" },
      { status: 400 },
    );
  }

  const rfpQuestions = await extractRFPQuestions(text);
  if (rfpQuestions.length === 0) {
    return NextResponse.json(
      { error: "No questions found in document" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Replace existing questions for this org × opportunity
  await supabase
    .from("opportunity_questions")
    .delete()
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId);

  const rows = rfpQuestions.map((q) => ({
    opportunity_id: opportunityId,
    org_id: orgId,
    question_text: q.text,
    section_ref: q.section || null,
    question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
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

  return NextResponse.json({ questions_saved: (data ?? []).length });
}
