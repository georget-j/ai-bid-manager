import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const orgId = await getRequestOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: "No organisation found" },
        { status: 403 },
      );
    }

    const supabase = getServiceSupabase();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select(
        "id, title, source_type, file_name, mime_type, raw_text, created_at",
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, chunk_index, content, token_count")
      .eq("document_id", id)
      .order("chunk_index", { ascending: true });

    if (chunksError) {
      return NextResponse.json({ error: chunksError.message }, { status: 500 });
    }

    return NextResponse.json({ doc, chunks: chunks ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
