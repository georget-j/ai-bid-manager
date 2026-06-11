/**
 * Eventbrite connector unit tests — no real network or DB.
 *   - The organizer catalog read (investor_organizers with a verified
 *     eventbrite_org_id) is mocked at @/lib/supabase-service.
 *   - The Eventbrite API is a stubbed global fetch serving
 *     tests/fixtures/eventbrite-events-page.json (synthetic, shaped per the v3
 *     organizer-scoped events endpoint with expand=venue,organizer).
 *   - geocodePostcode is mocked (its own behaviour is covered in
 *     tests/investor-events.test.ts).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const state = vi.hoisted(() => ({
  organizers: [] as Array<{
    id: string;
    slug: string;
    eventbrite_org_id: string | null;
  }>,
  selectError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({
    from: () => ({
      select: () => ({
        not: () => ({
          order: () =>
            Promise.resolve({
              data: state.organizers,
              error: state.selectError,
            }),
        }),
      }),
    }),
  }),
}));

const geocodePostcodeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events/geocode", () => ({
  geocodePostcode: geocodePostcodeMock,
}));

import {
  eventbriteConnector,
  eventbriteEventsUrl,
  parseEventbriteCursor,
  EVENTBRITE_TOKEN_ERROR,
  type EventbriteEventRaw,
} from "@/lib/events/connectors/eventbrite";

const fixturePage = (): {
  events: EventbriteEventRaw[];
  pagination: Record<string, unknown>;
} =>
  JSON.parse(
    readFileSync(
      join(__dirname, "fixtures", "eventbrite-events-page.json"),
      "utf-8",
    ),
  );

const ORIGINAL_TOKEN = process.env.EVENTBRITE_TOKEN;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function twoOrganizers() {
  // Ordered by slug, matching the connector's stable-walk ordering.
  state.organizers = [
    {
      id: "org-uuid-1",
      slug: "entrepreneurs-collective",
      eventbrite_org_id: "26163087533",
    },
    { id: "org-uuid-2", slug: "northinvest", eventbrite_org_id: "15393768327" },
  ];
}

beforeEach(() => {
  state.organizers = [];
  state.selectError = null;
  geocodePostcodeMock.mockReset();
  geocodePostcodeMock.mockResolvedValue(null);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // .env.local is loaded into process.env by the vitest setup file — make the
  // "no token" baseline explicit regardless of the developer's local env.
  delete process.env.EVENTBRITE_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (ORIGINAL_TOKEN !== undefined)
    process.env.EVENTBRITE_TOKEN = ORIGINAL_TOKEN;
});

describe("eventbrite cursor + URL helpers", () => {
  it("parses the {orgIndex, continuation} cursor and restarts on garbage", () => {
    expect(parseEventbriteCursor(null)).toEqual({
      orgIndex: 0,
      continuation: null,
    });
    expect(
      parseEventbriteCursor(
        JSON.stringify({ orgIndex: 3, continuation: "abc" }),
      ),
    ).toEqual({ orgIndex: 3, continuation: "abc" });
    expect(parseEventbriteCursor("garbage")).toEqual({
      orgIndex: 0,
      continuation: null,
    });
    expect(
      parseEventbriteCursor(JSON.stringify({ orgIndex: -2, continuation: 5 })),
    ).toEqual({ orgIndex: 0, continuation: null });
  });

  it("builds the organizer-scoped live-events URL with no token in it", () => {
    expect(eventbriteEventsUrl("26163087533")).toBe(
      "https://www.eventbriteapi.com/v3/organizations/26163087533/events/?status=live&expand=venue,organizer",
    );
    expect(eventbriteEventsUrl("26163087533", "ey J+x")).toContain(
      "&continuation=ey%20J%2Bx",
    );
    expect(eventbriteEventsUrl("26163087533")).not.toContain("token");
  });
});

describe("eventbrite fetchSince", () => {
  it("throws the clear config error when EVENTBRITE_TOKEN is unset", async () => {
    twoOrganizers();
    await expect(
      eventbriteConnector.fetchSince({ cursor: null }),
    ).rejects.toThrow(EVENTBRITE_TOKEN_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls the first organizer with a Bearer header (token never in the URL)", async () => {
    process.env.EVENTBRITE_TOKEN = "test-token";
    twoOrganizers();
    fetchMock.mockResolvedValue(jsonResponse(fixturePage()));

    const result = await eventbriteConnector.fetchSince({ cursor: null });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(eventbriteEventsUrl("26163087533"));
    expect(String(url)).not.toContain("test-token");
    expect(init?.headers?.Authorization).toBe("Bearer test-token");

    // One rawItem per event, with a string id injected for the sync engine.
    expect(result.rawItems).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.rawItems[0] as any).id).toBe("1234567890123");
    // Fixture page is the org's last (has_more_items false) → walk on to org 2.
    expect(result.nextCursor).toBe(
      JSON.stringify({ orgIndex: 1, continuation: null }),
    );
    expect(result.hasMore).toBe(true);
  });

  it("stays on the same organizer while Eventbrite returns a continuation", async () => {
    process.env.EVENTBRITE_TOKEN = "test-token";
    twoOrganizers();
    const page = fixturePage();
    page.pagination = {
      ...page.pagination,
      has_more_items: true,
      continuation: "abc123",
    };
    fetchMock.mockResolvedValue(jsonResponse(page));

    const result = await eventbriteConnector.fetchSince({ cursor: null });
    expect(result.nextCursor).toBe(
      JSON.stringify({ orgIndex: 0, continuation: "abc123" }),
    );
    expect(result.hasMore).toBe(true);

    // Resuming passes the continuation through to the API.
    await eventbriteConnector.fetchSince({ cursor: result.nextCursor });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      eventbriteEventsUrl("26163087533", "abc123"),
    );
  });

  it("finishes the walk on the last organizer's last page", async () => {
    process.env.EVENTBRITE_TOKEN = "test-token";
    twoOrganizers();
    fetchMock.mockResolvedValue(jsonResponse(fixturePage()));

    const result = await eventbriteConnector.fetchSince({
      cursor: JSON.stringify({ orgIndex: 1, continuation: null }),
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      eventbriteEventsUrl("15393768327"),
    );
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("returns an empty result when no organizer has a verified Eventbrite id", async () => {
    process.env.EVENTBRITE_TOKEN = "test-token";
    state.organizers = [];

    const result = await eventbriteConnector.fetchSince({ cursor: null });
    expect(result).toMatchObject({
      rawItems: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces API failures without leaking the token", async () => {
    process.env.EVENTBRITE_TOKEN = "test-token";
    twoOrganizers();
    fetchMock.mockResolvedValue(jsonResponse({ error: "RATE_LIMITED" }, 429));

    let message = "";
    try {
      await eventbriteConnector.fetchSince({ cursor: null });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe("Eventbrite API 429 for organisation 26163087533");
    expect(message).not.toContain("test-token");
  });
});

describe("eventbrite normalize", () => {
  it("maps an in-person event: venue, string lat/lng parsed, organizer expanded", async () => {
    const [event] = fixturePage().events;
    const [e] = await eventbriteConnector.normalize(event);

    expect(e.sourceName).toBe("eventbrite");
    expect(e.sourceEventId).toBe("1234567890123");
    expect(e.title).toBe("Founders & Investors Pitch Night");
    expect(e.eventUrl).toContain("eventbrite.co.uk/e/founders-investors");
    expect(e.startsAt).toBe("2026-07-02T17:00:00.000Z");
    expect(e.endsAt).toBe("2026-07-02T20:00:00.000Z");
    expect(e.isVirtual).toBe(false);
    expect(e.venueName).toBe("Huckletree Shoreditch");
    expect(e.address).toBe("Alphabeta Building, 18 Finsbury Square");
    expect(e.city).toBe("London");
    expect(e.region).toBe("Greater London");
    expect(e.postcode).toBe("EC2A 1AH");
    // Deprecated-but-present string coordinates are parsed, no geocode needed.
    expect(e.latitude).toBeCloseTo(51.5202766);
    expect(e.longitude).toBeCloseTo(-0.0846085);
    expect(geocodePostcodeMock).not.toHaveBeenCalled();
    expect(e.eventType).toBe("pitch-night");
    expect(e.organizerName).toBe("Entrepreneurs Collective");
    expect(e.organizerUrl).toContain(
      "eventbrite.co.uk/o/entrepreneurs-collective",
    );
    expect(e.organizerEventbriteId).toBe("26163087533");
    expect(e.priceText).toBeNull();
  });

  it("maps an online event: virtual, no venue fields, free ticket text", async () => {
    const event = fixturePage().events[1];
    const [e] = await eventbriteConnector.normalize(event);

    expect(e.isVirtual).toBe(true);
    expect(e.venueName).toBeNull();
    expect(e.address).toBeNull();
    expect(e.city).toBeNull();
    expect(e.postcode).toBeNull();
    expect(e.latitude).toBeNull();
    expect(e.longitude).toBeNull();
    expect(e.eventType).toBe("webinar");
    expect(e.priceText).toBe("Free");
    expect(geocodePostcodeMock).not.toHaveBeenCalled();
  });

  it("falls back to geocoding the venue postcode when lat/lng are missing", async () => {
    geocodePostcodeMock.mockResolvedValue({ lat: 53.7959, lng: -1.5475 });
    const event = fixturePage().events[2];
    const [e] = await eventbriteConnector.normalize(event);

    expect(geocodePostcodeMock).toHaveBeenCalledWith("LS1 4JB");
    expect(e.latitude).toBeCloseTo(53.7959);
    expect(e.longitude).toBeCloseTo(-1.5475);
    expect(e.city).toBe("Leeds");
    expect(e.eventType).toBe("angel-network");
    expect(e.organizerEventbriteId).toBe("15393768327");
  });

  it("keeps coordinates null when the geocode fallback finds nothing", async () => {
    geocodePostcodeMock.mockResolvedValue(null);
    const [e] = await eventbriteConnector.normalize(fixturePage().events[2]);
    expect(e.latitude).toBeNull();
    expect(e.longitude).toBeNull();
  });

  it("returns [] for events without an id or title", async () => {
    expect(await eventbriteConnector.normalize({})).toEqual([]);
    expect(
      await eventbriteConnector.normalize({ id: "123", name: { text: "  " } }),
    ).toEqual([]);
    expect(
      await eventbriteConnector.normalize({ name: { text: "No id" } }),
    ).toEqual([]);
  });
});
