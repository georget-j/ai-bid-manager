import type { GrantRow } from "./types";
import type { ExtractedQuestion } from "@/lib/rfp-extract";

/**
 * Assemble the text used to extract application requirements/questions for a grant.
 * Combines the summary fields with the deep-enriched detail sections (eligibility,
 * objectives, how to apply, supporting information) so extractRFPQuestions() can surface
 * the requirements and questions an applicant must address.
 */
export function buildGrantRequirementText(grant: GrantRow): string {
  const parts: string[] = [`Grant: ${grant.title}`];
  if (grant.funder_name) parts.push(`Funder: ${grant.funder_name}`);
  if (grant.description) parts.push(`\n${grant.description}`);
  if (grant.eligibility_text)
    parts.push(`\nEligibility: ${grant.eligibility_text}`);
  for (const section of grant.details?.sections ?? []) {
    if (section.text?.trim())
      parts.push(`\n## ${section.heading}\n${section.text}`);
  }
  return parts.join("\n").trim();
}

/** True when there is enough text to attempt requirement/question extraction. */
export function hasRequirementText(grant: GrantRow): boolean {
  return buildGrantRequirementText(grant).length > 200;
}

// ── Funder-document question sources ─────────────────────────────────────────────
// The funder's actual application documents (forms, guidance PDFs) carry the REAL
// prompts an applicant must answer; the web listing only paraphrases them. These pure
// helpers assemble the document text for extraction and pick which question set wins.

/** Where a seeded draft question came from. */
export type GrantQuestionSource = "funder-document" | "grant-listing";

/** An extracted question annotated with its provenance (stored on the draft). */
export type GrantQuestion = ExtractedQuestion & { source: GrantQuestionSource };

/** Matches the extraction input cap in lib/rfp-extract.ts (text is sliced to 30k). */
export const QUESTION_TEXT_BUDGET = 30_000;

// Don't bother including a truncated fragment shorter than this — a stub of a document
// adds noise without giving the extractor anything usable.
const MIN_FRAGMENT_CHARS = 500;

export interface QuestionSourceText {
  title: string;
  kind: "document" | "link";
  text: string;
}

/**
 * Concatenate ingested grant-resource texts for question extraction, real funder
 * documents before web pages and longest first within each kind, staying inside the
 * extraction budget. Each piece is headed with its title so the extractor can use the
 * source document's own section names.
 */
export function buildDocumentQuestionText(
  sources: QuestionSourceText[],
  budget = QUESTION_TEXT_BUDGET,
): string {
  const ordered = [...sources]
    .filter((s) => s.text.trim().length > 0)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "document" ? -1 : 1;
      return b.text.length - a.text.length;
    });

  const parts: string[] = [];
  let remaining = budget;
  for (const s of ordered) {
    if (remaining <= 0) break;
    const header = `## ${s.title}\n`;
    const room = remaining - header.length;
    if (room < MIN_FRAGMENT_CHARS) break;
    const body = s.text.trim().slice(0, room);
    parts.push(`${header}${body}`);
    remaining -= header.length + body.length + 2; // +2 for the join separator
  }
  return parts.join("\n\n").trim();
}

/**
 * Pick the question set to seed a draft with. Questions extracted from the funder's
 * own documents win outright; the web-listing set is used only when the documents
 * yielded nothing. Each question is tagged with its provenance.
 */
export function mergeExtractedQuestions(
  docQuestions: ExtractedQuestion[],
  webQuestions: ExtractedQuestion[],
): GrantQuestion[] {
  if (docQuestions.length > 0) {
    return docQuestions.map((q) => ({
      ...q,
      source: "funder-document" as const,
    }));
  }
  return webQuestions.map((q) => ({ ...q, source: "grant-listing" as const }));
}
