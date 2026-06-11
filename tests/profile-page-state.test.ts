/**
 * The profile page's form-state logic (app/profile/form-state.ts):
 * - rowToForm / formToPayload — stored row ⇄ POST /api/profile body, including
 *   both insurance eras, repeating rows (people/frameworks/policies) and the
 *   registered address.
 * - applyAiFields — ProfileAiFill proposals merge into the form without
 *   clobbering what the user already typed.
 * - applyRegisterEnrichment — Companies House / Charity Commission lookups now
 *   fill the address and SIC codes too.
 * - computeSectionTicks — page-section ticks regroup the unified
 *   lib/setup-flow checks; the mapping must cover every label exactly once so
 *   new checks can't silently go untracked on the page.
 */

import { describe, it, expect } from "vitest";
import {
  applyAiFields,
  applyRegisterEnrichment,
  computeSectionTicks,
  emptyForm,
  formToCompleteness,
  formToPayload,
  rowToForm,
  PAGE_SECTION_LABELS,
  STANDARD_POLICIES,
} from "@/app/profile/form-state";
import {
  computeProfileSections,
  profileCompletenessPct,
} from "@/lib/setup-flow";

const FULL_ROW: Record<string, unknown> = {
  name: "Fortis Cyber",
  organisation_type: "Cybersecurity firm",
  sectors: ["IT"],
  services: ["penetration testing"],
  keywords: ["cyber"],
  cpv_codes: ["72000000"],
  regions: ["London", "Scotland"],
  certifications: ["ISO 27001"],
  accreditations: ["Cyber Essentials Plus"],
  insurance: {
    professional_indemnity: 1_000_000, // pre-070 era
    public_liability: {
      amount: 5_000_000,
      insurer: "Hiscox",
      policy_number: "PL-001",
      expires_at: "2027-01-31",
    },
  },
  min_contract_value: 10_000,
  max_contract_value: 500_000,
  preferred_buyers: ["NHS"],
  excluded_buyers: [],
  excluded_keywords: ["catering"],
  company_size_band: "Small (10-49)",
  annual_turnover: 2_400_000,
  year_established: 2015,
  delivery_models: ["Remote"],
  social_value: ["Net Zero by 2030"],
  legal_form: "company",
  is_registered_charity: false,
  charity_number: null,
  company_number: "09876543",
  match_funding_capacity: 25_000,
  beneficiaries: ["SMEs"],
  grant_themes: ["innovation"],
  website: "https://fortis.example",
  vat_number: "GB123456789",
  registered_address: {
    line1: "1 Quay Street",
    line2: "Floor 2",
    city: "Manchester",
    postcode: "M3 3JE",
    country: "England",
  },
  incorporation_date: "2015-03-01",
  sic_codes: ["62020", "62090"],
  trading_names: ["Fortis"],
  employee_count: 24,
  key_people: [{ name: "A. Person", role: "MD", bio: "20 years in cyber" }],
  memberships: ["techUK"],
  frameworks: [
    { name: "G-Cloud 14", reference: "RM1557.14", expires_at: "2027-11-08" },
  ],
  policies: [
    { name: "Health and safety", last_reviewed: "2026-01-10" },
    { name: "Information Security", document_id: "doc-1" },
  ],
  carbon_reduction_plan: true,
};

describe("rowToForm", () => {
  it("returns an empty form for a missing profile", () => {
    const form = rowToForm(null);
    expect(form.name).toBe("");
    expect(form.key_people).toEqual([]);
    expect(form.insurance.professional_indemnity.amount).toBe("");
    expect(form.carbon_reduction_plan).toBe("");
  });

  it("flattens a stored row, normalising both insurance eras", () => {
    const form = rowToForm(FULL_ROW);
    expect(form.sectors).toBe("IT");
    expect(form.regions).toBe("London, Scotland");
    expect(form.sic_codes).toBe("62020, 62090");
    expect(form.address_line1).toBe("1 Quay Street");
    expect(form.address_postcode).toBe("M3 3JE");
    expect(form.incorporation_date).toBe("2015-03-01");
    expect(form.employee_count).toBe("24");
    // Legacy number becomes an amount; structured line keeps its details.
    expect(form.insurance.professional_indemnity.amount).toBe("1000000");
    expect(form.insurance.public_liability).toEqual({
      amount: "5000000",
      insurer: "Hiscox",
      policy_number: "PL-001",
      expires_at: "2027-01-31",
    });
    expect(form.insurance.employers_liability.amount).toBe("");
    expect(form.key_people).toEqual([
      { name: "A. Person", role: "MD", bio: "20 years in cyber" },
    ]);
    expect(form.policies).toEqual([
      {
        name: "Health and safety",
        last_reviewed: "2026-01-10",
        document_id: "",
      },
      { name: "Information Security", last_reviewed: "", document_id: "doc-1" },
    ]);
    expect(form.carbon_reduction_plan).toBe("yes");
  });

  it("keeps an explicit 'no carbon plan' answer distinct from unanswered", () => {
    expect(
      rowToForm({ carbon_reduction_plan: false }).carbon_reduction_plan,
    ).toBe("no");
    expect(rowToForm({}).carbon_reduction_plan).toBe("");
  });
});

describe("formToPayload", () => {
  it("round-trips a full row through the form", () => {
    const payload = formToPayload(rowToForm(FULL_ROW));
    expect(payload.name).toBe("Fortis Cyber");
    expect(payload.regions).toEqual(["London", "Scotland"]);
    expect(payload.sic_codes).toEqual(["62020", "62090"]);
    expect(payload.registered_address).toEqual({
      line1: "1 Quay Street",
      line2: "Floor 2",
      city: "Manchester",
      postcode: "M3 3JE",
      country: "England",
    });
    // Insurance converges on the structured (070) shape.
    expect(payload.insurance).toEqual({
      professional_indemnity: { amount: 1_000_000 },
      public_liability: {
        amount: 5_000_000,
        insurer: "Hiscox",
        policy_number: "PL-001",
        expires_at: "2027-01-31",
      },
    });
    expect(payload.key_people).toEqual([
      { name: "A. Person", role: "MD", bio: "20 years in cyber" },
    ]);
    expect(payload.frameworks).toEqual([
      { name: "G-Cloud 14", reference: "RM1557.14", expires_at: "2027-11-08" },
    ]);
    expect(payload.policies).toEqual([
      {
        name: "Health and safety",
        last_reviewed: "2026-01-10",
        document_id: undefined,
      },
      {
        name: "Information Security",
        last_reviewed: undefined,
        document_id: "doc-1",
      },
    ]);
    expect(payload.carbon_reduction_plan).toBe(true);
    expect(payload.employee_count).toBe(24);
    expect(payload.incorporation_date).toBe("2015-03-01");
  });

  it("sends nulls and empty arrays for an empty form", () => {
    const payload = formToPayload(emptyForm());
    expect(payload.insurance).toBeNull();
    expect(payload.registered_address).toBeNull();
    expect(payload.website).toBeNull();
    expect(payload.employee_count).toBeNull();
    expect(payload.carbon_reduction_plan).toBeNull();
    expect(payload.key_people).toEqual([]);
    expect(payload.organisation_type).toBeUndefined();
    expect(payload.is_registered_charity).toBeNull();
  });

  it("drops repeating rows the API schema would reject", () => {
    const form = emptyForm();
    form.key_people = [
      { name: "Only Name", role: "", bio: "" }, // no role → not saved
      { name: "A. Person", role: "MD", bio: "" },
    ];
    form.frameworks = [
      { name: "", reference: "RM1557", expires_at: "" }, // no name → not saved
      { name: "G-Cloud 14", reference: "", expires_at: "" },
    ];
    form.policies = [{ name: "  ", last_reviewed: "", document_id: "" }];
    const payload = formToPayload(form);
    expect(payload.key_people).toEqual([{ name: "A. Person", role: "MD" }]);
    expect(payload.frameworks).toEqual([
      { name: "G-Cloud 14", reference: undefined, expires_at: undefined },
    ]);
    expect(payload.policies).toEqual([]);
  });

  it("keeps an insurance line that has details but no amount yet", () => {
    const form = emptyForm();
    form.insurance.employers_liability.insurer = "Aviva";
    expect(formToPayload(form).insurance).toEqual({
      employers_liability: { amount: null, insurer: "Aviva" },
    });
  });

  it("never sends NaN for unparseable numbers", () => {
    const form = emptyForm();
    form.annual_turnover = "about 2m";
    form.employee_count = "12.6";
    const payload = formToPayload(form);
    expect(payload.annual_turnover).toBeNull();
    expect(payload.employee_count).toBe(13); // integers are rounded
  });

  it("keeps the legacy is_registered_charity inference", () => {
    const form = emptyForm();
    expect(formToPayload(form).is_registered_charity).toBeNull();
    form.legal_form = "charity";
    expect(formToPayload(form).is_registered_charity).toBe(true);
    form.legal_form = "company";
    expect(formToPayload(form).is_registered_charity).toBe(false);
    form.charity_number = "1234567";
    expect(formToPayload(form).is_registered_charity).toBe(true);
  });
});

describe("formToCompleteness", () => {
  it("scores 0 for an empty form and 100 for the full fixture", () => {
    expect(profileCompletenessPct(formToCompleteness(emptyForm()))).toBe(0);
    const form = rowToForm(FULL_ROW);
    // The fixture's PI line (legacy number) has no expiry — add one so the
    // insurance section can complete, then everything should be full.
    form.insurance.professional_indemnity.expires_at = "2027-01-01";
    form.insurance.employers_liability = {
      amount: "10000000",
      insurer: "",
      policy_number: "",
      expires_at: "2027-01-01",
    };
    expect(profileCompletenessPct(formToCompleteness(form))).toBe(100);
  });
});

describe("applyAiFields", () => {
  it("converts schema-shaped proposal values into form strings", () => {
    const next = applyAiFields(emptyForm(), {
      services: ["SOC monitoring", "pen testing"],
      website: "https://fortis.example",
      employee_count: 24,
      incorporation_date: "2015-03-01",
      registered_address: { line1: "1 Quay St", postcode: "M3 3JE" },
      carbon_reduction_plan: false,
    });
    expect(next.services).toBe("SOC monitoring, pen testing");
    expect(next.website).toBe("https://fortis.example");
    expect(next.employee_count).toBe("24");
    expect(next.incorporation_date).toBe("2015-03-01");
    expect(next.address_line1).toBe("1 Quay St");
    expect(next.address_postcode).toBe("M3 3JE");
    expect(next.carbon_reduction_plan).toBe("no");
  });

  it("only overwrites the insurance lines the proposal covers", () => {
    const form = emptyForm();
    form.insurance.public_liability.amount = "5000000";
    const next = applyAiFields(form, {
      insurance: {
        professional_indemnity: { amount: 1_000_000, insurer: "Hiscox" },
      },
    });
    expect(next.insurance.professional_indemnity).toEqual({
      amount: "1000000",
      insurer: "Hiscox",
      policy_number: "",
      expires_at: "",
    });
    expect(next.insurance.public_liability.amount).toBe("5000000");
  });

  it("merges name-keyed rows instead of replacing what the user typed", () => {
    const form = emptyForm();
    form.key_people = [{ name: "A. Person", role: "MD", bio: "" }];
    form.policies = [
      {
        name: "Health and safety",
        last_reviewed: "2026-01-10",
        document_id: "",
      },
    ];
    const next = applyAiFields(form, {
      key_people: [
        { name: "a. person", role: "Managing Director", bio: "20 years" },
        { name: "B. Other", role: "CTO" },
      ],
      policies: [
        { name: "health and safety", last_reviewed: "2025-01-01" },
        { name: "Modern slavery" },
      ],
    });
    expect(next.key_people).toEqual([
      { name: "A. Person", role: "MD", bio: "20 years" }, // existing role wins
      { name: "B. Other", role: "CTO", bio: "" },
    ]);
    // Existing review date wins; the new policy is added.
    expect(next.policies).toEqual([
      {
        name: "Health and safety",
        last_reviewed: "2026-01-10",
        document_id: "",
      },
      { name: "Modern slavery", last_reviewed: "", document_id: "" },
    ]);
  });

  it("ignores unknown fields and malformed values", () => {
    const form = emptyForm();
    form.keywords = "cyber";
    const next = applyAiFields(form, {
      not_a_field: "x",
      keywords: 42, // wrong type — ignored
      employee_count: "twelve", // wrong type — ignored
    });
    expect(next.keywords).toBe("cyber");
    expect(next.employee_count).toBe("");
  });
});

describe("applyRegisterEnrichment", () => {
  it("fills registered details including the address and SIC codes", () => {
    const next = applyRegisterEnrichment(emptyForm(), {
      legal_form: "company",
      company_number: "09876543",
      year_established: 2015,
      registered_address: {
        line1: "1 Quay Street",
        city: "Manchester",
        postcode: "M3 3JE",
      },
      sic_codes: ["62020", "62090"],
      notes: [],
    });
    expect(next.legal_form).toBe("company");
    expect(next.company_number).toBe("09876543");
    expect(next.year_established).toBe("2015");
    expect(next.address_line1).toBe("1 Quay Street");
    expect(next.address_city).toBe("Manchester");
    expect(next.sic_codes).toBe("62020, 62090");
  });

  it("keeps existing values where the lookup found nothing", () => {
    const form = emptyForm();
    form.legal_form = "cic";
    form.sic_codes = "62020";
    form.address_line2 = "Floor 2";
    const next = applyRegisterEnrichment(form, {
      company_number: "09876543",
      registered_address: { line1: "1 Quay Street" },
      notes: [],
    });
    expect(next.legal_form).toBe("cic");
    expect(next.sic_codes).toBe("62020");
    expect(next.address_line1).toBe("1 Quay Street");
    expect(next.address_line2).toBe("Floor 2");
  });
});

describe("computeSectionTicks", () => {
  it("covers every unified completeness label exactly once", () => {
    // With a null profile everything is missing, so the unified sections
    // enumerate every check label there is.
    const allLabels = computeProfileSections(null).flatMap((s) => s.missing);
    const pageLabels = Object.values(PAGE_SECTION_LABELS).flat();
    expect([...pageLabels].sort()).toEqual([...allLabels].sort());
    expect(new Set(pageLabels).size).toBe(pageLabels.length);
  });

  it("marks sections complete only when all their fields are filled", () => {
    const empty = computeSectionTicks(formToCompleteness(emptyForm()));
    expect(empty.registered.complete).toBe(false);
    expect(empty.registered.filled).toBe(0);
    expect(empty.registered.missing).toContain("Registered address");
    // Sections without scored fields never claim a tick.
    expect(empty.basics.total).toBe(0);
    expect(empty.buyers.total).toBe(0);

    const form = rowToForm(FULL_ROW);
    const ticks = computeSectionTicks(formToCompleteness(form));
    expect(ticks.registered.complete).toBe(true);
    expect(ticks.services.complete).toBe(true);
    expect(ticks.capacity.complete).toBe(true);
    expect(ticks.policies.complete).toBe(true);
    expect(ticks.frameworks.complete).toBe(true);
    expect(ticks.grants.complete).toBe(true);
    // The fixture has no EL cover or PI expiry, so insurance stays partial.
    expect(ticks.insurance.complete).toBe(false);
    expect(ticks.insurance.missing).toEqual([
      "Employers' liability cover",
      "Expiry dates for each policy",
    ]);
  });

  it("exposes the standard policy checklist the page renders", () => {
    // Guards the plain-English checklist names the section component shows.
    expect(STANDARD_POLICIES).toEqual([
      "Health and safety",
      "Environmental",
      "Equality, diversity and inclusion",
      "Modern slavery",
      "Data protection (GDPR)",
      "Quality",
    ]);
  });
});
