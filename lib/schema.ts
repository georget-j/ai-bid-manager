import * as z from "zod";

// ── Database row types ──────────────────────────────────────────────────────

export type Document = {
  id: string;
  title: string;
  source_type: "upload" | "sample";
  file_name: string | null;
  mime_type: string | null;
  raw_text: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type Query = {
  id: string;
  query_text: string;
  rfp_context: RFPContext | null;
  created_at: string;
};

export type QueryResult = {
  id: string;
  query_id: string;
  answer: RFPResponse;
  retrieved_chunk_ids: string[];
  created_at: string;
};

// ── RFP context fields (from the Ask form) ──────────────────────────────────

export const RFPContextSchema = z.object({
  industry: z
    .enum([
      "fintech",
      "legaltech",
      "enterprise-saas",
      "healthcare",
      "industrial",
      "other",
    ])
    .optional(),
  response_type: z
    .enum([
      "executive-summary",
      "technical-answer",
      "implementation-approach",
      "security-compliance",
      "case-study",
      "full-rfp-draft",
      "grant-application",
    ])
    .optional(),
  tone: z
    .enum(["concise", "formal", "founder-led", "technical", "commercial"])
    .optional(),
  customer_maturity: z.enum(["startup", "mid-market", "enterprise"]).optional(),
});

export type RFPContext = z.infer<typeof RFPContextSchema>;

// ── Batch answering question (answer-batch route) ────────────────────────────
// word_limit / mandatory / priority are OPTIONAL extras — older clients that
// send only id/section/text keep working unchanged.

export const AnswerBatchQuestionSchema = z.object({
  id: z.number(),
  section: z.string(),
  text: z.string(),
  topic: z.string().optional(),
  risk_level: z.string().optional(),
  word_limit: z.number().nullable().optional(),
  mandatory: z.boolean().optional(),
  priority: z.string().optional(),
});

export type AnswerBatchQuestion = z.infer<typeof AnswerBatchQuestionSchema>;

// ── Structured LLM response schema ─────────────────────────────────────────

const SupportingEvidenceSchema = z.object({
  claim: z.string(),
  source_chunk_ids: z.array(z.string()),
  strength: z.enum(["strong", "medium", "weak"]),
});

const CitationSchema = z.object({
  source_title: z.string(),
  chunk_id: z.string(),
  excerpt: z.string(),
  relevance: z.string(),
});

const MissingInfoSchema = z.object({
  item: z.string(),
  why_it_matters: z.string(),
  suggested_owner: z.enum([
    "product",
    "engineering",
    "commercial",
    "legal",
    "customer",
    "unknown",
  ]),
});

const ConfidenceSchema = z.object({
  level: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});

export const RFPResponseSchema = z.object({
  draft_answer: z.string(),
  executive_summary: z.string(),
  supporting_evidence: z.array(SupportingEvidenceSchema),
  citations: z.array(CitationSchema),
  missing_information: z.array(MissingInfoSchema),
  confidence: ConfidenceSchema,
  suggested_next_actions: z.array(z.string()),
});

export type RFPResponse = z.infer<typeof RFPResponseSchema>;
export type SupportingEvidence = z.infer<typeof SupportingEvidenceSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type MissingInfo = z.infer<typeof MissingInfoSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ── Retrieval result ────────────────────────────────────────────────────────

// Partial schema used during streaming — all fields optional
export type PartialRFPResponse = {
  draft_answer?: string;
  executive_summary?: string;
  supporting_evidence?: Array<Partial<SupportingEvidence>>;
  citations?: Array<Partial<Citation>>;
  missing_information?: Array<Partial<MissingInfo>>;
  confidence?: Partial<Confidence>;
  suggested_next_actions?: string[];
};

export type RetrievedChunk = {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
};

// ── API request/response types ──────────────────────────────────────────────

export const AskRequestSchema = z.object({
  query: z.string().min(1, "Question is required").max(2000),
  rfp_context: RFPContextSchema.optional(),
});

export type AskRequest = z.infer<typeof AskRequestSchema>;

export type AskResponse = {
  query_id: string;
  response: RFPResponse;
  retrieved_chunks: RetrievedChunk[];
  unverified_citations_removed?: number;
};

export type QueryHistoryItem = {
  id: string;
  query_text: string;
  rfp_context: RFPContext | null;
  created_at: string;
  confidence_level: "high" | "medium" | "low" | null;
  executive_summary: string | null;
};

export const RerankResponseSchema = z.object({
  top_chunk_ids: z.array(z.string()),
});
export type RerankResponse = z.infer<typeof RerankResponseSchema>;

export type IngestResult = {
  document_id: string;
  chunk_count: number;
  title: string;
};

export type SeedResult = {
  seeded: string[];
  skipped: string[];
};
