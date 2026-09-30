/**
 * London Community Foundation connector unit tests — pure parsing only, no
 * network or DB. Fixtures in tests/fixtures/ are TRIMMED copies of real
 * londoncf.org.uk markup fetched on 2026-06-12 (site chrome stripped,
 * representative entries kept):
 *   - lcf-listing-p1.html      /apply/available-grants page 1 (3 of 5 cards:
 *                              one the listing marks Open, one it marks
 *                              Closed, one whose Read-more slug differs from
 *                              its display title; live next-page pager)
 *   - lcf-listing-p3.html      /p3 (last page, pagination-next is disabled)
 *   - lcf-grant-greenwich.html OPEN fund detail: Closing date 21/07/2026,
 *                              Max. Grant size £20,000, Plinth apply button
 *   - lcf-grant-thamesmead.html CLOSED fund detail: "This fund is now
 *                              closed." although a closing date row remains
 *                              — the closed text must win
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  londonCfConnector,
  extractGrantCards,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  parseUkSlashDate,
  mapDetailStatus,
  fundContentRegion,
  type LondonCfGrantRaw,
} from "@/lib/grants/connectors/london-cf";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

// Closing-date-vs-now logic is date-sensitive: pin the clock to the fixture
// fetch date so "21/07/2026 is upcoming, 26/05/2026 has passed" stays true.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

function makeRaw(overrides: Partial<LondonCfGrantRaw>): LondonCfGrantRaw {
  return {
    id: "some-fund",
    slug: "some-fund",
    url: "https://londoncf.org.uk/grants/some-fund",
    title: null,
    summary: null,
    listedStatus: null,
    listedClosingDate: null,
    html: null,
    ...overrides,
  };
}

describe("london-cf listing parsing", () => {
  const listing = fixture("lcf-listing-p1.html");

  it("extracts fund cards with slug, title, listing chip and closing date", () => {
    const cards = extractGrantCards(listing);
    expect(cards.map((c) => c.slug)).toEqual([
      "greenwich-peninsula-community-fund",
      "thamesmead-community-fund",
      "summer-holiday-activity-food-programme",
    ]);
    const [greenwich, thamesmead, comicRelief] = cards;
    expect(greenwich.title).toBe("Greenwich Peninsula Community Fund");
    expect(greenwich.listedStatus).toBe("Open");
    expect(greenwich.listedClosingDate).toBe("21/07/2026");
    expect(greenwich.summary).toContain("positive social, economic");
    expect(thamesmead.listedStatus).toBe("Closed");
    // The Read-more slug is the identity even when it differs from the title.
    expect(comicRelief.title).toBe(
      "Comic Relief x Sainsbury's Summer Holiday Activity and Food Programme",
    );
    expect(comicRelief.url).toBe(
      "https://londoncf.org.uk/grants/summer-holiday-activity-food-programme",
    );
  });

  it("dedupes repeated cards for the same fund", () => {
    expect(extractGrantCards(listing + listing)).toHaveLength(3);
  });

  it("detects the next-page link, disabled on the last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    const last = fixture("lcf-listing-p3.html");
    expect(hasNextListingPage(last)).toBe(false); // pagination-next disabled
    expect(extractGrantCards(last).map((c) => c.slug)).toEqual([
      "the-ellerdale-trust-grants-programme",
    ]);
  });
});

describe("london-cf cursor + paging", () => {
  it("starts at page 1 and resumes from a JSON cursor", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor(JSON.stringify({ page: 3 }))).toBe(3);
  });

  it("is resilient to malformed cursors", () => {
    expect(parseCursor("garbage")).toBe(1);
    expect(parseCursor('{"page":"x"}')).toBe(1);
    expect(parseCursor('{"page":0}')).toBe(1);
  });

  it("builds /pN listing URLs from page 2 onwards", () => {
    expect(listingUrl(1)).toBe(
      "https://londoncf.org.uk/apply/available-grants",
    );
    expect(listingUrl(2)).toBe(
      "https://londoncf.org.uk/apply/available-grants/p2",
    );
  });
});

describe("london-cf status from the DETAIL page (the source caveat)", () => {
  it("parses dd/mm/yyyy closing dates", () => {
    expect(parseUkSlashDate("21/07/2026")).toMatch(/^2026-07-21T/);
    expect(parseUkSlashDate("Closing date: 13/02/2026")).toMatch(
      /^2026-02-13T/,
    );
    expect(parseUkSlashDate("31/02/2026")).toBeNull(); // impossible date
    expect(parseUkSlashDate(null)).toBeNull();
  });

  it("lets the explicit closed text win over everything", () => {
    expect(
      mapDetailStatus(
        "<p>This fund is now closed.</p>",
        "2099-01-01T12:00:00.000Z",
        "Open",
      ),
    ).toBe("closed");
  });

  it("decides open/closed from the dated closing field when the fund is live", () => {
    expect(
      mapDetailStatus("<p>live fund</p>", "2026-07-21T12:00:00.000Z", null),
    ).toBe("open");
    expect(
      mapDetailStatus("<p>live fund</p>", "2026-05-26T12:00:00.000Z", null),
    ).toBe(
      "closed", // closing date already passed, even without the closed text
    );
    expect(mapDetailStatus("<p>live fund</p>", null, null)).toBe("rolling");
  });

  it("only consults the listing chip when the detail fetch failed", () => {
    expect(mapDetailStatus("", null, "Closed")).toBe("closed");
    expect(mapDetailStatus("", "2026-07-21T12:00:00.000Z", "Open")).toBe(
      "open",
    );
    expect(mapDetailStatus("", null, "Open")).toBe("rolling");
    expect(mapDetailStatus("", null, null)).toBe("unknown");
  });
});

describe("london-cf fund content region", () => {
  it("scopes from the title banner through the article", () => {
    const region = fundContentRegion(fixture("lcf-grant-greenwich.html"));
    expect(region).toContain("Greenwich Peninsula Community Fund");
    expect(region).toContain("projects-table"); // aside table kept
    expect(region).toContain("</article>");
    expect(region).not.toContain("<footer"); // chrome dropped
  });

  it("falls back to the full page when the template changes", () => {
    expect(fundContentRegion("<main>new markup</main>")).toContain(
      "new markup",
    );
  });
});

describe("london-cf normalize", () => {
  const greenwichRegion = fundContentRegion(
    fixture("lcf-grant-greenwich.html"),
  );
  const thamesmeadRegion = fundContentRegion(
    fixture("lcf-grant-thamesmead.html"),
  );

  it("parses an open fund (Greenwich Peninsula) from its detail page", async () => {
    const raw = makeRaw({
      id: "greenwich-peninsula-community-fund",
      slug: "greenwich-peninsula-community-fund",
      url: "https://londoncf.org.uk/grants/greenwich-peninsula-community-fund",
      listedStatus: "Open",
      listedClosingDate: "21/07/2026",
      html: greenwichRegion,
    });
    const [g] = await londonCfConnector.normalize(raw);

    expect(g.sourceName).toBe("london-cf");
    expect(g.sourceNoticeId).toBe("greenwich-peninsula-community-fund");
    expect(g.title).toBe("Greenwich Peninsula Community Fund");
    expect(g.deadlineAt).toMatch(/^2026-07-21T/);
    expect(g.status).toBe("open");
    expect(g.amountMin).toBeNull();
    expect(g.amountMax).toBe(20_000); // "Max. Grant size: £20,000"
    expect(g.currency).toBe("GBP");
    expect(g.funderName).toBe("The London Community Foundation");
    expect(g.regions).toEqual(["London"]);
    expect(g.themes).toEqual([
      "Life skills, employability and enterprise",
      "Physical and mental health, wellbeing and safety",
      "The environment",
    ]);
    expect(g.description).toContain("Knight Dragon");
    expect(g.eligibilityText).toContain("income");
    // The Plinth application portal button.
    expect(g.applicationUrl).toContain("app.plinth.org.uk/application");
    // The guidelines PDF lands in documents.
    expect(g.documents).toEqual([
      expect.objectContaining({
        format: "pdf",
        url: expect.stringContaining(
          "Greenwich-Peninsula-Community-Fund-Round-4-Guidelines.pdf",
        ),
      }),
    ]);
    expect(g.sourceUrl).toBe(raw.url);
    expect(g.rawJson).toBe(raw);
  });

  it("marks a fund CLOSED from the detail text even when listed (Thamesmead)", async () => {
    const raw = makeRaw({
      id: "thamesmead-community-fund",
      slug: "thamesmead-community-fund",
      url: "https://londoncf.org.uk/grants/thamesmead-community-fund",
      listedStatus: "Closed",
      listedClosingDate: "26/05/2026",
      html: thamesmeadRegion,
    });
    const [g] = await londonCfConnector.normalize(raw);

    expect(g.title).toBe("Thamesmead Community Fund");
    expect(g.status).toBe("closed"); // "This fund is now closed."
    expect(g.deadlineAt).toMatch(/^2026-05-26T/); // the dated field is kept
  });

  it("falls back to the listing-card fields when the detail fetch failed (html null)", async () => {
    const raw = makeRaw({
      title: "Listing-only fund",
      summary: "Grants for community sports clubs.",
      listedStatus: "Open",
      listedClosingDate: "21/07/2026",
      html: null,
    });
    const [g] = await londonCfConnector.normalize(raw);
    expect(g.title).toBe("Listing-only fund");
    expect(g.description).toBe("Grants for community sports clubs.");
    expect(g.deadlineAt).toMatch(/^2026-07-21T/);
    expect(g.status).toBe("open"); // listing chip honoured only as a fallback
    expect(g.applicationUrl).toBe(g.sourceUrl);
  });

  it("returns a partial grant rather than throwing when the template changes", async () => {
    const raw = makeRaw({
      title: "Future template victim",
      html: "<main>completely new markup</main>",
    });
    const grants = await londonCfConnector.normalize(raw);
    expect(grants).toHaveLength(1);
    expect(grants[0].title).toBe("Future template victim");
    expect(grants[0].amountMax).toBeNull();
    expect(grants[0].status).toBe("rolling");
  });

  it("recovers the slug from the URL and returns [] when nothing identifies it", async () => {
    const [fromUrl] = await londonCfConnector.normalize({
      id: "",
      slug: "",
      url: "https://londoncf.org.uk/grants/bromley-community-fund",
      title: "Bromley Community Fund",
    });
    expect(fromUrl.sourceNoticeId).toBe("bromley-community-fund");

    expect(
      await londonCfConnector.normalize({ id: "", slug: "", url: "" }),
    ).toEqual([]);
    expect(
      await londonCfConnector.normalize(makeRaw({ title: null, html: null })),
    ).toEqual([]);
  });

  it("walks the complete (open+closed) listing so the prune may run", () => {
    expect(londonCfConnector.listsAllOpenCalls).toBe(true);
  });
});
