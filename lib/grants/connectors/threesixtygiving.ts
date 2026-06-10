import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
} from "../types";

// 360Giving API — AWARDED grants (historical "who funded whom"), per the 360Giving
// Data Standard. Used to browse past awards + power funder intelligence; these are
// status:"awarded" (not open calls). The API is org-centric (grants_made per funder)
// with limit/offset pagination and a `next` URL, so we walk a curated set of major
// funders, following `next` like the OCDS full-URL cursor. Read-only, no auth.
// Docs: https://www.360giving.org/api-docs/use/

const BASE_URL = "https://api.threesixtygiving.org/api/v1";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; UKBidIntelligence/1.0; +https://ai-rfp-agent-ten.vercel.app)";

// Curated major UK funders (360Giving org ids, verified live). We ingest one recent
// page per funder — a representative sample for funder intelligence (these are awarded
// grants for browse + stats, not open calls), not the funder's entire history.
const FUNDERS: Array<{ id: string; name: string }> = [
  { id: "GB-GOR-PB188", name: "The National Lottery Community Fund" },
  { id: "GB-CHC-200051", name: "Esmée Fairbairn Foundation" },
  { id: "GB-CHC-1102927", name: "Paul Hamlyn Foundation" },
  { id: "GB-CHC-205629", name: "Trust for London" },
  { id: "GB-CHC-802052", name: "BBC Children in Need" },
  { id: "GB-CHC-326568", name: "Comic Relief" },
  { id: "GB-CHC-1035628", name: "City Bridge Trust" },
  { id: "GB-CHC-1156077", name: "Power to Change" },
  { id: "GB-CHC-1144091", name: "Nesta" },
  { id: "GB-COH-RC000766", name: "Wellcome Trust" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface Cursor {
  fi: number; // funder index
  url: string | null; // absolute `next` URL within the current funder
}

function firstUrl(funderId: string, limit: number): string {
  return `${BASE_URL}/org/${encodeURIComponent(funderId)}/grants_made/?limit=${limit}`;
}

async function getJson(url: string): Promise<AnyRecord> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`360Giving API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as AnyRecord;
}

export const threeSixtyGivingConnector: GrantSourceConnector = {
  sourceName: "360giving",
  displayName: "360Giving (GrantNav)",
  baseUrl: BASE_URL,

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const limit = params.limit ?? 100;
    const cursor: Cursor =
      params.cursor && params.cursor.startsWith("{")
        ? (JSON.parse(params.cursor) as Cursor)
        : { fi: 0, url: null };

    if (cursor.fi >= FUNDERS.length) {
      return {
        sourceName: "360giving",
        rawItems: [],
        nextCursor: null,
        fetchedAt: new Date().toISOString(),
        hasMore: false,
      };
    }

    const url = cursor.url ?? firstUrl(FUNDERS[cursor.fi].id, limit);
    const data = await getJson(url);
    const rawItems = Array.isArray(data.results) ? data.results : [];

    // One page per funder (a recent sample): always advance to the next funder rather
    // than following `next` through the funder's full grant history.
    const next: Cursor | null =
      cursor.fi + 1 < FUNDERS.length ? { fi: cursor.fi + 1, url: null } : null;

    return {
      sourceName: "360giving",
      rawItems,
      nextCursor: next ? JSON.stringify(next) : null,
      fetchedAt: new Date().toISOString(),
      hasMore: next !== null,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const wrapper = raw as AnyRecord;
    // The 360Giving-standard grant object is nested under `data`; the stable id is
    // the top-level `grant_id`.
    const g = (wrapper.data ?? wrapper) as AnyRecord;
    const id = String(wrapper.grant_id ?? g.id ?? "");
    if (!id) return [];

    const funder = Array.isArray(g.fundingOrganization)
      ? g.fundingOrganization[0]
      : g.fundingOrganization;
    const recipient = Array.isArray(g.recipientOrganization)
      ? g.recipientOrganization[0]
      : g.recipientOrganization;
    const programmes = Array.isArray(g.grantProgramme)
      ? (g.grantProgramme as AnyRecord[])
          .map((p) => p?.title)
          .filter((t): t is string => typeof t === "string")
      : [];
    const regions = Array.isArray(recipient?.location)
      ? (recipient.location as AnyRecord[])
          .map((l) => l?.name)
          .filter((n): n is string => typeof n === "string")
      : [];
    const amount = typeof g.amountAwarded === "number" ? g.amountAwarded : null;

    return [
      {
        sourceName: "360giving",
        sourceNoticeId: id,
        sourceUrl: `https://grantnav.threesixtygiving.org/grant/${id}`,
        applicationUrl: null,
        title: typeof g.title === "string" ? g.title : "Untitled grant",
        description: typeof g.description === "string" ? g.description : null,
        funderName: funder?.name ?? null,
        funderId: funder?.id ?? null,
        funderRegion: null,
        fundingType: "grant",
        amountMin: amount,
        amountMax: amount,
        currency: typeof g.currency === "string" ? g.currency : "GBP",
        openAt: null,
        deadlineAt: null,
        status: "awarded",
        themes: programmes,
        sectors: [],
        regions,
        eligibilityText: null,
        eligibleOrgTypes: [],
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: typeof g.awardDate === "string" ? g.awardDate : null,
        rawJson: raw,
      },
    ];
  },
};
