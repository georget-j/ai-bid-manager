/**
 * Contract tests for GET /api/investor-events.
 *
 * The route serves the global investor events catalogue: it must 401 callers
 * without an org, default to "all modes, next 120 days", translate the
 * mode/type filters into Supabase predicates, ignore unknown filter values,
 * and fan out to fetch the organizer rows referenced by the returned events.
 * The org helper and Supabase service client are mocked, so these run with no
 * network and no env vars.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestOrgId: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/org", () => ({
  getRequestOrgId: mocks.getRequestOrgId,
}));

// Mock both service-client import paths so the real modules (which read env
// vars at import time) never load.
vi.mock("@/lib/supabase", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));

const ORG_ID = "11111111-2222-3333-4444-555555555555";

interface ChainCall {
  method: string;
  args: unknown[];
}

interface TableResult {
  data: unknown[];
  error: { message: string } | null;
}

/**
 * Chainable PostgrestBuilder-style stub with per-table results: every query
 * method returns the chain, awaiting the chain resolves to that table's
 * result, and every call is recorded (prefixed with the table name) so tests
 * can assert on the filters applied.
 */
function makeSupabaseStub(results: Record<string, TableResult> = {}) {
  const calls: ChainCall[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    const result = results[table] ?? { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const method of [
      "select",
      "eq",
      "gte",
      "lte",
      "lt",
      "in",
      "order",
      "limit",
    ]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method: `${table}.${method}`, args });
        return chain;
      };
    }
    chain.then = (
      onFulfilled?: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return chain;
  });
  return { client: { from }, calls };
}

function makeRequest(query = ""): Request {
  return new Request(`http://localhost/api/investor-events${query}`);
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    source_name: "eventbrite",
    source_event_id: "e-1",
    organizer_id: null,
    title: "London Pitch Night",
    is_virtual: false,
    starts_at: "2026-07-01T18:00:00Z",
    event_type: "pitch-night",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/investor-events", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { GET } = await import("@/app/api/investor-events/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("defaults to all modes over the next 120 days, upcoming only, soonest first", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub({
      investor_events: { data: [eventRow()], error: null },
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const before = Date.now();
    const { GET } = await import("@/app/api/investor-events/route");
    const res = await GET(makeRequest());
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(stub.client.from).toHaveBeenCalledWith("investor_events");

    // Upcoming window: starts_at >= now - 6h and <= now + 120 days.
    const gte = stub.calls.find((c) => c.method === "investor_events.gte");
    const lte = stub.calls.find((c) => c.method === "investor_events.lte");
    expect(gte?.args[0]).toBe("starts_at");
    expect(lte?.args[0]).toBe("starts_at");
    const sinceMs = new Date(gte?.args[1] as string).getTime();
    const untilMs = new Date(lte?.args[1] as string).getTime();
    expect(sinceMs).toBeGreaterThanOrEqual(before - 6 * 3_600_000 - 1000);
    expect(sinceMs).toBeLessThanOrEqual(after - 6 * 3_600_000 + 1000);
    expect(untilMs).toBeGreaterThanOrEqual(before + 120 * 86_400_000 - 1000);
    expect(untilMs).toBeLessThanOrEqual(after + 120 * 86_400_000 + 1000);

    expect(stub.calls).toContainEqual({
      method: "investor_events.order",
      args: ["starts_at", { ascending: true }],
    });
    // No mode/type predicate by default.
    expect(stub.calls.filter((c) => c.method === "investor_events.eq")).toEqual(
      [],
    );

    const body = (await res.json()) as { events: unknown[]; organizers: [] };
    expect(body.events).toHaveLength(1);
    expect(body.organizers).toEqual([]);
  });

  it("translates mode and type filters into predicates", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/investor-events/route");
    const res = await GET(makeRequest("?mode=virtual&type=demo-day&days=30"));

    expect(res.status).toBe(200);
    expect(stub.calls).toContainEqual({
      method: "investor_events.eq",
      args: ["is_virtual", true],
    });
    expect(stub.calls).toContainEqual({
      method: "investor_events.eq",
      args: ["event_type", "demo-day"],
    });
  });

  it("filters in-person mode and ignores unknown mode/type values", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/investor-events/route");
    await GET(makeRequest("?mode=in-person"));
    expect(stub.calls).toContainEqual({
      method: "investor_events.eq",
      args: ["is_virtual", false],
    });

    const stub2 = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub2.client);
    const res = await GET(
      makeRequest("?mode=banana&type=drop-table&days=oops"),
    );
    expect(res.status).toBe(200);
    expect(
      stub2.calls.filter((c) => c.method === "investor_events.eq"),
    ).toEqual([]);
  });

  it("fetches the organizers referenced by the returned events, deduplicated", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub({
      investor_events: {
        data: [
          eventRow({ id: "ev-1", organizer_id: "org-a" }),
          eventRow({ id: "ev-2", organizer_id: "org-a" }),
          eventRow({ id: "ev-3", organizer_id: "org-b" }),
          eventRow({ id: "ev-4", organizer_id: null }),
        ],
        error: null,
      },
      investor_organizers: {
        data: [{ id: "org-a" }, { id: "org-b" }],
        error: null,
      },
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/investor-events/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(stub.client.from).toHaveBeenCalledWith("investor_organizers");
    expect(stub.calls).toContainEqual({
      method: "investor_organizers.in",
      args: ["id", ["org-a", "org-b"]],
    });
    const body = (await res.json()) as { organizers: unknown[] };
    expect(body.organizers).toHaveLength(2);
  });

  it("returns 500 with the database error message when the query fails", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub({
      investor_events: {
        data: [],
        error: { message: 'relation "investor_events" does not exist' },
      },
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/investor-events/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("investor_events");
  });
});
