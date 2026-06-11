/**
 * Grants coverage fixes (audit follow-ups):
 *
 *   - Innovate UK connector: hasMore is purely "the listing kept returning full
 *     pages" — the old connector-side `page < 10` cap made a capped walk look
 *     complete (hasMore=false), which let the delisting prune mass-close grants.
 *   - GET /api/cron/sync-grants: UKRI gets maxPages 13 (a full ~12-page walk in
 *     one run), runs are tagged trigger:"cron", and a nightly deadline sweep
 *     closes any open/forthcoming grant whose deadline has passed (null
 *     deadlines untouched), reported as deadlinesSwept.
 *   - POST /api/grant-sources/[name]/sync: refuses disabled sources with 409
 *     (the audit found a disabled source got synced and stranded a cursor).
 *
 * Supabase, the admin gate, and the sync engine are mocked; the Innovate UK
 * tests stub global fetch and use fake timers (the connector paces politely).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  requireOperator: vi.fn(),
  getGrantConnector: vi.fn(),
  allGrantConnectors: vi.fn(),
  syncGrantSource: vi.fn(),
  seedGrantSources: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireOperator: mocks.requireOperator,
}));
vi.mock("@/lib/grants/connectors", () => ({
  getGrantConnector: mocks.getGrantConnector,
  allGrantConnectors: mocks.allGrantConnectors,
}));
vi.mock("@/lib/grants/sync", () => ({
  syncGrantSource: mocks.syncGrantSource,
  seedGrantSources: mocks.seedGrantSources,
}));
vi.mock("@/lib/grants/enrich", () => ({
  enrichPendingGrants: vi.fn().mockResolvedValue({ enriched: 0, attempted: 0 }),
}));
vi.mock("@/lib/grants/guide", () => ({
  generatePendingGuides: vi
    .fn()
    .mockResolvedValue({ generated: 0, attempted: 0 }),
}));
vi.mock("@/lib/grants/embed", () => ({
  embedPendingGrants: vi.fn().mockResolvedValue({ embedded: 0, attempted: 0 }),
}));

interface TableResult {
  data?: unknown;
  error?: { message: string } | null;
}

interface ChainCall {
  method: string;
  args: unknown[];
}

/** Chainable PostgrestBuilder-style stub with a per-table queue of results. */
function makeSupabaseStub(queues: Record<string, TableResult[]> = {}) {
  const calls: ChainCall[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const method of [
      "select",
      "eq",
      "neq",
      "in",
      "not",
      "lt",
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
        queue && queue.length > 0 ? queue.shift()! : { data: [], error: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  });
  return { client: { from }, calls };
}

function syncResult(source: string) {
  return {
    source,
    fetched: 1,
    pages: 1,
    rawStored: 1,
    duplicatesSkipped: 0,
    grantsUpserted: 1,
    grantsErrored: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
    closedPruned: 0,
  };
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seedGrantSources.mockResolvedValue(undefined);
  mocks.requireOperator.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

// ---------------------------------------------------------------------------
// Innovate UK connector — hasMore must reflect the LISTING, never a page cap
// ---------------------------------------------------------------------------

function listingHtml(count: number): string {
  let html = "<html><body>";
  for (let i = 0; i < count; i++) {
    const id = 2000 + i;
    html += `<a class="govuk-link" href="/competition/${id}/overview/uuid-${id}">Competition ${id}</a>`;
  }
  return html + "</body></html>";
}

function stubInnovateFetch(stubCount: number) {
  const fetchMock = vi.fn(async (url: unknown) => {
    const u = String(url);
    const body = u.includes("/competition/search")
      ? listingHtml(stubCount)
      : "<html><body>overview</body></html>";
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("innovate-uk connector hasMore", () => {
  const params = {
    from: new Date("2026-06-01T00:00:00Z"),
    to: new Date("2026-06-11T00:00:00Z"),
  };

  it("a full page AT page 10 still reports hasMore (old connector cap removed)", async () => {
    stubInnovateFetch(10);
    vi.useFakeTimers();

    const { innovateUkConnector } =
      await import("@/lib/grants/connectors/innovate-uk");
    const promise = innovateUkConnector.fetchSince({ ...params, cursor: "10" });
    await vi.advanceTimersByTimeAsync(60_000); // flush polite pacing sleeps
    const res = await promise;

    expect(res.rawItems).toHaveLength(10);
    // Pre-fix this was false (page < 10), which made a capped walk look like a
    // COMPLETE walk and armed the delisting mass-prune.
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe("11");
  });

  it("a short page means the listing genuinely ended: no more pages", async () => {
    stubInnovateFetch(3);
    vi.useFakeTimers();

    const { innovateUkConnector } =
      await import("@/lib/grants/connectors/innovate-uk");
    const promise = innovateUkConnector.fetchSince({ ...params, cursor: "12" });
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await promise;

    expect(res.rawItems).toHaveLength(3);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/cron/sync-grants — UKRI page cap, trigger tag, deadline sweep
// ---------------------------------------------------------------------------

describe("GET /api/cron/sync-grants", () => {
  function cronRequest(secret: string) {
    return new NextRequest("http://localhost/api/cron/sync-grants", {
      headers: { authorization: `Bearer ${secret}` },
    });
  }

  it("gives UKRI maxPages 13, tags runs trigger:'cron', and sweeps past-deadline grants", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const stub = makeSupabaseStub({
      grant_sources: [
        {
          data: [
            { name: "ukri-funding-finder", enabled: true },
            { name: "govuk-find-a-grant", enabled: true },
          ],
        },
      ],
      grants: [{ data: [{ id: "g1" }, { id: "g2" }], error: null }], // sweep hits 2
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);
    mocks.allGrantConnectors.mockReturnValue([
      { sourceName: "ukri-funding-finder" },
      { sourceName: "govuk-find-a-grant" },
    ]);
    mocks.syncGrantSource.mockImplementation(
      async (c: { sourceName: string }) => syncResult(c.sourceName),
    );

    const { GET } = await import("@/app/api/cron/sync-grants/route");
    const res = await GET(cronRequest("cron-secret"));

    expect(res.status).toBe(200);

    // UKRI gets the full-walk cap (13); other sources keep the default (25).
    const optsBySource = Object.fromEntries(
      mocks.syncGrantSource.mock.calls.map(
        (call: unknown[]) =>
          [(call[0] as { sourceName: string }).sourceName, call[1]] as const,
      ),
    ) as Record<string, { maxPages: number; trigger: string }>;
    expect(optsBySource["ukri-funding-finder"].maxPages).toBe(13);
    expect(optsBySource["govuk-find-a-grant"].maxPages).toBe(25);
    expect(optsBySource["ukri-funding-finder"].trigger).toBe("cron");
    expect(optsBySource["govuk-find-a-grant"].trigger).toBe("cron");

    // Sweep query shape: update grants set status='closed' where status in
    // (open, forthcoming) and deadline_at is not null and deadline_at < now().
    const update = stub.calls.find((c) => c.method === "grants.update");
    expect(update).toBeDefined();
    expect(update!.args[0]).toMatchObject({ status: "closed" });
    expect(stub.calls).toContainEqual({
      method: "grants.in",
      args: ["status", ["open", "forthcoming"]],
    });
    expect(stub.calls).toContainEqual({
      method: "grants.not",
      args: ["deadline_at", "is", null],
    });
    const lt = stub.calls.find((c) => c.method === "grants.lt");
    expect(lt).toBeDefined();
    expect(lt!.args[0]).toBe("deadline_at");
    expect(typeof lt!.args[1]).toBe("string"); // now() as ISO timestamp

    const body = (await res.json()) as { deadlinesSwept: number };
    expect(body.deadlinesSwept).toBe(2);
  });

  it("rejects a wrong bearer token", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const { GET } = await import("@/app/api/cron/sync-grants/route");
    const res = await GET(cronRequest("wrong"));
    expect(res.status).toBe(401);
    expect(mocks.syncGrantSource).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/grant-sources/[name]/sync — disabled sources are refused
// ---------------------------------------------------------------------------

describe("POST /api/grant-sources/[name]/sync", () => {
  function syncRequest(name: string) {
    return new NextRequest(`http://localhost/api/grant-sources/${name}/sync`, {
      method: "POST",
    });
  }

  it("refuses a disabled source with 409 and never starts a sync", async () => {
    const stub = makeSupabaseStub({
      grant_sources: [{ data: { enabled: false }, error: null }],
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);
    mocks.getGrantConnector.mockReturnValue({ sourceName: "sedia-horizon" });

    const { POST } = await import("@/app/api/grant-sources/[name]/sync/route");
    const res = await POST(syncRequest("sedia-horizon"), {
      params: Promise.resolve({ name: "sedia-horizon" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Source is disabled — enable it first.");
    // No sync run, so no cursor can be stranded on a disabled source.
    expect(mocks.syncGrantSource).not.toHaveBeenCalled();
  });

  it("syncs an enabled source and tags the run trigger:'manual'", async () => {
    const stub = makeSupabaseStub({
      grant_sources: [{ data: { enabled: true }, error: null }],
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);
    mocks.getGrantConnector.mockReturnValue({ sourceName: "innovate-uk" });
    mocks.syncGrantSource.mockResolvedValue(syncResult("innovate-uk"));

    const { POST } = await import("@/app/api/grant-sources/[name]/sync/route");
    const res = await POST(syncRequest("innovate-uk"), {
      params: Promise.resolve({ name: "innovate-uk" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.syncGrantSource).toHaveBeenCalledTimes(1);
    expect(mocks.syncGrantSource.mock.calls[0][1]).toMatchObject({
      trigger: "manual",
    });
  });

  it("a source with no grant_sources row yet is allowed through (not 'disabled')", async () => {
    const stub = makeSupabaseStub({
      grant_sources: [{ data: null, error: { message: "0 rows" } }],
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);
    mocks.getGrantConnector.mockReturnValue({ sourceName: "innovate-uk" });
    mocks.syncGrantSource.mockResolvedValue(syncResult("innovate-uk"));

    const { POST } = await import("@/app/api/grant-sources/[name]/sync/route");
    const res = await POST(syncRequest("innovate-uk"), {
      params: Promise.resolve({ name: "innovate-uk" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.syncGrantSource).toHaveBeenCalledTimes(1);
  });
});
