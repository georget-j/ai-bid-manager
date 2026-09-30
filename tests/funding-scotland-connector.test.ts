/**
 * Funding Scotland (SCVO) connector unit tests — pure parsing only, no network
 * or DB. Fixtures in tests/fixtures/ are TRIMMED copies of real funding.scot
 * markup fetched on 2026-06-12 (site chrome stripped, representative entries kept):
 *   - fs-listing-open.html   /search page 1 (3 of 10 cards: a tour-attributed
 *                            first card, a plain card, and a card with a
 *                            "Next deadline" line; totals header; live Next link)
 *   - fs-listing-last.html   /search?page=20 (1 card, next-page link disabled —
 *                            the anonymous 20-page clamp)
 *   - fs-fund-redress.html   rolling fund detail: "Open now, no published
 *                            deadlines", premium-gated award sizes, UK-wide,
 *                            activity/beneficiary chips, funder contact tab
 *   - fs-fund-barcapel.html  dated fund detail: "Next deadline is Monday, 5th
 *                            October, 2026", Scotland + UK chips, cfemail links
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  fundingScotlandConnector,
  extractFundCards,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  parseFreeTextDate,
  parseRegions,
  stableContentRegion,
  type FundingScotlandFundRaw,
} from "@/lib/grants/connectors/funding-scotland";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

function makeRaw(
  overrides: Partial<FundingScotlandFundRaw>,
): FundingScotlandFundRaw {
  return {
    id: "a0R0000000Fake01AAA",
    slug: "some-fund",
    url: "https://funding.scot/funds/a0R0000000Fake01AAA/some-fund",
    title: null,
    snippet: null,
    statusText: null,
    nextDeadlineText: null,
    html: null,
    ...overrides,
  };
}

describe("funding-scotland listing parsing", () => {
  const listing = fixture("fs-listing-open.html");

  it("extracts fund cards with Salesforce id, slug, title and snippet", () => {
    const cards = extractFundCards(listing);
    expect(cards.map((c) => c.id)).toEqual([
      "a0RP10000046rKHMAY",
      "a0R0N00000LeoA4UAJ",
      "a0Rb0000000Ng4lEAC",
    ]);
    const [grid, redress, barcapel] = cards;
    // The first card carries data-step tour attributes before its class.
    expect(grid.title).toBe("University of Glasgow - GRID Civic Grant Funds");
    expect(grid.statusText).toBe("Currently open");
    expect(redress.slug).toBe("energy-saving-trust-energy-redress-scheme");
    // Card URLs are canonical — no ?page= listing context.
    expect(redress.url).toBe(
      "https://funding.scot/funds/a0R0N00000LeoA4UAJ/energy-saving-trust-energy-redress-scheme",
    );
    expect(redress.snippet).toContain("cold homes and high energy bills");
    expect(redress.nextDeadlineText).toBeNull();
    expect(barcapel.title).toBe("Barcapel Foundation Limited");
    expect(barcapel.nextDeadlineText).toBe("5 Oct 2026");
  });

  it("dedupes repeated cards for the same fund", () => {
    expect(extractFundCards(listing + listing)).toHaveLength(3);
  });

  it("detects the next-page link, disabled on the clamped last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    const last = fixture("fs-listing-last.html");
    expect(hasNextListingPage(last)).toBe(false); // <a href="" class="disabled">
    expect(extractFundCards(last).map((c) => c.slug)).toEqual([
      "st-james-s-place-foundation-major-grants-programme",
    ]);
  });
});

describe("funding-scotland cursor + slice walk", () => {
  it("starts at the asc slice page 1 and resumes from a JSON cursor", () => {
    expect(parseCursor(null)).toEqual({ slice: "asc", page: 1 });
    expect(parseCursor(undefined)).toEqual({ slice: "asc", page: 1 });
    expect(parseCursor(JSON.stringify({ slice: "desc", page: 7 }))).toEqual({
      slice: "desc",
      page: 7,
    });
  });

  it("is resilient to malformed cursors", () => {
    expect(parseCursor("garbage")).toEqual({ slice: "asc", page: 1 });
    expect(parseCursor('{"slice":"up","page":"x"}')).toEqual({
      slice: "asc",
      page: 1,
    });
    expect(parseCursor('{"page":0}')).toEqual({ slice: "asc", page: 1 });
  });

  it("builds alphabetical slice URLs, paged from page 2 onwards", () => {
    expect(listingUrl("asc", 1)).toBe(
      "https://funding.scot/search?sort=alphabetical_asc",
    );
    expect(listingUrl("asc", 3)).toBe(
      "https://funding.scot/search?sort=alphabetical_asc&page=3",
    );
    expect(listingUrl("desc", 1)).toBe(
      "https://funding.scot/search?sort=alphabetical_desc",
    );
  });

  it("stays a partial source: the prune must never run on a capped walk", () => {
    // Anonymous pagination clamps at 20 pages (~200 of ~788 funds per slice),
    // so a "complete" run still misses funds — listsAllOpenCalls must be false.
    expect(fundingScotlandConnector.listsAllOpenCalls).toBe(false);
  });
});

describe("funding-scotland date parsing", () => {
  it("parses the site's free-text date forms", () => {
    expect(parseFreeTextDate("Next deadline: 5 Oct 2026")).toMatch(
      /^2026-10-05T/,
    );
    expect(
      parseFreeTextDate("Next deadline is Monday, 5th October, 2026"),
    ).toMatch(/^2026-10-05T/);
    expect(parseFreeTextDate("closes 16 July 2026")).toMatch(/^2026-07-16T/);
  });

  it("returns null for undated 'when to apply' prose", () => {
    expect(parseFreeTextDate("Open now, no published deadlines")).toBeNull();
    expect(
      parseFreeTextDate(
        "The board meets twice a year, in May/June and November",
      ),
    ).toBeNull();
    expect(parseFreeTextDate(null)).toBeNull();
  });

  it("maps geography chips, expanding UK to United Kingdom", () => {
    expect(parseRegions(["Scotland", "UK"])).toEqual([
      "Scotland",
      "United Kingdom",
    ]);
    expect(parseRegions([])).toEqual([]);
  });
});

describe("funding-scotland stable content region", () => {
  it("scopes to the fund region and scrubs volatile review times + cfemail tokens", () => {
    const page = fixture("fs-fund-barcapel.html");
    const region = stableContentRegion(page);
    expect(region).toContain("<h1>Barcapel Foundation Limited</h1>");
    expect(region).toContain("Currently open"); // header chip kept
    expect(region).not.toContain("Funding</span> Scotland"); // chrome h1 dropped
    expect(region).not.toContain("<script data-cfasync"); // trailing scripts dropped
    // Hash-stability scrubs: relative review times and per-response email tokens.
    expect(region).not.toMatch(/Last reviewed about/i);
    expect(region).not.toContain("/cdn-cgi/l/email-protection");
    expect(region).toContain("[email scrubbed]");
  });

  it("falls back to the full (scrubbed) page when the template changes", () => {
    const region = stableContentRegion(
      "<main>new markup, Last reviewed about 3 hours ago</main>",
    );
    expect(region).toContain("<main>new markup");
    expect(region).not.toMatch(/about 3 hours ago/);
  });
});

describe("funding-scotland normalize", () => {
  const redressRegion = stableContentRegion(fixture("fs-fund-redress.html"));

  it("parses a rolling fund (Energy Redress) with premium-gated amounts as null", async () => {
    const raw = makeRaw({
      id: "a0R0N00000LeoA4UAJ",
      slug: "energy-saving-trust-energy-redress-scheme",
      url: "https://funding.scot/funds/a0R0N00000LeoA4UAJ/energy-saving-trust-energy-redress-scheme",
      html: redressRegion,
    });
    const [g] = await fundingScotlandConnector.normalize(raw);

    expect(g.sourceName).toBe("funding-scotland");
    expect(g.sourceNoticeId).toBe("a0R0N00000LeoA4UAJ"); // stable Salesforce id
    expect(g.title).toBe("Energy Saving Trust - Energy Redress Scheme");
    expect(g.status).toBe("rolling"); // "Open now, no published deadlines"
    expect(g.deadlineAt).toBeNull();
    expect(g.funderName).toBe("Energy Saving Trust");
    expect(g.funderId).toBe("001b000000St8RIAAZ");
    expect(g.fundingType).toBe("grant");
    expect(g.amountMin).toBeNull(); // "Premium information" — never a number
    expect(g.amountMax).toBeNull();
    expect(g.currency).toBe("GBP");
    expect(g.regions).toEqual(["United Kingdom"]);
    expect(g.description).toContain(
      "build the capacity of the community energy sector",
    );
    expect(g.description).not.toContain("Premium information");
    expect(g.eligibilityText).toContain("Registered Charities");
    expect(g.themes).toEqual([
      "Advice and information",
      "Environment",
      "Energy",
      "Climate action",
    ]);
    expect(g.beneficiaries).toContain("People in poverty");
    // The Apply tab's website row points at the fund's own application site.
    expect(g.applicationUrl).toBe(
      "https://www.energyredress.org.uk/apply-funding",
    );
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("parses a dated fund (Barcapel) as open with its next deadline", async () => {
    const raw = makeRaw({
      id: "a0Rb0000000Ng4lEAC",
      slug: "barcapel-foundation-limited",
      url: "https://funding.scot/funds/a0Rb0000000Ng4lEAC/barcapel-foundation-limited",
      html: stableContentRegion(fixture("fs-fund-barcapel.html")),
    });
    const [g] = await fundingScotlandConnector.normalize(raw);

    expect(g.title).toBe("Barcapel Foundation Limited");
    expect(g.status).toBe("open");
    expect(g.deadlineAt).toMatch(/^2026-10-05T/); // "Monday, 5th October, 2026"
    expect(g.regions).toEqual(["Scotland", "United Kingdom"]);
    expect(g.funderName).toBe("Barcapel Foundation Limited");
    expect(g.eligibilityText).toContain("OSCR");
    // The website link's &#x3D; entity decodes to a real query string.
    expect(g.applicationUrl).toBe(
      "https://barcapelfoundation.org/?page_id=3030",
    );
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only fund",
      snippet: "Grants for community sports clubs.",
      statusText: "Currently open",
      nextDeadlineText: "5 Oct 2026",
      html: null,
    });
    const [g] = await fundingScotlandConnector.normalize(raw);
    expect(g.title).toBe("Listing-only fund");
    expect(g.sourceNoticeId).toBe("a0R0000000Fake01AAA");
    expect(g.description).toBe("Grants for community sports clubs.");
    expect(g.deadlineAt).toMatch(/^2026-10-05T/); // from the listing card
    expect(g.status).toBe("open");
    expect(g.applicationUrl).toBe(g.sourceUrl);
  });

  it("maps a closed status chip defensively", async () => {
    const [g] = await fundingScotlandConnector.normalize(
      makeRaw({ title: "Gone", statusText: "Currently closed" }),
    );
    expect(g.status).toBe("closed");
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await fundingScotlandConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].regions).toEqual([]);
    expect(grants[0].status).toBe("rolling");
  });

  it("recovers the id from the URL and returns [] when nothing identifies the fund", async () => {
    const [fromUrl] = await fundingScotlandConnector.normalize({
      id: "",
      slug: "",
      url: "https://funding.scot/funds/a0R0N00000LeoA4UAJ/energy-saving-trust-energy-redress-scheme",
      title: "Energy Redress",
    });
    expect(fromUrl.sourceNoticeId).toBe("a0R0N00000LeoA4UAJ");

    expect(
      await fundingScotlandConnector.normalize({ id: "", slug: "", url: "" }),
    ).toEqual([]);
    expect(
      await fundingScotlandConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });
});
