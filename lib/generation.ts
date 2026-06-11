import { zodResponseFormat } from "openai/helpers/zod";
import { openai, CHAT_MODEL } from "./openai";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import {
  RFPResponseSchema,
  type RFPResponse,
  type RetrievedChunk,
  type RFPContext,
} from "./schema";

const RESPONSE_FORMAT = zodResponseFormat(RFPResponseSchema, "rfp_response");

export async function generateRFPResponse(
  query: string,
  chunks: RetrievedChunk[],
  rfpContext?: RFPContext,
): Promise<RFPResponse> {
  const systemPrompt = buildSystemPrompt(rfpContext);
  const userPrompt = buildUserPrompt(query, chunks, rfpContext);

  const completion = await openai.chat.completions.parse({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: RESPONSE_FORMAT,
    temperature: 0.2,
  });

  const message = completion.choices[0]?.message;
  if (!message) throw new Error("No response from LLM");

  if (message.refusal) {
    throw new Error(`LLM refused to answer: ${message.refusal}`);
  }

  if (!message.parsed) {
    // Fall back to parsing the raw content
    const raw = message.content;
    if (!raw) throw new Error("Empty response from LLM");
    return RFPResponseSchema.parse(JSON.parse(raw));
  }

  return message.parsed;
}
