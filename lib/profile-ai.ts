// AI profile fill — drafts profile-field proposals from three evidence sources
// (the org's evidence library, its website, the free UK registers) with ONE
// structured LLM call. Draft-only: nothing here writes to the database. The
// user reviews every proposal in components/ProfileAiFill.tsx, applies the ones
// they want into the form, and saves through the normal POST /api/profile.
//
// No-fabrication contract: every LLM proposal must carry a direct quote from
// the gathered sources; register-derived proposals bypass the LLM entirely so
// official values are reproduced exactly. Insurance amounts/policy numbers are
// only ever proposed when quoted word-for-word from documents.

import { createHash } from "node:crypto";
import * as z from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { retrieveChunks } from "@/lib/retrieval";
import { safeFetch } from "@/lib/safe-fetch";
import {
  lookupCompany,
  lookupCharity,
  type RegisterEnrichment,
} from "@/lib/research/registers";
import {
  normaliseInsurance,
  type OrganisationProfileRow,
} from "@/lib/procurement/types";
import type { ProfileSectionId } from "@/lib/setup-flow";
import { LEGAL_FORM_OPTIONS } from "@/lib/copy";
import type { RetrievedChunk } from "@/lib/schema";

// ── Field catalogue ───────────────────────────────────────────────────────────

export const PROPOSAL_SOURCES = [
  "your documents",
  "your website",
  "public registers",
] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export type ProposalConfidence = "high" | "medium" | "low";

/** How a field's raw LLM string value is parsed into the API-schema shape. */
type FieldKind =
  | "text"
  | "date"
  | "integer"
  | "number"
  | "boolean"
  | "tags"
  | "address"
  | "key_people"
  | "frameworks"
  | "policies"
  | "insurance";

interface FieldMeta {
  /** Plain-English label shown on the proposal card. */
  label: string;
  /** Section the profile page groups this field under (shared with setup-flow). */
  section: ProfileSectionId;
  kind: FieldKind;
  /** Format hint given to the model. */
  hint: string;
}

const COMPANY_SIZE_BANDS = [
  "Micro (0-9)",
  "Small (10-49)",
  "Medium (50-249)",
  "Large (250+)",
] as const;

const LEGAL_FORM_VALUES = LEGAL_FORM_OPTIONS.map((o) => o.value);

/**
 * The only fields the AI may propose — the migration-070 business credentials
 * plus the existing profile fields that commonly sit empty. Names match the
 * POST /api/profile zod schema exactly so applied proposals merge straight
 * into the form payload. Deliberately absent: CPV codes, contract value range
 * and buyer preferences (judgement calls the user must make, not evidence).
 */
export const PROPOSABLE_FIELDS = {
  // What you do
  services: {
    label: "Services",
    section: "what-you-do",
    kind: "tags",
    hint: "comma-separated list",
  },
  sectors: {
    label: "Sectors",
    section: "what-you-do",
    kind: "tags",
    hint: "comma-separated list",
  },
  keywords: {
    label: "Keywords",
    section: "what-you-do",
    kind: "tags",
    hint: "comma-separated list",
  },
  regions: {
    label: "Regions you cover",
    section: "what-you-do",
    kind: "tags",
    hint: "comma-separated UK regions",
  },
  delivery_models: {
    label: "Delivery models",
    section: "what-you-do",
    kind: "tags",
    hint: "comma-separated, e.g. On-site, Remote, Hybrid, Nationwide",
  },
  // Registered details
  website: {
    label: "Website",
    section: "registered-details",
    kind: "text",
    hint: "full URL",
  },
  company_number: {
    label: "Company number",
    section: "registered-details",
    kind: "text",
    hint: "Companies House number",
  },
  vat_number: {
    label: "VAT number",
    section: "registered-details",
    kind: "text",
    hint: "UK VAT registration number",
  },
  registered_address: {
    label: "Registered address",
    section: "registered-details",
    kind: "address",
    hint: 'JSON object {"line1","line2","city","postcode","country"}',
  },
  incorporation_date: {
    label: "Incorporation date",
    section: "registered-details",
    kind: "date",
    hint: "YYYY-MM-DD",
  },
  year_established: {
    label: "Year established",
    section: "registered-details",
    kind: "integer",
    hint: "four-digit year",
  },
  sic_codes: {
    label: "SIC codes",
    section: "registered-details",
    kind: "tags",
    hint: "comma-separated numeric codes",
  },
  trading_names: {
    label: "Trading names",
    section: "registered-details",
    kind: "tags",
    hint: "comma-separated list",
  },
  // Financial standing
  annual_turnover: {
    label: "Annual turnover",
    section: "financial",
    kind: "number",
    hint: "number in GBP, digits only",
  },
  // Insurance
  insurance: {
    label: "Insurance cover",
    section: "insurance",
    kind: "insurance",
    hint: 'JSON object, keys professional_indemnity / public_liability / employers_liability, each {"amount", "insurer", "policy_number", "expires_at"} — only amounts and policy numbers quoted word-for-word from documents',
  },
  // Credentials and memberships
  certifications: {
    label: "Certifications",
    section: "credentials",
    kind: "tags",
    hint: "comma-separated, e.g. ISO 27001, Cyber Essentials Plus",
  },
  accreditations: {
    label: "Accreditations",
    section: "credentials",
    kind: "tags",
    hint: "comma-separated list",
  },
  memberships: {
    label: "Memberships",
    section: "credentials",
    kind: "tags",
    hint: "comma-separated trade bodies or associations",
  },
  frameworks: {
    label: "Framework places",
    section: "credentials",
    kind: "frameworks",
    hint: 'JSON array [{"name","reference","expires_at"}]',
  },
  // Your team
  company_size_band: {
    label: "Company size",
    section: "people",
    kind: "text",
    hint: `one of: ${COMPANY_SIZE_BANDS.join(", ")}`,
  },
  employee_count: {
    label: "Number of employees",
    section: "people",
    kind: "integer",
    hint: "whole number",
  },
  key_people: {
    label: "Key people",
    section: "people",
    kind: "key_people",
    hint: 'JSON array [{"name","role","bio"}]',
  },
  // Policies
  policies: {
    label: "Policy documents",
    section: "policies",
    kind: "policies",
    hint: 'JSON array [{"name","last_reviewed"}]',
  },
  carbon_reduction_plan: {
    label: "Carbon reduction plan",
    section: "policies",
    kind: "boolean",
    hint: "true or false",
  },
  // Grant readiness
  legal_form: {
    label: "Legal form",
    section: "grant-readiness",
    kind: "text",
    hint: `one of: ${LEGAL_FORM_VALUES.join(", ")}`,
  },
  charity_number: {
    label: "Charity number",
    section: "grant-readiness",
    kind: "text",
    hint: "Charity Commission number",
  },
  grant_themes: {
    label: "Grant themes",
    section: "grant-readiness",
    kind: "tags",
    hint: "comma-separated list",
  },
} as const satisfies Record<string, FieldMeta>;

export type ProposableField = keyof typeof PROPOSABLE_FIELDS;

export const PROPOSABLE_FIELD_NAMES = Object.keys(
  PROPOSABLE_FIELDS,
) as ProposableField[];

/** Section display order + labels — mirrors the profile page's section order. */
export const PROPOSAL_SECTIONS: ReadonlyArray<{
  id: ProfileSectionId;
  label: string;
}> = [
  { id: "what-you-do", label: "What you do" },
  { id: "registered-details", label: "Registered details" },
  { id: "financial", label: "Financial standing" },
  { id: "insurance", label: "Insurance" },
  { id: "credentials", label: "Credentials and memberships" },
  { id: "people", label: "Your team" },
  { id: "policies", label: "Policies" },
  { id: "grant-readiness", label: "Grant readiness" },
];

const SECTION_LABELS = new Map(PROPOSAL_SECTIONS.map((s) => [s.id, s.label]));

// ── Result types ──────────────────────────────────────────────────────────────

export interface ProfileProposal {
  field: ProposableField;
  /** Plain-English field label, ready for the card. */
  label: string;
  section: ProfileSectionId;
  /**
   * Plain-English section heading. Carried on every proposal so the client
   * card can group without importing this (server-only) module at runtime.
   */
  sectionLabel: string;
  /** Typed value matching the POST /api/profile schema for this field. */
  value: unknown;
  /** Human-readable rendering of the value for review. */
  display: string;
  confidence: ProposalConfidence;
  /** Short quote (or register record reference) supporting the value. */
  evidence: string;
  source: ProposalSource;
}

/** Raw gathered inputs echoed back for auditability — never persisted here. */
export interface ProfileAiSources {
  documents: {
    queries: string[];
    chunkCount: number;
    documentTitles: string[];
  };
  website: { url: string | null; fetched: boolean; textHash: string | null };
  registers: {
    company: RegisterEnrichment | null;
    charity: RegisterEnrichment | null;
    notes: string[];
  };
}

export interface ProfileAiDraft {
  proposals: ProfileProposal[];
  sources: ProfileAiSources;
  /** Plain-English caveats: missing register keys, fetch failures, etc. */
  notes: string[];
}

// ── Value parsing/validation ──────────────────────────────────────────────────

const AddressValueSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
  })
  .refine(
    (a) => Object.values(a).some((v) => typeof v === "string" && v.trim()),
    "address needs at least one filled part",
  );

const KeyPeopleValueSchema = z
  .array(
    z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      bio: z.string().optional(),
    }),
  )
  .min(1);

const FrameworksValueSchema = z
  .array(
    z.object({
      name: z.string().min(1),
      reference: z.string().optional(),
      expires_at: z.string().optional(),
    }),
  )
  .min(1);

// document_id is intentionally NOT accepted — the model must never invent
// links to knowledge-base documents.
const PoliciesValueSchema = z
  .array(
    z.object({
      name: z.string().min(1),
      last_reviewed: z.string().optional(),
    }),
  )
  .min(1);

const InsuranceLineValueSchema = z.object({
  amount: z.number().positive().nullable().optional(),
  insurer: z.string().optional(),
  policy_number: z.string().optional(),
  expires_at: z.string().optional(),
});

const InsuranceValueSchema = z
  .object({
    professional_indemnity: InsuranceLineValueSchema.optional(),
    public_liability: InsuranceLineValueSchema.optional(),
    employers_liability: InsuranceLineValueSchema.optional(),
  })
  .refine(
    (v) =>
      v.professional_indemnity != null ||
      v.public_liability != null ||
      v.employers_liability != null,
    "insurance needs at least one line of cover",
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function splitTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const tag = part.trim();
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function displayAddress(a: z.infer<typeof AddressValueSchema>): string {
  return [a.line1, a.line2, a.city, a.postcode, a.country]
    .filter((v) => v && v.trim())
    .join(", ");
}

function displayInsurance(v: z.infer<typeof InsuranceValueSchema>): string {
  const lines: string[] = [];
  const names: Array<[keyof typeof v, string]> = [
    ["professional_indemnity", "Professional indemnity"],
    ["public_liability", "Public liability"],
    ["employers_liability", "Employers' liability"],
  ];
  for (const [key, label] of names) {
    const line = v[key];
    if (!line) continue;
    const parts = [
      line.amount != null ? GBP.format(line.amount) : null,
      line.insurer || null,
      line.expires_at ? `expires ${line.expires_at}` : null,
    ].filter(Boolean);
    lines.push(
      `${label}: ${parts.length ? parts.join(", ") : "details on file"}`,
    );
  }
  return lines.join("; ");
}

export type CoercedValue =
  | { ok: true; value: unknown; display: string }
  | { ok: false; reason: string };

/**
 * Parse the model's string value into the typed shape POST /api/profile
 * expects, rejecting anything malformed instead of guessing. Exported for
 * tests — this is the last line of defence against fabricated structure.
 */
export function coerceProposalValue(
  field: ProposableField,
  raw: string,
): CoercedValue {
  const meta = PROPOSABLE_FIELDS[field];
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty value" };

  switch (meta.kind) {
    case "text": {
      if (field === "legal_form" && !LEGAL_FORM_VALUES.includes(trimmed)) {
        return { ok: false, reason: `unknown legal form "${trimmed}"` };
      }
      if (
        field === "company_size_band" &&
        !COMPANY_SIZE_BANDS.includes(
          trimmed as (typeof COMPANY_SIZE_BANDS)[number],
        )
      ) {
        return { ok: false, reason: `unknown company size band "${trimmed}"` };
      }
      return { ok: true, value: trimmed, display: trimmed };
    }
    case "date": {
      if (!ISO_DATE.test(trimmed)) {
        return { ok: false, reason: "date must be YYYY-MM-DD" };
      }
      return { ok: true, value: trimmed, display: trimmed };
    }
    case "integer": {
      const n = Number(trimmed.replace(/[,\s]/g, ""));
      if (!Number.isInteger(n) || n < 0) {
        return { ok: false, reason: "not a whole number" };
      }
      return { ok: true, value: n, display: String(n) };
    }
    case "number": {
      const n = Number(trimmed.replace(/[£,\s]/g, ""));
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, reason: "not a positive number" };
      }
      return { ok: true, value: n, display: GBP.format(n) };
    }
    case "boolean": {
      const lowered = trimmed.toLowerCase();
      if (["true", "yes"].includes(lowered)) {
        return { ok: true, value: true, display: "Yes" };
      }
      if (["false", "no"].includes(lowered)) {
        return { ok: true, value: false, display: "No" };
      }
      return { ok: false, reason: "not a yes/no value" };
    }
    case "tags": {
      const tags = splitTags(trimmed);
      if (tags.length === 0) return { ok: false, reason: "no usable values" };
      return { ok: true, value: tags, display: tags.join(", ") };
    }
    case "address": {
      const parsed = AddressValueSchema.safeParse(parseJson(trimmed));
      if (!parsed.success) return { ok: false, reason: "not a valid address" };
      return {
        ok: true,
        value: parsed.data,
        display: displayAddress(parsed.data),
      };
    }
    case "key_people": {
      const parsed = KeyPeopleValueSchema.safeParse(parseJson(trimmed));
      if (!parsed.success) {
        return { ok: false, reason: "not a valid list of people" };
      }
      return {
        ok: true,
        value: parsed.data,
        display: parsed.data.map((p) => `${p.name} (${p.role})`).join("; "),
      };
    }
    case "frameworks": {
      const parsed = FrameworksValueSchema.safeParse(parseJson(trimmed));
      if (!parsed.success) {
        return { ok: false, reason: "not a valid list of frameworks" };
      }
      return {
        ok: true,
        value: parsed.data,
        display: parsed.data
          .map((f) => (f.reference ? `${f.name} (${f.reference})` : f.name))
          .join("; "),
      };
    }
    case "policies": {
      const parsed = PoliciesValueSchema.safeParse(parseJson(trimmed));
      if (!parsed.success) {
        return { ok: false, reason: "not a valid list of policies" };
      }
      return {
        ok: true,
        value: parsed.data,
        display: parsed.data.map((p) => p.name).join("; "),
      };
    }
    case "insurance": {
      const parsed = InsuranceValueSchema.safeParse(parseJson(trimmed));
      if (!parsed.success) {
        return { ok: false, reason: "not valid insurance cover" };
      }
      return {
        ok: true,
        value: parsed.data,
        display: displayInsurance(parsed.data),
      };
    }
  }
}

// ── Gap detection ─────────────────────────────────────────────────────────────

function isFilled(
  field: ProposableField,
  profile: OrganisationProfileRow | null,
): boolean {
  if (!profile) return false;
  // Every proposable field is a real OrganisationProfileRow column, so this
  // index is type-safe; `unknown` because pre-070 rows may hold legacy shapes.
  const value: unknown = profile[field];
  switch (PROPOSABLE_FIELDS[field].kind) {
    case "tags":
    case "key_people":
    case "frameworks":
    case "policies":
      return Array.isArray(value) && value.length > 0;
    case "address":
      return (
        value != null &&
        typeof value === "object" &&
        Object.values(value).some((v) => typeof v === "string" && v.trim())
      );
    case "insurance":
      return normaliseInsurance(value) != null;
    case "boolean":
      // A stored "no" is still an answer — only null/undefined is a gap.
      return value != null;
    default:
      return value != null && String(value).trim() !== "";
  }
}

/** The proposable fields the profile has not answered yet. Exported for tests. */
export function emptyProfileFields(
  profile: OrganisationProfileRow | null,
): ProposableField[] {
  return PROPOSABLE_FIELD_NAMES.filter((f) => !isFilled(f, profile));
}

// ── Evidence gathering ────────────────────────────────────────────────────────

/** Targeted knowledge-base queries — each chases a different profile section. */
export const EVIDENCE_QUERIES = [
  "company registration number VAT registered address",
  "certifications accreditations ISO 27001 Cyber Essentials",
  "insurance professional indemnity public liability employers liability cover",
  "team size employees key people directors leadership",
] as const;

async function gatherDocumentChunks(orgId: string): Promise<{
  chunks: RetrievedChunk[];
  notes: string[];
}> {
  const notes: string[] = [];
  const results = await Promise.allSettled(
    // Org-scoped retrieval: client_id null, no grant collection — matches how
    // the compliance-matrix route scopes org-wide evidence searches.
    EVIDENCE_QUERIES.map((q) =>
      retrieveChunks(q, orgId, null, null, { rerank: false }),
    ),
  );
  const byId = new Map<string, RetrievedChunk>();
  let failures = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const chunk of result.value) byId.set(chunk.id, chunk);
    } else {
      failures += 1;
    }
  }
  if (failures === EVIDENCE_QUERIES.length) {
    notes.push("We couldn't search your evidence library this time.");
  }
  return { chunks: [...byId.values()], notes };
}

/**
 * Strip an HTML page to readable text. Local on purpose: the grant connectors
 * each keep a private stripTags with source-specific entity handling — there
 * is no shared exported helper to reuse.
 */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/&#163;/g, "£")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const PAGE_BYTE_CAP = 500_000;
const PAGE_TEXT_CAP = 8_000;

async function fetchPageText(url: string): Promise<string> {
  const res = await safeFetch(url, {
    headers: {
      "User-Agent": "uk-bid-intelligence/1.0 (profile-fill)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const html = (await res.text()).slice(0, PAGE_BYTE_CAP);
  return stripHtmlToText(html).slice(0, PAGE_TEXT_CAP);
}

async function gatherWebsite(candidate: string | null): Promise<{
  url: string | null;
  fetched: boolean;
  textHash: string | null;
  text: string;
  notes: string[];
}> {
  if (!candidate || !candidate.trim()) {
    return { url: null, fetched: false, textHash: null, text: "", notes: [] };
  }
  const url = /^https?:\/\//i.test(candidate.trim())
    ? candidate.trim()
    : `https://${candidate.trim()}`;
  try {
    const home = await fetchPageText(url);
    let about = "";
    try {
      about = await fetchPageText(new URL("/about", url).href);
    } catch {
      // /about is a bonus page — missing it is normal.
    }
    const text = [home, about].filter(Boolean).join("\n\n").slice(0, 12_000);
    return {
      url,
      fetched: true,
      textHash: createHash("sha256").update(text).digest("hex"),
      text,
      notes: [],
    };
  } catch {
    return {
      url,
      fetched: false,
      textHash: null,
      text: "",
      notes: ["We couldn't read your website this time."],
    };
  }
}

async function gatherRegisters(
  profile: OrganisationProfileRow | null,
): Promise<{
  company: RegisterEnrichment | null;
  charity: RegisterEnrichment | null;
  notes: string[];
}> {
  const companyNumber = profile?.company_number ?? null;
  const charityNumber = profile?.charity_number ?? null;
  const [company, charity] = await Promise.all([
    companyNumber
      ? lookupCompany(companyNumber).catch(() => ({
          notes: ["Companies House lookup failed."],
        }))
      : Promise.resolve(null),
    charityNumber
      ? lookupCharity(charityNumber).catch(() => ({
          notes: ["Charity Commission lookup failed."],
        }))
      : Promise.resolve(null),
  ]);
  return {
    company,
    charity,
    notes: [...(company?.notes ?? []), ...(charity?.notes ?? [])],
  };
}

// ── Register-derived proposals (deterministic — no LLM) ───────────────────────

/**
 * Build exact proposals from register payloads. These bypass the LLM so
 * official values (addresses, SIC codes, dates) are never paraphrased; they
 * also win over any LLM proposal for the same field.
 */
export function registerProposals(
  registers: {
    company: RegisterEnrichment | null;
    charity: RegisterEnrichment | null;
  },
  targetFields: ReadonlySet<ProposableField>,
): ProfileProposal[] {
  const proposals: ProfileProposal[] = [];
  const { company, charity } = registers;

  const push = (
    field: ProposableField,
    value: unknown,
    display: string,
    evidence: string,
  ) => {
    if (!targetFields.has(field)) return;
    const section = PROPOSABLE_FIELDS[field].section;
    proposals.push({
      field,
      label: PROPOSABLE_FIELDS[field].label,
      section,
      sectionLabel: SECTION_LABELS.get(section) ?? section,
      value,
      display,
      confidence: "high",
      evidence,
      source: "public registers",
    });
  };

  if (company) {
    const ref = `Companies House record for ${company.name ?? company.company_number ?? "your company"}`;
    if (company.registered_address) {
      const parsed = AddressValueSchema.safeParse(company.registered_address);
      if (parsed.success) {
        push(
          "registered_address",
          parsed.data,
          displayAddress(parsed.data),
          ref,
        );
      }
    }
    if (company.sic_codes && company.sic_codes.length > 0) {
      push("sic_codes", company.sic_codes, company.sic_codes.join(", "), ref);
    }
    if (company.year_established != null) {
      push(
        "year_established",
        company.year_established,
        String(company.year_established),
        ref,
      );
    }
  }

  // A charity may also be a company — the charity register wins on legal form.
  const legalForm = charity?.legal_form ?? company?.legal_form;
  if (legalForm && LEGAL_FORM_VALUES.includes(legalForm)) {
    const ref = charity?.legal_form
      ? `Charity Register record for ${charity?.name ?? "your charity"}`
      : `Companies House record for ${company?.name ?? "your company"}`;
    push("legal_form", legalForm, legalForm, ref);
  }

  return proposals;
}

// ── The single structured LLM call ────────────────────────────────────────────

const LlmProposalSchema = z.object({
  field: z.enum(
    PROPOSABLE_FIELD_NAMES as [ProposableField, ...ProposableField[]],
  ),
  value: z
    .string()
    .describe(
      "the proposed value as text — comma-separated for list fields, strict JSON for structured fields",
    ),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z
    .string()
    .describe("a short direct quote, copied word-for-word from the sources"),
  source: z.enum(["your documents", "your website"]),
});

const LlmResponseSchema = z.object({
  proposals: z.array(LlmProposalSchema),
});

const LLM_FORMAT = zodResponseFormat(LlmResponseSchema, "profile_proposals");

/**
 * The grounding rules for the drafting call. Exported so tests can assert the
 * no-fabrication contract stays in the prompt verbatim.
 */
export function buildProfileFillSystemPrompt(): string {
  return `You draft business-profile fields for a UK supplier from the evidence provided.

Grounding rules — these are absolute:
- Only propose a value you can support with a direct quote from the sources below. Copy that quote word-for-word into the evidence field.
- Never invent, guess or pad a value. If the sources do not state it, leave that field out entirely.
- Never propose insurance amounts or policy numbers unless the exact figures are quoted word-for-word in the documents. Anything inferred rather than directly quoted must be marked confidence "low".
- Set source to "your documents" when the quote comes from the document excerpts, "your website" when it comes from the website text.

Confidence:
- "high": the source states the value outright.
- "medium": the source strongly implies it.
- "low": you are reading between the lines — the user must check it.

Value formats (the value is always a string):
- List fields: comma-separated.
- Structured fields: strict JSON matching the format hint for that field.
- Dates: YYYY-MM-DD. Numbers: digits only, no currency symbols.`;
}

export function buildProfileFillUserPrompt(input: {
  targetFields: ProposableField[];
  docChunks: RetrievedChunk[];
  websiteText: string;
  websiteUrl: string | null;
}): string {
  const fieldLines = input.targetFields
    .map(
      (f) =>
        `- ${f} (${PROPOSABLE_FIELDS[f].label}): ${PROPOSABLE_FIELDS[f].hint}`,
    )
    .join("\n");

  const docText = input.docChunks
    .map((c) => `[${c.document_title}]\n${c.content}`)
    .join("\n\n")
    .slice(0, 16_000);

  const clean = (s: string) =>
    s.replace(/\0/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ");

  return clean(
    [
      `Fill in only these currently-empty profile fields:\n${fieldLines}`,
      docText
        ? `## Excerpts from your documents\n${docText}`
        : "## Excerpts from your documents\n(none found)",
      input.websiteText
        ? `## Text from your website (${input.websiteUrl})\n${input.websiteText}`
        : "## Text from your website\n(not available)",
    ].join("\n\n"),
  );
}

// ── Grouping helper (shared with the ProfileAiFill card) ──────────────────────

export interface ProposalSectionGroup {
  id: ProfileSectionId;
  label: string;
  proposals: ProfileProposal[];
}

export function groupProposalsBySection(
  proposals: ProfileProposal[],
): ProposalSectionGroup[] {
  return PROPOSAL_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    proposals: proposals.filter((p) => p.section === section.id),
  })).filter((group) => group.proposals.length > 0);
}

// ── The engine ────────────────────────────────────────────────────────────────

export async function draftProfileProposals(input: {
  orgId: string;
  profile: OrganisationProfileRow | null;
  website?: string | null;
}): Promise<ProfileAiDraft> {
  const { orgId, profile } = input;
  const notes: string[] = [];

  const targetFields = new Set(emptyProfileFields(profile));
  if (targetFields.size === 0) {
    return {
      proposals: [],
      sources: {
        documents: { queries: [], chunkCount: 0, documentTitles: [] },
        website: { url: null, fetched: false, textHash: null },
        registers: { company: null, charity: null, notes: [] },
      },
      notes: ["Your profile already answers every field we can draft."],
    };
  }

  const websiteCandidate = input.website ?? profile?.website ?? null;
  const [docs, website, registers] = await Promise.all([
    gatherDocumentChunks(orgId),
    gatherWebsite(websiteCandidate),
    gatherRegisters(profile),
  ]);
  notes.push(...docs.notes, ...website.notes, ...registers.notes);

  // Register values are exact — collect them first so they win per-field.
  const fromRegisters = registerProposals(registers, targetFields);
  const taken = new Set(fromRegisters.map((p) => p.field));

  const llmTargets = [...targetFields].filter((f) => !taken.has(f));
  const proposals: ProfileProposal[] = [...fromRegisters];

  if (llmTargets.length > 0 && (docs.chunks.length > 0 || website.text)) {
    try {
      const completion = await openai.chat.completions.parse({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: buildProfileFillSystemPrompt() },
          {
            role: "user",
            content: buildProfileFillUserPrompt({
              targetFields: llmTargets,
              docChunks: docs.chunks,
              websiteText: website.text,
              websiteUrl: website.url,
            }),
          },
        ],
        response_format: LLM_FORMAT,
        temperature: 0,
      });

      const parsed = completion.choices[0]?.message?.parsed;
      for (const raw of parsed?.proposals ?? []) {
        if (taken.has(raw.field)) continue; // registers win; also dedupes
        if (!targetFields.has(raw.field)) continue; // only fill real gaps
        if (!raw.evidence.trim()) continue; // no quote, no proposal
        const coerced = coerceProposalValue(raw.field, raw.value);
        if (!coerced.ok) continue;
        taken.add(raw.field);
        const section = PROPOSABLE_FIELDS[raw.field].section;
        proposals.push({
          field: raw.field,
          label: PROPOSABLE_FIELDS[raw.field].label,
          section,
          sectionLabel: SECTION_LABELS.get(section) ?? section,
          value: coerced.value,
          display: coerced.display,
          confidence: raw.confidence,
          evidence: raw.evidence.trim(),
          source: raw.source,
        });
      }
    } catch {
      notes.push(
        "The AI drafting step failed — any register results below still stand. Try again in a minute.",
      );
    }
  } else if (llmTargets.length > 0) {
    notes.push(
      "Add documents to your evidence library or a website address to give the AI something to draft from.",
    );
  }

  // Stable order: profile-page section order, then catalogue order within it.
  const fieldOrder = new Map(PROPOSABLE_FIELD_NAMES.map((f, i) => [f, i]));
  const sectionOrder = new Map(PROPOSAL_SECTIONS.map((s, i) => [s.id, i]));
  proposals.sort(
    (a, b) =>
      sectionOrder.get(a.section)! - sectionOrder.get(b.section)! ||
      fieldOrder.get(a.field)! - fieldOrder.get(b.field)!,
  );

  return {
    proposals,
    sources: {
      documents: {
        queries: [...EVIDENCE_QUERIES],
        chunkCount: docs.chunks.length,
        documentTitles: [...new Set(docs.chunks.map((c) => c.document_title))],
      },
      website: {
        url: website.url,
        fetched: website.fetched,
        textHash: website.textHash,
      },
      registers,
    },
    notes,
  };
}
