/**
 * Pure-logic unit tests for the guided grant-application flow:
 * - buildApplicationFlow — step statuses derived from draft state, nextStep
 *   selection, and progress monotonicity as an application advances.
 * - lib/grants/budget.ts — totals, presence, and the £1 balance tolerance.
 * - lib/dates.ts daysUntil — clock-injectable, so no flaky midnight maths.
 */
import { describe, it, expect } from "vitest";
import { buildApplicationFlow } from "@/lib/grants/application-flow";
import type { GrantScoringResult } from "@/lib/grants/scoring";
import type { GrantRow } from "@/lib/grants/types";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import {
  budgetTotals,
  hasBudget,
  isBudgetBalanced,
  type GrantBudget,
} from "@/lib/grants/budget";
import { daysUntil } from "@/lib/dates";

const DAY = 86_400_000;
const future = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString();
const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
  return {
    id: "g1",
    source_name: "govuk-find-a-grant",
    source_notice_id: "n1",
    source_url: null,
    application_url: null,
    title: "Cyber Security Innovation Grant",
    description: "Funding for SMEs delivering cyber security services.",
    funder_name: "DSIT",
    funder_id: null,
    funder_region: null,
    funding_type: "grant",
    amount_min: 10_000,
    amount_max: 100_000,
    currency: "GBP",
    open_at: past(10),
    deadline_at: future(30),
    status: "open",
    themes: ["cyber security"],
    sectors: [],
    regions: ["England"],
    eligibility_text: null,
    eligible_org_types: [],
    match_funding_required: false,
    beneficiaries: [],
    documents: null,
    raw_json: null,
    published_at: past(10),
    details: null,
    enriched_at: null,
    created_at: past(10),
    updated_at: past(10),
    ...overrides,
  };
}

function makeFit(
  overrides: Partial<GrantScoringResult> = {},
): GrantScoringResult {
  return {
    fitScore: 82,
    readinessScore: 70,
    recommendedAction: "apply",
    eligible: true,
    reasons: ["Your organisation type is eligible."],
    risks: [],
    missingRequirements: [],
    ...overrides,
  };
}

function makeQuestion(
  id: number,
  overrides: Partial<ExtractedQuestion> = {},
): ExtractedQuestion {
  return {
    id,
    section: "A",
    text: `Question ${id}`,
    topic: "technical",
    risk_level: "low",
    question_class: "question",
    word_limit: null,
    mandatory: false,
    priority: "medium",
    ...overrides,
  };
}

const balancedBudget: GrantBudget = {
  costs: [{ id: "c1", label: "Staff", amount: 10_000 }],
  funding: [{ id: "f1", label: "Grant requested", amount: 10_000 }],
};
const unbalancedBudget: GrantBudget = {
  costs: [{ id: "c1", label: "Staff", amount: 10_000 }],
  funding: [{ id: "f1", label: "Grant requested", amount: 4_000 }],
};

function baseInput(
  over: Partial<Parameters<typeof buildApplicationFlow>[0]> = {},
) {
  return {
    grant: makeGrant(),
    fit: makeFit(),
    extractedQuestions: [makeQuestion(1), makeQuestion(2, { mandatory: true })],
    answers: {} as Record<string, unknown>,
    selectedIds: [] as number[],
    kbDocCount: 0,
    ...over,
  };
}

function stepStatus(
  flow: ReturnType<typeof buildApplicationFlow>,
  key: string,
) {
  return flow.steps.find((s) => s.key === key)!.status;
}

describe("buildApplicationFlow — step statuses", () => {
  it("no answers: answers step is todo, eligibility done, evidence todo", () => {
    const flow = buildApplicationFlow(baseInput());
    expect(stepStatus(flow, "eligible")).toBe("done");
    expect(stepStatus(flow, "requirements")).toBe("done"); // questions exist
    expect(stepStatus(flow, "evidence")).toBe("todo"); // no KB docs
    expect(stepStatus(flow, "answers")).toBe("todo");
    expect(stepStatus(flow, "budget")).toBe("todo");
    expect(stepStatus(flow, "review")).toBe("todo");
    expect(flow.submitted).toBe(false);
    expect(flow.readyToSubmit).toBe(false);
  });

  it("partial answers: answers step is current with an x/y detail", () => {
    const flow = buildApplicationFlow(
      baseInput({ answers: { "1": "An answer" } }),
    );
    const answers = flow.steps.find((s) => s.key === "answers")!;
    expect(answers.status).toBe("current");
    expect(answers.detail).toBe("1/2 answered");
  });

  it("all answers: answers step is done; selectedIds narrows the set", () => {
    const all = buildApplicationFlow(
      baseInput({ answers: { "1": "A", "2": "B" } }),
    );
    expect(stepStatus(all, "answers")).toBe("done");

    // Only question 1 selected — answering just it completes the step.
    const selected = buildApplicationFlow(
      baseInput({ selectedIds: [1], answers: { "1": "A" } }),
    );
    expect(stepStatus(selected, "answers")).toBe("done");
  });

  it("empty/whitespaceless answers don't count", () => {
    const flow = buildApplicationFlow(baseInput({ answers: { "1": "" } }));
    expect(stepStatus(flow, "answers")).toBe("todo");
  });

  it("budget: todo when absent, blocked when unbalanced, done when balanced", () => {
    expect(stepStatus(buildApplicationFlow(baseInput()), "budget")).toBe(
      "todo",
    );
    const blocked = buildApplicationFlow(
      baseInput({ budget: unbalancedBudget }),
    );
    expect(stepStatus(blocked, "budget")).toBe("blocked");
    expect(blocked.checks.find((c) => c.label === "Budget balances")?.ok).toBe(
      false,
    );
    const done = buildApplicationFlow(baseInput({ budget: balancedBudget }));
    expect(stepStatus(done, "budget")).toBe("done");
  });

  it("no budget started: the budget gate check is omitted entirely", () => {
    const flow = buildApplicationFlow(baseInput());
    expect(flow.checks.some((c) => c.label === "Budget balances")).toBe(false);
  });

  it("no profile (fit null): eligibility is todo and points at the profile", () => {
    const flow = buildApplicationFlow(baseInput({ fit: null }));
    const step = flow.steps.find((s) => s.key === "eligible")!;
    expect(step.status).toBe("todo");
    expect(step.action?.href).toBe("/profile#grant-eligibility");
    expect(flow.eligible).toBeNull();
    expect(flow.matchScore).toBeNull();
  });

  it("ineligible org: eligibility is blocked and gates submission", () => {
    const flow = buildApplicationFlow(
      baseInput({ fit: makeFit({ eligible: false }) }),
    );
    expect(stepStatus(flow, "eligible")).toBe("blocked");
    expect(
      flow.checks.find((c) => c.label === "You're eligible to apply")?.ok,
    ).toBe(false);
    expect(flow.readyToSubmit).toBe(false);
  });

  it("ready to submit: every check ok and review step becomes current", () => {
    const flow = buildApplicationFlow(
      baseInput({
        answers: { "1": "A", "2": "B" },
        kbDocCount: 2,
        budget: balancedBudget,
        pendingReview: 0,
      }),
    );
    expect(flow.readyToSubmit).toBe(true);
    expect(stepStatus(flow, "review")).toBe("current");
    expect(flow.checks.every((c) => c.ok)).toBe(true);
  });

  it("pending review items block submission", () => {
    const flow = buildApplicationFlow(
      baseInput({
        answers: { "1": "A", "2": "B" },
        kbDocCount: 2,
        budget: balancedBudget,
        pendingReview: 3,
      }),
    );
    expect(flow.readyToSubmit).toBe(false);
    expect(
      flow.checks.find((c) => c.label === "Flagged answers resolved")?.ok,
    ).toBe(false);
  });

  it("past deadline fails the deadline check", () => {
    const flow = buildApplicationFlow(
      baseInput({ grant: makeGrant({ deadline_at: past(2) }) }),
    );
    const check = flow.checks.find(
      (c) => c.label === "Still within the deadline",
    )!;
    expect(check.ok).toBe(false);
    expect(check.detail).toBe("closed 2d ago");
  });

  it.each(["submitted", "awarded", "unsuccessful"])(
    "stage %s marks the flow submitted and the review step done",
    (stage) => {
      const flow = buildApplicationFlow(baseInput({ stage }));
      expect(flow.submitted).toBe(true);
      expect(stepStatus(flow, "review")).toBe("done");
    },
  );

  it("stage drafting is not submitted", () => {
    const flow = buildApplicationFlow(baseInput({ stage: "drafting" }));
    expect(flow.submitted).toBe(false);
  });
});

describe("buildApplicationFlow — nextStep and progress", () => {
  it("nextStep is the first step that isn't done", () => {
    const fresh = buildApplicationFlow(baseInput({ fit: null }));
    expect(fresh.nextStep?.key).toBe("eligible");

    const evidenceNext = buildApplicationFlow(baseInput());
    expect(evidenceNext.nextStep?.key).toBe("evidence");

    const budgetNext = buildApplicationFlow(
      baseInput({ answers: { "1": "A", "2": "B" }, kbDocCount: 1 }),
    );
    expect(budgetNext.nextStep?.key).toBe("budget");
  });

  it("nextStep is null only when everything including review is done", () => {
    const flow = buildApplicationFlow(
      baseInput({
        answers: { "1": "A", "2": "B" },
        kbDocCount: 2,
        budget: balancedBudget,
        stage: "submitted",
      }),
    );
    expect(flow.steps.every((s) => s.status === "done")).toBe(true);
    expect(flow.nextStep).toBeNull();
    expect(flow.progress).toBe(100);
  });

  it("progress is monotonic as the application advances", () => {
    const states = [
      baseInput({ fit: null }),
      baseInput(),
      baseInput({ kbDocCount: 1 }),
      baseInput({ kbDocCount: 1, answers: { "1": "A" } }),
      baseInput({ kbDocCount: 1, answers: { "1": "A", "2": "B" } }),
      baseInput({
        kbDocCount: 1,
        answers: { "1": "A", "2": "B" },
        budget: balancedBudget,
      }),
      baseInput({
        kbDocCount: 1,
        answers: { "1": "A", "2": "B" },
        budget: balancedBudget,
        stage: "submitted",
      }),
    ];
    const progress = states.map((s) => buildApplicationFlow(s).progress);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
    expect(progress[0]).toBeGreaterThanOrEqual(0);
    expect(progress[progress.length - 1]).toBe(100);
  });
});

describe("budget helpers", () => {
  it("budgetTotals sums costs/funding and ignores non-finite amounts", () => {
    const totals = budgetTotals({
      costs: [
        { id: "c1", label: "Staff", amount: 1_000 },
        { id: "c2", label: "Broken", amount: Number.NaN },
      ],
      funding: [{ id: "f1", label: "Grant", amount: 400 }],
    });
    expect(totals).toEqual({ cost: 1_000, funding: 400, balance: -600 });
  });

  it("budgetTotals handles null and empty budgets", () => {
    expect(budgetTotals(null)).toEqual({ cost: 0, funding: 0, balance: 0 });
    expect(budgetTotals({ costs: [], funding: [] })).toEqual({
      cost: 0,
      funding: 0,
      balance: 0,
    });
  });

  it("hasBudget is true with any line on either side", () => {
    expect(hasBudget(null)).toBe(false);
    expect(hasBudget({ costs: [], funding: [] })).toBe(false);
    expect(
      hasBudget({ costs: [{ id: "c", label: "x", amount: 1 }], funding: [] }),
    ).toBe(true);
    expect(
      hasBudget({ costs: [], funding: [{ id: "f", label: "x", amount: 1 }] }),
    ).toBe(true);
  });

  it("isBudgetBalanced needs both sides present and within £1", () => {
    expect(isBudgetBalanced(balancedBudget)).toBe(true);
    expect(isBudgetBalanced(unbalancedBudget)).toBe(false);
    expect(isBudgetBalanced(null)).toBe(false);
    expect(isBudgetBalanced({ costs: [], funding: [] })).toBe(false);
    // funding only — cost must be > 0
    expect(
      isBudgetBalanced({
        costs: [],
        funding: [{ id: "f", label: "Grant", amount: 100 }],
      }),
    ).toBe(false);
    // within the £1 rounding tolerance
    expect(
      isBudgetBalanced({
        costs: [{ id: "c", label: "Staff", amount: 1_000 }],
        funding: [{ id: "f", label: "Grant", amount: 1_000.9 }],
      }),
    ).toBe(true);
  });
});

describe("daysUntil", () => {
  const NOW = new Date("2026-06-10T12:00:00Z");

  it("rounds up partial days (ceiling semantics)", () => {
    expect(daysUntil("2026-06-10T18:00:00Z", NOW)).toBe(1); // +6h
    expect(daysUntil("2026-06-11T12:00:00Z", NOW)).toBe(1); // exactly +24h
    expect(daysUntil("2026-06-11T12:00:01Z", NOW)).toBe(2); // just past +24h
    expect(daysUntil("2026-06-24T12:00:00Z", NOW)).toBe(14);
  });

  it("treats now and the recent past as day 0 (due today)", () => {
    expect(daysUntil("2026-06-10T12:00:00Z", NOW)).toBe(0);
    expect(daysUntil("2026-06-10T00:00:00Z", NOW)).toBe(0); // -12h
  });

  it("is negative once a full day has passed", () => {
    expect(daysUntil("2026-06-09T11:00:00Z", NOW)).toBe(-1); // -25h
    expect(daysUntil("2026-06-07T12:00:00Z", NOW)).toBe(-3);
  });

  it("accepts a numeric clock too and defaults to Date.now()", () => {
    expect(daysUntil("2026-06-11T12:00:00Z", NOW.getTime())).toBe(1);
    // Default clock: a deadline ~10 days out is 10 or 11 depending on ms drift.
    const tenDays = new Date(Date.now() + 10 * DAY + 1000).toISOString();
    const days = daysUntil(tenDays);
    expect(days === 10 || days === 11).toBe(true);
  });
});
