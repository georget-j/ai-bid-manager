export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { fetchFindTenderRecord } from "@/lib/procurement/connectors/find-tender";
import { mapOcdsStage } from "@/lib/procurement/normalizers/ocds";

interface Params {
  params: Promise<{ id: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// Find a Tender OCIDs are prefixed ocds-h6vhtk- ; only those have a record package.
const FTS_OCID_PREFIX = "ocds-h6vhtk";

/**
 * GET — the compiled OCDS lifecycle for a Find a Tender opportunity: the current
 * merged state plus the timeline of notice events (pipeline → tender → award →
 * amendment → termination). Returns { supported:false } for non-FTS sources.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ocid = opp.canonical_ocid;
  if (!ocid || !ocid.startsWith(FTS_OCID_PREFIX)) {
    return NextResponse.json({ supported: false });
  }

  const record = await fetchFindTenderRecord(ocid);
  if (!record) {
    return NextResponse.json({
      supported: true,
      ocid,
      compiled: null,
      events: [],
    });
  }

  const compiled: AnyRecord = record.compiledRelease ?? {};
  const tender: AnyRecord = compiled.tender ?? {};
  const value: AnyRecord = tender.value ?? compiled.value ?? {};

  const events = record.releases
    .map((r) => ({
      date: (r.date as string) ?? null,
      tags: Array.isArray(r.tag) ? (r.tag as string[]) : [],
      stage: mapOcdsStage(r.tag),
      title: (r.tender as AnyRecord)?.title ?? tender.title ?? "Notice",
    }))
    .filter((e) => e.date)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1)); // newest first

  return NextResponse.json({
    supported: true,
    ocid,
    ftsUrl: opp.source_url ?? null,
    compiled: {
      title: tender.title ?? opp.title ?? null,
      status: tender.status ?? opp.status ?? null,
      stage: mapOcdsStage(compiled.tag),
      buyer: compiled.buyer?.name ?? opp.buyer_name ?? null,
      valueAmount: value.amount ?? null,
      valueCurrency: value.currency ?? null,
      deadline: tender.tenderPeriod?.endDate ?? opp.deadline_at ?? null,
    },
    events,
  });
}
