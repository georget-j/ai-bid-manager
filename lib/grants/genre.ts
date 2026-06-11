import * as z from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { getServiceSupabase } from "@/lib/supabase-service";
import { buildGrantRequirementText } from "./application";
import type { GrantRow, OutputGenre } from "./types";

// Classify what KIND of submission a funder expects (application form, project
// proposal, pitch, business case) so downstream drafting and export can match its
// shape. One cheap structured call, cached on grants.details.output_genre — never
// re-called once a confident classification is stored.

const GENRE_KINDS = [
  "application-form",
  "project-proposal",
  "pitch",
  "business-case",
  "unknown",
] as const;

const GenreSchema = z.object({
  kind: z.enum(GENRE_KINDS),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z
    .string()
    .describe("one plain-English sentence on why, citing the text"),
});

const FORMAT = zodResponseFormat(GenreSchema, "output_genre");

/** Safe default when classification fails — never blocks draft creation. */
export const UNKNOWN_OUTPUT_GENRE: OutputGenre = {
  kind: "unknown",
  confidence: "low",
  rationale: "We couldn't work out the expected format from the funder's text.",
};

/**
 * Classify the submission format the funder expects, from the grant's detail text
 * plus (when available) the funder's own application documents. Returns the safe
 * "unknown" default on any API failure rather than throwing.
 */
export async function classifyOutputGenre(
  grant: GrantRow,
  docText?: string,
): Promise<OutputGenre> {
  const text = [
    buildGrantRequirementText(grant),
    docText?.trim() ? `\n## Funder's application documents\n${docText}` : "",
  ]
    .join("\n")
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .slice(0, 12000);

  try {
    const completion = await openai.chat.completions.parse({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a UK grants adviser. From the funder's text, classify what KIND of submission the applicant is expected to produce:

- "application-form": a fixed form with set questions to answer (online portal form, downloadable form with numbered questions)
- "project-proposal": a free-form written proposal / case for the project (the applicant structures it)
- "pitch": a short pitch — video, deck, or brief summary, often a first stage
- "business-case": a costed business case (options, benefits, financial appraisal)
- "unknown": the text doesn't say or genuinely doesn't fit the above

Base the classification strictly on the provided text. Give:
- kind: one of the five values above
- confidence: high (the text states the format), medium (strongly implied), low (a guess)
- rationale: one plain-English sentence on why, citing what in the text led you there.`,
        },
        {
          role: "user",
          content: `What kind of submission does this funder expect?\n\n${text}`,
        },
      ],
      response_format: FORMAT,
      temperature: 0,
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) return UNKNOWN_OUTPUT_GENRE;
    return parsed;
  } catch {
    return UNKNOWN_OUTPUT_GENRE;
  }
}

/**
 * Return the grant's cached output genre, classifying + persisting it (into
 * details.output_genre) when missing. "unknown" results are returned but NOT cached,
 * so a later run — e.g. once the funder's documents have been ingested — can retry
 * with better evidence. Best-effort: never throws.
 */
export async function ensureOutputGenre(
  grant: GrantRow,
  docText?: string,
): Promise<OutputGenre> {
  if (grant.details?.output_genre) return grant.details.output_genre;

  const genre = await classifyOutputGenre(grant, docText);
  if (genre.kind === "unknown") return genre;

  try {
    const mergedDetails = {
      ...(grant.details ?? {
        sections: [],
        links: [],
        documents: [],
        webpageUrl: null,
      }),
      output_genre: genre,
    };
    await getServiceSupabase()
      .from("grants")
      .update({ details: mergedDetails })
      .eq("id", grant.id);
  } catch {
    /* best-effort cache — the classification is still returned */
  }
  return genre;
}
