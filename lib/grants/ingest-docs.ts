import { getServiceSupabase } from "@/lib/supabase-service";
import { extractText, ALLOWED_EXTENSIONS } from "@/lib/extractors";
import { ingestDocument } from "@/lib/documents";
import type { GrantRow } from "./types";

// Download a grant's documents (from deep enrichment) into the org knowledge base so the
// RAG retrieval can ground application answers in them. Guardrails: identifying UA, a
// per-file size cap + timeout, capped document count, public files only, org-scoped dedup.

const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; UKBidIntelligence/1.0; +https://ai-rfp-agent-ten.vercel.app)";
const MAX_DOCS = 8;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const FETCH_TIMEOUT_MS = 20_000;

export interface GrantDocIngestResult {
  total: number;
  ingested: number;
  alreadyPresent: number;
  skipped: number;
  errors: string[];
}

function fileNameFromUrl(url: string, fallbackTitle: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (last.includes(".")) return decodeURIComponent(last);
  } catch {
    /* fall through */
  }
  const ext =
    url.match(/\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv)(\?|$)/i)?.[1] ?? "pdf";
  const stem =
    fallbackTitle.slice(0, 60).replace(/[^a-z0-9]+/gi, "-") || "document";
  return `${stem}.${ext.toLowerCase()}`;
}

/** Ingest a grant's enriched documents into the org KB. Best-effort per document. */
export async function ingestGrantDocuments(
  orgId: string,
  grant: GrantRow,
  opts: { maxDocs?: number; deadlineMs?: number } = {},
): Promise<GrantDocIngestResult> {
  const cap = opts.maxDocs ?? MAX_DOCS;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : null;
  const docs = (grant.details?.documents ?? []).slice(0, cap);
  const res: GrantDocIngestResult = {
    total: docs.length,
    ingested: 0,
    alreadyPresent: 0,
    skipped: 0,
    errors: [],
  };
  if (docs.length === 0) return res;

  const supabase = getServiceSupabase();

  for (const doc of docs) {
    if (deadline && Date.now() > deadline) {
      res.skipped++;
      continue;
    }
    try {
      const fileName = fileNameFromUrl(doc.url, doc.title);
      const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        res.skipped++;
        continue;
      }

      // Org-scoped dedup: skip documents already imported (keyed on the source URL).
      const { data: existing } = await supabase
        .from("documents")
        .select("id")
        .eq("org_id", orgId)
        .eq("file_name", doc.url)
        .limit(1);
      if (existing && existing.length > 0) {
        res.alreadyPresent++;
        continue;
      }

      const r = await fetch(doc.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) {
        res.skipped++;
        res.errors.push(`${doc.title}: HTTP ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        res.skipped++;
        res.errors.push(`${doc.title}: too large`);
        continue;
      }

      const extraction = await extractText(buf, fileName);
      if (!extraction.text.trim()) {
        res.skipped++;
        res.errors.push(`${doc.title}: no readable text`);
        continue;
      }

      await ingestDocument({
        text: extraction.text,
        title: `${grant.title} — ${doc.title}`.slice(0, 240),
        fileName: doc.url, // store the source URL for org-scoped dedup
        sourceType: "procurement",
        collection: "main",
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
        `${doc.title}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return res;
}
