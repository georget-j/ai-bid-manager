import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// Foundation Scotland — Scotland's community foundation, administering ~125
// currently-available funds (community-benefit funds from wind farms, family
// trusts, corporate funds). The /apply-for-funding/funding-available listing is
// server-rendered Drupal HTML (no JS needed) with a 0-indexed ?page=N pager
// (12 cards/page, ~11 pages). There is no public API. Detail pages carry a
// clean labelled table (Grant size / Area / Key dates with "Application
// deadline:" rows) plus About / Purpose / Who can apply? prose sections.
//
// fetchSince walks one listing page per call (cursor = JSON {page}, 0-indexed
// to match Drupal's pager), then fetches each fund's detail page and stores
// its content region as the raw payload (raw before normalisation, per repo
// policy) — normalize stays pure. The region is the page's own fund markup
// verbatim except for a documented scrub of Drupal's per-cache-rebuild
// js-view-dom-id tokens, which exists only to keep the content hash stable
// for dedupe. Fund URLs come in TWO forms — canonical
// /apply-for-funding/funding-available/<slug> and bare /<slug> aliases — so
// the slug (last path segment) is the stable source notice id.
//
// Deadlines come in two shapes: dated dd/mm/yy rows ("11/03/26") → a real
// deadline (the next upcoming one) and status "open"; recurring no-year rows
// ("15th March, 15th June, …") → an always-cycling fund, mapped "rolling".
//
// Guardrails: public charity-regulated funder data, plain identifying
// User-Agent ("UKBidIntelligence/1.0 …" — some WAFs 403 the "Mozilla/5.0
// (compatible; …)" form), 150ms pacing, 20s timeouts, structured public
// fields only, no personal data.

const BASE_URL = "https://www.foundationscotland.org.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 14; // safety cap on detail fetches per listing page (12 listed)

// Raw payload stored per fund: the detail page's content region plus the
// stable slug (= source notice id; `id` lets the sync engine's extractGrantId
// / delisting prune see it) and the listing-card fields as fallbacks if the
// detail fetch fails or the template changes.
export interface FoundationScotlandFundRaw {
  id: string; // = slug (last URL path segment), the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  summary: string | null; // listing-card summary text
  area: string | null; // listing-card "Area:" text, e.g. "Highland"
  grantSize: string | null; // listing-card "Grant size:" text, e.g. "Up to £10,000"
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
    throw new Error(`Foundation Scotland ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities foundationscotland.org.uk pages actually use. */
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

/** Listing URL (Drupal pager is 0-indexed; page 0 has no param). */
export function listingUrl(page: number): string {
  return page <= 0
    ? `${BASE_URL}/apply-for-funding/funding-available`
    : `${BASE_URL}/apply-for-funding/funding-available?page=${page}`;
}

/** Parse the JSON {page} cursor (resilient: bare numbers and garbage → page 0). */
export function parseCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (typeof parsed === "number" && parsed >= 0) return Math.floor(parsed);
    if (parsed && typeof parsed === "object") {
      const page = Number((parsed as { page?: unknown }).page);
      if (Number.isFinite(page) && page >= 0) return Math.floor(page);
    }
  } catch {
    const n = Number(cursor);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

export interface FoundationScotlandCard {
  url: string;
  slug: string;
  title: string | null;
  summary: string | null;
  area: string | null;
  grantSize: string | null;
}

/** Value text of a `<li><strong>Label:</strong> value</li>` list-meta row. */
function labelledRow(html: string, label: string): string | null {
  const re = new RegExp(
    `<li><strong>\\s*${label}\\s*:?\\s*</strong>\\s*([\\s\\S]*?)</li>`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return null;
  return stripTags(m[1]) || null;
}

/**
 * Extract fund cards from a listing page. Cards are `views-row` blocks: an
 * `<h3 class="title h2"><a href="…">` title link (the href is ABSOLUTE and
 * comes in two forms — canonical /apply-for-funding/funding-available/<slug>
 * and bare /<slug> aliases), a `list-meta` Area/Grant size list, and an
 * `editor summary` div. Scoping to the views-row blocks keeps the site menu's
 * own fund links out.
 */
export function extractFundCards(html: string): FoundationScotlandCard[] {
  const out: FoundationScotlandCard[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<div class="views-row">/).slice(1);
  for (const block of blocks) {
    const link = block.match(
      /<h3 class="title[^"]*">\s*<a href="https:\/\/www\.foundationscotland\.org\.uk(\/[a-z0-9/_-]+?)\/?">([\s\S]*?)<\/a>/i,
    );
    if (!link) continue;
    const [, path, titleHtml] = link;
    const slug = path.split("/").filter(Boolean).pop() ?? "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const summaryIdx = block.indexOf('<div class="editor summary">');
    out.push({
      url: `${BASE_URL}${path}`,
      slug,
      title: stripTags(titleHtml) || null,
      summary:
        summaryIdx === -1
          ? null
          : stripTags(block.slice(summaryIdx)).slice(0, 1000) || null,
      area: labelledRow(block, "Area"),
      grantSize: labelledRow(block, "Grant size"),
    });
  }
  return out;
}

/** True when the Drupal pager has a next-page link. */
export function hasNextListingPage(html: string): boolean {
  return /pager__item--next/.test(html) && /rel="next"/.test(html);
}

/**
 * The fund content region of a detail page: from the `<div class="container">`
 * holding the fund's `<h1 class="heading-primary …">` through to the footer.
 * One documented scrub keeps the stored payload's content hash stable across
 * Drupal cache rebuilds so dedupe works: the views blocks at the foot of the
 * page ("Fund news" / "Previously funded projects") carry randomised
 * js-view-dom-id / views_dom_id tokens. Everything else is the page's own
 * markup, verbatim. Falls back to the full (scrubbed) HTML when the template
 * no longer matches.
 */
export function fundContentRegion(html: string): string {
  let region = html;
  const h1 = html.indexOf('<h1 class="heading-primary');
  if (h1 !== -1) {
    const start = html.lastIndexOf('<div class="container">', h1);
    region = html.slice(start === -1 ? h1 : start);
    const end = region.indexOf("<footer");
    if (end !== -1) region = region.slice(0, end);
  }
  return region
    .replace(/js-view-dom-id-[a-f0-9]+/gi, "js-view-dom-id-scrubbed")
    .replace(/views_dom_id:[a-f0-9]+/gi, "views_dom_id:scrubbed");
}

const MONTHS_RE =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * ISO dates from a deadline row's free text. Handles the site's two DATED
 * forms — "11/03/26" (dd/mm/yy or dd/mm/yyyy) and "16 January 2026" — and
 * returns [] for the recurring no-year form ("15th March, 15th June, …"),
 * which deliberately parses as undated (noon UTC; date resolution).
 */
export function parseDeadlineDates(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = slashRe.exec(text)) !== null) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(mo) - 1, Number(d), 12));
    if (!Number.isNaN(date.getTime()) && date.getUTCMonth() === Number(mo) - 1)
      out.push(date.toISOString());
  }
  const wordRe = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS_RE})\\.?,?\\s+(\\d{4})\\b`,
    "gi",
  );
  while ((m = wordRe.exec(text)) !== null) {
    const month = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    const date = new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12));
    if (!Number.isNaN(date.getTime())) out.push(date.toISOString());
  }
  return out.sort();
}

/** All "Application deadline(s):" row values from the key-dates table. */
export function deadlineRowTexts(html: string): string[] {
  const out: string[] = [];
  const re =
    /<td>\s*Application deadlines?\s*:?\s*<\/td>\s*<td>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text) out.push(text);
  }
  return out;
}

/** The earliest deadline that is still in the future (else null). */
export function nextUpcoming(
  isoDates: string[],
  now: Date = new Date(),
): string | null {
  const future = isoDates.filter((d) => new Date(d) > now).sort();
  return future[0] ?? null;
}

/** Value cell of a `<td><strong>Label</strong></td><td>…</td>` table row. */
function tableValue(html: string, label: string): string | null {
  const re = new RegExp(
    `<td>\\s*<strong>\\s*${label}\\s*</strong>\\s*</td>\\s*<td>([\\s\\S]*?)</td>`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return null;
  return stripTags(m[1]) || null;
}

/** Parse a £-amount range: "Up to £10,000" → max only, "£300 to £20,000". */
export function parseAmountRange(text: string | null): {
  min: number | null;
  max: number | null;
} {
  if (!text) return { min: null, max: null };
  const amounts: number[] = [];
  const re = /£\s?([\d,.]+)\s*(million|billion|bn|m|k)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && amounts.length < 2) {
    const n = Number(m[1].replace(/,/g, "").replace(/\.$/, ""));
    if (Number.isNaN(n)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult =
      unit === "billion" || unit === "bn"
        ? 1_000_000_000
        : unit === "million" || unit === "m"
          ? 1_000_000
          : unit === "k"
            ? 1_000
            : 1;
    amounts.push(n * mult);
  }
  if (amounts.length === 0) return { min: null, max: null };
  if (amounts.length === 1) return { min: null, max: amounts[0] };
  return {
    min: Math.min(amounts[0], amounts[1]),
    max: Math.max(amounts[0], amounts[1]),
  };
}

/**
 * Map a fund's "Area" onto regions. Funds are Scottish local-authority-scoped
 * ("Highland", "South Ayrshire", …) → ["Scotland", area]; a Scotland-wide fund
 * → ["Scotland"]; the odd International fund (charities working OUTSIDE the
 * UK) → no UK region.
 */
export function parseRegions(area: string | null): string[] {
  if (!area) return ["Scotland"];
  if (/^international$/i.test(area)) return [];
  if (
    /^(?:all of )?scotland$/i.test(area) ||
    /\bUK\b|United Kingdom/i.test(area)
  ) {
    return ["Scotland"];
  }
  return ["Scotland", area];
}

/** Text of an `<h2>Label</h2> …` editor section (up to the next h2). */
function sectionText(html: string, labelRe: string): string | null {
  const re = new RegExp(
    `<h2[^>]*>\\s*${labelRe}\\s*</h2>([\\s\\S]*?)(?=<h2[\\s>]|$)`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return null;
  return stripTags(m[1]).slice(0, 4000) || null;
}

/** Map parsed deadlines onto the grant vocabulary. */
function mapStatus(deadlineAt: string | null): GrantStatus {
  // The listing only shows currently-available funds; a dated upcoming deadline
  // makes it a dated call, otherwise (recurring no-year deadlines, "applications
  // considered at any time") it is an always-cycling rolling fund.
  return deadlineAt ? "open" : "rolling";
}

/** The fund's Salesforce application-portal link, when an apply button exists. */
function parseApplicationUrl(html: string): string | null {
  // The "Apply here" button targets the form loader directly; the apply prose
  // also links the portal's generic login page ("resume an application") —
  // the form loader is the one that means "apply", so it must win.
  const m = html.match(
    /href="(https:\/\/foundationscotland[a-z0-9]*\.my\.site\.com\/portal\/s\/applicationformloader[^"]*)"/i,
  );
  return m ? decodeEntities(m[1]) : null;
}

export const foundationScotlandConnector: GrantSourceConnector = {
  sourceName: "foundation-scotland",
  displayName: "Foundation Scotland",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true, // a complete walk of the available-funds listing

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = parseCursor(params.cursor);
    if (page > 0) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const cards = extractFundCards(listHtml).slice(0, cap);

    const items: FoundationScotlandFundRaw[] = [];
    for (const card of cards) {
      const base = {
        id: card.slug,
        slug: card.slug,
        url: card.url,
        title: card.title,
        summary: card.summary,
        area: card.area,
        grantSize: card.grantSize,
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({
          ...base,
          html: fundContentRegion(await getHtml(card.url)),
        });
      } catch {
        // Detail fetch failed — keep the listing-card stub so it still ingests
        // minimally and the delisting prune still sees its notice id.
        items.push({ ...base, html: null });
      }
    }

    const hasMore = hasNextListingPage(listHtml) && cards.length > 0;
    return {
      sourceName: "foundation-scotland",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<FoundationScotlandFundRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.split("/").filter(Boolean).pop() ?? "")) ||
      "";
    if (!slug || /foundationscotland\.org\.uk$/i.test(slug)) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/apply-for-funding/funding-available/${slug}`;

    // Defensive: prefer the detail page, then the listing-card fields captured
    // at fetch time — if the template has changed we still return a grant with
    // whatever parsed.
    const title =
      stripTags(
        html.match(/<h1 class="heading-primary[^"]*">([\s\S]*?)<\/h1>/i)?.[1] ??
          "",
      ) ||
      r.title ||
      null;
    if (!title) return [];

    const grantSizeText =
      tableValue(html, "Grant size") ?? (r.grantSize || null);
    const { min: amountMin, max: amountMax } = parseAmountRange(grantSizeText);

    const areaText =
      stripTags(
        html.match(/<div class="area">([\s\S]*?)<\/div>/i)?.[1] ?? "",
      ) ||
      r.area ||
      null;

    // Dated deadline rows → the next upcoming one; recurring no-year rows
    // ("15th March, 15th June, …") parse as undated → rolling.
    const deadlineAt = nextUpcoming(
      deadlineRowTexts(html).flatMap((t) => parseDeadlineDates(t)),
    );

    const eligibilityParts = [
      sectionText(html, "Who can apply\\??"),
      sectionText(html, "Additional criteria"),
    ].filter((s): s is string => Boolean(s));

    return [
      {
        sourceName: "foundation-scotland",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: parseApplicationUrl(html) ?? sourceUrl,
        title,
        description:
          sectionText(html, "About this fund") ?? (r.summary || null),
        funderName: "Foundation Scotland",
        funderId: null,
        funderRegion: "Scotland",
        fundingType: "grant",
        amountMin,
        amountMax,
        currency: "GBP",
        openAt: null,
        deadlineAt,
        status: mapStatus(deadlineAt),
        themes: [],
        sectors: [],
        regions: parseRegions(areaText),
        eligibilityText:
          eligibilityParts.length > 0
            ? eligibilityParts.join("\n\n").slice(0, 4000)
            : null,
        eligibleOrgTypes: [], // mostly constituted not-for-profits — stated per fund
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: null, // the site states no publication date
        rawJson: raw,
      },
    ];
  },
};
