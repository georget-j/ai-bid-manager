import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// NI Business Info (nibusinessinfo.co.uk) — Invest Northern Ireland's official
// business support finder. The /business-support listing is a server-rendered
// Drupal view with GET facet filters; we walk the "Grant" support-type facet
// (field_support_type_target_id 239 = Grant, ~80 schemes over 2 pages,
// 0-indexed ?page=N). Detail pages carry title, summary, an explicit
// closing-date block, "Who it is for" eligibility (region, size, sector),
// "Support you can get" (amounts in prose, e.g. "Grants from £5,000 to
// £25,000"), the delivering organisation, and a Next Steps link to the
// scheme's own site. This fills the Northern Ireland regional coverage gap.
//
// fetchSince walks one listing page per call (cursor = JSON {page}, 0-indexed
// to match Drupal's pager), then fetches each scheme's detail page and stores
// its node content region as the raw payload (raw before normalisation, per
// repo policy) — normalize stays pure. The region carries the whole scheme
// record verbatim and excludes the page chrome whose Drupal form_build_id
// changes per response (which would defeat content-hash dedupe).
//
// The Grant-facet walk IS the source's complete current set of grant schemes
// (verified: page 1 has no further next-link), so listsAllOpenCalls is true
// and the sync may prune schemes Invest NI delists. The facet mixes grants,
// vouchers and reliefs — normalize classifies fundingType lightly.
//
// Guardrails: official public-body data, stock-Drupal robots.txt does not
// disallow /business-support, plain identifying User-Agent, 150ms pacing,
// 20s timeouts, structured public fields only, no personal data.

const BASE_URL = "https://www.nibusinessinfo.co.uk";
const GRANT_FACET = "field_support_type_target_id%5B239%5D=239"; // 239 = Grant
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 50; // a Drupal listing page lists 50 schemes

// Raw payload stored per scheme: the detail page's node content region plus
// the stable slug (= source notice id; `id` lets the sync engine's
// extractGrantId / delisting prune see it) and the listing-card fields as
// fallbacks if the detail fetch fails or the template changes.
export interface NiBusinessSupportRaw {
  id: string; // = slug, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  summary: string | null; // listing-card one-line description
  html: string | null; // detail-page node region (null when the fetch failed)
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
    throw new Error(`NI Business Info ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities nibusinessinfo.co.uk pages actually use. */
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

/** Grant-facet listing URL (Drupal pager is 0-indexed; page 0 has no param). */
export function listingUrl(page: number): string {
  return page <= 0
    ? `${BASE_URL}/business-support?${GRANT_FACET}`
    : `${BASE_URL}/business-support?${GRANT_FACET}&page=${page}`;
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

export interface NiListingCard {
  url: string;
  slug: string;
  title: string | null;
  summary: string | null;
}

/**
 * Extract scheme cards from a listing page. Cards are Drupal views rows:
 * `views-field-title` holds the `<h2><a href="/business-support/<slug>">`
 * link and `views-field-field-description` the trimmed one-line summary.
 */
export function extractSchemeCards(html: string): NiListingCard[] {
  const out: NiListingCard[] = [];
  const seen = new Set<string>();
  const blocks = html
    .split(/<div class="views-field views-field-title">/)
    .slice(1);
  for (const block of blocks) {
    const link = block.match(
      /<h2><a href="\/business-support\/([a-z0-9][a-z0-9_-]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/,
    );
    if (!link) continue;
    const [, slug, titleHtml] = link;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const summary = block.match(/<div class="trimmed"><p>([\s\S]*?)<\/p>/);
    out.push({
      url: `${BASE_URL}/business-support/${slug}`,
      slug,
      title: stripTags(titleHtml) || null,
      summary: summary ? stripTags(summary[1]) || null : null,
    });
  }
  return out;
}

/** True when the Drupal pager has a next-page link. */
export function hasNextListingPage(html: string): boolean {
  return /pager__item--next/.test(html) && /rel="next"/.test(html);
}

/**
 * The scheme's node content region: the `node--type-business-support`
 * full-view div through its printer-friendly footer. Excludes the page chrome,
 * whose newsletter form carries a per-response Drupal form_build_id that would
 * make every fetch hash differently (defeating raw dedupe). Falls back to the
 * full HTML when the template no longer matches.
 */
export function nodeContentRegion(html: string): string {
  const marker = html.indexOf(
    "node--type-business-support node--view-mode-full",
  );
  if (marker === -1) return html;
  const start = html.lastIndexOf("<div", marker);
  const tail = html.slice(start === -1 ? marker : start);
  const end = tail.indexOf('<div class="print__wrapper');
  return end === -1 ? tail : tail.slice(0, end);
}

const MONTHS_RE =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

/** ISO date from free text like "midday on Thursday 16 July 2026" (noon UTC). */
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

/**
 * HTML of a labelled section: `<h2 class="field-label-above">Label</h2> …` up
 * to the next labelled heading or the page footer blocks.
 */
function sectionChunk(html: string, label: string): string | null {
  const re = new RegExp(
    `<h2\\s+class="field-label-above">\\s*${label}\\s*</h2>([\\s\\S]*?)(?=<h2[\\s>]|<div class="published-date"|$)`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}

/**
 * First two £ figures of a chunk of prose, as a min/max range: "Grants from
 * £5,000 to £25,000" → 5000–25000; a single "up to £17,250" → max only.
 * Euro twins ("€21,562/£17,250") are skipped by anchoring on £.
 */
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
 * Light support-type classification (the Grant facet mixes true grants with
 * vouchers — kept as grants — plus the odd rate relief / tax exemption).
 */
export function classifyFundingType(text: string): string {
  const lc = text.toLowerCase();
  if (/\bloans?\b/.test(lc)) return "loan";
  if (
    /rates? relief|rates? exemption|exemption for rates|tax relief/.test(lc)
  ) {
    return "other";
  }
  return "grant";
}

/** Delivering organisations from the "Support organisers" item list. */
function parseOrganisers(html: string): string | null {
  const chunk = sectionChunk(html, "Support organisers");
  if (!chunk) return null;
  const names: string[] = [];
  // The site omits closing </li> tags — terminate on the next list token too.
  const liRe = /<li>([\s\S]*?)(?=<\/li>|<li>|<\/ul>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(chunk)) !== null) {
    const name = stripTags(m[1]);
    if (name) names.push(name);
  }
  if (names.length > 0) return names.join(", ");
  return stripTags(chunk) || null;
}

/** Map a stated closing date onto the grant vocabulary. */
function mapStatus(deadlineAt: string | null): GrantStatus {
  // The finder only lists current schemes; a stated closing date makes it a
  // dated call, otherwise it is an always-open / ongoing programme.
  return deadlineAt ? "open" : "rolling";
}

export const niBusinessInfoConnector: GrantSourceConnector = {
  sourceName: "ni-business-info",
  displayName: "NI Business Info (Invest NI)",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true, // a complete walk of the Grant-facet listing

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = parseCursor(params.cursor);
    if (page > 0) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const cards = extractSchemeCards(listHtml).slice(0, cap);

    const items: NiBusinessSupportRaw[] = [];
    for (const card of cards) {
      const base = {
        id: card.slug,
        slug: card.slug,
        url: card.url,
        title: card.title,
        summary: card.summary,
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({
          ...base,
          html: nodeContentRegion(await getHtml(card.url)),
        });
      } catch {
        // Detail fetch failed — keep the listing-card stub so it still ingests
        // minimally and the delisting prune still sees its notice id.
        items.push({ ...base, html: null });
      }
    }

    const hasMore = hasNextListingPage(listHtml) && cards.length > 0;
    return {
      sourceName: "ni-business-info",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<NiBusinessSupportRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/business-support\/([a-z0-9_-]+)\/?/)?.[1] ?? "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/business-support/${slug}`;

    // Defensive: prefer the detail page, then the listing-card fields captured
    // at fetch time — if the template has changed we still return a grant with
    // whatever parsed.
    const title =
      (html ? stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "") : "") ||
      r.title ||
      null;
    if (!title) return [];

    const summary =
      stripTags(
        html.match(/<div class="summary">([\s\S]*?)<\/div>/)?.[1] ?? "",
      ) ||
      r.summary ||
      null;

    const closingText = stripTags(
      html.match(/class="info_block_a closing-date">([\s\S]*?)<\/div>/)?.[1] ??
        "",
    );
    const deadlineAt = parseFreeTextDate(closingText || null);

    const whoItIsFor = sectionChunk(html, "Who it is for");
    const supportChunk = sectionChunk(html, "Support you can get");
    const supportText = supportChunk ? stripTags(supportChunk) : null;
    // Amounts live in the support prose (or the summary), never in structured
    // fields — eligibility text is excluded (its £ figures are turnover caps).
    const { min: amountMin, max: amountMax } = parseAmountRange(
      supportText ?? summary,
    );

    const applicationUrl =
      html.match(
        /<div class="call_to_action"><a href="(https?:\/\/[^"]+)"/,
      )?.[1] ?? null;

    const publishedAt = parseFreeTextDate(
      stripTags(
        html.match(/<div class="published-date">([\s\S]*?)<\/div>/)?.[1] ?? "",
      ) || null,
    );

    return [
      {
        sourceName: "ni-business-info",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: applicationUrl ?? sourceUrl,
        title,
        description: summary,
        funderName: parseOrganisers(html),
        funderId: null,
        funderRegion: "Northern Ireland",
        fundingType: classifyFundingType(
          `${title} ${summary ?? ""} ${supportText ?? ""}`,
        ),
        amountMin,
        amountMax,
        currency: "GBP",
        openAt: null,
        deadlineAt,
        status: mapStatus(deadlineAt),
        themes: [],
        sectors: [],
        regions: ["Northern Ireland"],
        eligibilityText: whoItIsFor
          ? stripTags(whoItIsFor).slice(0, 4000) || null
          : null,
        eligibleOrgTypes: [], // stated per scheme in the eligibility text
        matchFundingRequired: /match[ -]?fund/i.test(
          `${supportText ?? ""} ${whoItIsFor ? stripTags(whoItIsFor) : ""}`,
        ),
        beneficiaries: [],
        documents: [],
        publishedAt,
        rawJson: raw,
      },
    ];
  },
};
