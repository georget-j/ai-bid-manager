import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// The London Community Foundation — London's community foundation, channelling
// place-based and corporate funds to grassroots groups across the capital. Its
// /apply/available-grants listing is server-rendered HTML (no JS needed, ~13
// funds over 3 pages, /p2 /p3 pagination) with cards linking /grants/<slug>
// detail pages that carry a labelled table (Closing date / Theme / Fund name /
// Borough / Max. Grant size), apply + guidelines buttons, and rich prose.
//
// CRITICAL caveat (verified live): the listing INCLUDES funds whose own detail
// page says the fund is closed — at fetch time 11 of 13 listed funds were
// closed. Status therefore comes from the DETAIL page only ("This fund is now
// closed." text, else the dated "Closing date:" field vs now), never from the
// listing's own Open/Closed chip — that chip is only a fallback for a failed
// detail fetch.
//
// fetchSince walks one listing page per call (cursor = JSON {page}), then
// fetches each fund's detail page and stores its fund region as the raw
// payload (raw before normalisation, per repo policy) — normalize stays pure.
// The region is the page's own markup verbatim (responses are byte-stable
// across fetches — no scrubs needed for hash dedupe).
//
// Guardrails: public charity funder data, plain identifying User-Agent
// ("UKBidIntelligence/1.0 …" — some WAFs 403 the "Mozilla/5.0 (compatible; …)"
// form), 150ms pacing, 20s timeouts, structured public fields only, no
// personal data.

const BASE_URL = "https://londoncf.org.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "UKBidIntelligence/1.0 (+https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 8; // safety cap on detail fetches per listing page (5 listed)

// Raw payload stored per fund: the detail page's fund region plus the stable
// slug (= source notice id; `id` lets the sync engine's extractGrantId /
// delisting prune see it) and the listing-card fields as fallbacks if the
// detail fetch fails or the template changes.
export interface LondonCfGrantRaw {
  id: string; // = slug, the stable sourceNoticeId
  slug: string;
  url: string;
  title: string | null; // listing-card title (fallback when detail parse fails)
  summary: string | null; // listing-card description
  listedStatus: string | null; // listing chip ("Open"/"Closed") — FALLBACK ONLY
  listedClosingDate: string | null; // listing "Closing date: dd/mm/yyyy" — fallback only
  html: string | null; // detail-page fund region (null when the fetch failed)
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
    throw new Error(`London Community Foundation ${res.status} for ${url}`);
  }
  return res.text();
}

/** Decode the HTML entities londoncf.org.uk pages actually use. */
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

/** Listing URL (page 1 is the bare path; later pages are /p2, /p3, …). */
export function listingUrl(page: number): string {
  return page <= 1
    ? `${BASE_URL}/apply/available-grants`
    : `${BASE_URL}/apply/available-grants/p${page}`;
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

export interface LondonCfCard {
  url: string;
  slug: string;
  title: string | null;
  summary: string | null;
  listedStatus: string | null;
  listedClosingDate: string | null;
}

/**
 * Extract fund cards from a listing page. Cards are `filtered-content__item`
 * blocks: an `<h4>Title | Closing date: dd/mm/yyyy <span> Open/Closed</span>`
 * heading, a description `<p>`, a details table and a "Read more" link to
 * /grants/<slug> (the slug can differ from the display title — the link is
 * the identity, the h4 is not).
 */
export function extractGrantCards(html: string): LondonCfCard[] {
  const out: LondonCfCard[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<div class="filtered-content__item">/).slice(1);
  for (const block of blocks) {
    const link = block.match(
      /href="https:\/\/londoncf\.org\.uk\/grants\/([a-z0-9][a-z0-9_-]*)\/?[^"]*"/i,
    );
    if (!link) continue;
    const slug = link[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const h4 = block.match(/<h4>([\s\S]*?)<\/h4>/i)?.[1] ?? "";
    const chip = h4.match(/<span>\s*([\s\S]*?)\s*<\/span>/i);
    const closing = h4.match(/Closing date:\s*([\d/]+)/i);
    const title = stripTags(h4.replace(/\|[\s\S]*$/, ""));
    const summary = block.match(
      /filtered-content__item-description">\s*<p>([\s\S]*?)<\/p>/i,
    );
    out.push({
      url: `${BASE_URL}/grants/${slug}`,
      slug,
      title: title || null,
      summary: summary ? stripTags(summary[1]) || null : null,
      listedStatus: chip ? stripTags(chip[1]) || null : null,
      listedClosingDate: closing ? closing[1] : null,
    });
  }
  return out;
}

/** True when the pager's next item is a live link (the last page's is disabled). */
export function hasNextListingPage(html: string): boolean {
  return /class="pagination-next">\s*<a\s/i.test(html);
}

/**
 * The fund region of a detail page: from the `<section>` holding the page's
 * single `<h1>` (title banner) through the closing `</article>` (aside table,
 * apply/guidelines buttons and prose included). Responses are byte-stable
 * across fetches, so the region is stored verbatim — no scrubs needed for
 * content-hash dedupe. Falls back to the full HTML when the template no
 * longer matches.
 */
export function fundContentRegion(html: string): string {
  const h1 = html.indexOf("<h1");
  if (h1 === -1) return html;
  const start = html.lastIndexOf("<section", h1);
  const end = html.indexOf("</article>", h1);
  if (start === -1) return html;
  return end === -1
    ? html.slice(start)
    : html.slice(start, end + "</article>".length);
}

/** ISO date from the site's dd/mm/yyyy form, e.g. "21/07/2026" (noon UTC). */
export function parseUkSlashDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!m) return null;
  const date = new Date(
    Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12),
  );
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCMonth() !== Number(m[2]) - 1) return null; // e.g. 31/02
  return date.toISOString();
}

/** Raw HTML of a `<td>Label:</td><td>…</td>` projects-table value cell. */
function tableCellHtml(html: string, label: string): string | null {
  const re = new RegExp(
    `<td>\\s*${label}\\s*:?\\s*</td>\\s*<td>([\\s\\S]*?)</td>`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}

/** Text of a `<td>Label:</td><td>…</td>` projects-table value cell. */
function tableValue(html: string, label: string): string | null {
  const cell = tableCellHtml(html, label);
  if (cell === null) return null;
  return stripTags(cell) || null;
}

/**
 * Themes from the Theme cell. Theme names contain commas themselves ("Life
 * skills, employability and enterprise") — in the markup each theme sits on
 * its own line ending with a trailing comma, so the LINE BREAK is the real
 * separator, not the comma. "Multiple" is the site's non-answer.
 */
export function parseThemes(html: string): string[] {
  const cell = tableCellHtml(html, "Theme");
  if (!cell) return [];
  return cell
    .split(/,\s*\r?\n/)
    .map((t) => stripTags(t).replace(/,\s*$/, ""))
    .filter((t) => t && !/^multiple$/i.test(t));
}

/** Parse a £ amount ("£20,000", "£2.5 million"). */
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

/**
 * Status from the DETAIL page (the house caveat for this source): an explicit
 * "This fund is now closed." in the prose wins; else the dated "Closing date:"
 * field decides (future → open, past → closed); an undated live fund rolls.
 * The listing chip is only consulted when the detail fetch failed entirely.
 */
export function mapDetailStatus(
  html: string,
  deadlineAt: string | null,
  listedStatus: string | null,
  now: Date = new Date(),
): GrantStatus {
  if (html) {
    if (/fund is (?:now\s+)?closed/i.test(stripTags(html))) return "closed";
    if (deadlineAt) return new Date(deadlineAt) > now ? "open" : "closed";
    return "rolling";
  }
  // Detail fetch failed — fall back to the listing chip so the stub still
  // carries a sane status until the next run retries the detail page.
  const s = (listedStatus ?? "").toLowerCase();
  if (s.includes("closed")) return "closed";
  if (deadlineAt) return new Date(deadlineAt) > now ? "open" : "closed";
  return s.includes("open") ? "rolling" : "unknown";
}

/** The apply button's external URL ("Apply online now (URL)"). */
function parseApplicationUrl(html: string): string | null {
  const m = html.match(
    /<a href="(https?:\/\/[^"]+)"[^>]*class="button"[^>]*>\s*Apply/i,
  );
  return m ? decodeEntities(m[1]) : null;
}

/** Guideline/criteria PDF buttons → document links (absolute URLs). */
function parseDocuments(
  html: string,
): Array<{ title: string; url: string; format: string }> {
  const out: Array<{ title: string; url: string; format: string }> = [];
  const seen = new Set<string>(); // the buttons block renders twice (aside + mobile)
  const re =
    /<a href="([^"]+\.pdf)"[^>]*class="button"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = decodeEntities(
      m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`,
    );
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: stripTags(m[2]).replace(/\s*\(PDF\)\s*$/i, ""),
      url,
      format: "pdf",
    });
  }
  return out;
}

/**
 * Eligibility prose: sections under "who can apply" / "eligib" / "what can
 * the fund support" / "income threshold" style h2/h4 headings in the article
 * (each up to the next same-level heading), joined and capped.
 */
function parseEligibility(html: string): string | null {
  const sections: string[] = [];
  const headingRe = /<h([24])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const heading = stripTags(m[2]);
    if (
      !/who can apply|eligib|what can the fund support|income threshold/i.test(
        heading,
      )
    ) {
      continue;
    }
    const after = html.slice(m.index + m[0].length);
    const nextHeading = after.search(new RegExp(`<h${m[1]}[^>]*>`, "i"));
    const body = stripTags(
      nextHeading === -1 ? after : after.slice(0, nextHeading),
    );
    if (body) sections.push(`${heading}: ${body}`);
  }
  return sections.length > 0 ? sections.join("\n\n").slice(0, 4000) : null;
}

export const londonCfConnector: GrantSourceConnector = {
  sourceName: "london-cf",
  displayName: "The London Community Foundation",
  baseUrl: BASE_URL,
  // The 3-page walk IS the source's whole current listing — but note that the
  // listing itself mixes open and closed funds, so most of the pruning work is
  // done by the detail-page status rather than the delisting prune.
  listsAllOpenCalls: true,

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = parseCursor(params.cursor);
    if (page > 1) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const cards = extractGrantCards(listHtml).slice(0, cap);

    const items: LondonCfGrantRaw[] = [];
    for (const card of cards) {
      const base = {
        id: card.slug,
        slug: card.slug,
        url: card.url,
        title: card.title,
        summary: card.summary,
        listedStatus: card.listedStatus,
        listedClosingDate: card.listedClosingDate,
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
      sourceName: "london-cf",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as Partial<LondonCfGrantRaw>;
    const slug =
      (typeof r.slug === "string" && r.slug) ||
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/grants\/([a-z0-9_-]+)\/?/)?.[1] ?? "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const sourceUrl =
      typeof r.url === "string" && r.url ? r.url : `${BASE_URL}/grants/${slug}`;

    // Defensive: prefer the detail page, then the listing-card fields captured
    // at fetch time — if the template has changed we still return a grant with
    // whatever parsed.
    const title =
      stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
      r.title ||
      null;
    if (!title) return [];

    // Status MUST come from the detail page (see the connector caveat): the
    // listing chip only backstops a failed detail fetch.
    const deadlineAt =
      parseUkSlashDate(tableValue(html, "Closing date")) ??
      (html ? null : parseUkSlashDate(r.listedClosingDate ?? null));
    const status = mapDetailStatus(html, deadlineAt, r.listedStatus ?? null);

    const themes = parseThemes(html);

    const description =
      stripTags(
        html.match(/<article[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? "",
      ) ||
      r.summary ||
      null;

    return [
      {
        sourceName: "london-cf",
        sourceNoticeId: slug,
        sourceUrl,
        applicationUrl: parseApplicationUrl(html) ?? sourceUrl,
        title,
        description,
        funderName: "The London Community Foundation",
        funderId: null,
        funderRegion: "London",
        fundingType: "grant",
        amountMin: null, // the table publishes a maximum only
        amountMax: parseAmount(tableValue(html, "Max\\.?\\s*Grant size")),
        currency: "GBP",
        openAt: null,
        deadlineAt,
        status,
        themes,
        sectors: [],
        regions: ["London"],
        eligibilityText: parseEligibility(html),
        eligibleOrgTypes: [], // community groups / charities — stated per fund
        matchFundingRequired: false,
        beneficiaries: [],
        documents: parseDocuments(html),
        publishedAt: null, // the site states no publication date
        rawJson: raw,
      },
    ];
  },
};
