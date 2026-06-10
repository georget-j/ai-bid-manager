import { NextResponse } from "next/server";
import * as z from "zod";
import { getRoutingConfig, createReviewRequest } from "@/lib/routing";
import { dispatchReviewNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        queryId: z.string(),
        topic: z.string(),
        riskLevel: z.string(),
        score: z.number(),
      }),
    )
    .min(1),
  rfp_run_id: z.string().optional(),
  rfp_title: z.string().optional(),
});

export async function POST(req: Request) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let items: z.infer<typeof BodySchema>["items"];
  let rfpRunId: string | undefined;
  let rfpTitle: string;

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    items = parsed.data.items;
    rfpRunId = parsed.data.rfp_run_id;
    rfpTitle = parsed.data.rfp_title ?? "RFP";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  let routed = 0;

  // Only route queries that belong to the caller's org — cross-org ids are skipped.
  const { data: ownedQueries } = await supabase
    .from("queries")
    .select("id")
    .in(
      "id",
      items.map((i) => i.queryId),
    )
    .eq("org_id", orgId);
  const ownedQueryIds = new Set((ownedQueries ?? []).map((q) => q.id));

  for (const item of items) {
    if (!ownedQueryIds.has(item.queryId)) continue;

    const routingConfig = await getRoutingConfig(item.topic);
    if (!routingConfig?.owner_email) continue;

    const reviewRequest = await createReviewRequest({
      queryId: item.queryId,
      rfpRunId,
      topic: item.topic,
      riskLevel: item.riskLevel,
      confidenceScore: item.score,
      assignedTo: routingConfig.owner_email,
      escalationHours: routingConfig.escalation_hours,
    });
    if (!reviewRequest) continue;

    routed++;

    const { data: queryData } = await supabase
      .from("queries")
      .select("query_text, rfp_context, query_results(answer)")
      .eq("id", item.queryId)
      .eq("org_id", orgId)
      .single();

    if (queryData) {
      const answer = (
        queryData.query_results as Array<{ answer: Record<string, unknown> }>
      )?.[0]?.answer;
      dispatchReviewNotification({
        reviewRequest,
        routingConfig,
        questionText: queryData.query_text,
        executiveSummary: (answer?.executive_summary as string) ?? "",
        rfpTitle,
      })
        .then(async () => {
          await supabase
            .from("review_requests")
            .update({
              notified_at: new Date().toISOString(),
              status: "assigned",
            })
            .eq("id", reviewRequest.id);
        })
        .catch((err) =>
          console.error("[confirm-routing] dispatch error:", err),
        );
    }
  }

  return NextResponse.json({ success: true, routed });
}
