/**
 * NI Business Info (Invest NI) connector unit tests — pure parsing only, no
 * network or DB. Fixtures in tests/fixtures/ are TRIMMED copies of real
 * nibusinessinfo.co.uk markup fetched on 2026-06-12 (site chrome stripped,
 * representative entries kept):
 *   - ni-listing-page0.html  Grant-facet Drupal listing (3 of 50 cards, pager
 *                            with a rel="next" link)
 *   - ni-listing-page1.html  last page (2 of 30 cards incl. a rate-relief
 *                            scheme; pager has only Previous)
 *   - ni-detail-btg.html     dated scheme: closing date, "Grants from £5,000
 *                            to £25,000 … 30% match funding", council organiser
 *   - ni-detail-acumen.html  rolling scheme: no closing date, euro/£ twin
 *                            amounts, InterTradeIreland organiser
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  niBusinessInfoConnector,
  extractSchemeCards,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  parseFreeTextDate,
  parseAmountRange,
  classifyFundingType,
  nodeContentRegion,
  type NiBusinessSupportRaw,
} from "@/lib/grants/connectors/ni-business-info";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

function makeRaw(
  overrides: Partial<NiBusinessSupportRaw>,
): NiBusinessSupportRaw {
  return {
    id: "some-scheme",
    slug: "some-scheme",
    url: "https://www.nibusinessinfo.co.uk/business-support/some-scheme",
    title: null,
    summary: null,
    html: null,
    ...overrides,
  };
}

describe("ni-business-info listing parsing", () => {
  const listing = fixture("ni-listing-page0.html");

  it("extracts scheme cards with slug, title and one-line summary", () => {
    const cards = extractSchemeCards(listing);
    expect(cards.map((c) => c.slug)).toEqual([
      "acumen-programme",
      "agri-food-investment-initiative",
      "business-transformation-grants-programme",
    ]);
    const [acumen, agri, btg] = cards;
    expect(acumen.title).toBe("Acumen Programme");
    expect(acumen.summary).toContain("up to £17,250 for a sales resource");
    expect(agri.url).toBe(
      "https://www.nibusinessinfo.co.uk/business-support/agri-food-investment-initiative",
    );
    expect(btg.title).toBe("Business Transformation Grants Programme");
  });

  it("dedupes repeated cards for the same scheme", () => {
    expect(extractSchemeCards(listing + listing)).toHaveLength(3);
  });

  it("detects the pager's next link, absent on the last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    const last = fixture("ni-listing-page1.html");
    expect(hasNextListingPage(last)).toBe(false); // pager has only Previous
    expect(extractSchemeCards(last).map((c) => c.slug)).toEqual([
      "open-grants-programme",
      "residential-homes-rate-relief",
    ]);
  });
});

describe("ni-business-info cursor logic", () => {
  it("starts at Drupal page 0 with no cursor and resumes from a JSON {page} cursor", () => {
    expect(parseCursor(null)).toBe(0);
    expect(parseCursor(undefined)).toBe(0);
    expect(parseCursor(JSON.stringify({ page: 1 }))).toBe(1);
  });

  it("is resilient to bare-number and malformed cursors", () => {
    expect(parseCursor("1")).toBe(1);
    expect(parseCursor("garbage")).toBe(0);
    expect(parseCursor('{"page":"nope"}')).toBe(0);
  });

  it("builds the Grant-facet listing URL, 0-indexed like the Drupal pager", () => {
    expect(listingUrl(0)).toBe(
      "https://www.nibusinessinfo.co.uk/business-support?field_support_type_target_id%5B239%5D=239",
    );
    expect(listingUrl(1)).toBe(
      "https://www.nibusinessinfo.co.uk/business-support?field_support_type_target_id%5B239%5D=239&page=1",
    );
  });

  it("declares itself a complete open-call source for the delisting prune", () => {
    // The Grant-facet walk enumerates every currently listed grant scheme.
    expect(niBusinessInfoConnector.listsAllOpenCalls).toBe(true);
  });
});

describe("ni-business-info amount + type parsing", () => {
  it("parses '£X to £Y' prose ranges and single 'up to' ceilings", () => {
    expect(
      parseAmountRange("Grants from £5,000 to £25,000 are available"),
    ).toEqual({ min: 5_000, max: 25_000 });
    expect(parseAmountRange("Funding of up to £17,250")).toEqual({
      min: null,
      max: 17_250,
    });
    expect(parseAmountRange(null)).toEqual({ min: null, max: null });
  });

  it("anchors on £ so euro twin amounts are skipped", () => {
    expect(
      parseAmountRange("up to a maximum of €21,562/£17,250 per year"),
    ).toEqual({ min: null, max: 17_250 });
  });

  it("classifies the Grant facet's mixed contents lightly", () => {
    expect(
      classifyFundingType("Business Transformation Grants Programme"),
    ).toBe("grant");
    expect(classifyFundingType("Inclusive Tourism Vouchers")).toBe("grant");
    expect(classifyFundingType("Growth Loan Fund for SMEs")).toBe("loan");
    expect(classifyFundingType("Residential Homes Rate Relief")).toBe("other");
    expect(classifyFundingType("Charitable Exemption for rates")).toBe("other");
  });

  it("parses free-text closing dates", () => {
    expect(
      parseFreeTextDate(
        "This programme closes at midday on Thursday 16 July 2026.",
      ),
    ).toMatch(/^2026-07-16T/);
    expect(parseFreeTextDate("applications welcome at any time")).toBeNull();
  });
});

describe("ni-business-info node content region", () => {
  it("scopes to the business-support node, dropping page chrome", () => {
    const page = fixture("ni-detail-btg.html");
    const region = nodeContentRegion(page);
    expect(region).toContain("Business Transformation Grants Programme");
    expect(region).toContain("Who it is for");
    expect(region).not.toContain("Main navigation"); // chrome dropped
    expect(region).not.toContain("Printer-friendly version"); // footer dropped
  });

  it("falls back to the full page when the template changes", () => {
    expect(nodeContentRegion("<main>new markup</main>")).toBe(
      "<main>new markup</main>",
    );
  });
});

describe("ni-business-info normalize", () => {
  it("parses a dated scheme (Business Transformation Grants) in full", async () => {
    const raw = makeRaw({
      id: "business-transformation-grants-programme",
      slug: "business-transformation-grants-programme",
      url: "https://www.nibusinessinfo.co.uk/business-support/business-transformation-grants-programme",
      html: nodeContentRegion(fixture("ni-detail-btg.html")),
    });
    const [g] = await niBusinessInfoConnector.normalize(raw);

    expect(g.sourceName).toBe("ni-business-info");
    expect(g.sourceNoticeId).toBe("business-transformation-grants-programme");
    expect(g.title).toBe("Business Transformation Grants Programme");
    expect(g.description).toContain("micro and small businesses");
    expect(g.status).toBe("open");
    expect(g.deadlineAt).toMatch(/^2026-07-16T/); // "midday on Thursday 16 July 2026"
    expect(g.amountMin).toBe(5_000); // "Grants from £5,000 to £25,000"
    expect(g.amountMax).toBe(25_000);
    expect(g.matchFundingRequired).toBe(true); // "70% grant, 30% match funding"
    expect(g.funderName).toBe("Derry City and Strabane District Council");
    expect(g.fundingType).toBe("grant");
    expect(g.regions).toEqual(["Northern Ireland"]);
    expect(g.funderRegion).toBe("Northern Ireland");
    expect(g.eligibilityText).toContain("Derry City and Strabane");
    expect(g.eligibilityText).toContain("maximum of 49 full-time equivalent");
    expect(g.applicationUrl).toBe(
      "https://www.derrystrabane.com/business/business-support/local-economic-partnership",
    );
    expect(g.publishedAt).toMatch(/^2026-06-11T/);
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("parses an undated scheme (Acumen) as rolling, ignoring eligibility £ caps", async () => {
    const raw = makeRaw({
      id: "acumen-programme",
      slug: "acumen-programme",
      url: "https://www.nibusinessinfo.co.uk/business-support/acumen-programme",
      html: nodeContentRegion(fixture("ni-detail-acumen.html")),
    });
    const [g] = await niBusinessInfoConnector.normalize(raw);

    expect(g.title).toBe("Acumen Programme");
    expect(g.status).toBe("rolling"); // no closing-date block
    expect(g.deadlineAt).toBeNull();
    // Amounts come from "Support you can get" (£17,250 and £9,200) — the
    // "£40 million" turnover cap in "Who it is for" must not leak in.
    expect(g.amountMin).toBe(9_200);
    expect(g.amountMax).toBe(17_250);
    expect(g.matchFundingRequired).toBe(false);
    expect(g.funderName).toBe("InterTradeIreland");
    expect(g.eligibilityText).toContain("manufacturing or tradable services");
    expect(g.applicationUrl).toBe(
      "https://intertradeireland.com/sales-growth/acumen",
    );
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only scheme",
      summary: "Funding of up to £10,000 for energy efficiency.",
      html: null,
    });
    const [g] = await niBusinessInfoConnector.normalize(raw);
    expect(g.title).toBe("Listing-only scheme");
    expect(g.sourceNoticeId).toBe("some-scheme");
    expect(g.description).toBe(
      "Funding of up to £10,000 for energy efficiency.",
    );
    expect(g.amountMax).toBe(10_000); // summary is the amount fallback
    expect(g.status).toBe("rolling");
    expect(g.applicationUrl).toBe(g.sourceUrl);
    expect(g.regions).toEqual(["Northern Ireland"]);
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await niBusinessInfoConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].deadlineAt).toBeNull();
    expect(grants[0].status).toBe("rolling");
  });

  it("recovers the slug from the URL and returns [] when nothing identifies the scheme", async () => {
    const [fromUrl] = await niBusinessInfoConnector.normalize({
      id: "",
      slug: "",
      url: "https://www.nibusinessinfo.co.uk/business-support/acumen-programme",
      title: "Acumen Programme",
    });
    expect(fromUrl.sourceNoticeId).toBe("acumen-programme");

    expect(
      await niBusinessInfoConnector.normalize({
        id: "",
        slug: "",
        url: "",
        title: null,
        html: null,
      }),
    ).toEqual([]);
    expect(
      await niBusinessInfoConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });
});
