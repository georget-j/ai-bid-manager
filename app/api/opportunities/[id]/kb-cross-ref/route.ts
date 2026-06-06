export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getOpportunity } from "@/lib/procurement/data";
import { collectOpportunityDocUrls } from "@/lib/tender-docs";
import { retrieveChunks } from "@/lib/retrieval";

interface Params {
  params: Promise<{ id: string }>;
}

// GET — cross-reference an opportunity with the org's knowledge base, both directions:
//   inKb     — documents already ingested for THIS opportunity
//   related  — the org's wider KB content most relevant to this tender (opp → KB)
//   tenderDocs — the tender's source documents (for "add to KB")
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const opp = await getOpportunity(opportunityId);
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getServiceSupabase();

  // Documents already in this org's KB for this opportunity.
  const [{ data: inKbRows }, { data: pipelineRow }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title")
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId),
    supabase
      .from("bid_pipeline")
      .select("client_id")
      .eq("opportunity_id", opportunityId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const inKb = inKbRows ?? [];
  const inKbIds = new Set(inKb.map((d) => d.id));
  const clientId = pipelineRow?.client_id ?? null;

  // Related KB content (opp → KB). Skip chunks from this opportunity's own ingested
  // tender docs so "related" surfaces the org's capability/evidence, not the tender.
  const query = `${opp.title}\n${(opp.description ?? "").slice(0, 600)}`;
  let related: Array<{
    document_id: string;
    document_title: string;
    excerpt: string;
  }> = [];
  try {
    const chunks = await retrieveChunks(query, orgId, clientId);
    const seen = new Set<string>();
    related = chunks
      .filter((c) => !inKbIds.has(c.document_id) && !seen.has(c.document_id))
      .map((c) => {
        seen.add(c.document_id);
        return {
          document_id: c.document_id,
          document_title: c.document_title ?? "Document",
          excerpt: c.content.slice(0, 220).trim(),
        };
      })
      .slice(0, 4);
  } catch {
    related = [];
  }

  const tenderDocs = collectOpportunityDocUrls(opp)
    .filter((d) => d.url)
    .map((d) => ({ url: d.url as string, title: d.title ?? null }))
    .slice(0, 12);

  return NextResponse.json({ inKb, related, tenderDocs });
}
