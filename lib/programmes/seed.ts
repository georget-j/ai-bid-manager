// Programmes → grants rows. The keystone of the programmes lane: every curated
// programme is upserted into the `grants` catalogue under source
// "curated-programmes", so the ENTIRE guided apply flow (draft-application →
// question extraction → KB-grounded answering → review/export) works for
// programmes with zero changes to that flow.
//
// Conventions follow lib/grants/sync.ts (toGrantRow column shapes, upsert on
// (source_name, source_notice_id)) and lib/events/seed.ts (curated, idempotent,
// plain-English data; nothing guessed). Grant surfaces exclude this source by
// default (lib/grants/data.ts DEFAULT_EXCLUDED_GRANT_SOURCES), so these rows are
// reachable only from /programmes.

import { getServiceSupabase } from "@/lib/supabase-service";
import type { GrantDetails } from "@/lib/grants/types";
import { PROGRAMMES, CURATED_PROGRAMMES_SOURCE, type Programme } from "./data";

// ── Curated application question sets ────────────────────────────────────────
// Real, plausible questions from these programmes' PUBLIC application forms, for
// the wedge five (cyber/deep-tech programmes the ICP actually applies to). They
// are stored inside grants.details.sections — the exact shape the draft path
// reads: app/api/grants/[id]/draft-application falls back to
// buildGrantRequirementText(grant) (lib/grants/application.ts), which walks
// details.sections, and the grant-mode extractor surfaces the funder's own
// question wording near-verbatim. Always confirm against the live form — these
// are curated approximations, marked as such in the stored details.

export const PROGRAMME_QUESTION_SETS: Record<string, string[]> = {
  "ncsc-for-startups": [
    "Tell us about your company and the problem you are solving.",
    "Describe your product or service and what stage it is at (idea, prototype, or in market).",
    "Which NCSC For Startups challenge area does your product address, and how?",
    "What makes your approach technically novel compared with existing cyber security products?",
    "Who are your current or target customers, and what traction do you have so far?",
    "How would access to NCSC technical experts change your product or roadmap?",
    "Tell us about your founding team and your experience in cyber security or national security.",
    "What do you hope to achieve by the end of your time on the programme?",
    "Are there any constraints we should know about (security clearances, data handling, IP ownership)?",
  ],
  "cyber-runway": [
    "Which track are you applying for (Launch, Grow or Scale), and why is it right for your stage?",
    "Describe your cyber security product or service in plain English.",
    "What problem do your customers have, and how do you solve it better than the alternatives?",
    "Tell us about your team, including any relevant cyber security experience and qualifications.",
    "What is your current revenue and funding position?",
    "What are your growth goals for the next 12 months, and what is currently blocking them?",
    "How will the programme's mentoring, masterclasses and investor access help you reach those goals?",
    "How does your company contribute to the diversity and resilience of the UK cyber sector?",
    "Where is your company registered, and where is your team based?",
  ],
  cylon: [
    "What security problem are you solving, and why does it matter now?",
    "Describe your product and its current stage of development.",
    "Who is your target buyer (for example CISO, SOC team, developer, SME) and how do you reach them?",
    "What is your unfair advantage — technology, team, or insight?",
    "Tell us about each founder, how you met, and how you split responsibilities.",
    "What traction do you have so far (pilots, design partners, paying customers, revenue)?",
    "How much are you raising, and what will the funding be used for?",
    "What do you want from CyLon beyond capital?",
    "Who are your closest competitors, and how are you different?",
  ],
  "entrepreneur-first": [
    "What have you built or achieved that best demonstrates exceptional ability?",
    "Tell us about your background and your technical or domain expertise.",
    "Why do you want to build a company now, and why with Entrepreneur First?",
    "Do you already have ideas you want to explore? Describe them briefly.",
    "What is the most impressive technical project you have worked on, and what was your specific contribution?",
    "Give an example of when you showed unusual initiative, ambition or resilience.",
    "What would you be doing over the next two years if you were not joining EF?",
    "Are you applying with a co-founder, or open to matching with one on the programme?",
    "Which cohort and location are you applying to, and can you commit to it full-time?",
  ],
  seedcamp: [
    "What does your company do? Describe it in one or two sentences.",
    "What problem are you solving, and how big is the market?",
    "Tell us about the founding team and why you are the right people to build this.",
    "What is the current status of your product, and what traction do you have?",
    "What is your business model — how do you make money?",
    "Who are your competitors, and what is your edge over them?",
    "How much are you raising, at what stage, and what will the funds let you achieve?",
    "What progress do you expect to make in the next 12 months?",
    "How did you hear about Seedcamp, and have you spoken to anyone in our network?",
  ],
};

// ── Pure mapping helpers (unit-tested in tests/programmes.test.ts) ───────────

/**
 * Derive grants.regions values from a programme's free-text location, using the
 * same region vocabulary as the grants catalogue. Falls back to United Kingdom.
 */
export function deriveRegions(location: string): string[] {
  const loc = location.toLowerCase();
  const regions: string[] = [];
  if (loc.includes("london")) regions.push("London");
  if (loc.includes("cambridge")) regions.push("East of England");
  if (
    loc.includes("scotland") ||
    loc.includes("edinburgh") ||
    loc.includes("glasgow") ||
    loc.includes("aberdeen")
  ) {
    regions.push("Scotland");
  }
  if (
    loc.includes("wales") ||
    loc.includes("cardiff") ||
    loc.includes("swansea") ||
    loc.includes("newport")
  ) {
    regions.push("Wales");
  }
  if (loc.includes("northern ireland") || loc.includes("belfast")) {
    regions.push("Northern Ireland");
  }
  if (
    regions.length > 0 || // any UK sub-region implies the UK
    loc.includes("uk") ||
    loc.includes("united kingdom") ||
    loc.includes("national")
  ) {
    regions.push("United Kingdom");
  }
  if (
    loc.includes("global") ||
    loc.includes("europe") ||
    loc.includes("us") ||
    loc.includes("international")
  ) {
    regions.push("International");
  }
  return regions.length > 0 ? [...new Set(regions)] : ["United Kingdom"];
}

/** grants.sectors for a programme: its focus areas, plus the wedge sector. */
export function programmeSectors(p: Programme): string[] {
  const sectors = [...p.focus];
  if (
    p.cyberRelevant &&
    !sectors.some((s) => s.toLowerCase() === "cyber security")
  ) {
    sectors.push("cyber security");
  }
  return sectors;
}

// GrantDetails plus the curated-provenance markers we store alongside (details is
// a jsonb column, so extra keys are fine; readers only look at `sections`).
export interface CuratedGrantDetails extends GrantDetails {
  provenance: typeof CURATED_PROGRAMMES_SOURCE;
  curated_questions?: string[];
}

/**
 * Build grants.details for a programme. Sections carry the programme's offer and
 * cadence (so scoring and question extraction see the full picture), and — for
 * programmes with a curated question set — the application questions themselves,
 * in the details.sections shape buildGrantRequirementText() actually reads.
 */
export function buildProgrammeDetails(p: Programme): CuratedGrantDetails {
  const sections = [
    { heading: "About the programme", text: p.description },
    { heading: "What you get", text: p.offer },
    { heading: "When to apply", text: p.cadence },
  ];

  const questions = PROGRAMME_QUESTION_SETS[p.id];
  if (questions) {
    sections.push({
      heading: "Application questions",
      text:
        `Questions from this programme's public application form, curated by the team ` +
        `(provenance: ${CURATED_PROGRAMMES_SOURCE}). Confirm the live form on the programme's site before submitting.\n` +
        questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    });
  }

  return {
    sections,
    // Deliberately NO links/documents: ingestGrantDocuments() would fetch them
    // into the KB and questions extracted from a marketing homepage would beat
    // the curated sections (doc-derived questions win in mergeExtractedQuestions).
    // With nothing to ingest, the draft path always extracts from the curated
    // sections above. The site stays reachable via webpageUrl/application_url.
    links: [],
    documents: [],
    webpageUrl: p.applicationUrl,
    provenance: CURATED_PROGRAMMES_SOURCE,
    ...(questions ? { curated_questions: questions } : {}),
  };
}

/**
 * Map a programme to its grants-table row (column shapes mirror
 * lib/grants/sync.ts toGrantRow). All programmes are rolling/no-deadline: a
 * deadline_at is only ever set where a real public cohort close date is known
 * with confidence — none currently is, so every row is status "rolling".
 */
export function programmeToGrantRow(p: Programme): Record<string, unknown> {
  return {
    source_name: CURATED_PROGRAMMES_SOURCE,
    source_notice_id: p.id,
    source_url: p.applicationUrl,
    application_url: p.applicationUrl,
    title: p.name,
    description: p.description,
    funder_name: p.organiser,
    funder_id: null,
    funder_region: null,
    funding_type: "other",
    amount_min: null,
    amount_max: null,
    currency: "GBP",
    open_at: null,
    deadline_at: null,
    status: "rolling",
    themes: [],
    sectors: programmeSectors(p),
    regions: deriveRegions(p.location),
    eligibility_text: null,
    eligible_org_types: [],
    match_funding_required: false,
    beneficiaries: [],
    documents: null,
    raw_json: { curated: true, programme: p },
    published_at: null,
    details: buildProgrammeDetails(p),
    updated_at: new Date().toISOString(),
  };
}

// ── Seeder ───────────────────────────────────────────────────────────────────

/**
 * Idempotent: upsert every curated programme into `grants` on
 * (source_name, source_notice_id). Curated rows are owned by this seed, so
 * re-running refreshes title/description/details to the current curated copy
 * (unlike connector-synced sources, there are no operator edits to preserve).
 */
export async function seedProgrammeGrants(): Promise<{
  upserted: number;
  ids: string[];
}> {
  const supabase = getServiceSupabase();
  const rows = PROGRAMMES.map(programmeToGrantRow);

  const { data, error } = await supabase
    .from("grants")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, {
      onConflict: "source_name,source_notice_id",
      ignoreDuplicates: false,
    })
    .select("id");
  if (error) {
    throw new Error(`Failed to seed programme grants: ${error.message}`);
  }
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  return { upserted: ids.length, ids };
}
