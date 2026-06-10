import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// Innovate UK / UKRI Innovation Funding Service — OPEN innovation competitions
// (grants), the direct apply route, at apply-for-innovation-funding.service.gov.uk.
// No public API; the search is server-rendered GDS HTML. The list page gives
// title/description/slug; the per-competition overview page gives the opens/closes
// dates + funding type — so fetchSince enriches each list item with its overview-page
// data, making the stored raw self-contained (normalize stays pure).
//
// Guardrails: public-sector open data, identifying User-Agent, polite pacing between
// requests, structured public fields only, no personal data.

const BASE_URL = "https://apply-for-innovation-funding.service.gov.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; UKBidIntelligence/1.0; +https://ai-rfp-agent-ten.vercel.app)";
const REQUEST_DELAY_MS = 400;
const MAX_DETAIL_PER_PAGE = 12; // safety cap on detail fetches per list page

interface CompetitionRaw {
  id: string;
  slug: string; // /competition/{id}/overview/{uuid}
  url: string;
  title: string;
  description: string;
  funderText: string | null;
  fundingType: string | null;
  opensText: string | null;
  closesText: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Innovation Funding Service ${res.status} for ${url}`);
  }
  return res.text();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/&#163;/g, "£")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract "dd Month yyyy" from a human date string and return ISO (or null). */
function parseUkDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function deriveStatus(
  opens: string | null,
  closes: string | null,
): GrantStatus {
  const now = Date.now();
  const o = opens ? Date.parse(opens) : NaN;
  const c = closes ? Date.parse(closes) : NaN;
  if (!Number.isNaN(o) && now < o) return "forthcoming";
  if (!Number.isNaN(c) && now > c) return "closed";
  return "open";
}

/** Parse £ amounts like "£110 million" / "£1.5m" / "£250,000" into a number. */
function parseAmount(text: string): number | null {
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

/** Parse list-page HTML into competition stubs (id, slug, title, description). */
function parseList(
  html: string,
): Array<
  Omit<
    CompetitionRaw,
    "funderText" | "fundingType" | "opensText" | "closesText"
  >
> {
  const out: Array<
    Omit<
      CompetitionRaw,
      "funderText" | "fundingType" | "opensText" | "closesText"
    >
  > = [];
  const seen = new Set<string>();
  const anchorRe =
    /<a[^>]*class="govuk-link"[^>]*href="(\/competition\/(\d+)\/overview\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, slug, id, titleHtml] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    // Description: first wysiwyg block after this anchor.
    const after = html.slice(m.index, m.index + 2000);
    const desc = after.match(
      /<div[^>]*class="wysiwyg-styles[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    );
    out.push({
      id,
      slug,
      url: `${BASE_URL}${slug}`,
      title: stripTags(titleHtml),
      description: desc ? stripTags(desc[1]) : "",
    });
  }
  return out;
}

/** Pull opens/closes/funding/funder from a competition overview page. */
function parseOverview(html: string): {
  opensText: string | null;
  closesText: string | null;
  fundingType: string | null;
  funderText: string | null;
} {
  const opens = html.match(
    /Competition opens:<\/strong>\s*(?:<span>)?\s*([^<]+)/i,
  );
  const closes = html.match(
    /Competition closes:<\/strong>\s*(?:<span>)?\s*([^<]+)/i,
  );
  const funding = html.match(
    /Funding type<\/h2>[\s\S]{0,200}?<p[^>]*>([^<]+)<\/p>/i,
  );
  const funder = html.match(/funding is from ([^.<]+)\./i);
  return {
    opensText: opens ? opens[1].trim() : null,
    closesText: closes ? closes[1].trim() : null,
    fundingType: funding ? stripTags(funding[1]) : null,
    funderText: funder ? stripTags(funder[1]) : null,
  };
}

export const innovateUkConnector: GrantSourceConnector = {
  sourceName: "innovate-uk",
  displayName: "Innovate UK (Innovation Funding Service)",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true,

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = params.cursor ? Number(params.cursor) || 0 : 0;
    if (page > 0) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(
      `${BASE_URL}/competition/search?page=${page}`,
    );
    const stubs = parseList(listHtml).slice(0, MAX_DETAIL_PER_PAGE);

    const items: CompetitionRaw[] = [];
    for (const stub of stubs) {
      try {
        await sleep(REQUEST_DELAY_MS);
        const overview = parseOverview(await getHtml(stub.url));
        items.push({ ...stub, ...overview });
      } catch {
        // Detail fetch failed — keep the stub with nulls so it still ingests.
        items.push({
          ...stub,
          funderText: null,
          fundingType: null,
          opensText: null,
          closesText: null,
        });
      }
    }

    const hasMore = stubs.length >= 10 && page < 10;
    return {
      sourceName: "innovate-uk",
      rawItems: items,
      nextCursor: hasMore ? String(page + 1) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const c = raw as CompetitionRaw;
    if (!c.id || !c.title) return [];

    const openAt = parseUkDate(c.opensText);
    const deadlineAt = parseUkDate(c.closesText);
    const amount = parseAmount(c.description);

    return [
      {
        sourceName: "innovate-uk",
        sourceNoticeId: c.id,
        sourceUrl: c.url,
        applicationUrl: c.url,
        title: c.title,
        description: c.description || null,
        funderName: c.funderText || "Innovate UK (UKRI)",
        funderId: null,
        funderRegion: "United Kingdom",
        fundingType: (c.fundingType ?? "grant").toLowerCase().includes("loan")
          ? "loan"
          : "grant",
        amountMin: null,
        amountMax: amount,
        currency: "GBP",
        openAt,
        deadlineAt,
        status: deriveStatus(openAt, deadlineAt),
        themes: [],
        sectors: [],
        regions: ["United Kingdom"],
        eligibilityText: null,
        eligibleOrgTypes: [], // varies per competition — no hard-stop
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: openAt,
        rawJson: raw,
      },
    ];
  },
};
