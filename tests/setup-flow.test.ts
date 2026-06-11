/**
 * Pure-logic unit tests for the home-page "Get set up" checklist:
 * - buildSetupFlow — step statuses derived from profile/evidence/match/draft
 *   facts, nextStep selection, ordering, hrefs, and the all-done auto-hide gate.
 * - profileCompletenessPct — server-side mirror of the /profile meter.
 */
import { describe, it, expect } from "vitest";
import {
  buildSetupFlow,
  profileCompletenessPct,
  EVIDENCE_DOC_TARGET,
  type SetupFlowInput,
  type ProfileCompletenessFields,
} from "@/lib/setup-flow";

function input(overrides: Partial<SetupFlowInput> = {}): SetupFlowInput {
  return {
    profileExists: false,
    profileCompletenessPct: 0,
    kbDocCount: 0,
    tenderMatchCount: 0,
    grantMatchCount: 0,
    hasAnyDraft: false,
    ...overrides,
  };
}

describe("buildSetupFlow", () => {
  it("brand-new user: every step todo, profile first", () => {
    const flow = buildSetupFlow(input());
    expect(flow.steps.map((s) => s.key)).toEqual([
      "profile",
      "evidence",
      "matches",
      "respond",
    ]);
    expect(flow.steps.every((s) => s.status === "todo")).toBe(true);
    expect(flow.doneCount).toBe(0);
    expect(flow.allDone).toBe(false);
    expect(flow.progress).toBe(0);
    expect(flow.nextStep?.key).toBe("profile");
    expect(flow.nextStep?.href).toBe("/profile");
  });

  it("steps are numbered 1–4 in order", () => {
    const flow = buildSetupFlow(input());
    expect(flow.steps.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });

  it("saved profile completes step 1 and moves next to evidence", () => {
    const flow = buildSetupFlow(
      input({ profileExists: true, profileCompletenessPct: 40 }),
    );
    expect(flow.steps[0].status).toBe("done");
    expect(flow.nextStep?.key).toBe("evidence");
    expect(flow.nextStep?.href).toBe("/documents");
  });

  it("a sparse profile is still done but nudges towards completeness", () => {
    const sparse = buildSetupFlow(
      input({ profileExists: true, profileCompletenessPct: 30 }),
    );
    expect(sparse.steps[0].status).toBe("done");
    expect(sparse.steps[0].detail).toContain("30% complete");
    expect(sparse.steps[0].detail).toContain("better matches");

    const full = buildSetupFlow(
      input({ profileExists: true, profileCompletenessPct: 90 }),
    );
    expect(full.steps[0].detail).toBe("90% complete");
  });

  it(`evidence completes at ${EVIDENCE_DOC_TARGET} documents, not 1`, () => {
    const one = buildSetupFlow(input({ kbDocCount: 1 }));
    expect(one.steps[1].status).toBe("todo");
    expect(one.steps[1].detail).toContain("1 added");

    const two = buildSetupFlow(input({ kbDocCount: EVIDENCE_DOC_TARGET }));
    expect(two.steps[1].status).toBe("done");
    expect(two.steps[1].detail).toBe("2 documents added");
  });

  it("matches step completes when either offering has matches", () => {
    const tendersOnly = buildSetupFlow(
      input({ profileExists: true, tenderMatchCount: 3 }),
    );
    expect(tendersOnly.steps[2].status).toBe("done");
    expect(tendersOnly.steps[2].detail).toBe("3 tenders look like a fit");
    expect(tendersOnly.steps[2].href).toBe("/my-opportunities");

    const grantsOnly = buildSetupFlow(
      input({ profileExists: true, grantMatchCount: 1 }),
    );
    expect(grantsOnly.steps[2].status).toBe("done");
    expect(grantsOnly.steps[2].detail).toBe("1 grant looks like a fit");
    expect(grantsOnly.steps[2].href).toBe("/my-grants");

    const both = buildSetupFlow(
      input({ profileExists: true, tenderMatchCount: 2, grantMatchCount: 3 }),
    );
    expect(both.steps[2].detail).toBe("2 tenders and 3 grants look like a fit");
    expect(both.steps[2].href).toBe("/my-opportunities");
  });

  it("matches step explains itself differently with and without a profile", () => {
    const without = buildSetupFlow(input());
    expect(without.steps[2].detail).toContain("Add your profile first");

    const withProfile = buildSetupFlow(input({ profileExists: true }));
    expect(withProfile.steps[2].detail).toContain("No matches yet");
  });

  it("respond step points at the side that has matches and completes on a draft", () => {
    const grantsMatched = buildSetupFlow(input({ grantMatchCount: 2 }));
    expect(grantsMatched.steps[3].href).toBe("/my-grants");

    const tendersMatched = buildSetupFlow(input({ tenderMatchCount: 2 }));
    expect(tendersMatched.steps[3].href).toBe("/my-opportunities");

    const drafted = buildSetupFlow(input({ hasAnyDraft: true }));
    expect(drafted.steps[3].status).toBe("done");
  });

  it("nextStep skips done steps (derived steps can complete out of order)", () => {
    // Docs uploaded before the profile was saved — next is still the profile.
    const flow = buildSetupFlow(input({ kbDocCount: 5 }));
    expect(flow.steps[1].status).toBe("done");
    expect(flow.nextStep?.key).toBe("profile");
  });

  it("everything done: allDone true and nextStep null (card auto-hides)", () => {
    const flow = buildSetupFlow(
      input({
        profileExists: true,
        profileCompletenessPct: 100,
        kbDocCount: 3,
        tenderMatchCount: 3,
        grantMatchCount: 3,
        hasAnyDraft: true,
      }),
    );
    expect(flow.allDone).toBe(true);
    expect(flow.doneCount).toBe(4);
    expect(flow.progress).toBe(100);
    expect(flow.nextStep).toBeNull();
  });

  it("progress is the share of done steps", () => {
    const flow = buildSetupFlow(input({ profileExists: true, kbDocCount: 2 }));
    expect(flow.doneCount).toBe(2);
    expect(flow.progress).toBe(50);
  });

  it("never leaks jargon into user-facing strings", () => {
    const flows = [
      buildSetupFlow(input()),
      buildSetupFlow(
        input({
          profileExists: true,
          profileCompletenessPct: 50,
          kbDocCount: 1,
          tenderMatchCount: 2,
          grantMatchCount: 1,
          hasAnyDraft: true,
        }),
      ),
    ];
    for (const flow of flows) {
      for (const step of flow.steps) {
        const text = `${step.label} ${step.help} ${step.detail}`.toLowerCase();
        expect(text).not.toMatch(/rfp|chunk|extract|embed|knowledge base/);
      }
    }
  });
});

describe("profileCompletenessPct", () => {
  const empty: ProfileCompletenessFields = {
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

  /** Every check in every section filled (migration-070 fields included). */
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

  it("is 0 for a missing or empty profile", () => {
    expect(profileCompletenessPct(null)).toBe(0);
    expect(profileCompletenessPct(empty)).toBe(0);
  });

  it("is 100 when every section is complete", () => {
    expect(profileCompletenessPct(full)).toBe(100);
  });

  it("weights matching fields highest", () => {
    // "What you do" carries 4 of the 21 weight → 19% on its own.
    const matchingOnly = profileCompletenessPct({
      ...empty,
      services: ["security"],
      sectors: ["IT"],
      keywords: ["cyber"],
      cpv_codes: ["72000000"],
      regions: ["UK"],
      delivery_models: ["remote"],
    });
    expect(matchingOnly).toBe(19);

    // ...more than the two financial fields (2 of 21 → 10%).
    const financialOnly = profileCompletenessPct({
      ...empty,
      annual_turnover: 1_000_000,
      min_contract_value: 10_000,
    });
    expect(matchingOnly).toBeGreaterThan(financialOnly);
  });

  it("either contract-value bound counts as filled", () => {
    expect(
      profileCompletenessPct({ ...empty, min_contract_value: 5_000 }),
    ).toBe(profileCompletenessPct({ ...empty, max_contract_value: 50_000 }));
  });

  it("insurance counts amounts in either stored shape, never empty objects", () => {
    expect(profileCompletenessPct({ ...empty, insurance: {} })).toBe(0);
    expect(
      profileCompletenessPct({
        ...empty,
        insurance: { public_liability: null },
      }),
    ).toBe(0);

    // Pre-070 rows store plain numbers; both eras score identically.
    const legacy = profileCompletenessPct({
      ...empty,
      insurance: { public_liability: 2_000_000 },
    });
    const structured = profileCompletenessPct({
      ...empty,
      insurance: { public_liability: { amount: 2_000_000 } },
    });
    expect(legacy).toBeGreaterThan(0);
    expect(legacy).toBe(structured);
  });
});
