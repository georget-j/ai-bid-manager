/**
 * National Lottery Heritage Fund connector unit tests — pure parsing only, no
 * network or DB. Fixtures in tests/fixtures/ are TRIMMED copies of real
 * heritagefund.org.uk markup fetched on 2026-06-12 (site chrome stripped,
 * representative sections kept):
 *   - heritage-listing.html       /funding page: BOTH programme cards (one
 *                                 carries an extra is-unpublished class but is
 *                                 live-linked) + a non-programme basic-page
 *                                 article that must be ignored
 *   - heritage-prog-250k.html     £250k-£10m programme: book nav links the
 *                                 /deadlines subpage; amounts in the title
 *   - heritage-prog-10k.html      £10k-£250k programme: "no deadline for
 *                                 applications" → rolling
 *   - heritage-deadlines-250k.html the dated deadline list ("12noon,
 *                                 26 February 2026, to receive a decision…")
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  heritageFundConnector,
  extractProgrammeCards,
  articleRegion,
  findDeadlinesPath,
  parseDeadlineDates,
  nextUpcoming,
  parseAmountRange,
  type HeritageFundProgrammeRaw,
} from "@/lib/grants/connectors/heritage-fund";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

// Deadline-vs-now logic is date-sensitive: pin the clock to the fixture fetch
// date so "6 August 2026 is the next upcoming deadline" stays true forever.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

function makeRaw(
  overrides: Partial<HeritageFundProgrammeRaw>,
): HeritageFundProgrammeRaw {
  return {
    id: "some-programme",
    slug: "some-programme",
    url: "https://www.heritagefund.org.uk/funding/some-programme",
    title: null,
    summary: null,
    html: null,
    deadlinesHtml: null,
    ...overrides,
  };
}

describe("heritage-fund listing parsing", () => {
  const listing = fixture("heritage-listing.html");

  it("extracts both programme cards, including the is-unpublished-classed one", () => {
    const cards = extractProgrammeCards(listing);
    expect(cards.map((c) => c.slug)).toEqual([
      "national-lottery-heritage-grants-10k-250k",
      "national-lottery-heritage-grants-250k-10m",
    ]);
    const [small, large] = cards;
    expect(small.title).toBe(
      "National Lottery Heritage Grants £10,000 to £250,000",
    );
    expect(large.title).toBe(
      "National Lottery Heritage Grants £250,000 to £10million",
    );
    expect(large.url).toBe(
      "https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-250k-10m",
    );
    expect(large.summary).toContain("all types of heritage projects in the UK");
  });

  it("ignores non-programme articles (basic pages are not grants)", () => {
    const slugs = extractProgrammeCards(listing).map((c) => c.slug);
    expect(slugs).not.toContain("closed-programmes");
  });

  it("dedupes repeated cards for the same programme", () => {
    expect(extractProgrammeCards(listing + listing)).toHaveLength(2);
  });
});

describe("heritage-fund article region + deadlines subpage", () => {
  it("scopes a programme page to its article and finds the deadlines link", () => {
    const page = fixture("heritage-prog-250k.html");
    const region = articleRegion(page);
    expect(region).toContain("National Lottery Heritage Grants £250,000");
    expect(region).toContain("field--name-field-intro-text");
    expect(region).not.toContain("chrome duplicate title"); // chrome h1 dropped
    // The deadlines subpage is linked from the page's book navigation.
    expect(findDeadlinesPath(page)).toBe(
      "/funding/national-lottery-heritage-grants-250k-10m/deadlines",
    );
  });

  it("scopes the deadlines subpage's basic-page article", () => {
    const page = fixture("heritage-deadlines-250k.html");
    const region = articleRegion(page);
    expect(region).toContain("12noon, 26 February 2026");
    expect(region).toMatch(/^<article/);
  });

  it("has no deadlines link on the rolling £10k-£250k programme", () => {
    expect(findDeadlinesPath(fixture("heritage-prog-10k.html"))).toBeNull();
  });

  it("scrubs Drupal per-response tokens for hash-stable raw payloads", () => {
    const region = articleRegion(
      '<article id="x" class="basic-page">' +
        '<input name="form_build_id" value="form-AbC123"/>' +
        '<input name="antibot_key" value="k9z"/>' +
        '<div class="js-view-dom-id-9f3aa10b">x</div></article>',
    );
    expect(region).not.toContain("form-AbC123");
    expect(region).not.toContain('value="k9z"');
    expect(region).toContain("js-view-dom-id-scrubbed");
  });

  it("falls back to the full (scrubbed) page when the template changes", () => {
    expect(articleRegion("<main>new markup</main>")).toContain("new markup");
  });
});

describe("heritage-fund date + amount parsing", () => {
  it("parses the dated deadline list and picks the next upcoming one", () => {
    const text =
      "12noon, 26 February 2026, to receive a decision by end of June 2026 " +
      "12noon, 28 May 2026 … 12noon, 6 August 2026 … 12noon, 12 November 2026";
    const dates = parseDeadlineDates(text);
    expect(dates).toHaveLength(4);
    // At the pinned clock (12 June 2026) the next deadline is 6 August 2026.
    expect(nextUpcoming(dates)).toMatch(/^2026-08-06T/);
  });

  it("returns no dates for undated prose", () => {
    expect(
      parseDeadlineDates("There is no deadline for applications."),
    ).toEqual([]);
    expect(parseDeadlineDates(null)).toEqual([]);
  });

  it("parses amount ranges from programme titles", () => {
    expect(
      parseAmountRange("National Lottery Heritage Grants £10,000 to £250,000"),
    ).toEqual({ min: 10_000, max: 250_000 });
    expect(
      parseAmountRange(
        "National Lottery Heritage Grants £250,000 to £10million",
      ),
    ).toEqual({ min: 250_000, max: 10_000_000 });
    expect(parseAmountRange("Heritage Enterprise")).toEqual({
      min: null,
      max: null,
    });
  });
});

describe("heritage-fund normalize", () => {
  const region250k = articleRegion(fixture("heritage-prog-250k.html"));
  const region10k = articleRegion(fixture("heritage-prog-10k.html"));
  const deadlinesRegion = articleRegion(
    fixture("heritage-deadlines-250k.html"),
  );

  it("parses the £250k-£10m programme as open with the next dated deadline", async () => {
    const raw = makeRaw({
      id: "national-lottery-heritage-grants-250k-10m",
      slug: "national-lottery-heritage-grants-250k-10m",
      url: "https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-250k-10m",
      html: region250k,
      deadlinesHtml: deadlinesRegion,
    });
    const [g] = await heritageFundConnector.normalize(raw);

    expect(g.sourceName).toBe("heritage-fund");
    expect(g.sourceNoticeId).toBe("national-lottery-heritage-grants-250k-10m");
    expect(g.title).toBe(
      "National Lottery Heritage Grants £250,000 to £10million",
    );
    // Amounts come from the title itself.
    expect(g.amountMin).toBe(250_000);
    expect(g.amountMax).toBe(10_000_000);
    expect(g.currency).toBe("GBP");
    // The deadlines subpage lists dated rounds; next upcoming = 6 August 2026.
    expect(g.deadlineAt).toMatch(/^2026-08-06T/);
    expect(g.status).toBe("open");
    expect(g.description).toContain(
      "connect people and communities to the national, regional and local heritage",
    );
    expect(g.funderName).toBe("The National Lottery Heritage Fund");
    expect(g.regions).toEqual(["United Kingdom"]);
    expect(g.eligibilityText).toContain("not-for-profit");
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("parses the £10k-£250k programme as rolling (no deadline)", async () => {
    const raw = makeRaw({
      id: "national-lottery-heritage-grants-10k-250k",
      slug: "national-lottery-heritage-grants-10k-250k",
      url: "https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-10k-250k",
      html: region10k,
      deadlinesHtml: null,
    });
    const [g] = await heritageFundConnector.normalize(raw);

    expect(g.title).toBe(
      "National Lottery Heritage Grants £10,000 to £250,000",
    );
    expect(g.amountMin).toBe(10_000);
    expect(g.amountMax).toBe(250_000);
    expect(g.deadlineAt).toBeNull();
    expect(g.status).toBe("rolling"); // "no deadline for applications"
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Heritage Enterprise £250,000 to £5million",
      summary: "Funding for heritage regeneration.",
      html: null,
      deadlinesHtml: null,
    });
    const [g] = await heritageFundConnector.normalize(raw);
    expect(g.title).toBe("Heritage Enterprise £250,000 to £5million");
    expect(g.description).toBe("Funding for heritage regeneration.");
    expect(g.amountMin).toBe(250_000);
    expect(g.amountMax).toBe(5_000_000);
    expect(g.status).toBe("rolling");
    expect(g.applicationUrl).toBe(g.sourceUrl);
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<html><body><main>completely new markup</main></body></html>",
    });
    const grants = await heritageFundConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].deadlineAt).toBeNull();
    expect(grants[0].status).toBe("rolling");
  });

  it("recovers the slug from the URL and returns [] when nothing identifies it", async () => {
    const [fromUrl] = await heritageFundConnector.normalize({
      id: "",
      slug: "",
      url: "https://www.heritagefund.org.uk/funding/heritage-enterprise",
      title: "Heritage Enterprise",
    });
    expect(fromUrl.sourceNoticeId).toBe("heritage-enterprise");

    expect(
      await heritageFundConnector.normalize({ id: "", slug: "", url: "" }),
    ).toEqual([]);
    expect(
      await heritageFundConnector.normalize(
        makeRaw({ title: null, html: null }),
      ),
    ).toEqual([]);
  });

  it("is a single-page complete walk so the delisting prune may run", () => {
    expect(heritageFundConnector.listsAllOpenCalls).toBe(true);
  });
});
