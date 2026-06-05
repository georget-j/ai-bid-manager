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

  const BROWSER_HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/octet-stream,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  let docRes: Response;
  try {
    docRes = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    const isTimeout = msg.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        error: isTimeout
          ? "Document download timed out — download it manually and upload on the RFP Response tab"
          : "Failed to fetch document from URL",
      },
      { status: 502 },
    );
  }

  if (!docRes.ok) {
    if (docRes.status === 403 || docRes.status === 401) {
      return NextResponse.json({ error: "access-denied" }, { status: 403 });
    }
    if (docRes.status === 429) {
      const body = await docRes.text().catch(() => "");
      const retryAfter = docRes.headers.get("retry-after");
      return NextResponse.json(
        {
          error: "rate-limited",
          message: body || "Rate limit exceeded on the document server.",
          retryAfter: retryAfter ?? null,
        },
        { status: 429 },
      );
    }
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

  // In append mode keep existing questions and deduplicate by text
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
    return NextResponse.json({ questions_saved: 0 });
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

  return NextResponse.json({ questions_saved: (data ?? []).length });
}
