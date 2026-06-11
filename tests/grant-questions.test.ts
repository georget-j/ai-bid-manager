/**
 * Grant question-seeding unit tests — the pure document-text assembly + merge/fallback
 * logic that decides which questions seed a new application, and the output-genre
 * classifier's safe default when the model call fails. OpenAI is mocked (hoisted so
 * the vi.mock factory can read it); no network or DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import type { GrantRow, OutputGenre } from "@/lib/grants/types";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { parse: mocks.parse } } },
  CHAT_MODEL: "test-model",
}));

import {
  buildDocumentQuestionText,
  mergeExtractedQuestions,
  QUESTION_TEXT_BUDGET,
  type QuestionSourceText,
} from "@/lib/grants/application";
import {
  classifyOutputGenre,
  ensureOutputGenre,
  UNKNOWN_OUTPUT_GENRE,
} from "@/lib/grants/genre";

const DAY = 86_400_000;
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
    deadline_at: null,
    status: "open",
    themes: ["cyber security"],
    sectors: [],
    regions: ["England"],
    eligibility_text: null,
    eligible_org_types: [],
    match_funding_required: false,
    beneficiaries: [],
    documents: [],
    raw_json: null,
    published_at: null,
    details: null,
    enriched_at: null,
    created_at: past(10),
    updated_at: past(1),
    ...overrides,
  };
}

function makeQuestion(
  id: number,
  overrides: Partial<ExtractedQuestion> = {},
): ExtractedQuestion {
  return {
    id,
    section: "About your project",
    text: `Question ${id}`,
    topic: "general",
    risk_level: "low",
    question_class: "question",
    word_limit: null,
    mandatory: false,
    priority: "medium",
    ...overrides,
  };
}

function source(
  title: string,
  kind: "document" | "link",
  text: string,
): QuestionSourceText {
  return { title, kind, text };
}

beforeEach(() => {
  mocks.parse.mockReset();
});

describe("buildDocumentQuestionText", () => {
  it("puts real funder documents before web pages, longest first within each kind", () => {
    const out = buildDocumentQuestionText([
      source("Guidance page", "link", "L".repeat(900)),
      source("Short form", "document", "S".repeat(600)),
      source("Application form", "document", "D".repeat(800)),
    ]);
    const order = [
      out.indexOf("## Application form"),
      out.indexOf("## Short form"),
      out.indexOf("## Guidance page"),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("stays within the extraction budget and skips stub fragments", () => {
    const out = buildDocumentQuestionText([
      source("Big form", "document", "A".repeat(QUESTION_TEXT_BUDGET * 2)),
      source("Second doc", "document", "B".repeat(5000)),
    ]);
    expect(out.length).toBeLessThanOrEqual(QUESTION_TEXT_BUDGET);
    // The first document exhausts the budget; the second must not appear as a stub.
    expect(out).not.toContain("## Second doc");
  });

  it("skips empty sources and returns an empty string when nothing has text", () => {
    expect(buildDocumentQuestionText([])).toBe("");
    expect(
      buildDocumentQuestionText([source("Blank", "document", "   ")]),
    ).toBe("");
  });

  it("heads each piece with its title so the extractor sees section names", () => {
    const out = buildDocumentQuestionText([
      source("Application form", "document", "Q1. Describe your project."),
    ]);
    expect(out).toContain("## Application form");
    expect(out).toContain("Q1. Describe your project.");
  });
});

describe("mergeExtractedQuestions", () => {
  it("document-derived questions win outright over listing-derived ones", () => {
    const doc = [makeQuestion(1), makeQuestion(2)];
    const web = [makeQuestion(1, { text: "Paraphrased" })];
    const merged = mergeExtractedQuestions(doc, web);
    expect(merged).toHaveLength(2);
    expect(merged.every((q) => q.source === "funder-document")).toBe(true);
    expect(merged.map((q) => q.text)).not.toContain("Paraphrased");
  });

  it("falls back to listing questions only when the documents produced none", () => {
    const web = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const merged = mergeExtractedQuestions([], web);
    expect(merged).toHaveLength(3);
    expect(merged.every((q) => q.source === "grant-listing")).toBe(true);
  });

  it("returns an empty set when both sources are empty", () => {
    expect(mergeExtractedQuestions([], [])).toEqual([]);
  });

  it("preserves the question fields the workspace relies on", () => {
    const [q] = mergeExtractedQuestions(
      [makeQuestion(7, { mandatory: true, word_limit: 500, priority: "high" })],
      [],
    );
    expect(q.id).toBe(7);
    expect(q.mandatory).toBe(true);
    expect(q.word_limit).toBe(500);
    expect(q.priority).toBe("high");
  });
});

describe("classifyOutputGenre", () => {
  it("defaults to unknown/low on an API failure without throwing", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("model unavailable"));
    const genre = await classifyOutputGenre(makeGrant(), "some doc text");
    expect(genre).toEqual(UNKNOWN_OUTPUT_GENRE);
    expect(genre.kind).toBe("unknown");
    expect(genre.confidence).toBe("low");
  });

  it("defaults to unknown/low when the model returns nothing parseable", async () => {
    mocks.parse.mockResolvedValueOnce({
      choices: [{ message: { parsed: null } }],
    });
    const genre = await classifyOutputGenre(makeGrant());
    expect(genre).toEqual(UNKNOWN_OUTPUT_GENRE);
  });

  it("returns the model's classification on success", async () => {
    mocks.parse.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: {
              kind: "application-form",
              confidence: "high",
              rationale: "The text says applicants complete an online form.",
            },
          },
        },
      ],
    });
    const genre = await classifyOutputGenre(makeGrant(), "Complete the form.");
    expect(genre.kind).toBe("application-form");
    expect(genre.confidence).toBe("high");
  });
});

describe("ensureOutputGenre", () => {
  it("returns the cached genre without calling the model again", async () => {
    const cached: OutputGenre = {
      kind: "project-proposal",
      confidence: "medium",
      rationale: "Applicants submit a written proposal.",
    };
    const grant = makeGrant({
      details: {
        sections: [],
        links: [],
        documents: [],
        webpageUrl: null,
        output_genre: cached,
      },
    });
    const genre = await ensureOutputGenre(grant);
    expect(genre).toEqual(cached);
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("returns the unknown default without caching when classification fails", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("model unavailable"));
    const genre = await ensureOutputGenre(makeGrant());
    expect(genre).toEqual(UNKNOWN_OUTPUT_GENRE);
  });
});
