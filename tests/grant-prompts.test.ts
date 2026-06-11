/**
 * Grant-aware generation tests.
 *
 * Covers (a) system/user prompt selection — grant drafts are written in the
 * applicant's voice for the funder, tenders keep the existing proposal
 * persona — (b) word-limit injection into the question text passed to
 * generation, and (c) the answer-batch question schema tolerating the
 * optional word_limit / mandatory / priority extras (contract C2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  isGrantContext,
  withWordLimit,
} from "../lib/prompts";
import { AnswerBatchQuestionSchema } from "../lib/schema";
import type { RetrievedChunk, RFPContext, RFPResponse } from "../lib/schema";

const GRANT_CONTEXT: RFPContext = { response_type: "grant-application" };

const mockChunks: RetrievedChunk[] = [
  {
    id: "chunk-1",
    document_id: "doc-1",
    document_title: "Charity Impact Report",
    content: "Delivered digital skills training to 1,200 residents in 2025.",
    similarity: 0.9,
    metadata: null,
  },
];

describe("isGrantContext", () => {
  it("is true only for the grant-application response type", () => {
    expect(isGrantContext(GRANT_CONTEXT)).toBe(true);
    expect(isGrantContext({ response_type: "technical-answer" })).toBe(false);
    expect(isGrantContext({})).toBe(false);
    expect(isGrantContext(undefined)).toBe(false);
  });
});

describe("buildSystemPrompt — prompt selection", () => {
  it("defaults to the tender/proposal persona", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("proposal");
    expect(prompt).toContain("RFP responses");
    expect(prompt.toLowerCase()).not.toContain("funder");
  });

  it("keeps the tender persona for non-grant contexts", () => {
    const prompt = buildSystemPrompt({ response_type: "technical-answer" });
    expect(prompt).toBe(buildSystemPrompt());
  });

  it("selects the grant-applicant persona for grant context", () => {
    const prompt = buildSystemPrompt(GRANT_CONTEXT);
    expect(prompt.toLowerCase()).toContain("grant application");
    expect(prompt.toLowerCase()).toContain("funder");
    expect(prompt.toLowerCase()).toContain("funding");
    expect(prompt).not.toContain("RFP responses");
  });

  it("grant persona writes as the applicant, not a vendor", () => {
    const prompt = buildSystemPrompt(GRANT_CONTEXT);
    expect(prompt).toContain("first person plural");
    expect(prompt.toLowerCase()).toMatch(/avoid sales|not a vendor pitch/);
    expect(prompt).not.toContain("sending to a customer");
  });

  it("grant persona keeps the evidence-grounding rules", () => {
    const prompt = buildSystemPrompt(GRANT_CONTEXT);
    expect(prompt.toLowerCase()).toMatch(/not invent|must not invent/);
    expect(prompt).toContain("chunk_id");
    expect(prompt).toContain("missing_information");
    expect(prompt.toLowerCase()).toMatch(/json|structured/);
  });

  it("both personas instruct the model to respect stated word limits", () => {
    for (const prompt of [
      buildSystemPrompt(),
      buildSystemPrompt(GRANT_CONTEXT),
    ]) {
      expect(prompt.toLowerCase()).toContain("word limit");
    }
  });
});

describe("withWordLimit — word-limit injection", () => {
  it("appends the limit to the question text", () => {
    expect(withWordLimit("Describe your project", 500)).toBe(
      "Describe your project (Limit: 500 words)",
    );
  });

  it("returns the text unchanged when no limit is given", () => {
    expect(withWordLimit("Describe your project")).toBe(
      "Describe your project",
    );
    expect(withWordLimit("Describe your project", null)).toBe(
      "Describe your project",
    );
  });

  it("ignores unusable limits", () => {
    expect(withWordLimit("Q", 0)).toBe("Q");
    expect(withWordLimit("Q", -250)).toBe("Q");
    expect(withWordLimit("Q", Number.NaN)).toBe("Q");
  });

  it("rounds fractional limits to whole words", () => {
    expect(withWordLimit("Q", 499.6)).toBe("Q (Limit: 500 words)");
  });
});

describe("buildUserPrompt — grant awareness", () => {
  it("asks for a grant application answer in the applicant's voice", () => {
    const prompt = buildUserPrompt(
      "Why should we fund you?",
      mockChunks,
      GRANT_CONTEXT,
    );
    expect(prompt).toContain("grant application answer");
    expect(prompt).toContain("addressing the funder");
    expect(prompt).not.toContain("Generate a structured RFP response");
    expect(prompt).toContain("Application Context:");
  });

  it("keeps the existing tender wording without grant context", () => {
    const prompt = buildUserPrompt("Q", mockChunks, {
      response_type: "technical-answer",
    });
    expect(prompt).toContain("Generate a structured RFP response");
    expect(prompt).toContain("RFP Context:");
    expect(prompt).not.toContain("grant application answer");
  });

  it("still grounds the answer in the provided chunks", () => {
    const prompt = buildUserPrompt("Q", mockChunks, GRANT_CONTEXT);
    expect(prompt).toContain("chunk-1");
    expect(prompt).toContain("Charity Impact Report");
    expect(prompt.toLowerCase()).toMatch(/only from|do not invent/);
  });
});

describe("AnswerBatchQuestionSchema — optional extras (contract C2)", () => {
  const minimal = { id: 1, section: "About your project", text: "Describe it" };

  it("accepts a minimal question without the extras", () => {
    const parsed = AnswerBatchQuestionSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
  });

  it("accepts and preserves word_limit, mandatory, and priority", () => {
    const parsed = AnswerBatchQuestionSchema.safeParse({
      ...minimal,
      topic: "general",
      risk_level: "low",
      word_limit: 500,
      mandatory: true,
      priority: "high",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.word_limit).toBe(500);
      expect(parsed.data.mandatory).toBe(true);
      expect(parsed.data.priority).toBe("high");
    }
  });

  it("accepts an explicit null word_limit", () => {
    const parsed = AnswerBatchQuestionSchema.safeParse({
      ...minimal,
      word_limit: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects wrongly-typed extras", () => {
    expect(
      AnswerBatchQuestionSchema.safeParse({ ...minimal, word_limit: "500" })
        .success,
    ).toBe(false);
    expect(
      AnswerBatchQuestionSchema.safeParse({ ...minimal, mandatory: "yes" })
        .success,
    ).toBe(false);
  });
});

// ── generateRFPResponse wires the context through to the LLM call ───────────

const llmMocks = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { parse: llmMocks.parse } } },
  CHAT_MODEL: "test-model",
}));

const stubResponse: RFPResponse = {
  draft_answer: "We will deliver the project as planned.",
  executive_summary: "Summary.",
  supporting_evidence: [],
  citations: [],
  missing_information: [],
  confidence: { level: "medium", reason: "Limited evidence." },
  suggested_next_actions: [],
};

describe("generateRFPResponse — prompt selection end to end", () => {
  beforeEach(() => {
    llmMocks.parse.mockReset();
    llmMocks.parse.mockResolvedValue({
      choices: [{ message: { parsed: stubResponse, refusal: null } }],
    });
  });

  async function sentMessages() {
    const [args] = llmMocks.parse.mock.calls.at(-1) ?? [];
    return (args as { messages: { role: string; content: string }[] }).messages;
  }

  it("uses the grant persona when grant context is passed", async () => {
    const { generateRFPResponse } = await import("../lib/generation");
    await generateRFPResponse(
      "Describe your project (Limit: 500 words)",
      mockChunks,
      GRANT_CONTEXT,
    );
    const messages = await sentMessages();
    const system = messages.find((m) => m.role === "system");
    const user = messages.find((m) => m.role === "user");
    expect(system?.content.toLowerCase()).toContain("funder");
    expect(user?.content).toContain("(Limit: 500 words)");
  });

  it("keeps the tender persona without grant context", async () => {
    const { generateRFPResponse } = await import("../lib/generation");
    await generateRFPResponse("Confirm ISO 27001", mockChunks);
    const messages = await sentMessages();
    const system = messages.find((m) => m.role === "system");
    expect(system?.content).toContain("RFP responses");
    expect(system?.content.toLowerCase()).not.toContain("funder");
  });
});
