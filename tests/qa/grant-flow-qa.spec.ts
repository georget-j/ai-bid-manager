/**
 * Opt-in end-to-end QA of the guided grant application flow against REAL UK grants.
 * Runs only via `npm run qa:grants` (vitest.qa.config.ts) — never in `npm test`.
 * Hits the live DB (service role) + OpenAI + real gov sites; cleans up after itself.
 * Set QA_KEEP=1 to leave the seeded QA org/grants in place for inspection.
 */
import { describe, it, expect } from "vitest";
import { runGrantFlowQA } from "../../scripts/grant-flow-qa";

describe("Grant flow QA — real UK grants end-to-end", () => {
  it("drives diverse grants through every step of the guided flow", async () => {
    const summary = await runGrantFlowQA({ keep: process.env.QA_KEEP === "1" });

    const mustPass = [
      "extracted requirements (some grant)",
      "generated a how-to-apply guide",
      "eligibility branch correct",
      "answered KB-grounded questions",
      "produced citations (some grant)",
      "reached 'ready to submit' (showcase)",
      "exported DOCX with budget",
      "no unexpected errors",
    ];
    for (const cap of mustPass) {
      expect(summary.capabilities[cap], cap).toBe(true);
    }
  });
});
