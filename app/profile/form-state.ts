// Pure form-state logic for the organisation profile page — no React in here so
// every conversion is unit-testable:
//
//   rowToForm        — stored profile row (arrays/objects)  → flat form strings
//   formToPayload    — form strings → POST /api/profile body (the zod schema is
//                      the contract; names must match it exactly)
//   formToCompleteness — form → the row shape lib/setup-flow.ts scores
//   applyAiFields    — merge ProfileAiFill proposals (API-shaped values) into
//                      the form without touching anything the user already typed
//   applyRegisterEnrichment — merge a Companies House / Charity Commission
//                      lookup into the form
//   computeSectionTicks — per-page-section completeness, derived from the
//                      unified computeProfileSections so the numbers never
//                      disagree with the home checklist

import {
  INSURANCE_LINES,
  normaliseInsurance,
  type FrameworkEntry,
  type InsuranceCover,
  type InsuranceCoverDetail,
  type InsuranceLine,
  type KeyPerson,
  type PolicyEntry,
  type RegisteredAddress,
} from "@/lib/procurement/types";
import {
  computeProfileSections,
  type ProfileCompletenessFields,
} from "@/lib/setup-flow";
// Type-only: lib/research/registers.ts is a server module (env keys, fetch).
import type { RegisterEnrichment } from "@/lib/research/registers";

// ── Form shape ─────────────────────────────────────────────────────────────────

export interface InsuranceLineForm {
  amount: string;
  insurer: string;
  policy_number: string;
  expires_at: string; // YYYY-MM-DD
}

export type InsuranceFormState = Record<InsuranceLine, InsuranceLineForm>;

export interface KeyPersonForm {
  name: string;
  role: string;
  /** Not edited on the page, but kept so an AI-suggested bio survives a save. */
  bio: string;
}

export interface FrameworkForm {
  name: string;
  reference: string;
  expires_at: string; // YYYY-MM-DD
}

export interface PolicyForm {
  name: string;
  last_reviewed: string; // YYYY-MM-DD
  /** Evidence-library link, preserved across edits — the page never sets it. */
  document_id: string;
}

export interface ProfileForm {
  // Company basics
  name: string;
  organisation_type: string;
  // Registered details
  company_number: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_postcode: string;
  address_country: string;
  incorporation_date: string; // YYYY-MM-DD
  legal_form: string;
  sic_codes: string;
  trading_names: string;
  website: string;
  // Services and discovery
  sectors: string;
  services: string;
  keywords: string;
  cpv_codes: string;
  // Geography and contract value
  regions: string;
  min_contract_value: string;
  max_contract_value: string;
  // Capacity and people
  company_size_band: string;
  annual_turnover: string;
  year_established: string;
  employee_count: string;
  delivery_models: string;
  key_people: KeyPersonForm[];
  // Insurance
  insurance: InsuranceFormState;
  // Certifications and accreditations
  certifications: string;
  accreditations: string;
  social_value: string;
  // Policies and compliance
  policies: PolicyForm[];
  carbon_reduction_plan: string; // "" | "yes" | "no"
  // Frameworks and memberships
  frameworks: FrameworkForm[];
  memberships: string;
  // Grant eligibility
  charity_number: string;
  match_funding_capacity: string;
  beneficiaries: string;
  grant_themes: string;
  // Buyer preferences
  preferred_buyers: string;
  excluded_buyers: string;
  excluded_keywords: string;
}

function emptyInsuranceLine(): InsuranceLineForm {
  return { amount: "", insurer: "", policy_number: "", expires_at: "" };
}

export function emptyInsuranceForm(): InsuranceFormState {
  return {
    professional_indemnity: emptyInsuranceLine(),
    public_liability: emptyInsuranceLine(),
    employers_liability: emptyInsuranceLine(),
  };
}

export function emptyForm(): ProfileForm {
  return {
    name: "",
    organisation_type: "",
    company_number: "",
    vat_number: "",
    address_line1: "",
    address_line2: "",
    address_city: "",
    address_postcode: "",
    address_country: "",
    incorporation_date: "",
    legal_form: "",
    sic_codes: "",
    trading_names: "",
    website: "",
    sectors: "",
    services: "",
    keywords: "",
    cpv_codes: "",
    regions: "",
    min_contract_value: "",
    max_contract_value: "",
    company_size_band: "",
    annual_turnover: "",
    year_established: "",
    employee_count: "",
    delivery_models: "",
    key_people: [],
    insurance: emptyInsuranceForm(),
    certifications: "",
    accreditations: "",
    social_value: "",
    policies: [],
    carbon_reduction_plan: "",
    frameworks: [],
    memberships: "",
    charity_number: "",
    match_funding_capacity: "",
    beneficiaries: "",
    grant_themes: "",
    preferred_buyers: "",
    excluded_buyers: "",
    excluded_keywords: "",
  };
}

// ── Shared option lists ────────────────────────────────────────────────────────

export const COMPANY_SIZE_BANDS = [
  "Micro (0-9)",
  "Small (10-49)",
  "Medium (50-249)",
  "Large (250+)",
];

export const DELIVERY_MODELS = ["On-site", "Remote", "Hybrid", "Nationwide"];

export const UK_REGIONS = [
  "England",
  "North East England",
  "North West England",
  "Yorkshire and the Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East England",
  "South West England",
  "Scotland",
  "Wales",
  "Northern Ireland",
];

export const ORG_TYPES = [
  "SME",
  "Large enterprise",
  "Consultancy",
  "Technology supplier",
  "Software vendor",
  "Construction firm",
  "Facilities management",
  "Care provider",
  "Training provider",
  "Marketing / creative agency",
  "Cybersecurity firm",
  "Professional services",
  "Nonprofit / social enterprise",
  "Other",
];

export const INSURANCE_LINE_LABELS: Record<InsuranceLine, string> = {
  professional_indemnity: "Professional indemnity",
  public_liability: "Public liability",
  employers_liability: "Employers' liability",
};

/** The policies UK buyers ask about most — the page's policy checklist. */
export const STANDARD_POLICIES = [
  "Health and safety",
  "Environmental",
  "Equality, diversity and inclusion",
  "Modern slavery",
  "Data protection (GDPR)",
  "Quality",
];

// ── Small helpers ──────────────────────────────────────────────────────────────

export function splitTags(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinTags(v: unknown): string {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string").join(", ")
    : "";
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function numString(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** "" → null; otherwise a finite number or null (never NaN into the API). */
function parseNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(s: string): number | null {
  const n = parseNumber(s);
  return n == null ? null : Math.round(n);
}

// ── Stored row → form ──────────────────────────────────────────────────────────

export function rowToForm(row: Record<string, unknown> | null): ProfileForm {
  const form = emptyForm();
  if (!row) return form;

  form.name = asString(row.name);
  form.organisation_type = asString(row.organisation_type);
  form.company_number = asString(row.company_number);
  form.vat_number = asString(row.vat_number);

  if (isRecord(row.registered_address)) {
    const a = row.registered_address;
    form.address_line1 = asString(a.line1);
    form.address_line2 = asString(a.line2);
    form.address_city = asString(a.city);
    form.address_postcode = asString(a.postcode);
    form.address_country = asString(a.country);
  }

  form.incorporation_date = asString(row.incorporation_date);
  form.legal_form = asString(row.legal_form);
  form.sic_codes = joinTags(row.sic_codes);
  form.trading_names = joinTags(row.trading_names);
  form.website = asString(row.website);

  form.sectors = joinTags(row.sectors);
  form.services = joinTags(row.services);
  form.keywords = joinTags(row.keywords);
  form.cpv_codes = joinTags(row.cpv_codes);

  form.regions = joinTags(row.regions);
  form.min_contract_value = numString(row.min_contract_value);
  form.max_contract_value = numString(row.max_contract_value);

  form.company_size_band = asString(row.company_size_band);
  form.annual_turnover = numString(row.annual_turnover);
  form.year_established = numString(row.year_established);
  form.employee_count = numString(row.employee_count);
  form.delivery_models = joinTags(row.delivery_models);

  if (Array.isArray(row.key_people)) {
    form.key_people = row.key_people.filter(isRecord).map((p) => ({
      name: asString(p.name),
      role: asString(p.role),
      bio: asString(p.bio),
    }));
  }

  // Both stored insurance eras (pre-070 numbers, 070+ objects) read through
  // the one normaliser.
  const insurance = normaliseInsurance(row.insurance);
  if (insurance) {
    for (const line of INSURANCE_LINES) {
      const detail = insurance[line];
      if (!detail) continue;
      form.insurance[line] = {
        amount: detail.amount != null ? String(detail.amount) : "",
        insurer: detail.insurer ?? "",
        policy_number: detail.policy_number ?? "",
        expires_at: detail.expires_at ?? "",
      };
    }
  }

  form.certifications = joinTags(row.certifications);
  form.accreditations = joinTags(row.accreditations);
  form.social_value = joinTags(row.social_value);

  if (Array.isArray(row.policies)) {
    form.policies = row.policies
      .filter(isRecord)
      .map((p) => ({
        name: asString(p.name),
        last_reviewed: asString(p.last_reviewed),
        document_id: asString(p.document_id),
      }))
      .filter((p) => p.name);
  }
  form.carbon_reduction_plan =
    row.carbon_reduction_plan === true
      ? "yes"
      : row.carbon_reduction_plan === false
        ? "no"
        : "";

  if (Array.isArray(row.frameworks)) {
    form.frameworks = row.frameworks
      .filter(isRecord)
      .map((f) => ({
        name: asString(f.name),
        reference: asString(f.reference),
        expires_at: asString(f.expires_at),
      }))
      .filter((f) => f.name);
  }
  form.memberships = joinTags(row.memberships);

  form.charity_number = asString(row.charity_number);
  form.match_funding_capacity = numString(row.match_funding_capacity);
  form.beneficiaries = joinTags(row.beneficiaries);
  form.grant_themes = joinTags(row.grant_themes);

  form.preferred_buyers = joinTags(row.preferred_buyers);
  form.excluded_buyers = joinTags(row.excluded_buyers);
  form.excluded_keywords = joinTags(row.excluded_keywords);

  return form;
}

// ── Form → POST /api/profile payload ───────────────────────────────────────────

/** Mirrors the POST /api/profile zod schema. Optional keys are dropped by
 * JSON.stringify when undefined, matching what the schema expects. */
export interface ProfilePayload {
  name: string;
  organisation_type?: string;
  sectors: string[];
  services: string[];
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  certifications: string[];
  accreditations: string[];
  insurance: InsuranceCover | null;
  min_contract_value: number | null;
  max_contract_value: number | null;
  preferred_buyers: string[];
  excluded_buyers: string[];
  excluded_keywords: string[];
  company_size_band: string | null;
  annual_turnover: number | null;
  year_established: number | null;
  delivery_models: string[];
  social_value: string[];
  legal_form: string | null;
  is_registered_charity: boolean | null;
  charity_number: string | null;
  company_number: string | null;
  match_funding_capacity: number | null;
  beneficiaries: string[];
  grant_themes: string[];
  website: string | null;
  vat_number: string | null;
  registered_address: RegisteredAddress | null;
  incorporation_date: string | null;
  sic_codes: string[];
  trading_names: string[];
  employee_count: number | null;
  key_people: KeyPerson[];
  memberships: string[];
  frameworks: FrameworkEntry[];
  policies: PolicyEntry[];
  carbon_reduction_plan: boolean | null;
}

function insurancePayload(ins: InsuranceFormState): InsuranceCover | null {
  const out: InsuranceCover = {};
  let any = false;
  for (const line of INSURANCE_LINES) {
    const f = ins[line];
    const detail: InsuranceCoverDetail = { amount: parseNumber(f.amount) };
    if (f.insurer.trim()) detail.insurer = f.insurer.trim();
    if (f.policy_number.trim()) detail.policy_number = f.policy_number.trim();
    if (f.expires_at.trim()) detail.expires_at = f.expires_at.trim();
    if (
      detail.amount != null ||
      detail.insurer ||
      detail.policy_number ||
      detail.expires_at
    ) {
      out[line] = detail;
      any = true;
    }
  }
  return any ? out : null;
}

function addressPayload(form: ProfileForm): RegisteredAddress | null {
  const address: RegisteredAddress = {
    line1: form.address_line1.trim() || null,
    line2: form.address_line2.trim() || null,
    city: form.address_city.trim() || null,
    postcode: form.address_postcode.trim() || null,
    country: form.address_country.trim() || null,
  };
  const hasAnything = Object.values(address).some(Boolean);
  return hasAnything ? address : null;
}

export function formToPayload(form: ProfileForm): ProfilePayload {
  return {
    name: form.name.trim(),
    organisation_type: form.organisation_type || undefined,
    sectors: splitTags(form.sectors),
    services: splitTags(form.services),
    keywords: splitTags(form.keywords),
    cpv_codes: splitTags(form.cpv_codes),
    regions: splitTags(form.regions),
    certifications: splitTags(form.certifications),
    accreditations: splitTags(form.accreditations),
    insurance: insurancePayload(form.insurance),
    min_contract_value: parseNumber(form.min_contract_value),
    max_contract_value: parseNumber(form.max_contract_value),
    preferred_buyers: splitTags(form.preferred_buyers),
    excluded_buyers: splitTags(form.excluded_buyers),
    excluded_keywords: splitTags(form.excluded_keywords),
    company_size_band: form.company_size_band || null,
    annual_turnover: parseNumber(form.annual_turnover),
    year_established: parseInteger(form.year_established),
    delivery_models: splitTags(form.delivery_models),
    social_value: splitTags(form.social_value),
    legal_form: form.legal_form || null,
    // Unchanged behaviour: only inferred once a legal form is chosen.
    is_registered_charity: form.legal_form
      ? form.legal_form === "charity" || !!form.charity_number
      : null,
    charity_number: form.charity_number.trim() || null,
    company_number: form.company_number.trim() || null,
    match_funding_capacity: parseNumber(form.match_funding_capacity),
    beneficiaries: splitTags(form.beneficiaries),
    grant_themes: splitTags(form.grant_themes),
    website: form.website.trim() || null,
    vat_number: form.vat_number.trim() || null,
    registered_address: addressPayload(form),
    incorporation_date: form.incorporation_date.trim() || null,
    sic_codes: splitTags(form.sic_codes),
    trading_names: splitTags(form.trading_names),
    employee_count: parseInteger(form.employee_count),
    // Rows missing a name (or, for people, a role) can't pass the API schema —
    // they stay in the form for the user to finish, but don't save.
    key_people: form.key_people
      .map((p) => ({
        name: p.name.trim(),
        role: p.role.trim(),
        bio: p.bio.trim(),
      }))
      .filter((p) => p.name && p.role)
      .map((p) => (p.bio ? p : { name: p.name, role: p.role })),
    memberships: splitTags(form.memberships),
    frameworks: form.frameworks
      .map((f) => ({
        name: f.name.trim(),
        reference: f.reference.trim() || undefined,
        expires_at: f.expires_at.trim() || undefined,
      }))
      .filter((f) => f.name),
    policies: form.policies
      .map((p) => ({
        name: p.name.trim(),
        last_reviewed: p.last_reviewed.trim() || undefined,
        document_id: p.document_id.trim() || undefined,
      }))
      .filter((p) => p.name),
    carbon_reduction_plan:
      form.carbon_reduction_plan === "yes"
        ? true
        : form.carbon_reduction_plan === "no"
          ? false
          : null,
  };
}

/** The row shape lib/setup-flow.ts scores — derived from the same payload the
 * Save button sends, so the meter always reflects what would be stored. */
export function formToCompleteness(
  form: ProfileForm,
): ProfileCompletenessFields {
  return formToPayload(form);
}

// ── AI-fill proposals → form ───────────────────────────────────────────────────

const TAG_FIELDS = new Set([
  "sectors",
  "services",
  "keywords",
  "cpv_codes",
  "regions",
  "certifications",
  "accreditations",
  "delivery_models",
  "social_value",
  "sic_codes",
  "trading_names",
  "memberships",
  "beneficiaries",
  "grant_themes",
  "preferred_buyers",
  "excluded_buyers",
  "excluded_keywords",
]);

const TEXT_FIELDS = new Set([
  "name",
  "organisation_type",
  "company_number",
  "vat_number",
  "incorporation_date",
  "legal_form",
  "website",
  "company_size_band",
  "charity_number",
]);

const NUMBER_FIELDS = new Set([
  "min_contract_value",
  "max_contract_value",
  "annual_turnover",
  "year_established",
  "employee_count",
  "match_funding_capacity",
]);

/** Case-insensitive merge of name-keyed rows: existing rows win their slot,
 * proposed rows update blanks or append. Nothing the user typed is lost. */
function mergeByName<T extends { name: string }>(
  existing: T[],
  proposed: T[],
  merge: (current: T, incoming: T) => T,
): T[] {
  const out = [...existing];
  for (const row of proposed) {
    if (!row.name.trim()) continue;
    const i = out.findIndex(
      (r) => r.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
    );
    if (i === -1) out.push(row);
    else out[i] = merge(out[i], row);
  }
  return out;
}

/**
 * Merge the fields a ProfileAiFill "Apply" hands over (values shaped like the
 * POST /api/profile schema) into the form. Unknown keys are ignored; nothing
 * is saved — the user still presses Save profile.
 */
export function applyAiFields(
  form: ProfileForm,
  fields: Record<string, unknown>,
): ProfileForm {
  const next: ProfileForm = {
    ...form,
    insurance: { ...form.insurance },
    key_people: [...form.key_people],
    frameworks: [...form.frameworks],
    policies: [...form.policies],
  };

  for (const [field, value] of Object.entries(fields)) {
    if (TAG_FIELDS.has(field)) {
      const joined = Array.isArray(value) ? joinTags(value) : asString(value);
      if (joined)
        (next as Record<keyof ProfileForm, unknown>)[
          field as keyof ProfileForm
        ] = joined;
      continue;
    }
    if (TEXT_FIELDS.has(field)) {
      if (typeof value === "string" && value.trim()) {
        (next as Record<keyof ProfileForm, unknown>)[
          field as keyof ProfileForm
        ] = value.trim();
      }
      continue;
    }
    if (NUMBER_FIELDS.has(field)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        (next as Record<keyof ProfileForm, unknown>)[
          field as keyof ProfileForm
        ] = String(value);
      }
      continue;
    }

    switch (field) {
      case "registered_address": {
        if (isRecord(value)) {
          next.address_line1 = asString(value.line1) || next.address_line1;
          next.address_line2 = asString(value.line2) || next.address_line2;
          next.address_city = asString(value.city) || next.address_city;
          next.address_postcode =
            asString(value.postcode) || next.address_postcode;
          next.address_country =
            asString(value.country) || next.address_country;
        }
        break;
      }
      case "insurance": {
        // Only overwrite the lines the proposal actually covers.
        const normalised = normaliseInsurance(value);
        if (normalised) {
          for (const line of INSURANCE_LINES) {
            const detail = normalised[line];
            if (!detail) continue;
            next.insurance[line] = {
              amount: detail.amount != null ? String(detail.amount) : "",
              insurer: detail.insurer ?? "",
              policy_number: detail.policy_number ?? "",
              expires_at: detail.expires_at ?? "",
            };
          }
        }
        break;
      }
      case "key_people": {
        if (Array.isArray(value)) {
          const proposed = value.filter(isRecord).map((p) => ({
            name: asString(p.name),
            role: asString(p.role),
            bio: asString(p.bio),
          }));
          next.key_people = mergeByName(
            next.key_people,
            proposed,
            (current, incoming) => ({
              name: current.name,
              role: current.role || incoming.role,
              bio: current.bio || incoming.bio,
            }),
          );
        }
        break;
      }
      case "frameworks": {
        if (Array.isArray(value)) {
          const proposed = value.filter(isRecord).map((f) => ({
            name: asString(f.name),
            reference: asString(f.reference),
            expires_at: asString(f.expires_at),
          }));
          next.frameworks = mergeByName(
            next.frameworks,
            proposed,
            (current, incoming) => ({
              name: current.name,
              reference: current.reference || incoming.reference,
              expires_at: current.expires_at || incoming.expires_at,
            }),
          );
        }
        break;
      }
      case "policies": {
        if (Array.isArray(value)) {
          const proposed = value.filter(isRecord).map((p) => ({
            name: asString(p.name),
            last_reviewed: asString(p.last_reviewed),
            document_id: asString(p.document_id),
          }));
          next.policies = mergeByName(
            next.policies,
            proposed,
            (current, incoming) => ({
              name: current.name,
              last_reviewed: current.last_reviewed || incoming.last_reviewed,
              document_id: current.document_id || incoming.document_id,
            }),
          );
        }
        break;
      }
      case "carbon_reduction_plan": {
        if (typeof value === "boolean") {
          next.carbon_reduction_plan = value ? "yes" : "no";
        }
        break;
      }
      default:
        // Unknown field — ignore rather than guess.
        break;
    }
  }

  return next;
}

// ── Register lookup → form ─────────────────────────────────────────────────────

export function applyRegisterEnrichment(
  form: ProfileForm,
  e: RegisterEnrichment,
): ProfileForm {
  const next = { ...form };
  next.legal_form = e.legal_form ?? form.legal_form;
  next.year_established = e.year_established
    ? String(e.year_established)
    : form.year_established;
  next.charity_number = e.charity_number ?? form.charity_number;
  next.company_number = e.company_number ?? form.company_number;
  if (e.registered_address) {
    const a = e.registered_address;
    next.address_line1 = a.line1 ?? form.address_line1;
    next.address_line2 = a.line2 ?? form.address_line2;
    next.address_city = a.city ?? form.address_city;
    next.address_postcode = a.postcode ?? form.address_postcode;
    next.address_country = a.country ?? form.address_country;
  }
  if (e.sic_codes && e.sic_codes.length > 0) {
    next.sic_codes = e.sic_codes.join(", ");
  }
  return next;
}

// ── Per-page-section completeness ticks ────────────────────────────────────────
//
// The page's cards don't map 1:1 onto lib/setup-flow's sections (e.g. "what
// you do" fields are split between two cards), so each card claims the unified
// check labels its inputs cover. The fill state of every label still comes
// from computeProfileSections — one source of truth, regrouped for display.
// tests/profile-page-state.test.ts asserts this map covers every unified
// label exactly once, so a new check in lib/setup-flow.ts fails loudly here
// instead of silently missing a tick.

export type PageSectionId =
  | "basics"
  | "registered"
  | "services"
  | "geography"
  | "capacity"
  | "insurance"
  | "credentials"
  | "policies"
  | "frameworks"
  | "grants"
  | "buyers";

export const PAGE_SECTION_LABELS: Record<PageSectionId, string[]> = {
  basics: [],
  registered: [
    "Company number",
    "VAT number",
    "Registered address",
    "Incorporation date",
    "SIC codes",
    "Website",
    "Legal form",
  ],
  services: ["Services", "Sectors", "Keywords", "CPV codes"],
  geography: ["Regions you cover", "Contract value range"],
  capacity: [
    "Company size",
    "Number of employees",
    "Key people",
    "Annual turnover",
    "Delivery models",
  ],
  insurance: [
    "Professional indemnity cover",
    "Public liability cover",
    "Employers' liability cover",
    "Expiry dates for each policy",
  ],
  credentials: ["Certifications", "Accreditations"],
  policies: ["Policy documents", "Carbon reduction plan"],
  frameworks: ["Framework places", "Memberships"],
  grants: ["Grant themes"],
  buyers: [],
};

export interface SectionTick {
  filled: number;
  total: number;
  missing: string[];
  complete: boolean;
}

export function computeSectionTicks(
  fields: ProfileCompletenessFields,
): Record<PageSectionId, SectionTick> {
  const missingSet = new Set(
    computeProfileSections(fields).flatMap((s) => s.missing),
  );
  const out = {} as Record<PageSectionId, SectionTick>;
  for (const id of Object.keys(PAGE_SECTION_LABELS) as PageSectionId[]) {
    const labels = PAGE_SECTION_LABELS[id];
    const missing = labels.filter((label) => missingSet.has(label));
    out[id] = {
      filled: labels.length - missing.length,
      total: labels.length,
      missing,
      complete: labels.length > 0 && missing.length === 0,
    };
  }
  return out;
}
