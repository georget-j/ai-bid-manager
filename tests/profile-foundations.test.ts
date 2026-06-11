/**
 * Foundations for the business-profile build-out (migration 070):
 * - normaliseInsurance — one reader for both stored insurance shapes
 *   (pre-070 plain numbers, 070+ {amount, insurer?, policy_number?, expires_at?}).
 * - computeProfileSections — the per-section completeness breakdown the
 *   profile page and AI fill share.
 * - POST /api/profile — the zod schema accepts the new fields (and converges
 *   insurance on the structured shape) and rejects malformed payloads.
 * - lookupCompany — the Companies House mapper now keeps the registered
 *   office address and SIC codes instead of discarding them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { normaliseInsurance } from "@/lib/procurement/types";
import {
  computeProfileSections,
  profileCompletenessPct,
  type ProfileCompletenessFields,
} from "@/lib/setup-flow";

// ── normaliseInsurance ─────────────────────────────────────────────────────────

describe("normaliseInsurance", () => {
  it("returns null for anything that is not an insurance object", () => {
    expect(normaliseInsurance(null)).toBeNull();
    expect(normaliseInsurance(undefined)).toBeNull();
    expect(normaliseInsurance(5)).toBeNull();
    expect(normaliseInsurance("cover")).toBeNull();
    expect(normaliseInsurance([1_000_000])).toBeNull();
    expect(normaliseInsurance({})).toBeNull();
  });

  it("upgrades pre-070 plain numbers to the structured shape", () => {
    expect(normaliseInsurance({ professional_indemnity: 1_000_000 })).toEqual({
      professional_indemnity: { amount: 1_000_000 },
      public_liability: null,
      employers_liability: null,
    });
  });

  it("passes through the 070 shape, trimming string fields", () => {
    expect(
      normaliseInsurance({
        public_liability: {
          amount: 2_000_000,
          insurer: " Hiscox ",
          policy_number: "PL-001",
          expires_at: "2027-01-31",
        },
      }),
    ).toEqual({
      professional_indemnity: null,
      public_liability: {
        amount: 2_000_000,
        insurer: "Hiscox",
        policy_number: "PL-001",
        expires_at: "2027-01-31",
      },
      employers_liability: null,
    });
  });

  it("handles the two shapes mixed in one value", () => {
    const normalised = normaliseInsurance({
      professional_indemnity: 1_000_000,
      employers_liability: { amount: 10_000_000, expires_at: "2026-12-01" },
    });
    expect(normalised?.professional_indemnity).toEqual({ amount: 1_000_000 });
    expect(normalised?.public_liability).toBeNull();
    expect(normalised?.employers_liability).toEqual({
      amount: 10_000_000,
      expires_at: "2026-12-01",
    });
  });

  it("keeps a line that has metadata but no amount yet", () => {
    const normalised = normaliseInsurance({
      employers_liability: { insurer: "Aviva" },
    });
    expect(normalised?.employers_liability).toEqual({
      amount: null,
      insurer: "Aviva",
    });
  });

  it("returns null when no line holds anything usable", () => {
    expect(normaliseInsurance({ public_liability: null })).toBeNull();
    expect(normaliseInsurance({ public_liability: {} })).toBeNull();
    expect(normaliseInsurance({ public_liability: NaN })).toBeNull();
    expect(normaliseInsurance({ unrelated_key: 5 })).toBeNull();
  });
});

// ── computeProfileSections ─────────────────────────────────────────────────────

const EMPTY: ProfileCompletenessFields = {
  cpv_codes: [],
  services: [],
  keywords: [],
  sectors: [],
  regions: [],
  certifications: [],
  accreditations: [],
  min_contract_value: null,
  max_contract_value: null,
  company_size_band: null,
  annual_turnover: null,
  delivery_models: [],
  insurance: null,
  legal_form: null,
  grant_themes: [],
};

describe("computeProfileSections", () => {
  it("covers every section at 0% for a missing profile", () => {
    const sections = computeProfileSections(null);
    expect(sections.map((s) => s.id)).toEqual([
      "what-you-do",
      "registered-details",
      "financial",
      "insurance",
      "credentials",
      "people",
      "policies",
      "grant-readiness",
    ]);
    for (const section of sections) {
      expect(section.pct).toBe(0);
      expect(section.missing.length).toBeGreaterThan(0);
    }
    const missing = sections.flatMap((s) => s.missing);
    expect(missing).toContain("Services");
    expect(missing).toContain("Registered address");
    expect(missing).toContain("Public liability cover");
    expect(missing).toContain("Key people");
    expect(missing).toContain("Policy documents");
    expect(missing).toContain("Grant themes");
  });

  it("never leaks snake_case field names into labels", () => {
    for (const section of computeProfileSections(null)) {
      expect(section.label).not.toMatch(/_/);
      for (const label of section.missing) {
        expect(label).not.toMatch(/_/);
      }
    }
  });

  it("scores a section by its own fields only", () => {
    const sections = computeProfileSections({
      ...EMPTY,
      company_number: "01234567",
      website: "https://example.co.uk",
    });
    const registered = sections.find((s) => s.id === "registered-details");
    expect(registered?.pct).toBe(33); // 2 of 6
    expect(registered?.missing).toEqual([
      "Registered address",
      "Incorporation date",
      "SIC codes",
      "VAT number",
    ]);
    // No bleed into other sections.
    expect(sections.find((s) => s.id === "what-you-do")?.pct).toBe(0);
  });

  it("accepts year established where the incorporation date is unknown", () => {
    const sections = computeProfileSections({
      ...EMPTY,
      year_established: 2015,
    });
    const registered = sections.find((s) => s.id === "registered-details");
    expect(registered?.missing).not.toContain("Incorporation date");
  });

  it("flags covered insurance lines that have no expiry date", () => {
    const sections = computeProfileSections({
      ...EMPTY,
      insurance: {
        professional_indemnity: { amount: 1_000_000, expires_at: "2027-01-01" },
        public_liability: 5_000_000, // legacy shape, no expiry recorded
      },
    });
    const insurance = sections.find((s) => s.id === "insurance");
    expect(insurance?.pct).toBe(50); // PI + PL amounts; EL and expiry missing
    expect(insurance?.missing).toContain("Expiry dates for each policy");
    expect(insurance?.missing).toContain("Employers' liability cover");
  });

  it("completes the insurance section when every line has amount and expiry", () => {
    const sections = computeProfileSections({
      ...EMPTY,
      insurance: {
        professional_indemnity: { amount: 1_000_000, expires_at: "2027-01-01" },
        public_liability: { amount: 5_000_000, expires_at: "2027-01-01" },
        employers_liability: { amount: 10_000_000, expires_at: "2027-01-01" },
      },
    });
    const insurance = sections.find((s) => s.id === "insurance");
    expect(insurance?.pct).toBe(100);
    expect(insurance?.missing).toEqual([]);
  });

  it("treats a 'no carbon reduction plan' answer as answered", () => {
    const sections = computeProfileSections({
      ...EMPTY,
      carbon_reduction_plan: false,
    });
    const policies = sections.find((s) => s.id === "policies");
    expect(policies?.missing).toEqual(["Policy documents"]);
  });

  it("agrees with the overall percentage: all sections full means 100", () => {
    const full: ProfileCompletenessFields = {
      cpv_codes: ["72000000"],
      services: ["penetration testing"],
      keywords: ["cyber"],
      sectors: ["IT"],
      regions: ["London"],
      certifications: ["ISO 27001"],
      accreditations: ["Cyber Essentials Plus"],
      min_contract_value: 10_000,
      max_contract_value: 500_000,
      company_size_band: "small",
      annual_turnover: 1_000_000,
      delivery_models: ["remote"],
      insurance: {
        professional_indemnity: { amount: 1_000_000, expires_at: "2027-01-01" },
        public_liability: { amount: 5_000_000, expires_at: "2027-01-01" },
        employers_liability: { amount: 10_000_000, expires_at: "2027-01-01" },
      },
      legal_form: "company",
      grant_themes: ["innovation"],
      company_number: "01234567",
      website: "https://example.co.uk",
      vat_number: "GB123456789",
      registered_address: { line1: "1 High St", postcode: "EC1A 1AA" },
      incorporation_date: "2015-03-01",
      sic_codes: ["62020"],
      employee_count: 42,
      key_people: [{ name: "A. Person", role: "Managing Director" }],
      memberships: ["techUK"],
      frameworks: [{ name: "G-Cloud 14" }],
      policies: [{ name: "Information Security Policy" }],
      carbon_reduction_plan: true,
    };
    const sections = computeProfileSections(full);
    expect(sections.every((s) => s.pct === 100)).toBe(true);
    expect(sections.every((s) => s.missing.length === 0)).toBe(true);
    expect(profileCompletenessPct(full)).toBe(100);
  });
});

// ── POST /api/profile schema ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getRequestOrgId: vi.fn(),
  getOrgProfile: vi.fn(),
  upsertOrgProfile: vi.fn(),
}));

vi.mock("@/lib/org", () => ({ getRequestOrgId: mocks.getRequestOrgId }));
vi.mock("@/lib/procurement/data", () => ({
  getOrgProfile: mocks.getOrgProfile,
  upsertOrgProfile: mocks.upsertOrgProfile,
}));

const ORG_ID = "11111111-2222-3333-4444-555555555555";

async function postProfile(body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/profile/route");
  return POST({ json: async () => body } as unknown as NextRequest);
}

describe("POST /api/profile — zod schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    mocks.upsertOrgProfile.mockImplementation(
      async (_orgId: string, profile: Record<string, unknown>) => profile,
    );
  });

  it("returns 401 without an org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);
    const res = await postProfile({ name: "Fortis" });
    expect(res.status).toBe(401);
    expect(mocks.upsertOrgProfile).not.toHaveBeenCalled();
  });

  it("accepts a minimal profile and defaults the new array fields", async () => {
    const res = await postProfile({ name: "Fortis Cyber" });
    expect(res.status).toBe(200);
    const [orgId, saved] = mocks.upsertOrgProfile.mock.calls[0];
    expect(orgId).toBe(ORG_ID);
    expect(saved).toMatchObject({
      name: "Fortis Cyber",
      sic_codes: [],
      trading_names: [],
      key_people: [],
      memberships: [],
      frameworks: [],
      policies: [],
      website: null,
      vat_number: null,
      registered_address: null,
      incorporation_date: null,
      employee_count: null,
      carbon_reduction_plan: null,
    });
  });

  it("accepts the full migration-070 field set", async () => {
    const res = await postProfile({
      name: "Fortis Cyber",
      website: "https://fortis.example",
      vat_number: "GB123456789",
      registered_address: { line1: "1 Quay St", postcode: "M3 3JE" },
      incorporation_date: "2015-03-01",
      sic_codes: ["62020"],
      trading_names: ["Fortis"],
      employee_count: 12,
      key_people: [{ name: "A. Person", role: "MD", bio: "20 years in cyber" }],
      memberships: ["techUK"],
      frameworks: [{ name: "G-Cloud 14", reference: "RM1557.14" }],
      policies: [{ name: "InfoSec Policy", last_reviewed: "2026-01-10" }],
      carbon_reduction_plan: true,
    });
    expect(res.status).toBe(200);
    const [, saved] = mocks.upsertOrgProfile.mock.calls[0];
    expect(saved).toMatchObject({
      website: "https://fortis.example",
      registered_address: { line1: "1 Quay St", postcode: "M3 3JE" },
      incorporation_date: "2015-03-01",
      employee_count: 12,
      key_people: [{ name: "A. Person", role: "MD", bio: "20 years in cyber" }],
      frameworks: [{ name: "G-Cloud 14", reference: "RM1557.14" }],
      carbon_reduction_plan: true,
    });
  });

  it("stores insurance in the structured shape whichever era the client sent", async () => {
    const res = await postProfile({
      name: "Fortis Cyber",
      insurance: {
        professional_indemnity: 1_000_000, // pre-070 client
        public_liability: { amount: 5_000_000, expires_at: "2027-01-01" },
      },
    });
    expect(res.status).toBe(200);
    const [, saved] = mocks.upsertOrgProfile.mock.calls[0];
    expect(saved.insurance).toEqual({
      professional_indemnity: { amount: 1_000_000 },
      public_liability: { amount: 5_000_000, expires_at: "2027-01-01" },
      employers_liability: null,
    });
  });

  it.each([
    ["key person without a role", { key_people: [{ name: "A. Person" }] }],
    ["framework without a name", { frameworks: [{ reference: "RM1557" }] }],
    ["free-text incorporation date", { incorporation_date: "March 2015" }],
    ["negative employee count", { employee_count: -3 }],
    ["string carbon reduction plan", { carbon_reduction_plan: "yes" }],
  ])("rejects %s with a 400", async (_label, fields) => {
    const res = await postProfile({ name: "Fortis Cyber", ...fields });
    expect(res.status).toBe(400);
    expect(mocks.upsertOrgProfile).not.toHaveBeenCalled();
  });
});

// ── Companies House mapper ─────────────────────────────────────────────────────

const CH_FIXTURE = {
  company_name: "FORTIS CYBER LTD",
  company_number: "09876543",
  type: "ltd",
  date_of_creation: "2015-03-01",
  registered_office_address: {
    address_line_1: "1 Quay Street",
    address_line_2: "Floor 2",
    locality: "Manchester",
    postal_code: "M3 3JE",
    country: "England",
  },
  sic_codes: ["62020", "62090"],
};

describe("lookupCompany — Companies House mapper", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps registered office and SIC codes into profile shapes", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(CH_FIXTURE), { status: 200 }),
    );
    const { lookupCompany } = await import("@/lib/research/registers");
    const enrichment = await lookupCompany("09876543");

    expect(enrichment.company_number).toBe("09876543");
    expect(enrichment.legal_form).toBe("company");
    expect(enrichment.year_established).toBe(2015);
    expect(enrichment.registered_address).toEqual({
      line1: "1 Quay Street",
      line2: "Floor 2",
      city: "Manchester",
      postcode: "M3 3JE",
      country: "England",
    });
    expect(enrichment.sic_codes).toEqual(["62020", "62090"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("09876543");
  });

  it("omits address and SIC codes when the response has none", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ company_name: "BARE LTD", type: "ltd" }), {
        status: 200,
      }),
    );
    const { lookupCompany } = await import("@/lib/research/registers");
    const enrichment = await lookupCompany("00000001");

    expect(enrichment.registered_address).toBeUndefined();
    expect(enrichment.sic_codes).toBeUndefined();
  });

  it("keeps the graceful note when no API key is configured", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "");
    const { lookupCompany } = await import("@/lib/research/registers");
    const enrichment = await lookupCompany("09876543");

    expect(enrichment.notes.join(" ")).toContain("COMPANIES_HOUSE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unknown company instead of throwing", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const { lookupCompany } = await import("@/lib/research/registers");
    const enrichment = await lookupCompany("99999999");

    expect(enrichment.notes.join(" ")).toContain("No company found");
    expect(enrichment.registered_address).toBeUndefined();
  });
});
