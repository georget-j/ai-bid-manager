import type {
  ProcurementSourceConnector,
  FetchSinceParams,
  SourceFetchResult,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";

const BASE_URL =
  process.env.CONTRACTS_FINDER_BASE_URL ??
  "https://www.contractsfinder.service.gov.uk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Contracts Finder uses numeric offset-based pagination via the `from` param.
 * The cursor we store is the string representation of the next offset.
 * We also accept a full URL (e.g. from payload.links.next) and extract `from`.
 */
function parseOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  if (!isNaN(n) && n >= 0) return n;
  try {
    return Number(new URL(cursor).searchParams.get("from") ?? "0") || 0;
  } catch {
    return 0;
  }
}

export const contractsFinderConnector: ProcurementSourceConnector = {
  sourceName: "contracts-finder",
  displayName: "Contracts Finder",
  baseUrl: BASE_URL,

  async fetchSince({
    from,
    to,
    cursor,
    limit = 100,
  }: FetchSinceParams): Promise<SourceFetchResult> {
    const offset = parseOffset(cursor);

    const url = new URL(`${BASE_URL}/Published/Notices/OCDS/Search`);
    url.searchParams.set("postedFrom", from.toISOString().split("T")[0]);
    url.searchParams.set("postedTo", to.toISOString().split("T")[0]);
    url.searchParams.set("size", String(limit));
    if (offset > 0) url.searchParams.set("from", String(offset));

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `Contracts Finder API returned ${response.status}: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as AnyRecord;

    const rawItems: unknown[] = Array.isArray(payload.releases)
      ? payload.releases
      : Array.isArray(payload.notices)
        ? (payload.notices as AnyRecord[]).flatMap((n) =>
            Array.isArray(n.releases) ? n.releases : [n],
          )
        : Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload)
            ? payload
            : [];

    // Infer hasMore from page fullness — don't rely on API returning a next-link
    const hasMore = rawItems.length >= limit;
    const nextOffset = offset + rawItems.length;

    return {
      sourceName: "contracts-finder",
      rawItems,
      nextCursor: hasMore ? String(nextOffset) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedOpportunity[]> {
    try {
      return [normalizeOcdsRelease(raw, "contracts-finder")];
    } catch {
      return [];
    }
  },
};
