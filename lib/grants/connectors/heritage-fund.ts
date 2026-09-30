import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// National Lottery Heritage Fund — the UK's largest heritage funder (£400m+/
// year, all four nations). Its /funding page is server-rendered Drupal HTML
// (no JS needed) listing the currently-open programmes as a handful of
// `<article class="programme … search-result">` cards (~2-5 at any time, e.g.
// National Lottery Heritage Grants £10k-£250k and £250k-£10m). There is no
// public API. The volume is tiny, so a sync is a SINGLE-page walk: the listing
// plus each programme's detail page, plus the programme's "Application
// deadlines" subpage when its book navigation links one.
//
// fetchSince stores each programme's detail-page article region (and the
// deadlines subpage's article region when present) as the raw payload (raw
// before normalisation, per repo policy) — normalize stays pure. The regions
// are the pages' own markup verbatim except for documented scrubs of Drupal's
// per-response form tokens, which exist only to keep the content hash stable
// for dedupe. Amount ranges live in the programme titles themselves
// ("£10,000 to £250,000"). The £10k-£250k programme states "no deadline for
// applications" → rolling; the £250k-£10m programme publishes a dated
// deadline list → "open" with the next upcoming deadline.
//
// Guardrails: public lottery-distributor data, plain identifying User-Agent
// ("UKBidIntelligence/1.0 …" — the old 403 on this host does not reproduce
// with the plain form), 150ms pacing, 20s timeouts, structured public fields
// only, no personal data.

const BASE_URL = "https://www.heritagefund.org.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 8; // safety cap on detail fetches (~2-5 listed)

// Raw payload stored per programme: the detail page's article region (plus
// the deadlines subpage's, when the programme has one) and the stable slug
// (= source notice id; `id` lets the sync engine's extractGrantId / delisting
// prune see it) and the listing-card fields as fallbacks if the detail fetch
// fails or the template changes.
export interface HeritageFundProgrammeRaw {
  id: string; // = slug from the listing-card href, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  summary: string | null; // listing-card body summary
  html: string | null; // detail-page article region (null when the fetch failed)
  deadlinesHtml: string | null; // "Application deadlines" subpage region, when linked
  // No fetch timestamp in the payload: raw_grant_notices.fetched_at records it,
  // and a timestamp here would change the content hash every run, defeating
  // dedupe (the sync's nightly steady state is "everything was a duplicate").
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getHtml(url: string): Promise<string> {
  // Programme card hrefs may 301 to a renamed node (e.g. …-10k-250k →
  // …-10k-250k-0); fetch follows redirects by default.
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Heritage Fund ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities heritagefund.org.uk pages actually use. */
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

export const LISTING_URL = `${BASE_URL}/funding`;

export interface HeritageFundCard {
  url: string;
  slug: string;
  title: string | null;
  summary: string | null;
}

/**
 * Extract programme cards from the /funding page. Cards are `<article>`
 * elements whose class carries both "programme" and "search-result" (the page
 * also has plain basic-page articles — excluded), holding an
 * `<h2 class="search-result__title"><a href="/funding/<slug>" rel="bookmark">
 * <span>Title</span>` link and a body-field summary.
 */
export function extractProgrammeCards(html: string): HeritageFundCard[] {
  const out: HeritageFundCard[] = [];
  const seen = new Set<string>();
  const articleRe =
    /<article[^>]*class="[^"]*\bprogramme\b[^"]*\bsearch-result\b[^"]*"[\s\S]*?<\/article>/gi;
  let a: RegExpExecArray | null;
  while ((a = articleRe.exec(html)) !== null) {
    const block = a[0];
    const link = block.match(
      /<h2 class="search-result__title"[^>]*>\s*<a href="\/funding\/([a-z0-9][a-z0-9_-]*)\/?"[^>]*>\s*<span>([\s\S]*?)<\/span>/i,
    );
    if (!link) continue;
    const [, slug, titleHtml] = link;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const summary = block.match(
      /field--name-body[^>]*field--item">([\s\S]*?)<\/div>/i,
    );
    out.push({
      url: `${BASE_URL}/funding/${slug}`,
      slug,
      title: stripTags(titleHtml) || null,
      summary: summary ? stripTags(summary[1]) || null : null,
    });
  }
  return out;
}

/**
 * The programme's article region: `<article … id="programme-article-wrapper">`
 * through its close (the page's webform/newsletter chrome sits outside it).
 * For the deadlines subpage the article is a plain `basic-page` node. Two
 * documented scrubs keep the stored payload's content hash stable across
 * fetches so dedupe works: Drupal's per-response form_build_id/antibot values
 * and the randomised js-view-dom-id/views_dom_id tokens. Falls back to the
 * full (scrubbed) HTML when the template no longer matches.
 */
export function articleRegion(html: string): string {
  let region = html;
  const wrapper = html.indexOf('id="programme-article-wrapper"');
  const anchor =
    wrapper !== -1
      ? wrapper
      : html.search(/<article[^>]*class="[^"]*\bbasic-page\b/i);
  if (anchor !== -1) {
    const start = html.lastIndexOf("<article", anchor);
    const end = html.indexOf("</article>", anchor);
    if (start !== -1) {
      region =
        end === -1
          ? html.slice(start)
          : html.slice(start, end + "</article>".length);
    }
  }
  return region
    .replace(
      /name="form_build_id" value="[^"]*"/gi,
      'name="form_build_id" value="scrubbed"',
    )
    .replace(
      /name="antibot_key" value="[^"]*"/gi,
      'name="antibot_key" value="scrubbed"',
    )
    .replace(/js-view-dom-id-[a-f0-9]+/gi, "js-view-dom-id-scrubbed")
    .replace(/views_dom_id:[a-f0-9]+/gi, "views_dom_id:scrubbed");
}

/** The programme's "Application deadlines" subpage path, when the nav links one. */
export function findDeadlinesPath(html: string): string | null {
  const m = html.match(/href="(\/funding\/[a-z0-9_-]+\/deadlines)\/?"/i);
  return m ? m[1] : null;
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
 * All dated deadlines from the deadlines subpage's text, e.g. "12noon,
 * 26 February 2026, to receive a decision by end of June 2026" — only the
 * full "d Month yyyy" date directly after a deadline-list lead-in counts;
 * the trailing decision month has no day number so it never matches
 * (noon UTC; date resolution is all we need).
 */
export function parseDeadlineDates(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS_RE})\\.?,?\\s+(\\d{4})\\b`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const month = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    const date = new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12));
    if (!Number.isNaN(date.getTime())) out.push(date.toISOString());
  }
  return out.sort();
}

/** The earliest deadline that is still in the future (else null). */
export function nextUpcoming(
  isoDates: string[],
  now: Date = new Date(),
): string | null {
  const future = isoDates.filter((d) => new Date(d) > now).sort();
  return future[0] ?? null;
}

/** Parse a £-amount range from title/copy: "£250,000 to £10million". */
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
 * Eligibility prose: every section under a "who can apply" / "eligib" style
 * h2 in the article region (each up to its next h2), joined and capped.
 */
function parseEligibility(html: string): string | null {
  const sections: string[] = [];
  const headingRe = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const heading = stripTags(m[1]);
    if (!/who can apply|eligib/i.test(heading)) continue;
    const after = html.slice(m.index + m[0].length);
    const nextH2 = after.search(/<h2[^>]*>/i);
    const body = stripTags(nextH2 === -1 ? after : after.slice(0, nextH2));
    if (body) sections.push(`${heading}: ${body}`);
  }
  return sections.length > 0 ? sections.join("\n\n").slice(0, 4000) : null;
}

/** Map the programme's deadline shape onto the grant vocabulary. */
function mapStatus(deadlineAt: string | null, html: string): GrantStatus {
  if (deadlineAt) return "open";
  // "There is no deadline so you can apply whenever you are ready" — the
  // £10k-£250k programme's (and the listing's default) always-open shape.
  if (/no deadline/i.test(html)) return "rolling";
  return "rolling";
}

export const heritageFundConnector: GrantSourceConnector = {
  sourceName: "heritage-fund",
  displayName: "National Lottery Heritage Fund",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true, // the single /funding page is the whole open set

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const listHtml = await getHtml(LISTING_URL);
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const cards = extractProgrammeCards(listHtml).slice(0, cap);

    const items: HeritageFundProgrammeRaw[] = [];
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
        const detailHtml = await getHtml(card.url);
        let deadlinesHtml: string | null = null;
        const deadlinesPath = findDeadlinesPath(detailHtml);
        if (deadlinesPath) {
          try {
            await sleep(REQUEST_DELAY_MS);
            deadlinesHtml = articleRegion(
              await getHtml(`${BASE_URL}${deadlinesPath}`),
            );
          } catch {
            deadlinesHtml = null; // optional page — the programme still ingests
          }
        }
        items.push({ ...base, html: articleRegion(detailHtml), deadlinesHtml });
      } catch {
        // Detail fetch failed — keep the listing-card stub so it still ingests
        // minimally and the delisting prune still sees its notice id.
        items.push({ ...base, html: null, deadlinesHtml: null });
      }
    }

    // The whole open set fits on the single /funding page — never more pages.
    return {
      sourceName: "heritage-fund",
      rawItems: items,
      nextCursor: null,
      fetchedAt: new Date().toISOString(),
      hasMore: false,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<HeritageFundProgrammeRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/funding\/([a-z0-9_-]+)\/?/)?.[1] ?? "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const deadlinesHtml =
      typeof r.deadlinesHtml === "string" ? r.deadlinesHtml : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/funding/${slug}`;

    // Defensive: prefer the detail page, then the listing-card fields captured
    // at fetch time — if the template has changed we still return a grant with
    // whatever parsed.
    const title =
      stripTags(
        html.match(
          /<h1 class="page-header">\s*<span>([\s\S]*?)<\/span>/i,
        )?.[1] ?? "",
      ) ||
      r.title ||
      null;
    if (!title) return [];

    const description =
      stripTags(
        html.match(
          /field--name-field-intro-text[^>]*">([\s\S]*?)<\/div>/i,
        )?.[1] ?? "",
      ) ||
      r.summary ||
      null ||
      stripTags(html.match(/<p>([\s\S]*?)<\/p>/i)?.[1] ?? "") ||
      null;

    // Amount ranges live in the programme titles ("£10,000 to £250,000").
    const fromTitle = parseAmountRange(title);
    const amounts =
      fromTitle.min !== null || fromTitle.max !== null
        ? fromTitle
        : parseAmountRange(description);

    const deadlineAt = nextUpcoming(
      parseDeadlineDates(stripTags(deadlinesHtml)),
    );

    return [
      {
        sourceName: "heritage-fund",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: sourceUrl, // applications go through the page's own portal flow
        title,
        description,
        funderName: "The National Lottery Heritage Fund",
        funderId: null,
        funderRegion: "United Kingdom",
        fundingType: "grant",
        amountMin: amounts.min,
        amountMax: amounts.max,
        currency: "GBP",
        openAt: null,
        deadlineAt,
        status: mapStatus(deadlineAt, html),
        themes: ["Heritage"],
        sectors: [],
        regions: ["United Kingdom"], // all four nations
        eligibilityText: parseEligibility(html),
        eligibleOrgTypes: [], // not-for-profits / partnerships — stated per programme
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: null, // the site states no publication date
        rawJson: raw,
      },
    ];
  },
};
