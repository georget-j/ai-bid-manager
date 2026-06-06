export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase";
import { extractRFPQuestions } from "@/lib/rfp-extract";
import {
  collectOpportunityDocUrls,
  getOpportunityTenderTexts,
  getOrFetchTenderDoc,
} from "@/lib/tender-docs";
import type { NormalizedLot } from "@/lib/procurement/types";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_DOCS = 12;
const EXTRACT_CONCURRENCY = 4;

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

const DESCRIPTION_LABEL = "Opportunity description";

interface ExtractionSource {
  label: string;
  documentId: string | null;
  text: string;
}

function buildDescriptionText(opp: {
  title?: string | null;
  buyer_name?: string | null;
  description?: string | null;
  lots?: NormalizedLot[] | null;
  cpv_codes?: string[] | null;
}): string {
  const lots = (opp.lots ?? []) as NormalizedLot[];
  const lotText = lots
    .map((l, i) => `Lot ${i + 1}: ${l.title ?? ""}\n${l.description ?? ""}`)
    .join("\n\n");

  return [
    opp.title ? `Title: ${opp.title}` : null,
    opp.buyer_name ? `Buyer: ${opp.buyer_name}` : null,
    opp.description ? `\nDescription:\n${opp.description}` : null,
    lotText ? `\nLot details:\n${lotText}` : null,
    opp.cpv_codes?.length ? `\nCPV codes: ${opp.cpv_codes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Run an async mapper over items with bounded concurrency. */
async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId } = await params;
  const opp = await getOpportunity(opportunityId);
  if (!opp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Warm + link accessible tender documents (cached → fast, deduped).
  //    Portal-locked / unreachable docs throw and are skipped.
  const docUrls = collectOpportunityDocUrls(opp).slice(0, MAX_DOCS);
  await Promise.allSettled(
    docUrls.map((d) =>
      getOrFetchTenderDoc(d.url!, opportunityId, d.title ?? null).catch(
        () => null,
      ),
    ),
  );

  // 2. Assemble sources: opportunity description + every linked document's text.
  const sources: ExtractionSource[] = [];
  const descriptionText = buildDescriptionText(opp);
  if (descriptionText.trim()) {
    sources.push({
      label: DESCRIPTION_LABEL,
      documentId: null,
      text: descriptionText,
    });
  }

  const linked = await getOpportunityTenderTexts(opportunityId);
  for (const doc of linked) {
    sources.push({
      label: doc.title,
      documentId: doc.tenderDocumentId,
      text: doc.extractedText,
    });
  }

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "No description or accessible tender documents to extract" },
      { status: 400 },
    );
  }

  // 3. Extract per source (bounded concurrency), stamping provenance.
  const perSource = await runPool(sources, EXTRACT_CONCURRENCY, async (src) => {
    try {
      const questions = await extractRFPQuestions(src.text);
      return { src, questions };
    } catch {
      return { src, questions: [] };
    }
  });

  // 4. Merge + dedup by normalized question text (first source wins provenance).
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let sortOrder = 0;
  for (const { src, questions } of perSource) {
    for (const q of questions) {
      const key = q.text.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        opportunity_id: opportunityId,
        org_id: orgId,
        question_text: q.text,
        section_ref: q.section || null,
        question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
        question_class: q.question_class,
        word_limit: q.word_limit,
        is_mandatory: q.mandatory,
        source_document: src.label,
        source_document_id: src.documentId,
        sort_order: sortOrder++,
        answer_status: "unanswered",
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No requirements or questions found in the tender" },
      { status: 400 },
    );
  }

  // 5. Single atomic write — replace this org's questions for the opportunity.
  const supabase = getServiceSupabase();
  await supabase
    .from("opportunity_questions")
    .delete()
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId);

  const { data, error } = await supabase
    .from("opportunity_questions")
    .insert(rows)
    .select("question_class");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const saved = data ?? [];
  const counts = {
    total: saved.length,
    requirements: saved.filter((r) => r.question_class === "requirement")
      .length,
    questions: saved.filter((r) => r.question_class === "question").length,
    guidance: saved.filter((r) => r.question_class === "guidance").length,
  };

  return NextResponse.json({
    counts,
    sources: sources.map((s) => s.label),
  });
}
