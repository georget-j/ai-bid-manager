import type {
  ProcurementSourceConnector,
  FetchSinceParams,
  SourceFetchResult,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";

const BASE_URL =
  process.env.FIND_TENDER_BASE_URL ?? "https://www.find-tender.service.gov.uk";

// A descriptive UA — gov.uk fronting (CDN/WAF) can 400 requests from datacentre
// IPs that send no/blank User-Agent. Overridable via env.
const USER_AGENT =
  process.env.PROCUREMENT_USER_AGENT ??
  "Mozilla/5.0 (compatible; UKBidIntelligence/1.0; +https://ai-rfp-agent-ten.vercel.app)";

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
    // The FTS OCDS API returns an opaque cursor URL in links.next. On subsequent
    // pages we must fetch that URL DIRECTLY — re-sending it as a ?cursor= param
    // produces a malformed request the API rejects with 400.
    const fetchUrl =
      cursor && cursor.startsWith("http")
        ? cursor
        : (() => {
            const url = new URL(`${BASE_URL}/api/1.0/ocdsReleasePackages`);
            url.searchParams.set("updatedFrom", from.toISOString());
            url.searchParams.set("updatedTo", to.toISOString());
            // The API hard-caps `limit` at 100 and 400s anything larger, so clamp
            // regardless of a misconfigured PROCUREMENT_SYNC_LIMIT.
            url.searchParams.set("limit", String(Math.min(limit, 100)));
            return url.toString();
          })();

    const response = await fetch(fetchUrl, {
      headers: {
        Accept: "application/json",
        // Identify the client — some gov.uk WAFs reject requests with no/bot UA.
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      // These OCDS feeds return a 4xx once a cursor runs past the end of the
      // result set. When paging (cursor set), treat that as "no more data"
      // rather than a hard failure; a first-page error (no cursor) is real.
      if (cursor && response.status >= 400 && response.status < 500) {
        return {
          sourceName: "find-tender",
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
        `Find a Tender API returned ${response.status}: ${response.statusText}${detail}`,
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

    // Stop when a page is empty even if a stale next link is present.
    const nextCursor: string | null =
      rawItems.length > 0
        ? (payload.nextCursor ?? payload.links?.next ?? null)
        : null;

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
