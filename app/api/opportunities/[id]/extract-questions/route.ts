import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { openai, CHAT_MODEL } from "@/lib/openai";
import type { NormalizedLot } from "@/lib/procurement/types";

interface Params {
  params: Promise<{ id: string }>;
}

export interface ExtractedQuestion {
  question_text: string;
  section_ref: string | null;
  question_type:
    | "technical"
    | "experience"
    | "financial"
    | "social-value"
    | "general";
  word_limit: number | null;
  is_mandatory: boolean;
}

const SYSTEM_PROMPT = `You are a UK public-sector procurement specialist.
Extract every distinct question, evaluation criterion, and scored requirement from the provided tender description.
Return only a JSON object with a single key "questions" containing an array of question objects.
Each object must have:
  - question_text: the full question or requirement (string)
  - section_ref: section heading or reference if identifiable, otherwise null
  - question_type: one of "technical" | "experience" | "financial" | "social-value" | "general"
  - word_limit: integer word limit if stated, otherwise null
  - is_mandatory: true unless clearly marked as optional

Rules:
- Do not include generic procurement process steps (e.g. "submit your bid by…")
- Do include scored questions, evidence requests, method statements, and case study requests
- If the description is too short to extract meaningful questions, return a minimum set of standard UK public-sector questions appropriate for the category`;

export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lots = (opp.lots ?? []) as NormalizedLot[];
  const lotText =
    lots.length > 0
      ? lots
          .map(
            (l, i) => `Lot ${i + 1}: ${l.title ?? ""}\n${l.description ?? ""}`,
          )
          .join("\n\n")
      : "";

  const userContent = [
    `Title: ${opp.title}`,
    opp.buyer_name ? `Buyer: ${opp.buyer_name}` : null,
    opp.description ? `\nDescription:\n${opp.description}` : null,
    lotText ? `\nLot details:\n${lotText}` : null,
    opp.cpv_codes?.length ? `\nCPV codes: ${opp.cpv_codes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 3000,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { questions?: unknown[] };
    const questions: ExtractedQuestion[] = (
      Array.isArray(parsed.questions) ? parsed.questions : []
    )
      .map((q) => {
        const item = q as Record<string, unknown>;
        return {
          question_text:
            typeof item.question_text === "string" ? item.question_text : "",
          section_ref:
            typeof item.section_ref === "string" ? item.section_ref : null,
          question_type: [
            "technical",
            "experience",
            "financial",
            "social-value",
            "general",
          ].includes(item.question_type as string)
            ? (item.question_type as ExtractedQuestion["question_type"])
            : "general",
          word_limit:
            typeof item.word_limit === "number" ? item.word_limit : null,
          is_mandatory:
            typeof item.is_mandatory === "boolean" ? item.is_mandatory : true,
        };
      })
      .filter((q) => q.question_text.length > 0);

    return NextResponse.json({ questions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
