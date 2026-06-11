/**
 * Contract tests for the investor event sources admin routes:
 *
 *   - GET  /api/event-sources            — auto-seeds, lists sources with counts + hasConnector
 *   - PATCH /api/event-sources/[name]    — operator-only enable/disable toggle
 *   - POST /api/event-sources/[name]/sync — operator-only single-source sync
 *   - POST /api/event-sources/sync-all   — operator-only sweep of enabled connectors
 *   - GET  /api/cron/sync-events         — CRON_SECRET fail-closed (500 unset / 401 wrong)
 *
 * Supabase, the admin gate, the sync engine, and the connector registry are all
 * mocked, so these run with no network and no env vars.
 *
 * The connector registry (lib/events/connectors) is delivered by the connectors
 * workstream; until it lands these tests skip rather than fail the suite —
 * vi.doMock + dynamic route imports keep the unresolvable path from ever being
 * touched while skipped.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const connectorsReady =
  existsSync(path.resolve(process.cwd(), "lib/events/connectors/index.ts")) ||
  existsSync(path.resolve(process.cwd(), "lib/events/connectors.ts"));

const mocks = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  requireOperator: vi.fn(),
  getEventConnector: vi.fn(),
  allEventConnectors: vi.fn(),
  syncEventSource: vi.fn(),
  seedEventSources: vi.fn(),
  seedInvestorOrganizers: vi.fn(),
}));

// Mock both service-client import paths so the real modules (which read env
// vars at import time) never load.
vi.mock("@/lib/supabase", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireOperator: mocks.requireOperator,
}));
vi.mock("@/lib/events/sync", () => ({
  syncEventSource: mocks.syncEventSource,
  seedEventSources: mocks.seedEventSources,
}));
vi.mock("@/lib/events/seed", () => ({
  seedInvestorOrganizers: mocks.seedInvestorOrganizers,
}));

interface TableResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

interface ChainCall {
  method: string;
  args: unknown[];
}

/**
 * Chainable PostgrestBuilder-style stub with a per-table QUEUE of results:
 * each await of a chain for a table consumes the next queued result (the
 * event-sources GET queries investor_event_sources twice — head-count then
 * list). Every call is recorded so tests can assert on the filters applied.
 */
function makeSupabaseStub(queues: Record<string, TableResult[]> = {}) {
  const calls: ChainCall[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "order",
      "limit",
      "update",
      "insert",
      "upsert",
      "single",
    ]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method: `${table}.${method}`, args });
        return chain;
      };
    }
    chain.then = (
      onFulfilled?: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const queue = queues[table];
      const result =
        queue && queue.length > 0
          ? queue.shift()!
          : { data: [], error: null, count: 0 };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  });
  return { client: { from }, calls };
}

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "ukbaa",
    display_name: "UKBAA — UK Business Angels Association",
    base_url: "https://www.ukbaa.org.uk",
    enabled: true,
    last_run_at: null,
    last_successful_sync_at: null,
    last_error: null,
    last_cursor: null,
    last_fetched_count: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function syncResult(source: string) {
  return {
    source,
    fetched: 2,
    pages: 1,
    rawStored: 2,
    duplicatesSkipped: 0,
    eventsUpserted: 2,
    eventsErrored: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
  };
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe.skipIf(!connectorsReady)("event sources admin routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // The connector registry may not exist while the connectors workstream is
    // mid-flight — register its mock lazily (doMock is not hoisted) so the
    // real path is only ever resolved when these tests actually run.
    vi.doMock("@/lib/events/connectors", () => ({
      getEventConnector: mocks.getEventConnector,
      allEventConnectors: mocks.allEventConnectors,
    }));
    mocks.seedEventSources.mockResolvedValue(undefined);
    mocks.seedInvestorOrganizers.mockResolvedValue(undefined);
    mocks.requireOperator.mockResolvedValue(null);
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  describe("GET /api/event-sources", () => {
    it("auto-seeds when empty and returns sources with counts and hasConnector", async () => {
      const stub = makeSupabaseStub({
        investor_event_sources: [
          { count: 0 }, // head-count probe → empty → seed
          { data: [sourceRow()], error: null },
        ],
        investor_events: [{ count: 3 }],
        raw_event_notices: [{ count: 5 }],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);
      mocks.getEventConnector.mockReturnValue({ sourceName: "ukbaa" });

      const { GET } = await import("@/app/api/event-sources/route");
      const res = await GET();

      expect(res.status).toBe(200);
      expect(mocks.seedEventSources).toHaveBeenCalledTimes(1);
      // Organizer catalog is seeded on every load (insert-only-missing) so
      // synced events can link organizer_id.
      expect(mocks.seedInvestorOrganizers).toHaveBeenCalledTimes(1);

      const body = (await res.json()) as {
        sources: Array<Record<string, unknown>>;
      };
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0]).toMatchObject({
        name: "ukbaa",
        event_count: 3,
        raw_count: 5,
        hasConnector: true,
      });
    });

    it("does not re-seed sources when rows already exist", async () => {
      const stub = makeSupabaseStub({
        investor_event_sources: [
          { count: 2 },
          { data: [sourceRow()], error: null },
        ],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);
      mocks.getEventConnector.mockReturnValue(undefined);

      const { GET } = await import("@/app/api/event-sources/route");
      const res = await GET();

      expect(res.status).toBe(200);
      expect(mocks.seedEventSources).not.toHaveBeenCalled();
      const body = (await res.json()) as {
        sources: Array<Record<string, unknown>>;
      };
      expect(body.sources[0]).toMatchObject({ hasConnector: false });
    });
  });

  describe("PATCH /api/event-sources/[name]", () => {
    function patchRequest(body: unknown): NextRequest {
      return new NextRequest("http://localhost/api/event-sources/ukbaa", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("is operator-gated", async () => {
      const { NextResponse } = await import("next/server");
      mocks.requireOperator.mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

      const { PATCH } = await import("@/app/api/event-sources/[name]/route");
      const res = await PATCH(patchRequest({ enabled: false }), {
        params: Promise.resolve({ name: "ukbaa" }),
      });

      expect(res.status).toBe(403);
      expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
    });

    it("rejects a non-boolean enabled flag", async () => {
      const { PATCH } = await import("@/app/api/event-sources/[name]/route");
      const res = await PATCH(patchRequest({ enabled: "yes" }), {
        params: Promise.resolve({ name: "ukbaa" }),
      });
      expect(res.status).toBe(400);
    });

    it("flips the enabled flag for the named source", async () => {
      const stub = makeSupabaseStub({
        investor_event_sources: [{ error: null }],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);

      const { PATCH } = await import("@/app/api/event-sources/[name]/route");
      const res = await PATCH(patchRequest({ enabled: false }), {
        params: Promise.resolve({ name: "ukbaa" }),
      });

      expect(res.status).toBe(200);
      expect(stub.calls).toContainEqual({
        method: "investor_event_sources.update",
        args: [{ enabled: false }],
      });
      expect(stub.calls).toContainEqual({
        method: "investor_event_sources.eq",
        args: ["name", "ukbaa"],
      });
    });
  });

  describe("POST /api/event-sources/[name]/sync", () => {
    it("404s for a source without a connector", async () => {
      mocks.getEventConnector.mockReturnValue(undefined);

      const { POST } =
        await import("@/app/api/event-sources/[name]/sync/route");
      const res = await POST(
        new NextRequest("http://localhost/api/event-sources/nope/sync", {
          method: "POST",
        }),
        { params: Promise.resolve({ name: "nope" }) },
      );

      expect(res.status).toBe(404);
      expect(mocks.syncEventSource).not.toHaveBeenCalled();
    });

    it("runs the connector and returns the sync result", async () => {
      const connector = { sourceName: "ukbaa" };
      mocks.getEventConnector.mockReturnValue(connector);
      mocks.syncEventSource.mockResolvedValue(syncResult("ukbaa"));

      const { POST } =
        await import("@/app/api/event-sources/[name]/sync/route");
      const res = await POST(
        new NextRequest("http://localhost/api/event-sources/ukbaa/sync", {
          method: "POST",
        }),
        { params: Promise.resolve({ name: "ukbaa" }) },
      );

      expect(res.status).toBe(200);
      expect(mocks.syncEventSource).toHaveBeenCalledWith(connector);
      const body = (await res.json()) as { eventsUpserted: number };
      expect(body.eventsUpserted).toBe(2);
    });
  });

  describe("POST /api/event-sources/sync-all", () => {
    it("seeds, then syncs only enabled sources that have connectors", async () => {
      const ukbaa = { sourceName: "ukbaa" };
      const eventbrite = { sourceName: "eventbrite" };
      mocks.allEventConnectors.mockReturnValue([ukbaa, eventbrite]);
      mocks.syncEventSource.mockResolvedValue(syncResult("ukbaa"));
      const stub = makeSupabaseStub({
        investor_event_sources: [
          {
            data: [
              { name: "ukbaa", enabled: true },
              { name: "eventbrite", enabled: false },
            ],
            error: null,
          },
        ],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);

      const { POST } = await import("@/app/api/event-sources/sync-all/route");
      const res = await POST();

      expect(res.status).toBe(200);
      expect(mocks.seedEventSources).toHaveBeenCalledTimes(1);
      expect(mocks.seedInvestorOrganizers).toHaveBeenCalledTimes(1);
      expect(mocks.syncEventSource).toHaveBeenCalledTimes(1);
      expect(mocks.syncEventSource).toHaveBeenCalledWith(
        ukbaa,
        expect.objectContaining({
          maxPages: expect.any(Number),
          timeBudgetMs: expect.any(Number),
        }),
      );
      const body = (await res.json()) as { ran: string[] };
      expect(body.ran).toEqual(["ukbaa"]);
    });

    it("reports a rejected connector as an errored per-source summary", async () => {
      const ukbaa = { sourceName: "ukbaa" };
      mocks.allEventConnectors.mockReturnValue([ukbaa]);
      mocks.syncEventSource.mockRejectedValue(new Error("boom"));
      const stub = makeSupabaseStub({
        investor_event_sources: [
          { data: [{ name: "ukbaa", enabled: true }], error: null },
        ],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);

      const { POST } = await import("@/app/api/event-sources/sync-all/route");
      const res = await POST();

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: Array<{ source: string; errors: string[] }>;
      };
      expect(body.results[0].source).toBe("ukbaa");
      expect(body.results[0].errors).toEqual(["boom"]);
    });
  });

  describe("GET /api/cron/sync-events", () => {
    function cronRequest(auth?: string): NextRequest {
      return new NextRequest("http://localhost/api/cron/sync-events", {
        headers: auth ? { authorization: auth } : {},
      });
    }

    it("fails closed with 500 when CRON_SECRET is not configured", async () => {
      delete process.env.CRON_SECRET;

      const { GET } = await import("@/app/api/cron/sync-events/route");
      const res = await GET(cronRequest("Bearer anything"));

      expect(res.status).toBe(500);
      expect(mocks.seedEventSources).not.toHaveBeenCalled();
      expect(mocks.syncEventSource).not.toHaveBeenCalled();
    });

    it("401s on a missing or wrong bearer token", async () => {
      process.env.CRON_SECRET = "test-secret";

      const { GET } = await import("@/app/api/cron/sync-events/route");
      expect((await GET(cronRequest())).status).toBe(401);
      expect((await GET(cronRequest("Bearer wrong"))).status).toBe(401);
      expect(mocks.syncEventSource).not.toHaveBeenCalled();
    });

    it("syncs enabled connectors with a per-source budget when authorised", async () => {
      process.env.CRON_SECRET = "test-secret";
      const ukbaa = { sourceName: "ukbaa" };
      const eventbrite = { sourceName: "eventbrite" };
      mocks.allEventConnectors.mockReturnValue([ukbaa, eventbrite]);
      mocks.syncEventSource.mockResolvedValue(syncResult("ukbaa"));
      const stub = makeSupabaseStub({
        investor_event_sources: [
          {
            data: [
              { name: "ukbaa", enabled: true },
              { name: "eventbrite", enabled: false },
            ],
            error: null,
          },
        ],
      });
      mocks.getServiceSupabase.mockReturnValue(stub.client);

      const { GET } = await import("@/app/api/cron/sync-events/route");
      const res = await GET(cronRequest("Bearer test-secret"));

      expect(res.status).toBe(200);
      expect(mocks.seedEventSources).toHaveBeenCalledTimes(1);
      expect(mocks.seedInvestorOrganizers).toHaveBeenCalledTimes(1);
      expect(mocks.syncEventSource).toHaveBeenCalledTimes(1);
      expect(mocks.syncEventSource).toHaveBeenCalledWith(
        ukbaa,
        expect.objectContaining({
          maxPages: expect.any(Number),
          timeBudgetMs: expect.any(Number),
        }),
      );
      const body = (await res.json()) as { ran: string[] };
      expect(body.ran).toEqual(["ukbaa"]);
    });
  });
});

// Visible signal (not a silent skip) that the registry hasn't landed yet.
describe.runIf(!connectorsReady)(
  "event sources admin routes (pending connectors)",
  () => {
    it("skips until lib/events/connectors lands", () => {
      expect(connectorsReady).toBe(false);
    });
  },
);
