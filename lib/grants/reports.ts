import { getServiceSupabase } from "@/lib/supabase-service";

export interface GrantReport {
  id: string;
  org_id: string;
  draft_id: string;
  grant_id: string | null;
  title: string;
  due_at: string | null;
  status: string; // not-started | in-progress | submitted
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COLS =
  "id, org_id, draft_id, grant_id, title, due_at, status, notes, created_at, updated_at";

/** Reports for one application (draft), org-scoped, soonest-due first. */
export async function listReportsForDraft(
  orgId: string,
  draftId: string,
): Promise<GrantReport[]> {
  const { data } = await getServiceSupabase()
    .from("grant_reports")
    .select(COLS)
    .eq("org_id", orgId)
    .eq("draft_id", draftId)
    .order("due_at", { ascending: true, nullsFirst: false });
  return (data ?? []) as GrantReport[];
}

export async function createReport(
  orgId: string,
  input: {
    draft_id: string;
    grant_id?: string | null;
    title: string;
    due_at?: string | null;
  },
): Promise<GrantReport | null> {
  const { data } = await getServiceSupabase()
    .from("grant_reports")
    .insert({
      org_id: orgId,
      draft_id: input.draft_id,
      grant_id: input.grant_id ?? null,
      title: input.title.trim().slice(0, 200),
      due_at: input.due_at ?? null,
    })
    .select(COLS)
    .single();
  return (data as GrantReport) ?? null;
}

export async function updateReport(
  orgId: string,
  id: string,
  patch: {
    status?: string;
    due_at?: string | null;
    title?: string;
    notes?: string | null;
  },
): Promise<GrantReport | null> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const k of ["status", "due_at", "title", "notes"] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  const { data } = await getServiceSupabase()
    .from("grant_reports")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select(COLS)
    .maybeSingle();
  return (data as GrantReport) ?? null;
}

export async function deleteReport(orgId: string, id: string): Promise<void> {
  await getServiceSupabase()
    .from("grant_reports")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
}
