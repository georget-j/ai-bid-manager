import { getServiceSupabase } from "@/lib/supabase-service";
import { extractText, ALLOWED_EXTENSIONS } from "@/lib/extractors";
import { ingestDocument } from "@/lib/documents";
import { safeFetch } from "@/lib/safe-fetch";
import type { GrantRow } from "./types";

// Import a grant's resources — its documents (PDF/DOCX/…) AND the web links found in its
// detail — into a PER-GRANT knowledge-base collection ("grant:<id>"). That collection is
// excluded from general retrieval (see migration 063), so this context informs only this
// grant's application and never affects other responses. Guardrails: identifying UA, size
// cap + timeout, capped count, public resources only (SSRF-guarded fetch — see
// lib/safe-fetch.ts), org+collection-scoped dedup.

const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";
const MAX_SOURCES = 12;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const FETCH_TIMEOUT_MS = 20_000;

export interface GrantDocIngestResult {
  total: number;
  ingested: number;
  alreadyPresent: number;
  skipped: number;
  errors: string[];
}

export function grantCollection(grantId: string): string {
  return `grant:${grantId}`;
}

interface SourceItem {
  url: string;
  title: string;
  kind: "document" | "link";
}

/** Documents + web links from a grant's enriched detail, deduped by URL. */
function collectSources(grant: GrantRow): SourceItem[] {
  const d = grant.details;
  if (!d) return [];
  const items: SourceItem[] = [];
  for (const doc of d.documents ?? [])
    items.push({ url: doc.url, title: doc.title, kind: "document" });
  for (const link of d.links ?? []) {
    if (!/^https?:\/\//i.test(link.url)) continue; // skip mailto:, tel:, anchors
    items.push({ url: link.url, title: link.title, kind: "link" });
  }
  const seen = new Set<string>();
  return items.filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true),
  );
}

function fileNameFor(item: SourceItem): string {
  if (item.kind === "link") {
    // Web pages -> .html so the HTML extractor runs.
    const stem = item.title.slice(0, 60).replace(/[^a-z0-9]+/gi, "-") || "page";
    return `${stem}.html`;
  }
  try {
    const last =
      new URL(item.url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (last.includes(".")) return decodeURIComponent(last);
  } catch {
    /* fall through */
  }
  const ext =
    item.url.match(/\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv)(\?|$)/i)?.[1] ??
    "pdf";
  const stem =
    item.title.slice(0, 60).replace(/[^a-z0-9]+/gi, "-") || "document";
  return `${stem}.${ext.toLowerCase()}`;
}

/** Import a grant's documents + links into its scoped KB collection. Best-effort each. */
export async function ingestGrantDocuments(
  orgId: string,
  grant: GrantRow,
  opts: { maxSources?: number; deadlineMs?: number } = {},
): Promise<GrantDocIngestResult> {
  const cap = opts.maxSources ?? MAX_SOURCES;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : null;
  const sources = collectSources(grant).slice(0, cap);
  const collection = grantCollection(grant.id);
  const res: GrantDocIngestResult = {
    total: sources.length,
    ingested: 0,
    alreadyPresent: 0,
    skipped: 0,
    errors: [],
  };
  if (sources.length === 0) return res;

  const supabase = getServiceSupabase();

  for (const item of sources) {
    if (deadline && Date.now() > deadline) {
      res.skipped++;
      continue;
    }
    try {
      const fileName = fileNameFor(item);
      const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        res.skipped++;
        continue;
      }

      // Org + collection-scoped dedup (keyed on the source URL). A failed read
      // throws into the per-item catch below so it's recorded, not re-ingested.
      const { data: existing, error: existingError } = await supabase
        .from("documents")
        .select("id")
        .eq("org_id", orgId)
        .eq("collection", collection)
        .eq("file_name", item.url)
        .limit(1);
      if (existingError)
        throw new Error(`dedup check failed: ${existingError.message}`);
      if (existing && existing.length > 0) {
        res.alreadyPresent++;
        continue;
      }

      // SSRF guard: URLs come from scraped external pages — safeFetch rejects
      // private/loopback/metadata hosts and re-validates every redirect hop.
      const r = await safeFetch(item.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) {
        res.skipped++;
        res.errors.push(`${item.title}: HTTP ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        res.skipped++;
        res.errors.push(`${item.title}: too large`);
        continue;
      }

      const extraction = await extractText(buf, fileName);
      if (extraction.text.trim().length < 80) {
        res.skipped++;
        res.errors.push(`${item.title}: no readable text`);
        continue;
      }

      await ingestDocument({
        text: extraction.text,
        title: `${grant.title} — ${item.title}`.slice(0, 240),
        fileName: item.url, // store the source URL for collection-scoped dedup
        sourceType: "upload", // DB allows upload|sample; isolation is via `collection`
        collection,
        orgId,
        pageCount: extraction.pageCount,
        wordCount: extraction.wordCount,
        extractionWarnings: extraction.warnings,
        fileSizeBytes: buf.byteLength,
      });
      res.ingested++;
    } catch (err) {
      res.skipped++;
      res.errors.push(
        `${item.title}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return res;
}

// Extracted text of one of this grant's ingested resources, with the source kind so
// callers can put real funder documents (application forms, guidance PDFs) ahead of
// scraped web pages.
export interface GrantDocumentText {
  title: string;
  url: string;
  kind: "document" | "link";
  text: string;
}

// Per-document cap on the text we hand back — matches the question-extraction input
// budget (lib/rfp-extract.ts slices to 30k chars), so we never haul multi-MB raw_text
// strings around for nothing.
const TEXT_CAP = 30_000;

/**
 * Read back the extracted TEXT of this grant's already-ingested resources from the
 * org's KB (collection "grant:<id>"). Run after ingestGrantDocuments() so freshly
 * imported and previously imported documents are both covered. Read-only — does not
 * touch ingestion behaviour. Best-effort: returns [] on a read failure.
 */
export async function getGrantDocumentTexts(
  orgId: string,
  grant: GrantRow,
): Promise<GrantDocumentText[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("documents")
    .select("title, file_name, raw_text")
    .eq("org_id", orgId)
    .eq("collection", grantCollection(grant.id))
    .not("raw_text", "is", null);
  if (error || !data) return [];

  // Ingestion stores the source URL in file_name (for dedup); recover the kind by
  // matching it against the grant's document list. Unknown URLs are treated as links.
  const documentUrls = new Set(
    (grant.details?.documents ?? []).map((d) => d.url),
  );
  return data
    .map((row) => ({
      title: (row.title as string) ?? "",
      url: (row.file_name as string) ?? "",
      kind: documentUrls.has(row.file_name as string)
        ? ("document" as const)
        : ("link" as const),
      text: ((row.raw_text as string) ?? "").slice(0, TEXT_CAP),
    }))
    .filter((d) => d.text.trim().length > 0);
}
