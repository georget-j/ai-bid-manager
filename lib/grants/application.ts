import type { GrantRow } from "./types";

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
