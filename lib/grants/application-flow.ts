// The single source of truth for "where is this grant application up to?" — used by both
// the guided step spine (app/rfp/drafts/[id]) and the review-&-submit gate. Every step's
// status is derived from existing response_drafts columns; there is no stored "current step".
//
// Six plain-English steps a non-technical applicant can follow in order:
//   1 Check you're eligible · 2 What the funder needs · 3 Gather your evidence
//   4 Answer the questions · 5 Build your budget · 6 Review & submit

import type { GrantRow } from "./types";
import type { GrantScoringResult } from "./scoring";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import type { GrantBudget } from "./budget";
import { hasBudget, isBudgetBalanced } from "./budget";

export type StepKey =
  | "eligible"
  | "requirements"
  | "evidence"
  | "answers"
  | "budget"
  | "review";

// done = complete · current = in progress · todo = not started · blocked = needs attention
export type StepStatus = "done" | "current" | "todo" | "blocked";

export interface StepAction {
  label: string;
  /** A page/profile link; when absent the UI scrolls to the step's own anchor. */
  href?: string;
}

export interface FlowStep {
  key: StepKey;
  anchorId: string;
  number: number;
  label: string; // plain-English title
  help: string; // one-line guidance
  status: StepStatus;
  detail: string; // short status string ("3/7 answered", "Eligible · 82 match")
  action?: StepAction;
}

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail?: string;
  /** Step to jump to in order to fix this check. */
  anchorId?: string;
  action?: StepAction;
}

export interface ApplicationFlow {
  steps: FlowStep[];
  /** Granular gate shown on the Review & submit step. */
  checks: ReadinessCheck[];
  progress: number; // 0–100 share of steps complete
  readyToSubmit: boolean;
  submitted: boolean;
  matchScore: number | null; // null = no profile yet
  eligible: boolean | null; // null = no profile yet
  /** First step that isn't done — drives the persistent "Next:" CTA. */
  nextStep: FlowStep | null;
}

const PROFILE_GRANT_HREF = "/profile#grant-eligibility";

function hasAnswer(answers: Record<string, unknown>, id: number): boolean {
  const v = answers[String(id)] ?? answers[id as unknown as string];
  return v != null && v !== "";
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function buildApplicationFlow(input: {
  grant: GrantRow;
  fit: GrantScoringResult | null;
  extractedQuestions: ExtractedQuestion[];
  answers: Record<string, unknown>;
  selectedIds: number[];
  kbDocCount: number;
  pendingReview?: number;
  budget?: GrantBudget | null;
  stage?: string | null;
}): ApplicationFlow {
  const {
    grant,
    fit,
    extractedQuestions,
    answers,
    selectedIds,
    kbDocCount,
    pendingReview = 0,
    budget = null,
    stage = null,
  } = input;

  // ── facts ────────────────────────────────────────────────────────────────
  const submitted =
    stage === "submitted" || stage === "awarded" || stage === "unsuccessful";

  const eligible = fit ? fit.eligible : null;
  const matchScore = fit ? fit.fitScore : null;

  const requirementsCount = extractedQuestions.length;

  const selected =
    selectedIds.length > 0 ? selectedIds : extractedQuestions.map((q) => q.id);
  const answeredSelected = selected.filter((id) => hasAnswer(answers, id));
  const allAnswered =
    selected.length > 0 && answeredSelected.length === selected.length;

  const mandatory = extractedQuestions.filter(
    (q) => q.mandatory || q.priority === "high",
  );
  const mandatoryAnswered = mandatory.filter((q) => hasAnswer(answers, q.id));
  const mandatoryDone =
    mandatory.length === 0 || mandatoryAnswered.length === mandatory.length;

  const days = daysUntil(grant.deadline_at);
  const withinDeadline = days === null || days >= 0;

  const budgetStarted = hasBudget(budget);
  const budgetBalanced = budgetStarted ? isBudgetBalanced(budget) : null;

  // ── steps 1–5 ──────────────────────────────────────────────────────────────
  const steps: FlowStep[] = [];

  steps.push({
    key: "eligible",
    anchorId: "step-eligible",
    number: 1,
    label: "Check you're eligible",
    help: "Make sure your organisation can apply for this grant.",
    status: eligible == null ? "todo" : eligible ? "done" : "blocked",
    detail:
      eligible == null
        ? "Add your organisation details to check"
        : eligible
          ? matchScore != null
            ? `Eligible · ${matchScore} match`
            : "Eligible"
          : "Likely ineligible — check the gaps below",
    action:
      eligible == null
        ? { label: "Complete your profile", href: PROFILE_GRANT_HREF }
        : eligible
          ? undefined
          : { label: "Review eligibility gaps" },
  });

  steps.push({
    key: "requirements",
    anchorId: "step-requirements",
    number: 2,
    label: "What the funder needs",
    help: "See what this funder asks for and how their process works.",
    status: requirementsCount > 0 ? "done" : "todo",
    detail:
      requirementsCount > 0
        ? `${requirementsCount} requirement${requirementsCount === 1 ? "" : "s"} identified`
        : "Nothing identified yet",
    action:
      requirementsCount > 0
        ? undefined
        : { label: "Upload the application form" },
  });

  steps.push({
    key: "evidence",
    anchorId: "step-evidence",
    number: 3,
    label: "Gather your evidence",
    help: "Add the funder's documents so your answers are grounded in them.",
    status: kbDocCount > 0 ? "done" : "todo",
    detail: `${kbDocCount} document${kbDocCount === 1 ? "" : "s"} added`,
    action:
      kbDocCount > 0 ? undefined : { label: "Add the funder's documents" },
  });

  const answersStatus: StepStatus = allAnswered
    ? "done"
    : answeredSelected.length > 0
      ? "current"
      : "todo";
  steps.push({
    key: "answers",
    anchorId: "step-answers",
    number: 4,
    label: "Answer the questions",
    help: "Draft an answer to each requirement, grounded in your evidence.",
    status: answersStatus,
    detail: `${answeredSelected.length}/${selected.length || requirementsCount} answered`,
    action: allAnswered ? undefined : { label: "Answer the questions" },
  });

  const budgetStatus: StepStatus = !budgetStarted
    ? "todo"
    : budgetBalanced
      ? "done"
      : "blocked";
  steps.push({
    key: "budget",
    anchorId: "step-budget",
    number: 5,
    label: "Build your budget",
    help: "Set out your project costs and where the funding comes from.",
    status: budgetStatus,
    detail: !budgetStarted
      ? "Not started yet"
      : budgetBalanced
        ? "Costs and funding balance"
        : "Costs and funding don't balance",
    action:
      budgetStatus === "done"
        ? undefined
        : {
            label: budgetStarted ? "Balance your budget" : "Build your budget",
          },
  });

  // ── readiness checks (the gate for Review & submit) ──────────────────────────
  const checks: ReadinessCheck[] = [];
  if (fit) {
    checks.push({
      label: "You're eligible to apply",
      ok: fit.eligible,
      anchorId: "step-eligible",
      detail: fit.eligible
        ? undefined
        : "Your organisation may not qualify — check the gaps.",
      action: fit.eligible ? undefined : { label: "Review eligibility" },
    });
  }
  checks.push({
    label: "Required questions answered",
    ok: mandatoryDone,
    anchorId: "step-answers",
    detail: mandatory.length
      ? `${mandatoryAnswered.length}/${mandatory.length}`
      : "none flagged",
    action: mandatoryDone ? undefined : { label: "Answer required questions" },
  });
  checks.push({
    label: "Every question answered",
    ok: selected.length === 0 || allAnswered,
    anchorId: "step-answers",
    detail: `${answeredSelected.length}/${selected.length}`,
    action:
      selected.length === 0 || allAnswered
        ? undefined
        : { label: "Finish the answers" },
  });
  checks.push({
    label: "Still within the deadline",
    ok: withinDeadline,
    detail:
      days === null
        ? "no deadline"
        : days < 0
          ? `closed ${-days}d ago`
          : `${days}d left`,
  });
  checks.push({
    label: "The funder's documents added",
    ok: kbDocCount > 0,
    anchorId: "step-evidence",
    detail: `${kbDocCount} document${kbDocCount === 1 ? "" : "s"}`,
    action: kbDocCount > 0 ? undefined : { label: "Add documents" },
  });
  checks.push({
    label: "Flagged answers resolved",
    ok: pendingReview === 0,
    anchorId: "step-answers",
    detail: pendingReview > 0 ? `${pendingReview} waiting` : "none pending",
  });
  if (budgetBalanced !== null) {
    checks.push({
      label: "Budget balances",
      ok: budgetBalanced,
      anchorId: "step-budget",
      detail: budgetBalanced ? undefined : "costs and funding don't reconcile",
      action: budgetBalanced ? undefined : { label: "Balance the budget" },
    });
  }

  const readyToSubmit = checks.every((c) => c.ok);
  const readyPct = Math.round(
    (checks.filter((c) => c.ok).length / checks.length) * 100,
  );

  // ── step 6 — review & submit ─────────────────────────────────────────────────
  const reviewStatus: StepStatus = submitted
    ? "done"
    : readyToSubmit
      ? "current"
      : "todo";
  steps.push({
    key: "review",
    anchorId: "step-review",
    number: 6,
    label: "Review & submit",
    help: "Check everything's in place, export your answers, and mark it submitted.",
    status: reviewStatus,
    detail: submitted
      ? "Submitted"
      : readyToSubmit
        ? "Ready to submit"
        : `${readyPct}% ready`,
    action: submitted
      ? undefined
      : readyToSubmit
        ? { label: "Mark as submitted" }
        : { label: "See what's left" },
  });

  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const nextStep = steps.find((s) => s.status !== "done") ?? null;

  return {
    steps,
    checks,
    progress,
    readyToSubmit,
    submitted,
    matchScore,
    eligible,
    nextStep,
  };
}
