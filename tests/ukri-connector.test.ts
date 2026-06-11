/**
 * UKRI Funding Finder connector unit tests — pure parsing only, no network or DB.
 * Fixtures in tests/fixtures/ are TRIMMED copies of real ukri.org markup fetched on
 * 2026-06-11 (scripts/nav/footer stripped, representative entries kept):
 *   - ukri-listing-page.html          open-filtered listing (3 entries + pagination)
 *   - ukri-opportunity-flf.html       multi-funder, Total fund, apply button
 *   - ukri-opportunity-defra.html     Eligibility summary section, IFS apply button
 *   - ukri-opportunity-pet-imaging.html  Maximum award row, NO apply button
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ukriFundingFinderConnector,
  extractOpportunityUrls,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  type UkriOpportunityRaw,
} from "@/lib/grants/connectors/ukri-funding-finder";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

function makeRaw(overrides: Partial<UkriOpportunityRaw>): UkriOpportunityRaw {
  return {
    id: "some-opportunity",
    slug: "some-opportunity",
    url: "https://www.ukri.org/opportunity/some-opportunity/",
    title: null,
    html: null,
    listedAt: "2026-06-11T09:00:00.000Z",
    ...overrides,
  };
}

describe("ukri-funding-finder listing parsing", () => {
  const listing = fixture("ukri-listing-page.html");

  it("extracts opportunity URLs with listing titles, excluding feed/pagination links", () => {
    const stubs = extractOpportunityUrls(listing);
    expect(stubs.map((s) => s.slug)).toEqual([
      "future-leaders-fellowship-round-11",
      "defra-farming-innovation-investor-partnership-2026",
      "national-pet-imaging-platform-data-platform",
    ]);
    expect(stubs[0].url).toBe(
      "https://www.ukri.org/opportunity/future-leaders-fellowship-round-11/",
    );
    expect(stubs[0].title).toBe("Future Leaders Fellowships: round 11");
    // /opportunity/feed/ and /opportunity/page/N/ links must never be treated
    // as opportunities.
    expect(stubs.some((s) => s.slug === "feed" || s.slug === "page")).toBe(
      false,
    );
  });

  it("dedupes repeated links to the same opportunity", () => {
    const doubled = listing + listing;
    const stubs = extractOpportunityUrls(doubled);
    expect(stubs).toHaveLength(3);
  });

  it("detects the next-page link in the pagination nav", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    expect(hasNextListingPage("<html><body>no nav</body></html>")).toBe(false);
  });
});

describe("ukri-funding-finder cursor logic", () => {
  it("starts at page 1 with no cursor and resumes from a JSON {page} cursor", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor(JSON.stringify({ page: 4 }))).toBe(4);
  });

  it("is resilient to bare-number and malformed cursors", () => {
    expect(parseCursor("3")).toBe(3);
    expect(parseCursor("garbage")).toBe(1);
    expect(parseCursor('{"page":"nope"}')).toBe(1);
    expect(parseCursor('{"page":0}')).toBe(1);
  });

  it("builds the open-filtered listing URL, paged from page 2 onwards", () => {
    expect(listingUrl(1)).toBe(
      "https://www.ukri.org/opportunity/?filter_status%5B0%5D=open&filter_order=closing_date",
    );
    expect(listingUrl(3)).toBe(
      "https://www.ukri.org/opportunity/page/3/?filter_status%5B0%5D=open&filter_order=closing_date",
    );
  });
});

describe("ukri-funding-finder normalize", () => {
  it("parses a multi-funder opportunity (FLF): title, dates, total fund, apply URL", async () => {
    const raw = makeRaw({
      id: "future-leaders-fellowship-round-11",
      slug: "future-leaders-fellowship-round-11",
      url: "https://www.ukri.org/opportunity/future-leaders-fellowship-round-11/",
      html: fixture("ukri-opportunity-flf.html"),
    });
    const [g] = await ukriFundingFinderConnector.normalize(raw);

    expect(g.sourceName).toBe("ukri-funding-finder");
    expect(g.sourceNoticeId).toBe("future-leaders-fellowship-round-11");
    expect(g.title).toBe("Future Leaders Fellowships: round 11");
    expect(g.title).not.toMatch(/funding opportunity/i); // visually-hidden prefix removed
    expect(g.status).toBe("open");
    expect(g.funderName).toContain("UK Research and Innovation");
    expect(g.funderName).toContain("(BBSRC)");
    expect(g.fundingType).toBe("grant"); // "Fellowship" maps into the grant vocab
    expect(g.amountMax).toBe(110_000_000); // Total fund £110,000,000
    expect(g.amountMin).toBeNull();
    expect(g.currency).toBe("GBP");
    expect(g.openAt).toMatch(/^2026-02-02T/);
    expect(g.deadlineAt).toMatch(/^2026-06-16T/);
    expect(g.publishedAt).toMatch(/^2026-02-02T/);
    expect(g.applicationUrl).toBe(
      "https://funding-service.ukri.org/OPP1194/apply/1222",
    );
    expect(g.regions).toEqual(["United Kingdom"]);
    expect(g.rawJson).toBe(raw);
  });

  it("splits description from the Eligibility summary section (Defra)", async () => {
    const raw = makeRaw({
      id: "defra-farming-innovation-investor-partnership-2026",
      slug: "defra-farming-innovation-investor-partnership-2026",
      url: "https://www.ukri.org/opportunity/defra-farming-innovation-investor-partnership-2026/",
      html: fixture("ukri-opportunity-defra.html"),
    });
    const [g] = await ukriFundingFinderConnector.normalize(raw);

    expect(g.title).toBe("Defra Farming Innovation Investor Partnership 2026");
    expect(g.description).toContain("innovative farming solutions");
    expect(g.description).not.toContain("single applicants only");
    expect(g.eligibilityText).toContain("single applicants only");
    expect(g.eligibilityText).toContain(
      "UK registered micro, small or medium sized enterprise",
    );
    expect(g.funderName).toBe("Innovate UK");
    expect(g.amountMax).toBe(5_000_000); // Total fund
    expect(g.deadlineAt).toMatch(/^2026-06-17T/);
    expect(g.applicationUrl).toContain(
      "apply-for-innovation-funding.service.gov.uk/competition/2472",
    );
  });

  it("uses the Maximum award row and falls back to the page URL when there is no apply button", async () => {
    const url =
      "https://www.ukri.org/opportunity/national-pet-imaging-platform-data-platform/";
    const raw = makeRaw({
      id: "national-pet-imaging-platform-data-platform",
      slug: "national-pet-imaging-platform-data-platform",
      url,
      html: fixture("ukri-opportunity-pet-imaging.html"),
    });
    const [g] = await ukriFundingFinderConnector.normalize(raw);

    expect(g.amountMax).toBe(4_700_000); // Maximum award beats Total fund
    expect(g.applicationUrl).toBe(url); // no Start application button on this page
    expect(g.funderName).toContain("Medical Research Council (MRC)");
    expect(g.openAt).toMatch(/^2026-04-01T/);
  });

  it("falls back to the listing title when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only opportunity",
      html: null,
    });
    const [g] = await ukriFundingFinderConnector.normalize(raw);
    expect(g.title).toBe("Listing-only opportunity");
    expect(g.sourceNoticeId).toBe("some-opportunity");
    expect(g.sourceUrl).toBe(
      "https://www.ukri.org/opportunity/some-opportunity/",
    );
    expect(g.status).toBe("open"); // open-filtered crawl default
    expect(g.deadlineAt).toBeNull();
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await ukriFundingFinderConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].funderName).toBeNull();
  });

  it("returns [] when there is no slug or no title at all", async () => {
    expect(
      await ukriFundingFinderConnector.normalize({
        id: "",
        slug: "",
        url: "",
        title: null,
        html: null,
      }),
    ).toEqual([]);
    expect(
      await ukriFundingFinderConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });
});
