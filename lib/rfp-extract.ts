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
      word_limit: z
        .number()
        .nullable()
        .describe("stated word/page limit as an integer, else null"),
      mandatory: z
        .boolean()
        .describe(
          "true only if the tender marks this as mandatory / pass-fail / minimum / essential / 'must'",
        ),
      priority: z
        .enum(["high", "medium", "low"])
        .describe(
          "how much this item matters to winning the bid: high = mandatory/pass-fail or heavily weighted / core scored criteria; medium = standard scored question; low = minor, administrative, or guidance",
        ),
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
  word_limit: number | null;
  mandatory: boolean;
  priority: "high" | "medium" | "low";
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
- word_limit: if the item states a maximum word or page count (e.g. "maximum 500 words", "no more than 2 pages"), return it as an integer; otherwise null
- mandatory: true ONLY when the tender frames this as mandatory — i.e. a pass/fail gate, minimum/essential requirement, exclusion criterion, or uses "must"/"shall"/"required". Use false for desirable, optional, "should", or items that are only weighted/scored. Guidance items are never mandatory.
- priority: how much this item matters to winning the bid. "high" = mandatory/pass-fail items or heavily weighted / core scored criteria; "medium" = standard scored questions; "low" = minor, administrative, or guidance items. Mandatory items are always "high"; guidance is always "low".

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
  // and never mandatory.
  return parsed.questions.map((q) => {
    const mandatory = q.question_class === "guidance" ? false : q.mandatory;
    // Keep priority coherent with the other signals: mandatory ⇒ high,
    // guidance ⇒ low, otherwise trust the model.
    const priority: "high" | "medium" | "low" = mandatory
      ? "high"
      : q.question_class === "guidance"
        ? "low"
        : q.priority;
    return {
      ...q,
      risk_level:
        q.question_class === "guidance"
          ? "low"
          : HIGH_RISK_TOPICS.has(q.topic)
            ? "high"
            : q.risk_level,
      mandatory,
      priority,
    };
  });
}
