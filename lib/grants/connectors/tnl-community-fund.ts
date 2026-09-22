import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// The National Lottery Community Fund — the UK's largest community funder
// (£500m+/year, all four nations). Its programme finder at
// /funding/funding-programmes is server-rendered Umbraco HTML (no JS needed)
// with a real status filter (?status=open) and ?page=N pagination (~3 pages,
// ~20 open programmes; the unfiltered archive runs to ~24 pages). There is no
// public API. robots.txt disallows only /bin/ and /umbraco/ — the programme
// pages are fair game for polite fetching.
//
// fetchSince walks one OPEN-filtered listing page per call (cursor = JSON
// {page}), then fetches each programme's detail page and stores its FULL HTML
// as the raw payload (raw before normalisation, per repo policy) — normalize
// stays pure. Detail pages embed a schema.org MonetaryGrant JSON-LD block
// (name/description/funder/amount) which normalize prefers, falling back to
// the visible overview markup, then to the listing-card fields captured at
// fetch time. Most TNL programmes are always-open ("Open to applications"
// with no closing date) → status "rolling"; a stated closing date → "open".
//
// Guardrails: public charity-regulated funder data, identifying User-Agent
// (plain "UKBidIntelligence/1.0 ..." — some WAFs 403 the "Mozilla/5.0
// (compatible; ...)" form), 150ms pacing, 20s timeouts, structured public
// fields only, no personal data.

const BASE_URL = "https://www.tnlcommunityfund.org.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 12; // safety cap on detail fetches per listing page (10 listed)

// Raw payload stored per programme: the detail page's full HTML plus the stable
// slug (= source notice id; `id` lets the sync engine's extractGrantId /
// delisting prune see it) and the listing-card fields as fallbacks if the
// detail fetch fails or the template changes.
export interface TnlProgrammeRaw {
  id: string; // = slug, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  summary: string | null; // listing-card description
  location: string | null; // listing-card "Project location" text
  amount: string | null; // listing-card amount text, e.g. "£300 to £20,000"
  status: string | null; // listing-card programme status text
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
    throw new Error(`TNL Community Fund ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities TNL pages actually use (incl. numeric/hex forms). */
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

/** Open-filtered programme listing URL (?status=open, &page=N from page 2). */
export function listingUrl(page: number): string {
  return page <= 1
    ? `${BASE_URL}/funding/funding-programmes?status=open`
    : `${BASE_URL}/funding/funding-programmes?status=open&page=${page}`;
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

export interface TnlListingCard {
  url: string;
  slug: string;
  title: string | null;
  summary: string | null;
  location: string | null;
  amount: string | null;
  status: string | null;
}

/** Value text of a labelled `<li><strong>Label:</strong> value</li>` row. */
function labelledRow(html: string, label: string): string | null {
  const re = new RegExp(
    `<strong>\\s*${label}\\s*:?\\s*</strong>\\s*:?\\s*([\\s\\S]*?)</li>`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return null;
  return stripTags(m[1]) || null;
}

/**
 * Extract programme cards from a listing page. Cards are `card mb-4` blocks:
 * card-body holds the titled link + summary, card-footer the labelled rows
 * (Project location / Amount / A decision in / Programme status). Scoping to
 * the card blocks keeps the filter-sidebar checkboxes and footer links out.
 */
export function extractProgrammeCards(html: string): TnlListingCard[] {
  const out: TnlListingCard[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<div class="card mb-4">/).slice(1);
  for (const block of blocks) {
    const link = block.match(
      /<h2>\s*<a href="\/funding\/funding-programmes\/([a-z0-9][a-z0-9_-]*)\/?"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i,
    );
    if (!link) continue;
    const [, slug, titleHtml] = link;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const summary = block.match(/<\/h2>\s*<p>([\s\S]*?)<\/p>/i);
    out.push({
      url: `${BASE_URL}/funding/funding-programmes/${slug}`,
      slug,
      title: stripTags(titleHtml) || null,
      summary: summary ? stripTags(summary[1]) || null : null,
      location: labelledRow(block, "Project location"),
      amount: labelledRow(block, "Amount"),
      status: labelledRow(block, "Programme status"),
    });
  }
  return out;
}

/** True when the listing's pagination nav has a "next page" link. */
export function hasNextListingPage(html: string): boolean {
  return /aria-label="Go to next page"/i.test(html);
}

/** Parse a £-amount range: "£300 to £20,000", "up to £10,000", "£2.5 million". */
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
  if (amounts.length === 1) {
    // "Up to £20,000" / a single figure → treat as a ceiling.
    return { min: null, max: amounts[0] };
  }
  return {
    min: Math.min(amounts[0], amounts[1]),
    max: Math.max(amounts[0], amounts[1]),
  };
}

const NATIONS = ["England", "Scotland", "Wales", "Northern Ireland"] as const;

/** Regions from a "Project location" string; all four nations / UK-wide → UK. */
export function parseRegions(location: string | null): string[] {
  if (!location) return [];
  if (/\bUK[\s-]?wide\b|\bUnited Kingdom\b/i.test(location)) {
    return ["United Kingdom"];
  }
  const found = NATIONS.filter((n) =>
    new RegExp(`\\b${n}\\b`, "i").test(location),
  );
  if (found.length === NATIONS.length) return ["United Kingdom"];
  return found;
}

// ── Detail-page parsing ──────────────────────────────────────────────────────

interface TnlJsonLd {
  name: string | null;
  description: string | null;
  url: string | null;
  funderName: string | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string | null;
}

/** The schema.org MonetaryGrant JSON-LD block (type attr may be entity-encoded). */
function parseJsonLd(html: string): TnlJsonLd | null {
  const re =
    /<script type="application\/ld(?:\+|&#x2B;)json">([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      if (!parsed || typeof parsed !== "object") continue;
      const obj = parsed as Record<string, unknown>;
      const type = obj["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (!types.includes("MonetaryGrant")) continue;
      const funder = obj.funder as Record<string, unknown> | undefined;
      const amount = obj.amount as Record<string, unknown> | undefined;
      const str = (v: unknown): string | null =>
        typeof v === "string" && v.trim()
          ? decodeEntities(v).replace(/\s+/g, " ").trim()
          : null;
      const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return {
        name: str(obj.name),
        description: str(obj.description),
        url: str(obj.url),
        funderName: funder ? str(funder.name) : null,
        amountMin: amount ? num(amount.minValue) : null,
        amountMax: amount ? num(amount.maxValue) : null,
        currency: amount ? str(amount.currency) : null,
      };
    } catch {
      continue; // malformed JSON-LD — fall through to HTML parsing
    }
  }
  return null;
}

/** Title from the H1. */
function parseTitle(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripTags(m[1]) || null : null;
}

/** The detail page's overview block (Project location / Amount / status rows). */
function overviewBlock(html: string): string {
  const start = html.indexOf('<div class="overview">');
  if (start === -1) return "";
  const chunk = html.slice(start);
  const end = chunk.indexOf("</ul>");
  return end === -1 ? chunk.slice(0, 4000) : chunk.slice(0, end + 5);
}

/** First paragraph of the rich content area (description fallback). */
function firstContentParagraph(html: string): string | null {
  const start = html.indexOf('<div class="rich-content-area');
  if (start === -1) return null;
  const m = html.slice(start).match(/<p>([\s\S]*?)<\/p>/i);
  return m ? stripTags(m[1]) || null : null;
}

/**
 * Eligibility prose: every section under a "who can apply" / "criteria" /
 * "eligibility" style heading in the content area (each up to its next h2),
 * joined and capped.
 */
function parseEligibility(html: string): string | null {
  const start = html.indexOf('<div class="rich-content-area');
  if (start === -1) return null;
  const content = html.slice(start, start + 30_000);
  const sections: string[] = [];
  const headingRe = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(content)) !== null) {
    const heading = stripTags(m[1]);
    if (!/who can apply|must meet|criteria|eligib/i.test(heading)) continue;
    const after = content.slice(m.index + m[0].length);
    const nextH2 = after.search(/<h2[^>]*>/i);
    const body = stripTags(nextH2 === -1 ? after : after.slice(0, nextH2));
    if (body) sections.push(`${heading}: ${body}`);
  }
  return sections.length > 0 ? sections.join("\n\n").slice(0, 4000) : null;
}

/** The programme's "How to apply" sub-page, when the section nav has one. */
function parseApplicationUrl(html: string, slug: string): string | null {
  const re = new RegExp(
    `href="(/funding/funding-programmes/${slug}/how-to-apply)/?"`,
    "i",
  );
  const m = re.exec(html);
  return m ? `${BASE_URL}${m[1]}` : null;
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

/** ISO date from "dd Month yyyy" (noon UTC, date-resolution is all we need). */
function parseUkDate(text: string): string | null {
  const m = text.match(
    new RegExp(`(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})`, "i"),
  );
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * A REAL closing date, when one is stated: a "closing date / closes / deadline /
 * apply by" phrase with a full date close by. Most TNL programmes never state
 * one (always-open → "rolling"), so this only matches deliberate deadlines —
 * not incidental dates in the prose.
 */
export function parseClosingDate(html: string): string | null {
  const text = stripTags(html);
  const re = new RegExp(
    `(?:closing date|closes|deadline|apply by|applications? close[sd]?)[^.£]{0,80}?(\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})`,
    "i",
  );
  const m = re.exec(text);
  return m ? parseUkDate(m[1]) : null;
}

/** Map TNL's status wording onto the grant vocabulary. */
function mapStatus(
  statusText: string | null,
  deadlineAt: string | null,
): GrantStatus {
  const s = (statusText ?? "").toLowerCase();
  if (s.includes("closed") || s.includes("archived")) return "closed";
  if (s.includes("coming soon")) return "forthcoming";
  // "Open to applications" (and the open-filtered crawl's default): a stated
  // closing date makes it a deadlined call; otherwise it's an always-open
  // rolling programme — the common case at TNL.
  return deadlineAt ? "open" : "rolling";
}

export const tnlCommunityFundConnector: GrantSourceConnector = {
  sourceName: "tnl-community-fund",
  displayName: "National Lottery Community Fund",
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
    const cards = extractProgrammeCards(listHtml).slice(0, cap);

    const items: TnlProgrammeRaw[] = [];
    for (const card of cards) {
      const base = {
        id: card.slug,
        slug: card.slug,
        url: card.url,
        title: card.title,
        summary: card.summary,
        location: card.location,
        amount: card.amount,
        status: card.status,
        listedAt: new Date().toISOString(),
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({ ...base, html: await getHtml(card.url) });
      } catch {
        // Detail fetch failed — keep the listing-card stub so it still ingests
        // minimally and the delisting prune still sees its notice id.
        items.push({ ...base, html: null });
      }
    }

    const hasMore = hasNextListingPage(listHtml) && cards.length > 0;
    return {
      sourceName: "tnl-community-fund",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<TnlProgrammeRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/funding\/funding-programmes\/([a-z0-9_-]+)\/?/)?.[1] ??
          "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/funding/funding-programmes/${slug}`;

    // Defensive: prefer the JSON-LD block, then the page markup, then the
    // listing-card fields captured at fetch time — if the template has changed
    // we still return a grant with whatever parsed.
    const ld = html ? parseJsonLd(html) : null;
    const title = ld?.name ?? parseTitle(html) ?? (r.title || null);
    if (!title) return [];

    const overview = overviewBlock(html);
    const locationText =
      labelledRow(overview, "Project location") ?? (r.location || null);
    const amountText = labelledRow(overview, "Amount") ?? (r.amount || null);
    const statusText =
      labelledRow(overview, "Programme status") ?? (r.status || null);

    const textAmounts = parseAmountRange(amountText);
    const amountMin = ld?.amountMin ?? textAmounts.min;
    const amountMax = ld?.amountMax ?? textAmounts.max;

    const deadlineAt = html ? parseClosingDate(html) : null;

    return [
      {
        sourceName: "tnl-community-fund",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: parseApplicationUrl(html, slug) ?? sourceUrl,
        title,
        description:
          ld?.description ?? (r.summary || null) ?? firstContentParagraph(html),
        funderName: ld?.funderName ?? "The National Lottery Community Fund",
        funderId: null,
        funderRegion: "United Kingdom",
        fundingType: "grant",
        amountMin,
        amountMax,
        currency: ld?.currency ?? "GBP",
        openAt: null, // always-open programmes publish no opening date
        deadlineAt,
        status: mapStatus(statusText, deadlineAt),
        themes: [],
        sectors: [],
        regions: parseRegions(locationText),
        eligibilityText: parseEligibility(html),
        eligibleOrgTypes: [], // mostly VCSE / community orgs — varies per programme
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: null, // the site states no publication date
        rawJson: raw,
      },
    ];
  },
};
