/**
 * Automated evaluation harness — runs against the live Supabase + OpenAI APIs.
 *
 * Usage:  npm run test:eval
 *
 * These tests make real API calls and cost a small amount (~$0.01 total).
 * They are intentionally separate from the unit test suite (npm test) so CI
 * doesn't require live credentials.
 *
 * Each test maps directly to a case in docs/evaluation.md.
 */
import { describe, it, expect } from "vitest";
import { retrieveChunks } from "../lib/retrieval";
import { generateRFPResponse } from "../lib/generation";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasDocument(
  chunks: Awaited<ReturnType<typeof retrieveChunks>>,
  titleSubstring: string,
): boolean {
  return chunks.some((c) => c.document_title.includes(titleSubstring));
}

// ── Retrieval quality ─────────────────────────────────────────────────────────

describe("Retrieval quality — hybrid search", () => {
  it("case 1: AML query retrieves the fintech case study as primary source", async () => {
    const query =
      "Draft a response to a fintech customer asking how we reduce AML review time.";
    const chunks = await retrieveChunks(query);

    expect(chunks.length).toBeGreaterThan(0);
    expect(hasDocument(chunks, "Fintech AML")).toBe(true);

    // Primary source should be in the top 3 results
    const top3 = chunks.slice(0, 3);
    expect(top3.some((c) => c.document_title.includes("Fintech AML"))).toBe(
      true,
    );
  });

  it("case 2: SOC 2 query retrieves the security document", async () => {
    const query = "Do we have SOC 2 certification?";
    const chunks = await retrieveChunks(query);

    expect(hasDocument(chunks, "Enterprise AI Security")).toBe(true);
  });

  it("case 3: legaltech query retrieves the legaltech case study, not the fintech one", async () => {
    const query =
      "Which case studies are relevant to a legaltech workflow automation pitch for contract review?";
    const chunks = await retrieveChunks(query);

    expect(hasDocument(chunks, "Legaltech")).toBe(true);

    // Fintech should not be the top result when asking specifically about legaltech
    expect(chunks[0].document_title).not.toContain("Fintech AML");
  });

  it("case 5: implementation timeline query retrieves the playbook", async () => {
    const query =
      "What is our standard implementation timeline and what do we require from the customer?";
    const chunks = await retrieveChunks(query);

    expect(hasDocument(chunks, "Implementation Playbook")).toBe(true);
  });
});

// ── Hallucination guard ───────────────────────────────────────────────────────

describe("Hallucination guard", () => {
  it("case 4: off-topic query returns low confidence and no invented capabilities", async () => {
    const query =
      "Can this platform help with hospital staffing optimisation and NHS workforce planning?";
    const chunks = await retrieveChunks(query);
    const response = await generateRFPResponse(query, chunks);

    // Must not claim high confidence when no relevant evidence exists.
    // The model may return 'low' or 'medium' — both are acceptable.
    // 'high' is the failure mode: falsely confident about an off-topic domain.
    expect(response.confidence.level).not.toBe("high");

    // Missing information should flag the absence of healthcare evidence
    const missingText = response.missing_information
      .map((m) => `${m.item} ${m.why_it_matters}`.toLowerCase())
      .join(" ");
    expect(
      missingText.includes("health") ||
        missingText.includes("nhs") ||
        missingText.includes("workforce") ||
        missingText.includes("case stud") ||
        missingText.includes("evidence"),
    ).toBe(true);

    // Draft answer should not confidently claim healthcare capabilities
    const draft = response.draft_answer.toLowerCase();
    expect(draft).not.toMatch(
      /we (can|are able to|do) (help|support|handle) (hospital|nhs|staffing)/i,
    );
  });
});
