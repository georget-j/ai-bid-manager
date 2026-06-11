// Plain-English display helpers for the tender side of the app. Keep internal enum
// values and engineering jargon ("confidence", "extraction", raw legal-form codes)
// out of what a non-technical bid writer sees. Mirrors lib/grants/copy.ts.

import type { Confidence } from "@/lib/schema";

export type ConfidenceLevel = Confidence["level"];

/**
 * What a confidence level means to the person reading the answer: how much of
 * it is backed by their own evidence library, and whether they need to step in.
 */
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "Well evidenced",
  medium: "Partly evidenced",
  low: "Needs your input",
};

/** Human label for an answer's confidence level — never show the raw enum value. */
export function confidenceLabel(level: ConfidenceLevel): string {
  return CONFIDENCE_LABELS[level] ?? "Partly evidenced";
}

/**
 * The legal forms the profile page offers. `value` is stored as-is in the
 * database (do not change); `label` is what the user sees in the select.
 */
export const LEGAL_FORM_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "company", label: "Limited company" },
  { value: "charity", label: "Registered charity" },
  { value: "cic", label: "Community interest company (CIC)" },
  { value: "registered-society", label: "Registered society" },
  { value: "partnership", label: "Partnership" },
  { value: "sole-trader", label: "Sole trader" },
  { value: "university", label: "University" },
  { value: "public-body", label: "Public body" },
  { value: "other", label: "Other" },
];

/** Human label for a stored legal-form code — never show the raw enum value. */
export function legalFormLabel(value: string): string {
  return LEGAL_FORM_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
