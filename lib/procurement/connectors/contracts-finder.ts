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

// A descriptive UA — gov.uk fronting (CDN/WAF) can 400 requests from datacentre
// IPs that send no/blank User-Agent. Overridable via env.
const USER_AGENT =
  process.env.PROCUREMENT_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });

    // Contracts Finder rate-limits with HTTP 403 (not 429); 429 may also occur.
    const rateLimited = res.status === 429 || res.status === 403;
    if (!rateLimited) return res;
    if (attempt === maxRetries) return res; // let caller handle the final status

    const retryAfter = res.headers.get("Retry-After");
    const delay = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000)
      : Math.min(1_500 * 2 ** attempt, 30_000); // 1.5 s, 3 s, 6 s, 12 s

    await sleep(delay);
  }
  // unreachable but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
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
            // The OCDS Search API paginates with `limit` (max/default 100; the old
            // `size` param is silently ignored). It 400s anything over 100, so
            // clamp regardless of a misconfigured PROCUREMENT_SYNC_LIMIT.
            url.searchParams.set("limit", String(Math.min(limit, 100)));
            return url.toString();
          })();

    const response = await fetchWithRetry(fetchUrl);

    if (!response.ok) {
      // CF returns a 4xx once a cursor runs past the end of the result set. When
      // paging (cursor is the opaque next URL), treat that as "no more data"
      // rather than a hard failure; a first-page error (no cursor) is real.
      const paging = Boolean(cursor && cursor.startsWith("http"));
      if (paging && response.status >= 400 && response.status < 500) {
        return {
          sourceName: "contracts-finder",
          rawItems: [],
          nextCursor: null,
          fetchedAt: new Date().toISOString(),
          hasMore: false,
        };
      }
      // Capture the body — the WAF/error reason lives here, not in statusText.
      const body = await response.text().catch(() => "");
      const detail = body
        ? ` — ${body.slice(0, 200).replace(/\s+/g, " ")}`
        : "";
      throw new Error(
        `Contracts Finder API returned ${response.status}: ${response.statusText}${detail}`,
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

    // The presence of links.next signals more pages — but stop if a page came
    // back empty even with a stale next link.
    const nextCursor: string | null =
      rawItems.length > 0 ? (payload.links?.next ?? null) : null;

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
