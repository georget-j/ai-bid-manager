/**
 * Org credentials ("Your credentials" on the Evidence library page).
 *
 * Routes: /api/evidence + /api/evidence/[id] manage evidence_items rows that
 * belong to the organisation itself (client_id IS NULL). Contract under test:
 *  - 401 when the caller has no org;
 *  - every query filters by org_id AND client_id IS NULL, so the routes can
 *    never read or mutate another org's rows or a client-scoped item;
 *  - zod validation rejects bad payloads with friendly messages.
 *
 * Component helpers (components/CredentialsPanel): status chips, plain-English
 * type labels and the 60-day expiry strip are pure functions tested directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestOrgId: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/org", () => ({
  getRequestOrgId: mocks.getRequestOrgId,
}));

// Mock both import paths so the real modules (which read env vars at import
// time) never load.
vi.mock("@/lib/supabase", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));

const ORG_ID = "11111111-2222-3333-4444-555555555555";
const ITEM_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

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
  result: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const calls: ChainCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const method of [
    "select",
    "eq",
    "is",
    "order",
    "insert",
    "update",
    "delete",
    "single",
    "maybeSingle",
  ]) {
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

function jsonRequest(method: string, body: unknown): NextRequest {
  return new Request("http://test.local/api/evidence", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/evidence ──────────────────────────────────────────────────────────

describe("GET /api/evidence", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { GET } = await import("@/app/api/evidence/route");
    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("filters by the caller's org_id AND client_id IS NULL", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { GET } = await import("@/app/api/evidence/route");
    const res = await GET();

    expect(res.status).toBe(200);
    expect(stub.client.from).toHaveBeenCalledWith("evidence_items");
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["org_id", ORG_ID],
    });
    expect(stub.calls).toContainEqual({
      method: "is",
      args: ["client_id", null],
    });
  });
});

// ── POST /api/evidence ─────────────────────────────────────────────────────────

describe("POST /api/evidence", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(jsonRequest("POST", { title: "ISO 27001" }));

    expect(res.status).toBe(401);
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("rejects a payload without a name", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(
      jsonRequest("POST", { title: "", evidence_type: "certification" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/give this credential a name/i);
    expect(stub.client.from).not.toHaveBeenCalled();
  });

  it("rejects an evidence_type outside the allowed list", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(
      jsonRequest("POST", { title: "Thing", evidence_type: "blockchain" }),
    );

    expect(res.status).toBe(400);
    expect(stub.client.from).not.toHaveBeenCalled();
  });

  it("rejects a malformed expiry date", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(
      jsonRequest("POST", {
        title: "Cyber Essentials",
        evidence_type: "certification",
        expires_at: "next year",
      }),
    );

    expect(res.status).toBe(400);
    expect(stub.client.from).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(
      new Request("http://test.local/api/evidence", {
        method: "POST",
        body: "{not json",
      }) as unknown as NextRequest,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("inserts with the caller's org_id and client_id null", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const created = { id: ITEM_ID, title: "Cyber Essentials Plus" };
    const stub = makeSupabaseStub({ data: created, error: null });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { POST } = await import("@/app/api/evidence/route");
    const res = await POST(
      jsonRequest("POST", {
        title: "Cyber Essentials Plus",
        evidence_type: "certification",
        issuer: "IASME",
        expires_at: "2027-03-01",
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    const insert = stub.calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      title: "Cyber Essentials Plus",
      evidence_type: "certification",
      issuer: "IASME",
      expires_at: "2027-03-01",
      org_id: ORG_ID,
      client_id: null,
    });
  });

  it("accepts the widened types: insurance and membership", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);

    const { POST } = await import("@/app/api/evidence/route");
    for (const evidence_type of ["insurance", "membership"]) {
      const stub = makeSupabaseStub({ data: { id: ITEM_ID }, error: null });
      mocks.getServiceSupabase.mockReturnValue(stub.client);
      const res = await POST(
        jsonRequest("POST", { title: "Some cover", evidence_type }),
      );
      expect(res.status).toBe(201);
    }
  });
});

// ── PATCH /api/evidence/[id] ───────────────────────────────────────────────────

describe("PATCH /api/evidence/[id]", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/evidence/[id]/route");
    const res = await PATCH(
      jsonRequest("PATCH", { title: "New name" }),
      params(ITEM_ID),
    );

    expect(res.status).toBe(401);
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("rejects an invalid patch payload", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub();
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { PATCH } = await import("@/app/api/evidence/[id]/route");
    const res = await PATCH(
      jsonRequest("PATCH", { evidence_type: "not-a-type" }),
      params(ITEM_ID),
    );

    expect(res.status).toBe(400);
    expect(stub.client.from).not.toHaveBeenCalled();
  });

  it("scopes the update by id, org_id and client_id IS NULL", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const updated = { id: ITEM_ID, title: "Renamed" };
    const stub = makeSupabaseStub({ data: updated, error: null });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { PATCH } = await import("@/app/api/evidence/[id]/route");
    const res = await PATCH(
      jsonRequest("PATCH", { title: "Renamed" }),
      params(ITEM_ID),
    );

    expect(res.status).toBe(200);
    expect(stub.calls).toContainEqual({ method: "eq", args: ["id", ITEM_ID] });
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["org_id", ORG_ID],
    });
    expect(stub.calls).toContainEqual({
      method: "is",
      args: ["client_id", null],
    });
  });

  it("returns 404 when no org-scoped row matches", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub({ data: null, error: null });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { PATCH } = await import("@/app/api/evidence/[id]/route");
    const res = await PATCH(
      jsonRequest("PATCH", { title: "Renamed" }),
      params(ITEM_ID),
    );

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/evidence/[id] ──────────────────────────────────────────────────

describe("DELETE /api/evidence/[id]", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/evidence/[id]/route");
    const res = await DELETE(jsonRequest("DELETE", {}), params(ITEM_ID));

    expect(res.status).toBe(401);
    expect(mocks.getServiceSupabase).not.toHaveBeenCalled();
  });

  it("scopes the delete by id, org_id and client_id IS NULL", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    const stub = makeSupabaseStub({ data: null, error: null });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const { DELETE } = await import("@/app/api/evidence/[id]/route");
    const res = await DELETE(jsonRequest("DELETE", {}), params(ITEM_ID));

    expect(res.status).toBe(200);
    expect(stub.calls).toContainEqual({ method: "delete", args: [] });
    expect(stub.calls).toContainEqual({ method: "eq", args: ["id", ITEM_ID] });
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["org_id", ORG_ID],
    });
    expect(stub.calls).toContainEqual({
      method: "is",
      args: ["client_id", null],
    });
  });
});

// ── CredentialsPanel pure helpers ──────────────────────────────────────────────

describe("CredentialsPanel status chips", () => {
  it("maps each DB status to a plain-English chip", async () => {
    const { statusChip } = await import("@/components/CredentialsPanel");
    expect(statusChip("valid").label).toBe("Valid");
    expect(statusChip("expiring_soon").label).toBe("Expiring soon");
    expect(statusChip("expired").label).toBe("Expired");
    expect(statusChip("missing").label).toBe("Missing");
  });

  it("falls back to Valid for unknown statuses so nothing crashes", async () => {
    const { statusChip } = await import("@/components/CredentialsPanel");
    expect(statusChip("some_new_status").label).toBe("Valid");
  });
});

describe("CredentialsPanel type labels", () => {
  it("gives every credential type a plain-English label", async () => {
    const { CREDENTIAL_TYPES, credentialTypeLabel, credentialGroupLabel } =
      await import("@/components/CredentialsPanel");
    for (const type of CREDENTIAL_TYPES) {
      // No raw enum (snake_case) values may reach users.
      expect(credentialTypeLabel(type)).not.toMatch(/_/);
      expect(credentialGroupLabel(type)).not.toMatch(/_/);
    }
    expect(credentialTypeLabel("insurance")).toBe("Insurance");
    expect(credentialGroupLabel("case_study")).toBe("Case studies");
  });

  it("falls back to Other for unknown types so a raw enum never leaks", async () => {
    const { credentialTypeLabel, credentialGroupLabel } =
      await import("@/components/CredentialsPanel");
    expect(credentialTypeLabel("brand_new_type")).toBe("Other");
    expect(credentialGroupLabel("brand_new_type")).toBe("Other");
  });
});

describe("CredentialsPanel 60-day expiry strip", () => {
  const today = new Date("2026-06-11T09:30:00Z");

  it("counts whole days until a date", async () => {
    const { daysUntil } = await import("@/components/CredentialsPanel");
    expect(daysUntil("2026-06-11", today)).toBe(0);
    expect(daysUntil("2026-07-11", today)).toBe(30);
    expect(daysUntil("2026-06-10", today)).toBe(-1);
  });

  it("includes items expiring today through 60 days out", async () => {
    const { expiringWithin60Days } =
      await import("@/components/CredentialsPanel");
    const items = [
      { id: "today", expires_at: "2026-06-11" },
      { id: "in-30", expires_at: "2026-07-11" },
      { id: "day-60", expires_at: "2026-08-10" },
    ];
    expect(expiringWithin60Days(items, today).map((i) => i.id)).toEqual([
      "today",
      "in-30",
      "day-60",
    ]);
  });

  it("excludes expired items, far-future items and items with no expiry", async () => {
    const { expiringWithin60Days } =
      await import("@/components/CredentialsPanel");
    const items = [
      { id: "expired", expires_at: "2026-06-01" },
      { id: "day-61", expires_at: "2026-08-11" },
      { id: "no-expiry", expires_at: null },
    ];
    expect(expiringWithin60Days(items, today)).toEqual([]);
  });
});
