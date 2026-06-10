import { getServiceSupabase } from "@/lib/supabase-service";

export interface ResponseDraftSummary {
  id: string;
  rfp_title: string;
  status: string;
  stage: string;
  submitted_at: string | null;
  question_count: number;
  answered_count: number;
  opportunity_id: string | null;
  grant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseDraft extends ResponseDraftSummary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_questions: any[];
  selected_question_ids: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: Record<string, any>;
  latest_rfp_run_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  budget: any | null;
}

export interface DraftInput {
  rfp_title?: string;
  opportunity_id?: string | null;
  grant_id?: string | null;
  status?: string;
  stage?: string;
  submitted_at?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_questions?: any[];
  selected_question_ids?: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers?: Record<string, any>;
  latest_rfp_run_id?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  budget?: any | null;
}

const SUMMARY_COLS =
  "id, rfp_title, status, stage, submitted_at, question_count, answered_count, opportunity_id, grant_id, created_at, updated_at";
const FULL_COLS = `${SUMMARY_COLS}, extracted_questions, selected_question_ids, answers, latest_rfp_run_id, budget`;

function counts(input: DraftInput): {
  question_count?: number;
  answered_count?: number;
} {
  const out: { question_count?: number; answered_count?: number } = {};
  if (input.extracted_questions)
    out.question_count = input.extracted_questions.length;
  if (input.answers) out.answered_count = Object.keys(input.answers).length;
  return out;
}

export async function listResponseDrafts(
  orgId: string,
): Promise<ResponseDraftSummary[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("response_drafts")
    .select(SUMMARY_COLS)
    .eq("org_id", orgId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to list drafts: ${error.message}`);
  return (data ?? []) as ResponseDraftSummary[];
}

export async function getResponseDraft(
  id: string,
  orgId: string,
): Promise<ResponseDraft | null> {
  // DB failure throws (caller → 500); null data means the draft genuinely
  // doesn't exist for this org (caller → 404).
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("response_drafts")
    .select(FULL_COLS)
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load draft: ${error.message}`);
  return (data as ResponseDraft) ?? null;
}

export async function createResponseDraft(
  orgId: string,
  input: DraftInput,
): Promise<ResponseDraft> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("response_drafts")
    .insert({
      org_id: orgId,
      rfp_title: input.rfp_title?.trim() || "Untitled response",
      opportunity_id: input.opportunity_id ?? null,
      grant_id: input.grant_id ?? null,
      status: input.status ?? "draft",
      extracted_questions: input.extracted_questions ?? [],
      selected_question_ids: input.selected_question_ids ?? [],
      answers: input.answers ?? {},
      latest_rfp_run_id: input.latest_rfp_run_id ?? null,
      ...counts(input),
    })
    .select(FULL_COLS)
    .single();
  if (error) throw new Error(`Failed to create draft: ${error.message}`);
  return data as ResponseDraft;
}

export async function patchResponseDraft(
  id: string,
  orgId: string,
  patch: DraftInput,
): Promise<ResponseDraft | null> {
  const supabase = getServiceSupabase();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...counts(patch),
  };
  for (const k of [
    "rfp_title",
    "opportunity_id",
    "grant_id",
    "status",
    "stage",
    "submitted_at",
    "extracted_questions",
    "selected_question_ids",
    "answers",
    "latest_rfp_run_id",
    "budget",
  ] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  // Stamp submitted_at the first time an application is marked submitted.
  if (patch.stage === "submitted" && patch.submitted_at === undefined) {
    update.submitted_at = new Date().toISOString();
  }

  // DB failure throws (caller → 500); null data means the draft genuinely
  // doesn't exist for this org (caller → 404).
  const { data, error } = await supabase
    .from("response_drafts")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select(FULL_COLS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update draft: ${error.message}`);
  return (data as ResponseDraft) ?? null;
}

export async function deleteResponseDraft(
  id: string,
  orgId: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("response_drafts")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(`Failed to delete draft: ${error.message}`);
}
