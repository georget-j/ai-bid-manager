/**
 * Unit tests for the shareable grant application export (lib/export-grant-docx.ts).
 *
 * DOCX buffers are zips, so we keep it pragmatic: the pure helpers (genre →
 * doc-type mapping, completeness, word-count/over-limit maths, requested-amount
 * derivation) are tested directly, and generateGrantApplicationDocx is asserted
 * to resolve to a non-empty Buffer for a minimal fixture in both modes.
 */
import { describe, it, expect } from "vitest";
import {
  docTypeForGenre,
  answerTextFor,
  wordCountOf,
  isOverWordLimit,
  questionCompleteness,
  requestedAmountFromBudget,
  formatAmountRange,
  generateGrantApplicationDocx,
  type GrantExportAnswer,
  type GrantExportQuestion,
} from "@/lib/export-grant-docx";
import type { RFPResponse } from "@/lib/schema";
import type { GrantBudget } from "@/lib/grants/budget";

function makeResponse(overrides: Partial<RFPResponse> = {}): RFPResponse {
  return {
    draft_answer: "We deliver cyber security services to UK SMEs.",
    executive_summary: "Strong fit for the programme.",
    supporting_evidence: [],
    citations: [],
    missing_information: [],
    confidence: { level: "high", reason: "Well covered by our documents." },
    suggested_next_actions: [],
    ...overrides,
  };
}

function makeAnswer(
  id: number,
  overrides: Partial<GrantExportAnswer> = {},
): GrantExportAnswer {
  return {
    question_id: id,
    question_text: `Question ${id}`,
    section: "About your project",
    response: makeResponse(),
    ...overrides,
  };
}

function makeQuestion(
  id: number,
  overrides: Partial<GrantExportQuestion> = {},
): GrantExportQuestion {
  return {
    id,
    text: `Question ${id}`,
    section: "About your project",
    word_limit: null,
    ...overrides,
  };
}

// ── docTypeForGenre (contract C3) ─────────────────────────────────────────────

describe("docTypeForGenre", () => {
  it("maps each genre kind to its doc-type heading", () => {
    expect(docTypeForGenre("application-form")).toBe("Grant Application");
    expect(docTypeForGenre("project-proposal")).toBe("Project Proposal");
    expect(docTypeForGenre("pitch")).toBe("Funding Pitch");
    expect(docTypeForGenre("business-case")).toBe("Business Case");
    expect(docTypeForGenre("unknown")).toBe("Grant Application");
  });

  it("falls back to Grant Application for missing or unrecognised kinds", () => {
    expect(docTypeForGenre(null)).toBe("Grant Application");
    expect(docTypeForGenre(undefined)).toBe("Grant Application");
    expect(docTypeForGenre("something-else")).toBe("Grant Application");
  });
});

// ── answerTextFor (contract C5: edits win) ────────────────────────────────────

describe("answerTextFor", () => {
  it("returns the AI draft when no edit exists", () => {
    expect(answerTextFor(makeAnswer(1))).toBe(
      "We deliver cyber security services to UK SMEs.",
    );
  });

  it("prefers the reviewer's edited text when present", () => {
    const a = makeAnswer(1, { edited_draft: "Our edited answer." });
    expect(answerTextFor(a)).toBe("Our edited answer.");
  });

  it("ignores whitespace-only edits and falls back to the draft", () => {
    const a = makeAnswer(1, { edited_draft: "   " });
    expect(answerTextFor(a)).toBe(
      "We deliver cyber security services to UK SMEs.",
    );
  });

  it("returns empty string for missing answers or empty drafts", () => {
    expect(answerTextFor(undefined)).toBe("");
    expect(answerTextFor(null)).toBe("");
    expect(
      answerTextFor(
        makeAnswer(1, { response: makeResponse({ draft_answer: "  " }) }),
      ),
    ).toBe("");
  });
});

// ── Word count / over-limit ───────────────────────────────────────────────────

describe("wordCountOf / isOverWordLimit", () => {
  it("counts words across any whitespace", () => {
    expect(wordCountOf("one two  three\nfour\t five")).toBe(5);
    expect(wordCountOf("   ")).toBe(0);
    expect(wordCountOf("")).toBe(0);
  });

  it("flags over-limit only when a positive limit is exceeded", () => {
    expect(isOverWordLimit(101, 100)).toBe(true);
    expect(isOverWordLimit(100, 100)).toBe(false);
    expect(isOverWordLimit(50, 100)).toBe(false);
    expect(isOverWordLimit(50, null)).toBe(false);
    expect(isOverWordLimit(50, undefined)).toBe(false);
    expect(isOverWordLimit(50, 0)).toBe(false);
  });
});

// ── Completeness (selected vs answered) ───────────────────────────────────────

describe("questionCompleteness", () => {
  it("diffs selected questions against usable answers", () => {
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const answers = { "1": makeAnswer(1) };
    const c = questionCompleteness(questions, answers);
    expect(c.selected).toBe(3);
    expect(c.answered).toBe(1);
    expect(c.unanswered.map((q) => q.id)).toEqual([2, 3]);
  });

  it("treats an answer with empty text as unanswered", () => {
    const questions = [makeQuestion(1)];
    const answers = {
      "1": makeAnswer(1, { response: makeResponse({ draft_answer: "" }) }),
    };
    const c = questionCompleteness(questions, answers);
    expect(c.answered).toBe(0);
    expect(c.unanswered.map((q) => q.id)).toEqual([1]);
  });

  it("handles no questions", () => {
    const c = questionCompleteness([], {});
    expect(c.selected).toBe(0);
    expect(c.answered).toBe(0);
    expect(c.unanswered).toEqual([]);
  });
});

// ── Requested amount derivation ───────────────────────────────────────────────

describe("requestedAmountFromBudget", () => {
  const budget = (funding: GrantBudget["funding"]): GrantBudget => ({
    costs: [{ id: "c1", label: "Staff", amount: 50_000 }],
    funding,
  });

  it("uses funding rows labelled like the grant request", () => {
    const b = budget([
      { id: "f1", label: "Grant requested", amount: 40_000 },
      { id: "f2", label: "Our own contribution", amount: 10_000 },
    ]);
    expect(requestedAmountFromBudget(b)).toBe(40_000);
  });

  it("sums multiple grant-request rows", () => {
    const b = budget([
      { id: "f1", label: "Grant — year 1", amount: 20_000 },
      { id: "f2", label: "Grant — year 2", amount: 15_000 },
      { id: "f3", label: "Match funding", amount: 5_000 },
    ]);
    expect(requestedAmountFromBudget(b)).toBe(35_000);
  });

  it("treats a single funding row as the requested amount", () => {
    const b = budget([{ id: "f1", label: "Funding", amount: 25_000 }]);
    expect(requestedAmountFromBudget(b)).toBe(25_000);
  });

  it("returns null when ambiguous or empty", () => {
    expect(requestedAmountFromBudget(null)).toBeNull();
    expect(requestedAmountFromBudget(budget([]))).toBeNull();
    const ambiguous = budget([
      { id: "f1", label: "Source A", amount: 10_000 },
      { id: "f2", label: "Source B", amount: 10_000 },
    ]);
    expect(requestedAmountFromBudget(ambiguous)).toBeNull();
  });

  it("ignores zero and non-finite amounts", () => {
    const b = budget([
      { id: "f1", label: "Grant requested", amount: 0 },
      { id: "f2", label: "Source B", amount: NaN },
    ]);
    expect(requestedAmountFromBudget(b)).toBeNull();
  });
});

// ── Amount range formatting ───────────────────────────────────────────────────

describe("formatAmountRange", () => {
  it("formats min–max, single-ended, and equal ranges", () => {
    expect(formatAmountRange(10_000, 100_000)).toBe("£10,000 – £100,000");
    expect(formatAmountRange(null, 100_000)).toBe("Up to £100,000");
    expect(formatAmountRange(10_000, null)).toBe("From £10,000");
    expect(formatAmountRange(50_000, 50_000)).toBe("£50,000");
    expect(formatAmountRange(null, null)).toBeNull();
  });
});

// ── End-to-end: generator resolves to a non-empty Buffer in both modes ────────

describe("generateGrantApplicationDocx", () => {
  const grant = {
    title: "Cyber Security Innovation Grant",
    funder_name: "DSIT",
    deadline_at: "2026-09-30T23:59:00Z",
    amount_min: 10_000,
    amount_max: 100_000,
    source_notice_id: "GRANT-123",
    details: {
      output_genre: {
        kind: "project-proposal",
        confidence: "high",
        rationale: "The funder asks for a written proposal.",
      },
    },
  };

  const questions = [
    makeQuestion(1, { text: "Describe your project.", word_limit: 500 }),
    makeQuestion(2, {
      text: "What difference will the funding make?",
      section: "Impact",
    }),
  ];

  const answers = {
    "1": makeAnswer(1, {
      question_text: "Describe your project.",
      response: makeResponse({
        citations: [
          {
            source_title: "Company profile",
            chunk_id: "ch1",
            excerpt: "We are a UK SME delivering cyber security services.",
            relevance: "high",
          },
        ],
        missing_information: [
          {
            item: "Project start date",
            why_it_matters: "The funder asks for a delivery timeline.",
            suggested_owner: "commercial",
          },
        ],
        suggested_next_actions: ["Confirm the project start date."],
      }),
    }),
    // Question 2 deliberately unanswered — exercises the placeholder path.
  };

  const budget: GrantBudget = {
    costs: [{ id: "c1", label: "Staff", amount: 50_000 }],
    funding: [
      { id: "f1", label: "Grant requested", amount: 40_000 },
      { id: "f2", label: "Match funding", amount: 10_000 },
    ],
  };

  it("resolves to a non-empty Buffer in clean mode", async () => {
    const buf = await generateGrantApplicationDocx({
      grant,
      orgName: "Acme Bids Ltd",
      draft: { rfp_title: "Cyber Security Innovation Grant — Application" },
      questions,
      answers,
      budget,
      mode: "clean",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("resolves to a non-empty Buffer in review mode", async () => {
    const buf = await generateGrantApplicationDocx({
      grant,
      orgName: "Acme Bids Ltd",
      draft: { rfp_title: "Cyber Security Innovation Grant — Application" },
      questions,
      answers,
      budget,
      mode: "review",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("handles a grantless draft with no budget and no answers", async () => {
    const buf = await generateGrantApplicationDocx({
      grant: null,
      orgName: "Acme Bids Ltd",
      draft: { rfp_title: "Untitled application" },
      questions: [makeQuestion(1)],
      answers: {},
      budget: null,
      mode: "clean",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
