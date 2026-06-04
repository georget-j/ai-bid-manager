import type {
  ProcurementSourceConnector,
  FetchSinceParams,
  SourceFetchResult,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";

const BASE_URL =
  process.env.SELL2WALES_BASE_URL ?? "https://www.sell2wales.gov.wales";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export const sell2walesConnector: ProcurementSourceConnector = {
  sourceName: "sell2wales",
  displayName: "Sell2Wales",
  baseUrl: BASE_URL,

  async fetchSince({
    from,
    to,
    cursor,
    limit = 100,
  }: FetchSinceParams): Promise<SourceFetchResult> {
    // Sell2Wales publishes an OCDS-compatible feed
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
        `Sell2Wales API returned ${response.status}: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as AnyRecord;

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
      sourceName: "sell2wales",
      rawItems,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: Boolean(nextCursor),
    };
  },

  async normalize(raw: unknown): Promise<NormalizedOpportunity[]> {
    try {
      return [normalizeOcdsRelease(raw, "sell2wales")];
    } catch {
      return [];
    }
  },
};
