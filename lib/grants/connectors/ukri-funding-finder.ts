import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// UKRI Funding Finder — OPEN funding opportunities across all nine UKRI councils
// (research grants, fellowships, programmes) at ukri.org/opportunity. There is NO
// public API (the WordPress REST API hides the opportunity post type and the pages
// embed no JSON), so this is polite HTML parsing of an OGL public-body site.
// The listing supports an open-status filter ordered by closing date and paginates
// via /opportunity/page/N/ (~12 pages, ~115 open opportunities). Each detail page
// (/opportunity/<slug>/) carries a GDS-style summary table (status, funders, funding
// type, total fund, min/max award, publication/opening/closing dates), a description
// and an eligibility summary in plain server-rendered HTML.
//
// fetchSince walks one listing page per call (cursor = JSON {page}), then fetches each
// opportunity's detail page and stores its FULL HTML as the raw payload (raw before
// normalisation, per repo policy) — normalize stays pure. Guardrails: official-source
// public open data (OGL), identifying User-Agent, polite pacing between requests,
// request timeouts, structured public fields only, no personal data.

const BASE_URL = "https://www.ukri.org";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between detail-page fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 12; // safety cap on detail fetches per listing page (10 listed)

// Raw payload stored per opportunity: the detail page's full HTML plus the stable
// slug (= source notice id; `id` lets the sync engine's extractGrantId / delisting
// prune see it) and the title from the listing as a fallback if the template changes.
export interface UkriOpportunityRaw {
  id: string; // = slug, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-page title (fallback when detail parse fails)
  html: string | null; // full detail-page HTML (null when the detail fetch failed)
  listedAt: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`UKRI Funding Finder ${res.status} for ${url}`);
  }
  return res.text();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/&#163;/g, "£")
    .replace(/&#8217;/g, "’")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Open-status listing URL, ordered by closing date (page 1 has no /page/ segment). */
export function listingUrl(page: number): string {
  const filters = "filter_status%5B0%5D=open&filter_order=closing_date";
  return page <= 1
    ? `${BASE_URL}/opportunity/?${filters}`
    : `${BASE_URL}/opportunity/page/${page}/?${filters}`;
}

/** Parse the JSON {page} cursor (resilient: bare numbers and garbage → page 1). */
export function parseCursor(cursor?: string | null): number {
  if (!cursor) return 1;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (typeof parsed === "number" && parsed >= 1) return Math.floor(parsed);
    if (parsed && typeof parsed === "object") {
      const page = Number((parsed as { page?: unknown }).page);
      if (Number.isFinite(page) && page >= 1) return Math.floor(page);
    }
  } catch {
    const n = Number(cursor);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return 1;
}

// Non-opportunity /opportunity/ paths that appear on listing pages.
const NON_OPPORTUNITY_SLUGS = new Set(["page", "feed"]);

/** Extract opportunity detail URLs (+ listing titles where present) from a listing page. */
export function extractOpportunityUrls(
  html: string,
): Array<{ url: string; slug: string; title: string | null }> {
  const out: Array<{ url: string; slug: string; title: string | null }> = [];
  const seen = new Set<string>();
  // Primary: the listing's titled entry links (rel="bookmark" anchors).
  const titledRe =
    /<a[^>]*href="https:\/\/www\.ukri\.org\/opportunity\/([a-z0-9][a-z0-9_-]*)\/?"[^>]*rel="bookmark"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = titledRe.exec(html)) !== null) {
    const [, slug, titleHtml] = m;
    if (NON_OPPORTUNITY_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      url: `${BASE_URL}/opportunity/${slug}/`,
      slug,
      title: stripTags(titleHtml) || null,
    });
  }
  // Fallback (template drift): any plain opportunity link not already captured.
  const plainRe =
    /href="https:\/\/www\.ukri\.org\/opportunity\/([a-z0-9][a-z0-9_-]*)\/"/g;
  while ((m = plainRe.exec(html)) !== null) {
    const slug = m[1];
    if (NON_OPPORTUNITY_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ url: `${BASE_URL}/opportunity/${slug}/`, slug, title: null });
  }
  return out;
}

/** True when the listing's pagination nav has a "next page" link. */
export function hasNextListingPage(html: string): boolean {
  return /class=["'][^"']*\bnext\b[^"']*page-numbers[^"']*["']/.test(html);
}

/** Value HTML of a summary-table row, e.g. summaryRow(html, "Closing date"). */
function summaryRow(html: string, label: string): string | null {
  const re = new RegExp(
    `<dt[^>]*>\\s*${label}\\s*:?\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}

/** ISO date from a summary-table cell: prefer <time datetime>, else "27 June 2026". */
function rowDate(ddHtml: string | null): string | null {
  if (!ddHtml) return null;
  const t = ddHtml.match(/datetime="([^"]+)"/);
  if (t) {
    // UKRI datetimes carry no zone ("2026-06-17T16:00:00" = UK time); treat as UTC
    // (at most an hour off during BST — fine for open/closed decisions).
    const v = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(t[1])
      ? `${t[1]}Z`
      : t[1];
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return parseUkDate(stripTags(ddHtml));
}

/** Extract "dd Month yyyy" from a human date string and return ISO (or null). */
function parseUkDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse £ amounts like "£110 million" / "£1.5m" / "£250,000" into a number. */
function parseAmount(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/£\s?([\d,.]+)\s*(billion|million|bn|m|k)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "billion" || unit === "bn") return n * 1_000_000_000;
  if (unit === "million" || unit === "m") return n * 1_000_000;
  if (unit === "k") return n * 1_000;
  return n;
}

/** Map the page's status flag ("Open" / "Upcoming" / "Closed") to a GrantStatus. */
function mapStatus(html: string): GrantStatus {
  const m = html.match(
    /class="[^"]*opportunity-status__flag[^"]*"[^>]*>\s*([^<]+)</i,
  );
  const flag = m ? m[1].trim().toLowerCase() : "";
  if (flag.startsWith("closed")) return "closed";
  if (flag.startsWith("upcoming")) return "forthcoming";
  if (flag.startsWith("open")) return "open";
  // We only crawl the open-filtered listing, so default open rather than unknown.
  return "open";
}

/** Title from the H1, minus the visually-hidden "Funding opportunity:" prefix. */
function parseTitle(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const inner = m[1].replace(
    /<span[^>]*govuk-visually-hidden[^>]*>[\s\S]*?<\/span>/gi,
    "",
  );
  return stripTags(inner) || null;
}

/** Description + eligibility summary from the page's description block. */
function parseDescription(html: string): {
  description: string | null;
  eligibilityText: string | null;
} {
  const start = html.indexOf('<div class="description">');
  if (start === -1) return { description: null, eligibilityText: null };
  const after = html.slice(start);
  const end = after.indexOf("</div><!-- .entry-content -->");
  const chunk = end === -1 ? after.slice(0, 8000) : after.slice(0, end);
  const elig = chunk.match(/<h2[^>]*>\s*Eligibility summary\s*<\/h2>/i);
  if (!elig || elig.index === undefined) {
    return { description: stripTags(chunk) || null, eligibilityText: null };
  }
  const before = chunk.slice(0, elig.index);
  const eligChunk = chunk.slice(elig.index + elig[0].length);
  const nextH2 = eligChunk.search(/<h2[^>]*>/i);
  return {
    description: stripTags(before) || null,
    eligibilityText:
      stripTags(nextH2 === -1 ? eligChunk : eligChunk.slice(0, nextH2)) || null,
  };
}

/** The "Start application" button's destination, when present. */
function parseApplicationUrl(html: string): string | null {
  const m = html.match(
    /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*id="analytics-start-application"/i,
  );
  return m ? m[1] : null;
}

export const ukriFundingFinderConnector: GrantSourceConnector = {
  sourceName: "ukri-funding-finder",
  displayName: "UKRI Funding Finder",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true, // a complete walk of the open-filtered listing

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = parseCursor(params.cursor);
    if (page > 1) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const stubs = extractOpportunityUrls(listHtml).slice(0, cap);

    const items: UkriOpportunityRaw[] = [];
    for (const stub of stubs) {
      const base = {
        id: stub.slug,
        slug: stub.slug,
        url: stub.url,
        title: stub.title,
        listedAt: new Date().toISOString(),
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({ ...base, html: await getHtml(stub.url) });
      } catch {
        // Detail fetch failed — keep the stub (listing title only) so it still
        // ingests minimally and the delisting prune still sees its notice id.
        items.push({ ...base, html: null });
      }
    }

    const hasMore = hasNextListingPage(listHtml) && stubs.length > 0;
    return {
      sourceName: "ukri-funding-finder",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<UkriOpportunityRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/opportunity\/([a-z0-9_-]+)\/?/)?.[1] ?? "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/opportunity/${slug}/`;

    // Defensive: every field below is optional — if the template has changed we
    // still return a grant with whatever parsed (title falls back to the listing).
    const title = parseTitle(html) ?? (r.title || null);
    if (!title) return [];

    const funders = summaryRow(html, "Funders");
    const fundingTypeText = stripTags(summaryRow(html, "Funding type") ?? "");
    const openAt = rowDate(summaryRow(html, "Opening date"));
    const deadlineAt = rowDate(summaryRow(html, "Closing date"));
    const publishedAt = rowDate(summaryRow(html, "Publication date"));
    const amountMin = parseAmount(
      stripTags(summaryRow(html, "Minimum award") ?? ""),
    );
    const amountMax =
      parseAmount(stripTags(summaryRow(html, "Maximum award") ?? "")) ??
      parseAmount(stripTags(summaryRow(html, "Total fund") ?? ""));
    const { description, eligibilityText } = parseDescription(html);
    const lcType = fundingTypeText.toLowerCase();

    return [
      {
        sourceName: "ukri-funding-finder",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: parseApplicationUrl(html) ?? sourceUrl,
        title,
        description,
        funderName: funders ? stripTags(funders) || null : null,
        funderId: null,
        funderRegion: "United Kingdom",
        fundingType: lcType.includes("loan")
          ? "loan"
          : lcType.includes("prize")
            ? "prize"
            : "grant",
        amountMin,
        amountMax,
        currency: "GBP",
        openAt,
        deadlineAt,
        status: mapStatus(html),
        themes: [],
        sectors: [],
        regions: ["United Kingdom"],
        eligibilityText,
        eligibleOrgTypes: [], // varies per opportunity — no hard-stop
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: publishedAt ?? openAt,
        rawJson: raw,
      },
    ];
  },
};
