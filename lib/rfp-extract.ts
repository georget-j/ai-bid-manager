import * as z from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, CHAT_MODEL } from "./openai";

export const RFP_TOPICS = [
  "security_compliance",
  "legal",
  "pricing",
  "technical",
  "engineering",
  "commercial",
  "implementation",
  "support",
  "general",
] as const;

export type RFPTopic = (typeof RFP_TOPICS)[number];

// Topics that are always treated as high-risk regardless of question content
const HIGH_RISK_TOPICS = new Set<RFPTopic>([
  "security_compliance",
  "legal",
  "pricing",
]);

const ExtractedQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.number(),
      section: z.string(),
      text: z.string(),
      topic: z.enum(RFP_TOPICS),
      risk_level: z.enum(["high", "medium", "low"]),
      question_class: z.enum(["question", "requirement", "guidance"]),
    }),
  ),
});

export type ExtractedQuestion = {
  id: number;
  section: string;
  text: string;
  topic: RFPTopic;
  risk_level: "high" | "medium" | "low";
  question_class: "question" | "requirement" | "guidance";
};

const FORMAT = zodResponseFormat(ExtractedQuestionsSchema, "rfp_questions");

export async function extractRFPQuestions(
  documentText: string,
): Promise<ExtractedQuestion[]> {
  const safeText = documentText
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ");

  const completion = await openai.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an RFP document analyzer. Extract all questions, requirements, and evaluation criteria that a vendor must respond to.

For each item provide:
- id: sequential integer starting at 1
- section: the section or category it belongs to (e.g. "Technical Requirements", "Security & Compliance")
- text: the complete, self-contained question or requirement
- topic: classify into one of: security_compliance, legal, pricing, technical, engineering, commercial, implementation, support, general
  (use engineering for software build, API, integration, and architecture requirements)
- risk_level: high (involves legal, contractual, financial, or security commitments), medium (operational or product claims), low (factual or general)
- question_class: classify as one of:
    "question"     — open-ended, requires a prose answer (e.g. "Describe your approach to…", "Provide evidence of…", "How would you…")
    "requirement"  — specific factual confirmation or value (e.g. "Confirm you hold ISO 27001", "State your day rate", "Do you have capacity for X?")
    "guidance"     — informational context, no answer needed (e.g. "Note: all responses must be under 500 words", "Use the provided templates", section instructions)

Include guidance items so buyers' instructions are visible alongside the questions they relate to.
Skip pure preamble, cover pages, and table-of-contents entries.`,
      },
      {
        role: "user",
        content: `Extract all vendor requirements from this RFP:\n\n${safeText.slice(0, 30000)}`,
      },
    ],
    response_format: FORMAT,
    temperature: 0,
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to extract questions from document");

  // Enforce high risk for sensitive topics; guidance items are always low risk
  return parsed.questions.map((q) => ({
    ...q,
    risk_level:
      q.question_class === "guidance"
        ? "low"
        : HIGH_RISK_TOPICS.has(q.topic)
          ? "high"
          : q.risk_level,
  }));
}
