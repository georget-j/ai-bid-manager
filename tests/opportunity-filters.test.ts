/**
 * Opportunity browse filter tests — exercise every listOpportunities filter against
 * the live Supabase catalog to catch PostgREST translation errors (e.g. the or-filter
 * timestamp parsing, the cpv_search sector match). Assertions are shape-only so they
 * don't depend on volatile row counts.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

beforeAll(() => {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* CI env expected to provide vars */
  }
});

describe("listOpportunities filters", () => {
  it("translates every filter to a valid query", async () => {
    const { listOpportunities } = await import("@/lib/procurement/data");

    const cases: Array<Record<string, unknown>> = [
      { deadline: "open", limit: 5 },
      { deadline: "soon", limit: 5 },
      { deadline: "closed", limit: 5 },
      { sector: "72", limit: 5 },
      { source: "contracts-finder", limit: 5 },
      { valueMin: 50000, valueMax: 5000000, limit: 5 },
      { buyer: "council", limit: 5 },
      { deadline: "open", sector: "72", valueMin: 10000, limit: 5 },
    ];

    for (const opts of cases) {
      const { opportunities, total } = await listOpportunities(opts);
      expect(Array.isArray(opportunities)).toBe(true);
      expect(typeof total).toBe("number");
      expect(opportunities.length).toBeLessThanOrEqual(5);
    }
  }, 30000);

  it("sector filter only returns matching CPV codes", async () => {
    const { listOpportunities } = await import("@/lib/procurement/data");
    const { opportunities } = await listOpportunities({
      sector: "72",
      limit: 20,
    });
    for (const opp of opportunities) {
      const codes = opp.cpv_codes ?? [];
      // Every returned opp should carry at least one CPV starting with "72".
      expect(codes.some((c) => c.startsWith("72"))).toBe(true);
    }
  }, 30000);
});
