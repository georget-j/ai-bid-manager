/**
 * Org-scoping contract tests for representative API route handlers.
 *
 * Every org-scoped route must (a) return 401 when the caller has no org and
 * (b) filter its Supabase query by the caller's org id. These tests exercise
 * two representative GET handlers with the org helper and the Supabase service
 * client mocked out, so they run with no network and no env vars.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestOrgId: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/org", () => ({
  getRequestOrgId: mocks.getRequestOrgId,
}));

// Routes import getServiceSupabase from "@/lib/supabase" (re-export of
// "@/lib/supabase-service") — mock both so either import path is intercepted
// and the real modules (which read env vars at import time) never load.
vi.mock("@/lib/supabase", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));

// The review queue route fires-and-forgets escalation; stub it out.
vi.mock("@/lib/review-routing", () => ({
  escalateOverdueReviews: vi.fn(async () => {}),
}));

const ORG_ID = "11111111-2222-3333-4444-555555555555";

interface ChainCall {
  method: string;
  args: unknown[];
}

/**
 * Chainable PostgrestBuilder-style stub: every query method returns the chain,
 * awaiting the chain resolves to `result`, and every call is recorded so tests
 * can assert on the filters applied.
 */
function makeSupabaseStub(
  result: { data: unknown[]; error: null } = { data: [], error: null },
) {
  const calls: ChainCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const method of ["select", "eq", "order", "limit", "ilike", "in"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (
    onFulfilled?: (value: typeof result) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  });
  return { client: { from }, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/queries — org scoping", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { GET } = await import("@/app/api/queries/route");
    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("filters the queries table by the caller's org_id", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/queries/route");
    const res = await GET();

    expect(res.status).toBe(200);
    expect(stub.client.from).toHaveBeenCalledWith("queries");
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["org_id", ORG_ID],
    });
  });
});

describe("GET /api/review/queue — org scoping", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { GET } = await import("@/app/api/review/queue/route");
    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("filters review_requests by the parent query's org_id via the inner join", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/review/queue/route");
    const res = await GET();

    expect(res.status).toBe(200);
    expect(stub.client.from).toHaveBeenCalledWith("review_requests");
    // review_requests carries no org_id column — scoping rides on the
    // queries!inner join, so the filter targets queries.org_id.
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["queries.org_id", ORG_ID],
    });
  });
});
