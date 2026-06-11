import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPayload } from "@/lib/procurement/hash";

// Shared mock state (hoisted so the vi.mock factory can read it).
const state = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceRow: null as any, // .single() row for sources / grant_sources
  existingNames: [] as string[], // grant_sources select("name") rows (seed)
  rawHashes: [] as string[], // raw_grant_notices content_hash dedup hits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openGrants: [] as any[], // grants select("id, source_notice_id") rows (prune)
  upsertErrors: {} as Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertCalls: [] as any[],
}));

// Minimal thenable query-builder covering the chains both sync engines use:
// select().eq().single(), select().eq().in(), select().eq().neq(),
// update().eq(), update().in(), insert(), upsert().select().
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        _cols: null as string | null,
        _update: undefined as unknown,
        _in: null as { col: string; vals: unknown[] } | null,
        select(cols?: string) {
          b._cols = cols ?? "*";
          return b;
        },
        eq() {
          return b;
        },
        neq() {
          return b;
        },
        in(col: string, vals: unknown[]) {
          b._in = { col, vals };
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
          return {
            select: () =>
              Promise.resolve({
                data: error ? null : rows.map((_, i) => ({ id: `gid-${i}` })),
                error,
              }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (res: any, rej: any) =>
              Promise.resolve({ data: null, error }).then(res, rej),
          };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(resolve: any, reject: any) {
          if (b._update !== undefined) {
            state.updateCalls.push({ table, payload: b._update, in: b._in });
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject,
            );
          }
          let data: unknown[] = [];
          if (table === "grant_sources" && b._cols === "name") {
            data = state.existingNames.map((name) => ({ name }));
          } else if (
            table === "raw_grant_notices" &&
            b._cols === "content_hash"
          ) {
            data = state.rawHashes.map((content_hash) => ({ content_hash }));
          } else if (table === "grants") {
            data = state.openGrants;
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  }),
}));

vi.mock("@/lib/grants/alerts", () => ({
  matchAlertsForGrants: vi.fn().mockResolvedValue(undefined),
}));

import { syncSource } from "@/lib/procurement/sync";
import { syncGrantSource, seedGrantSources } from "@/lib/grants/sync";

function throwingConnector() {
  return {
    sourceName: "find-tender",
    displayName: "Find a Tender",
    baseUrl: "https://x",
    fetchSince: vi
      .fn()
      .mockRejectedValue(
        new Error("Find a Tender API returned 400: Bad Request"),
      ),
    normalize: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function grantConnector(overrides: Record<string, unknown> = {}): any {
  return {
    sourceName: "govuk-find-a-grant",
    displayName: "GOV.UK Find a Grant",
    baseUrl: "https://x",
    fetchSince: vi.fn(),
    normalize: vi.fn(),
    ...overrides,
  };
}

function normalizedGrant(id: string) {
  return {
    sourceName: "govuk-find-a-grant",
    sourceNoticeId: id,
    title: `Grant ${id}`,
    status: "open",
    rawJson: {},
  };
}

function pageResult(items: unknown[], hasMore = false) {
  return {
    sourceName: "govuk-find-a-grant",
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
  state.openGrants.length = 0;
  state.upsertErrors = {};
  state.updateCalls.length = 0;
  state.upsertCalls.length = 0;
  state.insertCalls.length = 0;
});

describe("syncSource page-0 error handling", () => {
  it("forward sync records the error AND clears a poisoned cursor", async () => {
    state.sourceRow = {
      last_cursor: "POISONED-CURSOR",
      last_successful_sync_at: "2026-06-01T00:00:00Z",
    };

    const res = await syncSource(throwingConnector());

    expect(res.errors[0]).toContain("400");
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].table).toBe("sources");
    expect(state.updateCalls[0].payload.last_error).toContain("400");
    // The poisoned cursor must be cleared so the source self-recovers next run.
    expect(state.updateCalls[0].payload.last_cursor).toBeNull();
  });

  it("backfill page-0 failure does NOT clobber the forward-sync status", async () => {
    state.sourceRow = {
      last_cursor: null,
      last_successful_sync_at: "2026-06-01T00:00:00Z",
    };

    const res = await syncSource(throwingConnector(), {
      backfill: true,
      fromDate: new Date("2024-01-01T00:00:00Z"),
      toDate: new Date("2024-01-14T00:00:00Z"),
    });

    expect(res.errors[0]).toContain("400");
    // No write to the sources row — the historical sweep must not overwrite
    // last_error / last_cursor for the forward sync.
    expect(state.updateCalls).toHaveLength(0);
  });
});

describe("syncGrantSource error handling", () => {
  it("page-0 failure records the ATTEMPT (last_run_at) plus the error, and clears the cursor", async () => {
    state.sourceRow = {
      last_cursor: "POISONED-CURSOR",
      last_successful_sync_at: null,
    };
    const connector = grantConnector({
      fetchSince: vi
        .fn()
        .mockRejectedValue(
          new Error("The operation was aborted due to timeout"),
        ),
    });

    const res = await syncGrantSource(connector);

    expect(res.errors[0]).toContain("timeout");
    const call = state.updateCalls.find((u) => u.table === "grant_sources");
    expect(call).toBeDefined();
    expect(call.payload.last_error).toContain("timeout");
    expect(call.payload.last_cursor).toBeNull();
    // Live 360giving bug: failed runs left last_run_at NULL forever — attempts
    // must be recorded, not just successes.
    expect(typeof call.payload.last_run_at).toBe("string");
    expect(call.payload.last_fetched_count).toBe(0);
    expect(call.payload.last_pages).toBe(0);
  });

  it("raw insert failure blocks normalisation (raw-before-normalise)", async () => {
    state.upsertErrors["raw_grant_notices"] = "payload too large";
    const normalize = vi.fn();
    const connector = grantConnector({
      fetchSince: vi
        .fn()
        .mockResolvedValue(pageResult([{ id: "g-1", title: "A" }])),
      normalize,
    });

    const res = await syncGrantSource(connector);

    // No grant row may exist without its raw audit trail.
    expect(normalize).not.toHaveBeenCalled();
    expect(state.upsertCalls.map((u) => u.table)).toEqual([
      "raw_grant_notices",
    ]);
    expect(res.rawStored).toBe(0);
    expect(res.grantsUpserted).toBe(0);
    expect(res.grantsErrored).toBe(1);
    expect(res.errors[0]).toContain("raw_grant_notices");
    // The errored run must not advance the success watermark.
    const call = state.updateCalls.find((u) => u.table === "grant_sources");
    expect(call.payload.last_successful_sync_at).toBeFalsy();
    expect(typeof call.payload.last_run_at).toBe("string");
  });

  it("a clean duplicates-only run still advances last_successful_sync_at", async () => {
    const item = { id: "g-1", title: "A" };
    state.sourceRow = {
      last_cursor: null,
      last_successful_sync_at: "2026-06-01T00:00:00Z",
    };
    state.rawHashes.push(hashPayload(item)); // already ingested last night
    const connector = grantConnector({
      fetchSince: vi.fn().mockResolvedValue(pageResult([item])),
    });

    const res = await syncGrantSource(connector);

    expect(res.errors).toHaveLength(0);
    expect(res.duplicatesSkipped).toBe(1);
    const call = state.updateCalls.find((u) => u.table === "grant_sources");
    expect(typeof call.payload.last_successful_sync_at).toBe("string");
    expect(call.payload.last_successful_sync_at).not.toBe(
      "2026-06-01T00:00:00Z",
    );
  });

  it("delisting prune is SKIPPED on a cursor-resumed run (partial picture)", async () => {
    state.sourceRow = { last_cursor: '{"page":7}' }; // resuming mid-walk
    state.openGrants.push({ id: "stale-id", source_notice_id: "stale-1" });
    const connector = grantConnector({
      listsAllOpenCalls: true,
      fetchSince: vi
        .fn()
        .mockResolvedValue(pageResult([{ id: "seen-1", title: "B" }])),
      normalize: vi.fn().mockResolvedValue([normalizedGrant("seen-1")]),
    });

    const res = await syncGrantSource(connector);

    expect(res.errors).toHaveLength(0);
    expect(res.closedPruned).toBe(0);
    const closes = state.updateCalls.filter(
      (u) => u.table === "grants" && u.payload?.status === "closed",
    );
    expect(closes).toHaveLength(0);
  });

  it("delisting prune runs on a complete full walk from page 1", async () => {
    state.sourceRow = { last_cursor: null };
    state.openGrants.push({ id: "stale-id", source_notice_id: "stale-1" });
    const connector = grantConnector({
      listsAllOpenCalls: true,
      fetchSince: vi
        .fn()
        .mockResolvedValue(pageResult([{ id: "seen-1", title: "B" }])),
      normalize: vi.fn().mockResolvedValue([normalizedGrant("seen-1")]),
    });

    const res = await syncGrantSource(connector);

    expect(res.errors).toHaveLength(0);
    expect(res.closedPruned).toBe(1);
    const closes = state.updateCalls.filter(
      (u) => u.table === "grants" && u.payload?.status === "closed",
    );
    expect(closes).toHaveLength(1);
    expect(closes[0].in?.vals).toEqual(["stale-id"]);
  });
});

describe("seedGrantSources", () => {
  it("fresh DB: inserts all sources with the right enabled flags", async () => {
    await seedGrantSources();

    expect(state.insertCalls).toHaveLength(1);
    const rows = state.insertCalls[0].rows as Array<{
      name: string;
      enabled: boolean;
    }>;
    const enabledByName = Object.fromEntries(
      rows.map((r) => [r.name, r.enabled]),
    );
    expect(enabledByName["ukri-funding-finder"]).toBe(true); // core UK coverage
    expect(enabledByName["sedia-horizon"]).toBe(false); // operator opts in
    expect(enabledByName["ukri-gtr"]).toBe(false); // no connector — "Planned"
    expect(enabledByName["360giving"]).toBe(true);
    // Fresh rows are already correct — no repair update needed.
    expect(state.updateCalls).toHaveLength(0);
  });

  it("existing DB: inserts only missing rows and never clobbers healthy sources", async () => {
    state.existingNames.push(
      "360giving",
      "ukri-gtr",
      "govuk-find-a-grant",
      "innovate-uk",
      "manual-upload",
    );

    await seedGrantSources();

    // Only the two new sources are inserted.
    expect(state.insertCalls).toHaveLength(1);
    const names = (state.insertCalls[0].rows as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(names.sort()).toEqual(["sedia-horizon", "ukri-funding-finder"]);

    // Exactly one targeted repair: disable the dead ukri-gtr row by name —
    // operator toggles and sync state on every other source are untouched.
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].table).toBe("grant_sources");
    expect(state.updateCalls[0].payload.enabled).toBe(false);
    expect(state.updateCalls[0].in).toEqual({
      col: "name",
      vals: ["ukri-gtr"],
    });
  });

  it("fully-seeded DB: no inserts, only the dead-source repair", async () => {
    state.existingNames.push(
      "360giving",
      "ukri-gtr",
      "govuk-find-a-grant",
      "innovate-uk",
      "ukri-funding-finder",
      "sedia-horizon",
      "manual-upload",
    );

    await seedGrantSources();

    expect(state.insertCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].in?.vals).toEqual(["ukri-gtr"]);
  });
});
