import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// Funding Scotland (funding.scot) — SCVO's funder database: ~788 currently-open
// funds (charitable trusts, lottery, corporate and public funders), reviewed
// daily by SCVO staff. The /search listing is fully server-rendered HTML (no
// public API) with real ?page=N pagination and GET filters; fund detail pages
// carry title, funder, description, "Who can apply", "When to apply", funding
// type, cost type, geography, and activity/beneficiary taxonomies.
//
// Anonymous pagination is clamped to 20 pages (~200 funds) per query, so a
// single walk cannot enumerate all ~788 open funds. We walk TWO deterministic
// slices — sort=alphabetical_asc then sort=alphabetical_desc (both verified
// server-side) — covering up to ~400 distinct funds per full pass. Because the
// walk is partial, listsAllOpenCalls stays FALSE (the delisting prune must not
// mass-close funds we simply never reached).
//
// fetchSince walks one listing page per call (cursor = JSON {slice, page}),
// then fetches each fund's detail page and stores its content region as the
// raw payload (raw before normalisation, per repo policy) — normalize stays
// pure. The stored region is the page's fund markup verbatim except for two
// documented scrubs that exist only to keep the content hash stable for dedupe
// (see stableContentRegion). Award min/max are "Premium information" for
// anonymous visitors — they normalise to null unless a real £ figure appears.
//
// Guardrails: robots.txt allows * (Cloudflare Content-Signal: search=yes,
// ai-train=no — we index for search/matching, never for model training, and we
// attribute SCVO in the source display name), plain identifying User-Agent
// ("UKBidIntelligence/1.0 ..." — some WAFs 403 the "Mozilla/5.0 (compatible;"
// form), 150ms pacing, 20s timeouts, structured public fields only, no
// personal data (funder contact emails are scrubbed from the stored raw).

const BASE_URL = "https://funding.scot";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 12; // safety cap on detail fetches per listing page (10 listed)
const MAX_PAGES_PER_SLICE = 20; // funding.scot clamps anonymous pagination at page 20

export type FundingScotlandSlice = "asc" | "desc";

// Raw payload stored per fund: the detail page's fund content region plus the
// stable Salesforce fund id (= source notice id; `id` lets the sync engine's
// extractGrantId see it) and the listing-card fields as fallbacks if the
// detail fetch fails or the template changes.
export interface FundingScotlandFundRaw {
  id: string; // Salesforce fund id, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  snippet: string | null; // listing-card description snippet
  statusText: string | null; // listing-card status chip, e.g. "Currently open"
  nextDeadlineText: string | null; // listing-card "Next deadline: 5 Oct 2026"
  html: string | null; // detail-page content region (null when the fetch failed)
  // No fetch timestamp in the payload: raw_grant_notices.fetched_at records it,
  // and a timestamp here would change the content hash every run, defeating
  // dedupe (the sync's nightly steady state is "everything was a duplicate").
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
    throw new Error(`Funding Scotland ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities funding.scot pages actually use. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&pound;/g, "£")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Listing URL for a slice: alphabetical asc/desc, &page=N from page 2. */
export function listingUrl(slice: FundingScotlandSlice, page: number): string {
  const sort = slice === "desc" ? "alphabetical_desc" : "alphabetical_asc";
  return page <= 1
    ? `${BASE_URL}/search?sort=${sort}`
    : `${BASE_URL}/search?sort=${sort}&page=${page}`;
}

/** Parse the JSON {slice, page} cursor (resilient: garbage → asc page 1). */
export function parseCursor(cursor?: string | null): {
  slice: FundingScotlandSlice;
  page: number;
} {
  const fallback = { slice: "asc" as const, page: 1 };
  if (!cursor) return fallback;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { slice?: unknown; page?: unknown };
      const page = Number(obj.page);
      return {
        slice: obj.slice === "desc" ? "desc" : "asc",
        page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
      };
    }
  } catch {
    // fall through
  }
  return fallback;
}

export interface FundingScotlandCard {
  id: string;
  slug: string;
  url: string;
  title: string | null;
  snippet: string | null;
  statusText: string | null;
  nextDeadlineText: string | null;
}

/**
 * Extract fund cards from a listing page. Cards are `list-item` blocks (the
 * first card carries extra data-step tour attributes before its class): a
 * status chip, an `<h4><a href="/funds/<sfId>/<slug>?page=N">` title link, a
 * description `<p>`, and sometimes a "Next deadline: …" line. Splitting on the
 * card class keeps the filter sidebar and footer out; the dropdown menu's own
 * /funds links sit before the h4 so the per-block h4 match ignores them.
 */
export function extractFundCards(html: string): FundingScotlandCard[] {
  const out: FundingScotlandCard[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/class="list-item /).slice(1);
  for (const block of blocks) {
    const link = block.match(
      /<h4>\s*<a href="\/funds\/([A-Za-z0-9]{15,18})\/([a-z0-9][a-z0-9-]*)[^"]*">([\s\S]*?)<\/a>\s*<\/h4>/,
    );
    if (!link) continue;
    const [, id, slug, titleHtml] = link;
    if (seen.has(id)) continue;
    seen.add(id);
    const snippet = block.match(/<\/h4>\s*<p>\s*([\s\S]*?)<\/p>/);
    const chip = block.match(/<\/figure>\s*([\s\S]*?)<\/span>/);
    const deadline = block.match(/Next deadline:\s*([^<]+)/);
    out.push({
      id,
      slug,
      url: `${BASE_URL}/funds/${id}/${slug}`,
      title: stripTags(titleHtml) || null,
      snippet: snippet ? stripTags(snippet[1]) || null : null,
      statusText: chip ? stripTags(chip[1]) || null : null,
      nextDeadlineText: deadline ? stripTags(deadline[1]) || null : null,
    });
  }
  return out;
}

/** True when the pagination's next-page button has a real (non-disabled) link. */
export function hasNextListingPage(html: string): boolean {
  const m = html.match(/next-page">\s*<a href="([^"]*)"/);
  return Boolean(m && m[1]);
}

/**
 * The fund content region of a detail page: from the fund header (status chip
 * + bare `<h1>` — site-chrome h1s all carry attributes) through the tab panels
 * and funder block, ending before Cloudflare's trailing scripts. Two scrubs
 * keep the stored payload's content hash stable across fetches so dedupe works
 * (without them every nightly run re-stores every fund):
 *   1. "Last reviewed about N hours ago" is relative to fetch time — the
 *      volatile tail is dropped.
 *   2. Cloudflare email-protection tokens are randomised per response (and are
 *      personal contact data we don't want in raw storage) — scrubbed.
 * Everything else is the page's own markup, verbatim. Falls back to the full
 * (scrubbed) HTML when the template no longer matches.
 */
export function stableContentRegion(html: string): string {
  let region = html;
  const h1 = html.indexOf("<h1>");
  if (h1 !== -1) {
    const start = html.lastIndexOf('<div class="container">', h1);
    region = html.slice(start === -1 ? h1 : start);
    const end = region.indexOf("<script data-cfasync");
    if (end !== -1) region = region.slice(0, end);
  }
  return region
    .replace(/Last reviewed about[^<]*/gi, "Last reviewed ")
    .replace(
      /<a href="\/cdn-cgi\/l\/email-protection#[^"]*"[^>]*>[\s\S]*?<\/a>/g,
      "[email scrubbed]",
    );
}

const MONTHS_RE =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

/**
 * ISO date from the site's free-text date forms: "5 Oct 2026",
 * "Monday, 5th October, 2026", "16 July 2026" (noon UTC; date resolution).
 */
export function parseFreeTextDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(
    new RegExp(
      `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS_RE})\\.?,?\\s+(\\d{4})`,
      "i",
    ),
  );
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2].slice(0, 3)} ${m[3]} 12:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Text of an `<h3>Label</h3> …` section in the fund_details panel. */
function sectionChunk(html: string, label: string): string | null {
  const re = new RegExp(`<h3>\\s*${label}\\s*</h3>([\\s\\S]*?)(?=<h3|$)`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
}

/** Value of a `<dt>Label:</dt><dd>…</dd>` row (e.g. Type of funding). */
function dlValue(html: string, label: string): string | null {
  const re = new RegExp(
    `<dt>\\s*${label}:?\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}

/** Chip texts after a `<strong>Label:</strong>` line (taxonomy links). */
function chipTexts(html: string, label: string): string[] {
  const re = new RegExp(
    `<strong>\\s*${label}\\s*</strong>([\\s\\S]*?)</p>`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return [];
  const out: string[] = [];
  const chipRe = /class="chip">([^<]+)</g;
  let c: RegExpExecArray | null;
  while ((c = chipRe.exec(m[1])) !== null) {
    const text = stripTags(c[1]);
    if (text) out.push(text);
  }
  return out;
}

/** Parse a £ amount ("£25,000", "£2.5 million") — premium labels have none. */
function parseAmount(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/£\s?([\d,.]+)\s*(million|billion|bn|m|k)?\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "").replace(/\.$/, ""));
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "billion" || unit === "bn") return n * 1_000_000_000;
  if (unit === "million" || unit === "m") return n * 1_000_000;
  if (unit === "k") return n * 1_000;
  return n;
}

/** The fund's "Details" prose, minus the premium banner and taxonomy lines. */
function parseDescription(html: string): string | null {
  const chunk = sectionChunk(html, "Details");
  if (!chunk) return null;
  let end = chunk.length;
  for (const marker of ["label label-warning", "<strong>Geographical"]) {
    const i = chunk.indexOf(marker);
    if (i !== -1 && i < end) end = i;
  }
  // Back off to the start of the <p>/<span> that contains the marker.
  const cut = chunk.slice(0, end).replace(/<(?:p|span)[^>]*>?\s*$/i, "");
  return stripTags(cut).slice(0, 4000) || null;
}

/** Map geography chip texts to region names ("UK" → "United Kingdom"). */
export function parseRegions(chips: string[]): string[] {
  return chips.map((c) => (/^UK$/i.test(c) ? "United Kingdom" : c));
}

/** Map the status chip + parsed deadline onto the grant vocabulary. */
function mapStatus(
  statusText: string | null,
  deadlineAt: string | null,
): GrantStatus {
  const s = (statusText ?? "").toLowerCase();
  if (s.includes("closed")) return "closed";
  if (s.includes("soon")) return "forthcoming"; // "Opening Soon"
  // "Currently open": a stated deadline makes it a dated call; otherwise it's
  // "Open now, no published deadlines" — a rolling fund, the common case.
  return deadlineAt ? "open" : "rolling";
}

/** The fund_contact tab's funder website link (first title="Website" row). */
function parseApplicationUrl(html: string): string | null {
  const m = html.match(
    /title="Website"[\s\S]{0,300}?<a href="([^"]+)"[^>]*target="_blank"/,
  );
  return m ? decodeEntities(m[1]) : null;
}

export const fundingScotlandConnector: GrantSourceConnector = {
  sourceName: "funding-scotland",
  displayName: "Funding Scotland (SCVO)",
  baseUrl: BASE_URL,
  // Anonymous pagination is clamped to 20 pages per query, so even the two
  // alphabetical slices cover only ~400 of ~788 open funds — a complete run is
  // NOT the source's whole open set, and the delisting prune must stay off.
  listsAllOpenCalls: false,

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const { slice, page } = parseCursor(params.cursor);
    if (page > 1 || slice === "desc") await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(slice, page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const cards = extractFundCards(listHtml).slice(0, cap);

    const items: FundingScotlandFundRaw[] = [];
    for (const card of cards) {
      const base = {
        id: card.id,
        slug: card.slug,
        url: card.url,
        title: card.title,
        snippet: card.snippet,
        statusText: card.statusText,
        nextDeadlineText: card.nextDeadlineText,
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({
          ...base,
          html: stableContentRegion(await getHtml(card.url)),
        });
      } catch {
        // Detail fetch failed — keep the listing-card stub so it still ingests
        // minimally and retries via the hash dedupe next run.
        items.push({ ...base, html: null });
      }
    }

    // Walk: asc pages 1..20, then desc pages 1..20 (the second slice reaches
    // the funds the 20-page anonymous clamp hides from the first).
    const moreInSlice =
      cards.length > 0 &&
      hasNextListingPage(listHtml) &&
      page < MAX_PAGES_PER_SLICE;
    const nextCursor: string | null = moreInSlice
      ? JSON.stringify({ slice, page: page + 1 })
      : slice === "asc" && cards.length > 0
        ? JSON.stringify({ slice: "desc", page: 1 })
        : null;

    return {
      sourceName: "funding-scotland",
      rawItems: items,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: nextCursor !== null,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<FundingScotlandFundRaw>;
    const fromUrl =
      typeof r.url === "string"
        ? r.url.match(/\/funds\/([A-Za-z0-9]{15,18})(?:\/([a-z0-9-]+))?/)
        : null;
    const id =
      (typeof r.id === "string" && r.id) || (fromUrl ? fromUrl[1] : "");
    if (!id) return [];
    const slug = (typeof r.slug === "string" && r.slug) || (fromUrl?.[2] ?? "");
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/funds/${id}${slug ? `/${slug}` : ""}`;

    // Defensive: prefer the detail page, then the listing-card fields captured
    // at fetch time — if the template has changed we still return a grant with
    // whatever parsed.
    // Site-chrome h1s carry attributes; the fund title is the page's bare <h1>.
    const title =
      stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "") ||
      r.title ||
      null;
    if (!title) return [];

    const chip = html.match(/<\/figure>\s*([\s\S]*?)<\/span>/);
    const statusText = chip
      ? stripTags(chip[1]) || null
      : (r.statusText ?? null);

    const whenToApply = sectionChunk(html, "When to apply");
    const deadlineAt =
      parseFreeTextDate(whenToApply ? stripTags(whenToApply) : null) ??
      parseFreeTextDate(r.nextDeadlineText ?? null);

    const whoCanApply = sectionChunk(html, "Who can apply");
    const fundingTypeText = stripTags(
      dlValue(html, "Type of funding") ?? "",
    ).toLowerCase();
    const funderName =
      stripTags(
        html.match(/<h2 class="mx-1">\s*([\s\S]*?)\s*<\/h2>/)?.[1] ?? "",
      ) ||
      stripTags(html.match(/More information about ([^<]+)</)?.[1] ?? "") ||
      null;

    // The site's own heading typo is load-bearing: "Activites funded:".
    const themes = chipTexts(html, "Activit(?:i)?es funded:");
    const beneficiaries = chipTexts(html, "Beneficiaries funded:");

    return [
      {
        sourceName: "funding-scotland",
        sourceNoticeId: id,
        sourceUrl,
        applicationUrl: parseApplicationUrl(html) ?? sourceUrl,
        title,
        description: parseDescription(html) ?? (r.snippet || null),
        funderName,
        funderId: html.match(/\/funders\/([A-Za-z0-9]{15,18})\//)?.[1] ?? null,
        funderRegion: null, // SCVO lists Scottish, UK-wide and international funders
        fundingType: fundingTypeText.includes("loan")
          ? "loan"
          : fundingTypeText.includes("prize") ||
              fundingTypeText.includes("award")
            ? "award"
            : "grant",
        // Award sizes are "Premium information" for anonymous visitors — only a
        // real £ figure (rare, or quoted in prose) produces a number.
        amountMin: parseAmount(stripTags(dlValue(html, "Minimum") ?? "")),
        amountMax: parseAmount(stripTags(dlValue(html, "Maximum") ?? "")),
        currency: "GBP",
        openAt: null,
        deadlineAt,
        status: mapStatus(statusText, deadlineAt),
        themes,
        sectors: [],
        regions: parseRegions(chipTexts(html, "Geographical areas funded:")),
        eligibilityText: whoCanApply
          ? stripTags(whoCanApply).slice(0, 4000) || null
          : null,
        eligibleOrgTypes: [], // mostly VCSE — varies per fund, stated in eligibility
        matchFundingRequired: false,
        beneficiaries,
        documents: [],
        publishedAt: null, // SCVO publishes review recency, not a publication date
        rawJson: raw,
      },
    ];
  },
};
