// Submission-readiness for a grant application. Thin adapter over the shared
// application-flow model (lib/grants/application-flow.ts) so the review panel and the
// guided step spine never disagree about what's done.

import type { GrantRow } from "./types";
import type { GrantScoringResult } from "./scoring";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import type { GrantBudget } from "./budget";
import { buildApplicationFlow, type ReadinessCheck } from "./application-flow";

export type { ReadinessCheck } from "./application-flow";

export interface ReadinessResult {
  score: number; // 0–100 = share of checks passed
  ready: boolean; // all checks pass
  checks: ReadinessCheck[];
}

/**
 * Assess whether a grant application is ready to submit: eligibility confirmed, required
 * questions answered, every selected question answered, within deadline, the funder's
 * documents added, flagged answers resolved, and (if started) the budget balanced.
 */
export function assessGrantReadiness(input: {
  extractedQuestions: ExtractedQuestion[];
  answers: Record<string, unknown>;
  selectedIds: number[];
  grant: GrantRow;
  fit: GrantScoringResult | null;
  kbDocCount: number;
  pendingReview?: number;
  budget?: GrantBudget | null;
  stage?: string | null;
}): ReadinessResult {
  const flow = buildApplicationFlow(input);
  const passed = flow.checks.filter((c) => c.ok).length;
  return {
    score: Math.round((passed / flow.checks.length) * 100),
    ready: flow.readyToSubmit,
    checks: flow.checks,
  };
}
