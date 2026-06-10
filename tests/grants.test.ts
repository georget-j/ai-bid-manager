/**
 * Grants pure-logic unit tests — scoring, alert matching, and the open-call connector
 * normalizers. No network or DB: every function under test is pure (the connector
 * `normalize` methods operate on already-fetched raw payloads).
 */
import { describe, it, expect } from "vitest";
import type { GrantRow } from "@/lib/grants/types";
import type { OrganisationProfileRow } from "@/lib/procurement/types";
import type { AlertRule } from "@/lib/procurement/alerts";

const DAY = 86_400_000;
const future = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString();
const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
  return {
    id: "g1",
    source_name: "govuk-find-a-grant",
    source_notice_id: "n1",
    source_url: null,
    application_url: null,
    title: "Cyber Security Innovation Grant",
    description: "Funding for SMEs delivering cyber security services.",
    funder_name: "DSIT",
    funder_id: null,
    funder_region: null,
    funding_type: "grant",
    amount_min: 10_000,
    amount_max: 100_000,
    currency: "GBP",
    open_at: past(10),
    deadline_at: future(30),
    status: "open",
    themes: ["cyber security"],
    sectors: [],
    regions: ["England"],
    eligibility_text: null,
    eligible_org_types: [],
    match_funding_required: false,
    beneficiaries: [],
    documents: [],
    raw_json: null,
    published_at: null,
    details: null,
    enriched_at: null,
    created_at: past(10),
    updated_at: past(1),
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<OrganisationProfileRow> = {},
): OrganisationProfileRow {
  return {
    id: "p1",
    org_id: "o1",
    name: "Fortis Cyber",
    organisation_type: "SME",
    sectors: ["cyber security"],
    services: ["SOC", "penetration testing"],
    keywords: ["cyber security", "managed detection"],
    cpv_codes: [],
    regions: ["England"],
    certifications: [],
    accreditations: [],
    insurance: null,
    min_contract_value: null,
    max_contract_value: null,
    preferred_buyers: [],
    excluded_buyers: [],
    excluded_keywords: [],
    company_size_band: "small",
    annual_turnover: null,
    year_established: null,
    delivery_models: [],
    social_value: [],
    legal_form: "private limited company",
    is_registered_charity: false,
    charity_number: null,
    company_number: "12345678",
    match_funding_capacity: null,
    beneficiaries: [],
    grant_themes: ["cyber security"],
    created_at: past(100),
    updated_at: past(1),
    ...overrides,
  };
}

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "r1",
    org_id: "o1",
    name: "Cyber",
    keywords: [],
    cpv_codes: [],
    regions: [],
    buyers: [],
    min_value: null,
    max_value: null,
    stages: [],
    enabled: true,
    channel: "in-app",
    created_at: past(10),
    updated_at: past(1),
    ...overrides,
  };
}

describe("scoreGrant", () => {
  it("scores an aligned, open grant as eligible and recommends applying", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const r = scoreGrant(makeGrant(), makeProfile());
    expect(r.eligible).toBe(true);
    expect(r.fitScore).toBeGreaterThanOrEqual(50);
    expect(["apply", "maybe"]).toContain(r.recommendedAction);
    expect(r.reasons.join(" ")).toMatch(/theme|sector/i);
  });

  it("hard-stops a charity-only grant for a non-charity org", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const grant = makeGrant({ eligible_org_types: ["charity"] });
    const r = scoreGrant(grant, makeProfile({ is_registered_charity: false }));
    expect(r.eligible).toBe(false);
    expect(r.recommendedAction).toBe("do-not-apply");
    expect(r.missingRequirements.join(" ")).toMatch(/charity/i);
  });

  it("hard-stops when the org type is not in eligible_org_types", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    // Grant only for individuals; profile is a company.
    const grant = makeGrant({ eligible_org_types: ["individual"] });
    const r = scoreGrant(grant, makeProfile());
    expect(r.eligible).toBe(false);
  });

  it("accepts a company when eligible_org_types includes 'company'", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const grant = makeGrant({ eligible_org_types: ["company", "charity"] });
    const r = scoreGrant(grant, makeProfile());
    expect(r.eligible).toBe(true);
  });

  it("flags awarded grants as not an open application", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const grant = makeGrant({ status: "awarded", deadline_at: null });
    const r = scoreGrant(grant, makeProfile());
    expect(r.risks.join(" ")).toMatch(/historical award/i);
  });

  it("caps the score and warns when the deadline has passed", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const grant = makeGrant({ status: "closed", deadline_at: past(5) });
    const r = scoreGrant(grant, makeProfile());
    expect(r.fitScore).toBeLessThanOrEqual(30);
    expect(r.risks.join(" ")).toMatch(/deadline has passed/i);
  });

  it("records a missing requirement when match funding is required but absent", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const grant = makeGrant({ match_funding_required: true });
    const r = scoreGrant(grant, makeProfile({ match_funding_capacity: null }));
    expect(r.missingRequirements.join(" ")).toMatch(/match.?funding/i);
  });

  it("reasons over enriched detail sections, not just the listing summary", async () => {
    const { scoreGrant } = await import("@/lib/grants/scoring");
    const base = makeGrant({
      title: "Innovation Fund",
      description: "A general fund for organisations.", // no theme terms here
      eligibility_text: null,
      themes: [],
      sectors: [],
    });
    const withDetail = scoreGrant(
      {
        ...base,
        details: {
          sections: [
            {
              heading: "Eligibility",
              text: "Open to managed detection and cyber security providers.",
            },
          ],
          links: [],
          documents: [],
          webpageUrl: null,
        },
      },
      makeProfile(),
    );
    const withoutDetail = scoreGrant({ ...base, details: null }, makeProfile());
    expect(withDetail.fitScore).toBeGreaterThan(withoutDetail.fitScore);
    expect(withDetail.reasons.join(" ")).toMatch(/cyber|managed detection/i);
  });
});

describe("matchesGrantRule", () => {
  it("matches on a keyword present in the grant text", async () => {
    const { matchesGrantRule } = await import("@/lib/grants/alerts");
    expect(
      matchesGrantRule(makeGrant(), makeRule({ keywords: ["cyber"] })),
    ).toBe(true);
  });

  it("does not match when the keyword is absent", async () => {
    const { matchesGrantRule } = await import("@/lib/grants/alerts");
    expect(
      matchesGrantRule(makeGrant(), makeRule({ keywords: ["agriculture"] })),
    ).toBe(false);
  });

  it("matches on region overlap and funder substring", async () => {
    const { matchesGrantRule } = await import("@/lib/grants/alerts");
    expect(
      matchesGrantRule(makeGrant(), makeRule({ regions: ["England"] })),
    ).toBe(true);
    expect(matchesGrantRule(makeGrant(), makeRule({ buyers: ["dsit"] }))).toBe(
      true,
    );
  });

  it("respects the value range against the award size", async () => {
    const { matchesGrantRule } = await import("@/lib/grants/alerts");
    // amount_max is 100k; a min_value of 200k should exclude.
    expect(
      matchesGrantRule(makeGrant(), makeRule({ min_value: 200_000 })),
    ).toBe(false);
    expect(matchesGrantRule(makeGrant(), makeRule({ min_value: 50_000 }))).toBe(
      true,
    );
  });

  it("never matches a rule with no grant-relevant criteria (CPV-only)", async () => {
    const { matchesGrantRule } = await import("@/lib/grants/alerts");
    // A purely tender-shaped rule must not spam grant matches.
    expect(
      matchesGrantRule(makeGrant(), makeRule({ cpv_codes: ["72000000"] })),
    ).toBe(false);
    expect(matchesGrantRule(makeGrant(), makeRule())).toBe(false);
  });
});

describe("govukFindAGrantConnector.normalize", () => {
  it("maps a search result, mapping applicant types to scoring tokens", async () => {
    const { govukFindAGrantConnector } =
      await import("@/lib/grants/connectors/govuk-find-a-grant");
    const raw = {
      id: "ABC123",
      label: "cyber-grant-1",
      grantName: "Cyber Grant",
      grantShortDescription: "A grant.",
      grantFunder: "DSIT ",
      grantLocation: ["England", "Scotland"],
      grantApplicantType: ["Private Sector", "Non-profit", "Local authority"],
      grantMinimumAward: 5_000,
      grantMaximumAward: 50_000,
      grantApplicationOpenDate: "2020-01-01T00:00",
      grantApplicationCloseDate: "2999-01-01T00:00",
    };
    const [g] = await govukFindAGrantConnector.normalize(raw);
    expect(g.sourceNoticeId).toBe("ABC123");
    expect(g.title).toBe("Cyber Grant");
    expect(g.funderName).toBe("DSIT");
    expect(g.amountMax).toBe(50_000);
    expect(g.regions).toEqual(["England", "Scotland"]);
    expect(g.status).toBe("open"); // open in the past, closes far future
    expect(g.eligibleOrgTypes).toContain("company"); // Private Sector
    expect(g.eligibleOrgTypes).toContain("charity"); // Non-profit
    expect(g.eligibleOrgTypes).toContain("public-body"); // Local authority
  });

  it("derives 'closed' when the close date has passed", async () => {
    const { govukFindAGrantConnector } =
      await import("@/lib/grants/connectors/govuk-find-a-grant");
    const [g] = await govukFindAGrantConnector.normalize({
      id: "X",
      label: "x",
      grantName: "Old Grant",
      grantApplicationOpenDate: "2019-01-01T00:00",
      grantApplicationCloseDate: "2020-01-01T00:00",
    });
    expect(g.status).toBe("closed");
  });
});

describe("buildGrantRequirementText", () => {
  it("combines summary + eligibility + detail sections for extraction", async () => {
    const { buildGrantRequirementText, hasRequirementText } =
      await import("@/lib/grants/application");
    const grant = makeGrant({
      eligibility_text: "Who can apply: Private Sector",
      details: {
        sections: [
          { heading: "Eligibility", text: "Your project must be UK-based." },
          {
            heading: "How to apply",
            text: "Submit via the portal by the deadline.",
          },
        ],
        links: [],
        documents: [],
        webpageUrl: null,
      },
    });
    const text = buildGrantRequirementText(grant);
    expect(text).toContain("Cyber Security Innovation Grant");
    expect(text).toContain("Who can apply: Private Sector");
    expect(text).toContain("## Eligibility");
    expect(text).toContain("Your project must be UK-based.");
    expect(text).toContain("## How to apply");
    expect(hasRequirementText(grant)).toBe(true);
  });

  it("reports too-little-text for a bare grant", async () => {
    const { hasRequirementText } = await import("@/lib/grants/application");
    const bare = makeGrant({
      description: null,
      eligibility_text: null,
      title: "X",
    });
    expect(hasRequirementText(bare)).toBe(false);
  });
});

describe("rich text walker (GOV.UK detail)", () => {
  // A trimmed Contentful Rich Text doc like GOV.UK's grantEligibilityTab.
  const doc = {
    nodeType: "document",
    content: [
      {
        nodeType: "paragraph",
        content: [
          { nodeType: "text", value: "Eligible bodies must read the " },
          {
            nodeType: "hyperlink",
            data: { uri: "https://example.gov.uk/terms.pdf" },
            content: [{ nodeType: "text", value: "terms and conditions" }],
          },
          { nodeType: "text", value: " first." },
        ],
      },
      {
        nodeType: "unordered-list",
        content: [
          {
            nodeType: "list-item",
            content: [
              {
                nodeType: "paragraph",
                content: [{ nodeType: "text", value: "located in England" }],
              },
            ],
          },
        ],
      },
    ],
  };

  it("extracts readable text with the link label inline and bullets", async () => {
    const { richTextToText } = await import("@/lib/grants/richtext");
    const text = richTextToText(doc);
    expect(text).toContain(
      "Eligible bodies must read the terms and conditions first.",
    );
    expect(text).toContain("• located in England");
  });

  it("collects embedded hyperlinks with title + url", async () => {
    const { richTextLinks } = await import("@/lib/grants/richtext");
    const links = richTextLinks(doc);
    expect(links).toEqual([
      {
        title: "terms and conditions",
        url: "https://example.gov.uk/terms.pdf",
      },
    ]);
  });

  it("buildGovukDetails splits documents from links and keeps the apply url", async () => {
    const { buildGovukDetails } =
      await import("@/lib/grants/connectors/govuk-find-a-grant");
    const d = buildGovukDetails({
      grantEligibilityTab: doc,
      grantApplyTab: {
        nodeType: "document",
        content: [
          {
            nodeType: "paragraph",
            content: [
              { nodeType: "text", value: "Apply on " },
              {
                nodeType: "hyperlink",
                data: { uri: "https://www.gov.uk/apply-here" },
                content: [{ nodeType: "text", value: "GOV.UK" }],
              },
            ],
          },
        ],
      },
      grantWebpageUrl: "https://www.gov.uk/apply-here",
    });
    expect(d.sections.map((s) => s.heading)).toEqual([
      "Eligibility",
      "How to apply",
    ]);
    expect(d.documents).toEqual([
      {
        title: "terms and conditions",
        url: "https://example.gov.uk/terms.pdf",
      },
    ]);
    expect(d.links).toEqual([
      { title: "GOV.UK", url: "https://www.gov.uk/apply-here" },
    ]);
    expect(d.webpageUrl).toBe("https://www.gov.uk/apply-here");
  });
});

describe("innovateUkConnector.normalize", () => {
  it("parses dates, amount and funder from an enriched competition", async () => {
    const { innovateUkConnector } =
      await import("@/lib/grants/connectors/innovate-uk");
    const raw = {
      id: "2499",
      slug: "/competition/2499/overview/uuid",
      url: "https://apply-for-innovation-funding.service.gov.uk/competition/2499/overview/uuid",
      title: "Future Leaders Fellowships",
      description:
        "UK registered organisations can apply for a share of up to £110 million. This funding is from UK Research and Innovation (UKRI).",
      funderText: "UK Research and Innovation (UKRI)",
      fundingType: "Grant",
      opensText: "Monday 1 January 2020",
      closesText: "Wednesday 31 December 2999 11:00am",
    };
    const [g] = await innovateUkConnector.normalize(raw);
    expect(g.sourceNoticeId).toBe("2499");
    expect(g.funderName).toBe("UK Research and Innovation (UKRI)");
    expect(g.amountMax).toBe(110_000_000);
    expect(g.fundingType).toBe("grant");
    expect(g.openAt?.slice(0, 10)).toBe("2020-01-01");
    expect(g.deadlineAt?.slice(0, 10)).toBe("2999-12-31");
    expect(g.status).toBe("open");
  });

  it("falls back to a default funder and handles missing dates", async () => {
    const { innovateUkConnector } =
      await import("@/lib/grants/connectors/innovate-uk");
    const [g] = await innovateUkConnector.normalize({
      id: "1",
      slug: "/competition/1/overview/u",
      url: "https://x/1",
      title: "Comp",
      description: "No amount here.",
      funderText: null,
      fundingType: null,
      opensText: null,
      closesText: null,
    });
    expect(g.funderName).toBe("Innovate UK (UKRI)");
    expect(g.amountMax).toBeNull();
    expect(g.openAt).toBeNull();
    expect(g.status).toBe("open"); // no dates -> treated as open
  });
});
