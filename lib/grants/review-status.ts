import { getServiceSupabase } from "@/lib/supabase-service";

// Review status for an application, derived from the existing review_requests that the
// answer pipeline routes high-risk answers into (keyed by the draft's rfp_run_id).

export interface RunReviewStatus {
  total: number;
  pending: number;
  resolved: number;
}

export async function getRunReviewStatuses(
  runIds: Array<string | null>,
): Promise<Map<string, RunReviewStatus>> {
  const ids = [...new Set(runIds.filter((r): r is string => !!r))];
  const out = new Map<string, RunReviewStatus>();
  if (ids.length === 0) return out;

  const { data } = await getServiceSupabase()
    .from("review_requests")
    .select("rfp_run_id, status")
    .in("rfp_run_id", ids);

  for (const r of data ?? []) {
    const key = r.rfp_run_id as string;
    if (!key) continue;
    const s = out.get(key) ?? { total: 0, pending: 0, resolved: 0 };
    s.total++;
    if (r.status === "pending") s.pending++;
    else s.resolved++;
    out.set(key, s);
  }
  return out;
}

export async function getRunReviewStatus(
  runId: string | null,
): Promise<RunReviewStatus> {
  if (!runId) return { total: 0, pending: 0, resolved: 0 };
  return (
    (await getRunReviewStatuses([runId])).get(runId) ?? {
      total: 0,
      pending: 0,
      resolved: 0,
    }
  );
}
