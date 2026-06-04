import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { ingestDocument } from "@/lib/documents";
import { extractText } from "@/lib/extractors";
import type { NormalizedDocument } from "@/lib/procurement/types";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface Params {
  params: Promise<{ id: string }>;
}

function buildKnownUrls(opp: {
  documents: NormalizedDocument[] | null;
  raw_json: unknown;
  submission_url: string | null;
  source_url: string | null;
}): Set<string> {
  const urls = new Set<string>();
  for (const d of (opp.documents ?? []) as NormalizedDocument[]) {
    if (d.url) urls.add(d.url);
  }
  const raw = opp.raw_json as Record<string, unknown> | null;
  if (raw && Array.isArray(raw.documents)) {
    for (const d of raw.documents as Array<Record<string, unknown>>) {
      if (typeof d.url === "string") urls.add(d.url);
    }
  }
  if (opp.submission_url) urls.add(opp.submission_url);
  return urls;
}

export async function POST(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { url?: string; title?: string };
  const { url, title } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // SSRF protection: only allow URLs that are stored in this opportunity
  const knownUrls = buildKnownUrls(opp);
  if (!knownUrls.has(url)) {
    return NextResponse.json(
      { error: "URL is not associated with this opportunity" },
      { status: 403 },
    );
  }

  let buffer: Buffer;
  let mimeType = "application/octet-stream";
  const fileName = decodeURIComponent(
    url.split("/").pop()?.split("?")[0] ?? "document",
  );

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch document: HTTP ${res.status}` },
        { status: 400 },
      );
    }
    mimeType =
      res.headers.get("Content-Type")?.split(";")[0].trim() ?? mimeType;
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "Document too large (max 5 MB)" },
        { status: 400 },
      );
    }
    buffer = Buffer.from(arrayBuf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const extraction = await extractText(buffer, fileName, mimeType);
  if (!extraction.text.trim()) {
    return NextResponse.json(
      { error: "No readable text found in this document" },
      { status: 400 },
    );
  }

  const docTitle = title ?? `${opp.title} – ${fileName}`;

  const result = await ingestDocument({
    text: extraction.text,
    title: docTitle,
    fileName,
    mimeType,
    sourceType: "procurement",
    pageCount: extraction.pageCount,
    wordCount: extraction.wordCount,
    extractionWarnings: extraction.warnings,
    fileSizeBytes: buffer.byteLength,
    orgId,
  });

  return NextResponse.json(result);
}
