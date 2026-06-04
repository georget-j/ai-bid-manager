import { getServiceSupabase } from "./supabase";
import { chunkText } from "./chunking";
import { generateEmbeddingsBatch } from "./embeddings";
import type { IngestResult } from "./schema";

type IngestInput = {
  text: string;
  title: string;
  fileName?: string;
  mimeType?: string;
  sourceType: "upload" | "sample" | "procurement";
  collection?: string;
  opportunityId?: string | null;
  pageCount?: number;
  wordCount?: number;
  extractionWarnings?: string[];
  fileSizeBytes?: number;
  orgId?: string | null;
};

export async function ingestDocument(
  input: IngestInput,
): Promise<IngestResult> {
  const {
    text,
    title,
    fileName,
    mimeType,
    sourceType,
    collection = "main",
    opportunityId,
    pageCount,
    wordCount,
    extractionWarnings,
    fileSizeBytes,
    orgId,
  } = input;

  if (!text.trim()) throw new Error("Document text is empty");

  const supabase = getServiceSupabase();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      title,
      source_type: sourceType,
      collection,
      opportunity_id: opportunityId ?? null,
      file_name: fileName ?? null,
      mime_type: mimeType ?? null,
      raw_text: text,
      page_count: pageCount ?? null,
      word_count: wordCount ?? null,
      extraction_warnings: extractionWarnings?.length
        ? extractionWarnings
        : null,
      file_size_bytes: fileSizeBytes ?? null,
      org_id: orgId ?? null,
    })
    .select("id")
    .single();

  if (docError || !doc) {
    throw new Error(`Failed to save document: ${docError?.message}`);
  }

  const chunks = chunkText(text, title);
  if (chunks.length === 0) throw new Error("Document produced no chunks");

  const embeddings = await generateEmbeddingsBatch(
    chunks.map((c) => c.content),
  );

  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    token_count: Math.round(chunk.content.length / 4),
    embedding: JSON.stringify(embeddings[i]),
    metadata: { title, source_type: sourceType },
  }));

  const { error: chunkError } = await supabase
    .from("document_chunks")
    .insert(rows);

  if (chunkError) {
    await supabase.from("documents").delete().eq("id", doc.id);
    throw new Error(`Failed to save chunks: ${chunkError.message}`);
  }

  return { document_id: doc.id, chunk_count: chunks.length, title };
}

export async function getDocuments() {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("id, title, source_type, file_name, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  return data ?? [];
}

export async function getDocumentChunkCount(
  documentId: string,
): Promise<number> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);

  if (error) return 0;
  return count ?? 0;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}

export async function purgeStaleUploads(maxAgeHours = 24): Promise<number> {
  const supabase = getServiceSupabase();
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("source_type", "upload")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    console.warn("[purge]", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function documentExists(title: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  return !!data;
}
