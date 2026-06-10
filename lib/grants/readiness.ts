import type { GrantRow } from "./types";
import type { GrantScoringResult } from "./scoring";
import type { ExtractedQuestion } from "@/lib/rfp-extract";

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ReadinessResult {
  score: number; // 0–100 = share of checks passed
  ready: boolean; // all checks pass
  checks: ReadinessCheck[];
}

function hasAnswer(answers: Record<string, unknown>, id: number): boolean {
  const v = answers[String(id)] ?? answers[id as unknown as string];
  return v != null && v !== "";
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Assess whether a grant application is ready to submit: eligibility confirmed, mandatory
 * requirements answered, every selected question answered, within deadline, and the
 * grant's evidence imported into the knowledge base.
 */
export function assessGrantReadiness(input: {
  extractedQuestions: ExtractedQuestion[];
  answers: Record<string, unknown>;
  selectedIds: number[];
  grant: GrantRow;
  fit: GrantScoringResult | null;
  kbDocCount: number;
  pendingReview?: number;
  /** null = no budget started (check omitted); true/false = budget present + balanced? */
  budgetBalanced?: boolean | null;
}): ReadinessResult {
  const {
    extractedQuestions,
    answers,
    selectedIds,
    grant,
    fit,
    kbDocCount,
    pendingReview = 0,
    budgetBalanced = null,
  } = input;
  const checks: ReadinessCheck[] = [];

  if (fit) {
    checks.push({
      label: "Eligibility confirmed",
      ok: fit.eligible,
      detail: fit.eligible
        ? undefined
        : "Likely ineligible — review the eligibility & fit panel.",
    });
  }

  const mandatory = extractedQuestions.filter(
    (q) => q.mandatory || q.priority === "high",
  );
  const mandatoryAnswered = mandatory.filter((q) => hasAnswer(answers, q.id));
  checks.push({
    label: "Mandatory requirements answered",
    ok: mandatory.length === 0 || mandatoryAnswered.length === mandatory.length,
    detail: mandatory.length
      ? `${mandatoryAnswered.length}/${mandatory.length}`
      : "none flagged",
  });

  const selected =
    selectedIds.length > 0 ? selectedIds : extractedQuestions.map((q) => q.id);
  const answeredSelected = selected.filter((id) => hasAnswer(answers, id));
  checks.push({
    label: "All questions answered",
    ok: selected.length === 0 || answeredSelected.length === selected.length,
    detail: `${answeredSelected.length}/${selected.length}`,
  });

  const days = daysUntil(grant.deadline_at);
  checks.push({
    label: "Within the deadline",
    ok: days === null || days >= 0,
    detail:
      days === null
        ? "no deadline"
        : days < 0
          ? `closed ${-days}d ago`
          : `${days}d left`,
  });

  checks.push({
    label: "Grant evidence in knowledge base",
    ok: kbDocCount > 0,
    detail: `${kbDocCount} resource${kbDocCount === 1 ? "" : "s"}`,
  });

  checks.push({
    label: "High-risk answers reviewed",
    ok: pendingReview === 0,
    detail:
      pendingReview > 0 ? `${pendingReview} awaiting review` : "none pending",
  });

  if (budgetBalanced !== null) {
    checks.push({
      label: "Project budget balanced",
      ok: budgetBalanced,
      detail: budgetBalanced ? undefined : "costs and funding don't reconcile",
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    ready: checks.every((c) => c.ok),
    checks,
  };
}
