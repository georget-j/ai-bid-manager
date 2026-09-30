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

  it("maps devolved nations (and implies United Kingdom for any UK sub-region)", () => {
    expect(deriveRegions("Scotland")).toEqual(["Scotland", "United Kingdom"]);
    expect(deriveRegions("Edinburgh / Glasgow / Aberdeen")).toEqual([
      "Scotland",
      "United Kingdom",
    ]);
    expect(deriveRegions("Wales (Cardiff, Newport, Swansea, Barry)")).toEqual([
      "Wales",
      "United Kingdom",
    ]);
    expect(deriveRegions("Belfast / Northern Ireland")).toEqual([
      "Northern Ireland",
      "United Kingdom",
    ]);
    // SETsquared's multi-campus footprint includes Cardiff → Wales + UK.
    expect(
      deriveRegions("Bath, Bristol, Cardiff, Exeter, Southampton, Surrey"),
    ).toEqual(["Wales", "United Kingdom"]);
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
  it("organizerSlug is set only for the organisations that exist in both curated lists", () => {
    const withSlug = PROGRAMMES.filter((p) => p.organizerSlug);
    expect(withSlug.map((p) => [p.id, p.organizerSlug]).sort()).toEqual([
      ["entrepreneur-first", "entrepreneur-first"],
      ["seedcamp", "seedcamp"],
      ["setsquared", "setsquared"],
    ]);
  });

  it("listProgrammes filters by every programme type, and each type is populated", () => {
    const types = [
      "accelerator",
      "investor-programme",
      "ecosystem-support",
      "incubator",
      "grant-competition",
    ] as const;
    for (const t of types) {
      const filtered = listProgrammes(t);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((p) => p.type === t)).toBe(true);
    }
    expect(listProgrammes().length).toBe(PROGRAMMES.length);
    // Every programme's type is one of the filterable types (pills cover all).
    expect(
      PROGRAMMES.every((p) => (types as readonly string[]).includes(p.type)),
    ).toBe(true);
  });
});

// ── Curated-list integrity (2026-06 expansion to 40+ verified programmes) ────

describe("curated programme list integrity", () => {
  it("holds 40–60 programmes (expansion target)", () => {
    expect(PROGRAMMES.length).toBeGreaterThanOrEqual(40);
    expect(PROGRAMMES.length).toBeLessThanOrEqual(60);
  });

  it("ids are unique, slug-shaped, and stable as upsert keys", () => {
    const ids = PROGRAMMES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("every applicationUrl is a parseable https URL (liveness-verified at curation time)", () => {
    for (const p of PROGRAMMES) {
      expect(p.applicationUrl.startsWith("https://")).toBe(true);
      // URL constructor throws on malformed URLs.
      expect(() => new URL(p.applicationUrl)).not.toThrow();
    }
  });

  it("application URLs are unique — no two programmes share an apply page", () => {
    const urls = PROGRAMMES.map((p) => p.applicationUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("every entry carries the plain-English essentials the card renders", () => {
    for (const p of PROGRAMMES) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.organiser.trim().length).toBeGreaterThan(0);
      expect(p.location.trim().length).toBeGreaterThan(0);
      expect(p.cadence.trim().length).toBeGreaterThan(0);
      expect(p.offer.trim().length).toBeGreaterThan(0);
      expect(p.focus.length).toBeGreaterThan(0);
      // Description: substantial, plain-English prose ending in a full stop.
      expect(p.description.trim().length).toBeGreaterThanOrEqual(80);
      expect(p.description.trim().endsWith(".")).toBe(true);
    }
  });

  it("stays cyber/IT-weighted: at least 8 cyber-relevant programmes", () => {
    expect(
      PROGRAMMES.filter((p) => p.cyberRelevant).length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("known-dead programmes never creep back in", () => {
    const names = PROGRAMMES.map((p) => p.name.toLowerCase());
    for (const dead of ["lorca", "tech nation", "wayra"]) {
      expect(names.some((n) => n.includes(dead))).toBe(false);
    }
  });
});
