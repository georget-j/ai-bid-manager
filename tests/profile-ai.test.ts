/**
 * AI profile fill (draft-only engine + endpoint):
 * - coerceProposalValue — the model's string values must parse into the exact
 *   POST /api/profile shapes, with malformed output rejected, never guessed.
 * - The no-fabrication guard — the prompt's quote-grounding and insurance
 *   rules are load-bearing; these tests pin them.
 * - draftProfileProposals — register values win over LLM values, filled
 *   fields are never proposed, ungrounded/invalid proposals are dropped, and
 *   the gathered inputs (website hash, register payload) are echoed back.
 * - POST /api/profile/ai-fill — auth, rate-limit passthrough and response
 *   shape with the engine mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { OrganisationProfileRow } from "@/lib/procurement/types";
import type { RetrievedChunk } from "@/lib/schema";

const mocks = vi.hoisted(() => ({
  // engine dependencies
  parse: vi.fn(),
  retrieveChunks: vi.fn(),
  safeFetch: vi.fn(),
  lookupCompany: vi.fn(),
  lookupCharity: vi.fn(),
  // route dependencies
  getRequestOrgId: vi.fn(),
  checkRateLimit: vi.fn(),
  getOrgProfile: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { parse: mocks.parse } } },
  aiOpenAI: {},
  CHAT_MODEL: "test-model",
  EMBEDDING_MODEL: "test-embedding",
  EMBEDDING_DIMENSIONS: 1536,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveChunks: mocks.retrieveChunks }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("@/lib/research/registers", () => ({
  lookupCompany: mocks.lookupCompany,
  lookupCharity: mocks.lookupCharity,
}));
vi.mock("@/lib/org", () => ({ getRequestOrgId: mocks.getRequestOrgId }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/procurement/data", () => ({
  getOrgProfile: mocks.getOrgProfile,
}));
// Spy mode: real implementations stay live for the engine/unit tests below,
// while the route tests can swap draftProfileProposals out per call.
vi.mock("@/lib/profile-ai", { spy: true });

import {
  coerceProposalValue,
  emptyProfileFields,
  buildProfileFillSystemPrompt,
  buildProfileFillUserPrompt,
  draftProfileProposals,
  groupProposalsBySection,
  registerProposals,
  stripHtmlToText,
  PROPOSABLE_FIELD_NAMES,
  type ProfileAiDraft,
  type ProfileProposal,
} from "@/lib/profile-ai";

const ORG_ID = "11111111-2222-3333-4444-555555555555";

const CHUNK: RetrievedChunk = {
  id: "c1",
  document_id: "d1",
  document_title: "Company Handbook",
  content:
    "We hold ISO 27001 and Cyber Essentials Plus certification. Our professional indemnity cover is £2,000,000 with Hiscox, policy PI-123, expiring 2027-03-01.",
  similarity: 0.9,
  metadata: null,
};

function profileWith(
  overrides: Record<string, unknown>,
): OrganisationProfileRow {
  return {
    services: [],
    sectors: [],
    keywords: [],
    cpv_codes: [],
    regions: [],
    delivery_models: [],
    certifications: [],
    accreditations: [],
    memberships: [],
    frameworks: [],
    key_people: [],
    policies: [],
    sic_codes: [],
    trading_names: [],
    grant_themes: [],
    insurance: null,
    website: null,
    company_number: null,
    charity_number: null,
    vat_number: null,
    registered_address: null,
    incorporation_date: null,
    year_established: null,
    annual_turnover: null,
    company_size_band: null,
    employee_count: null,
    carbon_reduction_plan: null,
    legal_form: null,
    ...overrides,
  } as unknown as OrganisationProfileRow;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── coerceProposalValue ───────────────────────────────────────────────────────

describe("coerceProposalValue", () => {
  it("splits and dedupes tag fields", () => {
    const r = coerceProposalValue(
      "certifications",
      "ISO 27001, Cyber Essentials Plus; ISO 27001,",
    );
    expect(r).toEqual({
      ok: true,
      value: ["ISO 27001", "Cyber Essentials Plus"],
      display: "ISO 27001, Cyber Essentials Plus",
    });
  });

  it("parses numbers and rejects non-numeric text", () => {
    expect(coerceProposalValue("annual_turnover", "£1,250,000")).toMatchObject({
      ok: true,
      value: 1_250_000,
    });
    expect(coerceProposalValue("employee_count", "42").ok).toBe(true);
    expect(coerceProposalValue("employee_count", "about forty").ok).toBe(false);
    expect(coerceProposalValue("employee_count", "-3").ok).toBe(false);
  });

  it("enforces YYYY-MM-DD for dates", () => {
    expect(coerceProposalValue("incorporation_date", "2015-06-01").ok).toBe(
      true,
    );
    expect(coerceProposalValue("incorporation_date", "June 2015").ok).toBe(
      false,
    );
  });

  it("only accepts known legal forms and size bands", () => {
    expect(coerceProposalValue("legal_form", "company").ok).toBe(true);
    expect(coerceProposalValue("legal_form", "Limited company").ok).toBe(false);
    expect(coerceProposalValue("company_size_band", "Small (10-49)").ok).toBe(
      true,
    );
    expect(coerceProposalValue("company_size_band", "smallish").ok).toBe(false);
  });

  it("parses boolean answers", () => {
    expect(coerceProposalValue("carbon_reduction_plan", "Yes")).toMatchObject({
      ok: true,
      value: true,
    });
    expect(coerceProposalValue("carbon_reduction_plan", "false")).toMatchObject(
      { ok: true, value: false },
    );
    expect(coerceProposalValue("carbon_reduction_plan", "maybe").ok).toBe(
      false,
    );
  });

  it("validates structured JSON fields and rejects malformed JSON", () => {
    const address = coerceProposalValue(
      "registered_address",
      '{"line1":"1 High St","city":"Leeds","postcode":"LS1 1AA"}',
    );
    expect(address).toMatchObject({
      ok: true,
      value: { line1: "1 High St", city: "Leeds", postcode: "LS1 1AA" },
      display: "1 High St, Leeds, LS1 1AA",
    });
    expect(
      coerceProposalValue("registered_address", "1 High St, Leeds").ok,
    ).toBe(false);
    expect(
      coerceProposalValue("key_people", '[{"name":"Ana Diaz","role":"CTO"}]'),
    ).toMatchObject({ ok: true, display: "Ana Diaz (CTO)" });
    expect(coerceProposalValue("key_people", '[{"name":"Ana Diaz"}]').ok).toBe(
      false,
    );
    expect(
      coerceProposalValue("frameworks", '[{"name":"G-Cloud 14"}]').ok,
    ).toBe(true);
  });

  it("strips document_id from policy proposals — the model must not invent links", () => {
    const r = coerceProposalValue(
      "policies",
      '[{"name":"Information Security Policy","document_id":"fake-id"}]',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([{ name: "Information Security Policy" }]);
    }
  });

  it("accepts insurance only as a valid structured object", () => {
    const r = coerceProposalValue(
      "insurance",
      JSON.stringify({
        professional_indemnity: {
          amount: 2_000_000,
          insurer: "Hiscox",
          policy_number: "PI-123",
          expires_at: "2027-03-01",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.display).toContain("Professional indemnity");
      expect(r.display).toContain("Hiscox");
    }
    expect(coerceProposalValue("insurance", "£2m PI cover").ok).toBe(false);
    expect(coerceProposalValue("insurance", "{}").ok).toBe(false);
  });
});

// ── Gap detection ─────────────────────────────────────────────────────────────

describe("emptyProfileFields", () => {
  it("treats a missing profile as all gaps", () => {
    expect(emptyProfileFields(null)).toEqual(PROPOSABLE_FIELD_NAMES);
  });

  it("excludes filled fields, including legacy insurance numbers and a stored false", () => {
    const gaps = emptyProfileFields(
      profileWith({
        certifications: ["ISO 9001"],
        insurance: { professional_indemnity: 1_000_000 }, // pre-070 shape
        carbon_reduction_plan: false, // "no" is still an answer
      }),
    );
    expect(gaps).not.toContain("certifications");
    expect(gaps).not.toContain("insurance");
    expect(gaps).not.toContain("carbon_reduction_plan");
    expect(gaps).toContain("vat_number");
  });
});

// ── The no-fabrication guard (prompt contract) ────────────────────────────────

describe("profile fill prompt — quote-grounding guard", () => {
  it("instructs the model to ground every value in a direct quote", () => {
    const prompt = buildProfileFillSystemPrompt();
    expect(prompt).toContain(
      "Only propose a value you can support with a direct quote",
    );
    expect(prompt).toContain("Never invent, guess or pad a value");
    expect(prompt).toContain("leave that field out");
  });

  it("forbids unquoted insurance amounts and policy numbers, marking inference low", () => {
    const prompt = buildProfileFillSystemPrompt();
    expect(prompt).toContain(
      "Never propose insurance amounts or policy numbers unless the exact figures are quoted word-for-word",
    );
    expect(prompt).toContain('marked confidence "low"');
  });

  it("puts only the empty fields and the gathered sources in the user prompt", () => {
    const prompt = buildProfileFillUserPrompt({
      targetFields: ["vat_number", "certifications"],
      docChunks: [CHUNK],
      websiteText: "We are a Leeds-based cyber security firm.",
      websiteUrl: "https://fortiscyber.example",
    });
    expect(prompt).toContain("currently-empty profile fields");
    expect(prompt).toContain("- vat_number");
    expect(prompt).toContain("- certifications");
    expect(prompt).not.toContain("- key_people");
    expect(prompt).toContain("[Company Handbook]");
    expect(prompt).toContain("https://fortiscyber.example");
  });
});

// ── stripHtmlToText ───────────────────────────────────────────────────────────

describe("stripHtmlToText", () => {
  it("drops script/style blocks and tags, decodes entities, collapses whitespace", () => {
    const text = stripHtmlToText(
      "<html><head><style>p{color:red}</style></head><body><h1>Fortis &amp; Co</h1><script>evil()</script><p>Cover of &pound;2m.</p></body></html>",
    );
    expect(text).toBe("Fortis & Co Cover of £2m.");
  });
});

// ── registerProposals ─────────────────────────────────────────────────────────

describe("registerProposals", () => {
  it("maps register payloads to exact high-confidence proposals, gaps only", () => {
    const proposals = registerProposals(
      {
        company: {
          company_number: "12345678",
          name: "Fortis Cyber Ltd",
          legal_form: "company",
          year_established: 2015,
          registered_address: { line1: "1 High St", postcode: "LS1 1AA" },
          sic_codes: ["62020"],
          notes: [],
        },
        charity: null,
      },
      new Set(["registered_address", "sic_codes", "legal_form"]),
    );
    expect(proposals.map((p) => p.field)).toEqual([
      "registered_address",
      "sic_codes",
      "legal_form",
    ]);
    // year_established was not a gap, so it must not be proposed.
    expect(
      proposals.every(
        (p) => p.source === "public registers" && p.confidence === "high",
      ),
    ).toBe(true);
  });

  it("lets the charity register win on legal form", () => {
    const proposals = registerProposals(
      {
        company: { legal_form: "company", notes: [] },
        charity: {
          legal_form: "charity",
          is_registered_charity: true,
          notes: [],
        },
      },
      new Set(["legal_form"]),
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].value).toBe("charity");
  });
});

// ── groupProposalsBySection ───────────────────────────────────────────────────

describe("groupProposalsBySection", () => {
  it("groups in profile-page section order and drops empty sections", () => {
    const make = (field: ProfileProposal["field"]): ProfileProposal => ({
      field,
      label: field,
      section:
        field === "legal_form" ? "grant-readiness" : "registered-details",
      sectionLabel:
        field === "legal_form" ? "Grant readiness" : "Registered details",
      value: "x",
      display: "x",
      confidence: "high",
      evidence: "quoted",
      source: "your documents",
    });
    const groups = groupProposalsBySection([
      make("legal_form"),
      make("vat_number"),
    ]);
    expect(groups.map((g) => g.id)).toEqual([
      "registered-details",
      "grant-readiness",
    ]);
    expect(groups[0].proposals.map((p) => p.field)).toEqual(["vat_number"]);
  });
});

// ── draftProfileProposals (engine) ────────────────────────────────────────────

describe("draftProfileProposals", () => {
  it("merges register + LLM proposals, registers winning per field, dropping ungrounded or invalid values", async () => {
    mocks.retrieveChunks.mockResolvedValue([CHUNK]);
    mocks.lookupCompany.mockResolvedValue({
      company_number: "12345678",
      name: "Fortis Cyber Ltd",
      legal_form: "company",
      year_established: 2015,
      registered_address: {
        line1: "1 High St",
        city: "Leeds",
        postcode: "LS1 1AA",
        country: "England",
      },
      sic_codes: ["62020"],
      notes: ["Found Fortis Cyber Ltd on Companies House."],
    });
    mocks.parse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              proposals: [
                {
                  field: "certifications",
                  value: "ISO 27001, Cyber Essentials Plus",
                  confidence: "high",
                  evidence:
                    "We hold ISO 27001 and Cyber Essentials Plus certification",
                  source: "your documents",
                },
                {
                  // Register already proposed 2015 — this must lose.
                  field: "year_established",
                  value: "2019",
                  confidence: "medium",
                  evidence: "since 2019",
                  source: "your documents",
                },
                {
                  // Unparseable value — must be dropped, never guessed.
                  field: "employee_count",
                  value: "about forty",
                  confidence: "low",
                  evidence: "our team of about forty",
                  source: "your documents",
                },
                {
                  // No quote — must be dropped.
                  field: "memberships",
                  value: "techUK",
                  confidence: "medium",
                  evidence: "  ",
                  source: "your website",
                },
                {
                  field: "insurance",
                  value: JSON.stringify({
                    professional_indemnity: {
                      amount: 2_000_000,
                      insurer: "Hiscox",
                      policy_number: "PI-123",
                      expires_at: "2027-03-01",
                    },
                  }),
                  confidence: "high",
                  evidence:
                    "professional indemnity cover is £2,000,000 with Hiscox, policy PI-123",
                  source: "your documents",
                },
              ],
            },
          },
        },
      ],
    });

    const draft = await draftProfileProposals({
      orgId: ORG_ID,
      profile: profileWith({ company_number: "12345678" }),
    });

    // Section-ordered output, registers winning year_established.
    expect(draft.proposals.map((p) => p.field)).toEqual([
      "registered_address",
      "year_established",
      "sic_codes",
      "insurance",
      "certifications",
      "legal_form",
    ]);

    const byField = new Map(draft.proposals.map((p) => [p.field, p]));
    expect(byField.get("year_established")).toMatchObject({
      value: 2015,
      source: "public registers",
      confidence: "high",
    });
    expect(byField.get("certifications")).toMatchObject({
      value: ["ISO 27001", "Cyber Essentials Plus"],
      source: "your documents",
      sectionLabel: "Credentials and memberships",
    });
    expect(byField.get("insurance")?.value).toEqual({
      professional_indemnity: {
        amount: 2_000_000,
        insurer: "Hiscox",
        policy_number: "PI-123",
        expires_at: "2027-03-01",
      },
    });

    // Org-scoped retrieval, no rerank, one query per evidence theme.
    expect(mocks.retrieveChunks).toHaveBeenCalledTimes(4);
    expect(mocks.retrieveChunks).toHaveBeenCalledWith(
      expect.any(String),
      ORG_ID,
      null,
      null,
      { rerank: false },
    );
    // No website on the profile — nothing must be fetched.
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.lookupCharity).not.toHaveBeenCalled();

    // The LLM was only asked for fields registers had not already answered.
    const [llmArgs] = mocks.parse.mock.calls[0];
    expect(llmArgs.messages[0].content).toContain("direct quote");
    expect(llmArgs.messages[1].content).toContain("- certifications");
    expect(llmArgs.messages[1].content).not.toContain("- registered_address");
    expect(llmArgs.messages[1].content).not.toContain("- company_number");

    // Audit trail: register payload echoed, document evidence accounted for.
    expect(draft.sources.registers.company).toMatchObject({
      name: "Fortis Cyber Ltd",
    });
    expect(draft.sources.documents).toEqual({
      queries: expect.arrayContaining([expect.any(String)]),
      chunkCount: 1,
      documentTitles: ["Company Handbook"],
    });
  });

  it("returns early without touching any source when the profile is complete", async () => {
    const full = profileWith({
      services: ["Pen testing"],
      sectors: ["Public sector"],
      keywords: ["cyber"],
      regions: ["Yorkshire and the Humber"],
      delivery_models: ["Remote"],
      website: "https://fortiscyber.example",
      company_number: "12345678",
      vat_number: "GB123456789",
      registered_address: { line1: "1 High St" },
      incorporation_date: "2015-06-01",
      year_established: 2015,
      sic_codes: ["62020"],
      trading_names: ["Fortis"],
      annual_turnover: 1_000_000,
      insurance: { professional_indemnity: 1_000_000 },
      certifications: ["ISO 27001"],
      accreditations: ["CREST"],
      memberships: ["techUK"],
      frameworks: [{ name: "G-Cloud 14" }],
      company_size_band: "Small (10-49)",
      employee_count: 12,
      key_people: [{ name: "Ana Diaz", role: "CTO" }],
      policies: [{ name: "InfoSec Policy" }],
      carbon_reduction_plan: false,
      legal_form: "company",
      charity_number: "1234567",
      grant_themes: ["digital inclusion"],
    });

    const draft = await draftProfileProposals({ orgId: ORG_ID, profile: full });

    expect(draft.proposals).toEqual([]);
    expect(draft.notes.join(" ")).toContain("already answers");
    expect(mocks.retrieveChunks).not.toHaveBeenCalled();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.lookupCompany).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("fetches the website, hashes its text for audit, and survives an LLM failure", async () => {
    mocks.retrieveChunks.mockResolvedValue([]);
    mocks.parse.mockRejectedValue(new Error("model down"));
    mocks.safeFetch.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith("/about")) {
        return { ok: false, status: 404, text: async () => "" } as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          "<html><body><h1>Fortis Cyber</h1><p>We are a Leeds-based cyber security firm.</p></body></html>",
      } as Response;
    });

    const draft = await draftProfileProposals({
      orgId: ORG_ID,
      profile: null,
      website: "fortiscyber.example",
    });

    expect(draft.sources.website).toEqual({
      url: "https://fortiscyber.example",
      fetched: true,
      textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(draft.proposals).toEqual([]);
    expect(draft.notes.join(" ")).toContain("AI drafting step failed");
    // No company/charity number — registers must not be queried.
    expect(mocks.lookupCompany).not.toHaveBeenCalled();
    expect(mocks.lookupCharity).not.toHaveBeenCalled();
  });

  it("skips the LLM call and says why when there is nothing to draft from", async () => {
    mocks.retrieveChunks.mockResolvedValue([]);

    const draft = await draftProfileProposals({ orgId: ORG_ID, profile: null });

    expect(mocks.parse).not.toHaveBeenCalled();
    expect(draft.proposals).toEqual([]);
    expect(draft.notes.join(" ")).toContain("Add documents");
  });
});

// ── POST /api/profile/ai-fill ─────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return {
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as unknown as NextRequest;
}

async function callRoute(body: unknown) {
  const { POST } = await import("@/app/api/profile/ai-fill/route");
  return POST(makeRequest(body));
}

const FAKE_DRAFT: ProfileAiDraft = {
  proposals: [
    {
      field: "vat_number",
      label: "VAT number",
      section: "registered-details",
      sectionLabel: "Registered details",
      value: "GB123456789",
      display: "GB123456789",
      confidence: "high",
      evidence: "VAT registration GB123456789",
      source: "your documents",
    },
  ],
  sources: {
    documents: { queries: [], chunkCount: 1, documentTitles: ["Handbook"] },
    website: { url: null, fetched: false, textHash: null },
    registers: { company: null, charity: null, notes: [] },
  },
  notes: [],
};

describe("POST /api/profile/ai-fill", () => {
  it("returns 401 when the caller has no org", async () => {
    mocks.getRequestOrgId.mockResolvedValue(null);

    const res = await callRoute({});

    expect(res.status).toBe(401);
    expect(vi.mocked(draftProfileProposals)).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response untouched when over quota", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 }),
    );

    const res = await callRoute({});

    expect(res.status).toBe(429);
    expect(vi.mocked(draftProfileProposals)).not.toHaveBeenCalled();
  });

  it("returns the draft and passes the body website through to the engine", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    mocks.checkRateLimit.mockResolvedValue(null);
    const profileRow = profileWith({ company_number: "12345678" });
    mocks.getOrgProfile.mockResolvedValue(profileRow);
    vi.mocked(draftProfileProposals).mockResolvedValueOnce(FAKE_DRAFT);

    const res = await callRoute({ website: "  fortiscyber.example  " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FAKE_DRAFT);
    expect(vi.mocked(draftProfileProposals)).toHaveBeenCalledWith({
      orgId: ORG_ID,
      profile: profileRow,
      website: "fortiscyber.example",
    });
  });

  it("tolerates a missing body and falls back to the saved profile website", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getOrgProfile.mockResolvedValue(null);
    vi.mocked(draftProfileProposals).mockResolvedValueOnce(FAKE_DRAFT);

    const res = await callRoute(undefined); // request.json() throws

    expect(res.status).toBe(200);
    expect(vi.mocked(draftProfileProposals)).toHaveBeenCalledWith({
      orgId: ORG_ID,
      profile: null,
      website: null,
    });
  });

  it("returns 500 with the error message when drafting fails", async () => {
    mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getOrgProfile.mockRejectedValue(new Error("db unreachable"));

    const res = await callRoute({});

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db unreachable" });
  });
});
