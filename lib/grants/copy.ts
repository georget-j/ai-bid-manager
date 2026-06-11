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

/** What `formatAmountRange` returns when a grant has no usable amounts. */
export const AMOUNT_NOT_STATED = "Amount not stated";

// Catalogue minimums of £5 or less are placeholders ("from £1"), not real
// floors — treat them as absent so we never render a "£1–£1.4m" range.
const PLACEHOLDER_MIN = 5;

/** Compact £ display shared by grant cards and headers: £950, £25k, £1.4m. */
function compactAmount(n: number): string {
  if (n >= 1_000_000)
    return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString()}`;
}

/**
 * One shared way to show a grant's funding range:
 * - placeholder/absent minimum with a maximum → "Up to £1.4m"
 * - minimum only → "From £25k"
 * - equal min and max → "£50k"
 * - both present → "£10k–£100k"
 * - neither usable → "Amount not stated"
 */
export function formatAmountRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const lo =
    typeof min === "number" && Number.isFinite(min) && min > PLACEHOLDER_MIN
      ? min
      : null;
  const hi =
    typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null;
  if (lo == null && hi == null) return AMOUNT_NOT_STATED;
  if (lo == null) return `Up to ${compactAmount(hi!)}`;
  if (hi == null) return `From ${compactAmount(lo)}`;
  if (lo === hi) return compactAmount(lo);
  return `${compactAmount(lo)}–${compactAmount(hi)}`;
}
