import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const orgId = await getRequestOrgId();

    let query = supabase
      .from("documents")
      .select("id, title, source_type, file_name, created_at")
      .order("created_at", { ascending: false });

    if (orgId) query = query.eq("org_id", orgId);

    const { data: documents, error } = await query;

    if (error) throw new Error(error.message);

    // Get chunk counts for each document
    const ids = (documents ?? []).map((d) => d.id);
    const chunkCounts: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: chunks } = await supabase
        .from("document_chunks")
        .select("document_id")
        .in("document_id", ids);

      for (const chunk of chunks ?? []) {
        chunkCounts[chunk.document_id] =
          (chunkCounts[chunk.document_id] ?? 0) + 1;
      }
    }

    const result = (documents ?? []).map((d) => ({
      ...d,
      chunk_count: chunkCounts[d.id] ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Document ID required" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase.from("documents").delete().eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
