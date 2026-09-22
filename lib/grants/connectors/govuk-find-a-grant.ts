import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
  GrantRow,
  GrantDetails,
} from "../types";
import { richTextToText, richTextLinks, dedupeLinks } from "../richtext";

// GOV.UK "Find a grant" — OPEN UK government grant opportunities (live, applyable),
// Cabinet Office Government Grants Management Function. There is no public API, but the
// service is a Next.js app that embeds its own structured data (the same JSON it renders
// from) in the page's `__NEXT_DATA__` script. We read that embedded JSON rather than
// scraping fragile HTML. Guardrails: official-source public open data (no robots.txt
// restrictions; Crown copyright / OGL), an identifying User-Agent, polite rate-limiting,
// structured public fields only, and NO personal data.
// Listing: /grants?page=N -> props.pageProps.searchResult (10/page) + totalGrants.

const BASE_URL = "https://www.find-government-grants.service.gov.uk";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";
const PER_PAGE = 10;
const REQUEST_DELAY_MS = 400; // polite pacing between page fetches

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface SearchResultItem {
  id: string;
  label: string;
  grantName: string;
  grantShortDescription?: string;
  grantFunder?: string;
  grantLocation?: string[];
  grantApplicantType?: string[];
  grantMinimumAward?: number | null;
  grantMaximumAward?: number | null;
  grantApplicationOpenDate?: string | null;
  grantApplicationCloseDate?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv)(\?|$)/i;

async function fetchNextProps(url: string): Promise<AnyRecord> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Find a Grant ${res.status} for ${url}`);
  }
  const html = await res.text();
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error("Find a Grant: __NEXT_DATA__ not found");
  const data = JSON.parse(m[1]) as AnyRecord;
  return data?.props?.pageProps ?? {};
}

function fetchPageProps(page: number): Promise<AnyRecord> {
  return fetchNextProps(`${BASE_URL}/grants?page=${page}`);
}

const DETAIL_TABS: Array<[string, string]> = [
  ["grantSummaryTab", "Summary"],
  ["grantEligibilityTab", "Eligibility"],
  ["grantObjectivesTab", "Objectives"],
  ["grantDatesTab", "Key dates"],
  ["grantApplyTab", "How to apply"],
  ["grantSupportingInfoTab", "Supporting information"],
];

/** Build deep details from a GOV.UK grant detail page's Contentful fields. */
export function buildGovukDetails(f: AnyRecord): GrantDetails {
  const sections: GrantDetails["sections"] = [];
  let allLinks: GrantDetails["links"] = [];
  for (const [key, heading] of DETAIL_TABS) {
    const doc = f[key];
    if (!doc) continue;
    const text = richTextToText(doc);
    if (text) sections.push({ heading, text });
    allLinks = allLinks.concat(richTextLinks(doc));
  }
  allLinks = dedupeLinks(allLinks);
  return {
    sections,
    links: allLinks.filter((l) => !DOC_EXT.test(l.url)),
    documents: allLinks.filter((l) => DOC_EXT.test(l.url)),
    webpageUrl:
      typeof f.grantWebpageUrl === "string" ? f.grantWebpageUrl : null,
  };
}

/** Map a GOV.UK applicant type to the scoring org-type token vocabulary. */
function applicantTypeToken(raw: string): string | null {
  const t = raw.toLowerCase();
  if (t.includes("individual") || t.includes("personal")) return "individual";
  if (t.includes("local authority") || t.includes("public"))
    return "public-body";
  if (
    t.includes("non-profit") ||
    t.includes("charity") ||
    t.includes("voluntary")
  )
    return "charity";
  if (t.includes("private")) return "company";
  if (t.includes("universit") || t.includes("academic")) return "university";
  return null;
}

function deriveStatus(
  openDate?: string | null,
  closeDate?: string | null,
): GrantStatus {
  const now = Date.now();
  const o = openDate ? Date.parse(openDate) : NaN;
  const c = closeDate ? Date.parse(closeDate) : NaN;
  if (!Number.isNaN(o) && now < o) return "forthcoming";
  if (!Number.isNaN(c) && now > c) return "closed";
  return "open";
}

export const govukFindAGrantConnector: GrantSourceConnector = {
  sourceName: "govuk-find-a-grant",
  displayName: "GOV.UK Find a Grant",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true,

  async fetchDetail(grant: GrantRow): Promise<GrantDetails | null> {
    if (!grant.source_url) return null;
    const pp = await fetchNextProps(grant.source_url);
    const f = pp.grantDetail?.fields;
    if (!f) return null;
    return buildGovukDetails(f);
  },

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = params.cursor ? Number(params.cursor) || 1 : 1;
    if (page > 1) await sleep(REQUEST_DELAY_MS); // pace successive pages

    const pp = await fetchPageProps(page);
    const rawItems: unknown[] = Array.isArray(pp.searchResult)
      ? pp.searchResult
      : [];
    const total = Number(pp.totalGrants ?? 0);
    const current = Number(pp.currentPage ?? page);
    const hasMore = current * PER_PAGE < total && rawItems.length > 0;

    return {
      sourceName: "govuk-find-a-grant",
      rawItems,
      nextCursor: hasMore ? String(current + 1) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const g = raw as SearchResultItem;
    const id = String(g.id ?? "");
    if (!id || !g.grantName) return [];

    const applicantTypes = Array.isArray(g.grantApplicantType)
      ? g.grantApplicantType
      : [];
    const orgTokens = [
      ...new Set(
        applicantTypes
          .map(applicantTypeToken)
          .filter((t): t is string => t !== null),
      ),
    ];
    const eligibilityText =
      applicantTypes.length > 0
        ? `Who can apply: ${applicantTypes.join(", ")}`
        : null;

    const pageUrl = `${BASE_URL}/grants/${g.label}`;

    return [
      {
        sourceName: "govuk-find-a-grant",
        sourceNoticeId: id,
        sourceUrl: pageUrl,
        applicationUrl: pageUrl, // apply via the GOV.UK grant page
        title: g.grantName,
        description: g.grantShortDescription ?? null,
        funderName: g.grantFunder?.trim() || null,
        funderId: null,
        funderRegion: null,
        fundingType: "grant",
        amountMin:
          typeof g.grantMinimumAward === "number" ? g.grantMinimumAward : null,
        amountMax:
          typeof g.grantMaximumAward === "number" ? g.grantMaximumAward : null,
        currency: "GBP",
        openAt: g.grantApplicationOpenDate ?? null,
        deadlineAt: g.grantApplicationCloseDate ?? null,
        status: deriveStatus(
          g.grantApplicationOpenDate,
          g.grantApplicationCloseDate,
        ),
        themes: [],
        sectors: [],
        regions: Array.isArray(g.grantLocation) ? g.grantLocation : [],
        eligibilityText,
        eligibleOrgTypes: orgTokens,
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: g.grantApplicationOpenDate ?? null,
        rawJson: raw,
      },
    ];
  },
};
