import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export type DocumentStats = {
  total_documents: number;
  total_chunks: number;
  by_type: { ext: string; count: number }[];
};

export async function GET() {
  try {
    const orgId = await getRequestOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: "No organisation found" },
        { status: 403 },
      );
    }

    const supabase = getServiceSupabase();

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, file_name")
      .eq("org_id", orgId);

    if (docsError) throw new Error(docsError.message);

    // document_chunks has no org_id — scope the count via the org's documents
    const docIds = (docs ?? []).map((d) => d.id);
    let chunkCount = 0;
    if (docIds.length > 0) {
      const { count, error: chunksError } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .in("document_id", docIds);

      if (chunksError) throw new Error(chunksError.message);
      chunkCount = count ?? 0;
    }

    const extCounts: Record<string, number> = {};
    for (const doc of docs ?? []) {
      const ext = doc.file_name
        ? (doc.file_name.split(".").pop()?.toLowerCase() ?? "other")
        : "other";
      extCounts[ext] = (extCounts[ext] ?? 0) + 1;
    }

    const by_type = Object.entries(extCounts)
      .map(([ext, count]) => ({ ext, count }))
      .sort((a, b) => b.count - a.count);

    const stats: DocumentStats = {
      total_documents: docs?.length ?? 0,
      total_chunks: chunkCount,
      by_type,
    };

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
