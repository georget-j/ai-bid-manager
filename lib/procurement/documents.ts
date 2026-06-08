import type { NormalizedDocument } from "./types";

type DocSource = {
  documents: NormalizedDocument[] | null;
  raw_json: unknown;
};

/**
 * Collect the de-duplicated tender documents attached to an opportunity, merging
 * `opportunities.documents` with any extras in `raw_json.documents` (deduped by URL,
 * keeping only entries that carry a URL). Single source of truth so the Documents
 * panel and the summary-header count never disagree.
 */
export function collectTenderDocuments(opp: DocSource): NormalizedDocument[] {
  const base = (opp.documents ?? []) as NormalizedDocument[];
  const seen = new Set(base.map((d) => d.url).filter(Boolean));

  const extra: NormalizedDocument[] = [];
  const raw = opp.raw_json as Record<string, unknown> | null;
  if (raw && Array.isArray(raw.documents)) {
    for (const d of raw.documents as Array<Record<string, unknown>>) {
      if (typeof d.url === "string" && !seen.has(d.url)) {
        seen.add(d.url);
        extra.push({
          title: typeof d.title === "string" ? d.title : "Untitled document",
          url: d.url,
          format: typeof d.format === "string" ? d.format : undefined,
          documentType:
            typeof d.documentType === "string" ? d.documentType : undefined,
        });
      }
    }
  }

  return [...base, ...extra].filter((d) => Boolean(d.url));
}

/** Count of de-duplicated, URL-bearing tender documents on an opportunity. */
export function countTenderDocuments(opp: DocSource): number {
  return collectTenderDocuments(opp).length;
}
