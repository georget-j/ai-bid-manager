// Cost controls on paid web research (funder + buyer research routes):
// kill switch, shared funder cache, hourly/daily rate limits, low context.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { state, queryLog } = vi.hoisted(() => ({
  state: {
    cacheRow: null as { payload: unknown; created_at: string } | null,
    upserts: [] as Array<Record<string, unknown>>,
    rateLimitAllowed: true,
  },
  queryLog: [] as string[],
}));

vi.mock("@/lib/org", () => ({
  getRequestOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      queryLog.push(`from:${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.cacheRow, error: null }),
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          state.upserts.push(row);
          return { error: null };
        },
      };
    },
  }),
}));

// The rate-limit module hits its own supabase import + RPC; stub it whole.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () =>
    state.rateLimitAllowed
      ? null
      : new (await import("next/server")).NextResponse(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429 },
        ),
  ),
  checkRateLimitKey: vi.fn(async () => null),
}));

const webSearchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/research/web-search", async (importOriginal) => {
  const real = await importOriginal<object>();
  return {
    ...real,
    webSearchSummary: webSearchMock,
  };
});

import { POST as funderResearch } from "@/app/api/funders/[name]/research/route";

function req(url = "https://x.test/api/funders/Acme/research") {
  return new Request(url, { method: "POST" }) as never;
}
const params = { params: Promise.resolve({ name: "Acme%20Trust" }) };

describe("funder research cost controls", () => {
  beforeEach(() => {
    state.cacheRow = null;
    state.upserts = [];
    state.rateLimitAllowed = true;
    queryLog.length = 0;
    webSearchMock.mockReset();
    webSearchMock.mockResolvedValue({
      text: "A grant funder summary.",
      citations: [{ title: "Source", url: "https://example.org" }],
    });
    delete process.env.WEB_RESEARCH_DISABLED;
  });
  afterEach(() => {
    delete process.env.WEB_RESEARCH_DISABLED;
  });

  it("returns 503 and never searches when the kill switch is on", async () => {
    process.env.WEB_RESEARCH_DISABLED = "true";
    const res = await funderResearch(req(), params);
    expect(res.status).toBe(503);
    expect(webSearchMock).not.toHaveBeenCalled();
  });

  it("serves a fresh cache hit without paying for a search", async () => {
    state.cacheRow = {
      payload: { text: "Cached summary", citations: [], generatedAt: "x" },
      created_at: new Date().toISOString(),
    };
    const res = await funderResearch(req(), params);
    const body = (await res.json()) as { text: string; cachedAt?: string };
    expect(res.status).toBe(200);
    expect(body.text).toBe("Cached summary");
    expect(body.cachedAt).toBeTruthy();
    expect(webSearchMock).not.toHaveBeenCalled();
  });

  it("re-searches when the cached row is older than the TTL", async () => {
    state.cacheRow = {
      payload: { text: "Stale", citations: [], generatedAt: "x" },
      created_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
    };
    const res = await funderResearch(req(), params);
    expect(res.status).toBe(200);
    expect(webSearchMock).toHaveBeenCalledTimes(1);
    expect(state.upserts).toHaveLength(1);
  });

  it("?refresh=true bypasses the cache but still pays and re-caches", async () => {
    state.cacheRow = {
      payload: { text: "Cached", citations: [], generatedAt: "x" },
      created_at: new Date().toISOString(),
    };
    const res = await funderResearch(
      req("https://x.test/api/funders/Acme/research?refresh=true"),
      params,
    );
    expect(res.status).toBe(200);
    expect(webSearchMock).toHaveBeenCalledTimes(1);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].cache_key).toBe("funder:acme trust");
  });

  it("does not cache an empty search result (failure must stay retryable)", async () => {
    webSearchMock.mockResolvedValue({ text: "", citations: [] });
    await funderResearch(req(), params);
    expect(state.upserts).toHaveLength(0);
  });

  it("returns the rate-limit 429 before paying for a search", async () => {
    state.rateLimitAllowed = false;
    const res = await funderResearch(req(), params);
    expect(res.status).toBe(429);
    expect(webSearchMock).not.toHaveBeenCalled();
  });
});

describe("web-search defaults", () => {
  it("defaults the paid search context to low", async () => {
    vi.resetModules();
    delete process.env.WEB_SEARCH_CONTEXT_SIZE;
    const createMock = vi.fn(
      async (_opts: Record<string, unknown>): Promise<unknown> => ({
        output_text: "ok",
        output: [],
      }),
    );
    vi.doMock("openai", () => ({
      default: class {
        responses = { create: createMock };
      },
    }));
    const { webSearchSummary } = await vi.importActual<
      typeof import("@/lib/research/web-search")
    >("@/lib/research/web-search");
    await webSearchSummary({ query: "q" });
    const call = createMock.mock.calls[0][0] as {
      tools: Array<{ search_context_size: string }>;
    };
    expect(call.tools[0].search_context_size).toBe("low");
    vi.doUnmock("openai");
  });
});
