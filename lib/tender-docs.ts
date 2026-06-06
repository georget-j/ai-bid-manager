// Central tender-document store (migration 040).
//
// Single source of truth for fetching + caching buyer-published tender documents.
// Documents are stored ONCE, globally, keyed by content hash, with their extracted
// text persisted for reuse by extraction and re-evaluation. The same tender PDF is
// never downloaded or re-extracted twice — across orgs — because opportunities (and
// therefore their attached documents) are a global catalog (migration 023).

import { createHash } from "crypto";
import { extractText } from "@/lib/extractors";
import { getServiceSupabase } from "@/lib/supabase-service";

const MAX_DOC_SIZE = 10 * 1024 * 1024;
const BUCKET = "tender-docs";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/octet-stream,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Cache-Control": "no-cache",
};

export type TenderDocErrorKind =
  | "access-denied"
  | "rate-limited"
  | "timeout"
  | "too-large"
  | "fetch-failed"
  | "server-error"
  | "no-text";

/** Typed error so callers can map to the right HTTP response or skip a doc. */
export class TenderDocError extends Error {
  kind: TenderDocErrorKind;
  status?: number;
  retryAfter?: string | null;

  constructor(
    kind: TenderDocErrorKind,
    message: string,
    opts?: { status?: number; retryAfter?: string | null },
  ) {
    super(message);
    this.name = "TenderDocError";
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfter = opts?.retryAfter ?? null;
  }
}

export interface TenderDocResult {
  tenderDocumentId: string;
  extractedText: string;
  fileName: string;
  fromCache: boolean;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function guessFileName(source: string, contentType: string | null): string {
  try {
    const urlPath = new URL(source).pathname;
    const urlFile = decodeURIComponent(urlPath.split("/").pop() ?? "");
    if (urlFile.includes(".")) return urlFile;
  } catch {
    // not a URL (e.g. a storage path) — fall through
    const tail = source.split("/").pop() ?? "";
    if (tail.includes(".")) return tail;
  }
  const ext = contentType?.includes("pdf")
    ? ".pdf"
    : contentType?.includes("word") || contentType?.includes("docx")
      ? ".docx"
      : contentType?.includes("excel") || contentType?.includes("spreadsheet")
        ? ".xlsx"
        : ".txt";
  return `document${ext}`;
}

/** Download bytes from a procurement URL, throwing a typed TenderDocError. */
async function fetchBytes(
  url: string,
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    if (msg.toLowerCase().includes("abort")) {
      throw new TenderDocError(
        "timeout",
        "Document download timed out — download it manually and upload on the RFP Response tab",
      );
    }
    throw new TenderDocError(
      "fetch-failed",
      "Failed to fetch document from URL",
    );
  }

  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new TenderDocError("access-denied", "access-denied", {
        status: res.status,
      });
    }
    if (res.status === 429) {
      const bodyText = await res.text().catch(() => "");
      throw new TenderDocError(
        "rate-limited",
        bodyText || "Rate limit exceeded on the document server.",
        { status: 429, retryAfter: res.headers.get("retry-after") },
      );
    }
    throw new TenderDocError(
      "server-error",
      `Document server returned ${res.status}`,
      { status: res.status },
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  const fileName = guessFileName(url, contentType);
  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length > MAX_DOC_SIZE) {
    throw new TenderDocError("too-large", "Document too large (max 10 MB)");
  }

  return { buffer, fileName, contentType };
}

type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** Link a tender document to an opportunity (idempotent). */
async function ensureLink(
  supabase: ServiceSupabase,
  opportunityId: string,
  tenderDocumentId: string,
  title: string | null,
  sourceUrl: string,
): Promise<void> {
  await supabase.from("opportunity_tender_documents").upsert(
    {
      opportunity_id: opportunityId,
      tender_document_id: tenderDocumentId,
      title,
      source_url: sourceUrl,
    },
    { onConflict: "opportunity_id,tender_document_id" },
  );
}

/**
 * Fetch a tender document, reusing the central store when possible.
 *
 * 1. URL fast path — if we have this URL's text already, return it (no download).
 * 2. Content dedup — after download, identical bytes (even from a different URL)
 *    reuse the existing row and stored object (no re-upload, no re-extraction).
 * 3. Otherwise download → store bytes globally → extract text once → persist.
 *
 * Always (idempotently) links the document to the opportunity.
 * Throws TenderDocError on fetch/extraction failure.
 */
export async function getOrFetchTenderDoc(
  url: string,
  opportunityId: string,
  title?: string | null,
): Promise<TenderDocResult> {
  const supabase = getServiceSupabase();
  const urlHash = sha256(url);

  // 1. URL fast path — no network fetch.
  const { data: byUrl } = await supabase
    .from("tender_documents")
    .select("id, extracted_text, storage_path, content_type")
    .eq("url_hash", urlHash)
    .limit(1)
    .maybeSingle();

  if (byUrl?.extracted_text) {
    await ensureLink(supabase, opportunityId, byUrl.id, title ?? null, url);
    return {
      tenderDocumentId: byUrl.id,
      extractedText: byUrl.extracted_text,
      fileName: guessFileName(byUrl.storage_path, byUrl.content_type),
      fromCache: true,
    };
  }

  // 2. Download + content dedup.
  const { buffer, fileName, contentType } = await fetchBytes(url);
  const contentHash = sha256(buffer);

  const { data: byContent } = await supabase
    .from("tender_documents")
    .select("id, extracted_text")
    .eq("content_hash", contentHash)
    .limit(1)
    .maybeSingle();

  if (byContent?.extracted_text) {
    await ensureLink(supabase, opportunityId, byContent.id, title ?? null, url);
    return {
      tenderDocumentId: byContent.id,
      extractedText: byContent.extracted_text,
      fileName,
      fromCache: true,
    };
  }

  // 3. New document — extract text once and persist.
  let extractedText: string;
  let pageCount: number | null = null;
  let wordCount: number | null = null;
  try {
    const extraction = await extractText(buffer, fileName);
    extractedText = extraction.text;
    pageCount = extraction.pageCount ?? null;
    wordCount = extraction.wordCount ?? null;
  } catch {
    throw new TenderDocError("no-text", "Could not extract text from document");
  }

  if (!extractedText.trim()) {
    throw new TenderDocError("no-text", "No readable text found in document");
  }

  const storagePath = `central/${contentHash}/${fileName}`;
  await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: contentType || "application/octet-stream",
    upsert: true,
  });

  const { data: inserted, error } = await supabase
    .from("tender_documents")
    .upsert(
      {
        url,
        url_hash: urlHash,
        content_hash: contentHash,
        storage_path: storagePath,
        content_type: contentType || null,
        byte_size: buffer.length,
        extracted_text: extractedText,
        page_count: pageCount,
        word_count: wordCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "content_hash" },
    )
    .select("id")
    .single();

  if (error || !inserted) {
    throw new TenderDocError(
      "server-error",
      `Failed to store tender document: ${error?.message ?? "unknown"}`,
    );
  }

  await ensureLink(supabase, opportunityId, inserted.id, title ?? null, url);

  return {
    tenderDocumentId: inserted.id,
    extractedText,
    fileName,
    fromCache: false,
  };
}

/** Map a TenderDocError to the JSON response shape used by the document routes. */
export function tenderDocErrorResponse(err: TenderDocError): {
  body: Record<string, unknown>;
  status: number;
} {
  switch (err.kind) {
    case "access-denied":
      return { body: { error: "access-denied" }, status: 403 };
    case "rate-limited":
      return {
        body: {
          error: "rate-limited",
          message: err.message,
          retryAfter: err.retryAfter,
        },
        status: 429,
      };
    case "too-large":
      return { body: { error: err.message }, status: 400 };
    case "no-text":
      return { body: { error: err.message }, status: 400 };
    case "timeout":
      return { body: { error: err.message }, status: 502 };
    default:
      return { body: { error: err.message }, status: 502 };
  }
}
