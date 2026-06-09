import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";
import { ReviewCard } from "@/components/ReviewCard";
import Link from "next/link";
import type { RFPResponse } from "@/lib/schema";

type ReviewRequest = {
  id: string;
  topic: string;
  risk_level: string;
  confidence_score: number | null;
  assigned_to: string;
  status: string;
  due_at: string | null;
  updated_at: string | null;
  queries: {
    query_text: string;
    rfp_context: Record<string, unknown> | null;
    query_results: Array<{ answer: RFPResponse }> | null;
  } | null;
};

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("review_requests")
    .select(
      `
      id, topic, risk_level, confidence_score, assigned_to, status, due_at, updated_at,
      queries(query_text, rfp_context, query_results(answer))
    `,
    )
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Review Queue
          </div>
          <h1>
            Review <em>answer</em>
          </h1>
        </div>
        <div className="actions">
          <Link href="/review" className="btn ghost sm">
            ← Back to queue
          </Link>
        </div>
      </div>
      <ReviewCard review={data as unknown as ReviewRequest} />
    </div>
  );
}
