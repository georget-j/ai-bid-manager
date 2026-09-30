/**
 * TNL Community Fund connector unit tests — pure parsing only, no network or DB.
 * Fixtures in tests/fixtures/ are TRIMMED copies of real tnlcommunityfund.org.uk
 * markup fetched on 2026-06-12 (site chrome stripped, representative entries kept):
 *   - tnl-listing-open.html            open-filtered listing (3 cards + filter
 *                                      sidebar + pagination with a Next link)
 *   - tnl-listing-last.html            last listing page (1 card, no Next link)
 *   - tnl-programme-awards-for-all.html  always-open programme, England,
 *                                      £300–£20,000, how-to-apply nav, JSON-LD
 *   - tnl-programme-climate-action.html  all-four-nations programme, £2.5m–£7m,
 *                                      "must meet ... criteria" section, JSON-LD
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  tnlCommunityFundConnector,
  extractProgrammeCards,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  parseAmountRange,
  parseRegions,
  parseClosingDate,
  type TnlProgrammeRaw,
} from "@/lib/grants/connectors/tnl-community-fund";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

function makeRaw(overrides: Partial<TnlProgrammeRaw>): TnlProgrammeRaw {
  return {
    id: "some-programme",
    slug: "some-programme",
    url: "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/some-programme",
    title: null,
    summary: null,
    location: null,
    amount: null,
    status: null,
    html: null,
    listedAt: "2026-06-12T09:00:00.000Z",
    ...overrides,
  };
}

describe("tnl-community-fund listing parsing", () => {
  const listing = fixture("tnl-listing-open.html");

  it("extracts programme cards with title, summary and footer fields", () => {
    const cards = extractProgrammeCards(listing);
    expect(cards.map((c) => c.slug)).toEqual([
      "community-action",
      "dormant-assets-for-all",
      "national-lottery-awards-for-all-england",
    ]);
    const [community, dormant, awards] = cards;
    expect(community.url).toBe(
      "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/community-action",
    );
    expect(community.title).toBe("Community Action");
    // Entity decoding: &#x2019; → ’ and &#xA3; → £.
    expect(community.summary).toContain("work that’s open, inclusive");
    expect(community.location).toBe("Scotland");
    expect(community.amount).toBe("£20,001 to £250,000");
    expect(community.status).toBe("Open to applications");
    expect(dormant.location).toBe("Northern Ireland");
    expect(awards.amount).toBe("£300 to £20,000");
  });

  it("never mistakes the filter-sidebar checkboxes or labels for cards", () => {
    const cards = extractProgrammeCards(listing);
    expect(cards).toHaveLength(3); // sidebar has its own status/amount/country labels
    expect(cards.every((c) => c.title)).toBe(true);
  });

  it("dedupes repeated links to the same programme", () => {
    expect(extractProgrammeCards(listing + listing)).toHaveLength(3);
  });

  it("detects the next-page link, absent on the last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    const last = fixture("tnl-listing-last.html");
    expect(hasNextListingPage(last)).toBe(false); // has Previous, but no Next
    expect(extractProgrammeCards(last).map((c) => c.slug)).toEqual([
      "the-solidarity-fund",
    ]);
  });
});

describe("tnl-community-fund cursor logic", () => {
  it("starts at page 1 with no cursor and resumes from a JSON {page} cursor", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor(JSON.stringify({ page: 3 }))).toBe(3);
  });

  it("is resilient to bare-number and malformed cursors", () => {
    expect(parseCursor("2")).toBe(2);
    expect(parseCursor("garbage")).toBe(1);
    expect(parseCursor('{"page":"nope"}')).toBe(1);
    expect(parseCursor('{"page":0}')).toBe(1);
  });

  it("builds the open-filtered listing URL, paged from page 2 onwards", () => {
    expect(listingUrl(1)).toBe(
      "https://www.tnlcommunityfund.org.uk/funding/funding-programmes?status=open",
    );
    expect(listingUrl(3)).toBe(
      "https://www.tnlcommunityfund.org.uk/funding/funding-programmes?status=open&page=3",
    );
  });
});

describe("tnl-community-fund amount + region parsing", () => {
  it("parses £-to-£ ranges including thousands separators", () => {
    expect(parseAmountRange("£300 to £20,000")).toEqual({
      min: 300,
      max: 20_000,
    });
    expect(parseAmountRange("£2,500,000 to £7,000,000")).toEqual({
      min: 2_500_000,
      max: 7_000_000,
    });
  });

  it("treats a single figure as a ceiling and handles million units", () => {
    expect(parseAmountRange("Up to £10,000")).toEqual({
      min: null,
      max: 10_000,
    });
    expect(parseAmountRange("£2.5 million")).toEqual({
      min: null,
      max: 2_500_000,
    });
    expect(parseAmountRange(null)).toEqual({ min: null, max: null });
    expect(parseAmountRange("no figures here")).toEqual({
      min: null,
      max: null,
    });
  });

  it("maps location strings to regions, collapsing all four nations to UK", () => {
    expect(parseRegions("Scotland")).toEqual(["Scotland"]);
    expect(parseRegions("Northern Ireland")).toEqual(["Northern Ireland"]);
    expect(parseRegions("England, Scotland, Northern Ireland, Wales")).toEqual([
      "United Kingdom",
    ]);
    expect(parseRegions("UK-wide")).toEqual(["United Kingdom"]);
    expect(parseRegions(null)).toEqual([]);
    expect(parseRegions("the Moon")).toEqual([]);
  });
});

describe("tnl-community-fund normalize", () => {
  it("parses an always-open programme (Awards for All England) as rolling", async () => {
    const raw = makeRaw({
      id: "national-lottery-awards-for-all-england",
      slug: "national-lottery-awards-for-all-england",
      url: "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/national-lottery-awards-for-all-england",
      html: fixture("tnl-programme-awards-for-all.html"),
    });
    const [g] = await tnlCommunityFundConnector.normalize(raw);

    expect(g.sourceName).toBe("tnl-community-fund");
    expect(g.sourceNoticeId).toBe("national-lottery-awards-for-all-england");
    expect(g.title).toBe("National Lottery Awards for All England"); // JSON-LD name, trimmed
    expect(g.status).toBe("rolling"); // open + no closing date stated
    expect(g.deadlineAt).toBeNull();
    expect(g.funderName).toBe("The National Lottery Community Fund");
    expect(g.fundingType).toBe("grant");
    expect(g.amountMin).toBe(300); // JSON-LD MonetaryAmount
    expect(g.amountMax).toBe(20_000);
    expect(g.currency).toBe("GBP");
    expect(g.regions).toEqual(["England"]);
    expect(g.description).toContain("bring people together");
    expect(g.applicationUrl).toBe(
      "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/national-lottery-awards-for-all-england/how-to-apply",
    );
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("parses a four-nation programme (Climate Action Fund) as UK-wide with criteria", async () => {
    const raw = makeRaw({
      id: "climate-action-fund-food-systems",
      slug: "climate-action-fund-food-systems",
      url: "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/climate-action-fund-food-systems",
      html: fixture("tnl-programme-climate-action.html"),
    });
    const [g] = await tnlCommunityFundConnector.normalize(raw);

    expect(g.title).toBe("Climate Action Fund - Food Systems");
    expect(g.regions).toEqual(["United Kingdom"]); // England, Scotland, NI, Wales
    expect(g.amountMin).toBe(2_500_000);
    expect(g.amountMax).toBe(7_000_000);
    expect(g.status).toBe("rolling");
    expect(g.eligibilityText).toContain("You must meet all of these criteria");
    expect(g.eligibilityText).toContain("work in a partnership");
    expect(g.description).toContain("strengthen our food system");
    expect(g.applicationUrl).toContain(
      "/climate-action-fund-food-systems/how-to-apply",
    );
  });

  it("becomes 'open' with a deadline when the page states a real closing date", async () => {
    const html = fixture("tnl-programme-awards-for-all.html").replace(
      "<h2>What we can fund</h2>",
      "<p>The closing date for applications is 12pm on 17 March 2027.</p><h2>What we can fund</h2>",
    );
    const raw = makeRaw({
      id: "national-lottery-awards-for-all-england",
      slug: "national-lottery-awards-for-all-england",
      html,
    });
    const [g] = await tnlCommunityFundConnector.normalize(raw);
    expect(g.status).toBe("open");
    expect(g.deadlineAt).toMatch(/^2027-03-17T/);
  });

  it("does not mistake incidental dates in the prose for a deadline", () => {
    expect(
      parseClosingDate(
        "<p>This programme launched on 4 February 2025 and supports projects starting after 1 April 2026.</p>",
      ),
    ).toBeNull();
    expect(
      parseClosingDate("<p>Applications close at midday on 9 June 2027.</p>"),
    ).toMatch(/^2027-06-09T/);
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only programme",
      summary: "Funding for communities in Scotland.",
      location: "Scotland",
      amount: "£20,001 to £250,000",
      status: "Open to applications",
      html: null,
    });
    const [g] = await tnlCommunityFundConnector.normalize(raw);
    expect(g.title).toBe("Listing-only programme");
    expect(g.sourceNoticeId).toBe("some-programme");
    expect(g.description).toBe("Funding for communities in Scotland.");
    expect(g.regions).toEqual(["Scotland"]);
    expect(g.amountMin).toBe(20_001);
    expect(g.amountMax).toBe(250_000);
    expect(g.status).toBe("rolling"); // open at source, no closing date known
    expect(g.applicationUrl).toBe(g.sourceUrl); // no how-to-apply page known
    expect(g.funderName).toBe("The National Lottery Community Fund");
  });

  it("maps Coming soon / Closed listing statuses defensively", async () => {
    const [coming] = await tnlCommunityFundConnector.normalize(
      makeRaw({ title: "Soon", status: "Coming soon" }),
    );
    expect(coming.status).toBe("forthcoming");
    const [closed] = await tnlCommunityFundConnector.normalize(
      makeRaw({ title: "Gone", status: "Closed to applications" }),
    );
    expect(closed.status).toBe("closed");
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await tnlCommunityFundConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].regions).toEqual([]);
    expect(grants[0].status).toBe("rolling");
  });

  it("survives malformed JSON-LD by falling back to page markup", async () => {
    const html = fixture("tnl-programme-awards-for-all.html").replace(
      /<script type="application\/ld&#x2B;json">[\s\S]*?<\/script>/,
      '<script type="application/ld&#x2B;json">{not json…</script>',
    );
    const raw = makeRaw({
      slug: "national-lottery-awards-for-all-england",
      html,
    });
    const [g] = await tnlCommunityFundConnector.normalize(raw);
    expect(g.title).toBe("National Lottery Awards for All England"); // from the h1
    expect(g.amountMin).toBe(300); // overview "£300 to £20,000" text
    expect(g.amountMax).toBe(20_000);
    expect(g.regions).toEqual(["England"]);
  });

  it("recovers the slug from the URL and returns [] when nothing identifies the programme", async () => {
    const [fromUrl] = await tnlCommunityFundConnector.normalize({
      id: "",
      slug: "",
      url: "https://www.tnlcommunityfund.org.uk/funding/funding-programmes/community-action",
      title: "Community Action",
    });
    expect(fromUrl.sourceNoticeId).toBe("community-action");

    expect(
      await tnlCommunityFundConnector.normalize({
        id: "",
        slug: "",
        url: "",
        title: null,
        html: null,
      }),
    ).toEqual([]);
    expect(
      await tnlCommunityFundConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });

  it("declares itself a complete open-call source for the delisting prune", () => {
    expect(tnlCommunityFundConnector.sourceName).toBe("tnl-community-fund");
    expect(tnlCommunityFundConnector.listsAllOpenCalls).toBe(true);
  });
});
