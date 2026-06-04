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
    // The CF OCDS API returns an opaque cursor URL in links.next.
    // On subsequent pages, use that URL directly rather than rebuilding it —
    // the cursor encodes server-side state (publishedTo timestamp + offset)
    // that cannot be reconstructed from a numeric offset.
    const fetchUrl =
      cursor && cursor.startsWith("http")
        ? cursor
        : (() => {
            const url = new URL(`${BASE_URL}/Published/Notices/OCDS/Search`);
            url.searchParams.set(
              "postedFrom",
              from.toISOString().split("T")[0],
            );
            url.searchParams.set("postedTo", to.toISOString().split("T")[0]);
            url.searchParams.set("size", String(limit));
            return url.toString();
          })();

    const response = await fetch(fetchUrl, {
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

    // The presence of links.next is the authoritative signal that more pages exist.
    const nextCursor: string | null = payload.links?.next ?? null;

    return {
      sourceName: "contracts-finder",
      rawItems,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: Boolean(nextCursor),
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
