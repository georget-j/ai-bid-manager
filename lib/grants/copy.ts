// Plain-English display helpers for the grants UI. Keep internal enum values and jargon
// ("fit score", "confidence", "do-not-apply") out of what a non-technical bid writer sees.

import type { GrantRecommendedAction } from "./types";

/** One-word band for a 0–100 score, used for wording the "match". */
export function matchVerdict(score: number, eligible: boolean): string {
  if (!eligible) return "Probably not a fit";
  if (score >= 75) return "Strong match";
  if (score >= 50) return "Good match";
  if (score >= 30) return "Partial match";
  return "Weak match";
}

const ACTION_LABELS: Record<GrantRecommendedAction, string> = {
  apply: "Worth applying",
  maybe: "Worth a look",
  "needs-review": "Worth a look",
  "do-not-apply": "Probably not a fit",
};

/** Human label for the recommended action — never show the raw enum value. */
export function actionLabel(
  action: GrantRecommendedAction,
  eligible: boolean,
): string {
  if (!eligible) return "Probably not a fit";
  return ACTION_LABELS[action] ?? "Worth a look";
}

/** Shared colour for a 0–100 match score (cards, detail, spine). */
export function matchColor(score: number, eligible = true): string {
  if (!eligible) return "#dc2626";
  if (score >= 70) return "#059669";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}
