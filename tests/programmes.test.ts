/**
 * Programmes-into-the-core-flow unit tests (pure logic + a mocked supabase
 * query recorder — no network):
 *  - programme → grants-row seed mapping shape (lib/programmes/seed.ts)
 *  - curated question sets stored in the exact shape the draft-application
 *    path reads (grants.details.sections → buildGrantRequirementText)
 *  - listGrants hides curated programme rows by default (excludeSources)
 *  - display-level duplicate collapse for the /grants page
 *  - events cross-links: programme organizerSlug ↔ investor_organizers slugs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PROGRAMMES,
  CURATED_PROGRAMMES_SOURCE,
  listProgrammes,
} from "@/lib/programmes/data";
import {
  PROGRAMME_QUESTION_SETS,
  deriveRegions,
  programmeSectors,
  buildProgrammeDetails,
  programmeToGrantRow,
} from "@/lib/programmes/seed";
import {
  buildGrantRequirementText,
  hasRequirementText,
} from "@/lib/grants/application";
import type { GrantRow } from "@/lib/grants/types";

// ── Mocked supabase client: records the PostgREST filter chain ───────────────

const h = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: unknown[] }>,
}));

vi.mock("@/lib/supabase-service", () => {
  const result = { data: [], count: 0, error: null };
  const makeProxy = (): unknown => {
    const target: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    const proxy: unknown = new Proxy(target, {
      get(t, prop) {
        if (prop === "then") return t.then;
        return (...args: unknown[]) => {
          h.calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  return {
    getServiceSupabase: () => ({
      from: (table: string) => {
        h.calls.push({ method: "from", args: [table] });
        return makeProxy();
      },
    }),
  };
});

import {
  listGrants,
  collapseDuplicateGrants,
  normaliseGrantTitle,
  DEFAULT_EXCLUDED_GRANT_SOURCES,
  excludedSourcesFilter,
} from "@/lib/grants/data";

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
  return {
    id: "g1",
    source_name: "govuk-find-a-grant",
    source_notice_id: "n1",
    source_url: null,
    application_url: null,
    title: "Cyber Security Innovation Grant",
    description: null,
    funder_name: null,
    funder_id: null,
    funder_region: null,
    funding_type: "grant",
    amount_min: null,
    amount_max: null,
    currency: "GBP",
    open_at: null,
    deadline_at: null,
    status: "open",
    themes: [],
    sectors: [],
    regions: [],
    eligibility_text: null,
    eligible_org_types: [],
    match_funding_required: false,
    beneficiaries: [],
    documents: null,
    raw_json: null,
    published_at: null,
    details: null,
    enriched_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Seed mapping ──────────────────────────────────────────────────────────────

describe("programmeToGrantRow", () => {
  const ncsc = PROGRAMMES.find((p) => p.id === "ncsc-for-startups")!;
  const row = programmeToGrantRow(ncsc);

  it("maps the programme onto the grants upsert key and core columns", () => {
    expect(row.source_name).toBe(CURATED_PROGRAMMES_SOURCE);
    expect(row.source_notice_id).toBe("ncsc-for-startups");
    expect(row.title).toBe(ncsc.name);
    expect(row.funder_name).toBe(ncsc.organiser);
    expect(row.description).toBe(ncsc.description);
    expect(row.application_url).toBe(ncsc.applicationUrl);
    expect(row.source_url).toBe(ncsc.applicationUrl);
    expect(row.funding_type).toBe("other");
  });

  it("is rolling with no deadline (no confidently-known cohort close dates)", () => {
    for (const p of PROGRAMMES) {
      const r = programmeToGrantRow(p);
      expect(r.status).toBe("rolling");
      expect(r.deadline_at).toBeNull();
    }
  });

  it("adds the cyber security sector for cyber-relevant programmes, without duplicates", () => {
    const sectors = row.sectors as string[];
    // NCSC's focus already contains "Cyber security" — no duplicate added.
    expect(
      sectors.filter((s) => s.toLowerCase() === "cyber security"),
    ).toHaveLength(1);

    const ef = PROGRAMMES.find((p) => p.id === "entrepreneur-first")!;
    const efSectors = programmeSectors(ef);
    expect(efSectors).toEqual(ef.focus); // not cyber-relevant → unchanged

    const runway = PROGRAMMES.find((p) => p.id === "cyber-runway")!;
    expect(programmeSectors(runway)).toContain("Cyber security");
  });

  it("derives regions from the location, defaulting to United Kingdom", () => {
    expect(deriveRegions("London / UK")).toEqual(
      expect.arrayContaining(["London", "United Kingdom"]),
    );
    expect(deriveRegions("UK (national)")).toEqual(["United Kingdom"]);
    expect(deriveRegions("US (remote-friendly)")).toContain("International");
    expect(deriveRegions("London & global")).toEqual(
      expect.arrayContaining(["London", "United Kingdom", "International"]),
    );
    expect(deriveRegions("Cambridge / London")).toEqual(
      expect.arrayContaining(["East of England", "London", "United Kingdom"]),
    );
    expect(deriveRegions("somewhere unmapped")).toEqual(["United Kingdom"]);
  });

  it("keeps raw-before-normalise: the curated programme is stored as raw_json", () => {
    const raw = row.raw_json as { curated: boolean; programme: unknown };
    expect(raw.curated).toBe(true);
    expect(raw.programme).toEqual(ncsc);
  });
});

// ── Curated question sets, in the shape the draft path reads ─────────────────

describe("curated programme question sets", () => {
  const WEDGE_FIVE = [
    "ncsc-for-startups",
    "cyber-runway",
    "cylon",
    "entrepreneur-first",
    "seedcamp",
  ];

  it("covers exactly the wedge five, with 8–12 questions each", () => {
    expect(Object.keys(PROGRAMME_QUESTION_SETS).sort()).toEqual(
      [...WEDGE_FIVE].sort(),
    );
    for (const id of WEDGE_FIVE) {
      const qs = PROGRAMME_QUESTION_SETS[id];
      expect(qs.length).toBeGreaterThanOrEqual(8);
      expect(qs.length).toBeLessThanOrEqual(12);
      // Every set belongs to a real programme in the curated list.
      expect(PROGRAMMES.some((p) => p.id === id)).toBe(true);
    }
  });

  it("stores questions inside details.sections — the shape buildGrantRequirementText reads", () => {
    for (const id of WEDGE_FIVE) {
      const p = PROGRAMMES.find((x) => x.id === id)!;
      const details = buildProgrammeDetails(p);
      const qSection = details.sections.find(
        (s) => s.heading === "Application questions",
      );
      expect(qSection).toBeDefined();
      for (const q of PROGRAMME_QUESTION_SETS[id]) {
        expect(qSection!.text).toContain(q);
      }
      // Provenance is marked both machine-readably and in the section text.
      expect(details.provenance).toBe(CURATED_PROGRAMMES_SOURCE);
      expect(details.curated_questions).toEqual(PROGRAMME_QUESTION_SETS[id]);
      expect(qSection!.text).toContain(CURATED_PROGRAMMES_SOURCE);
    }
  });

  it("the seeded grant row passes the draft path's requirement-text gate with the questions included", () => {
    const p = PROGRAMMES.find((x) => x.id === "entrepreneur-first")!;
    const grant = makeGrant({
      ...(programmeToGrantRow(p) as Partial<GrantRow>),
    });
    expect(hasRequirementText(grant)).toBe(true);
    const text = buildGrantRequirementText(grant);
    expect(text).toContain(
      "What have you built or achieved that best demonstrates exceptional ability?",
    );
    expect(text).toContain("## Application questions");
  });

  it("offers nothing for document ingestion — links/documents stay empty so doc-derived questions can never beat the curated sections", () => {
    for (const p of PROGRAMMES) {
      const details = buildProgrammeDetails(p);
      expect(details.links).toEqual([]);
      expect(details.documents).toEqual([]);
      expect(details.webpageUrl).toBe(p.applicationUrl);
    }
  });

  it("non-wedge programmes still get details sections (offer + cadence) but no question set", () => {
    const p = PROGRAMMES.find((x) => x.id === "ycombinator")!;
    const details = buildProgrammeDetails(p);
    expect(
      details.sections.find((s) => s.heading === "Application questions"),
    ).toBeUndefined();
    expect(
      details.sections.find((s) => s.heading === "What you get")?.text,
    ).toBe(p.offer);
    expect(details.provenance).toBe(CURATED_PROGRAMMES_SOURCE);
  });
});

// ── listGrants exclusion defaults ─────────────────────────────────────────────

describe("listGrants source exclusions", () => {
  beforeEach(() => {
    h.calls = [];
  });

  it("hides curated programme rows by default", async () => {
    expect(DEFAULT_EXCLUDED_GRANT_SOURCES).toEqual([CURATED_PROGRAMMES_SOURCE]);
    await listGrants({});
    const notCall = h.calls.find((c) => c.method === "not");
    expect(notCall).toBeDefined();
    expect(notCall!.args).toEqual([
      "source_name",
      "in",
      '("curated-programmes")',
    ]);
  });

  it("includes them when excludeSources is explicitly empty", async () => {
    await listGrants({ excludeSources: [] });
    expect(h.calls.find((c) => c.method === "not")).toBeUndefined();
  });

  it("supports a combined statuses filter (open & upcoming default on /grants)", async () => {
    await listGrants({ statuses: ["open", "forthcoming"] });
    const inCall = h.calls.find((c) => c.method === "in");
    expect(inCall!.args).toEqual(["status", ["open", "forthcoming"]]);
    // statuses wins over status — no stray eq("status", …)
    expect(
      h.calls.find((c) => c.method === "eq" && c.args[0] === "status"),
    ).toBeUndefined();
  });

  it("quotes every excluded source in the PostgREST filter", () => {
    expect(excludedSourcesFilter(["a", "b-c"])).toBe('("a","b-c")');
  });
});

// ── Display-level duplicate collapse ─────────────────────────────────────────

describe("collapseDuplicateGrants", () => {
  it("collapses rows sharing a normalised title and deadline date, preferring the canonical source", () => {
    const deadline = "2026-07-01T11:00:00Z";
    const rows = [
      makeGrant({
        id: "a",
        source_name: "ukri-funding-finder",
        title: "Cyber Security Academic Startup Accelerator",
        deadline_at: deadline,
      }),
      makeGrant({
        id: "b",
        source_name: "innovate-uk",
        title: "Cyber security: academic startup accelerator!",
        deadline_at: "2026-07-01T12:00:00Z", // same DATE, different cutoff time
      }),
      makeGrant({
        id: "c",
        source_name: "govuk-find-a-grant",
        title: "Cyber Security Academic Startup Accelerator",
        deadline_at: deadline,
      }),
    ];
    const collapsed = collapseDuplicateGrants(rows);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("c"); // govuk-find-a-grant wins
  });

  it("prefers innovate-uk over ukri-funding-finder when govuk is absent", () => {
    const rows = [
      makeGrant({
        id: "a",
        source_name: "ukri-funding-finder",
        deadline_at: null,
      }),
      makeGrant({ id: "b", source_name: "innovate-uk", deadline_at: null }),
    ];
    expect(collapseDuplicateGrants(rows)[0].id).toBe("b");
  });

  it("does not collapse same titles with different deadline dates", () => {
    const rows = [
      makeGrant({ id: "a", deadline_at: "2026-07-01T00:00:00Z" }),
      makeGrant({ id: "b", deadline_at: "2026-09-01T00:00:00Z" }),
      makeGrant({ id: "c", deadline_at: null }),
    ];
    expect(collapseDuplicateGrants(rows)).toHaveLength(3);
  });

  it("preserves list order at each group's first position", () => {
    const rows = [
      makeGrant({ id: "a", title: "First Grant", deadline_at: null }),
      makeGrant({
        id: "b",
        title: "Second Grant",
        source_name: "ukri-funding-finder",
        deadline_at: null,
      }),
      makeGrant({
        id: "c",
        title: "second grant",
        source_name: "govuk-find-a-grant",
        deadline_at: null,
      }),
    ];
    const collapsed = collapseDuplicateGrants(rows);
    expect(collapsed.map((g) => g.id)).toEqual(["a", "c"]);
  });

  it("normalises titles for matching", () => {
    expect(normaliseGrantTitle("  Cyber—Security:  Grant! ")).toBe(
      normaliseGrantTitle("cyber security grant"),
    );
  });
});

// ── Events cross-links ────────────────────────────────────────────────────────

describe("programme ↔ investor organizer cross-links", () => {
  it("organizerSlug is set only for the two organisations that exist in both curated lists", () => {
    const withSlug = PROGRAMMES.filter((p) => p.organizerSlug);
    expect(withSlug.map((p) => [p.id, p.organizerSlug]).sort()).toEqual([
      ["entrepreneur-first", "entrepreneur-first"],
      ["seedcamp", "seedcamp"],
    ]);
  });

  it("listProgrammes filters by the remaining programme types", () => {
    expect(listProgrammes("accelerator").length).toBeGreaterThan(0);
    expect(listProgrammes().length).toBe(PROGRAMMES.length);
  });
});
