import type {
  ProcurementSourceConnector,
  FetchSinceParams,
  SourceFetchResult,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";

const BASE_URL =
  process.env.FIND_TENDER_BASE_URL ?? "https://www.find-tender.service.gov.uk";

const LOOKBACK_HOURS = Number(
  process.env.PROCUREMENT_SYNC_LOOKBACK_HOURS ?? "24",
);
const PAGE_LIMIT = Number(process.env.PROCUREMENT_SYNC_LIMIT ?? "100");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export const findTenderConnector: ProcurementSourceConnector = {
  sourceName: "find-tender",
  displayName: "Find a Tender",
  baseUrl: BASE_URL,

  async fetchSince({
    from,
    to,
    cursor,
    limit = PAGE_LIMIT,
  }: FetchSinceParams): Promise<SourceFetchResult> {
    const url = new URL(`${BASE_URL}/api/1.0/ocdsReleasePackages`);
    url.searchParams.set("updatedFrom", from.toISOString());
    url.searchParams.set("updatedTo", to.toISOString());
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `Find a Tender API returned ${response.status}: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as AnyRecord;

    // The API may return releases at top level or nested in packages
    const rawItems: unknown[] = Array.isArray(payload.releases)
      ? payload.releases
      : Array.isArray(payload.packages)
        ? (payload.packages as AnyRecord[]).flatMap((pkg) =>
            Array.isArray(pkg.releases) ? pkg.releases : [pkg],
          )
        : [payload];

    const nextCursor: string | null =
      payload.nextCursor ?? payload.links?.next ?? null;

    return {
      sourceName: "find-tender",
      rawItems,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: Boolean(nextCursor),
    };
  },

  async normalize(raw: unknown): Promise<NormalizedOpportunity[]> {
    try {
      return [normalizeOcdsRelease(raw, "find-tender")];
    } catch {
      return [];
    }
  },
};

export { LOOKBACK_HOURS, PAGE_LIMIT };
