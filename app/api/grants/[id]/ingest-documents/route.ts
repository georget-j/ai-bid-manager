import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getGrant } from "@/lib/grants/data";
import { enrichGrant } from "@/lib/grants/enrich";
import { ingestGrantDocuments } from "@/lib/grants/ingest-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/** POST — import this grant's documents into the org knowledge base. */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let grant = await getGrant(id);
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!grant.details) {
    const details = await enrichGrant(grant).catch(() => null);
    if (details) grant = { ...grant, details };
  }

  const result = await ingestGrantDocuments(orgId, grant);
  return NextResponse.json(result);
}
