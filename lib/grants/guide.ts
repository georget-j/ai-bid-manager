import * as z from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { getServiceSupabase } from "@/lib/supabase-service";
import { enrichGrant } from "./enrich";
import { buildGrantRequirementText } from "./application";
import type { GrantRow, ApplicationGuide } from "./types";

// Generate a tailored, navigable "how to apply" guide for a specific grant from its
// detail text. Each grant's process differs, so this is grant-specific and grounded
// strictly in the provided content.

const GuideSchema = z.object({
  summary: z.string().describe("1–2 sentences on how to apply for this grant"),
  eligibility_checklist: z
    .array(z.string())
    .describe(
      "key eligibility criteria the applicant must confirm before applying",
    ),
  steps: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().describe("what the applicant does in this step"),
        requirements: z
          .array(z.string())
          .describe(
            "specific documents / information / actions needed for this step",
          ),
        deadline: z
          .string()
          .nullable()
          .describe(
            "a date or time-bound note if the text ties this step to one, else null",
          ),
      }),
    )
    .describe(
      "ordered steps to apply, in the order the applicant should do them",
    ),
});

const FORMAT = zodResponseFormat(GuideSchema, "application_guide");

function buildGuideText(grant: GrantRow): string {
  const head: string[] = [];
  if (grant.open_at) head.push(`Opens: ${grant.open_at}`);
  if (grant.deadline_at) head.push(`Deadline: ${grant.deadline_at}`);
  if (grant.application_url)
    head.push(`Apply/info page: ${grant.application_url}`);
  return `${head.join("\n")}\n\n${buildGrantRequirementText(grant)}`.trim();
}

/** Generate a how-to-apply guide for a grant (LLM). */
export async function generateApplicationGuide(
  grant: GrantRow,
): Promise<ApplicationGuide> {
  const text = buildGuideText(grant)
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .slice(0, 24000);

  const completion = await openai.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert UK grants adviser helping a small business or organisation navigate how to apply for a SPECIFIC grant.

Read the grant's how-to-apply, eligibility, key dates and supporting information, then produce a clear, practical, ORDERED guide to applying for THIS grant. Application processes differ between grants, so base everything strictly on the provided text — do not invent steps, portals, or requirements that are not supported by it.

Produce:
- summary: 1–2 plain-English sentences on how to apply.
- eligibility_checklist: the key eligibility criteria the applicant must confirm they meet before applying (each a short, checkable statement).
- steps: the ordered actions the applicant takes to apply (e.g. check eligibility, register on a portal, prepare documents, complete the form, submit). For each step give: title; detail (what to do); requirements (the specific documents, information, or actions needed for that step — empty array if none); deadline (a date or time-bound note ONLY if the text ties this step to one, else null).

If the text is thin on process, give the best practical guide you can from what is provided (e.g. review the grant page, confirm eligibility, prepare a proposal, submit via the stated route). Keep it concise and actionable.`,
      },
      {
        role: "user",
        content: `Create the how-to-apply guide for this grant:\n\n${text}`,
      },
    ],
    response_format: FORMAT,
    temperature: 0.2,
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to generate application guide");

  return {
    summary: parsed.summary,
    eligibilityChecklist: parsed.eligibility_checklist,
    steps: parsed.steps,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Return the grant's cached guide, generating + persisting it (into details.guide) if
 * missing. Ensures the grant is enriched first so the guide has detail to work from.
 */
export async function ensureApplicationGuide(
  grant: GrantRow,
): Promise<ApplicationGuide | null> {
  if (grant.details?.guide) return grant.details.guide;

  let details = grant.details;
  if (!details) {
    details = await enrichGrant(grant).catch(() => null);
  }
  // Even without rich details we can still produce a basic guide from the summary.
  const guide = await generateApplicationGuide(grant).catch(() => null);
  if (!guide) return null;

  const mergedDetails = {
    ...(details ?? {
      sections: [],
      links: [],
      documents: [],
      webpageUrl: null,
    }),
    guide,
  };
  await getServiceSupabase()
    .from("grants")
    .update({ details: mergedDetails })
    .eq("id", grant.id);
  return guide;
}

/** Generate guides for up to `limit` open grants that are enriched but lack a guide. */
export async function generatePendingGuides(
  limit = 10,
): Promise<{ generated: number; attempted: number }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("grants")
    .select("*")
    .not("details", "is", null)
    .in("status", ["open", "forthcoming", "rolling"])
    .order("updated_at", { ascending: false })
    .limit(limit * 4);
  if (error) {
    // Best-effort cron path — log and report nothing attempted rather than fail.
    console.error(
      "[grants/guide] failed to list pending grants:",
      error.message,
    );
    return { generated: 0, attempted: 0 };
  }

  const grants = ((data ?? []) as GrantRow[])
    .filter((g) => !g.details?.guide)
    .slice(0, limit);
  let generated = 0;
  for (const g of grants) {
    if (await ensureApplicationGuide(g)) generated++;
  }
  return { generated, attempted: grants.length };
}
