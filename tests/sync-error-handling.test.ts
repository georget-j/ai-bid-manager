import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock state (hoisted so the vi.mock factory can read it).
const state = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceRow: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateCalls: [] as any[],
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return Promise.resolve({ data: [] });
        },
        single() {
          return Promise.resolve({ data: state.sourceRow });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(payload: any) {
          return {
            eq() {
              state.updateCalls.push({ table, payload });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  }),
}));

import { syncSource } from "@/lib/procurement/sync";

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

beforeEach(() => {
  state.sourceRow = null;
  state.updateCalls.length = 0;
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
