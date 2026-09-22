import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hashPayload } from "@/lib/procurement/hash";
import { classifyEventType, classifyVirtual } from "@/lib/events/classify";
import {
  geocodePostcode,
  geocodeVenue,
  clearGeocodeCache,
} from "@/lib/events/geocode";

// Shared mock state (hoisted so the vi.mock factory can read it) — same harness
// pattern as tests/sync-error-handling.test.ts.
const state = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceRow: null as any, // .single() row for investor_event_sources
  existingNames: [] as string[], // investor_event_sources select("name") rows (seed)
  rawHashes: [] as string[], // raw_event_notices content_hash dedup hits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  organizers: [] as any[], // investor_organizers select rows (linking)
  upsertErrors: {} as Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertCalls: [] as any[],
}));

// Minimal thenable query-builder covering the chains the events sync engine
// uses: select().eq().single(), select().eq().in(), select() (organizers),
// update().eq(), insert(), upsert().
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        _cols: null as string | null,
        _update: undefined as unknown,
        select(cols?: string) {
          b._cols = cols ?? "*";
          return b;
        },
        eq() {
          return b;
        },
        in() {
          return b;
        },
        single() {
          return Promise.resolve({ data: state.sourceRow, error: null });
        },
        update(payload: unknown) {
          b._update = payload;
          return b;
        },
        insert(rows: unknown) {
          state.insertCalls.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert(rows: any[], opts: unknown) {
          state.upsertCalls.push({ table, rows, opts });
          const msg = state.upsertErrors[table];
          const error = msg ? { message: msg } : null;
          return Promise.resolve({ data: null, error });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(resolve: any, reject: any) {
          if (b._update !== undefined) {
            state.updateCalls.push({ table, payload: b._update });
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject,
            );
          }
          let data: unknown[] = [];
          if (table === "investor_event_sources" && b._cols === "name") {
            data = state.existingNames.map((name) => ({ name }));
          } else if (
            table === "raw_event_notices" &&
            b._cols === "content_hash"
          ) {
            data = state.rawHashes.map((content_hash) => ({ content_hash }));
          } else if (table === "investor_organizers") {
            data = state.organizers;
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  }),
}));

import {
  syncEventSource,
  seedEventSources,
  matchOrganizerId,
} from "@/lib/events/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventConnector(overrides: Record<string, unknown> = {}): any {
  return {
    sourceName: "eventbrite",
    displayName: "Eventbrite",
    baseUrl: "https://x",
    fetchSince: vi.fn(),
    normalize: vi.fn(),
    ...overrides,
  };
}

function normalizedEvent(id: string, extra: Record<string, unknown> = {}) {
  return {
    sourceName: "eventbrite",
    sourceEventId: id,
    title: `Event ${id}`,
    ...extra,
  };
}

function pageResult(items: unknown[], hasMore = false) {
  return {
    sourceName: "eventbrite",
    rawItems: items,
    nextCursor: hasMore ? "next" : null,
    fetchedAt: new Date().toISOString(),
    hasMore,
  };
}

beforeEach(() => {
  state.sourceRow = null;
  state.existingNames.length = 0;
  state.rawHashes.length = 0;
  state.organizers.length = 0;
  state.upsertErrors = {};
  state.updateCalls.length = 0;
  state.upsertCalls.length = 0;
  state.insertCalls.length = 0;
});

describe("classifyEventType", () => {
  it.each([
    ["Startup Pitch Night — London", "pitch-night"],
    ["Founders pitching to angels: live!", "pitch-night"],
    ["Spring Cohort Demo Day", "demo-day"],
    ["VC Office Hours with Seedcamp", "vc-office-hours"],
    ["Angel investing 101: meet our members", "angel-network"],
    ["UK SaaS Founders Conference 2026", "conference"],
    ["Northern Tech Summit", "conference"],
    ["Founder networking drinks", "networking"],
    ["Fundraising webinar: SEIS & EIS explained", "webinar"],
    ["Incubator open evening — meet the team", "accelerator"],
    ["Annual general meeting", "other"],
  ])("%s -> %s", (title, expected) => {
    expect(classifyEventType(title)).toBe(expected);
  });

  it("falls back to the description when the title says nothing", () => {
    expect(
      classifyEventType(
        "Quarterly investor evening",
        "Six startups pitch to our angel members over dinner.",
      ),
    ).toBe("pitch-night");
  });

  it("the title outranks the description", () => {
    // A networking event whose blurb mentions pitching is still networking.
    expect(
      classifyEventType(
        "Founder networking breakfast",
        "Hear startups pitch and meet investors.",
      ),
    ).toBe("networking");
  });
});

describe("classifyVirtual", () => {
  it.each([
    ["Online — Zoom link sent on registration", true, "zoom"],
    ["Google Meet (details after sign-up)", true, "google-meet"],
    ["Microsoft Teams", true, "teams"],
    ["Webinar", true, null],
    ["Online event", true, null],
    ["Virtual — join from anywhere", true, null],
    ["TechHub, 20 Ropemaker Street, London EC2Y 9AR", false, null],
    ["", false, null],
  ])("%s -> virtual=%s platform=%s", (text, isVirtual, platform) => {
    expect(classifyVirtual(text)).toEqual({ isVirtual, platform });
  });

  it("treats null/undefined location as in-person (unknown)", () => {
    expect(classifyVirtual(null)).toEqual({ isVirtual: false, platform: null });
    expect(classifyVirtual(undefined)).toEqual({
      isVirtual: false,
      platform: null,
    });
  });
});

describe("geocode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearGeocodeCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    };
  }

  it("geocodePostcode normalises the postcode into the postcodes.io URL", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ result: { latitude: 51.52, longitude: -0.09 } }),
    );

    const point = await geocodePostcode(" ec2y 9ar ");

    expect(point).toEqual({ lat: 51.52, lng: -0.09 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.postcodes.io/postcodes/EC2Y9AR",
    );
    // Identifying User-Agent (API etiquette).
    expect(fetchMock.mock.calls[0][1]?.headers?.["User-Agent"]).toContain(
      "AIBidManager",
    );
  });

  it("geocodePostcode returns null on 404 and on network failure (never throws)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not found" }, 404));
    expect(await geocodePostcode("ZZ1 1ZZ")).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await geocodePostcode("SW1A 1AA")).toBeNull();
  });

  it("geocodePostcode caches results in-process (one fetch for repeat calls)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ result: { latitude: 53.8, longitude: -1.55 } }),
    );

    await geocodePostcode("LS1 4AP");
    await geocodePostcode("ls1 4ap"); // same postcode, different formatting

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("geocodeVenue builds a GB-restricted Nominatim query", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ lat: "51.4545", lon: "-2.5879" }]),
    );

    const point = await geocodeVenue("Bristol Beacon", "Bristol");

    expect(point).toEqual({ lat: 51.4545, lng: -2.5879 });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search",
    );
    expect(url.searchParams.get("q")).toBe("Bristol Beacon, Bristol");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("countrycodes")).toBe("gb");
  });

  it("geocodeVenue returns null on empty results and on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    expect(await geocodeVenue("Nowhere Hall", "Narnia")).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await geocodeVenue("The Shard", "London")).toBeNull();
  });
});

describe("matchOrganizerId", () => {
  const organizers = [
    {
      id: "org-ec",
      name: "Entrepreneurs Collective",
      eventbrite_org_id: "26163087533",
    },
    { id: "org-ca", name: "Cambridge Angels", eventbrite_org_id: null },
  ];

  it("matches by Eventbrite organisation id first", () => {
    expect(
      matchOrganizerId(
        {
          organizerEventbriteId: "26163087533",
          organizerName: "Totally Different Name",
        },
        organizers,
      ),
    ).toBe("org-ec");
  });

  it("falls back to a normalised name match (case/punctuation/'The'/'Ltd')", () => {
    expect(
      matchOrganizerId({ organizerName: "cambridge angels." }, organizers),
    ).toBe("org-ca");
    expect(
      matchOrganizerId(
        { organizerName: "The Entrepreneurs Collective Ltd" },
        organizers,
      ),
    ).toBe("org-ec");
  });

  it("returns null when nothing matches (no fuzzy guessing)", () => {
    expect(
      matchOrganizerId(
        { organizerName: "Cambridge Angels Society" },
        organizers,
      ),
    ).toBeNull();
    expect(matchOrganizerId({}, organizers)).toBeNull();
  });
});

describe("syncEventSource error handling", () => {
  it("page-0 failure records the ATTEMPT (last_run_at) plus the error, and clears the cursor", async () => {
    state.sourceRow = {
      last_cursor: "POISONED-CURSOR",
      last_successful_sync_at: null,
    };
    const connector = eventConnector({
      fetchSince: vi
        .fn()
        .mockRejectedValue(new Error("Eventbrite API returned 401")),
    });

    const res = await syncEventSource(connector);

    expect(res.errors[0]).toContain("401");
    const call = state.updateCalls.find(
      (u) => u.table === "investor_event_sources",
    );
    expect(call).toBeDefined();
    expect(call.payload.last_error).toContain("401");
    expect(call.payload.last_cursor).toBeNull();
    // Attempts must be recorded, not just successes (grants-engine fix).
    expect(typeof call.payload.last_run_at).toBe("string");
    expect(call.payload.last_fetched_count).toBe(0);
  });

  it("raw insert failure blocks normalisation (raw-before-normalise)", async () => {
    state.upsertErrors["raw_event_notices"] = "payload too large";
    const normalize = vi.fn();
    const connector = eventConnector({
      fetchSince: vi
        .fn()
        .mockResolvedValue(pageResult([{ id: "ev-1", name: "A" }])),
      normalize,
    });

    const res = await syncEventSource(connector);

    // No event row may exist without its raw audit trail.
    expect(normalize).not.toHaveBeenCalled();
    expect(state.upsertCalls.map((u) => u.table)).toEqual([
      "raw_event_notices",
    ]);
    expect(res.rawStored).toBe(0);
    expect(res.eventsUpserted).toBe(0);
    expect(res.eventsErrored).toBe(1);
    expect(res.errors[0]).toContain("raw_event_notices");
    // The errored run must not advance the success watermark.
    const call = state.updateCalls.find(
      (u) => u.table === "investor_event_sources",
    );
    expect(call.payload.last_successful_sync_at).toBeFalsy();
    expect(typeof call.payload.last_run_at).toBe("string");
  });

  it("a clean duplicates-only run still advances last_successful_sync_at", async () => {
    const item = { id: "ev-1", name: "A" };
    state.sourceRow = {
      last_cursor: null,
      last_successful_sync_at: "2026-06-01T00:00:00Z",
    };
    state.rawHashes.push(hashPayload(item)); // already ingested last run
    const connector = eventConnector({
      fetchSince: vi.fn().mockResolvedValue(pageResult([item])),
    });

    const res = await syncEventSource(connector);

    expect(res.errors).toHaveLength(0);
    expect(res.duplicatesSkipped).toBe(1);
    const call = state.updateCalls.find(
      (u) => u.table === "investor_event_sources",
    );
    expect(typeof call.payload.last_successful_sync_at).toBe("string");
    expect(call.payload.last_successful_sync_at).not.toBe(
      "2026-06-01T00:00:00Z",
    );
  });

  it("resumes from the stored cursor and persists it when the page cap hits", async () => {
    state.sourceRow = { last_cursor: "page-3" };
    const fetchSince = vi
      .fn()
      .mockResolvedValue(pageResult([{ id: "ev-9", name: "B" }], true));
    const connector = eventConnector({
      fetchSince,
      normalize: vi.fn().mockResolvedValue([normalizedEvent("ev-9")]),
    });

    const res = await syncEventSource(connector, { maxPages: 1 });

    // Resumed mid-walk from the stored cursor...
    expect(fetchSince.mock.calls[0][0].cursor).toBe("page-3");
    // ...and the capped run persists the NEXT cursor for the following run.
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe("next");
    const call = state.updateCalls.find(
      (u) => u.table === "investor_event_sources",
    );
    expect(call.payload.last_cursor).toBe("next");
  });

  it("links upserted events to curated organizers by name", async () => {
    state.organizers.push({
      id: "org-ca",
      name: "Cambridge Angels",
      eventbrite_org_id: null,
    });
    const connector = eventConnector({
      fetchSince: vi
        .fn()
        .mockResolvedValue(pageResult([{ id: "ev-2", name: "Pitch dinner" }])),
      normalize: vi
        .fn()
        .mockResolvedValue([
          normalizedEvent("ev-2", { organizerName: "cambridge angels" }),
        ]),
    });

    const res = await syncEventSource(connector);

    expect(res.eventsUpserted).toBe(1);
    const upsert = state.upsertCalls.find((u) => u.table === "investor_events");
    expect(upsert.rows[0].organizer_id).toBe("org-ca");
    expect(upsert.opts).toMatchObject({
      onConflict: "source_name,source_event_id",
    });
  });
});

describe("seedEventSources", () => {
  it("fresh DB: inserts all sources with the right enabled flags", async () => {
    await seedEventSources();

    expect(state.insertCalls).toHaveLength(1);
    const rows = state.insertCalls[0].rows as Array<{
      name: string;
      enabled: boolean;
    }>;
    const enabledByName = Object.fromEntries(
      rows.map((r) => [r.name, r.enabled]),
    );
    expect(enabledByName["eventbrite"]).toBe(false); // needs EVENTBRITE_TOKEN — operator opts in
    expect(enabledByName["ukbaa"]).toBe(true);
    expect(enabledByName["manual"]).toBe(true);
  });

  it("existing DB: inserts only missing rows and never clobbers operator toggles", async () => {
    state.existingNames.push("eventbrite", "manual");

    await seedEventSources();

    expect(state.insertCalls).toHaveLength(1);
    const names = (state.insertCalls[0].rows as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(names).toEqual(["ukbaa"]);
    // No updates: existing rows (incl. operator enable/disable) are untouched.
    expect(state.updateCalls).toHaveLength(0);
  });

  it("fully-seeded DB: no writes at all", async () => {
    state.existingNames.push("eventbrite", "ukbaa", "manual");

    await seedEventSources();

    expect(state.insertCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });
});
