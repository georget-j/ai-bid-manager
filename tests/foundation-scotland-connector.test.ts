/**
 * Foundation Scotland connector unit tests — pure parsing only, no network or
 * DB. Fixtures in tests/fixtures/ are TRIMMED copies of real
 * foundationscotland.org.uk markup fetched on 2026-06-12 (site chrome
 * stripped, representative entries kept):
 *   - fnds-listing-open.html   funding-available page 0 (3 of 12 cards: a
 *                              canonical-path card, a bare-path /ansuidhe
 *                              card, an International-area card; "125
 *                              results" header; live next-page pager)
 *   - fnds-listing-last.html   ?page=10 (last page, 2 cards, no next item)
 *   - fnds-fund-achlachan.html rolling fund detail: recurring NO-YEAR
 *                              deadlines ("15th March, 15th June, …"),
 *                              Up to £10,000, Area Highland, apply button
 *   - fnds-fund-ansuidhe.html  dated fund detail: dd/mm/yy deadlines
 *                              (11/03/26, 16/09/26), Up to £9,000
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  foundationScotlandConnector,
  extractFundCards,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  parseDeadlineDates,
  deadlineRowTexts,
  nextUpcoming,
  parseAmountRange,
  parseRegions,
  fundContentRegion,
  type FoundationScotlandFundRaw,
} from "@/lib/grants/connectors/foundation-scotland";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

// Deadline-vs-now logic is date-sensitive: pin the clock to the fixture
// fetch date so "11/03/26 is past, 16/09/26 is upcoming" stays true forever.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

function makeRaw(
  overrides: Partial<FoundationScotlandFundRaw>,
): FoundationScotlandFundRaw {
  return {
    id: "some-fund",
    slug: "some-fund",
    url: "https://www.foundationscotland.org.uk/apply-for-funding/funding-available/some-fund",
    title: null,
    summary: null,
    area: null,
    grantSize: null,
    html: null,
    ...overrides,
  };
}

describe("foundation-scotland listing parsing", () => {
  const listing = fixture("fnds-listing-open.html");

  it("extracts fund cards from both canonical and bare-path URLs", () => {
    const cards = extractFundCards(listing);
    expect(cards.map((c) => c.slug)).toEqual([
      "achlachan",
      "ansuidhe",
      "ancbc",
    ]);
    const [achlachan, ansuidhe] = cards;
    expect(achlachan.title).toBe("Achlachan Wind Farm Community Fund");
    expect(achlachan.url).toBe(
      "https://www.foundationscotland.org.uk/apply-for-funding/funding-available/achlachan",
    );
    expect(achlachan.area).toBe("Highland");
    expect(achlachan.grantSize).toBe("Up to £10,000");
    expect(achlachan.summary).toContain("Halkirk & District Community Council");
    // The An Suidhe card links the bare /ansuidhe alias, not the canonical path.
    expect(ansuidhe.url).toBe("https://www.foundationscotland.org.uk/ansuidhe");
    expect(ansuidhe.area).toBe("Argyll and Bute");
  });

  it("ignores the site menu's own fund links (cards only)", () => {
    // The fixture's chrome carries a menu-basic link to the Volant fund — it
    // is not a views-row card and must not become a grant.
    expect(listing).toContain("volant-charitable-trust-grants-programme");
    const slugs = extractFundCards(listing).map((c) => c.slug);
    expect(slugs).not.toContain("volant-charitable-trust-grants-programme");
  });

  it("dedupes repeated cards for the same fund", () => {
    expect(extractFundCards(listing + listing)).toHaveLength(3);
  });

  it("detects the next-page link, absent on the last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    const last = fixture("fnds-listing-last.html");
    expect(hasNextListingPage(last)).toBe(false);
    expect(extractFundCards(last).map((c) => c.slug)).toEqual([
      "volant-charitable-trust-small-grants-programme",
      "blackhillock",
    ]);
  });
});

describe("foundation-scotland cursor + paging", () => {
  it("starts at page 0 (Drupal pager) and resumes from a JSON cursor", () => {
    expect(parseCursor(null)).toBe(0);
    expect(parseCursor(undefined)).toBe(0);
    expect(parseCursor(JSON.stringify({ page: 7 }))).toBe(7);
    expect(parseCursor("3")).toBe(3);
  });

  it("is resilient to malformed cursors", () => {
    expect(parseCursor("garbage")).toBe(0);
    expect(parseCursor('{"page":"x"}')).toBe(0);
    expect(parseCursor('{"page":-2}')).toBe(0);
  });

  it("builds 0-indexed listing URLs (page 0 has no param)", () => {
    expect(listingUrl(0)).toBe(
      "https://www.foundationscotland.org.uk/apply-for-funding/funding-available",
    );
    expect(listingUrl(3)).toBe(
      "https://www.foundationscotland.org.uk/apply-for-funding/funding-available?page=3",
    );
  });
});

describe("foundation-scotland date + amount parsing", () => {
  it("parses dd/mm/yy and 'd Month yyyy' deadline forms", () => {
    expect(parseDeadlineDates("11/03/26")).toEqual([
      expect.stringMatching(/^2026-03-11T/),
    ]);
    expect(parseDeadlineDates("16 January 2026")).toEqual([
      expect.stringMatching(/^2026-01-16T/),
    ]);
    expect(parseDeadlineDates("11/03/26 and 16/09/2026")).toHaveLength(2);
  });

  it("treats recurring no-year deadlines as undated (rolling funds)", () => {
    expect(
      parseDeadlineDates(
        "15th March, 15th June, 15th September, 15th December",
      ),
    ).toEqual([]);
    expect(parseDeadlineDates(null)).toEqual([]);
    expect(parseDeadlineDates("31/02/26")).toEqual([]); // impossible date
  });

  it("picks the earliest upcoming deadline", () => {
    const dates = parseDeadlineDates("11/03/26 16/09/26");
    expect(nextUpcoming(dates)).toMatch(/^2026-09-16T/); // 11/03 already passed
    expect(nextUpcoming([])).toBeNull();
    expect(nextUpcoming(["2025-01-01T12:00:00.000Z"])).toBeNull(); // all past
  });

  it("parses grant-size ranges (single figure = ceiling)", () => {
    expect(parseAmountRange("Up to £10,000")).toEqual({
      min: null,
      max: 10_000,
    });
    expect(parseAmountRange("£500 to £25,000")).toEqual({
      min: 500,
      max: 25_000,
    });
    expect(parseAmountRange(null)).toEqual({ min: null, max: null });
  });

  it("maps areas onto regions (local area kept, International excluded)", () => {
    expect(parseRegions("Highland")).toEqual(["Scotland", "Highland"]);
    expect(parseRegions("Scotland")).toEqual(["Scotland"]);
    expect(parseRegions("All of Scotland")).toEqual(["Scotland"]);
    expect(parseRegions("International")).toEqual([]);
    expect(parseRegions(null)).toEqual(["Scotland"]);
  });
});

describe("foundation-scotland stable content region", () => {
  it("scopes to the fund region and scrubs the randomised view-dom tokens", () => {
    const page = fixture("fnds-fund-achlachan.html");
    const region = fundContentRegion(page);
    expect(region).toContain("Achlachan Wind Farm Community Fund");
    expect(region).toContain("table-info"); // key-dates table kept
    expect(region).not.toContain("<footer"); // chrome dropped
    // Hash-stability scrub: Drupal's per-cache-rebuild view tokens.
    expect(region).not.toMatch(/js-view-dom-id-[a-f0-9]{6}/);
    expect(region).toContain("js-view-dom-id-scrubbed");
  });

  it("falls back to the full (scrubbed) page when the template changes", () => {
    const region = fundContentRegion(
      '<main class="js-view-dom-id-abc123">new markup</main>',
    );
    expect(region).toContain("new markup");
    expect(region).toContain("js-view-dom-id-scrubbed");
  });
});

describe("foundation-scotland normalize", () => {
  const achlachanRegion = fundContentRegion(
    fixture("fnds-fund-achlachan.html"),
  );
  const ansuidheRegion = fundContentRegion(fixture("fnds-fund-ansuidhe.html"));

  it("parses a recurring-deadline fund (Achlachan) as rolling", async () => {
    const raw = makeRaw({
      id: "achlachan",
      slug: "achlachan",
      url: "https://www.foundationscotland.org.uk/apply-for-funding/funding-available/achlachan",
      html: achlachanRegion,
    });
    const [g] = await foundationScotlandConnector.normalize(raw);

    expect(g.sourceName).toBe("foundation-scotland");
    expect(g.sourceNoticeId).toBe("achlachan");
    expect(g.title).toBe("Achlachan Wind Farm Community Fund");
    // "15th March, 15th June, …" has no year → undated → rolling.
    expect(g.deadlineAt).toBeNull();
    expect(g.status).toBe("rolling");
    expect(g.amountMin).toBeNull();
    expect(g.amountMax).toBe(10_000);
    expect(g.currency).toBe("GBP");
    expect(g.funderName).toBe("Foundation Scotland");
    expect(g.regions).toEqual(["Scotland", "Highland"]);
    expect(g.description).toContain("Whirlwind Renewables");
    expect(g.eligibilityText).toContain("Halkirk Community Council area");
    expect(g.eligibilityText).toContain("Matched funding"); // Additional criteria joined in
    // The Salesforce application-portal button.
    expect(g.applicationUrl).toContain(
      "foundationscotland3.my.site.com/portal/s/applicationformloader",
    );
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("parses a dated fund (An Suidhe) as open with the next upcoming deadline", async () => {
    const raw = makeRaw({
      id: "ansuidhe",
      slug: "ansuidhe",
      url: "https://www.foundationscotland.org.uk/ansuidhe",
      html: ansuidheRegion,
    });
    const [g] = await foundationScotlandConnector.normalize(raw);

    expect(g.title).toBe("An Suidhe Wind Farm Community Fund");
    // Deadlines 11/03/26 (past at the pinned clock) and 16/09/26 (upcoming).
    expect(g.deadlineAt).toMatch(/^2026-09-16T/);
    expect(g.status).toBe("open");
    expect(g.amountMax).toBe(9_000);
    expect(g.regions).toEqual(["Scotland", "Argyll and Bute"]);
  });

  it("collects every Application deadline row from the key-dates table", () => {
    expect(deadlineRowTexts(ansuidheRegion)).toEqual(["11/03/26", "16/09/26"]);
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only fund",
      summary: "Grants for community halls.",
      area: "Fife",
      grantSize: "Up to £5,000",
      html: null,
    });
    const [g] = await foundationScotlandConnector.normalize(raw);
    expect(g.title).toBe("Listing-only fund");
    expect(g.description).toBe("Grants for community halls.");
    expect(g.amountMax).toBe(5_000);
    expect(g.regions).toEqual(["Scotland", "Fife"]);
    expect(g.status).toBe("rolling");
    expect(g.applicationUrl).toBe(g.sourceUrl);
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await foundationScotlandConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].status).toBe("rolling");
  });

  it("recovers the slug from the URL and returns [] when nothing identifies the fund", async () => {
    const [fromUrl] = await foundationScotlandConnector.normalize({
      id: "",
      slug: "",
      url: "https://www.foundationscotland.org.uk/ansuidhe",
      title: "An Suidhe",
    });
    expect(fromUrl.sourceNoticeId).toBe("ansuidhe");

    expect(
      await foundationScotlandConnector.normalize({
        id: "",
        slug: "",
        url: "",
      }),
    ).toEqual([]);
    expect(
      await foundationScotlandConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });

  it("walks the complete listing so the delisting prune may run", () => {
    expect(foundationScotlandConnector.listsAllOpenCalls).toBe(true);
  });
});
