import type {
  NormalizedOpportunity,
  NormalizedLot,
  NormalizedDocument,
  ProcurementStage,
  OpportunityStatus,
  ProcurementSourceName,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// Substring matching keeps us forward-compatible with the OCDS tag vocabulary,
// including the Procurement Act 2023 (Feb 2025) additions — e.g. pipeline notices
// (planning), contractAmendment / contractTermination (contract), awardUpdate
// (award) all map to a sensible stage and are never dropped.
export function mapOcdsStage(tags: unknown): ProcurementStage {
  if (!Array.isArray(tags)) return "unknown";
  const t = tags.join(" ").toLowerCase();
  if (t.includes("planning") || t.includes("prior")) return "planning";
  if (t.includes("tender")) return "tender";
  if (t.includes("award")) return "award";
  if (t.includes("contract")) return "contract";
  if (t.includes("implementation")) return "implementation";
  return "unknown";
}

function mapTenderStatus(
  tenderStatus: unknown,
  deadlineAt: string | null,
  tags?: unknown,
): OpportunityStatus {
  // A cancellation/withdrawal/termination notice is cancelled regardless of the
  // tender.status (Procurement Act contractTermination / award/tenderCancellation).
  if (Array.isArray(tags)) {
    const t = tags.join(" ").toLowerCase();
    if (
      t.includes("cancellation") ||
      t.includes("withdraw") ||
      t.includes("termination")
    ) {
      return "cancelled";
    }
  }
  if (typeof tenderStatus === "string") {
    const s = tenderStatus.toLowerCase();
    if (s === "active" || s === "open") return "active";
    if (s === "complete" || s === "closed" || s === "unsuccessful")
      return "closed";
    if (s === "cancelled" || s === "withdrawn") return "cancelled";
    if (s === "planned") return "planned";
  }
  // Derive from deadline
  if (deadlineAt) {
    const past = new Date(deadlineAt).getTime() < Date.now();
    return past ? "closed" : "active";
  }
  return "unknown";
}

function extractCpvCodes(tender: AnyRecord): string[] {
  const codes: string[] = [];

  // Main CPV
  const main = tender.classification ?? tender.additionalClassifications?.[0];
  if (main?.id) codes.push(String(main.id));

  // Additional classifications
  const additional: AnyRecord[] = tender.additionalClassifications ?? [];
  for (const c of additional) {
    if (c?.id && !codes.includes(String(c.id))) codes.push(String(c.id));
  }

  // Items classifications
  const items: AnyRecord[] = tender.items ?? [];
  for (const item of items) {
    const cls = item.classification;
    if (cls?.id && !codes.includes(String(cls.id))) codes.push(String(cls.id));
  }

  return codes.slice(0, 10);
}

function normalizeLots(lots: unknown[]): NormalizedLot[] {
  return lots.map((l) => {
    const lot = l as AnyRecord;
    return {
      id: lot.id ? String(lot.id) : null,
      title: lot.title ?? null,
      description: lot.description ?? null,
      valueAmount: lot.value?.amount ?? null,
      valueCurrency: lot.value?.currency ?? "GBP",
      cpvCodes: lot.classification?.id ? [String(lot.classification.id)] : [],
      deadlineAt: lot.tenderPeriod?.endDate ?? null,
    };
  });
}

function normalizeDocuments(docs: unknown[]): NormalizedDocument[] {
  return docs.map((d) => {
    const doc = d as AnyRecord;
    return {
      id: doc.id ? String(doc.id) : null,
      title: doc.title ?? doc.documentType ?? "Document",
      documentType: doc.documentType ?? null,
      url: doc.url ?? null,
      format: doc.format ?? null,
      publishedAt: doc.datePublished ?? null,
    };
  });
}

function findBuyer(release: AnyRecord): AnyRecord | null {
  const parties: AnyRecord[] = release.parties ?? [];
  // Prefer the parties entry — it carries the address. release.buyer is usually a
  // bare {name, id} stub with no address, which is why region was always null.
  const byRole = parties.find(
    (p) => Array.isArray(p.roles) && p.roles.includes("buyer"),
  );
  if (byRole) return byRole;
  if (release.buyer?.id) {
    const byId = parties.find((p) => String(p.id) === String(release.buyer.id));
    if (byId) return byId;
  }
  return (release.buyer as AnyRecord) ?? parties[0] ?? null;
}

/** Best-available location from an OCDS address. CF gives locality + countryName
 *  (no NUTS region), so fall back through them. */
function addressRegion(address: AnyRecord | undefined): string | null {
  if (!address) return null;
  return address.region ?? address.locality ?? address.countryName ?? null;
}

export function normalizeOcdsRelease(
  release: unknown,
  sourceName: ProcurementSourceName,
): NormalizedOpportunity {
  const r = release as AnyRecord;
  const tender: AnyRecord = r.tender ?? {};
  const buyer = findBuyer(r);

  const tenderPeriod: AnyRecord = tender.tenderPeriod ?? {};
  const contractPeriod: AnyRecord = tender.contractPeriod ?? {};
  const value: AnyRecord = tender.value ?? r.value ?? {};

  const deadlineAt: string | null = tenderPeriod.endDate ?? null;

  return {
    canonicalOcid: r.ocid ?? null,
    sourceName,
    sourceNoticeId: String(r.id ?? r.ocid ?? crypto.randomUUID()),
    sourceUrl: r.links?.self ?? null,
    submissionUrl: tender.submissionMethodDetails ?? null,

    title: tender.title ?? r.title ?? "Untitled opportunity",
    description: tender.description ?? r.description ?? null,

    buyerName: buyer?.name ?? r.buyer?.name ?? null,
    buyerIdentifier: buyer?.identifier?.id ? String(buyer.identifier.id) : null,
    buyerRegion: addressRegion(buyer?.address),

    noticeType: Array.isArray(r.tag) ? r.tag.join(", ") : null,
    procurementStage: mapOcdsStage(r.tag),
    status: mapTenderStatus(tender.status, deadlineAt, r.tag),

    cpvCodes: extractCpvCodes(tender),
    region: addressRegion(buyer?.address),

    valueAmount: value.amount ?? null,
    valueCurrency: value.currency ?? "GBP",

    publishedAt: r.date ?? null,
    updatedAt: r.date ?? null,
    deadlineAt,
    contractStartAt: contractPeriod.startDate ?? null,
    contractEndAt: contractPeriod.endDate ?? null,

    frameworkFlag: Boolean(tender.techniques?.hasFrameworkAgreement),
    lots: normalizeLots(tender.lots ?? []),
    documents: normalizeDocuments(tender.documents ?? []),

    rawJson: release,
  };
}
