/**
 * UKBAA connector unit tests — parsing against REAL markup, no live network.
 * Fixtures in tests/fixtures/ are TRIMMED copies of real ukbaa.org.uk pages
 * fetched on 2026-06-11 (header/footer/scripts/styles/srcset stripped):
 *   - ukbaa-events-listing.html       /events/ page 1 (12 cards + next-page link)
 *   - ukbaa-events-listing-last.html  /events/page/3/ (last page, no next link)
 *   - ukbaa-event-minerva.html        in-person pitch event with full venue address
 *   - ukbaa-event-online.html         online event ("Online" region, Zoom venue line)
 * geocodePostcode is mocked (covered by tests/investor-events.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const geocodePostcodeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events/geocode", () => ({
  geocodePostcode: geocodePostcodeMock,
}));

import {
  ukbaaConnector,
  extractEventStubs,
  hasNextListingPage,
  listingUrl,
  parseCursor,
  type UkbaaEventRaw,
} from "@/lib/events/connectors/ukbaa";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

function makeRaw(overrides: Partial<UkbaaEventRaw>): UkbaaEventRaw {
  return {
    id: "some-event",
    url: "https://ukbaa.org.uk/events/some-event/",
    title: null,
    html: null,
    listedAt: "2026-06-11T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  geocodePostcodeMock.mockReset();
  geocodePostcodeMock.mockResolvedValue(null);
});

describe("ukbaa listing parsing", () => {
  const listing = fixture("ukbaa-events-listing.html");

  it("extracts every event card with its title, excluding pagination links", () => {
    const stubs = extractEventStubs(listing);
    expect(stubs).toHaveLength(12);
    expect(stubs[0]).toEqual({
      url: "https://ukbaa.org.uk/events/cornwall-investment-showcase/",
      slug: "cornwall-investment-showcase",
      title: "Cornwall Investment Showcase",
    });
    // HTML entities in titles are decoded (&#8211; → "–", &#038; → "&").
    const minerva = stubs.find(
      (s) =>
        s.slug ===
        "minerva-business-angels-investor-networking-and-pitch-event",
    );
    expect(minerva?.title).toBe(
      "Minerva Business Angels – investor networking and pitch event",
    );
    const seedlegals = stubs.find((s) =>
      s.slug.startsWith("how-to-invest-in-startups"),
    );
    expect(seedlegals?.title).toBe(
      "How to invest in startups: Insights from SeedLegals & South East Angels",
    );
    // /events/page/N/ pagination links must never become events.
    expect(stubs.some((s) => s.slug === "page")).toBe(false);
  });

  it("dedupes the card's thumbnail + title links to one stub per event", () => {
    const stubs = extractEventStubs(listing + listing);
    expect(stubs).toHaveLength(12);
  });

  it("detects the next-page link, and its absence on the last page", () => {
    expect(hasNextListingPage(listing)).toBe(true);
    // The last page has only prev/numbered links.
    expect(hasNextListingPage(fixture("ukbaa-events-listing-last.html"))).toBe(
      false,
    );
    expect(hasNextListingPage("<html><body>no nav</body></html>")).toBe(false);
  });
});

describe("ukbaa cursor logic", () => {
  it("starts at page 1 and resumes from a JSON {page} cursor", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor(JSON.stringify({ page: 3 }))).toBe(3);
    expect(parseCursor("2")).toBe(2);
    expect(parseCursor("garbage")).toBe(1);
  });

  it("builds the listing URL, paged from page 2 onwards", () => {
    expect(listingUrl(1)).toBe("https://ukbaa.org.uk/events/");
    expect(listingUrl(3)).toBe("https://ukbaa.org.uk/events/page/3/");
  });
});

describe("ukbaa normalize", () => {
  it("parses an in-person pitch event: title, times, venue address, geocode", async () => {
    geocodePostcodeMock.mockResolvedValue({ lat: 52.9536, lng: -1.1505 });
    const raw = makeRaw({
      id: "minerva-business-angels-investor-networking-and-pitch-event",
      url: "https://ukbaa.org.uk/events/minerva-business-angels-investor-networking-and-pitch-event/",
      html: fixture("ukbaa-event-minerva.html"),
    });
    const [e] = await ukbaaConnector.normalize(raw);

    expect(e.sourceName).toBe("ukbaa");
    expect(e.sourceEventId).toBe(
      "minerva-business-angels-investor-networking-and-pitch-event",
    );
    expect(e.title).toBe(
      "Minerva Business Angels – investor networking and pitch event",
    );
    expect(e.eventUrl).toBe(raw.url);
    // Sidebar: "11 June 2026", "14:00 - 18:00" (UK local treated as UTC).
    expect(e.startsAt).toBe("2026-06-11T14:00:00.000Z");
    expect(e.endsAt).toBe("2026-06-11T18:00:00.000Z");
    expect(e.isVirtual).toBe(false);
    expect(e.virtualPlatform).toBeNull();
    // "Potter Clarkson / Mount Street / Nottingham / NG1 6HQ" venue lines.
    expect(e.venueName).toBe("Potter Clarkson");
    expect(e.address).toBe("Mount Street");
    expect(e.city).toBe("Nottingham");
    expect(e.postcode).toBe("NG1 6HQ");
    expect(geocodePostcodeMock).toHaveBeenCalledWith("NG1 6HQ");
    expect(e.latitude).toBeCloseTo(52.9536);
    expect(e.longitude).toBeCloseTo(-1.1505);
    expect(e.region).toBe("East Midlands");
    expect(e.description).toContain(
      "three exciting, Midlands based, early-stage businesses",
    );
    expect(e.eventType).toBe("pitch-night");
    expect(e.organizerName).toBe("UKBAA");
  });

  it("parses an online event: virtual via region tag + Zoom venue line", async () => {
    const raw = makeRaw({
      id: "how-an-angel-group-works",
      url: "https://ukbaa.org.uk/events/how-an-angel-group-works/",
      html: fixture("ukbaa-event-online.html"),
    });
    const [e] = await ukbaaConnector.normalize(raw);

    expect(e.title).toBe("How an angel group works");
    expect(e.isVirtual).toBe(true);
    expect(e.virtualPlatform).toBe("zoom"); // "Online via Zoom"
    expect(e.venueName).toBeNull();
    expect(e.address).toBeNull();
    expect(e.city).toBeNull();
    expect(e.postcode).toBeNull();
    expect(e.latitude).toBeNull();
    expect(e.longitude).toBeNull();
    // "Online" is not a place — region stays null for virtual events.
    expect(e.region).toBeNull();
    expect(geocodePostcodeMock).not.toHaveBeenCalled();
    expect(e.startsAt).toBe("2026-06-12T12:00:00.000Z");
    expect(e.endsAt).toBe("2026-06-12T13:00:00.000Z");
    expect(e.eventType).toBe("angel-network");
    expect(e.description).toContain("angel group");
  });

  it("falls back to the listing title when the detail fetch failed (html null)", async () => {
    const [e] = await ukbaaConnector.normalize(
      makeRaw({ title: "Listing-only event", html: null }),
    );
    expect(e.title).toBe("Listing-only event");
    expect(e.sourceEventId).toBe("some-event");
    expect(e.eventUrl).toBe("https://ukbaa.org.uk/events/some-event/");
    expect(e.startsAt).toBeNull();
    expect(e.isVirtual).toBe(false);
    expect(e.venueName).toBeNull();
  });

  it("returns a partial event rather than throwing when the template changes", async () => {
    const events = await ukbaaConnector.normalize(
      makeRaw({
        title: "Future template victim",
        html: "<html><body><main>completely new markup</main></body></html>",
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Future template victim");
    expect(events[0].startsAt).toBeNull();
    expect(events[0].postcode).toBeNull();
    expect(events[0].eventType).toBe("other");
  });

  it("returns [] when there is no slug or no title at all", async () => {
    expect(
      await ukbaaConnector.normalize({
        id: "",
        url: "",
        title: null,
        html: null,
        listedAt: "2026-06-11T09:00:00.000Z",
      }),
    ).toEqual([]);
    expect(
      await ukbaaConnector.normalize(makeRaw({ title: null, html: null })),
    ).toEqual([]);
  });
});

describe("ukbaa fetchSince", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function htmlResponse(html: string, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(html),
    };
  }

  it("walks one listing page, fetches detail pages, and keeps failed details as stubs", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u === "https://ukbaa.org.uk/events/") {
        return Promise.resolve(
          htmlResponse(fixture("ukbaa-events-listing.html")),
        );
      }
      if (u.includes("cornwall-investment-showcase")) {
        return Promise.resolve(
          htmlResponse(fixture("ukbaa-event-minerva.html")),
        );
      }
      return Promise.resolve(htmlResponse("gone", 404));
    });

    const result = await ukbaaConnector.fetchSince({ cursor: null, limit: 2 });

    expect(result.sourceName).toBe("ukbaa");
    expect(result.rawItems).toHaveLength(2);
    const [first, second] = result.rawItems as UkbaaEventRaw[];
    expect(first.id).toBe("cornwall-investment-showcase");
    expect(first.url).toBe(
      "https://ukbaa.org.uk/events/cornwall-investment-showcase/",
    );
    expect(first.title).toBe("Cornwall Investment Showcase");
    expect(first.html).toContain("<h1>");
    // Failed detail fetch → stub kept (listing title only) so it still ingests.
    expect(second.id).toBe("angelgroups-leeds-pitching-session");
    expect(second.html).toBeNull();
    expect(second.title).toBe("angelgroups Leeds Pitching Session");

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(JSON.stringify({ page: 2 }));

    // Polite scraping: an identifying User-Agent on every request.
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers?.["User-Agent"]).toContain("UKBidIntelligence");
    }
  });

  it("stops after the last listing page (no next link)", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u === "https://ukbaa.org.uk/events/page/3/") {
        return Promise.resolve(
          htmlResponse(fixture("ukbaa-events-listing-last.html")),
        );
      }
      return Promise.resolve(htmlResponse("gone", 404));
    });

    const result = await ukbaaConnector.fetchSince({
      cursor: JSON.stringify({ page: 3 }),
      limit: 1,
    });

    expect(result.rawItems).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("throws when the listing itself cannot be fetched", async () => {
    fetchMock.mockResolvedValue(htmlResponse("maintenance", 503));
    await expect(ukbaaConnector.fetchSince({ cursor: null })).rejects.toThrow(
      "UKBAA 503",
    );
  });
});
