import { getServiceSupabase } from "@/lib/supabase-service";
import { extractText, ALLOWED_EXTENSIONS } from "@/lib/extractors";
import { ingestDocument } from "@/lib/documents";
import type { GrantRow } from "./types";

// Import a grant's resources — its documents (PDF/DOCX/…) AND the web links found in its
// detail — into a PER-GRANT knowledge-base collection ("grant:<id>"). That collection is
// excluded from general retrieval (see migration 063), so this context informs only this
// grant's application and never affects other responses. Guardrails: identifying UA, size
// cap + timeout, capped count, public resources only, org+collection-scoped dedup.

const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; UKBidIntelligence/1.0; +https://ai-rfp-agent-ten.vercel.app)";
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

      // Org + collection-scoped dedup (keyed on the source URL).
      const { data: existing } = await supabase
        .from("documents")
        .select("id")
        .eq("org_id", orgId)
        .eq("collection", collection)
        .eq("file_name", item.url)
        .limit(1);
      if (existing && existing.length > 0) {
        res.alreadyPresent++;
        continue;
      }

      const r = await fetch(item.url, {
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
